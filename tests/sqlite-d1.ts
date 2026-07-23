import { DatabaseSync, type StatementSync } from "node:sqlite";
import { readFileSync } from "node:fs";

class SQLiteD1Statement {
  private parameters: unknown[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: unknown[]): SQLiteD1Statement {
    this.parameters = values;
    return this;
  }

  executeRun(): D1Result {
    const result = this.statement.run(...this.parameters as any[]);
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
      results: [],
    } as unknown as D1Result;
  }

  async run<T = unknown>(): Promise<D1Result<T>> {
    return this.executeRun() as D1Result<T>;
  }

  async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
    const results = this.statement.all(...this.parameters as any[]) as T[];
    return { success: true, meta: {}, results } as D1Result<T>;
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const row = this.statement.get(...this.parameters as any[]) as Record<string, unknown> | undefined;
    if (!row) return null;
    return (column ? row[column] : row) as T;
  }

  async raw<T = unknown[]>(): Promise<T[]> {
    throw new Error("raw() is not implemented by the test adapter");
  }
}

export class SQLiteD1 {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec(readFileSync("db/schema.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-5e-publication.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-stabilisation-security.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0015-editorial-desk.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0016-knowledge-builder-foundation.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0017-multilingual-source-provenance.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0032-knowledge-continuity.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0033-knowledge-reconciliation-state.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0034-structured-source-extraction.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0035-extraction-run-metadata.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0036-extraction-review-history.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0037-claim-match-candidates.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0038-claim-match-review.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0039-claim-provenance-proposals.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0040-provenance-group-proposals.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0041-claim-relationship-proposals.sql", "utf8"));
    this.sqlite.exec(readFileSync("db/migration-0042-claim-conflict-cases.sql", "utf8"));
  }

  prepare(query: string): SQLiteD1Statement {
    return new SQLiteD1Statement(this.sqlite.prepare(query));
  }

  async batch<T = unknown>(statements: SQLiteD1Statement[]): Promise<D1Result<T>[]> {
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.executeRun() as D1Result<T>);
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  async exec(query: string): Promise<D1ExecResult> {
    this.sqlite.exec(query);
    return { count: 0, duration: 0 };
  }

  asD1(): D1Database {
    return this as unknown as D1Database;
  }

  close(): void {
    this.sqlite.close();
  }
}
