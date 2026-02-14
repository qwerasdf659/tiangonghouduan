/**
 * V4.7.0 管理后台抽奖活动 CRUD 服务（LotteryCampaignCRUDService）
 *
 * 业务场景：管理员对抽奖活动的 CRUD 操作
 *
 * 核心功能：
 * 1. createCampaign - 创建抽奖活动
 * 2. updateCampaign - 更新抽奖活动
 * 3. updateCampaignStatus - 更新活动状态
 * 4. deleteCampaign - 删除抽奖活动
 *
 * 架构规范：
 * - 所有写操作通过此服务层统一处理
 * - 路由层不直接操作 LotteryCampaign 模型的写方法
 * - 路由层通过 TransactionManager.execute() 管理事务边界
 * - Service 层强制要求事务传入（模式A：外部传入事务）
 *
 * 事务边界治理（2026-02-02 确定）：
 * - 采用模式A：外部传入事务（跨服务事务天然支持、事务边界清晰）
 * - 路由层使用 TransactionManager.execute() 创建事务
 * - Service 层通过 assertAndGetTransaction() 强制验证事务存在
 *
 * 创建时间：2026-01-31
 * 拆分自：routes/v4/console/system-data.js（路由层直接操作模型）
 */

const { LotteryCampaign, LotteryPrize } = require('../../models')
const logger = require('../../utils/logger').logger
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')

/**
 * 抽奖活动 CRUD 服务类
 *
 * @class LotteryCampaignCRUDService
 * @description 封装抽奖活动的 CRUD 操作，统一写操作入口
 */
class LotteryCampaignCRUDService {
  /**
   * 创建抽奖活动
   *
   * 业务场景：
   * - 管理员创建新的抽奖活动
   * - 设置活动基本信息、时间范围、预算配置等
   *
   * @param {Object} campaignData - 活动数据
   * @param {string} campaignData.campaign_name - 活动名称（必填）
   * @param {string} campaignData.campaign_code - 活动代码（必填，唯一标识）
   * @param {string} campaignData.campaign_type - 活动类型（必填）
   * @param {string} [campaignData.description] - 活动描述
   * @param {Date} [campaignData.start_time] - 开始时间
   * @param {Date} [campaignData.end_time] - 结束时间
   * @param {string} [campaignData.status='draft'] - 活动状态
   * @param {string} [campaignData.rules_text] - 活动规则文本
   * @param {string} [campaignData.budget_mode='user'] - 预算模式
   * @param {number} [campaignData.max_draws_per_user_daily=3] - 每日最大抽奖次数
   * @param {number} [campaignData.max_draws_per_user_total] - 总最大抽奖次数
   * @param {number} [campaignData.total_prize_pool=0] - 总奖池
   * @param {number} [campaignData.remaining_prize_pool=0] - 剩余奖池
   * @param {Object} [campaignData.prize_distribution_config] - 奖品分布配置
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.operator_user_id - 操作者用户ID（必填）
   * @returns {Promise<LotteryCampaign>} 创建的活动对象
   * @throws {Error} 必填字段缺失、活动代码重复、缺少事务等
   *
   * @example
   * // 路由层使用 TransactionManager.execute() 管理事务
   * const campaign = await TransactionManager.execute(async (transaction) => {
   *   return await LotteryCampaignCRUDService.createCampaign(
   *     { campaign_name: '新年活动', campaign_code: 'NY2026', campaign_type: 'normal' },
   *     { transaction, operator_user_id: 123 }
   *   )
   * })
   */
  static async createCampaign(campaignData, options = {}) {
    // 强制要求事务（模式A：外部传入事务）
    const transaction = assertAndGetTransaction(
      options,
      'LotteryCampaignCRUDService.createCampaign'
    )
    const { operator_user_id } = options

    if (!operator_user_id) {
      throw new Error('operator_user_id 是必填参数')
    }

    // 验证必填字段
    const { campaign_name, campaign_code, campaign_type } = campaignData
    if (!campaign_name) {
      const error = new Error('活动名称不能为空')
      error.code = 'VALIDATION_ERROR'
      error.statusCode = 400
      throw error
    }
    if (!campaign_code) {
      const error = new Error('活动代码不能为空')
      error.code = 'VALIDATION_ERROR'
      error.statusCode = 400
      throw error
    }
    if (!campaign_type) {
      const error = new Error('活动类型不能为空')
      error.code = 'VALIDATION_ERROR'
      error.statusCode = 400
      throw error
    }

    logger.info('开始创建抽奖活动', {
      campaign_name,
      campaign_code,
      campaign_type,
      operator_user_id
    })

    // 检查活动代码是否已存在
    const existingCampaign = await LotteryCampaign.findOne({
      where: { campaign_code },
      transaction
    })

    if (existingCampaign) {
      const error = new Error(`活动代码 ${campaign_code} 已存在`)
      error.code = 'DUPLICATE_CAMPAIGN_CODE'
      error.statusCode = 409
      throw error
    }

    // 创建活动（含前端展示配置字段 - 2026-02-15 多活动抽奖系统）
    const campaign = await LotteryCampaign.create(
      {
        campaign_name,
        campaign_code,
        campaign_type,
        description: campaignData.description || '',
        start_time: campaignData.start_time ? new Date(campaignData.start_time) : null,
        end_time: campaignData.end_time ? new Date(campaignData.end_time) : null,
        status: campaignData.status || 'draft',
        rules_text: campaignData.rules_text || '',
        budget_mode: campaignData.budget_mode || 'user',
        max_draws_per_user_daily: campaignData.max_draws_per_user_daily || 3,
        max_draws_per_user_total: campaignData.max_draws_per_user_total || null,
        total_prize_pool: campaignData.total_prize_pool || 0,
        remaining_prize_pool: campaignData.remaining_prize_pool || 0,
        prize_distribution_config: campaignData.prize_distribution_config || { tiers: [] },
        // 前端展示配置字段（多活动抽奖系统）
        display_mode: campaignData.display_mode || 'grid_3x3',
        grid_cols: campaignData.grid_cols || 3,
        effect_theme: campaignData.effect_theme || 'default',
        rarity_effects_enabled:
          campaignData.rarity_effects_enabled !== undefined
            ? campaignData.rarity_effects_enabled
            : true,
        win_animation: campaignData.win_animation || 'simple',
        background_image_url: campaignData.background_image_url || null,
        created_by: operator_user_id
      },
      { transaction }
    )

    logger.info('创建抽奖活动成功', {
      lottery_campaign_id: campaign.lottery_campaign_id,
      campaign_name,
      campaign_code,
      operator_user_id
    })

    // ✅ 自动生成默认定价配置（决策 3：创建即可用，运营可后续修改）
    try {
      const AdminSystemService = require('../AdminSystemService')
      const { LotteryCampaignPricingConfig } = require('../../models')

      // 从 system_settings 读取全局单抽成本（运营可动态调整，非硬编码）
      let defaultBaseCost
      try {
        defaultBaseCost = await AdminSystemService.getSettingValue(
          'points',
          'lottery_cost_points',
          null,
          { strict: true }
        )
        defaultBaseCost = parseInt(defaultBaseCost, 10)
      } catch (err) {
        // 全局配置也缺失时使用安全兜底（此值仅在 system_settings 表完全为空时生效）
        logger.warn('全局 lottery_cost_points 未配置，使用兜底值 100', { error: err.message })
        defaultBaseCost = 100
      }

      // 默认档位配置（结构跟随 lottery_campaign_pricing_config.draw_buttons 规范）
      const defaultPricingConfig = {
        base_cost: defaultBaseCost,
        draw_buttons: [
          { count: 1, label: '单抽', discount: 1.0, enabled: true, sort_order: 1 },
          { count: 3, label: '3连抽', discount: 1.0, enabled: true, sort_order: 3 },
          { count: 5, label: '5连抽', discount: 1.0, enabled: true, sort_order: 5 },
          { count: 10, label: '10连抽', discount: 1.0, enabled: true, sort_order: 10 }
        ]
      }

      await LotteryCampaignPricingConfig.createNewVersion(
        campaign.lottery_campaign_id,
        defaultPricingConfig,
        operator_user_id,
        { transaction, status: 'active' } // 直接激活，创建即可用
      )

      logger.info('自动创建默认定价配置', {
        lottery_campaign_id: campaign.lottery_campaign_id,
        base_cost: defaultBaseCost,
        draw_buttons_count: defaultPricingConfig.draw_buttons.length,
        operator_user_id
      })
    } catch (pricingError) {
      // 定价创建失败不阻断活动创建（运营可手动补配）
      logger.error('自动创建默认定价配置失败', {
        lottery_campaign_id: campaign.lottery_campaign_id,
        error: pricingError.message
      })
    }

    return campaign
  }

  /**
   * 更新抽奖活动
   *
   * 业务场景：
   * - 管理员修改抽奖活动的基本信息
   * - 注意：campaign_code 不可修改
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} updateData - 更新数据（不包括 campaign_code）
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.operator_user_id - 操作者用户ID（必填）
   * @returns {Promise<LotteryCampaign>} 更新后的活动对象
   * @throws {Error} 活动不存在、缺少事务等
   *
   * @example
   * const campaign = await TransactionManager.execute(async (transaction) => {
   *   return await LotteryCampaignCRUDService.updateCampaign(
   *     123,
   *     { campaign_name: '新名称', status: 'active' },
   *     { transaction, operator_user_id: 456 }
   *   )
   * })
   */
  static async updateCampaign(lottery_campaign_id, updateData, options = {}) {
    // 强制要求事务（模式A：外部传入事务）
    const transaction = assertAndGetTransaction(
      options,
      'LotteryCampaignCRUDService.updateCampaign'
    )
    const { operator_user_id } = options

    if (!operator_user_id) {
      throw new Error('operator_user_id 是必填参数')
    }

    logger.info('开始更新抽奖活动', {
      lottery_campaign_id,
      update_fields: Object.keys(updateData),
      operator_user_id
    })

    // 查找活动
    const campaign = await LotteryCampaign.findByPk(parseInt(lottery_campaign_id), { transaction })
    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 构建更新数据（campaign_code 不可修改）
    const allowedFields = [
      'campaign_name',
      'campaign_type',
      'description',
      'start_time',
      'end_time',
      'status',
      'rules_text',
      'budget_mode',
      'max_draws_per_user_daily',
      'max_draws_per_user_total',
      'total_prize_pool',
      'remaining_prize_pool',
      'prize_distribution_config',
      // 前端展示配置字段（2026-02-15 多活动抽奖系统）
      'display_mode',
      'grid_cols',
      'effect_theme',
      'rarity_effects_enabled',
      'win_animation',
      'background_image_url'
    ]

    const filteredData = {}
    for (const field of allowedFields) {
      if (updateData[field] !== undefined) {
        // 特殊处理时间字段
        if (field === 'start_time' || field === 'end_time') {
          filteredData[field] = updateData[field] ? new Date(updateData[field]) : null
        } else {
          filteredData[field] = updateData[field]
        }
      }
    }

    if (Object.keys(filteredData).length === 0) {
      logger.warn('更新抽奖活动：无有效更新字段', { lottery_campaign_id, operator_user_id })
      return campaign
    }

    // 执行更新
    await campaign.update(filteredData, { transaction })

    // 失效缓存
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        parseInt(lottery_campaign_id),
        'campaign_updated'
      )
    } catch (cacheError) {
      logger.warn('[缓存] 活动缓存失效失败（非致命）', {
        error: cacheError.message,
        lottery_campaign_id
      })
    }

    logger.info('更新抽奖活动成功', {
      lottery_campaign_id,
      updated_fields: Object.keys(filteredData),
      operator_user_id
    })

    return campaign
  }

  /**
   * 更新抽奖活动状态
   *
   * 业务场景：
   * - 管理员单独更新活动状态（上线、暂停、结束等）
   * - 状态流转：draft → active → paused/ended
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {string} status - 新状态（draft/active/paused/ended）
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.operator_user_id - 操作者用户ID（必填）
   * @returns {Promise<LotteryCampaign>} 更新后的活动对象
   * @throws {Error} 活动不存在、状态无效、缺少事务等
   *
   * @example
   * const campaign = await TransactionManager.execute(async (transaction) => {
   *   return await LotteryCampaignCRUDService.updateCampaignStatus(
   *     123,
   *     'active',
   *     { transaction, operator_user_id: 456 }
   *   )
   * })
   */
  static async updateCampaignStatus(lottery_campaign_id, status, options = {}) {
    // 强制要求事务（模式A：外部传入事务）
    const transaction = assertAndGetTransaction(
      options,
      'LotteryCampaignCRUDService.updateCampaignStatus'
    )
    const { operator_user_id } = options

    if (!operator_user_id) {
      throw new Error('operator_user_id 是必填参数')
    }

    // 验证状态值（与数据库 ENUM 对齐：draft/active/paused/ended/cancelled）
    const validStatuses = ['draft', 'active', 'paused', 'ended', 'cancelled']
    if (!status || !validStatuses.includes(status)) {
      const error = new Error(`无效的状态值：${status}（允许值：${validStatuses.join('/')}）`)
      error.code = 'VALIDATION_ERROR'
      error.statusCode = 400
      throw error
    }

    logger.info('开始更新抽奖活动状态', {
      lottery_campaign_id,
      new_status: status,
      operator_user_id
    })

    // 查找活动
    const campaign = await LotteryCampaign.findByPk(parseInt(lottery_campaign_id), { transaction })
    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    const oldStatus = campaign.status

    // 执行更新
    await campaign.update({ status }, { transaction })

    // 失效缓存
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        parseInt(lottery_campaign_id),
        `status_change_${oldStatus}_to_${status}`
      )
    } catch (cacheError) {
      logger.warn('[缓存] 活动缓存失效失败（非致命）', {
        error: cacheError.message,
        lottery_campaign_id
      })
    }

    logger.info('更新抽奖活动状态成功', {
      lottery_campaign_id,
      old_status: oldStatus,
      new_status: status,
      operator_user_id
    })

    return campaign
  }

  /**
   * 删除抽奖活动
   *
   * 业务场景：
   * - 管理员删除不再使用的抽奖活动
   * - 如果活动下存在奖品，则不允许删除（数据完整性保护）
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.operator_user_id - 操作者用户ID（必填）
   * @returns {Promise<Object>} 删除结果 { lottery_campaign_id, campaign_name, deleted: true }
   * @throws {Error} 活动不存在、存在关联数据、缺少事务等
   *
   * @example
   * const result = await TransactionManager.execute(async (transaction) => {
   *   return await LotteryCampaignCRUDService.deleteCampaign(
   *     123,
   *     { transaction, operator_user_id: 456 }
   *   )
   * })
   */
  static async deleteCampaign(lottery_campaign_id, options = {}) {
    // 强制要求事务（模式A：外部传入事务）
    const transaction = assertAndGetTransaction(
      options,
      'LotteryCampaignCRUDService.deleteCampaign'
    )
    const { operator_user_id } = options

    if (!operator_user_id) {
      throw new Error('operator_user_id 是必填参数')
    }

    logger.info('开始删除抽奖活动', { lottery_campaign_id, operator_user_id })

    // 查找活动
    const campaign = await LotteryCampaign.findByPk(parseInt(lottery_campaign_id), { transaction })
    if (!campaign) {
      const error = new Error('活动不存在')
      error.code = 'NOT_FOUND'
      error.statusCode = 404
      throw error
    }

    // 检查是否有关联的奖品
    const prizeCount = await LotteryPrize.count({
      where: { lottery_campaign_id: parseInt(lottery_campaign_id) },
      transaction
    })

    if (prizeCount > 0) {
      const error = new Error(`活动下存在 ${prizeCount} 个奖品，无法删除`)
      error.code = 'HAS_RELATED_DATA'
      error.statusCode = 400
      error.data = { prize_count: prizeCount }
      throw error
    }

    const campaignName = campaign.campaign_name

    // 执行硬删除
    await campaign.destroy({ transaction })

    // 失效缓存
    try {
      await BusinessCacheHelper.invalidateLotteryCampaign(
        parseInt(lottery_campaign_id),
        'campaign_deleted'
      )
    } catch (cacheError) {
      logger.warn('[缓存] 活动缓存失效失败（非致命）', {
        error: cacheError.message,
        lottery_campaign_id
      })
    }

    logger.info('删除抽奖活动成功', {
      lottery_campaign_id,
      campaign_name: campaignName,
      operator_user_id
    })

    return {
      lottery_campaign_id: parseInt(lottery_campaign_id),
      campaign_name: campaignName,
      deleted: true
    }
  }
}

module.exports = LotteryCampaignCRUDService
