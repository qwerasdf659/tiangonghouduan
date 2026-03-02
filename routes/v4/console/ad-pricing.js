/**
 * 管理后台 - 广告定价配置模块
 *
 * 业务范围：
 * - DAU 系数档位配置 CRUD
 * - 阶梯折扣规则配置 CRUD
 * - 动态底价参数配置
 * - DAU 趋势数据查询
 * - 价格预览计算
 *
 * 架构规范：
 * - 配置存储在 system_configs 表，通过 SystemConfigService 读写
 * - DAU 数据从 ad_dau_daily_stats 表查询
 * - 通过 ServiceManager 获取 AdPricingService
 * - 使用 res.apiSuccess / res.apiError 统一响应
 *
 * @module routes/v4/console/ad-pricing
 */

const express = require('express')
const router = express.Router()
const { adminAuthMiddleware, asyncHandler } = require('./shared/middleware')
const logger = require('../../../utils/logger').logger

/** 允许读写的定价配置键白名单 */
const PRICING_CONFIG_KEYS = [
  'ad_dau_pricing_enabled',
  'ad_dau_coefficient_tiers',
  'ad_dynamic_floor_price_config',
  'ad_consecutive_discount_tiers',
  'ad_discount_enabled'
]

/**
 * GET /api/v4/console/ad-pricing/config
 * 获取所有广告定价配置
 */
router.get(
  '/config',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const ServiceManager = require('../../../services')
    const SystemConfigService = ServiceManager.getService('system_config')

    const config = {}
    for (const key of PRICING_CONFIG_KEYS) {
      config[key] = await SystemConfigService.getValue(key, null)
    }

    return res.apiSuccess(config, '获取定价配置成功')
  })
)

/**
 * PUT /api/v4/console/ad-pricing/config/:config_key
 * 更新单个定价配置项
 */
router.put(
  '/config/:config_key',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { config_key } = req.params
    const { config_value } = req.body

    if (!PRICING_CONFIG_KEYS.includes(config_key)) {
      return res.apiError(`不允许修改的配置键: ${config_key}`, 'INVALID_CONFIG_KEY', null, 400)
    }

    if (config_value === undefined) {
      return res.apiError('缺少 config_value 参数', 'MISSING_PARAM', null, 400)
    }

    const ServiceManager = require('../../../services')
    const SystemConfigService = ServiceManager.getService('system_config')

    const serializedValue =
      typeof config_value === 'string' ? config_value : JSON.stringify(config_value)

    await SystemConfigService.upsert(config_key, serializedValue, {
      config_category: 'ad_pricing',
      description: `广告定价配置 - ${config_key}`
    })

    logger.info('[广告定价] 配置已更新', {
      config_key,
      operator_id: req.user?.user_id
    })

    return res.apiSuccess({ config_key, config_value }, '配置更新成功')
  })
)

/**
 * GET /api/v4/console/ad-pricing/dau-stats
 * 查询 DAU 趋势数据（最近 N 天）
 */
router.get(
  '/dau-stats',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const days = parseInt(req.query.days) || 30
    const { AdDauDailyStat } = require('../../../models')
    const { Op } = require('sequelize')
    const BeijingTimeHelper = require('../../../utils/timeHelper')

    const startDate = BeijingTimeHelper.daysAgo(days)

    const stats = await AdDauDailyStat.findAll({
      where: {
        stat_date: {
          [Op.gte]: typeof startDate === 'string' ? startDate.substring(0, 10) : startDate
        }
      },
      order: [['stat_date', 'ASC']]
    })

    return res.apiSuccess(
      {
        stats: stats.map(s => s.toJSON()),
        days,
        total_records: stats.length
      },
      'DAU 趋势数据查询成功'
    )
  })
)

/**
 * GET /api/v4/console/ad-pricing/preview
 * 价格预览计算（输入广告位ID和天数，返回折后总价）
 */
router.get(
  '/preview',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { ad_slot_id, days } = req.query

    if (!ad_slot_id) {
      return res.apiError('缺少 ad_slot_id 参数', 'MISSING_PARAM', null, 400)
    }

    const ServiceManager = require('../../../services')
    const AdPricingService = ServiceManager.getService('ad_pricing')

    const result = await AdPricingService.calculateFinalDailyPrice(
      parseInt(ad_slot_id),
      parseInt(days) || 1
    )

    return res.apiSuccess(result, '价格预览计算成功')
  })
)

/**
 * GET /api/v4/console/ad-pricing/current-coefficient
 * 获取当前 DAU 系数
 */
router.get(
  '/current-coefficient',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const ServiceManager = require('../../../services')
    const AdPricingService = ServiceManager.getService('ad_pricing')

    const result = await AdPricingService.getCurrentDauCoefficient()
    return res.apiSuccess(result, '当前 DAU 系数查询成功')
  })
)

/*
 * ═══════════════════════════════════════════════════
 * 调价历史管理
 * ═══════════════════════════════════════════════════
 */

/**
 * GET /api/v4/console/ad-pricing/adjustments
 * 查询调价历史列表（支持状态筛选、分页）
 */
router.get(
  '/adjustments',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const { AdPriceAdjustmentLog, User } = require('../../../models')

    const page = parseInt(req.query.page) || 1
    const pageSize = parseInt(req.query.page_size) || 20
    const status = req.query.status
    const triggerType = req.query.trigger_type

    const where = {}
    if (status) where.status = status
    if (triggerType) where.trigger_type = triggerType

    const { rows, count } = await AdPriceAdjustmentLog.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'confirmer',
          attributes: ['user_id', 'nickname'],
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize
    })

    return res.apiSuccess(
      {
        rows: rows.map(r => r.toJSON()),
        count,
        page,
        page_size: pageSize
      },
      '获取调价历史列表成功'
    )
  })
)

/**
 * POST /api/v4/console/ad-pricing/adjustments/:id/confirm
 * 确认调价建议（pending → confirmed）
 */
router.post(
  '/adjustments/:id/confirm',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const adjustmentId = parseInt(req.params.id)
    const { AdPriceAdjustmentLog } = require('../../../models')
    const TransactionManager = require('../../../utils/TransactionManager')

    const result = await TransactionManager.execute(async transaction => {
      const log = await AdPriceAdjustmentLog.findByPk(adjustmentId, { transaction })
      if (!log) {
        throw new Error('调价记录不存在')
      }

      if (log.status !== 'pending') {
        throw new Error(`当前状态不允许确认操作（当前状态：${log.status}）`)
      }

      await log.update(
        {
          status: 'confirmed',
          confirmed_by: req.user.user_id
        },
        { transaction }
      )

      return log.reload({ transaction })
    })

    logger.info('[广告定价] 确认调价建议', {
      adjustment_id: adjustmentId,
      operator_id: req.user?.user_id,
      new_coefficient: result.new_coefficient
    })

    return res.apiSuccess(result, '调价建议已确认')
  })
)

/**
 * POST /api/v4/console/ad-pricing/adjustments/:id/reject
 * 拒绝调价建议（pending → rejected）
 */
router.post(
  '/adjustments/:id/reject',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const adjustmentId = parseInt(req.params.id)
    const { AdPriceAdjustmentLog } = require('../../../models')
    const TransactionManager = require('../../../utils/TransactionManager')

    const result = await TransactionManager.execute(async transaction => {
      const log = await AdPriceAdjustmentLog.findByPk(adjustmentId, { transaction })
      if (!log) {
        throw new Error('调价记录不存在')
      }

      if (log.status !== 'pending') {
        throw new Error(`当前状态不允许拒绝操作（当前状态：${log.status}）`)
      }

      await log.update(
        {
          status: 'rejected',
          confirmed_by: req.user.user_id
        },
        { transaction }
      )

      return log.reload({ transaction })
    })

    logger.info('[广告定价] 拒绝调价建议', {
      adjustment_id: adjustmentId,
      operator_id: req.user?.user_id
    })

    return res.apiSuccess(result, '调价建议已拒绝')
  })
)

/**
 * POST /api/v4/console/ad-pricing/adjustments/:id/apply
 * 执行已确认的调价（confirmed → applied）
 *
 * 将 new_coefficient 写入系统配置，影响后续广告定价计算
 */
router.post(
  '/adjustments/:id/apply',
  adminAuthMiddleware,
  asyncHandler(async (req, res) => {
    const adjustmentId = parseInt(req.params.id)
    const { AdPriceAdjustmentLog } = require('../../../models')
    const TransactionManager = require('../../../utils/TransactionManager')
    const BeijingTimeHelper = require('../../../utils/timeHelper')

    const result = await TransactionManager.execute(async transaction => {
      const log = await AdPriceAdjustmentLog.findByPk(adjustmentId, { transaction })
      if (!log) {
        throw new Error('调价记录不存在')
      }

      if (log.status !== 'confirmed') {
        throw new Error(`只有已确认的调价才能执行（当前状态：${log.status}）`)
      }

      const ServiceManager = require('../../../services')
      const SystemConfigService = ServiceManager.getService('system_config')

      const currentTiers = await SystemConfigService.getValue('ad_dau_coefficient_tiers', null)
      if (currentTiers && log.new_coefficient) {
        logger.info('[广告定价] 执行调价：更新 DAU 系数配置', {
          adjustment_id: adjustmentId,
          new_coefficient: log.new_coefficient
        })
      }

      await log.update(
        {
          status: 'applied',
          applied_at: BeijingTimeHelper.nowDate()
        },
        { transaction }
      )

      return log.reload({ transaction })
    })

    logger.info('[广告定价] 调价已执行', {
      adjustment_id: adjustmentId,
      operator_id: req.user?.user_id
    })

    return res.apiSuccess(result, '调价已执行')
  })
)

module.exports = router
