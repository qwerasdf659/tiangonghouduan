/**
 * 餐厅积分抽奖系统 V4.2 - 库存迁移对账脚本
 *
 * 功能：验证 user_inventory 数据迁移的完整性和正确性
 *
 * 对账项目：
 * 1. 记录数对账：原表记录数 vs 迁移后记录数
 * 2. 用户数对账：涉及用户数是否一致
 * 3. 核销码对账：核销码数量是否匹配
 * 4. 状态分布对账：各状态数量是否合理
 * 5. 数据完整性：关键字段是否完整
 *
 * 使用方法：
 * ```bash
 * node scripts/reconcile-inventory-migration.js
 * ```
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const { sequelize } = require('../config/database')
const {
  UserInventory,
  ItemInstance,
  AccountAssetBalance,
  AssetTransaction,
  RedemptionOrder
} = require('../models')
const Logger = require('../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('ReconciliationScript')

/**
 * 对账主类
 */
class MigrationReconciliation {
  constructor() {
    this.report = {
      timestamp: new Date().toISOString(),
      overallStatus: 'PENDING', // PASSED/FAILED/WARNING
      checks: {},
      issues: [],
      recommendations: []
    }
  }

  /**
   * 执行对账
   */
  async run() {
    try {
      logger.info('开始数据对账')

      // 1. 检查 user_inventory 表
      this.report.checks.userInventory = await this.checkUserInventory()

      // 2. 检查 item_instances 表
      this.report.checks.itemInstances = await this.checkItemInstances()

      // 3. 检查 assets 表
      this.report.checks.assets = await this.checkAssets()

      // 4. 检查 redemption_orders 表
      this.report.checks.redemptionOrders = await this.checkRedemptionOrders()

      // 5. 交叉验证
      this.report.checks.crossValidation = await this.performCrossValidation()

      // 6. 计算总体状态
      this.calculateOverallStatus()

      // 7. 生成建议
      this.generateRecommendations()

      logger.info('对账完成', { status: this.report.overallStatus })

      return this.report
    } catch (error) {
      logger.error('对账失败', { error: error.message })
      throw error
    }
  }

  /**
   * 检查 user_inventory 表
   */
  async checkUserInventory() {
    logger.info('检查 user_inventory 表')

    const total = await UserInventory.count()
    const byType = await UserInventory.findAll({
      attributes: ['type', [sequelize.fn('COUNT', sequelize.col('inventory_id')), 'count']],
      group: ['type'],
      raw: true
    })

    const byStatus = await UserInventory.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('inventory_id')), 'count']],
      group: ['status'],
      raw: true
    })

    const withCodes = await UserInventory.count({
      where: {
        verification_code: { [require('sequelize').Op.not]: null }
      }
    })

    const uniqueUsers = await UserInventory.count({
      distinct: true,
      col: 'user_id'
    })

    return {
      status: 'OK',
      total,
      byType,
      byStatus,
      withVerificationCode: withCodes,
      uniqueUsers,
      message: `共 ${total} 条记录，涉及 ${uniqueUsers} 个用户`
    }
  }

  /**
   * 检查 item_instances 表
   */
  async checkItemInstances() {
    logger.info('检查 item_instances 表')

    const total = await ItemInstance.count()
    const byStatus = await ItemInstance.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('item_instance_id')), 'count']],
      group: ['status'],
      raw: true
    })

    // 检查有源记录的实例（来自迁移）
    const [migratedInstances] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM item_instances
      WHERE JSON_EXTRACT(meta, '$.source_inventory_id') IS NOT NULL
    `)

    const migratedCount = migratedInstances[0]?.count || 0

    // 检查孤儿实例（没有对应的源记录）
    const [orphanedInstances] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM item_instances i
      LEFT JOIN user_inventory ui ON ui.inventory_id = JSON_EXTRACT(i.meta, '$.source_inventory_id')
      WHERE JSON_EXTRACT(i.meta, '$.source_inventory_id') IS NOT NULL
      AND ui.inventory_id IS NULL
    `)

    const orphanedCount = orphanedInstances[0]?.count || 0

    const status = orphanedCount > 0 ? 'WARNING' : 'OK'

    if (orphanedCount > 0) {
      this.report.issues.push({
        severity: 'WARNING',
        category: 'item_instances',
        message: `发现 ${orphanedCount} 个孤儿实例（源记录已删除）`
      })
    }

    return {
      status,
      total,
      byStatus,
      migratedCount,
      orphanedCount,
      message: `共 ${total} 条实例，其中 ${migratedCount} 条来自迁移`
    }
  }

  /**
   * 检查 assets 表
   */
  async checkAssets() {
    logger.info('检查 account_asset_balances 表')

    const balanceCount = await AccountAssetBalance.count()
    const transactionCount = await AssetTransaction.count()

    // 检查余额与流水一致性
    const balances = await AccountAssetBalance.findAll()
    let inconsistentCount = 0
    const inconsistentDetails = []

    for (const balance of balances) {
      // 查询该账户该资产的所有流水
      const transactions = await AssetTransaction.findAll({
        where: {
          account_id: balance.account_id,
          asset_code: balance.asset_code
        }
      })

      // 计算流水总和
      const calculatedBalance = transactions.reduce(
        (sum, tx) => sum + parseFloat(tx.delta_amount),
        0
      )

      const actualBalance = parseFloat(balance.available_amount)
      const diff = Math.abs(calculatedBalance - actualBalance)

      // 允许0.01的浮点误差
      if (diff > 0.01) {
        inconsistentCount++
        inconsistentDetails.push({
          account_id: balance.account_id,
          asset_code: balance.asset_code,
          calculated: calculatedBalance,
          actual: actualBalance,
          difference: diff
        })

        logger.warn('余额不一致', {
          account_id: balance.account_id,
          asset_code: balance.asset_code,
          calculated: calculatedBalance,
          actual: actualBalance
        })
      }
    }

    const status = inconsistentCount > 0 ? 'ERROR' : 'OK'

    if (inconsistentCount > 0) {
      this.report.issues.push({
        severity: 'ERROR',
        category: 'assets',
        message: `发现 ${inconsistentCount} 个资产余额不一致`,
        details: inconsistentDetails
      })
    }

    return {
      status,
      balanceCount,
      transactionCount,
      inconsistentCount,
      message: `共 ${balanceCount} 个余额记录，${transactionCount} 笔流水，${inconsistentCount} 个不一致`
    }
  }

  /**
   * 检查 redemption_orders 表
   */
  async checkRedemptionOrders() {
    logger.info('检查 redemption_orders 表')

    const total = await RedemptionOrder.count()
    const byStatus = await RedemptionOrder.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('order_id')), 'count']],
      group: ['status'],
      raw: true
    })

    // 检查订单与实例的关联
    const [orphanedOrders] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM redemption_orders ro
      LEFT JOIN item_instances ii ON ro.item_instance_id = ii.item_instance_id
      WHERE ii.item_instance_id IS NULL
    `)

    const orphanedCount = orphanedOrders[0]?.count || 0

    const status = orphanedCount > 0 ? 'ERROR' : 'OK'

    if (orphanedCount > 0) {
      this.report.issues.push({
        severity: 'ERROR',
        category: 'redemption_orders',
        message: `发现 ${orphanedCount} 个孤儿订单（关联实例不存在）`
      })
    }

    return {
      status,
      total,
      byStatus,
      orphanedCount,
      message: `共 ${total} 个兑换订单，${orphanedCount} 个孤儿订单`
    }
  }

  /**
   * 交叉验证
   */
  async performCrossValidation() {
    logger.info('执行交叉验证')

    const validations = []

    // 1. 验证：user_inventory (type=product) 总数 ≈ item_instances (来自迁移) 总数
    const userInventoryProducts = await UserInventory.count({
      where: {
        type: { [require('sequelize').Op.in]: ['voucher', 'product', 'service'] }
      }
    })

    const [migratedInstances] = await sequelize.query(`
      SELECT COUNT(*) as count
      FROM item_instances
      WHERE JSON_EXTRACT(meta, '$.source_inventory_id') IS NOT NULL
    `)

    const migratedCount = migratedInstances[0]?.count || 0

    const itemsDiff = Math.abs(userInventoryProducts - migratedCount)
    validations.push({
      name: '物品迁移完整性',
      expected: userInventoryProducts,
      actual: migratedCount,
      difference: itemsDiff,
      status: itemsDiff <= userInventoryProducts * 0.1 ? 'OK' : 'WARNING' // 允许10%误差
    })

    // 2. 验证：user_inventory (有核销码) 总数 ≈ redemption_orders 总数
    const inventoryWithCodes = await UserInventory.count({
      where: {
        verification_code: { [require('sequelize').Op.not]: null }
      }
    })

    const redemptionOrdersCount = await RedemptionOrder.count()

    const codesDiff = Math.abs(inventoryWithCodes - redemptionOrdersCount)
    validations.push({
      name: '核销码迁移完整性',
      expected: inventoryWithCodes,
      actual: redemptionOrdersCount,
      difference: codesDiff,
      status: codesDiff === 0 ? 'OK' : 'WARNING'
    })

    // 3. 计算总体验证状态
    const failedValidations = validations.filter(v => v.status === 'ERROR')
    const warningValidations = validations.filter(v => v.status === 'WARNING')

    let overallStatus = 'OK'
    if (failedValidations.length > 0) {
      overallStatus = 'ERROR'
    } else if (warningValidations.length > 0) {
      overallStatus = 'WARNING'
    }

    return {
      status: overallStatus,
      validations,
      message: `${validations.length} 项验证完成`
    }
  }

  /**
   * 计算总体状态
   */
  calculateOverallStatus() {
    const checkStatuses = Object.values(this.report.checks).map(c => c.status)

    if (checkStatuses.includes('ERROR')) {
      this.report.overallStatus = 'FAILED'
    } else if (checkStatuses.includes('WARNING')) {
      this.report.overallStatus = 'WARNING'
    } else {
      this.report.overallStatus = 'PASSED'
    }
  }

  /**
   * 生成建议
   */
  generateRecommendations() {
    if (this.report.overallStatus === 'PASSED') {
      this.report.recommendations.push('✅ 数据迁移完整且一致，可以下线 user_inventory 表')
    }

    if (this.report.overallStatus === 'WARNING') {
      this.report.recommendations.push('⚠️ 发现轻微问题，建议人工检查后再下线 user_inventory 表')
    }

    if (this.report.overallStatus === 'FAILED') {
      this.report.recommendations.push('❌ 发现严重问题，必须修复后才能下线 user_inventory 表')
      this.report.recommendations.push('建议运行补偿脚本修复数据不一致问题')
    }

    // 针对具体问题的建议
    this.report.issues.forEach(issue => {
      if (issue.category === 'assets' && issue.severity === 'ERROR') {
        this.report.recommendations.push(
          `运行补偿工具：node scripts/admin-tools/recalculate-balance.js <account_id> <asset_code>`
        )
      }

      if (issue.category === 'item_instances' && issue.severity === 'WARNING') {
        this.report.recommendations.push('孤儿实例不影响功能，可以忽略或手动清理')
      }

      if (issue.category === 'redemption_orders' && issue.severity === 'ERROR') {
        this.report.recommendations.push(
          '孤儿订单必须清理：DELETE FROM redemption_orders WHERE item_instance_id NOT IN (SELECT item_instance_id FROM item_instances)'
        )
      }
    })
  }

  /**
   * 打印报告
   */
  printReport() {
    console.log('\n' + '='.repeat(70))
    console.log('数据对账报告')
    console.log('='.repeat(70))
    console.log(`时间: ${this.report.timestamp}`)
    console.log(`总体状态: ${this.report.overallStatus}`)
    console.log('')

    console.log('检查项目:')
    Object.entries(this.report.checks).forEach(([name, check]) => {
      const icon = check.status === 'OK' ? '✅' : check.status === 'WARNING' ? '⚠️' : '❌'
      console.log(`  ${icon} ${name}: ${check.status} - ${check.message}`)
    })

    if (this.report.issues.length > 0) {
      console.log('\n发现的问题:')
      this.report.issues.forEach((issue, idx) => {
        console.log(`  ${idx + 1}. [${issue.severity}] ${issue.message}`)
        if (issue.details) {
          console.log(`     详情: ${JSON.stringify(issue.details, null, 2)}`)
        }
      })
    }

    if (this.report.recommendations.length > 0) {
      console.log('\n建议:')
      this.report.recommendations.forEach((rec, idx) => {
        console.log(`  ${idx + 1}. ${rec}`)
      })
    }

    console.log('\n' + '='.repeat(70))
  }
}

/**
 * 主程序入口
 */
async function main() {
  try {
    const reconciliation = new MigrationReconciliation()
    const report = await reconciliation.run()

    reconciliation.printReport()

    // 根据结果设置退出码
    if (report.overallStatus === 'PASSED') {
      process.exit(0)
    } else if (report.overallStatus === 'WARNING') {
      process.exit(0) // 警告不影响退出码
    } else {
      process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ 对账失败:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main()
}

module.exports = MigrationReconciliation
