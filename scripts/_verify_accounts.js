require('dotenv').config()
async function main() {
  const { sequelize } = require('../models')
  const [rows] = await sequelize.query(
    `SELECT u.user_id, u.mobile, u.status,
            GROUP_CONCAT(CONCAT(r.role_name,'(lv',r.role_level,')')) AS roles
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.user_id AND ur.status='active'
     LEFT JOIN roles r ON r.role_id = ur.role_id
     WHERE u.mobile IN ('13612227910','13612227930')
     GROUP BY u.user_id, u.mobile, u.status`
  )
  console.log(JSON.stringify(rows, null, 2))
  process.exit(0)
}
main().catch(e => { console.error('ERR', e.message); process.exit(1) })
