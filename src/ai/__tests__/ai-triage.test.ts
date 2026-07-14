import assert from "node:assert/strict";
import { handleTriageRequest } from "../../pages/api/admin/ai-triage";
import { getUsageByTaskType } from "../usage-ledger";

const ADMIN_TOKEN = "test-admin-token";
const API_KEY = "test-deepseek-key";
const originalFetch = globalThis.fetch;

function request(token: string = ADMIN_TOKEN): Request {
  return new Request("https://thetracemanifest.com/api/admin/ai-triage", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sources: [{
        title: "Example model release",
        excerpt: "The vendor announced a new model with a documented API release.",
      }],
    }),
  });
}

try {
  const unauthorized = await handleTriageRequest(request("wrong-token"), {
    ADMIN_API_TOKEN: ADMIN_TOKEN,
    DEEPSEEK_API_KEY: API_KEY,
  });
  assert.equal(unauthorized.status, 401, "rejects an invalid admin token");

  const unconfigured = await handleTriageRequest(request(), {
    ADMIN_API_TOKEN: ADMIN_TOKEN,
  });
  assert.equal(unconfigured.status, 503, "fails closed when the provider secret is absent");

  globalThis.fetch = async () => {
    throw new DOMException("The operation timed out", "TimeoutError");
  };
  const timedOut = await handleTriageRequest(request(), {
    ADMIN_API_TOKEN: ADMIN_TOKEN,
    DEEPSEEK_API_KEY: API_KEY,
  });
  const timeoutBody = await timedOut.json() as { error?: string; requestId?: string };
  assert.equal(timedOut.status, 503, "maps provider timeouts to temporary unavailability");
  assert.equal(timeoutBody.error, "DeepSeek did not respond before the request timeout.");
  assert.match(timeoutBody.requestId ?? "", /^editorial_[0-9a-f-]+$/);

  let providerCalls = 0;
  globalThis.fetch = async (_input, init) => {
    providerCalls++;
    const providerRequest = JSON.parse(String(init?.body)) as {
      model?: string;
      thinking?: { type?: string };
    };
    assert.equal(providerRequest.model, "deepseek-v4-flash", "uses the gateway's routine model route");
    assert.equal(providerRequest.thinking?.type, "disabled", "disables V4 thinking for bounded JSON triage");

    return Response.json({
      choices: [{
        message: {
          content: JSON.stringify({
            headline: "Example model released",
            summary: "A vendor released a new model and documented its API availability.",
            analysis: "The release may matter to teams evaluating model deployment options.",
            why_it_matters: "Teams have another documented model option to evaluate.",
            is_newsworthy: true,
            key_points: ["A model was released", "API documentation is available"],
            cited_source_ids: ["source-1"],
            caveats: ["Only the vendor source was supplied"],
            proposed_confidence: "medium",
          }),
        },
      }],
    });
  };

  const response = await handleTriageRequest(request(), {
    ADMIN_API_TOKEN: ADMIN_TOKEN,
    DEEPSEEK_API_KEY: API_KEY,
  });
  const body = await response.json() as { headline?: string; requestId?: string };

  assert.equal(response.status, 200, "returns a successful triage response");
  assert.equal(body.headline, "Example model released");
  assert.match(body.requestId ?? "", /^editorial_[0-9a-f-]+$/);
  assert.equal(providerCalls, 1, "makes exactly one provider call");

  const usage = getUsageByTaskType("editorial");
  assert.equal(usage.length, 1, "records editorial usage through the gateway ledger");
  assert.equal(usage[0].model, "deepseek-v4-flash");
  assert.ok(usage[0].budgetReservation > 0, "records the gateway budget reservation");

  console.log("AI triage gateway tests passed.");
} finally {
  globalThis.fetch = originalFetch;
}
