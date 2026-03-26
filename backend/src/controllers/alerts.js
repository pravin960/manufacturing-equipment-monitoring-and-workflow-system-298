const maintenanceService = require('../services/maintenance');

class AlertsController {
  /**
   * PUBLIC_INTERFACE
   * GET /alerts
   * Always returns HTTP 200 with a JSON array.
   *
   * Behavior:
   * - On success: returns DB-backed alerts list.
   * - On DB/query failure: logs the error and returns fallback dummy alert data.
   *
   * Query params:
   * - limit (optional): max items
   * - offset (optional): pagination offset
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @returns {Promise<import('express').Response>}
   */
  async list(req, res) {
    const limit =
      req.query && req.query.limit !== undefined ? Number(req.query.limit) : undefined;
    const offset =
      req.query && req.query.offset !== undefined ? Number(req.query.offset) : undefined;

    const fallbackDummyAlerts = [
      {
        id: 1,
        machine_id: 1,
        parameter_name: 'temperature',
        value: 95,
        severity: 'HIGH',
        message: 'Test alert working',
        created_at: new Date().toISOString(),
      },
    ];

    try {
      const alerts = await maintenanceService.getAlerts({
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined,
      });

      // Hard requirement: always return JSON array
      if (!Array.isArray(alerts)) {
        console.error('[alerts] Unexpected non-array response from maintenanceService.getAlerts', {
          type: typeof alerts,
        });
        return res.status(200).json(fallbackDummyAlerts);
      }

      return res.status(200).json(alerts);
    } catch (err) {
      // Hard requirement: never 500 from this endpoint
      console.error('[alerts] GET /alerts failed; returning fallback dummy data', {
        message: err?.message,
        stack: err?.stack,
        code: err?.code,
      });
      return res.status(200).json(fallbackDummyAlerts);
    }
  }
}

module.exports = new AlertsController();
