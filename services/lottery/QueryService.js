/**
 * 抽奖查询服务 - 读操作分层服务（LotteryQueryService）
 *
 * @description 从 UnifiedLotteryEngine 迁移的读操作服务
 *   - 分层策略：热点读操作收口 + Redis 缓存
 *   - 迁移来源：UnifiedLotteryEngine.js（暴力迁移，不保留兼容）
 *   - 缓存策略：使用 BusinessCacheHelper 统一管理
 *
 * 迁移的方法清单（共8个）：
 *   1. getCampaignPrizes     - 获取活动奖品列表（原 get_campaign_prizes）
 *   2. getCampaignConfig     - 获取活动配置（原 get_campaign_config，已有缓存）
 *   3. getUserHistory        - 获取用户抽奖历史（原 get_user_history）
 *   4. getActiveCampaigns    - 获取活动列表（原 get_campaigns）
 *   5. getUserStatistics     - 获取用户抽奖统计（原 get_user_statistics）
 *   6. getCampaignByCode     - 通过code获取活动（原 getCampaignByCode）
 *   7. getCampaignWithPrizes - 获取活动及奖品（原 getCampaignWithPrizes）
 *   8. getCampaignConfigByCode - 通过code获取配置（原 getCampaignConfigByCode）
 *
 * 缓存策略（已实现）：
 *   - getCampaignConfig：60s TTL（使用 BusinessCacheHelper.getLotteryCampaign）
 *   - getActiveCampaigns：30s TTL（无 user_id 时缓存，有 user_id 时不缓存）
 *   - getCampaignByCode：60s TTL（按 campaign_code 缓存）
 *   - getCampaignWithPrizes：60s TTL（复合缓存，包含活动+奖品）
 *   - getCampaignPrizes：依赖 getCampaignConfig 缓存
 *   - getUserStatistics：实时查询（不缓存，数据变化频繁）
 *   - getUserHistory：实时查询（不缓存，分页查询）
 *   - getCampaignConfigByCode：依赖 getCampaignByCode + getCampaignConfig 缓存
 *
 * @version 1.0.0
 * @date 2026-02-01
 * @timezone Asia/Shanghai (北京时间)
 * @architecture 读写分离 - 读操作收口服务
 */

const { Op } = require('sequelize')
const { logger } = require('../../utils/logger')
const BeijingTimeHelper = require('../../utils/timeHelper')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const { attachDisplayNames, DICT_TYPES } = require('../../utils/displayNameHelper')

/**
 * 抽奖查询服务类 - 静态服务模式
 *
 * 设计原则：
 * - 静态方法：无状态服务，符合项目架构规范
 * - 延迟加载：models 在方法内部 require，避免循环依赖
 * - 缓存优先：热点查询使用 Redis 缓存
 * - 统一日志：使用项目标准 logger
 *
 * @class LotteryQueryService
 */
class LotteryQueryService {
  /**
   * ============================================
   * 1. 获取活动奖品列表
   * ============================================
   *
   * 业务场景：展示抽奖活动的所有可用奖品
   *
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @returns {Promise<Array>} 奖品列表
   */
  static async getCampaignPrizes(lottery_campaign_id) {
    try {
      const models = require('../../models')

      const prizes = await models.LotteryPrize.findAll({
        where: {
          lottery_campaign_id,
          status: 'active'
        },
        attributes: [
          'lottery_prize_id',
          'prize_name',
          'prize_type',
          'prize_value',
          'prize_description',
          'image_resource_id',
          'win_probability',
          'stock_quantity',
          'max_daily_wins',
          'daily_win_count',
          'status',
          'sort_order',
          'rarity_code', // 2026-02-15: 稀有度代码（前端视觉光效等级，外键关联 rarity_defs）
          'created_at'
        ],
        order: [
          ['sort_order', 'ASC'],
          ['lottery_prize_id', 'ASC']
        ],
        raw: true // 返回普通JSON对象，而非Sequelize模型实例
      })

      logger.info('[LotteryQueryService] 获取活动奖品列表', {
        lottery_campaign_id,
        prizes_count: prizes.length
      })

      return prizes
    } catch (error) {
      logger.error('[LotteryQueryService] 获取活动奖品列表失败', {
        lottery_campaign_id,
        error: error.message
      })
      throw new Error(`获取活动奖品失败: ${error.message}`)
    }
  }

  /**
   * ============================================
   * 2. 获取活动配置信息（带Redis缓存）
   * ============================================
   *
   * 业务场景：获取抽奖活动的完整配置信息
   * 缓存策略：60s TTL，使用 BusinessCacheHelper.getLotteryCampaign
   *
   * @param {number} lottery_campaign_id - 抽奖活动ID
   * @param {Object} options - 选项
   * @param {boolean} options.refresh - 强制刷新缓存
   * @returns {Promise<Object>} 活动配置
   */
  static async getCampaignConfig(lottery_campaign_id, options = {}) {
    const { refresh = false } = options

    try {
      // ========== Redis 缓存读取 ==========
      if (!refresh) {
        const cached = await BusinessCacheHelper.getLotteryCampaign(lottery_campaign_id)
        if (cached) {
          logger.debug('[LotteryQueryService] 活动配置缓存命中', { lottery_campaign_id })
          return cached
        }
      }

      const models = require('../../models')

      const campaign = await models.LotteryCampaign.findOne({
        where: { lottery_campaign_id },
        attributes: [
          'lottery_campaign_id',
          'campaign_name',
          'campaign_code',
          'campaign_type',
          'max_draws_per_user_daily',
          'max_draws_per_user_total',
          'status',
          'start_time',
          'end_time',
          'total_prize_pool',
          'remaining_prize_pool',
          'prize_distribution_config',
          'created_at',
          'updated_at'
        ]
      })

      if (!campaign) {
        throw new Error('活动不存在')
      }

      /**
       * V4.6 Phase 5：保底规则现在由 Pipeline 架构内部处理
       * 此字段保留为 null，仅用于活动配置的返回结构完整性
       */
      const guaranteeRule = null

      logger.info('[LotteryQueryService] 获取活动配置', {
        lottery_campaign_id,
        campaign_name: campaign.campaign_name,
        status: campaign.status
      })

      const config = {
        ...campaign.toJSON(),
        guarantee_rule: guaranteeRule
      }

      // ========== 写入 Redis 缓存（60s TTL）==========
      await BusinessCacheHelper.setLotteryCampaign(lottery_campaign_id, config)

      return config
    } catch (error) {
      logger.error('[LotteryQueryService] 获取活动配置失败', {
        lottery_campaign_id,
        error: error.message
      })
      throw new Error(`获取活动配置失败: ${error.message}`)
    }
  }

  /**
   * ============================================
   * 3. 获取用户抽奖历史
   * ============================================
   *
   * 业务场景：分页展示用户的抽奖记录
   * 缓存策略：不缓存（分页查询，数据变化频繁）
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项 {page, limit, lottery_campaign_id}
   * @returns {Promise<Object>} 抽奖历史记录
   */
  static async getUserHistory(user_id, options = {}) {
    try {
      const models = require('../../models')
      const { page = 1, limit = 20, lottery_campaign_id } = options

      const offset = (page - 1) * limit

      // 构建查询条件
      const whereClause = { user_id }
      if (lottery_campaign_id) {
        whereClause.lottery_campaign_id = lottery_campaign_id
      }

      // 查询抽奖记录
      const { rows: records, count: total } = await models.LotteryDraw.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: models.LotteryCampaign,
            as: 'campaign',
            attributes: ['lottery_campaign_id', 'campaign_name', 'campaign_type']
          },
          {
            model: models.LotteryPrize,
            as: 'prize',
            attributes: [
              'lottery_prize_id',
              'prize_name',
              'prize_type',
              'prize_value',
              'image_resource_id',
              'win_probability'
            ],
            required: false
          }
        ],
        attributes: [
          'lottery_draw_id',
          'user_id',
          'lottery_campaign_id',
          'lottery_prize_id',
          'reward_tier',
          'draw_type',
          'cost_points',
          'guarantee_triggered',
          'created_at'
        ],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      })

      const totalPages = Math.ceil(total / limit)

      logger.info('[LotteryQueryService] 获取用户抽奖历史', {
        user_id,
        page,
        limit,
        total,
        records_count: records.length
      })

      return {
        records: records.map(record => ({
          lottery_draw_id: record.lottery_draw_id,
          lottery_campaign_id: record.lottery_campaign_id,
          campaign_name: record.campaign?.campaign_name || '未知活动',
          reward_tier: record.reward_tier,
          prize: record.prize
            ? {
                id: record.prize.lottery_prize_id,
                name: record.prize.prize_name,
                type: record.prize.prize_type,
                value: record.prize.prize_value,
                image_resource_id: record.prize.image_resource_id
              }
            : null,
          points_cost: record.cost_points,
          probability: record.prize?.win_probability || 0,
          is_guarantee: record.guarantee_triggered || false,
          draw_time: record.created_at
        })),
        pagination: {
          current_page: parseInt(page),
          page_size: parseInt(limit),
          total_records: total,
          total_pages: totalPages
        }
      }
    } catch (error) {
      logger.error('[LotteryQueryService] 获取用户抽奖历史失败', {
        user_id,
        options,
        error: error.message
      })
      throw new Error(`获取抽奖历史失败: ${error.message}`)
    }
  }

  /**
   * ============================================
   * 4. 获取活动列表
   * ============================================
   *
   * 业务场景：获取所有活动列表，支持状态过滤和用户今日抽奖次数统计
   *
   * 缓存策略（决策：选项A）：
   *   - 无 user_id 时：使用 Redis 缓存（30s TTL）
   *   - 有 user_id 时：不缓存（含用户个性化数据 user_today_draws, can_draw）
   *
   * @param {Object} options - 查询选项 {status, user_id}
   * @returns {Promise<Array>} 活动列表
   */
  static async getActiveCampaigns(options = {}) {
    try {
      const models = require('../../models')
      const { status = 'active', user_id } = options

      // ========== 缓存策略：无 user_id 时使用缓存 ==========
      const cacheKey = `lottery:campaigns:list:${status}`
      const CACHE_TTL = 30 // 30秒 TTL（热点查询，短缓存）

      // 无 user_id 时，尝试从缓存获取
      if (!user_id) {
        const cached = await BusinessCacheHelper.get(cacheKey)
        if (cached !== null) {
          logger.debug('[LotteryQueryService] 活动列表缓存命中', { status, cacheKey })
          return cached
        }
      }

      // ========== 数据库查询 ==========
      const whereClause = {}
      if (status) {
        whereClause.status = status
      }

      const campaigns = await models.LotteryCampaign.findAll({
        where: whereClause,
        attributes: [
          'lottery_campaign_id',
          'campaign_name',
          'campaign_code',
          'campaign_type',
          'max_draws_per_user_daily',
          'status',
          'start_time',
          'end_time',
          'total_prize_pool',
          'remaining_prize_pool',
          // 2026-02-15: 前端展示配置字段（多活动抽奖系统）
          'display_mode',
          'effect_theme',
          'banner_image_url'
        ],
        order: [
          ['status', 'DESC'], // active优先
          ['start_time', 'DESC']
        ]
      })

      /**
       * 批量查询优化：解决N+1查询性能问题
       * 将循环查询（N次）改为一次性批量查询（1次SQL）
       */
      const userDrawCounts = {}
      if (user_id) {
        const today = BeijingTimeHelper.todayStart()
        const campaignIds = campaigns.map(c => c.lottery_campaign_id)

        // 批量查询所有活动的今日抽奖次数
        const drawCounts = await models.LotteryDraw.findAll({
          where: {
            user_id,
            lottery_campaign_id: campaignIds,
            created_at: {
              [Op.gte]: today
            }
          },
          attributes: [
            'lottery_campaign_id',
            [models.sequelize.fn('COUNT', models.sequelize.col('lottery_draw_id')), 'count']
          ],
          group: ['lottery_campaign_id'],
          raw: true
        })

        // 转换为Map结构
        drawCounts.forEach(item => {
          userDrawCounts[item.lottery_campaign_id] = parseInt(item.count)
        })
      }

      logger.info('[LotteryQueryService] 获取活动列表', {
        status,
        user_id,
        campaigns_count: campaigns.length,
        cache_used: !user_id
      })

      // ========== 批量补充定价信息（LotteryPricingService 有 60s Redis 缓存，性能安全）==========
      const LotteryPricingService = require('../lottery/LotteryPricingService')

      const result = await Promise.all(
        campaigns.map(async campaign => {
          const campaignData = {
            lottery_campaign_id: campaign.lottery_campaign_id,
            campaign_name: campaign.campaign_name,
            campaign_code: campaign.campaign_code,
            campaign_type: campaign.campaign_type,
            max_draws_per_day: campaign.max_draws_per_user_daily,
            status: campaign.status,
            start_time: campaign.start_time,
            end_time: campaign.end_time,
            total_prize_pool: campaign.total_prize_pool,
            remaining_prize_pool: campaign.remaining_prize_pool,
            user_today_draws: user_id
              ? userDrawCounts[campaign.lottery_campaign_id] || 0
              : undefined,
            can_draw: user_id
              ? (userDrawCounts[campaign.lottery_campaign_id] || 0) <
                campaign.max_draws_per_user_daily
              : undefined
          }

          // 从 LotteryPricingService 获取定价（缓存 60s，活跃活动通常 1-5 个）
          try {
            const pricing = await LotteryPricingService.getDrawPricing(
              1,
              campaign.lottery_campaign_id
            )
            campaignData.base_cost = pricing.base_cost // 折扣前基础价
            campaignData.per_draw_cost = pricing.per_draw // 折扣后单抽实际价
          } catch (err) {
            // 定价配置缺失时不阻断列表，标记为 null
            logger.warn('[LotteryQueryService] 活动定价获取失败', {
              lottery_campaign_id: campaign.lottery_campaign_id,
              error: err.message
            })
            campaignData.base_cost = null
            campaignData.per_draw_cost = null
          }

          return campaignData
        })
      )

      // 附加中文显示名称（status/campaign_type → _display/_color）
      await attachDisplayNames(result, [
        { field: 'status', dictType: DICT_TYPES.CAMPAIGN_STATUS },
        { field: 'campaign_type', dictType: DICT_TYPES.CAMPAIGN_TYPE }
      ])

      // ========== 无 user_id 时写入缓存（含显示名称） ==========
      if (!user_id) {
        await BusinessCacheHelper.set(cacheKey, result, CACHE_TTL)
        logger.debug('[LotteryQueryService] 活动列表已缓存', { status, cacheKey, ttl: CACHE_TTL })
      }

      return result
    } catch (error) {
      logger.error('[LotteryQueryService] 获取活动列表失败', {
        options,
        error: error.message
      })
      throw new Error(`获取活动列表失败: ${error.message}`)
    }
  }

  /**
   * ============================================
   * 5. 获取用户抽奖统计信息
   * ============================================
   *
   * 业务场景：统计用户的抽奖行为数据
   * 缓存策略：不缓存（数据变化频繁，需要实时性）
   *
   * 统计指标：
   * 1. 总抽奖次数和高档奖励次数
   * 2. 今日抽奖次数和高档奖励次数
   * 3. 总消耗积分
   * 4. 各档位奖励分布
   * 5. 最近一次高档奖励记录
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object>} 统计信息对象
   */
  static async getUserStatistics(user_id) {
    try {
      const models = require('../../models')

      // 第1次查询：统计总抽奖次数
      const totalDraws = await models.LotteryDraw.count({
        where: { user_id }
      })

      // 第2次查询：统计高档奖励次数
      const totalHighTierWins = await models.LotteryDraw.count({
        where: {
          user_id,
          reward_tier: 'high'
        }
      })

      // 第3次查询：统计保底高档奖励次数
      const guaranteeWins = await models.LotteryDraw.count({
        where: {
          user_id,
          reward_tier: 'high',
          guarantee_triggered: true
        }
      })

      // 第4次查询：统计今日抽奖次数
      const today = BeijingTimeHelper.todayStart()
      const todayDraws = await models.LotteryDraw.count({
        where: {
          user_id,
          created_at: {
            [Op.gte]: today
          }
        }
      })

      // 第5次查询：统计今日高档奖励次数
      const todayHighTierWins = await models.LotteryDraw.count({
        where: {
          user_id,
          reward_tier: 'high',
          created_at: {
            [Op.gte]: today
          }
        }
      })

      // 第6次查询：统计总消耗积分
      const totalPointsCost =
        (await models.LotteryDraw.sum('cost_points', {
          where: { user_id }
        })) || 0

      // 第7次查询：统计各档位奖励次数分布
      const rewardTierStats = await models.LotteryDraw.findAll({
        where: {
          user_id,
          reward_tier: { [Op.ne]: null }
        },
        attributes: ['reward_tier', [models.sequelize.fn('COUNT', '*'), 'count']],
        group: ['reward_tier'],
        raw: true
      })

      // 第8次查询：查询最近一次高档奖励记录
      const lastHighTierWin = await models.LotteryDraw.findOne({
        where: {
          user_id,
          reward_tier: 'high'
        },
        include: [
          {
            model: models.LotteryPrize,
            as: 'prize',
            attributes: ['lottery_prize_id', 'prize_name', 'prize_type', 'prize_value']
          }
        ],
        attributes: ['lottery_draw_id', 'lottery_campaign_id', 'created_at', 'guarantee_triggered'],
        order: [['created_at', 'DESC']]
      })

      // 计算高档奖励率
      const highTierRate = totalDraws > 0 ? ((totalHighTierWins / totalDraws) * 100).toFixed(2) : 0
      const todayHighTierRate =
        todayDraws > 0 ? ((todayHighTierWins / todayDraws) * 100).toFixed(2) : 0

      logger.info('[LotteryQueryService] 获取用户抽奖统计', {
        user_id,
        total_draws: totalDraws,
        total_high_tier_wins: totalHighTierWins,
        high_tier_rate: highTierRate
      })

      return {
        user_id,
        total_draws: totalDraws,
        total_high_tier_wins: totalHighTierWins,
        guarantee_wins: guaranteeWins,
        normal_high_tier_wins: totalHighTierWins - guaranteeWins,
        high_tier_rate: parseFloat(highTierRate),
        today_draws: todayDraws,
        today_high_tier_wins: todayHighTierWins,
        today_high_tier_rate: parseFloat(todayHighTierRate),
        total_points_cost: parseInt(totalPointsCost),
        reward_tier_distribution: rewardTierStats.reduce((acc, stat) => {
          acc[stat.reward_tier] = parseInt(stat.count)
          return acc
        }, {}),
        last_high_tier_win: lastHighTierWin
          ? {
              lottery_draw_id: lastHighTierWin.lottery_draw_id,
              lottery_campaign_id: lastHighTierWin.lottery_campaign_id,
              prize: lastHighTierWin.prize
                ? {
                    id: lastHighTierWin.prize.lottery_prize_id,
                    name: lastHighTierWin.prize.prize_name,
                    type: lastHighTierWin.prize.prize_type,
                    value: lastHighTierWin.prize.prize_value
                  }
                : null,
              is_guarantee: lastHighTierWin.guarantee_triggered || false,
              win_time: lastHighTierWin.created_at
            }
          : null,
        timestamp: BeijingTimeHelper.formatForAPI(new Date()).iso
      }
    } catch (error) {
      logger.error('[LotteryQueryService] 获取用户抽奖统计失败', {
        user_id,
        error: error.message
      })
      throw new Error(`获取用户统计失败: ${error.message}`)
    }
  }

  /**
   * ============================================
   * 6. 通过campaign_code获取活动并验证状态
   * ============================================
   *
   * 业务场景：路由层通过campaign_code查询活动，验证活动是否存在且状态是否可用
   *
   * 缓存策略：
   *   - 缓存基础活动数据（60s TTL）
   *   - 状态检查在缓存命中后实时执行（确保状态变化后能正确报错）
   *   - 缓存 key: lottery:campaigns:code:{campaign_code}
   *
   * @param {string} campaign_code - 活动代码（如'BASIC_LOTTERY'）
   * @param {Object} options - 选项参数
   * @param {boolean} options.checkStatus - 是否检查活动状态（默认true）
   * @param {boolean} options.refresh - 强制刷新缓存（默认false）
   * @returns {Promise<Object>} 活动对象
   * @throws {Error} 活动不存在或状态不可用
   */
  static async getCampaignByCode(campaign_code, options = {}) {
    const { checkStatus = true, refresh = false } = options

    try {
      const models = require('../../models')

      // ========== 缓存策略 ==========
      const cacheKey = `lottery:campaigns:code:${campaign_code}`
      const CACHE_TTL = 60 // 60秒 TTL

      let campaign = null

      // 尝试从缓存获取（除非强制刷新）
      if (!refresh) {
        const cached = await BusinessCacheHelper.get(cacheKey)
        if (cached !== null) {
          logger.debug('[LotteryQueryService] 活动缓存命中', { campaign_code, cacheKey })
          campaign = cached
        }
      }

      // 缓存未命中，查数据库
      if (!campaign) {
        campaign = await models.LotteryCampaign.findOne({
          where: { campaign_code }
        })

        if (!campaign) {
          const error = new Error('活动不存在，请检查活动代码是否正确')
          error.code = 'CAMPAIGN_NOT_FOUND'
          error.statusCode = 404
          error.data = { campaign_code, hint: '常见活动代码: BASIC_LOTTERY' }
          throw error
        }

        // 写入缓存（将 Sequelize 实例转为普通对象）
        const campaignData = campaign.toJSON ? campaign.toJSON() : campaign
        await BusinessCacheHelper.set(cacheKey, campaignData, CACHE_TTL)
        logger.debug('[LotteryQueryService] 活动已缓存', {
          campaign_code,
          cacheKey,
          ttl: CACHE_TTL
        })
      }

      // ========== 状态检查（缓存后仍需实时检查）==========
      const campaignStatus = campaign.status || campaign.dataValues?.status
      if (checkStatus && campaignStatus !== 'active') {
        const statusMessages = {
          ended: `活动已于 ${campaign.end_time} 结束`,
          paused: '活动暂时关闭，请稍后再试',
          draft: '活动尚未开始，敬请期待'
        }
        const error = new Error(statusMessages[campaignStatus] || '活动暂不可用')
        error.code = 'CAMPAIGN_NOT_ACTIVE'
        error.statusCode = 403
        error.data = {
          campaign_code,
          status: campaignStatus,
          start_time: campaign.start_time,
          end_time: campaign.end_time
        }
        throw error
      }

      logger.info('[LotteryQueryService] 通过campaign_code获取活动', {
        campaign_code,
        lottery_campaign_id: campaign.lottery_campaign_id,
        status: campaignStatus,
        cache_hit: !!campaign
      })

      return campaign
    } catch (error) {
      if (error.code === 'CAMPAIGN_NOT_FOUND' || error.code === 'CAMPAIGN_NOT_ACTIVE') {
        throw error
      }

      logger.error('[LotteryQueryService] 通过campaign_code获取活动失败', {
        campaign_code,
        error: error.message
      })
      throw new Error(`获取活动失败: ${error.message}`)
    }
  }

  /**
   * ============================================
   * 7. 通过campaign_code获取活动奖品列表
   * ============================================
   *
   * 业务场景：路由层获取奖品列表时，需要先验证活动是否存在且可用
   *
   * 缓存策略：
   *   - 复合缓存（60s TTL）：同时缓存活动信息和奖品列表
   *   - 缓存 key: lottery:campaigns:with_prizes:{campaign_code}
   *   - 注意：底层 getCampaignByCode 和 getCampaignPrizes 也有独立缓存
   *
   * @param {string} campaign_code - 活动代码
   * @param {Object} options - 选项参数
   * @param {boolean} options.refresh - 强制刷新缓存（默认false）
   * @returns {Promise<Object>} 包含活动信息和奖品列表的对象
   */
  static async getCampaignWithPrizes(campaign_code, options = {}) {
    const { refresh = false } = options

    try {
      // ========== 缓存策略 ==========
      const cacheKey = `lottery:campaigns:with_prizes:${campaign_code}`
      const CACHE_TTL = 60 // 60秒 TTL

      // 尝试从缓存获取（除非强制刷新）
      if (!refresh) {
        const cached = await BusinessCacheHelper.get(cacheKey)
        if (cached !== null) {
          logger.debug('[LotteryQueryService] 活动奖品列表缓存命中', { campaign_code, cacheKey })

          // 缓存命中后仍需检查活动状态（确保状态变化后能正确报错）
          const campaignStatus = cached.campaign?.status
          if (campaignStatus !== 'active') {
            const statusMessages = {
              ended: `活动已于 ${cached.campaign?.end_time} 结束`,
              paused: '活动暂时关闭，请稍后再试',
              draft: '活动尚未开始，敬请期待'
            }
            const error = new Error(statusMessages[campaignStatus] || '活动暂不可用')
            error.code = 'CAMPAIGN_NOT_ACTIVE'
            error.statusCode = 403
            error.data = {
              campaign_code,
              status: campaignStatus,
              start_time: cached.campaign?.start_time,
              end_time: cached.campaign?.end_time
            }
            throw error
          }

          return cached
        }
      }

      /**
       * ========== 数据库查询 ==========
       * 步骤1：获取并验证活动
       */
      const campaign = await LotteryQueryService.getCampaignByCode(campaign_code)

      // 步骤2：获取奖品列表
      const prizes = await LotteryQueryService.getCampaignPrizes(campaign.lottery_campaign_id)

      logger.info('[LotteryQueryService] 获取活动奖品列表成功', {
        campaign_code,
        lottery_campaign_id: campaign.lottery_campaign_id,
        prizes_count: prizes.length
      })

      const result = {
        campaign: campaign.toJSON ? campaign.toJSON() : campaign,
        prizes
      }

      // ========== 写入缓存 ==========
      await BusinessCacheHelper.set(cacheKey, result, CACHE_TTL)
      logger.debug('[LotteryQueryService] 活动奖品列表已缓存', {
        campaign_code,
        cacheKey,
        ttl: CACHE_TTL
      })

      return result
    } catch (error) {
      if (error.code === 'CAMPAIGN_NOT_FOUND' || error.code === 'CAMPAIGN_NOT_ACTIVE') {
        throw error
      }

      logger.error('[LotteryQueryService] 获取活动奖品列表失败', {
        campaign_code,
        error: error.message
      })
      throw error
    }
  }

  /**
   * ============================================
   * 8. 通过campaign_code获取活动配置
   * ============================================
   *
   * 业务场景：路由层获取活动配置时，需要先验证活动是否存在且可用
   *
   * @param {string} campaign_code - 活动代码
   * @param {Object} options - 选项参数
   * @param {boolean} options.checkStatus - 是否检查活动状态（默认true）
   * @returns {Promise<Object>} 活动配置对象
   */
  static async getCampaignConfigByCode(campaign_code, options = {}) {
    try {
      // 步骤1：获取并验证活动
      const campaign = await LotteryQueryService.getCampaignByCode(campaign_code, options)

      // 步骤2：获取完整配置
      const config = await LotteryQueryService.getCampaignConfig(campaign.lottery_campaign_id)

      logger.info('[LotteryQueryService] 获取活动配置成功', {
        campaign_code,
        lottery_campaign_id: campaign.lottery_campaign_id
      })

      return config
    } catch (error) {
      logger.error('[LotteryQueryService] 获取活动配置失败', {
        campaign_code,
        error: error.message
      })
      throw error
    }
  }
}

module.exports = LotteryQueryService
