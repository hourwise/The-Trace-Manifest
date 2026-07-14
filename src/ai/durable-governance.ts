export interface DurableAIConfig {
  dailyBudgetMicrousd: number;
  monthlyBudgetMicrousd: number;
  taskDailyBudgetMicrousd: number;
  maxRequestMicrousd: number;
  dailyQuestionsPerVisitor: number;
}

export interface BeginRequestInput {
  requestId: string;
  idempotencyKeyHash: string;
  visitorHash: string | null;
  questionHash: string | null;
  taskType: "ask_trace" | "editorial";
  evidenceIds: string[];
}

export type BeginRequestResult =
  | { status: "owned" }
  | { status: "duplicate_completed"; response: unknown }
  | { status: "duplicate_terminal"; state: string; message: string }
  | { status: "duplicate_in_progress"; requestId: string };

export interface ProviderUsageSettlement {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  actualMicrousd: number | null;
  costBasis: "provider_usage" | "estimated" | "unknown";
  billingUncertain: boolean;
  latencyMs: number;
  providerStatus: number | null;
  validationStatus: string;
}

interface ExistingRequest {
  request_id: string;
  state: string;
  response_json: string | null;
  public_error: string | null;
}

function changes(result: D1Result): number {
  return Number(result.meta?.changes ?? 0);
}

export class DurableAIGovernance {
  constructor(private readonly db: D1Database) {}

  async begin(input: BeginRequestInput): Promise<BeginRequestResult> {
    await this.db.prepare(`
      UPDATE ai_requests
      SET response_json = NULL, visitor_hash = NULL, question_hash = NULL,
          evidence_ids_json = '[]', updated_at = datetime('now')
      WHERE retention_expires_at <= datetime('now')
        AND (
          response_json IS NOT NULL OR visitor_hash IS NOT NULL OR question_hash IS NOT NULL
          OR evidence_ids_json <> '[]'
        )
    `).run();

    const inserted = await this.db.prepare(`
      INSERT OR IGNORE INTO ai_requests
        (request_id, idempotency_key_hash, visitor_hash, question_hash, task_type, state, evidence_ids_json)
      VALUES (?, ?, ?, ?, ?, 'received', ?)
    `).bind(
      input.requestId,
      input.idempotencyKeyHash,
      input.visitorHash,
      input.questionHash,
      input.taskType,
      JSON.stringify(input.evidenceIds),
    ).run();

    if (changes(inserted) === 1) return { status: "owned" };
    const existing = await this.db.prepare(`
      SELECT request_id, state, response_json, public_error
      FROM ai_requests WHERE idempotency_key_hash = ?
    `).bind(input.idempotencyKeyHash).first<ExistingRequest>();
    if (!existing) throw new Error("Idempotency state is unavailable.");

    if (existing.state === "completed" && existing.response_json) {
      try {
        return { status: "duplicate_completed", response: JSON.parse(existing.response_json) };
      } catch {
        return { status: "duplicate_terminal", state: "failed", message: "Stored result is unavailable." };
      }
    }
    if (["failed", "rejected", "circuit_open"].includes(existing.state)) {
      return {
        status: "duplicate_terminal",
        state: existing.state,
        message: existing.public_error ?? "The original request did not complete.",
      };
    }
    return { status: "duplicate_in_progress", requestId: existing.request_id };
  }

  async consumeQuota(
    requestId: string,
    visitorHash: string,
    dayKey: string,
    limit: number,
  ): Promise<"accepted" | "concurrency_limit" | "daily_limit"> {
    await this.db.prepare("DELETE FROM ai_concurrency_leases WHERE expires_at <= datetime('now')").run();
    const lease = await this.db.prepare(`
      INSERT OR IGNORE INTO ai_concurrency_leases (visitor_hash, request_id, expires_at)
      VALUES (?, ?, datetime('now', '+1 minute'))
    `).bind(visitorHash, requestId).run();
    if (changes(lease) !== 1) {
      await this.reject(requestId, "Another question is already processing for this visitor.");
      return "concurrency_limit";
    }
    const quota = await this.db.prepare(`
      INSERT INTO ai_quota_usage (visitor_hash, day_key, request_count)
      VALUES (?, ?, 1)
      ON CONFLICT(visitor_hash, day_key) DO UPDATE SET
        request_count = ai_quota_usage.request_count + 1,
        updated_at = datetime('now')
      WHERE ai_quota_usage.request_count < ?
    `).bind(visitorHash, dayKey, limit).run();
    if (changes(quota) === 1) return "accepted";
    await this.releaseConcurrency(requestId);
    await this.reject(requestId, "Daily question limit reached.");
    return "daily_limit";
  }

  async validate(requestId: string): Promise<void> {
    await this.transition(requestId, "received", "validated");
  }

  async completeWithoutModel(requestId: string, response: unknown): Promise<void> {
    const [result] = await this.db.batch([
      this.db.prepare(`
        UPDATE ai_requests
        SET state = 'completed', response_json = ?, completed_at = datetime('now'), updated_at = datetime('now')
        WHERE request_id = ? AND state IN ('received','validated','retrieving') AND attempt_count = 0
      `).bind(JSON.stringify(response), requestId),
      this.db.prepare("DELETE FROM ai_concurrency_leases WHERE request_id = ?").bind(requestId),
    ]);
    if (changes(result) !== 1) throw new Error("Invalid no-model completion transition.");
  }

  async reserve(
    requestId: string,
    taskType: "ask_trace" | "editorial",
    estimatedMicrousd: number,
    config: DurableAIConfig,
    now = new Date(),
  ): Promise<{ reservationId: string; reservedMicrousd: number } | null> {
    if (estimatedMicrousd <= 0 || estimatedMicrousd > config.maxRequestMicrousd) return null;
    await this.db.prepare(`
      UPDATE ai_budget_reservations
      SET state = 'expired', settled_at = datetime('now')
      WHERE state = 'reserved' AND expires_at <= datetime('now')
    `).run();

    const dayKey = now.toISOString().slice(0, 10);
    const monthKey = dayKey.slice(0, 7);
    const reservationId = `res_${crypto.randomUUID()}`;
    const expiresAt = new Date(now.getTime() + 2 * 60_000).toISOString();
    const reserved = await this.db.prepare(`
      INSERT INTO ai_budget_reservations
        (reservation_id, request_id, task_type, day_key, month_key, reserved_microusd, state, expires_at)
      SELECT ?, ?, ?, ?, ?, ?, 'reserved', ?
      WHERE
        COALESCE((SELECT SUM(CASE WHEN state = 'settled' THEN actual_microusd ELSE reserved_microusd END)
          FROM ai_budget_reservations
          WHERE day_key = ? AND (state = 'settled' OR (state = 'reserved' AND expires_at > datetime('now')))), 0) + ? <= ?
        AND COALESCE((SELECT SUM(CASE WHEN state = 'settled' THEN actual_microusd ELSE reserved_microusd END)
          FROM ai_budget_reservations
          WHERE month_key = ? AND (state = 'settled' OR (state = 'reserved' AND expires_at > datetime('now')))), 0) + ? <= ?
        AND COALESCE((SELECT SUM(CASE WHEN state = 'settled' THEN actual_microusd ELSE reserved_microusd END)
          FROM ai_budget_reservations
          WHERE task_type = ? AND day_key = ?
            AND (state = 'settled' OR (state = 'reserved' AND expires_at > datetime('now')))), 0) + ? <= ?
    `).bind(
      reservationId, requestId, taskType, dayKey, monthKey, estimatedMicrousd, expiresAt,
      dayKey, estimatedMicrousd, config.dailyBudgetMicrousd,
      monthKey, estimatedMicrousd, config.monthlyBudgetMicrousd,
      taskType, dayKey, estimatedMicrousd, config.taskDailyBudgetMicrousd,
    ).run();
    if (changes(reserved) !== 1) return null;

    try {
      await this.transition(requestId, "validated", "budget_reserved");
    } catch (error) {
      await this.db.prepare(`UPDATE ai_budget_reservations SET state = 'released', settled_at = datetime('now') WHERE reservation_id = ?`).bind(reservationId).run();
      throw error;
    }
    return { reservationId, reservedMicrousd: estimatedMicrousd };
  }

  async startProvider(requestId: string, provider: string, model: string): Promise<boolean> {
    const result = await this.db.prepare(`
      UPDATE ai_requests
      SET state = 'model_in_progress', attempt_count = 1, provider = ?, model = ?, updated_at = datetime('now')
      WHERE request_id = ? AND state = 'budget_reserved' AND attempt_count = 0
    `).bind(provider, model, requestId).run();
    return changes(result) === 1;
  }

  async settleSuccess(
    requestId: string,
    reservationId: string,
    provider: string,
    model: string,
    estimatedMicrousd: number,
    settlement: ProviderUsageSettlement,
    response: unknown,
  ): Promise<void> {
    const actual = settlement.actualMicrousd ?? estimatedMicrousd;
    await this.db.batch([
      this.db.prepare(`
        INSERT INTO ai_usage_ledger
          (request_id, task_type, provider, model, input_tokens, output_tokens, cached_tokens,
           estimated_microusd, actual_microusd, cost_basis, billing_uncertain, latency_ms,
           provider_status, validation_status, correlation_id)
        SELECT request_id, task_type, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, request_id
        FROM ai_requests WHERE request_id = ?
      `).bind(
        provider, model, settlement.inputTokens, settlement.outputTokens, settlement.cachedTokens,
        estimatedMicrousd, actual, settlement.costBasis, settlement.billingUncertain ? 1 : 0,
        settlement.latencyMs, settlement.providerStatus, settlement.validationStatus, requestId,
      ),
      this.db.prepare(`
        UPDATE ai_budget_reservations
        SET state = 'settled', actual_microusd = ?, billing_uncertain = ?, settled_at = datetime('now')
        WHERE reservation_id = ? AND request_id = ? AND state = 'reserved'
      `).bind(actual, settlement.billingUncertain ? 1 : 0, reservationId, requestId),
      this.db.prepare(`
        UPDATE ai_requests
        SET state = 'completed', response_json = ?, completed_at = datetime('now'), updated_at = datetime('now')
        WHERE request_id = ? AND state = 'model_in_progress' AND attempt_count = 1
      `).bind(JSON.stringify(response), requestId),
      this.db.prepare("DELETE FROM ai_concurrency_leases WHERE request_id = ?").bind(requestId),
    ]);
  }

  async settleFailure(
    requestId: string,
    reservationId: string,
    provider: string,
    model: string,
    estimatedMicrousd: number,
    settlement: ProviderUsageSettlement,
    publicError: string,
  ): Promise<void> {
    const actual = settlement.billingUncertain ? estimatedMicrousd : (settlement.actualMicrousd ?? 0);
    const reservationState = actual > 0 ? "settled" : "released";
    await this.db.batch([
      this.db.prepare(`
        INSERT OR IGNORE INTO ai_usage_ledger
          (request_id, task_type, provider, model, input_tokens, output_tokens, cached_tokens,
           estimated_microusd, actual_microusd, cost_basis, billing_uncertain, latency_ms,
           provider_status, validation_status, correlation_id)
        SELECT request_id, task_type, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, request_id
        FROM ai_requests WHERE request_id = ?
      `).bind(
        provider, model, settlement.inputTokens, settlement.outputTokens, settlement.cachedTokens,
        estimatedMicrousd, actual, settlement.costBasis, settlement.billingUncertain ? 1 : 0,
        settlement.latencyMs, settlement.providerStatus, settlement.validationStatus, requestId,
      ),
      this.db.prepare(`
        UPDATE ai_budget_reservations
        SET state = ?, actual_microusd = ?, billing_uncertain = ?, settled_at = datetime('now')
        WHERE reservation_id = ? AND request_id = ? AND state = 'reserved'
      `).bind(reservationState, actual, settlement.billingUncertain ? 1 : 0, reservationId, requestId),
      this.db.prepare(`
        UPDATE ai_requests SET state = 'failed', public_error = ?, completed_at = datetime('now'), updated_at = datetime('now')
        WHERE request_id = ? AND state = 'model_in_progress'
      `).bind(publicError, requestId),
      this.db.prepare("DELETE FROM ai_concurrency_leases WHERE request_id = ?").bind(requestId),
    ]);
  }

  async anyCircuitOpen(ids: string[]): Promise<boolean> {
    if (ids.length === 0) return false;
    const placeholders = ids.map(() => "?").join(",");
    const row = await this.db.prepare(`
      SELECT breaker_id FROM ai_circuit_breakers
      WHERE breaker_id IN (${placeholders}) AND state = 'open'
        AND (open_until IS NULL OR open_until > datetime('now'))
      LIMIT 1
    `).bind(...ids).first();
    return Boolean(row);
  }

  async recordCircuitFailure(id: string, reasonCode: string, threshold: number, openSeconds: number | null): Promise<void> {
    const initiallyOpen = threshold <= 1;
    await this.db.prepare(`
      INSERT INTO ai_circuit_breakers
        (breaker_id, state, failure_count, reason_code, opened_at, open_until)
      VALUES (?, ?, 1, ?, CASE WHEN ? THEN datetime('now') END,
        CASE WHEN ? IS NULL OR NOT ? THEN NULL ELSE datetime('now', '+' || ? || ' seconds') END)
      ON CONFLICT(breaker_id) DO UPDATE SET
        failure_count = ai_circuit_breakers.failure_count + 1,
        reason_code = excluded.reason_code,
        state = CASE WHEN ai_circuit_breakers.failure_count + 1 >= ? THEN 'open' ELSE ai_circuit_breakers.state END,
        opened_at = CASE WHEN ai_circuit_breakers.failure_count + 1 >= ? THEN datetime('now') ELSE ai_circuit_breakers.opened_at END,
        open_until = CASE
          WHEN ai_circuit_breakers.failure_count + 1 < ? THEN ai_circuit_breakers.open_until
          WHEN ? IS NULL THEN NULL ELSE datetime('now', '+' || ? || ' seconds') END,
        updated_at = datetime('now')
    `).bind(
      id, initiallyOpen ? "open" : "closed", reasonCode, initiallyOpen ? 1 : 0,
      openSeconds, initiallyOpen ? 1 : 0, openSeconds,
      threshold, threshold, threshold, openSeconds, openSeconds,
    ).run();
  }

  async recordCircuitSuccess(id: string): Promise<void> {
    await this.db.prepare(`
      INSERT INTO ai_circuit_breakers (breaker_id, state, failure_count)
      VALUES (?, 'closed', 0)
      ON CONFLICT(breaker_id) DO UPDATE SET state = 'closed', failure_count = 0,
        reason_code = NULL, opened_at = NULL, open_until = NULL, updated_at = datetime('now')
    `).bind(id).run();
  }

  async reject(requestId: string, publicError: string, state: "rejected" | "circuit_open" = "rejected"): Promise<void> {
    await this.db.batch([
      this.db.prepare(`
        UPDATE ai_requests SET state = ?, public_error = ?, completed_at = datetime('now'), updated_at = datetime('now')
        WHERE request_id = ? AND state IN ('received','validated')
      `).bind(state, publicError, requestId),
      this.db.prepare("DELETE FROM ai_concurrency_leases WHERE request_id = ?").bind(requestId),
    ]);
  }

  private async releaseConcurrency(requestId: string): Promise<void> {
    await this.db.prepare("DELETE FROM ai_concurrency_leases WHERE request_id = ?").bind(requestId).run();
  }

  private async transition(requestId: string, from: string, to: string): Promise<void> {
    const result = await this.db.prepare(`
      UPDATE ai_requests SET state = ?, updated_at = datetime('now') WHERE request_id = ? AND state = ?
    `).bind(to, requestId, from).run();
    if (changes(result) !== 1) throw new Error(`Invalid AI request transition: ${from} -> ${to}.`);
  }
}
