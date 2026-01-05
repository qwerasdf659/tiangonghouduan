/**
 * 活动预算管理模块（BUDGET_POINTS 架构）
 *
 * @description 管理活动预算配置、用户预算积分查询、奖品配置验证
 * @version 1.0.0
 * @date 2026-01-03
 *
 * 核心功能：
 * - 活动预算配置（budget_mode、pool_budget_remaining、allowed_campaign_ids）
 * - 用户 BUDGET_POINTS 余额查询
 * - 奖品配置验证（空奖约束）
 * - 活动池预算补充
 *
 * 架构原则：
 * - 路由层不直连 models（所有数据库操作通过 Service 层）
 * - 通过 req.app.locals.services 获取服务实例
 * - 所有资产变动必须有幂等键控制
 */

const express = require('express')
const router = express.Router()
const {
  sharedComponents,
  adminAuthMiddleware,
  asyncHandler,
  validators
} = require('./shared/middleware')
const TransactionManager = require('../../../utils/TransactionManager')

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
 * @description 更新活动的预算模式和相关配置
 * @route PUT /api/v4/admin/campaign-budget/campaigns/:campaign_id
 * @access Private (需要管理员权限)
 *
 * @body {string} budget_mode - 预算模式（user/pool/none）
 * @body {number} pool_budget_total - 活动池总预算（budget_mode=pool时使用）
 * @body {Array<string|number>} allowed_campaign_ids - 允许使用的预算来源活动ID列表
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

      // 验证 budget_mode
      const validBudgetModes = ['user', 'pool', 'none']
      if (budget_mode && !validBudgetModes.includes(budget_mode)) {
        return res.apiError(
          `无效的预算模式：${budget_mode}，有效值：${validBudgetModes.join(', ')}`,
          'INVALID_BUDGET_MODE'
        )
      }

      const { LotteryCampaign } = require('../../../models')

      // 获取活动
      const campaign = await LotteryCampaign.findByPk(parseInt(campaign_id))
      if (!campaign) {
        return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', { campaign_id })
      }

      // 构建更新数据
      const updateData = {}

      if (budget_mode) {
        updateData.budget_mode = budget_mode

        // 如果切换到 pool 模式，需要设置初始预算
        if (budget_mode === 'pool') {
          if (pool_budget_total && pool_budget_total > 0) {
            updateData.pool_budget_total = pool_budget_total
            updateData.pool_budget_remaining = pool_budget_total // 初始剩余等于总预算
          } else if (!campaign.pool_budget_total) {
            return res.apiError(
              '切换到活动池预算模式时，必须设置 pool_budget_total',
              'MISSING_POOL_BUDGET'
            )
          }
        }
      }

      if (pool_budget_total !== undefined && pool_budget_total >= 0) {
        updateData.pool_budget_total = pool_budget_total
        // 如果调整总预算，同步调整剩余预算（仅在增加时）
        const currentRemaining = Number(campaign.pool_budget_remaining) || 0
        const currentTotal = Number(campaign.pool_budget_total) || 0
        const usedBudget = currentTotal - currentRemaining
        updateData.pool_budget_remaining = Math.max(0, pool_budget_total - usedBudget)
      }

      if (allowed_campaign_ids !== undefined) {
        // 验证格式：必须是数组或 null
        if (allowed_campaign_ids !== null && !Array.isArray(allowed_campaign_ids)) {
          return res.apiError('allowed_campaign_ids 必须是数组或 null', 'INVALID_ALLOWED_CAMPAIGNS')
        }
        updateData.allowed_campaign_ids = allowed_campaign_ids
      }

      if (Object.keys(updateData).length === 0) {
        return res.apiError('未提供任何更新字段', 'NO_UPDATE_DATA')
      }

      // 执行更新
      await campaign.update(updateData)

      sharedComponents.logger.info('活动预算配置更新成功', {
        campaign_id,
        updated_fields: Object.keys(updateData),
        operated_by: req.user?.id
      })

      return res.apiSuccess(
        {
          campaign_id: campaign.campaign_id,
          updated_fields: Object.keys(updateData),
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
 * @description 为活动池模式的活动补充预算
 * @route POST /api/v4/admin/campaign-budget/campaigns/:campaign_id/pool/add
 * @access Private (需要管理员权限)
 *
 * @body {number} amount - 补充金额（必须为正数）
 * @body {string} reason - 补充原因
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

      if (!amount || amount <= 0) {
        return res.apiError('补充金额必须为正数', 'INVALID_AMOUNT')
      }

      if (!reason || reason.trim().length === 0) {
        return res.apiError('必须提供补充原因', 'MISSING_REASON')
      }

      const { LotteryCampaign } = require('../../../models')

      // 使用 TransactionManager 保护事务
      const result = await TransactionManager.execute(
        async transaction => {
          // 获取活动（加锁）
          const campaign = await LotteryCampaign.findByPk(parseInt(campaign_id), {
            lock: transaction.LOCK.UPDATE,
            transaction
          })

          if (!campaign) {
            throw new Error('活动不存在')
          }

          if (campaign.budget_mode !== 'pool') {
            throw new Error(`活动不是活动池预算模式（当前模式：${campaign.budget_mode}）`)
          }

          const oldTotal = Number(campaign.pool_budget_total) || 0
          const oldRemaining = Number(campaign.pool_budget_remaining) || 0

          // 更新预算
          await campaign.update(
            {
              pool_budget_total: oldTotal + amount,
              pool_budget_remaining: oldRemaining + amount
            },
            { transaction }
          )

          return {
            campaign_id: campaign.campaign_id,
            campaign_name: campaign.name,
            amount_added: amount,
            old_total: oldTotal,
            new_total: oldTotal + amount,
            old_remaining: oldRemaining,
            new_remaining: oldRemaining + amount,
            reason: reason.trim()
          }
        },
        { description: 'campaign_budget_pool_add' }
      )

      sharedComponents.logger.info('活动池预算补充成功', {
        campaign_id,
        amount,
        reason: reason.trim(),
        operated_by: req.user?.id
      })

      return res.apiSuccess(result, '活动池预算补充成功')
    } catch (error) {
      sharedComponents.logger.error('活动池预算补充失败', { error: error.message })

      if (error.message === '活动不存在') {
        return res.apiError(error.message, 'CAMPAIGN_NOT_FOUND', { campaign_id })
      }

      if (error.message.includes('不是活动池预算模式')) {
        return res.apiError(error.message, 'INVALID_BUDGET_MODE')
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
