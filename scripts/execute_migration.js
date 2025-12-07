/**
 * 执行数据库迁移脚本
 * 将SQL文件转换为Node.js执行
 */

const { Sequelize } = require('sequelize')
const fs = require('fs')
const path = require('path')
require('dotenv').config()

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: sql => console.log('📝', sql.substring(0, 100) + '...')
  }
)

async function executeMigration() {
  try {
    console.log('🚀 开始执行数据库迁移...\n')

    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 读取SQL文件
    const sqlFile = path.join(__dirname, '../migrations/20251206_dual_account_system.sql')
    const sqlContent = fs.readFileSync(sqlFile, 'utf8')

    // 按照语句分割（以分号结尾）
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && !s.startsWith('/*'))

    console.log(`📋 共${statements.length}条SQL语句\n`)

    // 逐条执行
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]
      if (statement.includes('SET') || statement.includes('SELECT')) {
        // 跳过SET和SELECT语句的详细日志
        await sequelize.query(statement)
      } else {
        console.log(`⚙️  执行语句 ${i + 1}/${statements.length}`)
        await sequelize.query(statement)
        console.log('✅ 完成\n')
      }
    }

    console.log('\n✅ 数据库迁移执行成功！')

    // 验证迁移结果
    console.log('\n🔍 验证迁移结果...\n')
    const [accountFields] = await sequelize.query('DESCRIBE user_points_accounts')
    const hasBudgetFields = accountFields.some(f => f.Field === 'budget_points')
    console.log(`user_points_accounts: ${hasBudgetFields ? '✅' : '❌'} 预算字段已添加`)

    const [prizeFields] = await sequelize.query('DESCRIBE lottery_prizes')
    const hasValuePoints = prizeFields.some(f => f.Field === 'prize_value_points')
    console.log(`lottery_prizes: ${hasValuePoints ? '✅' : '❌'} 价值积分字段已添加`)

    const [tables] = await sequelize.query('SHOW TABLES')
    const tableNames = tables.map(t => Object.values(t)[0])
    const hasExchangeItems = tableNames.includes('exchange_items')
    console.log(`exchange_items表: ${hasExchangeItems ? '✅' : '❌'} 已创建`)

    await sequelize.close()
    process.exit(0)
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message)
    console.error('详细错误:', error)
    process.exit(1)
  }
}

executeMigration()
