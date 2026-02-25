/**
 * V4.7.0 管理后台抽奖活动管理服务（CampaignService）
 *
 * 业务场景：管理员对抽奖活动的管理操作
 *
 * 核心功能：
 * 1. getActiveCampaigns - 获取活跃的抽奖活动列表
 * 2. syncCampaignStatus - 同步抽奖活动状态
 * 3. updateCampaignBudget - 更新活动预算配置
 * 4. supplementCampaignBudget - 补充活动池预算
 * 5. resetDailyWinCounts - 重置所有奖品的每日中奖次数
 *
 * 拆分日期：2026-01-31
 * 原文件：services/AdminLotteryService.js (1781行)
 */

const BeijingTimeHelper = require('../../utils/timeHelper')
const models = require('../../models')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const logger = require('../../utils/logger').logger
const { attachDisplayNames, DICT_TYPES } = require('../../utils/displayNameHelper')

/**
 * 管理后台抽奖活动管理服务类
 *
 * @class AdminLotteryCampaignService
 */
class AdminLotteryCampaignService {
  /**
   * 重置所有奖品的每日中奖次数
   *
   * @description 每日定时任务，重置所有奖品的 daily_win_count 为 0
   * @returns {Promise<Object>} 重置结果
   */
  static async resetDailyWinCounts() {
    try {
      logger.info('[批处理任务] 开始重置每日中奖次数...')

      const { LotteryPrize } = models

      // 批量更新所有奖品的daily_win_count为0
      const [updatedCount] = await LotteryPrize.update({ daily_win_count: 0 }, { where: {} })

      logger.info('[批处理任务] 每日中奖次数重置完成', {
        updated_count: updatedCount,
        timestamp: BeijingTimeHelper.now()
      })

      return {
        success: true,
        updated_count: updatedCount,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      logger.error('[批处理任务] 每日中奖次数重置失败', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 同步抽奖活动状态
   *
   * @description 定时任务，自动同步抽奖活动状态
   * - 将到达开始时间的draft状态活动更新为active
   * - 将已过结束时间的active状态活动更新为ended
   * @returns {Promise<Object>} 同步结果
   */
  static async syncCampaignStatus() {
    try {
      logger.info('[批处理任务] 开始同步活动状态...')

      const { LotteryCampaign } = models
      const { Op } = models.sequelize.Sequelize
      const now = BeijingTimeHelper.createBeijingTime()

      // 查询受影响的活动ID，用于后续精准缓存失效
      const toStartCampaigns = await LotteryCampaign.findAll({
        where: {
          status: 'draft',
          start_time: { [Op.lte]: now },
          end_time: { [Op.gte]: now }
        },
        attributes: ['lottery_campaign_id'],
        raw: true
      })

      const toEndCampaigns = await LotteryCampaign.findAll({
        where: {
          status: 'active',
          end_time: { [Op.lt]: now }
        },
        attributes: ['lottery_campaign_id'],
        raw: true
      })

      // 自动开始符合条件的活动
      const startResult = await LotteryCampaign.update(
        { status: 'active' },
        {
          where: {
            status: 'draft',
            start_time: { [Op.lte]: now },
            end_time: { [Op.gte]: now }
          }
        }
      )

      // 自动结束过期的活动
      const endResult = await LotteryCampaign.update(
        { status: 'ended' },
        {
          where: {
            status: 'active',
            end_time: { [Op.lt]: now }
          }
        }
      )

      // 精准失效受影响活动的缓存
      const invalidatedCampaigns = []
      for (const campaign of toStartCampaigns) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await BusinessCacheHelper.invalidateLotteryCampaign(
            campaign.lottery_campaign_id,
            'status_sync_started'
          )
          invalidatedCampaigns.push({
            lottery_campaign_id: campaign.lottery_campaign_id,
            action: 'started'
          })
        } catch (cacheError) {
          logger.warn('[缓存] 活动缓存失效失败（非致命）', {
            lottery_campaign_id: campaign.lottery_campaign_id,
            error: cacheError.message
          })
        }
      }
      for (const campaign of toEndCampaigns) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await BusinessCacheHelper.invalidateLotteryCampaign(
            campaign.lottery_campaign_id,
            'status_sync_ended'
          )
          invalidatedCampaigns.push({
            lottery_campaign_id: campaign.lottery_campaign_id,
            action: 'ended'
          })
        } catch (cacheError) {
          logger.warn('[缓存] 活动缓存失效失败（非致命）', {
            lottery_campaign_id: campaign.lottery_campaign_id,
            error: cacheError.message
          })
        }
      }

      logger.info('[批处理任务] 活动状态同步完成', {
        started_count: startResult[0],
        ended_count: endResult[0],
        invalidated_campaigns: invalidatedCampaigns,
        timestamp: now
      })

      return {
        success: true,
        started: startResult[0],
        ended: endResult[0],
        timestamp: now
      }
    } catch (error) {
      logger.error('[批处理任务] 活动状态同步失败', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 获取活跃的抽奖活动列表
   *
   * @param {Object} [options={}] - 查询选项
   * @param {number} [options.limit=10] - 返回数量限制
   * @param {boolean} [options.includePrizes=true] - 是否包含奖品信息
   * @returns {Promise<Array>} 活跃活动列表
   */
  static async getActiveCampaigns(options = {}) {
    try {
      const { limit = 10, includePrizes = true } = options

      logger.info('[查询任务] 开始查询活跃活动列表', { limit, includePrizes })

      const { LotteryCampaign } = models
      const { Op } = models.sequelize.Sequelize
      const now = BeijingTimeHelper.createBeijingTime()

      // 构建查询条件
      const whereClause = {
        status: 'active',
        start_time: { [Op.lte]: now },
        end_time: { [Op.gte]: now }
      }

      // 构建查询选项
      const queryOptions = {
        where: whereClause,
        order: [['start_time', 'ASC']],
        limit
      }

      // 如果需要包含奖品信息
      if (includePrizes) {
        queryOptions.include = ['prizes']
      }

      const campaigns = await LotteryCampaign.findAll(queryOptions)

      // 附加中文显示名称（status/campaign_type → _display/_color）
      const campaignData = campaigns.map(c => (c.toJSON ? c.toJSON() : c))
      await attachDisplayNames(campaignData, [
        { field: 'status', dictType: DICT_TYPES.CAMPAIGN_STATUS },
        { field: 'campaign_type', dictType: DICT_TYPES.CAMPAIGN_TYPE }
      ])

      logger.info('[查询任务] 活跃活动列表查询完成', {
        count: campaignData.length,
        limit,
        includePrizes
      })

      return campaignData
    } catch (error) {
      logger.error('[查询任务] 活跃活动列表查询失败', {
        error: error.message,
        stack: error.stack
      })
      throw error
    }
  }

  /**
   * 更新活动预算配置
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} updateData - 更新数据
   * @param {Object} [options] - 选项
   * @param {number} [options.operated_by] - 操作者ID
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} 更新结果
   */
  static async updateCampaignBudget(lottery_campaign_id, updateData, options = {}) {
    const { operated_by } = options
    const transaction = assertAndGetTransaction(
      options,
      'AdminLotteryCampaignService.updateCampaignBudget'
    )
    const { LotteryCampaign } = models

    // 验证 budget_mode
    const validBudgetModes = ['user', 'pool', 'none']
    if (updateData.budget_mode && !validBudgetModes.includes(updateData.budget_mode)) {
      const error = new Error(`无效的预算模式：${updateData.budget_mode}`)
      error.code = 'INVALID_BUDGET_MODE'
      error.statusCode = 400
      throw error
    }

    // 验证 preset_budget_policy
    if (updateData.preset_budget_policy !== undefined) {
      const validPresetBudgetPolicies = ['follow_campaign', 'pool_first', 'user_first']
      if (
        typeof updateData.preset_budget_policy !== 'string' ||
        !validPresetBudgetPolicies.includes(updateData.preset_budget_policy)
      ) {
        const error = new Error(
          `无效的预设预算扣减策略：${updateData.preset_budget_policy}（允许值：${validPresetBudgetPolicies.join('/')}）`
        )
        error.code = 'INVALID_PRESET_BUDGET_POLICY'
        error.statusCode = 400
        throw error
      }
    }

    /*
     * preset_debt_enabled 已迁移到 lottery_strategy_config.preset.debt_enabled
     * 通过 PUT /api/v4/console/lottery-campaigns/:id/strategy-config 管理
     */

    // 获取活动
    const campaign = await LotteryCampaign.findByPk(parseInt(lottery_campaign_id), { transaction })
    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 构建更新数据
    const fieldsToUpdate = {}
    const { budget_mode, pool_budget_total, allowed_campaign_ids, preset_budget_policy } =
      updateData

    if (budget_mode) {
      fieldsToUpdate.budget_mode = budget_mode

      // 如果切换到 pool 模式，需要设置初始预算
      if (budget_mode === 'pool') {
        if (pool_budget_total && pool_budget_total > 0) {
          fieldsToUpdate.pool_budget_total = pool_budget_total
          fieldsToUpdate.pool_budget_remaining = pool_budget_total
        } else if (!campaign.pool_budget_total) {
          const error = new Error('切换到活动池预算模式时，必须设置 pool_budget_total')
          error.code = 'MISSING_POOL_BUDGET'
          error.statusCode = 400
          throw error
        }
      }
    }

    if (pool_budget_total !== undefined && pool_budget_total >= 0) {
      fieldsToUpdate.pool_budget_total = pool_budget_total
      const currentRemaining = Number(campaign.pool_budget_remaining) || 0
      const currentTotal = Number(campaign.pool_budget_total) || 0
      const usedBudget = currentTotal - currentRemaining
      fieldsToUpdate.pool_budget_remaining = Math.max(0, pool_budget_total - usedBudget)
    }

    if (allowed_campaign_ids !== undefined) {
      if (allowed_campaign_ids !== null && !Array.isArray(allowed_campaign_ids)) {
        const error = new Error('allowed_campaign_ids 必须是数组或 null')
        error.code = 'INVALID_ALLOWED_CAMPAIGNS'
        error.statusCode = 400
        throw error
      }
      fieldsToUpdate.allowed_campaign_ids = allowed_campaign_ids
    }

    if (preset_budget_policy !== undefined) {
      fieldsToUpdate.preset_budget_policy = preset_budget_policy
    }

    if (Object.keys(fieldsToUpdate).length === 0) {
      const error = new Error('未提供任何更新字段')
      error.code = 'NO_UPDATE_DATA'
      error.statusCode = 400
      throw error
    }

    // 执行更新
    await campaign.update(fieldsToUpdate, { transaction })
    const reloadedCampaign = await campaign.reload({ transaction })

    // 失效缓存
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        parseInt(lottery_campaign_id),
        'campaign_budget_updated'
      )
      logger.info('[缓存] 活动配置缓存已失效', {
        lottery_campaign_id: parseInt(lottery_campaign_id),
        operated_by
      })
    } catch (cacheError) {
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        lottery_campaign_id
      })
    }

    logger.info('活动预算配置更新成功', {
      lottery_campaign_id,
      updated_fields: Object.keys(fieldsToUpdate),
      operated_by
    })

    return {
      campaign: reloadedCampaign,
      updated_fields: Object.keys(fieldsToUpdate)
    }
  }

  /**
   * 补充活动池预算
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {number} amount - 补充金额
   * @param {Object} [options] - 选项
   * @param {number} [options.operated_by] - 操作者ID
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<Object>} 补充结果
   */
  static async supplementCampaignBudget(lottery_campaign_id, amount, options = {}) {
    const { operated_by } = options
    const transaction = assertAndGetTransaction(
      options,
      'AdminLotteryCampaignService.supplementCampaignBudget'
    )
    const { LotteryCampaign } = models

    // 验证金额
    if (!amount || amount <= 0) {
      const error = new Error('补充金额必须大于0')
      error.code = 'INVALID_AMOUNT'
      error.statusCode = 400
      throw error
    }

    // 获取活动
    const campaign = await LotteryCampaign.findByPk(parseInt(lottery_campaign_id), { transaction })
    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'CAMPAIGN_NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 验证预算模式
    if (campaign.budget_mode !== 'pool') {
      const error = new Error('只有活动池预算模式才能补充预算')
      error.code = 'INVALID_BUDGET_MODE'
      error.statusCode = 400
      throw error
    }

    // 计算新的剩余预算和总预算
    const currentRemaining = Number(campaign.pool_budget_remaining) || 0
    const currentTotal = Number(campaign.pool_budget_total) || 0
    const newRemaining = currentRemaining + amount
    const newTotal = currentTotal + amount

    // 更新活动
    await campaign.update(
      {
        pool_budget_remaining: newRemaining,
        pool_budget_total: newTotal
      },
      { transaction }
    )

    // 失效缓存
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        parseInt(lottery_campaign_id),
        'campaign_budget_supplemented'
      )
      logger.info('[缓存] 活动配置缓存已失效', {
        lottery_campaign_id: parseInt(lottery_campaign_id),
        reason: 'budget_supplement',
        operated_by
      })
    } catch (cacheError) {
      logger.warn('[缓存] 活动配置缓存失效失败（非致命）', {
        error: cacheError.message,
        lottery_campaign_id
      })
    }

    logger.info('活动池预算补充成功', {
      lottery_campaign_id,
      amount,
      new_remaining: newRemaining,
      new_total: newTotal,
      operated_by
    })

    return {
      campaign: await campaign.reload({ transaction }),
      amount,
      new_remaining: newRemaining,
      new_total: newTotal
    }
  }
}

module.exports = AdminLotteryCampaignService
