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

const {
  LotteryCampaign,
  LotteryPrize,
  LotteryStrategyConfig,
  LotteryDrawQuotaRule
} = require('../../models')
const logger = require('../../utils/logger').logger
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const CampaignCodeGenerator = require('../../utils/CampaignCodeGenerator')

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
   *     { campaign_name: '新年活动', campaign_type: 'normal' },
   *     { transaction, operator_user_id: 123 }
   *   )
   *   // campaign.campaign_code => 'CAMP202602230001'（后端自动生成）
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

    // 验证必填字段（campaign_code 由后端自动生成，前端不传）
    const { campaign_name, campaign_type } = campaignData
    if (!campaign_name) {
      const error = new Error('活动名称不能为空')
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

    // 后端自动生成活动编码（忽略前端传入的值，格式：CAMP202602230001）
    const campaign_code = await CampaignCodeGenerator.generateWithRetry({ transaction })

    logger.info('开始创建抽奖活动', {
      campaign_name,
      campaign_code,
      campaign_type,
      operator_user_id
    })

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
        // 抽奖引擎核心配置（pipeline 路径分叉参数）
        pick_method: campaignData.pick_method || 'tier_first',
        preset_budget_policy: campaignData.preset_budget_policy || 'follow_campaign',
        default_quota: campaignData.default_quota ?? 0,
        quota_init_mode: campaignData.quota_init_mode || 'on_demand',
        tier_weight_scale: campaignData.tier_weight_scale ?? 1000000,
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

    // ✅ 自动生成默认策略配置（13策略活动级开关：创建即完整，每活动30条配置）
    try {
      const { LotteryStrategyConfig } = require('../../models')
      const STRATEGY_DEFAULTS = [
        { group: 'anti_empty', key: 'enabled', value: true, type: 'boolean', desc: '防连空开关' },
        {
          group: 'anti_empty',
          key: 'empty_streak_threshold',
          value: 3,
          type: 'number',
          desc: '连续空奖触发阈值'
        },
        { group: 'anti_high', key: 'enabled', value: true, type: 'boolean', desc: '防连高开关' },
        {
          group: 'anti_high',
          key: 'high_streak_threshold',
          value: 2,
          type: 'number',
          desc: '连续高价值触发阈值'
        },
        {
          group: 'anti_high',
          key: 'recent_draw_window',
          value: 5,
          type: 'number',
          desc: '近期抽奖统计窗口'
        },
        {
          group: 'budget_tier',
          key: 'threshold_high',
          value: 1000,
          type: 'number',
          desc: 'B3阈值'
        },
        { group: 'budget_tier', key: 'threshold_mid', value: 500, type: 'number', desc: 'B2阈值' },
        { group: 'budget_tier', key: 'threshold_low', value: 100, type: 'number', desc: 'B1阈值' },
        { group: 'luck_debt', key: 'enabled', value: true, type: 'boolean', desc: '运气债务开关' },
        {
          group: 'luck_debt',
          key: 'expected_empty_rate',
          value: 0.3,
          type: 'number',
          desc: '期望空奖率'
        },
        {
          group: 'luck_debt',
          key: 'min_draw_count',
          value: 10,
          type: 'number',
          desc: '最小样本量'
        },
        { group: 'matrix', key: 'enabled', value: true, type: 'boolean', desc: 'BxPx矩阵开关' },
        { group: 'pity', key: 'enabled', value: true, type: 'boolean', desc: 'Pity保底开关' },
        {
          group: 'pity',
          key: 'hard_guarantee_threshold',
          value: 10,
          type: 'number',
          desc: '硬保底阈值'
        },
        {
          group: 'pity',
          key: 'min_non_empty_cost',
          value: 10,
          type: 'number',
          desc: '最低非空奖价值'
        },
        {
          group: 'pity',
          key: 'multiplier_table',
          value: { 0: 1, 1: 1, 2: 1, 3: 1.5, 4: 2, 5: 3, 6: 4, 7: 6, 8: 8, 9: 10 },
          type: 'object',
          desc: 'Pity倍数表'
        },
        {
          group: 'pressure_tier',
          key: 'enabled',
          value: true,
          type: 'boolean',
          desc: '活动压力开关'
        },
        {
          group: 'pressure_tier',
          key: 'threshold_high',
          value: 0.8,
          type: 'number',
          desc: 'P2阈值'
        },
        {
          group: 'pressure_tier',
          key: 'threshold_low',
          value: 0.5,
          type: 'number',
          desc: 'P1阈值'
        },
        {
          group: 'management',
          key: 'enabled',
          value: true,
          type: 'boolean',
          desc: '管理干预总开关'
        },
        {
          group: 'grayscale',
          key: 'pity_percentage',
          value: 100,
          type: 'number',
          desc: 'Pity灰度百分比'
        },
        {
          group: 'grayscale',
          key: 'luck_debt_percentage',
          value: 100,
          type: 'number',
          desc: '运气债务灰度百分比'
        },
        {
          group: 'grayscale',
          key: 'anti_empty_percentage',
          value: 100,
          type: 'number',
          desc: '防连空灰度百分比'
        },
        {
          group: 'grayscale',
          key: 'anti_high_percentage',
          value: 100,
          type: 'number',
          desc: '防连高灰度百分比'
        },
        // ======== 从 lottery_campaigns 表迁移的策略参数（2026-02-24） ========
        {
          group: 'segment',
          key: 'resolver_version',
          value: 'default',
          type: 'string',
          desc: '用户分群版本'
        },
        {
          group: 'guarantee',
          key: 'enabled',
          value: false,
          type: 'boolean',
          desc: '固定间隔保底开关'
        },
        {
          group: 'guarantee',
          key: 'threshold',
          value: 10,
          type: 'number',
          desc: '保底触发间隔（每N次）'
        },
        {
          group: 'guarantee',
          key: 'prize_id',
          value: null,
          type: 'number',
          desc: '保底指定奖品ID（null=自动选最高档）'
        },
        {
          group: 'tier_fallback',
          key: 'prize_id',
          value: null,
          type: 'number',
          desc: '档位降级兜底奖品ID'
        },
        {
          group: 'preset',
          key: 'debt_enabled',
          value: false,
          type: 'boolean',
          desc: '预设队列透支开关'
        }
      ]

      const strategyRecords = STRATEGY_DEFAULTS.map(cfg => ({
        lottery_campaign_id: campaign.lottery_campaign_id,
        config_group: cfg.group,
        config_key: cfg.key,
        config_value: JSON.stringify(cfg.value),
        value_type: cfg.type,
        description: cfg.desc,
        is_active: true,
        priority: 0,
        created_by: operator_user_id,
        updated_by: operator_user_id
      }))

      await LotteryStrategyConfig.bulkCreate(strategyRecords, {
        transaction,
        ignoreDuplicates: true
      })

      logger.info('自动创建默认策略配置', {
        lottery_campaign_id: campaign.lottery_campaign_id,
        config_count: strategyRecords.length,
        operator_user_id
      })
    } catch (strategyError) {
      logger.error('自动创建默认策略配置失败', {
        lottery_campaign_id: campaign.lottery_campaign_id,
        error: strategyError.message
      })
    }

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

    // ✅ 自动同步每日抽奖次数到配额规则表（确保 max_draws_per_user_daily 真正被强制执行）
    await LotteryCampaignCRUDService._syncDailyQuotaRule(
      campaign.lottery_campaign_id,
      campaign.max_draws_per_user_daily,
      { transaction, operator_user_id }
    )

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
      // 抽奖引擎核心配置（pipeline 路径分叉参数）
      'pick_method',
      'preset_budget_policy',
      'default_quota',
      'quota_init_mode',
      'tier_weight_scale',
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

    // 如果更新了 max_draws_per_user_daily，同步到配额规则表
    if (filteredData.max_draws_per_user_daily !== undefined) {
      await LotteryCampaignCRUDService._syncDailyQuotaRule(
        parseInt(lottery_campaign_id),
        filteredData.max_draws_per_user_daily,
        { transaction, operator_user_id }
      )
    }

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

    /**
     * 激活校验：status 切换为 active 时执行全量奖品分布校验
     * tier_first 模式全量校验：
     * - 必须有至少 1 个有效奖品
     * - 每个档位至少 1 个奖品，且有库存
     * - 至少 1 个兜底奖品（is_fallback=1）
     * - 每个奖品的 win_weight 必须 > 0
     * 校验不通过则阻断激活
     */
    if (status === 'active' && oldStatus !== 'active') {
      const prizes = await LotteryPrize.findAll({
        where: {
          lottery_campaign_id: parseInt(lottery_campaign_id),
          status: 'active'
        },
        transaction
      })

      if (prizes.length === 0) {
        const error = new Error('活动没有任何有效奖品，无法激活')
        error.code = 'ACTIVATION_VALIDATION_FAILED'
        error.statusCode = 400
        throw error
      }

      const validationErrors = []

      const tierGroups = {}
      for (const p of prizes) {
        const tier = p.reward_tier || 'low'
        if (!tierGroups[tier]) tierGroups[tier] = []
        tierGroups[tier].push(p)
      }

      for (const [tier, tierPrizes] of Object.entries(tierGroups)) {
        if (tierPrizes.length === 0) {
          validationErrors.push(`档位 ${tier} 没有任何奖品`)
        }
      }

      const hasFallback = prizes.some(p => p.is_fallback === true || p.is_fallback === 1)
      if (!hasFallback) {
        validationErrors.push('缺少兜底奖品（至少 1 个奖品需设置 is_fallback=1）')
      }

      const zeroWeightPrizes = prizes.filter(p => (p.win_weight || 0) <= 0)
      if (zeroWeightPrizes.length > 0) {
        validationErrors.push(
          `${zeroWeightPrizes.length} 个奖品 win_weight ≤ 0：${zeroWeightPrizes.map(p => p.prize_name).join('、')}`
        )
      }

      const zeroStockPrizes = prizes.filter(p => {
        const remaining = (p.stock_quantity || 0) - (p.total_win_count || 0)
        return remaining <= 0
      })
      if (zeroStockPrizes.length === prizes.length) {
        validationErrors.push('所有奖品库存均已耗尽，无法激活')
      }

      if (validationErrors.length > 0) {
        const error = new Error(`活动激活校验失败：${validationErrors.join('；')}`)
        error.code = 'ACTIVATION_VALIDATION_FAILED'
        error.statusCode = 400
        throw error
      }

      logger.info('活动激活校验通过', {
        lottery_campaign_id,
        prize_count: prizes.length,
        tier_count: Object.keys(tierGroups).length,
        has_fallback: hasFallback
      })
    }

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

  /**
   * 批量更新某活动的策略配置
   *
   * @description 9策略活动级开关的配置更新（写操作收口到Service层）
   * @param {number} lottery_campaign_id - 活动ID
   * @param {Object} config - 配置对象 { config_group: { config_key: config_value } }
   * @param {Object} options - 必须包含 transaction 和 operator_user_id
   * @param {Transaction} options.transaction - Sequelize事务（模式A：外部传入）
   * @param {number} options.operator_user_id - 操作员用户ID
   * @returns {Promise<Object>} 更新结果
   */
  static async updateStrategyConfig(lottery_campaign_id, config, options = {}) {
    const transaction = assertAndGetTransaction(options, 'updateStrategyConfig')
    const { operator_user_id } = options

    if (!lottery_campaign_id || isNaN(parseInt(lottery_campaign_id))) {
      const error = new Error('无效的活动ID')
      error.code = 'INVALID_CAMPAIGN_ID'
      error.statusCode = 400
      throw error
    }

    if (!config || typeof config !== 'object') {
      const error = new Error('请求体必须包含 config 对象')
      error.code = 'INVALID_REQUEST_BODY'
      error.statusCode = 400
      throw error
    }

    const campaign_id = parseInt(lottery_campaign_id)

    const upsert_tasks = []
    for (const [config_group, group_config] of Object.entries(config)) {
      for (const [config_key, config_value] of Object.entries(group_config)) {
        upsert_tasks.push({ config_group, config_key, config_value })
      }
    }

    const updated = []
    for (const task of upsert_tasks) {
      // eslint-disable-next-line no-await-in-loop -- upsertConfig 需在同一事务内串行执行，保证幂等键唯一约束的正确性
      const record = await LotteryStrategyConfig.upsertConfig(
        task.config_group,
        task.config_key,
        task.config_value,
        { lottery_campaign_id: campaign_id, updated_by: operator_user_id, transaction }
      )
      updated.push({
        config_group: task.config_group,
        config_key: task.config_key,
        config_value: task.config_value,
        lottery_strategy_config_id: record.lottery_strategy_config_id
      })
    }

    logger.info('批量更新策略配置成功', {
      lottery_campaign_id: campaign_id,
      updated_count: updated.length,
      operator_user_id
    })

    return {
      lottery_campaign_id: campaign_id,
      updated_count: updated.length,
      updated_configs: updated
    }
  }

  /**
   * 同步活动的 max_draws_per_user_daily 到配额规则表
   *
   * 业务场景：
   * - 运营在活动编辑弹窗设置"每日最大次数"时，自动创建/更新 campaign 级配额规则
   * - 确保 LotteryQuotaService 的四维度配额体系中，campaign 级规则与活动表字段一致
   * - 消除 lottery_campaigns.max_draws_per_user_daily 与 lottery_draw_quota_rules 之间的配置分裂
   *
   * 技术实现：
   * - 使用 upsert 模式（存在则更新，不存在则创建），保证幂等
   * - scope_type='campaign'，scope_id=活动ID，window_type='daily'
   * - reason 字段标注数据来源便于运营排查
   *
   * @param {number} lottery_campaign_id - 活动ID
   * @param {number} max_draws_daily - 每日最大抽奖次数
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.operator_user_id - 操作者ID
   * @returns {Promise<void>} 无返回值，同步失败仅打印日志不阻断主流程
   * @private
   */
  static async _syncDailyQuotaRule(lottery_campaign_id, max_draws_daily, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'LotteryCampaignCRUDService._syncDailyQuotaRule'
    )
    const { operator_user_id } = options

    try {
      const limit_value = parseInt(max_draws_daily, 10)
      if (isNaN(limit_value) || limit_value < 0) {
        logger.warn('max_draws_per_user_daily 值无效，跳过配额规则同步', {
          lottery_campaign_id,
          max_draws_daily
        })
        return
      }

      // 查找该活动的 active 状态的 campaign 级每日配额规则
      const existing = await LotteryDrawQuotaRule.findOne({
        where: {
          scope_type: 'campaign',
          scope_id: String(lottery_campaign_id),
          window_type: 'daily',
          status: 'active'
        },
        transaction
      })

      if (existing) {
        // 更新已有规则的 limit_value
        if (existing.limit_value !== limit_value) {
          await existing.update(
            {
              limit_value,
              reason: `活动编辑同步（运营设置每日${limit_value}次）`,
              updated_by: operator_user_id
            },
            { transaction }
          )
          logger.info('同步配额规则：更新 campaign 级每日限额', {
            lottery_campaign_id,
            old_limit: existing.limit_value,
            new_limit: limit_value,
            lottery_draw_quota_rule_id: existing.lottery_draw_quota_rule_id
          })
        }
      } else {
        // 创建新的 campaign 级配额规则
        await LotteryDrawQuotaRule.create(
          {
            scope_type: 'campaign',
            scope_id: String(lottery_campaign_id),
            window_type: 'daily',
            limit_value,
            priority: 0,
            status: 'active',
            reason: `活动创建自动同步（每日${limit_value}次）`,
            created_by: operator_user_id
          },
          { transaction }
        )
        logger.info('同步配额规则：创建 campaign 级每日限额', {
          lottery_campaign_id,
          limit_value
        })
      }
    } catch (error) {
      // 配额规则同步失败不阻断活动操作（降级为仅靠全局兜底）
      logger.error('同步 campaign 级配额规则失败（非致命）', {
        lottery_campaign_id,
        max_draws_daily,
        error: error.message
      })
    }
  }
}

module.exports = LotteryCampaignCRUDService
