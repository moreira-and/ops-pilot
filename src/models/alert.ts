import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type Sequelize,
} from "sequelize";

export class Alert extends Model<
  InferAttributes<Alert>,
  InferCreationAttributes<Alert>
> {
  declare id: string;
  declare serviceId: string;
  declare title: string;
  declare status: "firing" | "resolved";
  declare severity: "critical" | "high" | "medium" | "low";
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initializeAlertModel(sequelize: Sequelize): typeof Alert {
  Alert.init(
    {
      id: { type: DataTypes.STRING(64), primaryKey: true, allowNull: false },
      serviceId: { type: DataTypes.STRING(64), allowNull: false },
      title: { type: DataTypes.STRING(255), allowNull: false },
      status: {
        type: DataTypes.ENUM("firing", "resolved"),
        allowNull: false,
      },
      severity: {
        type: DataTypes.ENUM("critical", "high", "medium", "low"),
        allowNull: false,
      },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    },
    { sequelize, tableName: "alerts", modelName: "Alert", timestamps: true },
  );
  return Alert;
}
