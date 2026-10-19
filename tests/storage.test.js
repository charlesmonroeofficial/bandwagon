import test from "node:test";
import assert from "node:assert/strict";
import { createStore, postgresSQL } from "../storage.js";

test("SQL parameters preserve quoted literals", () => {
  assert.equal(
    postgresSQL(
      "SELECT '?' AS literal, ? AS value, 'it''s ?' AS text, ? AS other",
    ),
    "SELECT '?' AS literal, $1 AS value, 'it''s ?' AS text, $2 AS other",
  );
});

test("migrations are repeatable; transactions roll back on failure", async (t) => {
  const store = createStore({
    databaseUrl: process.env.TEST_DATABASE_URL,
    dbPath: ":memory:",
  });
  await store.ready;
  t.after(() => store.close());
  const id = crypto.randomUUID();
  await assert.rejects(
    store.transaction(async () => {
      await store.run("INSERT INTO users(id,name) VALUES(?,?)", id, "Rollback");
      throw new Error("cancel");
    }),
    /cancel/,
  );
  assert.equal(
    await store.get("SELECT id FROM users WHERE id=?", id),
    undefined,
  );
  const versions = await store.all("SELECT version FROM app_migrations");
  assert.deepEqual(
    versions.map((v) => v.version),
    [1],
  );
  const other = createStore({
    databaseUrl: process.env.TEST_DATABASE_URL,
    dbPath: ":memory:",
  });
  await other.ready;
  await other.close();
});
