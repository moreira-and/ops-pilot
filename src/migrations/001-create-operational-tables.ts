import { DataTypes, type QueryInterface } from "sequelize";

export const name = "001-create-operational-tables";

export async function up({ context }: { context: QueryInterface }): Promise<void> {
  await context.createTable("services", {
    id: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });
  await context.createTable("alerts", {
    id: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
    serviceId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      references: { model: "services", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    title: { type: DataTypes.STRING(255), allowNull: false },
    status: { type: DataTypes.ENUM("firing", "resolved"), allowNull: false },
    severity: {
      type: DataTypes.ENUM("critical", "high", "medium", "low"),
      allowNull: false,
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });
  await context.createTable("incidents", {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    serviceId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      references: { model: "services", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "RESTRICT",
    },
    severity: {
      type: DataTypes.ENUM("critical", "high", "medium", "low"),
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("open", "resolved"),
      allowNull: false,
      defaultValue: "open",
    },
    resolvedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  });
}

export async function down({ context }: { context: QueryInterface }): Promise<void> {
  await context.dropTable("incidents");
  await context.dropTable("alerts");
  await context.dropTable("services");
}
