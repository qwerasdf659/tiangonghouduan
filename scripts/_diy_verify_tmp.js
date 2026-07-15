/* eslint-disable */
require('dotenv').config();
const mysql = require('mysql2/promise');

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, connectTimeout: 15000,
  });
  const out = {};
  const q = async (label, sql, params) => {
    try { const [rows] = await conn.query(sql, params || []); out[label] = rows; }
    catch (e) { out[label] = { ERROR: e.message }; }
  };

  await q('cols_templates', `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='diy_templates' ORDER BY ordinal_position`);
  await q('cols_works', `SELECT COLUMN_NAME FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='diy_works' ORDER BY ordinal_position`);

  await q('categories_diy', `
    SELECT category_id, category_name, category_code, parent_category_id, level, is_enabled, sort_order
    FROM categories
    WHERE category_id IN (190,191,192,193,194,291,292,293) OR parent_category_id = 190
    ORDER BY category_id`);

  await q('materials_sample', `
    SELECT diy_material_id, material_code, display_name, group_code, item_type, material_type,
           shape, diameter, bore_orientation, size_length_mm, size_width_mm, price, price_asset_code,
           five_elements, is_enabled, image_media_id
    FROM diy_materials ORDER BY diy_material_id`);

  await q('templates_all', `
    SELECT diy_template_id, template_code, display_name, category_id, status, is_enabled,
           base_image_media_id,
           JSON_EXTRACT(layout,'$.shape') AS layout_shape,
           JSON_LENGTH(JSON_EXTRACT(layout,'$.slot_definitions')) AS slot_count
    FROM diy_templates ORDER BY diy_template_id`);

  console.log(JSON.stringify(out, null, 2));
  await conn.end();
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
