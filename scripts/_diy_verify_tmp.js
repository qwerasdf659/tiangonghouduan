/* eslint-disable */
require('dotenv').config();
const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, connectTimeout: 15000,
  });
  const [rows] = await conn.query(`
    SELECT diy_template_id, display_name, category_id, status, material_group_codes,
           layout, bead_rules, sizing_rules, capacity_rules
    FROM diy_templates ORDER BY diy_template_id`);
  rows.forEach(r => {
    console.log('\n===== TEMPLATE', r.diy_template_id, r.display_name, '(cat', r.category_id, r.status, ') =====');
    console.log('material_group_codes:', JSON.stringify(r.material_group_codes));
    console.log('layout:', JSON.stringify(r.layout));
    console.log('bead_rules:', JSON.stringify(r.bead_rules));
    console.log('sizing_rules:', JSON.stringify(r.sizing_rules));
    console.log('capacity_rules:', JSON.stringify(r.capacity_rules));
  });
  await conn.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
