const maintenanceService = require('../services/maintenance');

class AlertsController {
  /**
   * PUBLIC_INTERFACE
   * GET /alerts
   * Always returns HTTP 200 with a JSON array.
   *
   * Hardening strategy:
   * - Outer try/catch protects the whole handler.
   * - Nested try/catch protects the DB/service fetch specifically, so DB errors are swallowed.
   * - Any error => log to console and return [] (never 500).
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
    // Always keep a safe fallback that matches the contract (JSON array).
    const fallback = [];

    // Requested logs (entry)
    console.log('[alerts] GET /alerts handler invoked');

    try {
      const rawLimit = req.query && req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const rawOffset = req.query && req.query.offset !== undefined ? Number(req.query.offset) : undefined;

      const limit = Number.isFinite(rawLimit) ? rawLimit : undefined;
      const offset = Number.isFinite(rawOffset) ? rawOffset : undefined;

      // Requested logs (params)
      console.log('[alerts] GET /alerts params', { limit, offset });

      // Nested try/catch to swallow DB/service errors specifically.
      try {
        const alerts = await maintenanceService.getAlerts({ limit, offset });

        // Requested logs (success)
        console.log('[alerts] DB fetch success', {
          isArray: Array.isArray(alerts),
          count: Array.isArray(alerts) ? alerts.length : undefined,
        });

        // Hard requirement: always return JSON array.
        if (!Array.isArray(alerts)) {
          console.error('[alerts] Non-array returned from maintenanceService.getAlerts; returning []', {
            type: typeof alerts,
          });
          return res.status(200).json(fallback);
        }

        return res.status(200).json(alerts);
      } catch (dbErr) {
        // Requested logs (DB failure) — swallow and return [].
        console.error('[alerts] DB fetch failed; returning []', {
          message: dbErr?.message,
          stack: dbErr?.stack,
          code: dbErr?.code,
        });
        return res.status(200).json(fallback);
      }
    } catch (outerErr) {
      // Requested logs (outer failure) — swallow and return [].
      console.error('[alerts] Outer handler failure; returning []', {
        message: outerErr?.message,
        stack: outerErr?.stack,
        code: outerErr?.code,
      });
      return res.status(200).json(fallback);
    }
  }
}

module.exports = new AlertsController();
