const maintenanceService = require('../services/maintenance');

class AlertsController {
  /**
   * PUBLIC_INTERFACE
   * GET /alerts
   * Fetch alerts (newest first).
   *
   * Hardening notes:
   * - Must never throw 500 for empty/uninitialized data.
   * - On any error (including missing alerts table), log clearly and return an empty list.
   */
  async list(req, res) {
    // Always respond with a predictable payload shape.
    const safeReturn = (alerts) => res.status(200).json({ data: Array.isArray(alerts) ? alerts : [] });

    try {
      const { limit, offset } = req.query || {};

      const alerts = await maintenanceService.getAlerts({
        limit: limit !== undefined ? Number(limit) : undefined,
        offset: offset !== undefined ? Number(offset) : undefined,
      });

      return safeReturn(alerts);
    } catch (err) {
      // Clear error logging for debugging, but do not expose internals to clients.
      console.error('[alerts] GET /alerts failed; returning empty list.', {
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
      });

      return safeReturn([]);
    }
  }
}

module.exports = new AlertsController();

