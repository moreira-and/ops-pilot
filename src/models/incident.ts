import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class Incident extends Model<
  InferAttributes<Incident>,
  InferCreationAttributes<Incident>
> {
  declare id: string;
  declare title: string;
  declare serviceId: string;
  declare severity: "critical" | "high" | "medium" | "low";
  declare status: "open" | "resolved";
  declare resolvedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initializeIncidentModel(
  sequelize: Sequelize,
): typeof Incident {
  Incident.init(
    {
      id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
      title: { type: DataTypes.STRING(255), allowNull: false },
      serviceId: { type: DataTypes.STRING(64), allowNull: false },
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
    },
    {
      sequelize,
      tableName: "incidents",
      modelName: "Incident",
      timestamps: true,
    },
  );
  return Incident;
}
