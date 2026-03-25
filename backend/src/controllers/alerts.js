const maintenanceService = require('../services/maintenance');

class AlertsController {
  /**
   * PUBLIC_INTERFACE
   * GET /alerts
   * Fetch alerts (newest first).
   */
  async list(req, res, next) {
    try {
      const { limit, offset } = req.query || {};
      const alerts = await maintenanceService.getAlerts({
        limit: limit !== undefined ? Number(limit) : undefined,
        offset: offset !== undefined ? Number(offset) : undefined,
      });
      return res.status(200).json({ data: alerts });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new AlertsController();

