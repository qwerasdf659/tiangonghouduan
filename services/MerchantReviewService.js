/**
 * 商家审核服务（MerchantReviewService）
 *
 * 业务场景：商家扫码审核冻结积分
 *
 * 核心流程：
 * 1. 商家扫码提交审核 → 冻结用户积分
 * 2. 审核通过 → 从冻结结算（真正扣款）
 * 3. 审核拒绝 → 积分仍冻结（需客服处理）
 * 4. 审核超时 → 推进状态到 expired，告警客服（不自动解冻）
 *
 * 拍板决策（商业模式核心）：
 * - 只要没审核通过就不可以增加到可用积分中
 * - 冻结会无限期存在，接受用户资产长期不可用
 * - 审核拒绝/超时：积分不退回，需客服手工处理
 *
 * 冻结归属约束：
 * - 每笔冻结必须绑定 review_id
 * - idempotency_key 格式：{review_id}:freeze
 * - 流水表 business_type：merchant_review_freeze/merchant_review_settle 等
 *
 * 创建时间：2025-12-29
 * 使用模型：Claude Opus 4.5
 */

'use strict'

const { MerchantPointsReview, User, sequelize } = require('../models')
const AssetService = require('./AssetService')
const logger = require('../utils/logger')
const { Op } = require('sequelize')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')

/**
 * 商家审核服务类
 *
 * @class MerchantReviewService
 * @description 商家扫码审核冻结积分的完整业务流程
 */
class MerchantReviewService {
  /**
   * 提交商家审核（冻结积分）
   *
   * 业务流程：
   * 1. 创建审核单（pending 状态）
   * 2. 冻结用户积分
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（被审核的用户）
   * @param {number} params.merchant_id - 商家ID（扫码的商家）
   * @param {number} params.points_amount - 审核积分金额
   * @param {string} params.qr_code_data - 二维码数据（可选）
   * @param {Object} params.metadata - 审核元数据（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} { review, freeze_result }
   */
  static async submitReview (params, options = {}) {
    const { user_id, merchant_id, points_amount, qr_code_data, metadata = {} } = params

    // 参数验证
    if (!user_id) {
      throw new Error('user_id 是必填参数')
    }
    if (!merchant_id) {
      throw new Error('merchant_id 是必填参数')
    }
    if (!points_amount || points_amount <= 0) {
      throw new Error('points_amount 必须大于 0')
    }

    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'MerchantReviewService.submitReview')

    // 1. 验证用户存在
    const user = await User.findByPk(user_id, { transaction })
    if (!user) {
      throw new Error(`用户不存在: user_id=${user_id}`)
    }

    // 2. 验证商家存在
    const merchant = await User.findByPk(merchant_id, { transaction })
    if (!merchant) {
      throw new Error(`商家不存在: merchant_id=${merchant_id}`)
    }

    // 3. 生成审核单ID和幂等键
    const review_id = MerchantPointsReview.generateReviewId()
    const idempotency_key = MerchantPointsReview.generateIdempotencyKey(
      user_id,
      merchant_id,
      points_amount
    )

    // 4. 创建审核单（pending 状态）
    const review = await MerchantPointsReview.create(
      {
        review_id,
        user_id,
        merchant_id,
        points_amount,
        status: 'pending',
        expires_at: MerchantPointsReview.calculateExpiresAt(),
        idempotency_key,
        qr_code_data,
        metadata: {
          ...metadata,
          submit_time: new Date().toISOString(),
          merchant_name: merchant.nickname || merchant.mobile
        }
      },
      { transaction }
    )

    // 5. 冻结用户积分（归属约束：review_id）
    const freeze_idempotency_key = MerchantPointsReview.generateFreezeIdempotencyKey(review_id)

    const freeze_result = await AssetService.freeze(
      {
        user_id,
        asset_code: 'POINTS',
        amount: points_amount,
        business_type: 'merchant_review_freeze',
        idempotency_key: freeze_idempotency_key,
        meta: {
          review_id,
          merchant_id,
          freeze_reason: '商家扫码审核冻结'
        }
      },
      { transaction }
    )

    logger.info('✅ 商家审核提交成功', {
      review_id,
      user_id,
      merchant_id,
      points_amount,
      expires_at: review.expires_at
    })

    return {
      review,
      freeze_result,
      is_duplicate: false
    }
  }

  /**
   * 审核通过（从冻结结算）
   *
   * 业务流程：
   * 1. 从冻结余额结算（frozen ↓，真正扣款完成）
   * 2. 更新审核单状态为 approved
   *
   * @param {Object} params - 参数对象
   * @param {string} params.review_id - 审核单ID
   * @param {number} params.operator_user_id - 操作者用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} { review, settle_result }
   */
  static async approveReview (params, options = {}) {
    const { review_id, operator_user_id } = params

    if (!review_id) {
      throw new Error('review_id 是必填参数')
    }

    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'MerchantReviewService.approveReview')

    // 1. 获取审核单（加锁）
    const review = await MerchantPointsReview.findByPk(review_id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!review) {
      throw new Error(`审核单不存在: review_id=${review_id}`)
    }

    // 2. 检查状态
    if (!review.canApprove()) {
      if (review.isExpired()) {
        throw new Error(`审核单已超时，无法通过: review_id=${review_id}`)
      }
      throw new Error(`审核单状态不允许通过: status=${review.status}`)
    }

    // 3. 从冻结结算（真正扣款）
    const settle_idempotency_key = MerchantPointsReview.generateSettleIdempotencyKey(review_id)

    const settle_result = await AssetService.settleFromFrozen(
      {
        user_id: review.user_id,
        asset_code: 'POINTS',
        amount: review.points_amount,
        business_type: 'merchant_review_settle',
        idempotency_key: settle_idempotency_key,
        meta: {
          review_id,
          merchant_id: review.merchant_id,
          settle_reason: '审核通过结算',
          operator_user_id
        }
      },
      { transaction }
    )

    // 4. 更新审核单状态
    await review.update(
      {
        status: 'approved',
        metadata: {
          ...review.metadata,
          approve_time: new Date().toISOString(),
          operator_user_id
        }
      },
      { transaction }
    )

    logger.info('✅ 商家审核通过', {
      review_id,
      user_id: review.user_id,
      merchant_id: review.merchant_id,
      points_amount: review.points_amount,
      operator_user_id
    })

    return {
      review,
      settle_result
    }
  }

  /**
   * 审核拒绝（积分仍冻结，需客服处理）
   *
   * 拍板决策：审核拒绝后积分不退回，仍保持冻结状态，需客服手工处理
   *
   * @param {Object} params - 参数对象
   * @param {string} params.review_id - 审核单ID
   * @param {string} params.reject_reason - 拒绝原因
   * @param {number} params.operator_user_id - 操作者用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} { review, frozen_points }
   */
  static async rejectReview (params, options = {}) {
    const { review_id, reject_reason, operator_user_id } = params

    if (!review_id) {
      throw new Error('review_id 是必填参数')
    }

    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'MerchantReviewService.rejectReview')

    // 1. 获取审核单（加锁）
    const review = await MerchantPointsReview.findByPk(review_id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!review) {
      throw new Error(`审核单不存在: review_id=${review_id}`)
    }

    // 2. 检查状态
    if (!review.canReject()) {
      throw new Error(`审核单状态不允许拒绝: status=${review.status}`)
    }

    // 3. 拍板决策：积分不退回（仍冻结），只更新审核单状态
    await review.update(
      {
        status: 'rejected',
        metadata: {
          ...review.metadata,
          reject_time: new Date().toISOString(),
          reject_reason,
          operator_user_id
        }
      },
      { transaction }
    )

    // 4. 记录警告日志（需客服处理）
    logger.warn('⚠️ 审核拒绝，积分仍冻结（需客服处理）', {
      review_id,
      user_id: review.user_id,
      frozen_points: review.points_amount,
      reject_reason,
      operator_user_id
    })

    return {
      review,
      frozen_points: review.points_amount
    }
  }

  /**
   * 扫描并处理超时审核单
   *
   * 拍板决策：仅推进状态到 expired 并告警，不自动解冻
   *
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} { timeout_count, reviews, action }
   */
  static async alertTimeoutReviews (options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'MerchantReviewService.alertTimeoutReviews')

    // 1. 查找超时的审核单
    const timeoutReviews = await MerchantPointsReview.findAll({
      where: {
        status: 'pending',
        expires_at: { [Op.lt]: new Date() }
      },
      transaction
    })

    if (timeoutReviews.length === 0) {
      return {
        timeout_count: 0,
        reviews: [],
        action: 'no_timeout_reviews'
      }
    }

    // 2. 推进状态到 expired（不解冻）
    const processedReviews = []

    for (const review of timeoutReviews) {
      // eslint-disable-next-line no-await-in-loop
      await review.update(
        {
          status: 'expired',
          metadata: {
            ...review.metadata,
            expire_time: new Date().toISOString(),
            expire_reason: '审核超时未处理'
          }
        },
        { transaction }
      )

      processedReviews.push({
        review_id: review.review_id,
        user_id: review.user_id,
        merchant_id: review.merchant_id,
        points_amount: review.points_amount,
        created_at: review.created_at,
        expires_at: review.expires_at
      })
    }

    // 3. 发送告警日志（可扩展：企业微信/钉钉告警）
    logger.error('🚨 检测到超时审核单（积分仍冻结，需客服处理）', {
      timeout_count: processedReviews.length,
      review_ids: processedReviews.map(r => r.review_id),
      total_frozen_points: processedReviews.reduce((sum, r) => sum + Number(r.points_amount), 0)
    })

    return {
      timeout_count: processedReviews.length,
      reviews: processedReviews,
      action: 'alert_only_no_unfreeze'
    }
  }

  /**
   * 客服手工处理冻结积分
   *
   * 唯一出口：解冻退回（用户无责）或从冻结作废（用户违约）
   *
   * @param {Object} params - 参数对象
   * @param {string} params.review_id - 审核单ID
   * @param {string} params.action - 处理动作：unfreeze（解冻退回）或 confiscate（从冻结作废）
   * @param {number} params.admin_user_id - 客服用户ID
   * @param {string} params.handle_reason - 处理原因
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} { review, action, result }
   */
  static async adminHandleFrozenReview (params, options = {}) {
    const { review_id, action, admin_user_id, handle_reason } = params

    if (!review_id) {
      throw new Error('review_id 是必填参数')
    }
    if (!['unfreeze', 'confiscate'].includes(action)) {
      throw new Error('action 必须是 \'unfreeze\' 或 \'confiscate\'')
    }
    if (!admin_user_id) {
      throw new Error('admin_user_id 是必填参数')
    }

    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'MerchantReviewService.adminHandleFrozenReview')

    // 1. 获取审核单
    const review = await MerchantPointsReview.findByPk(review_id, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!review) {
      throw new Error(`审核单不存在: review_id=${review_id}`)
    }

    // 2. 检查状态：只能处理 rejected/expired 状态的审核单
    if (!review.needsAdminHandle()) {
      throw new Error(`只能处理 rejected/expired 状态的审核单（当前状态: ${review.status}）`)
    }

    let result

    if (action === 'unfreeze') {
      // 3a. 解冻退回（用户无责/系统异常）
      const unfreeze_idempotency_key =
        MerchantPointsReview.generateUnfreezeIdempotencyKey(review_id)

      result = await AssetService.unfreeze(
        {
          user_id: review.user_id,
          asset_code: 'POINTS',
          amount: review.points_amount,
          business_type: 'merchant_review_admin_unfreeze',
          idempotency_key: unfreeze_idempotency_key,
          meta: {
            review_id,
            admin_user_id,
            admin_action: 'unfreeze',
            handle_reason
          }
        },
        { transaction }
      )

      logger.info('✅ 客服解冻审核单积分', {
        review_id,
        user_id: review.user_id,
        points_amount: review.points_amount,
        admin_user_id,
        handle_reason
      })
    } else if (action === 'confiscate') {
      // 3b. 从冻结作废（用户违约/恶意逃单）
      const settle_idempotency_key = `${review_id}:admin_confiscate`

      result = await AssetService.settleFromFrozen(
        {
          user_id: review.user_id,
          asset_code: 'POINTS',
          amount: review.points_amount,
          business_type: 'merchant_review_admin_confiscate',
          idempotency_key: settle_idempotency_key,
          meta: {
            review_id,
            admin_user_id,
            admin_action: 'confiscate',
            handle_reason
          }
        },
        { transaction }
      )

      logger.info('✅ 客服作废审核单积分', {
        review_id,
        user_id: review.user_id,
        points_amount: review.points_amount,
        admin_user_id,
        handle_reason
      })
    }

    // 4. 更新审核单状态为 cancelled（已处理）
    await review.update(
      {
        status: 'cancelled',
        metadata: {
          ...review.metadata,
          admin_handled_at: new Date().toISOString(),
          admin_user_id,
          admin_action: action,
          handle_reason
        }
      },
      { transaction }
    )

    return {
      review,
      action,
      result
    }
  }

  /**
   * 获取用户的审核记录
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID
   * @param {string|Array} params.status - 状态筛选（可选）
   * @param {number} params.page - 页码（默认1）
   * @param {number} params.page_size - 每页数量（默认20）
   * @returns {Promise<Object>} { reviews, total, page, page_size }
   */
  static async getUserReviews (params) {
    const { user_id, status, page = 1, page_size = 20 } = params

    const where = { user_id }

    if (status) {
      where.status = Array.isArray(status) ? { [Op.in]: status } : status
    }

    const { count, rows } = await MerchantPointsReview.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    return {
      reviews: rows,
      total: count,
      page,
      page_size
    }
  }

  /**
   * 获取商家的审核记录
   *
   * @param {Object} params - 参数对象
   * @param {number} params.merchant_id - 商家ID
   * @param {string|Array} params.status - 状态筛选（可选）
   * @param {number} params.page - 页码（默认1）
   * @param {number} params.page_size - 每页数量（默认20）
   * @returns {Promise<Object>} { reviews, total, page, page_size }
   */
  static async getMerchantReviews (params) {
    const { merchant_id, status, page = 1, page_size = 20 } = params

    const where = { merchant_id }

    if (status) {
      where.status = Array.isArray(status) ? { [Op.in]: status } : status
    }

    const { count, rows } = await MerchantPointsReview.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    return {
      reviews: rows,
      total: count,
      page,
      page_size
    }
  }

  /**
   * 获取需要客服处理的审核单统计
   *
   * @returns {Promise<Object>} 统计数据
   */
  static async getNeedsHandleStats () {
    const [result] = await sequelize.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(points_amount) as total_frozen_points
      FROM merchant_points_reviews
      WHERE status IN ('rejected', 'expired')
      GROUP BY status
    `)

    return {
      needs_handle_reviews: result,
      total_count: result.reduce((sum, r) => sum + Number(r.count), 0),
      total_frozen_points: result.reduce((sum, r) => sum + Number(r.total_frozen_points || 0), 0)
    }
  }
}

module.exports = MerchantReviewService
