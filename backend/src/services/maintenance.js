const maintenanceRepo = require('../db/repositories/maintenanceRepo');
const { getIO } = require('../realtime/socket');

function computePriority(currentValue, thresholdValue) {
  // Guard: if threshold is 0, treat any positive as critical; negative/0 as medium
  if (thresholdValue === 0) {
    if (currentValue > 0) return 'Critical';
    return 'Medium';
  }

  const ratio = (currentValue - thresholdValue) / thresholdValue; // e.g. 0.2 => 20% above
  if (ratio > 0.5) return 'Critical';
  if (ratio > 0.2) return 'High';
  return 'Medium';
}

class MaintenanceService {
  /**
   * PUBLIC_INTERFACE
   * Ingest a parameter log. Automatically evaluates thresholds and generates alerts.
   *
   * Rules:
   * - Fetch threshold for machine+parameter
   * - If value exceeds threshold: create alert, mark machine as AT_RISK
   * - Priority:
   *   > 50% above threshold => Critical
   *   > 20% above threshold => High
   *   else => Medium
   *
   * Emits Socket.IO event `alerts:new` to all connected clients when an alert is created.
   *
   * @param {{machineId:number, parameterName:string, value:number, timestamp?:string}} input
   * @returns {Promise<{log:object, thresholdUsed: object|null, alert: object|null}>}
   */
  async createLogAndEvaluate(input) {
    await maintenanceRepo.ensureMachine(input.machineId);

    const log = await maintenanceRepo.insertLog({
      machineId: input.machineId,
      parameterName: input.parameterName,
      value: input.value,
      loggedAt: input.timestamp,
    });

    const threshold = await maintenanceRepo.getThreshold(input.machineId, input.parameterName);

    // If there's no threshold configured, we still store the log but can't evaluate.
    if (!threshold) {
      return { log, thresholdUsed: null, alert: null };
    }

    if (Number(input.value) <= Number(threshold.thresholdValue)) {
      return { log, thresholdUsed: threshold, alert: null };
    }

    const priority = computePriority(Number(input.value), Number(threshold.thresholdValue));
    const message = `Threshold exceeded for ${input.parameterName}: ${input.value} > ${threshold.thresholdValue}`;

    const alert = await maintenanceRepo.insertAlert({
      machineId: input.machineId,
      parameterName: input.parameterName,
      currentValue: Number(input.value),
      thresholdValue: Number(threshold.thresholdValue),
      priority,
      message,
      createdAt: input.timestamp,
    });

    await maintenanceRepo.markMachineAtRisk(input.machineId);

    const io = getIO();
    if (io) {
      io.emit('alerts:new', alert);
    }

    return { log, thresholdUsed: threshold, alert };
  }

  /**
   * PUBLIC_INTERFACE
   * List alerts.
   * @param {{limit?:number, offset?:number}} opts
   * @returns {Promise<object[]>}
   */
  async getAlerts(opts = {}) {
    return maintenanceRepo.listAlerts(opts);
  }

  /**
   * PUBLIC_INTERFACE
   * Create a work order from an alert.
   * @param {{alertId:number, title?:string, description?:string}} input
   * @returns {Promise<object>}
   */
  async createWorkOrderFromAlert(input) {
    const alert = await maintenanceRepo.getAlertById(input.alertId);
    if (!alert) {
      const err = new Error(`Alert ${input.alertId} not found`);
      err.statusCode = 404;
      throw err;
    }

    const title =
      input.title ||
      `Work Order for Machine ${alert.machineId} - ${alert.parameterName} (${alert.priority})`;

    const description =
      input.description ||
      `Investigate alert ${alert.id}: ${alert.message || 'threshold breach'}. Current value: ${alert.currentValue}, threshold: ${alert.thresholdValue}.`;

    return maintenanceRepo.insertWorkOrder({
      alertId: alert.id,
      machineId: alert.machineId,
      title,
      description,
    });
  }
}

module.exports = new MaintenanceService();

