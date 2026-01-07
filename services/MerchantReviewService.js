/**
 * 商家审核服务（MerchantReviewService）
 *
 * 业务场景：商家扫码审核积分奖励发放
 *
 * 核心流程（2026-01-08 重构 - 奖励发放模式）：
 * 1. 商家扫码提交审核 → 创建审核记录（pending 状态）
 * 2. 审核通过 → 直接发放积分奖励 + 发放预算积分
 * 3. 审核拒绝 → 无积分操作（仅更新状态）
 *
 * 拍板决策（2026-01-08 商业模式）：
 * - submitReview 只创建审核记录，不冻结积分
 * - approveReview 直接发放积分奖励（POINTS）+ 预算积分（BUDGET_POINTS）
 * - rejectReview 只更新状态，无积分退回（因为没有预先冻结）
 * - 简化状态机：pending → approved / rejected
 *
 * 积分发放约束：
 * - 每笔发放必须绑定 review_id
 * - idempotency_key 格式：{review_id}:reward / {review_id}:budget
 * - 流水表 business_type：merchant_review_reward / merchant_review_budget
 *
 * 预算积分配置：
 * - BUDGET_POINTS 比例通过 SystemSettings 配置（merchant_review_budget_ratio）
 * - campaign_id 通过 SystemSettings 配置（merchant_review_campaign_id）
 *
 * 创建时间：2025-12-29
 * 最后更新：2026-01-08（资产语义重构：冻结→奖励发放）
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
   * 提交商家审核（创建审核记录，待审批发放奖励）
   *
   * 业务流程（2026-01-08 重构）：
   * 1. 验证用户和商家存在
   * 2. 创建审核单（pending 状态）
   * 注意：不再冻结积分，审核通过时直接发放奖励
   *
   * @param {Object} params - 参数对象
   * @param {number} params.user_id - 用户ID（待发放奖励的用户）
   * @param {number} params.merchant_id - 商家ID（扫码的商家，role_level >= 40）
   * @param {number} params.points_amount - 待发放积分金额
   * @param {string} params.qr_code_data - 二维码数据（可选）
   * @param {Object} params.metadata - 审核元数据（可选）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} { review, is_duplicate }
   */
  static async submitReview(params, options = {}) {
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

    // 2. 验证商家存在且有提交权限（role_level >= 40）
    const merchant = await User.findByPk(merchant_id, { transaction })
    if (!merchant) {
      throw new Error(`商家不存在: merchant_id=${merchant_id}`)
    }
    // 权限检查应在路由层完成，此处仅做基础验证

    /*
     * 3. 生成审核单ID和幂等键
     * 2026-01-08 修复：传递 qr_code_data 用于生成稳定的幂等键
     */
    const review_id = MerchantPointsReview.generateReviewId()
    const idempotency_key = MerchantPointsReview.generateIdempotencyKey(
      user_id,
      merchant_id,
      points_amount,
      qr_code_data // 传递二维码数据生成唯一幂等键
    )

    // 4. 检查幂等性（防止重复提交）
    const existingReview = await MerchantPointsReview.findOne({
      where: { idempotency_key },
      transaction
    })
    if (existingReview) {
      logger.info('⚠️ 重复提交审核请求，返回已存在记录', {
        review_id: existingReview.review_id,
        user_id,
        merchant_id
      })
      return {
        review: existingReview,
        is_duplicate: true
      }
    }

    /*
     * 5. 创建审核单（pending 状态）
     * 注意：2026-01-08 重构后，不再冻结积分
     */
    const review = await MerchantPointsReview.create(
      {
        review_id,
        user_id,
        merchant_id,
        points_amount,
        status: 'pending',
        expires_at: null, // 简化：不再使用超时机制
        idempotency_key,
        qr_code_data,
        metadata: {
          ...metadata,
          submit_time: new Date().toISOString(),
          merchant_name: merchant.nickname || merchant.mobile,
          semantic_version: 'reward_issuance_v1' // 标记新语义版本
        }
      },
      { transaction }
    )

    logger.info('✅ 商家审核提交成功（待审批发放奖励）', {
      review_id,
      user_id,
      merchant_id,
      points_amount
    })

    return {
      review,
      is_duplicate: false
    }
  }

  /**
   * 审核通过（发放积分奖励 + 预算积分）
   *
   * 业务流程（2026-01-08 重构 - 奖励发放模式）：
   * 1. 发放积分奖励（POINTS）
   * 2. 发放预算积分（BUDGET_POINTS，比例通过 SystemSettings 配置）
   * 3. 更新审核单状态为 approved
   *
   * @param {Object} params - 参数对象
   * @param {string} params.review_id - 审核单ID
   * @param {number} params.operator_user_id - 操作者用户ID（必须是 role_level >= 100）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} { review, reward_result, budget_result }
   */
  static async approveReview(params, options = {}) {
    const { review_id, operator_user_id } = params

    if (!review_id) {
      throw new Error('review_id 是必填参数')
    }
    if (!operator_user_id) {
      throw new Error('operator_user_id 是必填参数')
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

    // 2. 检查状态（简化：仅检查 pending）
    if (review.status !== 'pending') {
      throw new Error(`审核单状态不允许通过: status=${review.status}（仅 pending 可审批）`)
    }

    // 3. 发放积分奖励（POINTS）
    const reward_idempotency_key = `${review_id}:reward`
    const reward_result = await AssetService.changeBalance(
      {
        user_id: review.user_id,
        asset_code: 'POINTS',
        delta_amount: review.points_amount,
        business_type: 'merchant_review_reward',
        idempotency_key: reward_idempotency_key,
        meta: {
          review_id,
          merchant_id: review.merchant_id,
          reward_reason: '商家扫码审核通过奖励',
          operator_user_id
        }
      },
      { transaction }
    )

    /*
     * 4. 获取预算积分配置并发放 BUDGET_POINTS
     * 使用 AdminSystemService.getSettingValue() 读取配置（2026-01-08 修复）
     */
    const AdminSystemService = require('./AdminSystemService')
    const budgetRatio = await AdminSystemService.getSettingValue(
      'points',
      'merchant_review_budget_ratio',
      0.24
    )
    const budgetPoints = Math.round(review.points_amount * budgetRatio)
    const campaignId = await AdminSystemService.getSettingValue(
      'points',
      'merchant_review_campaign_id',
      'MERCHANT_REVIEW_DEFAULT'
    )

    let budget_result = null
    if (budgetPoints > 0) {
      const budget_idempotency_key = `${review_id}:budget`
      budget_result = await AssetService.changeBalance(
        {
          user_id: review.user_id,
          asset_code: 'BUDGET_POINTS',
          delta_amount: budgetPoints,
          business_type: 'merchant_review_budget',
          idempotency_key: budget_idempotency_key,
          campaign_id: campaignId,
          meta: {
            review_id,
            merchant_id: review.merchant_id,
            budget_reason: '商家扫码审核通过预算奖励',
            budget_ratio: budgetRatio,
            operator_user_id
          }
        },
        { transaction }
      )
    }

    // 5. 更新审核单状态
    await review.update(
      {
        status: 'approved',
        metadata: {
          ...review.metadata,
          approve_time: new Date().toISOString(),
          operator_user_id,
          reward_points: review.points_amount,
          budget_points: budgetPoints,
          budget_ratio: budgetRatio,
          campaign_id: campaignId
        }
      },
      { transaction }
    )

    logger.info('✅ 商家审核通过（奖励已发放）', {
      review_id,
      user_id: review.user_id,
      merchant_id: review.merchant_id,
      reward_points: review.points_amount,
      budget_points: budgetPoints,
      operator_user_id
    })

    return {
      review,
      reward_result,
      budget_result,
      reward_points: review.points_amount,
      budget_points: budgetPoints
    }
  }

  /**
   * 审核拒绝（仅更新状态，无积分操作）
   *
   * 业务流程（2026-01-08 重构）：
   * - 审核拒绝仅更新状态，不涉及积分操作（因为没有预先冻结）
   * - 用户可重新提交审核申请
   *
   * @param {Object} params - 参数对象
   * @param {string} params.review_id - 审核单ID
   * @param {string} params.reject_reason - 拒绝原因（必填）
   * @param {number} params.operator_user_id - 操作者用户ID（必须是 role_level >= 100）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - Sequelize事务对象
   * @returns {Promise<Object>} { review }
   */
  static async rejectReview(params, options = {}) {
    const { review_id, reject_reason, operator_user_id } = params

    if (!review_id) {
      throw new Error('review_id 是必填参数')
    }
    if (!reject_reason || reject_reason.trim().length < 5) {
      throw new Error('reject_reason 必须提供，且不少于5个字符')
    }
    if (!operator_user_id) {
      throw new Error('operator_user_id 是必填参数')
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

    // 2. 检查状态（简化：仅检查 pending）
    if (review.status !== 'pending') {
      throw new Error(`审核单状态不允许拒绝: status=${review.status}（仅 pending 可拒绝）`)
    }

    // 3. 更新审核单状态（无积分操作）
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

    logger.info('✅ 商家审核拒绝', {
      review_id,
      user_id: review.user_id,
      merchant_id: review.merchant_id,
      points_amount: review.points_amount,
      reject_reason,
      operator_user_id
    })

    return {
      review
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
  static async getUserReviews(params) {
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
  static async getMerchantReviews(params) {
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
   * 获取审核统计数据
   *
   * 2026-01-08 重构说明：
   * - 新语义只有 pending/approved/rejected 三种状态
   * - expired/cancelled 为历史遗留状态，仅用于兼容旧数据
   *
   * @returns {Promise<Object>} 统计数据
   */
  static async getReviewStats() {
    const [result] = await sequelize.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(points_amount) as total_points
      FROM merchant_points_reviews
      GROUP BY status
    `)

    // 构建统计对象
    const stats = {
      pending: { count: 0, total_points: 0 },
      approved: { count: 0, total_points: 0 },
      rejected: { count: 0, total_points: 0 },
      legacy: { count: 0, total_points: 0 } // 历史遗留状态（expired/cancelled）
    }

    result.forEach(row => {
      const status = row.status
      const count = Number(row.count)
      const totalPoints = Number(row.total_points || 0)

      if (['pending', 'approved', 'rejected'].includes(status)) {
        stats[status] = { count, total_points: totalPoints }
      } else {
        // 2026-01-08 注释：expired/cancelled 状态已废弃，此分支仅用于兼容历史数据（如有）
        stats.legacy.count += count
        stats.legacy.total_points += totalPoints
      }
    })

    return {
      stats,
      pending_count: stats.pending.count,
      approved_count: stats.approved.count,
      rejected_count: stats.rejected.count,
      legacy_count: stats.legacy.count,
      total_count:
        stats.pending.count + stats.approved.count + stats.rejected.count + stats.legacy.count
    }
  }
}

module.exports = MerchantReviewService
