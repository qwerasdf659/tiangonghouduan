/* 临时核对脚本：直连真实库核对《技术债务排查与暴力重构统一方案》数据断言，用后即删 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  const q = async (label, sql) => {
    try {
      const [rows] = await conn.query(sql);
      console.log('===', label);
      console.log(JSON.stringify(rows, null, 0));
    } catch (e) {
      console.log('===', label, 'ERROR:', e.message);
    }
  };

  await q('库名与表数', "SELECT DATABASE() db, COUNT(*) tables_cnt FROM information_schema.tables WHERE table_schema=DATABASE()");
  await q('sequelizemeta 条数', 'SELECT COUNT(*) c FROM sequelizemeta');
  await q('users 行数与 mobile 加密格式', "SELECT COUNT(*) total, SUM(mobile LIKE 'v1:%') v1_cnt, SUM(mobile IS NOT NULL AND mobile NOT LIKE 'v1:%') plain_cnt FROM users");
  await q('user_addresses 明文', "SELECT COUNT(*) total, SUM(recipient_phone LIKE 'v1:%') v1_cnt FROM user_addresses");
  await q('diy_works 行数', 'SELECT COUNT(*) c FROM diy_works');
  await q('consumption_records store_id NULL', 'SELECT COUNT(*) total, SUM(store_id IS NULL) null_cnt FROM consumption_records');
  await q('consumption_records status/final_status 分布', 'SELECT status, final_status, COUNT(*) c FROM consumption_records GROUP BY status, final_status');
  await q('exchange_records status 分布', 'SELECT status, COUNT(*) c FROM exchange_records GROUP BY status');
  await q('lottery_draws prize_type 分布', 'SELECT prize_type, COUNT(*) c FROM lottery_draws GROUP BY prize_type');
  await q('user32 history_total_points', 'SELECT user_id, history_total_points FROM users WHERE user_id=32');
  await q('user32 账本重算', "SELECT SUM(amount) s FROM asset_transactions WHERE user_id=32 AND asset_code='POINTS' AND amount>0");
  await q('操作日志三表行数', "SELECT (SELECT COUNT(*) FROM admin_operation_logs) admin_logs, (SELECT COUNT(*) FROM merchant_operation_logs) merchant_logs, (SELECT COUNT(*) FROM batch_operation_logs) batch_logs");
  await q('feature_flags', 'SELECT flag_key, is_enabled FROM feature_flags ORDER BY flag_key');
  await q('authentication_sessions 存量核对', "SELECT COUNT(*) total, SUM(login_platform='unknown') unknown_cnt, SUM(device_id IS NULL) device_null_cnt FROM authentication_sessions");
  await q('users.history_total_points 全员漂移概览', "SELECT u.user_id, u.history_total_points stored, COALESCE(t.s,0) derived FROM users u LEFT JOIN (SELECT user_id, SUM(amount) s FROM asset_transactions WHERE asset_code='POINTS' AND amount>0 GROUP BY user_id) t ON t.user_id=u.user_id WHERE u.history_total_points <> COALESCE(t.s,0)");
  await q('S1-S5 表行数', "SELECT (SELECT COUNT(*) FROM suppliers) suppliers, (SELECT COUNT(*) FROM product_series) product_series, (SELECT COUNT(*) FROM purchase_orders) purchase_orders");
  await q('operation_logs 新表是否已存在', "SELECT COUNT(*) c FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='operation_logs'");
  await q('exchange_records completed 明细预览', "SELECT record_id ,status, created_at FROM exchange_records WHERE status='completed' LIMIT 5");

  await conn.end();
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
