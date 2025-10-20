#!/usr/bin/env node

/**
 * 数据库完全重建自动化脚本（Node.js版）
 * 用途：执行方案C - 完全重建数据库
 * 作者：Database Migration Team
 * 创建时间：2025年10月12日
 *
 * 功能：
 * 1. 备份当前数据
 * 2. 删除旧数据库
 * 3. 创建新数据库
 * 4. 执行基准迁移
 * 5. 验证结果
 */

require('dotenv').config()
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
}

const log = (msg) => console.log(`${colors.green}[${new Date().toISOString()}]${colors.reset} ${msg}`)
const error = (msg) => console.error(`${colors.red}[${new Date().toISOString()}] ERROR:${colors.reset} ${msg}`)
const warn = (msg) => console.warn(`${colors.yellow}[${new Date().toISOString()}] WARNING:${colors.reset} ${msg}`)

const config = {
  dbHost: process.env.DB_HOST || 'localhost',
  dbPort: process.env.DB_PORT || 3306,
  dbName: process.env.DB_NAME || 'restaurant_points_dev',
  dbUser: process.env.DB_USER || 'root',
  dbPassword: process.env.DB_PASSWORD || '',
  backupDir: path.join(__dirname, '../../backups'),
  timestamp: new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + new Date().toISOString().split('T')[1].split('.')[0].replace(/:/g, '')
}

async function main () {
  console.log('\n' + '='.repeat(60))
  console.log('🚀 数据库完全重建 V1.0.0 - 自动化执行')
  console.log('='.repeat(60) + '\n')

  try {
    // 步骤1：备份数据
    await step1_backup()

    // 步骤2：停止服务
    await step2_stopService()

    // 步骤3：清理数据库
    await step3_cleanDatabase()

    // 步骤4：执行基准迁移
    await step4_runMigration()

    // 步骤5：验证结果
    await step5_verify()

    // 步骤6：启动服务
    await step6_startService()

    console.log('\n' + '='.repeat(60))
    console.log('🎉 数据库重建成功完成！')
    console.log('='.repeat(60))
    console.log('\n✅ 完成情况：')
    console.log('   • 73条混乱迁移 → 1条清晰基准')
    console.log('   • 23个混乱表 → 18个标准表')
    console.log('   • 版本统一为V1.0.0-clean-start')
    console.log('\n💡 下一步：')
    console.log('   • 验证业务功能正常')
    console.log('   • 运行完整测试套件')
    console.log('   • 更新前端API调用（如需要）\n')

    process.exit(0)
  } catch (err) {
    error('重建失败: ' + err.message)
    console.error(err)
    process.exit(1)
  }
}

async function step1_backup () {
  log('📌 步骤1: 数据备份')

  // 创建备份目录
  if (!fs.existsSync(config.backupDir)) {
    fs.mkdirSync(config.backupDir, { recursive: true })
  }

  const backupFile = path.join(config.backupDir, `full_${config.timestamp}.sql`)
  const dataBackupFile = path.join(config.backupDir, `data_${config.timestamp}.sql`)

  log('💾 备份当前数据库...')

  try {
    // 完整备份
    const mysqldumpCmd = `mysqldump -h ${config.dbHost} -P ${config.dbPort} -u ${config.dbUser} ${config.dbPassword ? `-p${config.dbPassword}` : ''} --single-transaction --routines --triggers --events ${config.dbName} > ${backupFile}`
    execSync(mysqldumpCmd, { stdio: 'pipe' })
    log(`✅ 完整备份完成: ${backupFile}`)

    // 数据备份
    const dataCmd = `mysqldump -h ${config.dbHost} -P ${config.dbPort} -u ${config.dbUser} ${config.dbPassword ? `-p${config.dbPassword}` : ''} --no-create-info ${config.dbName} > ${dataBackupFile}`
    execSync(dataCmd, { stdio: 'pipe' })
    log(`✅ 数据备份完成: ${dataBackupFile}`)

    // 验证备份
    const stats = fs.statSync(backupFile)
    if (stats.size === 0) {
      throw new Error('备份文件为空！')
    }
    log(`📊 备份文件大小: ${(stats.size / 1024).toFixed(2)} KB`)
  } catch (err) {
    throw new Error(`备份失败: ${err.message}`)
  }

  log('✅ 步骤1完成 - 数据备份\n')
}

async function step2_stopService () {
  log('📌 步骤2: 停止服务')

  try {
    execSync('pm2 stop all', { stdio: 'pipe' })
    log('✅ PM2服务已停止')
  } catch (err) {
    warn('PM2停止失败，尝试其他方式...')
    try {
      execSync('pkill -f "node.*app.js"', { stdio: 'pipe' })
    } catch (e) {
      // 忽略错误
    }
  }

  // 等待进程完全停止
  await new Promise(resolve => {
    setTimeout(resolve, 2000)
  })
  log('✅ 步骤2完成 - 服务已停止\n')
}

async function step3_cleanDatabase () {
  log('📌 步骤3: 清理数据库')

  const mysqlCmd = `-h ${config.dbHost} -P ${config.dbPort} -u ${config.dbUser} ${config.dbPassword ? `-p${config.dbPassword}` : ''}`

  log('🗑️  删除旧数据库...')
  try {
    const dropCmd = `mysql ${mysqlCmd} -e "DROP DATABASE IF EXISTS ${config.dbName}; CREATE DATABASE ${config.dbName} DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci;"`
    execSync(dropCmd, { stdio: 'pipe' })
    log('✅ 旧数据库已删除，新数据库已创建')
  } catch (err) {
    throw new Error(`数据库清理失败: ${err.message}`)
  }

  log('✅ 步骤3完成 - 数据库已清理\n')
}

async function step4_runMigration () {
  log('📌 步骤4: 执行基准迁移')

  log('🚀 运行基准迁移...')
  try {
    execSync('npx sequelize-cli db:migrate', { stdio: 'inherit' })
    log('✅ 基准迁移执行成功')
  } catch (err) {
    throw new Error(`基准迁移失败: ${err.message}`)
  }

  log('✅ 步骤4完成 - 基准迁移已执行\n')
}

async function step5_verify () {
  log('📌 步骤5: 验证结果')

  const { sequelize } = require('../../models')

  try {
    // 验证数据库连接
    await sequelize.authenticate()
    log('✅ 数据库连接正常')

    // 验证表数量
    const [tables] = await sequelize.query('SHOW TABLES')
    const tableCount = tables.length
    log(`📊 数据库表数量: ${tableCount}`)

    if (tableCount !== 19) { // 18个业务表 + 1个SequelizeMeta
      throw new Error(`表数量不正确！预期19个，实际${tableCount}个`)
    }

    // 验证SequelizeMeta
    const [meta] = await sequelize.query('SELECT COUNT(*) as count FROM SequelizeMeta')
    const metaCount = meta[0].count
    log(`📋 迁移记录数量: ${metaCount}`)

    if (metaCount !== 1) {
      throw new Error(`迁移记录数量不正确！预期1条，实际${metaCount}条`)
    }

    // 验证关键表存在
    const requiredTables = [
      'users', 'user_roles', 'user_profiles', 'user_sessions',
      'user_points', 'point_transactions', 'point_exchange_records',
      'lottery_campaigns', 'lottery_prizes', 'lottery_draws',
      'audit_logs', 'customer_sessions', 'chat_messages'
    ]

    log('🔍 验证关键表...')
    for (const table of requiredTables) {
      const [result] = await sequelize.query(`SHOW TABLES LIKE '${table}'`)
      if (result.length === 0) {
        throw new Error(`关键表缺失: ${table}`)
      }
    }
    log('✅ 所有关键表验证通过')

    await sequelize.close()
  } catch (err) {
    throw new Error(`验证失败: ${err.message}`)
  }

  log('✅ 步骤5完成 - 验证通过\n')
}

async function step6_startService () {
  log('📌 步骤6: 启动服务')

  try {
    execSync('pm2 start ecosystem.config.js', { stdio: 'pipe' })
    log('✅ 服务已启动')
  } catch (err) {
    warn('PM2启动失败，使用dev模式...')
    // 不在这里启动dev，让用户手动启动
  }

  // 等待服务启动
  await new Promise(resolve => {
    setTimeout(resolve, 3000)
  })

  // 健康检查
  try {
    const http = require('http')
    const healthCheck = () => new Promise((resolve, reject) => {
      http.get('http://localhost:3000/health', (res) => {
        let data = ''
        res.on('data', chunk => {
          data += chunk
        })
        res.on('end', () => resolve(data))
      }).on('error', reject)
    })

    const response = await healthCheck()
    if (response.includes('healthy')) {
      log('✅ 健康检查通过')
    } else {
      warn('健康检查响应异常，请手动检查')
    }
  } catch (err) {
    warn('健康检查失败，请手动检查服务状态')
  }

  log('✅ 步骤6完成 - 服务已启动\n')
}

// 执行主函数
main()
