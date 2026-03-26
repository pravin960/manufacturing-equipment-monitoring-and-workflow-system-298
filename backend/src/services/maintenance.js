// backend/src/services/maintenance.js
//
// FIX: maintenanceRepo is now loaded lazily inside each method.
// This prevents a DB crash at require() time from killing this service module on startup.

const { getIO } = require('../realtime/socket');

function computePriority(currentValue, thresholdValue) {
  if (thresholdValue === 0) {
    if (currentValue > 0) return 'Critical';
    return 'Medium';
  }

  const ratio = (currentValue - thresholdValue) / thresholdValue;
  if (ratio > 0.5) return 'Critical';
  if (ratio > 0.2) return 'High';
  return 'Medium';
}

// Lazy loader — safe to call at any time
function getRepo() {
  return require('../db/repositories/maintenanceRepo');
}

class MaintenanceService {
  /**
   * PUBLIC_INTERFACE
   * Ingest a parameter log. Automatically evaluates thresholds and generates alerts.
   *
   * @param {{machineId:number, parameterName:string, value:number, timestamp?:string}} input
   * @returns {Promise<{log:object, thresholdUsed: object|null, alert: object|null}>}
   */
  async createLogAndEvaluate(input) {
    const maintenanceRepo = getRepo();

    await maintenanceRepo.ensureMachine(input.machineId);

    const log = await maintenanceRepo.insertLog({
      machineId: input.machineId,
      parameterName: input.parameterName,
      value: input.value,
      loggedAt: input.timestamp,
    });

    const threshold = await maintenanceRepo.getThreshold(input.machineId, input.parameterName);

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

    console.log('[alerts] Alert created:', alert);

    await maintenanceRepo.markMachineAtRisk(input.machineId);

    const io = getIO();
    if (io) {
      const eventPayload = {
        machineId: alert.machineId,
        parameter: alert.parameterName,
        currentValue: alert.currentValue,
        thresholdValue: alert.thresholdValue,
        priority: alert.priority,
        timestamp: alert.createdAt,
      };
      console.log('[realtime] Emitting new_alert:', eventPayload);
      io.emit('new_alert', eventPayload);
    } else {
      console.log('[realtime] Socket.IO not initialized; skipping new_alert emit');
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
    try {
      const maintenanceRepo = getRepo();
      return await maintenanceRepo.listAlerts(opts);
    } catch (err) {
      console.error('[maintenance] getAlerts failed; returning []', {
        message: err?.message,
        code: err?.code,
      });
      return [];
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Create a work order from an alert.
   * @param {{alertId:number, title?:string, description?:string}} input
   * @returns {Promise<object>}
   */
  async createWorkOrderFromAlert(input) {
    const maintenanceRepo = getRepo();

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