/**
 * 餐厅积分抽奖系统 V4.2 - 管理员工具：重新生成核销码
 *
 * 用途：
 * - 为物品实例重新生成核销码
 * - 用于核销码丢失或泄露的情况
 * - 取消旧订单并创建新订单
 *
 * 使用场景：
 * - 用户反馈核销码丢失
 * - 核销码疑似泄露需要更换
 * - 订单错误需要重新生成
 *
 * 使用方法：
 * node regenerate-redemption-code.js <item_instance_id> <reason>
 *
 * 示例：
 * node regenerate-redemption-code.js 12345 "用户反馈核销码丢失"
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const { sequelize, RedemptionOrder, ItemInstance } = require('../../models')
const logger = require('../../utils/logger').logger

/*
 * P1-9：RedemptionService 通过 ServiceManager 获取
 * 服务键：'redemption_order'（snake_case）
 * 注意：在 execute() 方法开始时动态获取服务
 */
let RedemptionService = null

/**
 * P1-9：初始化 ServiceManager 并获取 RedemptionService
 * @returns {Promise<Object>} RedemptionService 实例
 */
async function initializeRedemptionService() {
  if (RedemptionService) return RedemptionService
  try {
    const serviceManager = require('../../services/index')
    if (!serviceManager._initialized) {
      await serviceManager.initialize()
    }
    RedemptionService = serviceManager.getService('redemption_order')
    logger.info('RedemptionService 加载成功（P1-9 ServiceManager）')
    return RedemptionService
  } catch (error) {
    logger.error('RedemptionService 加载失败', { error: error.message })
    throw error
  }
}

/**
 * 重新生成核销码工具类
 *
 * @class RegenerateRedemptionCodeTool
 * @description 管理员工具：为物品实例重新生成核销码
 */
class RegenerateRedemptionCodeTool {
  /**
   * 重新生成核销码
   *
   * @param {number} item_instance_id - 物品实例ID
   * @param {string} reason - 重新生成原因
   * @param {number} operator_user_id - 操作员用户ID（可选）
   * @returns {Promise<Object>} 重新生成结果
   */
  static async execute(item_instance_id, reason, operator_user_id = null) {
    // P1-9：初始化 RedemptionService
    await initializeRedemptionService()

    logger.info('开始重新生成核销码', {
      item_instance_id,
      reason,
      operator_user_id
    })

    const transaction = await sequelize.transaction()

    try {
      // === 第1步：验证物品实例 ===
      const item_instance = await ItemInstance.findByPk(item_instance_id, {
        transaction
      })

      if (!item_instance) {
        throw new Error(`物品实例不存在: ${item_instance_id}`)
      }

      if (item_instance.status === 'used') {
        throw new Error('物品实例已使用，不能重新生成核销码')
      }

      if (item_instance.status === 'expired') {
        throw new Error('物品实例已过期，不能重新生成核销码')
      }

      logger.info('物品实例验证通过', {
        item_instance_id,
        status: item_instance.status,
        owner_user_id: item_instance.owner_user_id
      })

      // === 第2步：查找现有订单 ===
      const existing_orders = await RedemptionOrder.findAll({
        where: {
          item_instance_id,
          status: 'pending'
        },
        transaction
      })

      logger.info(`找到${existing_orders.length}个现有订单`, {
        item_instance_id
      })

      // === 第3步：取消现有订单 ===
      const cancelled_orders = []
      for (const order of existing_orders) {
        await order.update(
          {
            status: 'cancelled'
          },
          { transaction }
        )

        cancelled_orders.push({
          order_id: order.redemption_order_id,
          created_at: order.created_at,
          expires_at: order.expires_at
        })

        logger.info('取消现有订单', {
          order_id: order.redemption_order_id,
          item_instance_id
        })
      }

      // === 第4步：创建新订单 ===
      const new_order_result = await RedemptionService.createOrder(item_instance_id, {
        transaction
      })

      logger.info('创建新订单成功', {
        order_id: new_order_result.order.redemption_order_id,
        item_instance_id
      })

      // === 第5步：记录操作日志 ===
      const operation_log = {
        operation_type: 'regenerate_redemption_code',
        item_instance_id,
        operator_user_id,
        reason,
        cancelled_orders,
        new_order_id: new_order_result.order.redemption_order_id,
        new_code: new_order_result.code, // ⚠️ 仅在管理工具中临时记录
        timestamp: new Date().toISOString()
      }

      logger.info('核销码重新生成完成', operation_log)

      // 提交事务
      await transaction.commit()

      // === 生成报告 ===
      this._outputReport(operation_log, item_instance)

      return {
        success: true,
        item_instance_id,
        old_order_count: cancelled_orders.length,
        new_order: {
          order_id: new_order_result.order.redemption_order_id,
          code: new_order_result.code,
          expires_at: new_order_result.order.expires_at
        },
        operation_log
      }
    } catch (error) {
      // 回滚事务
      await transaction.rollback()

      logger.error('重新生成核销码失败', {
        item_instance_id,
        reason,
        error_message: error.message,
        error_stack: error.stack
      })

      throw error
    }
  }

  /**
   * 输出操作报告
   *
   * @param {Object} operation_log - 操作日志
   * @param {Object} item_instance - 物品实例
   * @private
   */
  static _outputReport(operation_log, item_instance) {
    console.log('\n' + '='.repeat(80))
    console.log('🔧 核销码重新生成报告')
    console.log('='.repeat(80))
    console.log(`操作时间: ${operation_log.timestamp}`)
    console.log(`操作原因: ${operation_log.reason}`)
    console.log('')
    console.log('📦 物品实例信息:')
    console.log(`  ID: ${item_instance.item_instance_id}`)
    console.log(`  所有者: ${item_instance.owner_user_id}`)
    console.log(`  类型: ${item_instance.item_type}`)
    console.log(`  状态: ${item_instance.status}`)
    console.log(`  名称: ${item_instance.meta?.name || 'N/A'}`)
    console.log('')
    console.log('🗑️ 取消的旧订单:')
    if (operation_log.cancelled_orders.length > 0) {
      operation_log.cancelled_orders.forEach((order, index) => {
        console.log(`  ${index + 1}. 订单ID: ${order.order_id}`)
        console.log(`     创建时间: ${order.created_at}`)
        console.log(`     过期时间: ${order.expires_at}`)
      })
    } else {
      console.log('  无')
    }
    console.log('')
    console.log('✨ 新订单信息:')
    console.log(`  订单ID: ${operation_log.new_order_id}`)
    console.log(`  核销码: ${operation_log.new_code}`)
    console.log('')
    console.log('⚠️ 重要提示:')
    console.log('  1. 新核销码已生成，请妥善保管')
    console.log('  2. 旧核销码已失效，不能再使用')
    console.log('  3. 请将新核销码告知用户')
    console.log('  4. 操作已记录在日志中')
    console.log('='.repeat(80) + '\n')
  }

  /**
   * 批量重新生成核销码
   *
   * @param {Array<number>} item_instance_ids - 物品实例ID数组
   * @param {string} reason - 重新生成原因
   * @param {number} operator_user_id - 操作员用户ID（可选）
   * @returns {Promise<Object>} 批量处理结果
   */
  static async batchExecute(item_instance_ids, reason, operator_user_id = null) {
    logger.info('开始批量重新生成核销码', {
      count: item_instance_ids.length,
      reason,
      operator_user_id
    })

    const results = {
      total: item_instance_ids.length,
      success: 0,
      failed: 0,
      details: []
    }

    for (const item_instance_id of item_instance_ids) {
      try {
        const result = await this.execute(item_instance_id, reason, operator_user_id)
        results.success++
        results.details.push({
          item_instance_id,
          status: 'success',
          new_code: result.new_order.code
        })

        logger.info('批量处理成功', { item_instance_id })
      } catch (error) {
        results.failed++
        results.details.push({
          item_instance_id,
          status: 'failed',
          error: error.message
        })

        logger.error('批量处理失败', {
          item_instance_id,
          error_message: error.message
        })
      }
    }

    // 输出批量处理报告
    this._outputBatchReport(results, reason)

    return results
  }

  /**
   * 输出批量处理报告
   *
   * @param {Object} results - 批量处理结果
   * @param {string} reason - 处理原因
   * @private
   */
  static _outputBatchReport(results, reason) {
    console.log('\n' + '='.repeat(80))
    console.log('📊 批量重新生成核销码报告')
    console.log('='.repeat(80))
    console.log(`处理原因: ${reason}`)
    console.log(`总数: ${results.total}`)
    console.log(
      `成功: ${results.success} (${((results.success / results.total) * 100).toFixed(1)}%)`
    )
    console.log(`失败: ${results.failed} (${((results.failed / results.total) * 100).toFixed(1)}%)`)
    console.log('')
    console.log('详细结果:')

    results.details.forEach((detail, index) => {
      console.log(
        `  ${index + 1}. 物品实例 ${detail.item_instance_id}: ${detail.status === 'success' ? '✅ 成功' : '❌ 失败'}`
      )

      if (detail.status === 'success') {
        console.log(`     新核销码: ${detail.new_code}`)
      } else {
        console.log(`     错误: ${detail.error}`)
      }
    })

    console.log('='.repeat(80) + '\n')
  }
}

// CLI执行
if (require.main === module) {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error('使用方法: node regenerate-redemption-code.js <item_instance_id> <reason>')
    console.error('示例: node regenerate-redemption-code.js 12345 "用户反馈核销码丢失"')
    process.exit(1)
  }

  const item_instance_id = parseInt(args[0], 10)
  const reason = args[1]

  if (isNaN(item_instance_id)) {
    console.error('错误: item_instance_id 必须是数字')
    process.exit(1)
  }

  ;(async () => {
    try {
      const result = await RegenerateRedemptionCodeTool.execute(item_instance_id, reason)

      console.log('✅ 操作成功完成')
      process.exit(0)
    } catch (error) {
      console.error('❌ 操作失败:', error.message)
      process.exit(1)
    }
  })()
}

module.exports = RegenerateRedemptionCodeTool
