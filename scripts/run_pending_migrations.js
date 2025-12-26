/**
 * 执行指定迁移脚本
 * 用于解决Sequelize CLI循环依赖问题
 * 直接执行迁移文件的up方法
 */
'use strict'

require('dotenv').config()
const path = require('path')
const { Sequelize } = require('sequelize')

async function runSpecificMigration(migrationName) {
  console.log('=== 数据库迁移执行工具 ===\n')
  console.log(
    '数据库:',
    process.env.DB_HOST + ':' + process.env.DB_PORT + '/' + process.env.DB_NAME
  )

  // 创建独立的Sequelize实例
  const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      dialect: 'mysql',
      logging: false
    }
  )

  try {
    // 测试连接
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    const queryInterface = sequelize.getQueryInterface()

    // 检查迁移是否已执行
    const [executed] = await sequelize.query(
      `
      SELECT name FROM SequelizeMeta WHERE name = :name
    `,
      {
        replacements: { name: migrationName }
      }
    )

    if (executed.length > 0) {
      console.log('⚠️ 迁移已执行过:', migrationName)
      await sequelize.close()
      process.exit(0)
    }

    // 加载并执行迁移
    const migrationPath = path.join(__dirname, '../migrations', migrationName)
    console.log('正在执行迁移:', migrationName)
    console.log('---')

    const migration = require(migrationPath)
    await migration.up(queryInterface, Sequelize)

    // 记录迁移已执行
    await sequelize.query(
      `
      INSERT INTO SequelizeMeta (name) VALUES (:name)
    `,
      {
        replacements: { name: migrationName }
      }
    )

    console.log('---')
    console.log('✅ 迁移执行成功并已记录')

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message)
    console.error('详细信息:', error.stack)
    await sequelize.close()
    process.exit(1)
  }
}

// 从命令行参数获取迁移名称，默认执行幂等性修复迁移
const migrationName =
  process.argv[2] ||
  '20251226100000-add-idempotency-key-lottery-session-id-to-asset-transactions.js'
runSpecificMigration(migrationName)
