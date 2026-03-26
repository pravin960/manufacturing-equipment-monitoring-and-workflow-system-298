// backend/src/services/maintenance.js
//
// Service layer for maintenance operations.
//
// FIX: maintenanceRepo is loaded lazily inside each method.
// This prevents a DB crash at require() time from killing this service module on startup.
//
// LOGGING: Each method now accepts an optional `rid` (request ID) parameter
// for end-to-end correlation of logs from controller -> service -> repo -> pool.

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
   * @param {string} [rid] - Request ID for log correlation
   * @returns {Promise<{log:object, thresholdUsed: object|null, alert: object|null}>}
   */
  async createLogAndEvaluate(input, rid) {
    const maintenanceRepo = getRepo();

    console.log('[maintenance] createLogAndEvaluate called', {
      rid: rid || 'no-rid',
      machineId: input.machineId,
      parameterName: input.parameterName,
      value: input.value,
    });

    await maintenanceRepo.ensureMachine(input.machineId, rid);

    const log = await maintenanceRepo.insertLog({
      machineId: input.machineId,
      parameterName: input.parameterName,
      value: input.value,
      loggedAt: input.timestamp,
    }, rid);

    const threshold = await maintenanceRepo.getThreshold(input.machineId, input.parameterName, rid);

    if (!threshold) {
      console.log('[maintenance] No threshold configured; skipping evaluation', {
        rid: rid || 'no-rid',
        machineId: input.machineId,
        parameterName: input.parameterName,
      });
      return { log, thresholdUsed: null, alert: null };
    }

    if (Number(input.value) <= Number(threshold.thresholdValue)) {
      console.log('[maintenance] Value within threshold', {
        rid: rid || 'no-rid',
        value: input.value,
        thresholdValue: threshold.thresholdValue,
      });
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
    }, rid);

    console.log('[maintenance] Alert created:', { rid: rid || 'no-rid', alert });

    await maintenanceRepo.markMachineAtRisk(input.machineId, rid);

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
      console.log('[realtime] Emitting new_alert:', { rid: rid || 'no-rid', eventPayload });
      io.emit('new_alert', eventPayload);
    } else {
      console.log('[realtime] Socket.IO not initialized; skipping new_alert emit', {
        rid: rid || 'no-rid',
      });
    }

    return { log, thresholdUsed: threshold, alert };
  }

  /**
   * PUBLIC_INTERFACE
   * List alerts.
   * @param {{limit?:number, offset?:number}} opts
   * @param {string} [rid] - Request ID for log correlation
   * @returns {Promise<object[]>}
   */
  async getAlerts(opts = {}, rid) {
    const startedAt = Date.now();

    console.log('[maintenance] getAlerts called', {
      rid: rid || 'no-rid',
      limit: opts.limit,
      offset: opts.offset,
      timestamp: new Date().toISOString(),
    });

    try {
      const maintenanceRepo = getRepo();

      console.log('[maintenance] getAlerts: repo loaded, calling listAlerts', {
        rid: rid || 'no-rid',
      });

      const alerts = await maintenanceRepo.listAlerts(opts, rid);

      console.log('[maintenance] getAlerts succeeded', {
        rid: rid || 'no-rid',
        isArray: Array.isArray(alerts),
        count: Array.isArray(alerts) ? alerts.length : undefined,
        durationMs: Date.now() - startedAt,
      });

      return alerts;
    } catch (err) {
      console.error('[maintenance] getAlerts FAILED; returning []', {
        rid: rid || 'no-rid',
        durationMs: Date.now() - startedAt,
        error: {
          name: err?.name,
          message: err?.message,
          code: err?.code,
          stack: err?.stack,
        },
      });
      return [];
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Create a work order from an alert.
   * @param {{alertId:number, title?:string, description?:string}} input
   * @param {string} [rid] - Request ID for log correlation
   * @returns {Promise<object>}
   */
  async createWorkOrderFromAlert(input, rid) {
    const maintenanceRepo = getRepo();

    console.log('[maintenance] createWorkOrderFromAlert called', {
      rid: rid || 'no-rid',
      alertId: input.alertId,
    });

    const alert = await maintenanceRepo.getAlertById(input.alertId, rid);
    if (!alert) {
      console.error('[maintenance] Alert not found for work order', {
        rid: rid || 'no-rid',
        alertId: input.alertId,
      });
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
    }, rid);
  }
}

module.exports = new MaintenanceService();
