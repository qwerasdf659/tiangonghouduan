'use strict';
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 15000,
  });
  const out = {};
  const q = async (label, sql) => {
    try {
      const [rows] = await conn.query(sql);
      out[label] = rows;
    } catch (e) {
      out[label] = { ERROR: e.message };
    }
  };

  // 1. total table count
  await q('table_count', `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema='${process.env.DB_NAME}'`);
  // 2. sequelizemeta rows
  await q('sequelizemeta', `SELECT * FROM SequelizeMeta`);
  // 3. old log tables existence
  await q('log_tables', `SELECT table_name FROM information_schema.tables WHERE table_schema='${process.env.DB_NAME}' AND table_name IN ('operation_logs','admin_operation_logs','merchant_operation_logs','batch_operation_logs')`);
  // 4. users.history_total_points column existence
  await q('users_htp', `SELECT column_name FROM information_schema.columns WHERE table_schema='${process.env.DB_NAME}' AND table_name='users' AND column_name='history_total_points'`);
  // 5. consumption_records.final_status column
  await q('cr_final_status', `SELECT column_name FROM information_schema.columns WHERE table_schema='${process.env.DB_NAME}' AND table_name='consumption_records' AND column_name IN ('final_status','status')`);
  // 6. consumption_records.store_id nullability
  await q('cr_store_id', `SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema='${process.env.DB_NAME}' AND table_name='consumption_records' AND column_name='store_id'`);
  // 7. user_addresses plaintext columns
  await q('user_addr_cols', `SELECT column_name FROM information_schema.columns WHERE table_schema='${process.env.DB_NAME}' AND table_name='user_addresses' AND column_name IN ('receiver_name','receiver_phone','detail_address')`);
  // 8. feature_flags
  await q('feature_flags', `SELECT flag_key,is_enabled FROM feature_flags ORDER BY flag_key`);
  // 9. authentication_sessions login_platform enum & device_id nullability
  await q('auth_sess_cols', `SELECT column_name,column_type,is_nullable FROM information_schema.columns WHERE table_schema='${process.env.DB_NAME}' AND table_name='authentication_sessions' AND column_name IN ('login_platform','device_id')`);
  // 10. exchange_records status distribution
  await q('exchange_status', `SELECT status, COUNT(*) n FROM exchange_records GROUP BY status`);
  // 11. operation_logs columns check
  await q('operation_logs_cols', `SELECT column_name FROM information_schema.columns WHERE table_schema='${process.env.DB_NAME}' AND table_name='operation_logs' ORDER BY ordinal_position`);
  // 12. dictionary consumption_final_status
  await q('dict_final_status', `SELECT table_name FROM information_schema.tables WHERE table_schema='${process.env.DB_NAME}' AND table_name LIKE '%dict%'`);

  console.log(JSON.stringify(out, null, 2));
  await conn.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
