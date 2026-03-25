class AlertsController {
  async list(req, res) {
    return res.status(200).json([
      {
        id: 1,
        machine_id: 1,
        parameter_name: "temperature",
        value: 95,
        severity: "HIGH",
        message: "Test alert working",
        created_at: new Date().toISOString()
      }
    ]);
  }
}

module.exports = new AlertsController();