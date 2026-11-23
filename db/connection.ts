import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { getConnectionString } from "@netlify/database";
import { Pool, types as pgTypes } from "pg";
const require = createRequire(path.join(process.cwd(), "package.json"));

type Queryable = Pick<Pool, "query">;
type BoundStatement = {
  sql: string;
  values: unknown[];
  run(queryable?: Queryable): Promise<{ meta: { changes: number } }>;
};

pgTypes.setTypeParser(20, (value) => Number(value));

function toPostgres(sql: string) {
  let index = 0;
  const ignoreConflicts = /\bINSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
  const result = sql
    .replace(/\bINSERT\s+OR\s+IGNORE\s+INTO\b/gi, "INSERT INTO")
    .replace(/\s+COLLATE\s+NOCASE\b/gi, "")
    .replace(/\?/g, () => `$${++index}`);
  return ignoreConflicts ? `${result} ON CONFLICT DO NOTHING` : result;
}

function createPool(): Pool {
  if (process.env.SURVIVOR_TEST === "true") {
    // Keep the smoke suite independent of a paid or remote database.
    const { newDb } = require("pg-mem") as typeof import("pg-mem");
    const memoryDb = newDb({ autoCreateForeignKeyIndices: true });
    for (const migrationFile of ["0001_create_game.sql", "0002_draw_method.sql"]) {
      const migration = readFileSync(path.join(process.cwd(), "netlify/database/migrations", migrationFile), "utf8");
      memoryDb.public.none(migration);
    }
    const { Pool: MemoryPool } = memoryDb.adapters.createPg();
    return new MemoryPool() as unknown as Pool;
  }
  const connectionString = process.env.DATABASE_URL || getConnectionString();
  if (!connectionString) throw new Error("The Netlify Postgres database is not connected yet.");
  return new Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
}

let pool: Pool | undefined;
function getPool() {
  if (!pool) pool = createPool();
  return pool;
}

class PreparedStatement implements BoundStatement {
  readonly sql: string;
  values: unknown[] = [];
  constructor(sql: string) { this.sql = toPostgres(sql); }
  bind(...values: unknown[]) { this.values = values; return this; }
  async run(queryable: Queryable = getPool()) {
    const result = await queryable.query(this.sql, this.values);
    return { meta: { changes: result.rowCount ?? 0 } };
  }
  async all<T = Record<string, unknown>>() {
    const result = await getPool().query(this.sql, this.values);
    return { results: result.rows as T[] };
  }
  async first<T = Record<string, unknown>>() {
    const result = await getPool().query(this.sql, this.values);
    return (result.rows[0] as T | undefined) ?? null;
  }
}

export class GameDatabase {
  prepare(sql: string) { return new PreparedStatement(sql); }
  async batch(statements: BoundStatement[]) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      for (const statement of statements) await statement.run(client);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}

export function database() {
  return new GameDatabase();
}

export function databaseConfigured() {
  if (process.env.SURVIVOR_TEST === "true") return true;
  try { return Boolean(process.env.DATABASE_URL || process.env.NETLIFY_DATABASE_URL || getConnectionString()); }
  catch { return false; }
}
