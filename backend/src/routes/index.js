const express = require('express');
const healthController = require('../controllers/health');
const logsController = require('../controllers/logs');
const alertsController = require('../controllers/alerts');
const workOrdersController = require('../controllers/workOrders');

const router = express.Router();

// Health endpoint
/**
 * @swagger
 * /:
 *   get:
 *     summary: Health endpoint
 *     responses:
 *       200:
 *         description: Service health check passed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: ok
 *                 message:
 *                   type: string
 *                   example: Service is healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: development
 */
router.get('/', healthController.check.bind(healthController));

/**
 * @swagger
 * /logs:
 *   post:
 *     summary: Create a parameter log and run automated threshold evaluation
 *     description: >
 *       Persists a parameter log. If the configured threshold is exceeded, automatically creates an alert,
 *       marks the machine as AT_RISK, and pushes a real-time Socket.IO event `alerts:new`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [machineId, parameterName, value]
 *             properties:
 *               machineId:
 *                 type: integer
 *                 example: 1
 *               parameterName:
 *                 type: string
 *                 example: temperature
 *               value:
 *                 type: number
 *                 example: 95
 *               timestamp:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-03-25T12:00:00Z"
 *     responses:
 *       201:
 *         description: Log created; includes alert if generated
 */
router.post('/logs', logsController.create.bind(logsController));

/**
 * @swagger
 * /alerts:
 *   get:
 *     summary: Fetch alerts
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 200 }
 *       - in: query
 *         name: offset
 *         schema: { type: integer, example: 0 }
 *     responses:
 *       200:
 *         description: Alerts list (newest first)
 */
router.get('/alerts', alertsController.list.bind(alertsController));

/**
 * @swagger
 * /work-orders/from-alert:
 *   post:
 *     summary: Create a work order from an alert
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [alertId]
 *             properties:
 *               alertId:
 *                 type: integer
 *                 example: 10
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Work order created
 */
router.post(
  '/work-orders/from-alert',
  workOrdersController.createFromAlert.bind(workOrdersController)
);

module.exports = router;

