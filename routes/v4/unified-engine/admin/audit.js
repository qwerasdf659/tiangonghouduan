/**
 * 餐厅积分抽奖系统 V4.0 - 兑换审核管理API
 * 处理大额交易的人工审核功能
 *
 * 功能说明：
 * - 获取待审核兑换列表
 * - 审核通过
 * - 审核拒绝
 * - 查看审核历史
 *
 * 创建时间：2025年09月30日
 * 使用模型：Claude Sonnet 4
 */

const BeijingTimeHelper = require('../../../../utils/timeHelper')
const express = require('express')
const router = express.Router()
const models = require('../../../../models')
const ApiResponse = require('../../../../utils/ApiResponse')
const { authenticateToken, requireAdmin } = require('../../../../middleware/auth')
const Logger = require('../../../../services/UnifiedLotteryEngine/utils/Logger')
const { Op } = require('sequelize')
const auditLogMiddleware = require('../../../../middleware/auditLog')

const logger = new Logger('AuditAPI')

/**
 * 获取待审核兑换列表
 * GET /api/v4/admin/audit/pending
 */
router.get('/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 20 } = req.query

    // 获取待审核兑换记录
    const pendingAudits = await models.ExchangeRecords.findPendingAudits(parseInt(limit))

    // 统计待审核数量
    const pendingCount = await models.ExchangeRecords.count({
      where: {
        requires_audit: true,
        audit_status: 'pending'
      }
    })

    logger.info('获取待审核列表成功', {
      admin_id: req.user.user_id,
      pending_count: pendingCount,
      returned: pendingAudits.length
    })

    return ApiResponse.success(
      res,
      {
        pending_count: pendingCount,
        items: pendingAudits.map(record => {
          const data = record.toJSON()
          // 从product_snapshot中提取商品信息
          const productInfo = data.product_snapshot || {}
          return {
            exchange_id: data.exchange_id,
            user: data.user,
            product_name: productInfo.name,
            product_category: productInfo.category,
            product_points: productInfo.exchange_points,
            product_snapshot: data.product_snapshot,
            quantity: data.quantity,
            total_points: data.total_points,
            exchange_code: data.exchange_code,
            exchange_time: data.exchange_time,
            space: data.space,
            requires_audit: data.requires_audit,
            audit_status: data.audit_status
          }
        })
      },
      '待审核列表获取成功'
    )
  } catch (error) {
    logger.error('获取待审核列表失败', { error: error.message, admin_id: req.user.user_id })
    return ApiResponse.error(res, '获取待审核列表失败', 500)
  }
})

/**
 * 审核通过
 * POST /api/v4/admin/audit/:exchange_id/approve
 */
router.post('/:exchange_id/approve', authenticateToken, requireAdmin, async (req, res) => {
  const transaction = await models.sequelize.transaction()

  try {
    const { exchange_id } = req.params
    const { reason } = req.body
    const auditorId = req.user.user_id

    // 1. 查找兑换记录
    const exchangeRecord = await models.ExchangeRecords.findByPk(exchange_id, { transaction })

    if (!exchangeRecord) {
      await transaction.rollback()
      return ApiResponse.error(res, '兑换记录不存在', 404)
    }

    // 2. 验证审核状态
    if (!exchangeRecord.isPendingAudit()) {
      await transaction.rollback()
      return ApiResponse.error(res, '该记录不是待审核状态', 400)
    }

    // 3. 记录审核前数据（用于审计日志）
    const beforeData = {
      exchange_id: exchangeRecord.exchange_id,
      audit_status: exchangeRecord.audit_status,
      status: exchangeRecord.status,
      total_points: exchangeRecord.total_points,
      user_id: exchangeRecord.user_id
    }

    // 4. 审核通过
    await exchangeRecord.approve(auditorId, reason)

    // 5. 记录审计日志
    await auditLogMiddleware.logExchangeAudit(
      req,
      exchangeRecord.exchange_id,
      'approve',
      beforeData,
      {
        exchange_id: exchangeRecord.exchange_id,
        audit_status: exchangeRecord.audit_status,
        status: exchangeRecord.status
      },
      reason || '审核通过'
    )

    // 6. 生成核销码并添加到用户库存
    const product = exchangeRecord.product_snapshot
    const inventoryItems = []

    for (let i = 0; i < exchangeRecord.quantity; i++) {
      const PointsService = require('../../../../services/PointsService')
      const verificationCode = PointsService.generateVerificationCode()

      const inventoryItem = await models.UserInventory.create(
        {
          user_id: exchangeRecord.user_id,
          name: product.name,
          description: product.description,
          type: product.category === '优惠券' ? 'voucher' : 'product',
          value: product.exchange_points,
          status: 'available',
          source_type: 'exchange',
          source_id: exchangeRecord.exchange_id.toString(),
          acquired_at: BeijingTimeHelper.createBeijingTime(),
          expires_at: null,
          verification_code: verificationCode,
          verification_expires_at: BeijingTimeHelper.futureTime(30 * 24 * 60 * 60 * 1000) // 30天有效期
        },
        { transaction }
      )

      inventoryItems.push(inventoryItem)
    }

    await transaction.commit()

    logger.info('审核通过成功', {
      exchange_id,
      auditor_id: auditorId,
      user_id: exchangeRecord.user_id,
      total_points: exchangeRecord.total_points
    })

    return ApiResponse.success(
      res,
      {
        exchange_id: exchangeRecord.exchange_id,
        audit_status: exchangeRecord.audit_status,
        status: exchangeRecord.status,
        audited_at: exchangeRecord.audited_at,
        inventory_items: inventoryItems.map(item => ({
          inventory_id: item.inventory_id,
          name: item.name,
          verification_code: item.verification_code
        }))
      },
      '审核通过，兑换已完成'
    )
  } catch (error) {
    await transaction.rollback()
    logger.error('审核通过失败', { error: error.message, exchange_id: req.params.exchange_id })
    return ApiResponse.error(res, error.message || '审核通过失败', 500)
  }
})

/**
 * 审核拒绝
 * POST /api/v4/admin/audit/:exchange_id/reject
 */
router.post('/:exchange_id/reject', authenticateToken, requireAdmin, async (req, res) => {
  const transaction = await models.sequelize.transaction()

  try {
    const { exchange_id } = req.params
    const { reason } = req.body
    const auditorId = req.user.user_id

    // 1. 参数验证
    if (!reason || reason.trim().length === 0) {
      await transaction.rollback()
      return ApiResponse.error(res, '审核拒绝必须提供原因', 400)
    }

    // 2. 查找兑换记录
    const exchangeRecord = await models.ExchangeRecords.findByPk(exchange_id, { transaction })

    if (!exchangeRecord) {
      await transaction.rollback()
      return ApiResponse.error(res, '兑换记录不存在', 404)
    }

    // 3. 验证审核状态
    if (!exchangeRecord.isPendingAudit()) {
      await transaction.rollback()
      return ApiResponse.error(res, '该记录不是待审核状态', 400)
    }

    // 4. 记录审核前数据（用于审计日志）
    const beforeData = {
      exchange_id: exchangeRecord.exchange_id,
      audit_status: exchangeRecord.audit_status,
      status: exchangeRecord.status,
      total_points: exchangeRecord.total_points,
      user_id: exchangeRecord.user_id
    }

    // 5. 审核拒绝
    await exchangeRecord.reject(auditorId, reason)

    // 6. 记录审计日志
    await auditLogMiddleware.logExchangeAudit(
      req,
      exchangeRecord.exchange_id,
      'reject',
      beforeData,
      {
        exchange_id: exchangeRecord.exchange_id,
        audit_status: exchangeRecord.audit_status,
        status: exchangeRecord.status
      },
      reason
    )

    // 7. 退回积分给用户
    const PointsService = require('../../../../services/PointsService')
    await PointsService.addPoints(exchangeRecord.user_id, exchangeRecord.total_points, {
      business_type: 'refund',
      source_type: 'audit_rejected',
      title: '兑换审核拒绝退款',
      description: `兑换记录${exchange_id}审核拒绝，退回${exchangeRecord.total_points}积分`,
      transaction
    })

    await transaction.commit()

    logger.info('审核拒绝成功', {
      exchange_id,
      auditor_id: auditorId,
      user_id: exchangeRecord.user_id,
      refunded_points: exchangeRecord.total_points,
      reason
    })

    return ApiResponse.success(
      res,
      {
        exchange_id: exchangeRecord.exchange_id,
        audit_status: exchangeRecord.audit_status,
        status: exchangeRecord.status,
        audited_at: exchangeRecord.audited_at,
        refunded_points: exchangeRecord.total_points
      },
      '审核拒绝，积分已退回'
    )
  } catch (error) {
    await transaction.rollback()
    logger.error('审核拒绝失败', { error: error.message, exchange_id: req.params.exchange_id })
    return ApiResponse.error(res, error.message || '审核拒绝失败', 500)
  }
})

/**
 * 查看审核历史
 * GET /api/v4/admin/audit/history
 */
router.get('/history', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, audit_status, start_date, end_date } = req.query
    // 🎯 分页安全保护：最大100条记录（管理员权限）
    const finalLimit = Math.min(parseInt(limit), 100)

    const whereClause = {
      requires_audit: true,
      audit_status: {
        [Op.in]: ['approved', 'rejected']
      },
      is_deleted: 0 // 审核历史中排除已删除的记录
    }

    // 筛选审核状态
    if (audit_status && ['approved', 'rejected'].includes(audit_status)) {
      whereClause.audit_status = audit_status
    }

    // 筛选时间范围
    if (start_date || end_date) {
      whereClause.audited_at = {}
      if (start_date) {
        whereClause.audited_at[Op.gte] = new Date(start_date)
      }
      if (end_date) {
        whereClause.audited_at[Op.lte] = new Date(end_date)
      }
    }

    const offset = (page - 1) * finalLimit

    const { count, rows: auditHistory } = await models.ExchangeRecords.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: models.User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        },
        {
          model: models.Product,
          as: 'product',
          attributes: ['product_id', 'name', 'category', 'exchange_points']
        },
        {
          model: models.User,
          as: 'auditor',
          foreignKey: 'auditor_id',
          attributes: ['user_id', 'mobile', 'nickname']
        }
      ],
      order: [['audited_at', 'DESC']],
      limit: finalLimit,
      offset
    })

    logger.info('获取审核历史成功', {
      admin_id: req.user.user_id,
      total: count,
      returned: auditHistory.length
    })

    return ApiResponse.success(
      res,
      {
        total: count,
        page: parseInt(page),
        limit: finalLimit,
        items: auditHistory.map(record => record.toJSON())
      },
      '审核历史获取成功'
    )
  } catch (error) {
    logger.error('获取审核历史失败', { error: error.message, admin_id: req.user.user_id })
    return ApiResponse.error(res, '获取审核历史失败', 500)
  }
})

module.exports = router
