import type { Sequelize } from "sequelize";
import { initializeAlertModel } from "./alert.js";
import { initializeIncidentModel } from "./incident.js";
import { initializeServiceModel } from "./service.js";

export function initializeOperationalModels(sequelize: Sequelize): void {
  const Service = initializeServiceModel(sequelize);
  const Alert = initializeAlertModel(sequelize);
  const Incident = initializeIncidentModel(sequelize);

  Service.hasMany(Alert, { foreignKey: "serviceId", onDelete: "RESTRICT" });
  Alert.belongsTo(Service, { foreignKey: "serviceId" });
  Service.hasMany(Incident, { foreignKey: "serviceId", onDelete: "RESTRICT" });
  Incident.belongsTo(Service, { foreignKey: "serviceId" });
}
