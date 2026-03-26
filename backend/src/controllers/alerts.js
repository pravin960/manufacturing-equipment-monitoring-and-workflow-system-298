// backend/src/controllers/alerts.js
//
// FIX: maintenanceService is now loaded lazily inside the handler.
// This prevents a DB/service crash at require() time from killing this controller.
// Even if the DB is completely unreachable, GET /alerts will always return 200 [].

class AlertsController {
  /**
   * PUBLIC_INTERFACE
   * GET /alerts
   * Always returns HTTP 200 with a JSON array.
   *
   * Hardening strategy:
   * - maintenanceService loaded lazily (inside handler) to avoid startup crash
   * - Outer try/catch protects the whole handler
   * - Nested try/catch protects the DB/service fetch specifically
   * - Any error => log to console and return [] (never 500)
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
    const fallback = [];

    console.log('[alerts] GET /alerts handler invoked');

    try {
      const rawLimit = req.query && req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const rawOffset = req.query && req.query.offset !== undefined ? Number(req.query.offset) : undefined;

      const limit = Number.isFinite(rawLimit) ? rawLimit : undefined;
      const offset = Number.isFinite(rawOffset) ? rawOffset : undefined;

      console.log('[alerts] GET /alerts params', { limit, offset });

      try {
        // Lazy require: only loads when a request actually comes in, not at startup
        const maintenanceService = require('../services/maintenance');
        const alerts = await maintenanceService.getAlerts({ limit, offset });

        console.log('[alerts] DB fetch success', {
          isArray: Array.isArray(alerts),
          count: Array.isArray(alerts) ? alerts.length : undefined,
        });

        if (!Array.isArray(alerts)) {
          console.error('[alerts] Non-array returned from maintenanceService.getAlerts; returning []', {
            type: typeof alerts,
          });
          return res.status(200).json(fallback);
        }

        return res.status(200).json(alerts);
      } catch (dbErr) {
        console.error('[alerts] DB fetch failed; returning []', {
          message: dbErr?.message,
          code: dbErr?.code,
        });
        return res.status(200).json(fallback);
      }
    } catch (outerErr) {
      console.error('[alerts] Outer handler failure; returning []', {
        message: outerErr?.message,
        code: outerErr?.code,
      });
      return res.status(200).json(fallback);
    }
  }
}

module.exports = new AlertsController();