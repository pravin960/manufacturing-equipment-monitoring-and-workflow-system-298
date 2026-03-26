const maintenanceService = require('../services/maintenance');

class WorkOrdersController {
  /**
   * PUBLIC_INTERFACE
   * POST /work-orders/from-alert
   * Create a work order derived from an alert.
   */
  async createFromAlert(req, res, next) {
    try {
      const rid = req.requestId || res?.locals?.requestId || 'no-request-id';
      const { alertId, title, description } = req.body || {};
      if (alertId === undefined) {
        return res.status(400).json({
          status: 'error',
          message: 'alertId is required',
        });
      }

      const workOrder = await maintenanceService.createWorkOrderFromAlert({
        alertId: Number(alertId),
        title: title ? String(title) : undefined,
        description: description ? String(description) : undefined,
      }, rid);

      return res.status(201).json({ data: workOrder });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new WorkOrdersController();

