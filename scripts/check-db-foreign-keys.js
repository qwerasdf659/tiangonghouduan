#!/usr/bin/env node
/**
 * 数据库外键检查脚本
 * 用途：检查user_roles和roles表的外键约束是否正确定义
 */

const { Sequelize } = require('sequelize')
require('dotenv').config()

const sequelize = new Sequelize(
  process.env.DB_NAME || 'restaurant_points_dev',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false
  }
)

;(async () => {
  try {
    const dbName = process.env.DB_NAME || 'restaurant_points_dev'
    const [results] = await sequelize.query(`
      SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        CONSTRAINT_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? 
        AND REFERENCED_TABLE_NAME IS NOT NULL
        AND TABLE_NAME IN ('user_roles', 'roles')
      ORDER BY TABLE_NAME, CONSTRAINT_NAME
    `, { replacements: [dbName] })

    console.log('\n✅ user_roles和roles表的外键约束检查:')
    if (results.length === 0) {
      console.log('⚠️  未找到外键约束')
      console.log('   建议：检查数据库迁移文件是否正确执行')
    } else {
      console.log(`   找到${results.length}个外键约束:`)
      results.forEach(row => {
        console.log(`   ✓ ${row.TABLE_NAME}.${row.COLUMN_NAME} -> ${row.REFERENCED_TABLE_NAME}.${row.REFERENCED_COLUMN_NAME}`)
      })
    }

    await sequelize.close()
  } catch (error) {
    console.error('❌ 检查失败:', error.message)
    process.exit(1)
  }
})()
