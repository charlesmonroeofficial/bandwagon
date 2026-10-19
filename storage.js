import { AsyncLocalStorage } from "node:async_hooks";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
const migrationsPath = fileURLToPath(new URL("./migrations/", import.meta.url));

// PostgreSQL uses $1 parameters. Preserve question marks inside SQL string literals.
export function postgresSQL(sql) {
  let index = 0,
    quoted = false,
    result = "";
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === "'") {
      if (quoted && sql[i + 1] === "'") {
        result += "''";
        i++;
        continue;
      }
      quoted = !quoted;
    }
    result += sql[i] === "?" && !quoted ? "$" + ++index : sql[i];
  }
  return result;
}

export function createStore({ databaseUrl, dbPath }) {
  const context = new AsyncLocalStorage();
  const postgres = Boolean(databaseUrl);
  let db,
    pool,
    tail = Promise.resolve();
  if (postgres) {
    pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 5,
      connectionTimeoutMillis: 15000,
      idleTimeoutMillis: 30000,
    });
    // Pool errors contain connection details; report a bounded message without credentials.
    pool.on("error", () =>
      console.error("An idle PostgreSQL connection was lost."),
    );
  } else {
    if (dbPath !== ":memory:")
      mkdirSync(path.dirname(dbPath), { recursive: true });
    db = new DatabaseSync(dbPath);
    db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
  }
  async function query(sql, values = []) {
    if (postgres)
      return (context.getStore() || pool).query(postgresSQL(sql), values);
    const statement = db.prepare(sql);
    return statement.columns().length
      ? { rows: statement.all(...values) }
      : { rows: [], ...statement.run(...values) };
  }
  const run = async (sql, ...values) => query(sql, values);
  const get = async (sql, ...values) => (await query(sql, values)).rows[0];
  const all = async (sql, ...values) => (await query(sql, values)).rows;

  async function transaction(fn) {
    if (postgres) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Serialize state-changing decisions across instances, preserving vote caps
        // and unanimous approval when members submit at the same time.
        await client.query("SELECT pg_advisory_xact_lock(420701)");
        const value = await context.run(client, fn);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    }
    // Awaiting database operations must not allow overlapping SQLite transactions.
    const previous = tail;
    let release;
    tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = await fn();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      release();
    }
  }

  const ready = transaction(async () => {
    await run(
      "CREATE TABLE IF NOT EXISTS app_migrations (version INTEGER PRIMARY KEY)",
    );
    for (const file of readdirSync(migrationsPath)
      .filter((f) => /^\d+_.+\.sql$/.test(f))
      .sort()) {
      const version = Number(file.split("_")[0]);
      if (
        await get("SELECT version FROM app_migrations WHERE version=?", version)
      )
        continue;
      const sql = readFileSync(path.join(migrationsPath, file), "utf8");
      for (const statement of sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean))
        await run(statement);
      await run("INSERT INTO app_migrations(version) VALUES(?)", version);
    }
  });
  return {
    db,
    postgres,
    run,
    get,
    all,
    transaction,
    ready,
    close: async () => {
      await ready.catch(() => {});
      if (pool) await pool.end();
      else db.close();
    },
  };
}
