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
   * TEMP DEBUGGING (ultra-verbose):
   * - request-id scoped logs for deployed debugging
   * - logs include proxy headers and serialized error objects
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
    const rid = req.requestId || res?.locals?.requestId || 'no-request-id';
    const startedAt = Date.now();

    const serializeErr = (err) => {
      if (!err) return null;
      return {
        name: err.name,
        message: err.message,
        stack: err.stack,
        code: err.code,
        statusCode: err.statusCode,
        errno: err.errno,
        syscall: err.syscall,
        address: err.address,
        port: err.port,
        type: typeof err,
      };
    };

    console.log('[alerts]', {
      rid,
      msg: 'GET /alerts handler invoked',
      method: req.method,
      path: req.path,
      url: req.originalUrl,
      buildSafetyNet: res?.locals?._alertsSafetyNet === true,
      headers: {
        host: req.get('host'),
        accept: req.get('accept'),
        origin: req.get('origin'),
        referer: req.get('referer'),
        'user-agent': req.get('user-agent'),
        'x-forwarded-for': req.get('x-forwarded-for'),
        'x-forwarded-proto': req.get('x-forwarded-proto'),
        'x-forwarded-host': req.get('x-forwarded-host'),
        'x-request-id': req.get('x-request-id'),
        'x-correlation-id': req.get('x-correlation-id'),
      },
    });

    try {
      const rawLimit = req.query && req.query.limit !== undefined ? Number(req.query.limit) : undefined;
      const rawOffset = req.query && req.query.offset !== undefined ? Number(req.query.offset) : undefined;

      const limit = Number.isFinite(rawLimit) ? rawLimit : undefined;
      const offset = Number.isFinite(rawOffset) ? rawOffset : undefined;

      console.log('[alerts]', { rid, msg: 'GET /alerts params parsed', rawLimit, rawOffset, limit, offset, query: req.query });

      try {
        console.log('[alerts]', { rid, msg: 'Lazy requiring maintenance service' });

        // Lazy require: only loads when a request actually comes in, not at startup
        const maintenanceService = require('../services/maintenance');

        console.log('[alerts]', { rid, msg: 'Calling maintenanceService.getAlerts' });

        const alerts = await maintenanceService.getAlerts({ limit, offset }, rid);

        console.log('[alerts]', {
          rid,
          msg: 'maintenanceService.getAlerts returned',
          isArray: Array.isArray(alerts),
          type: typeof alerts,
          count: Array.isArray(alerts) ? alerts.length : undefined,
          ms: Date.now() - startedAt,
        });

        if (!Array.isArray(alerts)) {
          console.error('[alerts]', {
            rid,
            msg: 'Non-array returned from maintenanceService.getAlerts; returning []',
            returnedType: typeof alerts,
            ms: Date.now() - startedAt,
          });
          return res.status(200).json(fallback);
        }

        console.log('[alerts]', { rid, msg: 'Sending alerts array', count: alerts.length, ms: Date.now() - startedAt });
        return res.status(200).json(alerts);
      } catch (dbErr) {
        console.error('[alerts]', {
          rid,
          msg: 'DB/service fetch failed; returning []',
          error: serializeErr(dbErr),
          ms: Date.now() - startedAt,
        });
        return res.status(200).json(fallback);
      }
    } catch (outerErr) {
      console.error('[alerts]', {
        rid,
        msg: 'Outer handler failure; returning []',
        error: serializeErr(outerErr),
        ms: Date.now() - startedAt,
      });
      return res.status(200).json(fallback);
    }
  }
}

module.exports = new AlertsController();