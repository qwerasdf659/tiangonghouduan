const { Sequelize } = require('sequelize')
require('dotenv').config()
// 🔴 复用主 sequelize 实例（单一配置源）
const { sequelize } = require('../config/database')

async function checkMigrations() {
  try {
    const [rows] = await sequelize.query(
      "SELECT name FROM SequelizeMeta WHERE name LIKE '%market-listings%' OR name LIKE '%item-instances%' ORDER BY name"
    )
    console.log('市场挂牌和物品实例相关迁移:')
    rows.forEach(r => console.log(' -', r.name))

    const [fks] = await sequelize.query(`
      SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME 
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}'
      AND TABLE_NAME = 'market_listings' 
      AND REFERENCED_TABLE_NAME IS NOT NULL
    `)
    console.log('\nmarket_listings表当前外键:')
    fks.forEach(fk => console.log(' -', fk.CONSTRAINT_NAME, '->', fk.REFERENCED_TABLE_NAME))

    await sequelize.close()
  } catch (error) {
    console.error('查询失败:', error.message)
    process.exit(1)
  }
}

checkMigrations()
