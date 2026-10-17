import { Sequelize } from "sequelize";

export class DatabaseConfigurationError extends Error {
  constructor(setting: string) {
    super(`Missing required database setting: ${setting}`);
    this.name = "DatabaseConfigurationError";
  }
}

export function createDatabase(
  env: NodeJS.ProcessEnv = process.env,
): Sequelize {
  const required = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"] as const;
  for (const key of required) {
    if (!env[key]) {
      throw new DatabaseConfigurationError(key);
    }
  }

  const rawPort = env.DB_PORT ?? "3306";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Invalid database setting: DB_PORT must be a port from 1 to 65535.");
  }

  return new Sequelize(env.DB_NAME!, env.DB_USER!, env.DB_PASSWORD!, {
    host: env.DB_HOST,
    port,
    dialect: "mysql",
    logging: false,
    pool: { max: 5, min: 0, acquire: 30_000, idle: 10_000 },
  });
}

let database: Sequelize | undefined;

export function getDatabase(): Sequelize {
  database ??= createDatabase();
  return database;
}

export async function closeDatabase(): Promise<void> {
  if (database) {
    const current = database;
    database = undefined;
    await current.close();
  }
}
