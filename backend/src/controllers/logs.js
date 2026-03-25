const maintenanceService = require('../services/maintenance');

class LogsController {
  /**
   * PUBLIC_INTERFACE
   * POST /logs
   * Create a parameter log, evaluate threshold, auto-generate alert, and push real-time event.
   */
  async create(req, res, next) {
    try {
      const { machineId, parameterName, value, timestamp } = req.body || {};

      if (machineId === undefined || parameterName === undefined || value === undefined) {
        return res.status(400).json({
          status: 'error',
          message: 'machineId, parameterName, and value are required',
        });
      }

      const result = await maintenanceService.createLogAndEvaluate({
        machineId: Number(machineId),
        parameterName: String(parameterName),
        value: Number(value),
        timestamp: timestamp ? String(timestamp) : undefined,
      });

      return res.status(201).json(result);
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new LogsController();

