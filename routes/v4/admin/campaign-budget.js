/**
 * 活动预算管理模块（BUDGET_POINTS 架构）
 *
 * @description 管理活动预算配置、用户预算积分查询、奖品配置验证
 * @version 1.1.0
 * @date 2026-01-06
 *
 * 核心功能：
 * - 活动预算配置（budget_mode、pool_budget_remaining、allowed_campaign_ids）
 * - 用户 BUDGET_POINTS 余额查询
 * - 奖品配置验证（空奖约束）
 * - 活动池预算补充
 *
 * 架构原则（决策7）：
 * - 读操作（GET）可直接查库
 * - 写操作（PUT/POST）通过 Service 层，缓存失效在 Service 层处理
 * - 通过 req.app.locals.services 获取服务实例
 * - 所有资产变动必须有幂等键控制
 *
 * 更新时间：2026年01月06日 - 写操作收口到 Service 层（决策7）
 */

const express = require('express')
const router = express.Router()
const {
  sharedComponents,
  adminAuthMiddleware,
  asyncHandler,
  validators
} = require('./shared/middleware')
// 决策7：写操作通过 Service 层处理（包含缓存失效）
const AdminLotteryService = require('../../../services/AdminLotteryService')

/**
 * GET /campaigns/:campaign_id - 获取活动预算配置
 *
 * @description 获取指定活动的预算模式和配置信息
 * @route GET /api/v4/admin/campaign-budget/campaigns/:campaign_id
 * @access Private (需要管理员权限)
 *
 * @returns {Object} 活动预算配置信息
 */
router.get(
  '/campaigns/:campaign_id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id } = req.params

    try {
      if (!campaign_id || isNaN(parseInt(campaign_id))) {
        return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID')
      }

      const { LotteryCampaign, LotteryPrize } = require('../../../models')

      // 获取活动信息
      const campaign = await LotteryCampaign.findByPk(parseInt(campaign_id), {
        attributes: [
          'campaign_id',
          'campaign_code',
          'name',
          'budget_mode',
          'pool_budget_total',
          'pool_budget_remaining',
          'allowed_campaign_ids',
          'status',
          'created_at',
          'updated_at'
        ]
      })

      if (!campaign) {
        return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', { campaign_id })
      }

      // 获取奖品配置统计
      const prizeConfig = await LotteryPrize.validateCampaignBudgetConfig(parseInt(campaign_id))

      sharedComponents.logger.info('获取活动预算配置成功', {
        campaign_id,
        budget_mode: campaign.budget_mode,
        operated_by: req.user?.id
      })

      return res.apiSuccess(
        {
          campaign: campaign.toJSON(),
          prize_config: prizeConfig
        },
        '活动预算配置获取成功'
      )
    } catch (error) {
      sharedComponents.logger.error('获取活动预算配置失败', { error: error.message })
      return res.apiInternalError('获取活动预算配置失败', error.message, 'BUDGET_CONFIG_GET_ERROR')
    }
  })
)

/**
 * PUT /campaigns/:campaign_id - 更新活动预算配置
 *
 * @description 更新活动的预算模式和相关配置，通过 Service 层处理（包含缓存失效）
 * @route PUT /api/v4/admin/campaign-budget/campaigns/:campaign_id
 * @access Private (需要管理员权限)
 *
 * @body {string} budget_mode - 预算模式（user/pool/none）
 * @body {number} pool_budget_total - 活动池总预算（budget_mode=pool时使用）
 * @body {Array<string|number>} allowed_campaign_ids - 允许使用的预算来源活动ID列表
 *
 * 缓存策略（决策3/7）：
 * - 更新成功后在 Service 层精准失效活动配置缓存
 */
router.put(
  '/campaigns/:campaign_id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id } = req.params
    const { budget_mode, pool_budget_total, allowed_campaign_ids } = req.body

    try {
      if (!campaign_id || isNaN(parseInt(campaign_id))) {
        return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID')
      }

      // 决策7：通过 Service 层更新活动预算（包含缓存失效）
      const result = await AdminLotteryService.updateCampaignBudget(
        parseInt(campaign_id),
        { budget_mode, pool_budget_total, allowed_campaign_ids },
        { operated_by: req.user?.id }
      )

      sharedComponents.logger.info('活动预算配置更新成功', {
        campaign_id,
        updated_fields: result.updated_fields,
        operated_by: req.user?.id
      })

      // 重新加载活动获取最新数据
      const campaign = await result.campaign

      return res.apiSuccess(
        {
          campaign_id: parseInt(campaign_id),
          updated_fields: result.updated_fields,
          current_config: {
            budget_mode: campaign.budget_mode,
            pool_budget_total: campaign.pool_budget_total,
            pool_budget_remaining: campaign.pool_budget_remaining,
            allowed_campaign_ids: campaign.allowed_campaign_ids
          }
        },
        '活动预算配置更新成功'
      )
    } catch (error) {
      sharedComponents.logger.error('活动预算配置更新失败', { error: error.message })

      // 处理 Service 层抛出的业务错误
      if (error.code && error.statusCode) {
        return res.apiError(error.message, error.code, null, error.statusCode)
      }

      return res.apiInternalError(
        '活动预算配置更新失败',
        error.message,
        'BUDGET_CONFIG_UPDATE_ERROR'
      )
    }
  })
)

/**
 * POST /campaigns/:campaign_id/validate - 验证活动奖品配置
 *
 * @description 验证活动的奖品池配置是否符合 BUDGET_POINTS 架构要求
 * @route POST /api/v4/admin/campaign-budget/campaigns/:campaign_id/validate
 * @access Private (需要管理员权限)
 *
 * 验证规则：
 * - 空奖约束：必须至少有一个 prize_value_points = 0 的空奖
 * - 空奖必须有大于0的中奖概率
 */
router.post(
  '/campaigns/:campaign_id/validate',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id } = req.params

    try {
      if (!campaign_id || isNaN(parseInt(campaign_id))) {
        return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID')
      }

      const { LotteryPrize, LotteryCampaign } = require('../../../models')

      // 验证活动存在
      const campaign = await LotteryCampaign.findByPk(parseInt(campaign_id))
      if (!campaign) {
        return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', { campaign_id })
      }

      // 验证空奖约束
      const emptyPrizeResult = await LotteryPrize.validateEmptyPrizeConstraint(
        parseInt(campaign_id)
      )

      // 获取完整的预算配置验证结果
      const budgetConfigResult = await LotteryPrize.validateCampaignBudgetConfig(
        parseInt(campaign_id)
      )

      const validationResult = {
        campaign_id: parseInt(campaign_id),
        campaign_name: campaign.name,
        budget_mode: campaign.budget_mode,
        empty_prize_constraint: {
          valid: emptyPrizeResult.valid,
          error: emptyPrizeResult.error || null,
          empty_prizes: emptyPrizeResult.emptyPrizes || []
        },
        prize_config: budgetConfigResult,
        overall_valid: emptyPrizeResult.valid && budgetConfigResult.valid
      }

      sharedComponents.logger.info('活动奖品配置验证完成', {
        campaign_id,
        overall_valid: validationResult.overall_valid,
        operated_by: req.user?.id
      })

      if (validationResult.overall_valid) {
        return res.apiSuccess(validationResult, '活动奖品配置验证通过')
      } else {
        return res.apiSuccess(validationResult, '活动奖品配置验证未通过，请检查配置')
      }
    } catch (error) {
      sharedComponents.logger.error('活动奖品配置验证失败', { error: error.message })
      return res.apiInternalError(
        '活动奖品配置验证失败',
        error.message,
        'PRIZE_CONFIG_VALIDATE_ERROR'
      )
    }
  })
)

/**
 * GET /users/:user_id - 获取用户预算积分余额
 *
 * @description 获取用户在各活动的 BUDGET_POINTS 余额
 * @route GET /api/v4/admin/campaign-budget/users/:user_id
 * @access Private (需要管理员权限)
 */
router.get(
  '/users/:user_id',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { user_id } = req.params

    try {
      const validUserId = validators.validateUserId(user_id)

      const { Account, AccountAssetBalance, User } = require('../../../models')

      // 验证用户存在
      const user = await User.findByPk(validUserId, {
        attributes: ['user_id', 'nickname', 'mobile']
      })

      if (!user) {
        return res.apiError('用户不存在', 'USER_NOT_FOUND', { user_id: validUserId })
      }

      // 获取用户账户
      const account = await Account.findOne({
        where: { user_id: validUserId, account_type: 'user' }
      })

      if (!account) {
        // 用户没有账户，返回空余额
        return res.apiSuccess(
          {
            user: user.toJSON(),
            budget_balances: [],
            total_budget_points: 0
          },
          '用户预算积分查询成功'
        )
      }

      // 查询用户所有 BUDGET_POINTS 余额（按 campaign_id 分组）
      const budgetBalances = await AccountAssetBalance.findAll({
        where: {
          account_id: account.account_id,
          asset_code: 'BUDGET_POINTS'
        },
        attributes: [
          'balance_id',
          'campaign_id',
          'available_amount',
          'frozen_amount',
          'created_at',
          'updated_at'
        ],
        order: [['campaign_id', 'ASC']]
      })

      // 计算总预算积分
      const totalBudgetPoints = budgetBalances.reduce(
        (sum, b) => sum + Number(b.available_amount) + Number(b.frozen_amount),
        0
      )

      sharedComponents.logger.info('用户预算积分查询成功', {
        user_id: validUserId,
        balance_count: budgetBalances.length,
        total_budget_points: totalBudgetPoints,
        operated_by: req.user?.id
      })

      return res.apiSuccess(
        {
          user: user.toJSON(),
          budget_balances: budgetBalances.map(b => ({
            balance_id: b.balance_id,
            campaign_id: b.campaign_id,
            available_amount: Number(b.available_amount),
            frozen_amount: Number(b.frozen_amount),
            total_amount: Number(b.available_amount) + Number(b.frozen_amount),
            created_at: b.created_at,
            updated_at: b.updated_at
          })),
          total_budget_points: totalBudgetPoints
        },
        '用户预算积分查询成功'
      )
    } catch (error) {
      sharedComponents.logger.error('用户预算积分查询失败', { error: error.message })
      return res.apiInternalError('用户预算积分查询失败', error.message, 'USER_BUDGET_QUERY_ERROR')
    }
  })
)

/**
 * POST /campaigns/:campaign_id/pool/add - 补充活动池预算
 *
 * @description 为活动池模式的活动补充预算，通过 Service 层处理（包含缓存失效）
 * @route POST /api/v4/admin/campaign-budget/campaigns/:campaign_id/pool/add
 * @access Private (需要管理员权限)
 *
 * @body {number} amount - 补充金额（必须为正数）
 * @body {string} reason - 补充原因
 *
 * 缓存策略（决策3/7）：
 * - 补充成功后在 Service 层精准失效活动配置缓存
 */
router.post(
  '/campaigns/:campaign_id/pool/add',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id } = req.params
    const { amount, reason } = req.body

    try {
      if (!campaign_id || isNaN(parseInt(campaign_id))) {
        return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID')
      }

      if (!reason || reason.trim().length === 0) {
        return res.apiError('必须提供补充原因', 'MISSING_REASON')
      }

      // 决策7：通过 Service 层补充预算（包含缓存失效）
      const result = await AdminLotteryService.supplementCampaignBudget(
        parseInt(campaign_id),
        amount,
        { operated_by: req.user?.id }
      )

      sharedComponents.logger.info('活动池预算补充成功', {
        campaign_id,
        amount,
        reason: reason.trim(),
        operated_by: req.user?.id
      })

      return res.apiSuccess(
        {
          campaign_id: parseInt(campaign_id),
          campaign_name: result.campaign.name,
          amount_added: result.amount,
          new_remaining: result.new_remaining,
          new_total: result.new_total,
          reason: reason.trim()
        },
        '活动池预算补充成功'
      )
    } catch (error) {
      sharedComponents.logger.error('活动池预算补充失败', { error: error.message })

      // 处理 Service 层抛出的业务错误
      if (error.code && error.statusCode) {
        return res.apiError(error.message, error.code, null, error.statusCode)
      }

      return res.apiInternalError('活动池预算补充失败', error.message, 'POOL_BUDGET_ADD_ERROR')
    }
  })
)

/**
 * GET /campaigns/:campaign_id/budget-status - 获取活动预算使用状态
 *
 * @description 获取活动的预算使用情况统计
 * @route GET /api/v4/admin/campaign-budget/campaigns/:campaign_id/budget-status
 * @access Private (需要管理员权限)
 */
router.get(
  '/campaigns/:campaign_id/budget-status',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { campaign_id } = req.params

    try {
      if (!campaign_id || isNaN(parseInt(campaign_id))) {
        return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID')
      }

      const { LotteryCampaign, LotteryDraw, sequelize } = require('../../../models')
      const { Op } = require('sequelize')

      // 获取活动
      const campaign = await LotteryCampaign.findByPk(parseInt(campaign_id), {
        attributes: [
          'campaign_id',
          'name',
          'budget_mode',
          'pool_budget_total',
          'pool_budget_remaining',
          'status'
        ]
      })

      if (!campaign) {
        return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', { campaign_id })
      }

      // 统计预算使用情况（从抽奖记录汇总）
      const budgetStats = await LotteryDraw.findAll({
        where: {
          campaign_id: parseInt(campaign_id),
          prize_value_points: { [Op.gt]: 0 }
        },
        attributes: [
          [sequelize.fn('COUNT', sequelize.col('draw_id')), 'draw_count'],
          [sequelize.fn('SUM', sequelize.col('prize_value_points')), 'total_budget_consumed']
        ],
        raw: true
      })

      const stats = budgetStats[0] || { draw_count: 0, total_budget_consumed: 0 }

      const result = {
        campaign_id: campaign.campaign_id,
        campaign_name: campaign.name,
        budget_mode: campaign.budget_mode,
        pool_budget: {
          total: Number(campaign.pool_budget_total) || 0,
          remaining: Number(campaign.pool_budget_remaining) || 0,
          used:
            (Number(campaign.pool_budget_total) || 0) -
            (Number(campaign.pool_budget_remaining) || 0),
          usage_rate:
            campaign.pool_budget_total > 0
              ? (
                  (((campaign.pool_budget_total || 0) - (campaign.pool_budget_remaining || 0)) /
                    campaign.pool_budget_total) *
                  100
                ).toFixed(2) + '%'
              : 'N/A'
        },
        statistics: {
          winning_draws: parseInt(stats.draw_count) || 0,
          total_budget_consumed: parseInt(stats.total_budget_consumed) || 0
        }
      }

      sharedComponents.logger.info('活动预算状态查询成功', {
        campaign_id,
        budget_mode: campaign.budget_mode,
        operated_by: req.user?.id
      })

      return res.apiSuccess(result, '活动预算状态查询成功')
    } catch (error) {
      sharedComponents.logger.error('活动预算状态查询失败', { error: error.message })
      return res.apiInternalError(
        '活动预算状态查询失败',
        error.message,
        'BUDGET_STATUS_QUERY_ERROR'
      )
    }
  })
)

module.exports = router
