/**
 * 兑换订单审核回调处理器
 *
 * 功能说明：
 * - 处理兑换订单审核通过后的业务逻辑
 * - 处理兑换订单审核拒绝后的退款和库存恢复
 *
 * 业务流程：
 * - 审核通过：更新订单状态 → 创建用户库存 → 发送通知
 * - 审核拒绝：更新订单状态 → 退回积分 → 恢复商品库存 → 发送通知
 *
 * 创建时间：2025-10-11
 */

const { ExchangeRecords, UserInventory, Product } = require('../models')
const PointsService = require('../services/PointsService')
const NotificationService = require('../services/NotificationService')
const BeijingTimeHelper = require('../utils/timeHelper')

module.exports = {
  /**
   * 审核通过回调
   *
   * @param {number} exchangeId - 兑换订单ID
   * @param {Object} auditRecord - 审核记录
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<Object>} 处理结果
   */
  async approved (exchangeId, auditRecord, transaction) {
    console.log(`[兑换审核回调] 审核通过: exchange_id=${exchangeId}`)

    try {
      // 1. 获取兑换记录
      const exchange = await ExchangeRecords.findOne({
        where: { exchange_id: exchangeId },
        transaction
      })

      if (!exchange) {
        throw new Error(`兑换记录不存在: exchange_id=${exchangeId}`)
      }

      // 2. 更新兑换记录审核状态
      await exchange.update(
        {
          audit_status: 'approved',
          auditor_id: auditRecord.auditor_id,
          audit_reason: auditRecord.audit_reason,
          audited_at: BeijingTimeHelper.createDatabaseTime(),
          status: 'distributed' // 审核通过后标记为已分发
        },
        { transaction }
      )

      console.log(`[兑换审核回调] 订单状态已更新: exchange_id=${exchangeId}, status=distributed`)

      // 3. 创建用户库存（添加兑换的商品到用户库存）
      const product = exchange.product_snapshot
      const inventoryItems = []

      for (let i = 0; i < exchange.quantity; i++) {
        const inventoryItem = await UserInventory.create(
          {
            user_id: exchange.user_id,
            name: product.name,
            description: product.description,
            type: product.category === '优惠券' ? 'voucher' : 'product',
            value: exchange.total_points / exchange.quantity,
            status: 'available',
            source_type: 'exchange',
            source_id: exchange.exchange_id.toString(),
            acquired_at: BeijingTimeHelper.createDatabaseTime(),
            expires_at: product.expires_at || null
          },
          { transaction }
        )

        // 生成核销码
        await inventoryItem.generateVerificationCode()

        inventoryItems.push(inventoryItem)
      }

      console.log(
        `[兑换审核回调] 库存已创建: exchange_id=${exchangeId}, 数量=${inventoryItems.length}`
      )

      // 4. 发送审核通过通知
      try {
        await NotificationService.sendAuditApprovedNotification(
          exchange.user_id,
          {
            type: 'exchange',
            exchange_id: exchange.exchange_id,
            product_name: product.name,
            quantity: exchange.quantity
          },
          { transaction }
        )
      } catch (notifyError) {
        console.warn(`[兑换审核回调] 发送通知失败: ${notifyError.message}`)
        // 通知失败不影响审核流程
      }

      console.log(`[兑换审核回调] 审核通过处理完成: exchange_id=${exchangeId}`)

      return {
        success: true,
        inventory_items: inventoryItems
      }
    } catch (error) {
      console.error(`[兑换审核回调] 审核通过处理失败: ${error.message}`)
      throw error
    }
  },

  /**
   * 审核拒绝回调
   *
   * @param {number} exchangeId - 兑换订单ID
   * @param {Object} auditRecord - 审核记录
   * @param {Object} transaction - 数据库事务
   * @returns {Promise<Object>} 处理结果
   */
  async rejected (exchangeId, auditRecord, transaction) {
    console.log(`[兑换审核回调] 审核拒绝: exchange_id=${exchangeId}`)

    try {
      // 1. 获取兑换记录
      const exchange = await ExchangeRecords.findOne({
        where: { exchange_id: exchangeId },
        transaction
      })

      if (!exchange) {
        throw new Error(`兑换记录不存在: exchange_id=${exchangeId}`)
      }

      // 2. 更新兑换记录审核状态
      await exchange.update(
        {
          audit_status: 'rejected',
          auditor_id: auditRecord.auditor_id,
          audit_reason: auditRecord.audit_reason,
          audited_at: BeijingTimeHelper.createDatabaseTime(),
          status: 'cancelled' // 审核拒绝后标记为已取消
        },
        { transaction }
      )

      console.log(`[兑换审核回调] 订单状态已更新: exchange_id=${exchangeId}, status=cancelled`)

      // 3. 退回积分给用户（✅ 修复幂等性：移除Date.now()，使用固定格式）
      await PointsService.addPoints(exchange.user_id, exchange.total_points, {
        transaction,
        business_type: 'refund',
        business_id: `refund_exchange_${exchange.exchange_id}`, // ✅ 修复：固定格式，防止重复退款
        source_type: 'exchange_rejection',
        title: '兑换审核拒绝退款',
        description: `兑换订单${exchange.exchange_id}审核拒绝，退回${exchange.total_points}积分`,
        operator_id: auditRecord.auditor_id
      })

      console.log(
        `[兑换审核回调] 积分已退回: user_id=${exchange.user_id}, points=${exchange.total_points}`
      )

      // 4. ✅ 恢复商品库存（修复：根据space字段恢复对应的库存）
      if (exchange.product_id) {
        // 获取商品信息以确定库存恢复策略
        const product = await Product.findByPk(exchange.product_id, { transaction })

        if (product) {
          // 根据兑换时的空间和商品配置恢复库存
          const space = exchange.space || 'lucky' // 默认幸运空间

          if (space === 'premium' && product.space === 'both' && product.premium_stock !== null) {
            // 臻选空间有独立库存：恢复premium_stock
            await Product.increment('premium_stock', {
              by: exchange.quantity,
              where: { product_id: exchange.product_id },
              transaction
            })
            console.log(
              `[兑换审核回调] 臻选空间库存已恢复: product_id=${exchange.product_id}, premium_stock +${exchange.quantity}`
            )
          } else {
            // 幸运空间或共享库存：恢复stock
            await Product.increment('stock', {
              by: exchange.quantity,
              where: { product_id: exchange.product_id },
              transaction
            })
            console.log(
              `[兑换审核回调] 幸运空间库存已恢复: product_id=${exchange.product_id}, stock +${exchange.quantity}`
            )
          }
        } else {
          console.warn(`[兑换审核回调] 商品不存在，无法恢复库存: product_id=${exchange.product_id}`)
        }
      }

      // 5. 发送审核拒绝通知
      try {
        await NotificationService.sendAuditRejectedNotification(
          exchange.user_id,
          {
            type: 'exchange',
            exchange_id: exchange.exchange_id,
            product_name: exchange.product_snapshot.name,
            refunded_points: exchange.total_points,
            reason: auditRecord.audit_reason
          },
          { transaction }
        )
      } catch (notifyError) {
        console.warn(`[兑换审核回调] 发送通知失败: ${notifyError.message}`)
        // 通知失败不影响审核流程
      }

      console.log(`[兑换审核回调] 审核拒绝处理完成: exchange_id=${exchangeId}`)

      return {
        success: true,
        refunded_points: exchange.total_points
      }
    } catch (error) {
      console.error(`[兑换审核回调] 审核拒绝处理失败: ${error.message}`)
      throw error
    }
  }
}
