/**
 * @file 抽奖活动列表管理路由
 * @description P1 需求：运营后台活动列表（含 ROI、复购率、库存预警）
 *
 * @version 1.1.0
 * @date 2026-01-28
 *
 * 接口说明：
 * - GET / - 获取活动列表（带 ROI、复购率、库存预警）
 * - GET /:lottery_campaign_id - 获取单个活动详情
 *
 * 实现规范（V1.3.0）：
 * - 路由层禁止直接 require models
 * - 通过 ServiceManager 获取 LotteryAnalyticsService
 * - 复用 Service 层的 getCampaignROI 方法计算 ROI 和复购率
 * - ROI/复购率使用 Redis 缓存（5分钟 TTL，ADR-003）
 *
 * @see docs/后端API开发需求文档-抽奖运营后台.md P1 活动列表 API
 * @see ADR-001 活动列表接口位置
 * @see ADR-003 ROI/复购率缓存策略
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const { Op } = require('sequelize')
const logger = require('../../../utils/logger').logger
const alertThresholds = require('../../../config/alert-thresholds')
const { attachDisplayNames, DICT_TYPES } = require('../../../utils/displayNameHelper')
const { getRedisClient, isRedisHealthy } = require('../../../utils/UnifiedRedisClient')

/*
 * Redis 缓存键设计（ADR-003）：
 * - ROI 缓存：lottery:roi:campaign:{lottery_campaign_id}
 * - 复购率缓存：lottery:repeat_rate:campaign:{lottery_campaign_id}
 * - TTL：5 分钟（300 秒）
 */
const CACHE_TTL = 300 // 5 分钟
const CACHE_KEYS = {
  roi: campaignId => `lottery:roi:campaign:${campaignId}`,
  repeatRate: campaignId => `lottery:repeat_rate:campaign:${campaignId}`
}

/**
 * 获取 LotteryAnalyticsService 服务实例
 *
 * 遵循项目规范：通过 req.app.locals.services.getService 获取服务
 * 禁止直接 require 服务文件
 *
 * @param {Object} req - Express 请求对象
 * @returns {Object} LotteryAnalyticsService 实例
 */
function getLotteryAnalyticsService(req) {
  // 优先从已挂载的服务获取
  if (req.services?.lotteryAnalyticsService) {
    return req.services.lotteryAnalyticsService
  }

  // 通过 app.locals.services 获取（项目标准模式）
  const service = req.app.locals.services?.getService('lottery_analytics_report')
  if (!service) {
    throw new Error('LotteryAnalyticsService (lottery_analytics_report) 未在 ServiceManager 中注册')
  }
  return service
}

/**
 * 获取 Redis 客户端（带健康检查）
 * @private
 * @returns {Promise<Object|null>} Redis 客户端或 null（不可用时）
 */
async function getRedis() {
  try {
    const healthy = await isRedisHealthy()
    if (!healthy) {
      logger.warn('Redis 不健康，降级到 Service 层实时计算')
      return null
    }
    return await getRedisClient()
  } catch (error) {
    logger.warn('获取 Redis 客户端失败，降级到 Service 层实时计算', { error: error.message })
    return null
  }
}

/**
 * 从缓存获取 ROI 和复购率
 * @param {Object} redis - Redis 客户端
 * @param {number} campaignId - 活动 ID
 * @returns {Promise<Object>} 包含 roi 和 repeat_rate 的对象
 */
async function getCachedROI(redis, campaignId) {
  if (!redis) return { roi: null, repeat_rate: null }

  try {
    const [roiStr, repeatRateStr] = await Promise.all([
      redis.get(CACHE_KEYS.roi(campaignId)),
      redis.get(CACHE_KEYS.repeatRate(campaignId))
    ])

    return {
      roi: roiStr !== null ? parseFloat(roiStr) : null,
      repeat_rate: repeatRateStr !== null ? parseFloat(repeatRateStr) : null
    }
  } catch (error) {
    logger.warn('读取 ROI 缓存失败', { lottery_campaign_id: campaignId, error: error.message })
    return { roi: null, repeat_rate: null }
  }
}

/**
 * 缓存 ROI 和复购率
 * @param {Object} redis - Redis 客户端
 * @param {number} campaignId - 活动 ID
 * @param {number} roi - ROI 值
 * @param {number} repeatRate - 复购率
 * @returns {Promise<void>} 无返回值
 */
async function cacheROI(redis, campaignId, roi, repeatRate) {
  if (!redis) return

  try {
    const pipeline = redis.pipeline()
    pipeline.setex(CACHE_KEYS.roi(campaignId), CACHE_TTL, roi.toString())
    pipeline.setex(CACHE_KEYS.repeatRate(campaignId), CACHE_TTL, repeatRate.toString())
    await pipeline.exec()
    logger.debug('ROI 缓存更新', { lottery_campaign_id: campaignId, roi, repeat_rate: repeatRate })
  } catch (error) {
    logger.warn('缓存 ROI 失败', { lottery_campaign_id: campaignId, error: error.message })
  }
}

/**
 * 通过 Service 层计算 ROI 和复购率
 *
 * 遵循项目规范：复用 Service 层的 getCampaignROI 方法
 *
 * @param {Object} analyticsService - LotteryAnalyticsService 实例
 * @param {number} campaignId - 活动 ID
 * @returns {Promise<Object>} 包含 roi 和 repeat_rate 的对象
 */
async function calculateROIviaService(analyticsService, campaignId) {
  try {
    const roiData = await analyticsService.getCampaignROI(campaignId, {})

    return {
      roi: roiData.roi,
      repeat_rate: roiData.repeat_rate
    }
  } catch (error) {
    if (error.message === '活动不存在') {
      return { roi: 0, repeat_rate: 0 }
    }
    throw error
  }
}

/**
 * 计算库存预警状态
 *
 * 注：此函数使用 Service 传入的 models，不直接 require
 *
 * @param {Object} analyticsService - LotteryAnalyticsService 实例（用于获取 models）
 * @param {number} campaignId - 活动 ID
 * @returns {Promise<Object>} 包含 is_warning 和 low_stock_prizes 的对象
 */
async function calculateStockWarning(analyticsService, campaignId) {
  // 通过 Service 访问 models（遵循规范）
  const LotteryPrize = analyticsService.models.LotteryPrize
  const warningThreshold = alertThresholds.prize_stock_warning_threshold || 20

  /*
   * 查询活动下的所有奖品
   * 库存字段：stock_quantity（初始库存）、total_win_count（已中奖数）
   */
  const prizes = await LotteryPrize.findAll({
    where: { lottery_campaign_id: campaignId, status: 'active' },
    attributes: ['lottery_prize_id', 'prize_name', 'stock_quantity', 'total_win_count']
  })

  const lowStockPrizes = []
  prizes.forEach(prize => {
    // 初始库存
    const total = prize.stock_quantity || 0
    // 剩余库存 = 初始库存 - 已中奖数
    const remaining = total - (prize.total_win_count || 0)
    // 剩余百分比
    const remainingPercentage = total > 0 ? (remaining / total) * 100 : 100

    // 剩余库存百分比低于阈值时触发预警
    if (remainingPercentage < warningThreshold) {
      lowStockPrizes.push({
        lottery_prize_id: prize.lottery_prize_id,
        prize_name: prize.prize_name,
        stock_quantity: total,
        remaining_quantity: remaining,
        remaining_percentage: parseFloat(remainingPercentage.toFixed(1))
      })
    }
  })

  return {
    is_warning: lowStockPrizes.length > 0,
    low_stock_prizes: lowStockPrizes,
    warning_threshold: warningThreshold
  }
}

/*
 * ==========================================
 * 活动列表 API（P1 优先级）
 * ==========================================
 */

/**
 * GET / - 获取活动列表（带 ROI、复购率、库存预警）
 *
 * 完整路径：GET /api/v4/console/lottery-campaigns
 *
 * P1 优先级 API：为运营后台提供活动运营视图
 *
 * Query 参数：
 * - status: 活动状态筛选（active/inactive/upcoming/ended）
 * - page: 页码（默认 1）
 * - page_size: 每页数量（默认 20，最大 100）
 *
 * 返回字段说明：
 * - roi: 投资回报率（%）- 来自 Redis 缓存或 Service 层实时计算
 * - repeat_rate: 复购率（%）- 来自 Redis 缓存或 Service 层实时计算
 * - stock_warning: 库存预警状态
 *   - is_warning: 是否有预警
 *   - low_stock_prizes: 低库存奖品列表
 *
 * 缓存策略（ADR-003）：
 * - ROI/复购率使用 Redis 缓存，TTL 5 分钟
 * - Redis 不可用时降级到 Service 层实时计算
 *
 * @see docs/后端API开发需求文档-抽奖运营后台.md P1 现有 API 调整
 */
router.get('/', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const { status, page = 1, page_size = 20 } = req.query
    const limit = Math.min(parseInt(page_size) || 20, 100)
    const offset = (Math.max(parseInt(page) || 1, 1) - 1) * limit

    // 获取 Service 实例
    const analyticsService = getLotteryAnalyticsService(req)

    // 通过 Service 访问 LotteryCampaign 模型
    const LotteryCampaign = analyticsService.models.LotteryCampaign

    // 构建查询条件
    const where = {}
    if (status) {
      const now = new Date()
      switch (status) {
        case 'active':
          where.status = 'active'
          where.start_time = { [Op.lte]: now }
          where[Op.or] = [{ end_time: null }, { end_time: { [Op.gte]: now } }]
          break
        case 'inactive':
          where.status = 'inactive'
          break
        case 'upcoming':
          where.status = 'active'
          where.start_time = { [Op.gt]: now }
          break
        case 'ended':
          where.end_time = { [Op.lt]: now }
          break
        default:
          // 无效状态不过滤
          break
      }
    }

    // 查询活动列表
    const { count, rows: campaigns } = await LotteryCampaign.findAndCountAll({
      where,
      attributes: [
        'lottery_campaign_id',
        'campaign_name',
        'campaign_code',
        'status',
        'start_time',
        'end_time',
        'daily_budget_limit',
        'pool_budget_total',
        'pool_budget_remaining',
        'budget_mode',
        // 前端展示配置字段（多活动抽奖系统 - Web后台活动列表需要展示玩法和主题）
        'display_mode',
        'effect_theme',
        'created_at',
        'updated_at'
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    })

    // 获取 Redis 客户端
    const redis = await getRedis()

    // 并行计算每个活动的 ROI、复购率、库存预警
    const enrichedCampaigns = await Promise.all(
      campaigns.map(async campaign => {
        const campaignId = campaign.lottery_campaign_id
        const plainCampaign = campaign.toJSON()

        // 1. 尝试从缓存获取 ROI 和复购率
        let { roi, repeat_rate } = await getCachedROI(redis, campaignId)

        // 2. 缓存未命中，通过 Service 层实时计算
        if (roi === null || repeat_rate === null) {
          const calculated = await calculateROIviaService(analyticsService, campaignId)
          roi = calculated.roi
          repeat_rate = calculated.repeat_rate

          // 3. 缓存计算结果
          await cacheROI(redis, campaignId, roi, repeat_rate)
        }

        // 4. 计算库存预警
        const stockWarning = await calculateStockWarning(analyticsService, campaignId)

        return {
          ...plainCampaign,
          // P1 新增字段
          roi,
          repeat_rate,
          stock_warning: stockWarning
        }
      })
    )

    // 附加中文显示名称（status → status_display/status_color）
    await attachDisplayNames(enrichedCampaigns, [
      { field: 'status', dictType: DICT_TYPES.CAMPAIGN_STATUS },
      { field: 'budget_mode', dictType: DICT_TYPES.BUDGET_MODE }
    ])

    // 构建分页响应
    const totalPages = Math.ceil(count / limit)
    const response = {
      campaigns: enrichedCampaigns,
      pagination: {
        current_page: parseInt(page),
        page_size: limit,
        total_count: count,
        total_pages: totalPages,
        has_next: parseInt(page) < totalPages,
        has_prev: parseInt(page) > 1
      }
    }

    logger.info('获取活动列表成功', {
      admin_id: req.user.user_id,
      status,
      page,
      total_count: count,
      returned_count: enrichedCampaigns.length
    })

    return res.apiSuccess(response, '获取活动列表成功')
  } catch (error) {
    logger.error('获取活动列表失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_CAMPAIGNS_FAILED', null, 500)
  }
})

/**
 * GET /:lottery_campaign_id - 获取单个活动详情（含 ROI、复购率、库存预警）
 *
 * 完整路径：GET /api/v4/console/lottery-campaigns/:lottery_campaign_id
 *
 * 路径参数：
 * - lottery_campaign_id: 活动 ID（数字）
 *
 * 返回：活动详情 + ROI + 复购率 + 库存预警
 */
router.get('/:lottery_campaign_id', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const campaignId = parseInt(req.params.lottery_campaign_id)

    if (!campaignId || isNaN(campaignId)) {
      return res.apiError('无效的活动ID', 'INVALID_CAMPAIGN_ID', null, 400)
    }

    // 获取 Service 实例
    const analyticsService = getLotteryAnalyticsService(req)

    // 通过 Service 访问 LotteryCampaign 模型
    const LotteryCampaign = analyticsService.models.LotteryCampaign

    // 查询活动详情
    const campaign = await LotteryCampaign.findByPk(campaignId)
    if (!campaign) {
      return res.apiError('活动不存在', 'CAMPAIGN_NOT_FOUND', null, 404)
    }

    // 获取 Redis 客户端
    const redis = await getRedis()

    // 尝试从缓存获取 ROI 和复购率
    let { roi, repeat_rate } = await getCachedROI(redis, campaignId)

    // 缓存未命中，通过 Service 层实时计算
    if (roi === null || repeat_rate === null) {
      const calculated = await calculateROIviaService(analyticsService, campaignId)
      roi = calculated.roi
      repeat_rate = calculated.repeat_rate

      // 缓存计算结果
      await cacheROI(redis, campaignId, roi, repeat_rate)
    }

    // 计算库存预警
    const stockWarning = await calculateStockWarning(analyticsService, campaignId)

    const response = {
      ...campaign.toJSON(),
      roi,
      repeat_rate,
      stock_warning: stockWarning
    }

    // 附加中文显示名称（status → status_display/status_color）
    await attachDisplayNames(response, [
      { field: 'status', dictType: DICT_TYPES.CAMPAIGN_STATUS },
      { field: 'budget_mode', dictType: DICT_TYPES.BUDGET_MODE }
    ])

    logger.info('获取活动详情成功', {
      admin_id: req.user.user_id,
      lottery_campaign_id: campaignId,
      roi,
      repeat_rate
    })

    return res.apiSuccess(response, '获取活动详情成功')
  } catch (error) {
    logger.error('获取活动详情失败:', error)
    return res.apiError(`查询失败：${error.message}`, 'GET_CAMPAIGN_DETAIL_FAILED', null, 500)
  }
})

/* ========== 策略配置子路由（10策略活动级开关） ========== */

const TransactionManager = require('../../../utils/TransactionManager')

/**
 * GET /:lottery_campaign_id/strategy-config
 * 获取某活动的全部策略配置（按 config_group 分组）
 * 通过 ServiceManager → QueryService 读取（架构规范：读操作收口到 QueryService）
 */
router.get(
  '/:lottery_campaign_id/strategy-config',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const queryService = req.app.locals.services.getService('admin_lottery_query')
      const result = await queryService.getStrategyConfig(req.params.lottery_campaign_id)
      return res.apiSuccess(result, '获取策略配置成功')
    } catch (error) {
      logger.error('获取策略配置失败:', error)
      const statusCode = error.statusCode || 500
      return res.apiError(
        `获取策略配置失败：${error.message}`,
        error.code || 'GET_STRATEGY_CONFIG_FAILED',
        null,
        statusCode
      )
    }
  }
)

/**
 * PUT /:lottery_campaign_id/strategy-config
 * 批量更新某活动的策略配置
 * 通过 ServiceManager → CRUDService 写入（架构规范：写操作收口到 Service + 事务）
 *
 * 请求体示例：
 * {
 *   "config": {
 *     "pity": { "enabled": false },
 *     "anti_empty": { "enabled": true, "empty_streak_threshold": 5 },
 *     "grayscale": { "pity_percentage": 50 }
 *   }
 * }
 */
router.put(
  '/:lottery_campaign_id/strategy-config',
  authenticateToken,
  requireRoleLevel(100),
  async (req, res) => {
    try {
      const lottery_campaign_id = req.params.lottery_campaign_id
      const { config } = req.body

      const crudService = req.app.locals.services.getService('lottery_campaign_crud')

      const result = await TransactionManager.execute(async transaction => {
        return await crudService.updateStrategyConfig(lottery_campaign_id, config, {
          transaction,
          operator_user_id: req.user.user_id
        })
      })

      /* 更新后清除该活动的配置缓存 */
      const {
        DynamicConfigLoader
      } = require('../../../services/UnifiedLotteryEngine/compute/config/StrategyConfig')
      DynamicConfigLoader.clearCache(parseInt(lottery_campaign_id))

      return res.apiSuccess(result, '策略配置更新成功')
    } catch (error) {
      logger.error('更新策略配置失败:', error)
      const statusCode = error.statusCode || 500
      return res.apiError(
        `更新策略配置失败：${error.message}`,
        error.code || 'UPDATE_STRATEGY_CONFIG_FAILED',
        null,
        statusCode
      )
    }
  }
)

module.exports = router
