const maintenanceService = require('../services/maintenance');

class AlertsController {
  /**
   * PUBLIC_INTERFACE
   * GET /alerts
   * Fetch alerts (newest first).
   *
   * Hardening requirements (per bugfix request):
   * - Always return a JSON array ([]) as the top-level response body.
   * - Must not emit 500 responses even if the DB query fails or returns null.
   * - Use safe fallbacks and sanitize query inputs.
   */
  async list(req, res) {
    /**
     * Always respond with a JSON array; never throw.
     * Wrapped in try/catch so even response serialization issues won't bubble into Express error middleware.
     * @param {unknown} alerts
     */
    const safeReturn = (alerts) => {
      try {
        const payload = Array.isArray(alerts) ? alerts : [];
        return res.status(200).json(payload);
      } catch (writeErr) {
        // As an absolute last resort, still avoid a 500 by returning an empty array.
        console.error('[alerts] Failed to write response; falling back to []', {
          message: writeErr?.message,
        });
        try {
          res.status(200).set('content-type', 'application/json').send('[]');
        } catch (_) {
          // If even that fails, do nothing (connection likely closed). Still avoid throwing.
        }
        return undefined;
      }
    };

    try {
      const { limit, offset } = req.query || {};

      // Sanitize pagination inputs: ensure non-negative integers, otherwise undefined to let service defaults apply.
      const parsedLimit = Number.isFinite(Number(limit)) ? Math.max(0, Math.trunc(Number(limit))) : undefined;
      const parsedOffset = Number.isFinite(Number(offset)) ? Math.max(0, Math.trunc(Number(offset))) : undefined;

      let alerts = null;
      try {
        alerts = await maintenanceService.getAlerts({
          limit: parsedLimit,
          offset: parsedOffset,
        });
      } catch (dbErr) {
        // DB failure should never propagate to an HTTP 500 for this endpoint.
        console.error('[alerts] GET /alerts DB/service failure; returning empty list.', {
          message: dbErr?.message,
          code: dbErr?.code,
          detail: dbErr?.detail,
        });
        alerts = [];
      }

      // If service returned null/undefined/non-array, return [].
      return safeReturn(alerts);
    } catch (err) {
      // Final safety net: never allow GET /alerts to throw.
      console.error('[alerts] GET /alerts unexpected failure; returning empty list.', {
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
      });
      return safeReturn([]);
    }
  }
}

module.exports = new AlertsController();

