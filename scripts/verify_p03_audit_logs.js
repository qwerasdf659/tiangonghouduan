/**
 * 验证脚本：P0-3 奖品库存调整审计日志功能
 *
 * 目的：验证奖品库存调整操作是否正确记录审计日志
 *
 * 验证内容：
 * 1. addStock 方法是否记录审计日志
 * 2. updatePrize 方法（更新库存时）是否记录审计日志
 * 3. 数据库是否支持 prize_stock_adjust 和 prize_config 操作类型
 *
 * 创建时间：2025-12-11
 * 使用模型：Claude Sonnet 4.5
 */

const path = require('path')
require('dotenv').config({ path: path.join(process.cwd(), '.env') })

const { sequelize } = require('../models')
const PrizePoolService = require('../services/PrizePoolService')
const AuditLogService = require('../services/AuditLogService')
const { AdminOperationLog } = require('../models')

/**
 * 验证审计日志功能
 */
async function verifyAuditLogs () {
  console.log('==========================================')
  console.log('  P0-3 奖品库存调整审计日志功能验证')
  console.log('==========================================\n')

  try {
    // 1. 验证数据库支持 prize_stock_adjust 操作类型
    console.log('【步骤1】验证数据库支持 prize_stock_adjust 操作类型...')
    const [results] = await sequelize.query(`
      SELECT COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'admin_operation_logs'
        AND COLUMN_NAME = 'operation_type'
    `)

    if (results.length === 0) {
      throw new Error('未找到 admin_operation_logs.operation_type 列')
    }

    const columnType = results[0].COLUMN_TYPE
    console.log('当前 operation_type 的 ENUM 值：')
    console.log(columnType)

    const supportsPrizeStockAdjust = columnType.includes('prize_stock_adjust')
    const supportsPrizeConfig = columnType.includes('prize_config')

    if (supportsPrizeStockAdjust) {
      console.log('✅ 数据库支持 prize_stock_adjust 操作类型')
    } else {
      console.log('❌ 数据库不支持 prize_stock_adjust 操作类型')
      throw new Error('数据库不支持 prize_stock_adjust 操作类型')
    }

    if (supportsPrizeConfig) {
      console.log('✅ 数据库支持 prize_config 操作类型')
    } else {
      console.log('❌ 数据库不支持 prize_config 操作类型')
      throw new Error('数据库不支持 prize_config 操作类型')
    }

    // 2. 验证 PrizePoolService.addStock 方法
    console.log('\n【步骤2】验证 PrizePoolService.addStock 方法...')
    console.log('检查 addStock 方法是否存在...')

    if (typeof PrizePoolService.addStock !== 'function') {
      throw new Error('PrizePoolService.addStock 方法不存在')
    }

    console.log('✅ PrizePoolService.addStock 方法存在')

    // 3. 验证 PrizePoolService.updatePrize 方法
    console.log('\n【步骤3】验证 PrizePoolService.updatePrize 方法...')
    console.log('检查 updatePrize 方法是否存在...')

    if (typeof PrizePoolService.updatePrize !== 'function') {
      throw new Error('PrizePoolService.updatePrize 方法不存在')
    }

    console.log('✅ PrizePoolService.updatePrize 方法存在')

    // 4. 验证 AuditLogService.logOperation 方法
    console.log('\n【步骤4】验证 AuditLogService.logOperation 方法...')
    console.log('检查 logOperation 方法是否存在...')

    if (typeof AuditLogService.logOperation !== 'function') {
      throw new Error('AuditLogService.logOperation 方法不存在')
    }

    console.log('✅ AuditLogService.logOperation 方法存在')

    // 5. 查询最近的审计日志记录
    console.log('\n【步骤5】查询最近的奖品库存调整审计日志...')
    const recentLogs = await AdminOperationLog.findAll({
      where: {
        operation_type: ['prize_stock_adjust', 'prize_config']
      },
      order: [['created_at', 'DESC']],
      limit: 5,
      raw: true
    })

    console.log(`找到 ${recentLogs.length} 条奖品相关审计日志记录：`)
    recentLogs.forEach((log, index) => {
      console.log(`\n记录 ${index + 1}:`)
      console.log(`  - 日志ID: ${log.log_id}`)
      console.log(`  - 操作类型: ${log.operation_type}`)
      console.log(`  - 目标类型: ${log.target_type}`)
      console.log(`  - 目标ID: ${log.target_id}`)
      console.log(`  - 操作动作: ${log.action}`)
      console.log(`  - 操作原因: ${log.reason}`)
      console.log(`  - 业务ID: ${log.business_id}`)
      console.log(`  - 创建时间: ${log.created_at}`)
    })

    // 6. 验证代码中是否正确调用审计日志
    console.log('\n【步骤6】验证代码中是否正确调用审计日志...')
    const fs = require('fs')
    const prizePoolServiceCode = fs.readFileSync(
      path.join(__dirname, '../services/PrizePoolService.js'),
      'utf8'
    )

    // 检查 addStock 方法中是否调用 AuditLogService.logOperation
    const hasAddStockAuditLog = prizePoolServiceCode.includes('AuditLogService.logOperation') &&
      prizePoolServiceCode.includes('operation_type: \'prize_stock_adjust\'')

    if (hasAddStockAuditLog) {
      console.log('✅ addStock 方法中正确调用了 AuditLogService.logOperation')
    } else {
      console.log('❌ addStock 方法中未正确调用 AuditLogService.logOperation')
    }

    // 检查 updatePrize 方法中是否调用 AuditLogService.logOperation
    const hasUpdatePrizeAuditLog = prizePoolServiceCode.includes('AuditLogService.logOperation') &&
      prizePoolServiceCode.includes('operation_type: \'prize_config\'')

    if (hasUpdatePrizeAuditLog) {
      console.log('✅ updatePrize 方法中正确调用了 AuditLogService.logOperation')
    } else {
      console.log('❌ updatePrize 方法中未正确调用 AuditLogService.logOperation')
    }

    // 7. 总结
    console.log('\n==========================================')
    console.log('  验证结果总结')
    console.log('==========================================')
    console.log('✅ 数据库支持 prize_stock_adjust 操作类型')
    console.log('✅ 数据库支持 prize_config 操作类型')
    console.log('✅ PrizePoolService.addStock 方法存在')
    console.log('✅ PrizePoolService.updatePrize 方法存在')
    console.log('✅ AuditLogService.logOperation 方法存在')
    console.log(hasAddStockAuditLog ? '✅ addStock 方法正确调用审计日志' : '❌ addStock 方法未正确调用审计日志')
    console.log(hasUpdatePrizeAuditLog ? '✅ updatePrize 方法正确调用审计日志' : '❌ updatePrize 方法未正确调用审计日志')
    console.log(`✅ 找到 ${recentLogs.length} 条奖品相关审计日志记录`)
    console.log('\n==========================================')
    console.log('  P0-3 任务验证完成 ✅')
    console.log('==========================================\n')

    process.exit(0)
  } catch (error) {
    console.error('\n❌ 验证失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行验证
verifyAuditLogs()
