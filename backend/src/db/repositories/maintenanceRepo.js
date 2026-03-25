const pool = require('../pool');

function mapAlertRow(row) {
  return {
    id: row.id,
    machineId: row.machine_id,
    parameterName: row.parameter_name,
    currentValue: Number(row.current_value),
    thresholdValue: Number(row.threshold_value),
    priority: row.priority,
    message: row.message,
    createdAt: row.created_at,
    acknowledged: row.acknowledged,
  };
}

function mapLogRow(row) {
  return {
    id: row.id,
    machineId: row.machine_id,
    parameterName: row.parameter_name,
    value: Number(row.value),
    loggedAt: row.logged_at,
  };
}

function mapWorkOrderRow(row) {
  return {
    id: row.id,
    alertId: row.alert_id,
    machineId: row.machine_id,
    title: row.title,
    description: row.description,
    status: row.status,
    createdAt: row.created_at,
  };
}

class MaintenanceRepo {
  /**
   * PUBLIC_INTERFACE
   * Ensure a machine exists; creates a placeholder row if missing.
   * @param {number} machineId
   * @returns {Promise<{id:number,name:string,status:string,createdAt:string}>}
   */
  async ensureMachine(machineId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        'SELECT id, name, status, created_at FROM machines WHERE id = $1',
        [machineId]
      );

      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        const row = existing.rows[0];
        return { id: row.id, name: row.name, status: row.status, createdAt: row.created_at };
      }

      const inserted = await client.query(
        'INSERT INTO machines (id, name, status) VALUES ($1, $2, \'OK\') RETURNING id, name, status, created_at',
        [machineId, `Machine ${machineId}`]
      );
      await client.query('COMMIT');
      const row = inserted.rows[0];
      return { id: row.id, name: row.name, status: row.status, createdAt: row.created_at };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Fetch threshold for a machine parameter.
   * @param {number} machineId
   * @param {string} parameterName
   * @returns {Promise<{machineId:number,parameterName:string,thresholdValue:number} | null>}
   */
  async getThreshold(machineId, parameterName) {
    const result = await pool.query(
      'SELECT machine_id, parameter_name, threshold_value FROM thresholds WHERE machine_id = $1 AND parameter_name = $2',
      [machineId, parameterName]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      machineId: row.machine_id,
      parameterName: row.parameter_name,
      thresholdValue: Number(row.threshold_value),
    };
  }

  /**
   * PUBLIC_INTERFACE
   * Create or update a threshold for a machine parameter.
   * @param {number} machineId
   * @param {string} parameterName
   * @param {number} thresholdValue
   * @returns {Promise<{machineId:number,parameterName:string,thresholdValue:number}>}
   */
  async upsertThreshold(machineId, parameterName, thresholdValue) {
    const result = await pool.query(
      `INSERT INTO thresholds (machine_id, parameter_name, threshold_value)
       VALUES ($1, $2, $3)
       ON CONFLICT (machine_id, parameter_name)
       DO UPDATE SET threshold_value = EXCLUDED.threshold_value
       RETURNING machine_id, parameter_name, threshold_value`,
      [machineId, parameterName, thresholdValue]
    );
    const row = result.rows[0];
    return {
      machineId: row.machine_id,
      parameterName: row.parameter_name,
      thresholdValue: Number(row.threshold_value),
    };
  }

  /**
   * PUBLIC_INTERFACE
   * Insert a parameter log row.
   * @param {{machineId:number,parameterName:string,value:number,loggedAt?:string}} log
   * @returns {Promise<object>}
   */
  async insertLog(log) {
    const result = await pool.query(
      `INSERT INTO parameter_logs (machine_id, parameter_name, value, logged_at)
       VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()))
       RETURNING id, machine_id, parameter_name, value, logged_at`,
      [log.machineId, log.parameterName, log.value, log.loggedAt || null]
    );
    return mapLogRow(result.rows[0]);
  }

  /**
   * PUBLIC_INTERFACE
   * Mark machine as AT_RISK.
   * @param {number} machineId
   * @returns {Promise<void>}
   */
  async markMachineAtRisk(machineId) {
    await pool.query('UPDATE machines SET status = \'AT_RISK\' WHERE id = $1', [machineId]);
  }

  /**
   * PUBLIC_INTERFACE
   * Create an alert row.
   * @param {{machineId:number,parameterName:string,currentValue:number,thresholdValue:number,priority:string,message?:string,createdAt?:string}} alert
   * @returns {Promise<object>}
   */
  async insertAlert(alert) {
    const result = await pool.query(
      `INSERT INTO alerts
       (machine_id, parameter_name, current_value, threshold_value, priority, message, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()))
       RETURNING id, machine_id, parameter_name, current_value, threshold_value, priority, message, created_at, acknowledged`,
      [
        alert.machineId,
        alert.parameterName,
        alert.currentValue,
        alert.thresholdValue,
        alert.priority,
        alert.message || null,
        alert.createdAt || null,
      ]
    );
    return mapAlertRow(result.rows[0]);
  }

  /**
   * PUBLIC_INTERFACE
   * List alerts (newest first).
   *
   * Hardening notes:
   * - If the `alerts` table is missing/uninitialized, attempt to create it (best effort) and return [].
   * - Never throw from this method for missing table; callers (GET /alerts) should be safe.
   *
   * @param {{limit?:number, offset?:number}} opts
   * @returns {Promise<object[]>}
   */
  async listAlerts(opts = {}) {
    const limit = opts.limit ? Number(opts.limit) : 200;
    const offset = opts.offset ? Number(opts.offset) : 0;

    const runSelect = async () =>
      pool.query(
        `SELECT id, machine_id, parameter_name, current_value, threshold_value, priority, message, created_at, acknowledged
         FROM alerts
         ORDER BY created_at DESC, id DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

    try {
      const result = await runSelect();
      return result.rows.map(mapAlertRow);
    } catch (err) {
      // PostgreSQL missing-table error code is 42P01 (undefined_table)
      const isMissingTable = err && (err.code === '42P01' || /relation\s+"alerts"\s+does\s+not\s+exist/i.test(err.message || ''));

      console.error('[db] listAlerts failed', {
        message: err?.message,
        code: err?.code,
        isMissingTable,
      });

      if (!isMissingTable) {
        // For other DB errors, return safe fallback (avoid breaking GET /alerts).
        return [];
      }

      // Best-effort schema bootstrap for the alerts table.
      try {
        await pool.query(
          `CREATE TABLE IF NOT EXISTS alerts (
             id SERIAL PRIMARY KEY,
             machine_id INTEGER NOT NULL,
             parameter_name TEXT NOT NULL,
             current_value NUMERIC NOT NULL,
             threshold_value NUMERIC NOT NULL,
             priority TEXT NOT NULL,
             message TEXT,
             created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
             acknowledged BOOLEAN NOT NULL DEFAULT FALSE
           )`
        );

        // Retry once after creation. If still failing, fall back to [].
        const result = await runSelect();
        return result.rows.map(mapAlertRow);
      } catch (createErr) {
        console.error('[db] Unable to create/verify alerts table; returning empty list.', {
          message: createErr?.message,
          code: createErr?.code,
        });
        return [];
      }
    }
  }

  /**
   * PUBLIC_INTERFACE
   * Fetch an alert by id.
   * @param {number} alertId
   * @returns {Promise<object|null>}
   */
  async getAlertById(alertId) {
    const result = await pool.query(
      `SELECT id, machine_id, parameter_name, current_value, threshold_value, priority, message, created_at, acknowledged
       FROM alerts WHERE id = $1`,
      [alertId]
    );
    if (result.rows.length === 0) return null;
    return mapAlertRow(result.rows[0]);
  }

  /**
   * PUBLIC_INTERFACE
   * Create a work order linked to an alert.
   * @param {{alertId:number,machineId:number,title:string,description?:string}} wo
   * @returns {Promise<object>}
   */
  async insertWorkOrder(wo) {
    const result = await pool.query(
      `INSERT INTO work_orders (alert_id, machine_id, title, description, status)
       VALUES ($1, $2, $3, $4, 'OPEN')
       RETURNING id, alert_id, machine_id, title, description, status, created_at`,
      [wo.alertId, wo.machineId, wo.title, wo.description || null]
    );
    return mapWorkOrderRow(result.rows[0]);
  }
}

module.exports = new MaintenanceRepo();

