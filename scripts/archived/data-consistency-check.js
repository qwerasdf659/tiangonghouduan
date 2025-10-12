/**
 * 数据一致性检查和修复脚本
 *
 * 功能：
 * 1. 检查长期待审核订单
 * 2. 检查已分发但无库存记录的订单
 * 3. 检查已取消但未退款的订单
 * 4. 自动修复数据不一致问题
 *
 * 运行方式：
 * - 定时任务：每天凌晨3点自动执行
 * - 手动执行：node scripts/data-consistency-check.js
 *
 * 创建时间：2025-10-10
 */

const { sequelize, ExchangeRecords, UserInventory } = require('../models')
const { Op, QueryTypes } = require('sequelize')
const PointsService = require('../services/PointsService')
const NotificationService = require('../services/NotificationService')
const logger = require('../utils/logger')

class DataConsistencyChecker {
  /**
   * 执行完整的数据一致性检查
   */
  static async performFullCheck () {
    logger.info('========== 开始每日数据一致性检查 ==========')

    const results = {
      timestamp: new Date().toISOString(),
      checks: [],
      fixes: [],
      errors: []
    }

    try {
      // 检查1：长期待审核订单提醒
      await this.checkLongPendingOrders(results)

      // 检查2：已分发但无库存记录
      await this.checkDistributedWithoutInventory(results)

      // 检查3：已取消但未退款
      await this.checkCancelledWithoutRefund(results)

      logger.info('========== 数据一致性检查完成 ==========')
      logger.info('检查结果摘要', {
        total_checks: results.checks.length,
        total_fixes: results.fixes.length,
        total_errors: results.errors.length
      })

      return results
    } catch (error) {
      logger.error('数据一致性检查失败', { error: error.message })
      results.errors.push({
        check: 'full_check',
        error: error.message
      })
      return results
    }
  }

  /**
   * 检查1：长期待审核订单提醒
   */
  static async checkLongPendingOrders (results) {
    try {
      logger.info('[检查1] 长期待审核订单检查...')

      const longPendingOrders = await ExchangeRecords.count({
        where: {
          audit_status: 'pending',
          exchange_time: {
            [Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24小时前
          }
        }
      })

      results.checks.push({
        name: 'long_pending_orders',
        count: longPendingOrders,
        status: longPendingOrders > 0 ? 'warning' : 'ok'
      })

      if (longPendingOrders > 0) {
        logger.warn(`⚠️ 发现${longPendingOrders}个订单待审核超过24小时`)

        // 发送提醒通知给管理员
        await NotificationService.sendToAdmins({
          type: 'pending_orders_reminder',
          title: '待审核订单提醒',
          content: `当前有${longPendingOrders}个订单待审核超过24小时，请及时处理`
        })
      } else {
        logger.info('✅ 无长期待审核订单')
      }
    } catch (error) {
      logger.error('[检查1] 长期待审核订单检查失败', { error: error.message })
      results.errors.push({
        check: 'long_pending_orders',
        error: error.message
      })
    }
  }

  /**
   * 检查2：已分发但无库存记录
   */
  static async checkDistributedWithoutInventory (results) {
    try {
      logger.info('[检查2] 已分发但无库存记录检查...')

      // 查找已分发且已审核通过但无库存的订单
      const distributedWithoutInventory = await ExchangeRecords.findAll({
        where: {
          status: 'distributed',
          audit_status: 'approved'
        },
        include: [{
          model: UserInventory,
          where: {
            source_type: 'exchange'
          },
          required: false
        }]
      })

      const missingInventory = distributedWithoutInventory.filter(
        ex => !ex.UserInventories || ex.UserInventories.length === 0
      )

      results.checks.push({
        name: 'distributed_without_inventory',
        count: missingInventory.length,
        status: missingInventory.length > 0 ? 'error' : 'ok'
      })

      if (missingInventory.length > 0) {
        logger.error(`❌ 发现${missingInventory.length}个已审核通过但未发放库存的订单`)

        // 自动修复：发放库存
        for (const exchange of missingInventory) {
          try {
            const product = exchange.product_snapshot

            for (let i = 0; i < exchange.quantity; i++) {
              await UserInventory.create({
                user_id: exchange.user_id,
                name: product.name,
                description: product.description,
                type: product.category === '优惠券' ? 'voucher' : 'product',
                value: exchange.total_points / exchange.quantity,
                status: 'available',
                source_type: 'exchange',
                source_id: exchange.exchange_id.toString(),
                acquired_at: new Date(),
                expires_at: product.expires_at || null
              })
            }

            logger.info(`✅ 已修复订单${exchange.exchange_id}的库存`)
            results.fixes.push({
              type: 'inventory_created',
              exchange_id: exchange.exchange_id,
              quantity: exchange.quantity
            })
          } catch (error) {
            logger.error(`❌ 修复订单${exchange.exchange_id}失败：${error.message}`)
            results.errors.push({
              check: 'inventory_fix',
              exchange_id: exchange.exchange_id,
              error: error.message
            })
          }
        }
      } else {
        logger.info('✅ 无已分发但缺失库存的订单')
      }
    } catch (error) {
      logger.error('[检查2] 已分发但无库存记录检查失败', { error: error.message })
      results.errors.push({
        check: 'distributed_without_inventory',
        error: error.message
      })
    }
  }

  /**
   * 检查3：已取消但未退款
   */
  static async checkCancelledWithoutRefund (results) {
    try {
      logger.info('[检查3] 已取消但未退款检查...')

      // 查询已取消但未退款的订单
      const cancelledWithoutRefund = await sequelize.query(`
        SELECT er.exchange_id, er.user_id, er.total_points
        FROM exchange_records er
        WHERE er.status = 'cancelled'
        AND er.audit_status = 'rejected'
        AND NOT EXISTS (
          SELECT 1 FROM points_transactions pt
          WHERE pt.business_type = 'refund'
          AND (
            pt.business_id = CONCAT('refund_exchange_', er.exchange_id)
            OR pt.business_id = CONCAT('cancel_exchange_', er.exchange_id)
          )
        )
      `, { type: QueryTypes.SELECT })

      results.checks.push({
        name: 'cancelled_without_refund',
        count: cancelledWithoutRefund.length,
        status: cancelledWithoutRefund.length > 0 ? 'error' : 'ok'
      })

      if (cancelledWithoutRefund.length > 0) {
        logger.error(`❌ 发现${cancelledWithoutRefund.length}个已取消但未退款的订单`)

        // 自动退款
        for (const exchange of cancelledWithoutRefund) {
          try {
            await PointsService.addPoints(exchange.user_id, exchange.total_points, {
              business_id: `refund_exchange_${exchange.exchange_id}`,
              business_type: 'refund',
              source_type: 'data_fix',
              title: '兑换拒绝补充退款',
              description: `数据修复：补充退回订单${exchange.exchange_id}的积分`
            })

            logger.info(`✅ 已补充退款订单${exchange.exchange_id}`)
            results.fixes.push({
              type: 'refund_completed',
              exchange_id: exchange.exchange_id,
              refunded_points: exchange.total_points
            })
          } catch (error) {
            logger.error(`❌ 补充退款订单${exchange.exchange_id}失败：${error.message}`)
            results.errors.push({
              check: 'refund_fix',
              exchange_id: exchange.exchange_id,
              error: error.message
            })
          }
        }
      } else {
        logger.info('✅ 无已取消但未退款的订单')
      }
    } catch (error) {
      logger.error('[检查3] 已取消但未退款检查失败', { error: error.message })
      results.errors.push({
        check: 'cancelled_without_refund',
        error: error.message
      })
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  (async () => {
    try {
      console.log('开始执行数据一致性检查...')
      const results = await DataConsistencyChecker.performFullCheck()

      console.log('\n检查结果:')
      console.log(`总检查项: ${results.checks.length}`)
      console.log(`总修复项: ${results.fixes.length}`)
      console.log(`总错误数: ${results.errors.length}`)

      if (results.errors.length > 0) {
        console.log('\n错误详情:')
        results.errors.forEach(err => {
          console.log(`  - ${err.check}: ${err.error}`)
        })
      }

      process.exit(results.errors.length > 0 ? 1 : 0)
    } catch (error) {
      console.error('执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DataConsistencyChecker
