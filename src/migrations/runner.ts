import { Sequelize } from "sequelize";
import { SequelizeStorage, Umzug } from "umzug";
import * as initialOperationalTables from "./001-create-operational-tables.js";

export function createMigrator(
  sequelize: Sequelize,
): Umzug<ReturnType<Sequelize["getQueryInterface"]>> {
  return new Umzug({
    migrations: [
      {
        name: initialOperationalTables.name,
        up: async ({ context }) => initialOperationalTables.up({ context }),
        down: async ({ context }) => initialOperationalTables.down({ context }),
      },
    ],
    context: sequelize.getQueryInterface(),
    storage: new SequelizeStorage({ sequelize }),
    logger: undefined,
  });
}
