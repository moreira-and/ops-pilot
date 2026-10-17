import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase, DatabaseConfigurationError } from "./database.js";

test("rejects missing database settings without opening a connection", () => {
  assert.throws(
    () => createDatabase({}),
    (error: unknown) =>
      error instanceof DatabaseConfigurationError &&
      /DB_HOST/.test(error.message),
  );
});

test("creates an unconnected MySQL Sequelize instance from explicit settings", async () => {
  const database = createDatabase({
    DB_HOST: "localhost",
    DB_PORT: "3307",
    DB_NAME: "ops_pilot_test",
    DB_USER: "test-user",
    DB_PASSWORD: "test-password",
  });
  assert.equal(database.getDialect(), "mysql");
  assert.equal(database.config.port, 3307);
  await database.close();
});
