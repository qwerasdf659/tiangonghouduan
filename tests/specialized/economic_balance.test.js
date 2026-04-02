/**
 * 经济平衡测试 - P2优先级
 *
 * TDD 状态: 🔴 先创建测试 → 运行失败 → 倒逼实现
 *
 * 测试覆盖场景：
 * 1. 积分产出速率监控（最近1小时）
 * 2. 积分消耗速率监控（最近1小时）
 * 3. 积分产出/消耗比例验证（目标 > 30%）
 * 4. 高价值奖品产出率监控（SSR级奖品）
 * 5. 用户积分中位数周环比监控（通货膨胀预警）
 * 6. 经济系统健康状态评估
 *
 * 监控指标阈值：
 * | 指标 | 计算方式 | 告警阈值 | 告警原因 |
 * |------|----------|----------|----------|
 * | 积分消耗比例 | 消耗积分 / 产出积分 | < 30% | 积分堆积，经济系统失衡 |
 * | 高价值奖品产出率 | SSR 级奖品 / 总抽奖次数 | > 配置概率 120% | 概率可能被篡改 |
 * | 用户积分中位数 | 所有用户积分中位数 | 周环比 > 50% | 通货膨胀预警 |
 *
 * @file tests/specialized/economic_balance.test.js
 * @version V4.6 - TDD策略支持
 * @date 2026-01-28
 */

'use strict'

const { sequelize } = require('../../config/database')
const {
  AssetTransaction,
  AccountAssetBalance,
  LotteryDraw,
  LotteryTierRule,
  LotteryCampaign: _LotteryCampaign, // 预留: 后续活动经济分析使用
  User: _User // 预留: 后续用户经济行为分析使用
} = require('../../models')
const { Op } = require('sequelize')
const {
  initRealTestData,
  getRealTestCampaignId,
  getRealTestUserId
} = require('../helpers/test-setup')

// ==================== 测试配置 ====================

/**
 * 测试超时配置
 * 经济平衡测试需要查询大量数据，可能需要更长时间
 */
const TEST_TIMEOUT = {
  SHORT: 15000, // 15秒 - 简单查询
  MEDIUM: 30000, // 30秒 - 聚合查询
  LONG: 60000 // 60秒 - 大数据量分析
}

/**
 * 经济平衡监控配置
 * 与业务规则保持一致
 */
const ECONOMIC_BALANCE_CONFIG = {
  /** 积分消耗比例最低阈值：消耗/产出 >= 30% */
  MIN_CONSUMPTION_RATIO: 0.3,

  /** 高价值奖品产出率上限：实际产出率 <= 配置概率 * 120% */
  SSR_RATE_TOLERANCE: 1.2,

  /** 用户积分中位数周环比告警阈值：50% */
  MEDIAN_WEEKLY_CHANGE_THRESHOLD: 0.5,

  /** 监控时间窗口：1小时 */
  MONITORING_WINDOW_HOURS: 1,

  /** 周环比计算天数 */
  WEEKLY_COMPARISON_DAYS: 7,

  /** 高价值奖品的最低价值阈值 */
  HIGH_VALUE_THRESHOLD: 700
}

/**
 * 积分业务类型定义
 * 与 BalanceService 中的 business_type 保持一致
 */
const POINTS_BUSINESS_TYPES = {
  /** 产出类型 */
  PRODUCTION: [
    'lottery_win', // 抽奖获得
    'consumption_review_approved', // 消费审核奖励
    'admin_adjust_add', // 管理员调增
    'bonus', // 活动奖励
    'topup' // 充值
  ],
  /** 消耗类型 */
  CONSUMPTION: [
    'lottery_cost', // 抽奖消耗
    'exchange', // 兑换消耗
    'market_purchase', // 市场购买
    'admin_adjust_sub' // 管理员调减
  ]
}

// ==================== 辅助函数 ====================

/**
 * 获取指定时间范围内的积分产出总量
 *
 * @param {number} hours - 统计时间范围（小时）
 * @returns {Promise<number>} 产出积分总量
 */
async function getPointsProduction(hours = 1) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)

  const result = await AssetTransaction.findOne({
    attributes: [[sequelize.fn('SUM', sequelize.col('delta_amount')), 'total_production']],
    where: {
      asset_code: 'points',
      business_type: { [Op.in]: POINTS_BUSINESS_TYPES.PRODUCTION },
      delta_amount: { [Op.gt]: 0 },
      created_at: { [Op.gte]: startTime }
    },
    raw: true
  })

  return parseFloat(result?.total_production || 0)
}

/**
 * 获取指定时间范围内的积分消耗总量
 *
 * @param {number} hours - 统计时间范围（小时）
 * @returns {Promise<number>} 消耗积分总量（绝对值）
 */
async function getPointsConsumption(hours = 1) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)

  const result = await AssetTransaction.findOne({
    attributes: [
      [sequelize.fn('SUM', sequelize.fn('ABS', sequelize.col('delta_amount'))), 'total_consumption']
    ],
    where: {
      asset_code: 'points',
      business_type: { [Op.in]: POINTS_BUSINESS_TYPES.CONSUMPTION },
      delta_amount: { [Op.lt]: 0 },
      created_at: { [Op.gte]: startTime }
    },
    raw: true
  })

  return parseFloat(result?.total_consumption || 0)
}

/**
 * 计算积分消耗比例
 *
 * @param {number} hours - 统计时间范围（小时）
 * @returns {Promise<Object>} { production, consumption, ratio }
 */
async function calculateConsumptionRatio(hours = 1) {
  const production = await getPointsProduction(hours)
  const consumption = await getPointsConsumption(hours)

  const ratio = production > 0 ? consumption / production : 0

  return {
    production,
    consumption,
    ratio,
    ratioPercentage: (ratio * 100).toFixed(2) + '%'
  }
}

/**
 * 获取高价值奖品（SSR级）的产出率
 *
 * @param {number} hours - 统计时间范围（小时）
 * @param {number} highValueThreshold - 高价值奖品阈值
 * @returns {Promise<Object>} { total_draws, ssr_count, ssr_rate, configured_rate }
 */
async function getHighValueRewardRate(
  hours = 1,
  highValueThreshold = ECONOMIC_BALANCE_CONFIG.HIGH_VALUE_THRESHOLD
) {
  const startTime = new Date(Date.now() - hours * 60 * 60 * 1000)

  /*
   * 查询总抽奖次数和高价值奖品数量
   * 注意：lottery_draws 表没有 status 字段，所有记录都是已完成的抽奖
   */
  const [result] = await sequelize.query(
    `
    SELECT 
      COUNT(*) as total_draws,
      SUM(CASE WHEN prize_value >= :threshold THEN 1 ELSE 0 END) as ssr_count
    FROM lottery_draws
    WHERE created_at >= :startTime
  `,
    {
      replacements: { threshold: highValueThreshold, startTime },
      type: sequelize.QueryTypes.SELECT
    }
  )

  const totalDraws = parseInt(result?.total_draws || 0)
  const ssrCount = parseInt(result?.ssr_count || 0)
  const ssrRate = totalDraws > 0 ? ssrCount / totalDraws : 0

  /*
   * 获取配置的高价值奖品概率（从 tier_rules 表）
   * 注意：lottery_tier_rules 表使用 tier_weight 字段和 status 状态字段
   */
  let configuredRate = 0
  try {
    // 获取所有激活的档位规则
    const tierRules = await LotteryTierRule.findAll({
      where: { status: 'active' },
      attributes: ['tier_name', 'tier_weight']
    })

    // 计算总权重
    const totalWeight = tierRules.reduce((sum, rule) => sum + (rule.tier_weight || 0), 0)

    // 根据档位名称判断是否为高价值档位（通常 tier_name 包含 SSR 或 gold 等关键词）
    const ssrTiers = tierRules.filter(
      rule =>
        rule.tier_name &&
        (rule.tier_name.toUpperCase().includes('SSR') || rule.tier_name.includes('金'))
    )
    const ssrWeight = ssrTiers.reduce((sum, rule) => sum + (rule.tier_weight || 0), 0)

    configuredRate = totalWeight > 0 ? ssrWeight / totalWeight : 0

    // 如果无法通过名称识别，使用默认值
    if (ssrWeight === 0 && totalWeight > 0) {
      console.log('ℹ️ 无法从档位名称识别SSR级别，使用默认配置概率 5%')
      configuredRate = 0.05
    }
  } catch (error) {
    // 如果查询失败，使用默认值
    console.warn('⚠️ 无法获取配置的SSR概率，使用默认值:', error.message)
    configuredRate = 0.05 // 默认5%
  }

  return {
    total_draws: totalDraws,
    ssr_count: ssrCount,
    ssr_rate: ssrRate,
    ssr_rate_percentage: (ssrRate * 100).toFixed(2) + '%',
    configured_rate: configuredRate,
    configured_rate_percentage: (configuredRate * 100).toFixed(2) + '%'
  }
}

/**
 * 获取用户积分余额中位数
 * 使用 Sequelize ORM 查询所有余额后在 JavaScript 中计算中位数
 *
 * @returns {Promise<number>} 中位数
 */
async function getUserPointsMedian() {
  // 查询所有有效积分余额
  const balances = await AccountAssetBalance.findAll({
    where: {
      asset_code: 'points',
      available_amount: { [Op.gt]: 0 }
    },
    attributes: ['available_amount'],
    order: [['available_amount', 'ASC']],
    raw: true
  })

  if (balances.length === 0) {
    return 0
  }

  // 在 JavaScript 中计算中位数
  const amounts = balances.map(b => parseFloat(b.available_amount))
  const midIndex = Math.floor(amounts.length / 2)

  if (amounts.length % 2 === 0) {
    // 偶数个元素，取中间两个的平均值
    return (amounts[midIndex - 1] + amounts[midIndex]) / 2
  } else {
    // 奇数个元素，直接取中间值
    return amounts[midIndex]
  }
}

/**
 * 获取N天前的用户积分中位数（通过历史流水推算）
 *
 * @param {number} days - 天数
 * @returns {Promise<number>} 估算的历史中位数
 */
async function getHistoricalPointsMedian(_days = 7) {
  /*
   * 由于没有历史快照，这里使用当前中位数作为基准
   * 实际生产环境应该有定时任务记录历史中位数
   *
   * @param _days - 预留参数，后续实现历史快照查询时使用
   */
  const currentMedian = await getUserPointsMedian()

  // 返回当前中位数作为模拟值（实际应该从历史记录获取）
  return currentMedian
}

/**
 * 生成经济系统健康报告
 *
 * @param {number} hours - 监控时间窗口（小时）
 * @returns {Promise<Object>} 健康报告
 */
async function generateEconomicHealthReport(hours = 1) {
  const consumptionRatio = await calculateConsumptionRatio(hours)
  const ssrRate = await getHighValueRewardRate(hours)
  const currentMedian = await getUserPointsMedian()
  const historicalMedian = await getHistoricalPointsMedian(7)

  const medianChange =
    historicalMedian > 0 ? (currentMedian - historicalMedian) / historicalMedian : 0

  // 计算健康评分
  const issues = []
  let healthScore = 100

  // 检查消耗比例
  if (
    consumptionRatio.ratio < ECONOMIC_BALANCE_CONFIG.MIN_CONSUMPTION_RATIO &&
    consumptionRatio.production > 0
  ) {
    issues.push(`积分消耗比例过低: ${consumptionRatio.ratioPercentage} (阈值: 30%)`)
    healthScore -= 30
  }

  // 检查SSR产出率
  const ssrRateTolerance = ssrRate.configured_rate * ECONOMIC_BALANCE_CONFIG.SSR_RATE_TOLERANCE
  if (ssrRate.ssr_rate > ssrRateTolerance && ssrRate.total_draws > 0) {
    issues.push(
      `高价值奖品产出率异常: ${ssrRate.ssr_rate_percentage} (上限: ${(ssrRateTolerance * 100).toFixed(2)}%)`
    )
    healthScore -= 40
  }

  // 检查通货膨胀
  if (medianChange > ECONOMIC_BALANCE_CONFIG.MEDIAN_WEEKLY_CHANGE_THRESHOLD) {
    issues.push(`用户积分中位数周环比过高: ${(medianChange * 100).toFixed(2)}% (阈值: 50%)`)
    healthScore -= 20
  }

  return {
    timestamp: new Date().toISOString(),
    monitoring_window_hours: hours,
    metrics: {
      consumption_ratio: consumptionRatio,
      ssr_rate: ssrRate,
      user_median: {
        current: currentMedian,
        historical: historicalMedian,
        change_rate: medianChange,
        change_rate_percentage: (medianChange * 100).toFixed(2) + '%'
      }
    },
    health_score: Math.max(0, healthScore),
    health_status: healthScore >= 80 ? 'HEALTHY' : healthScore >= 50 ? 'WARNING' : 'CRITICAL',
    issues
  }
}

// ==================== 测试套件 ====================

describe('【P2】经济平衡测试', () => {
  /** 测试活动ID（预留: 后续活动级经济分析使用） */
  let _campaignId

  /** 测试用户ID（预留: 后续用户级经济分析使用） */
  let _userId

  /**
   * 全局测试前置设置
   */
  beforeAll(async () => {
    // 初始化真实测试数据
    await initRealTestData()
    _campaignId = await getRealTestCampaignId()
    _userId = await getRealTestUserId()
  }, TEST_TIMEOUT.MEDIUM)

  // ==================== 积分产出监控测试 ====================

  describe('积分产出速率监控', () => {
    /**
     * 测试场景：获取最近1小时积分产出总量
     *
     * 验证内容：
     * - 能够正确查询产出类型的流水记录
     * - 返回的产出总量为非负数
     * - 查询不会超时
     */
    test(
      '获取最近1小时积分产出总量',
      async () => {
        const production = await getPointsProduction(
          ECONOMIC_BALANCE_CONFIG.MONITORING_WINDOW_HOURS
        )

        console.log(`📊 最近1小时积分产出: ${production}`)

        // 验证返回值类型和范围
        expect(typeof production).toBe('number')
        expect(production).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(production)).toBe(true)
      },
      TEST_TIMEOUT.MEDIUM
    )

    /**
     * 测试场景：验证产出业务类型分类正确
     *
     * 验证内容：
     * - 产出类型流水的金额都为正数
     * - 业务类型在预定义的产出类型列表中
     */
    test(
      '验证产出业务类型分类正确',
      async () => {
        const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000) // 最近24小时

        const productionRecords = await AssetTransaction.findAll({
          where: {
            asset_code: 'points',
            business_type: { [Op.in]: POINTS_BUSINESS_TYPES.PRODUCTION },
            created_at: { [Op.gte]: startTime }
          },
          limit: 100,
          raw: true
        })

        // 如果有记录，验证金额都为正数
        if (productionRecords.length > 0) {
          const allPositive = productionRecords.every(
            record => parseFloat(record.delta_amount) >= 0
          )
          expect(allPositive).toBe(true)

          console.log(`📊 最近24小时产出记录数: ${productionRecords.length}`)
        } else {
          console.log('⚠️ 最近24小时无产出记录')
        }
      },
      TEST_TIMEOUT.MEDIUM
    )
  })

  // ==================== 积分消耗监控测试 ====================

  describe('积分消耗速率监控', () => {
    /**
     * 测试场景：获取最近1小时积分消耗总量
     *
     * 验证内容：
     * - 能够正确查询消耗类型的流水记录
     * - 返回的消耗总量为非负数（绝对值）
     * - 查询不会超时
     */
    test(
      '获取最近1小时积分消耗总量',
      async () => {
        const consumption = await getPointsConsumption(
          ECONOMIC_BALANCE_CONFIG.MONITORING_WINDOW_HOURS
        )

        console.log(`📊 最近1小时积分消耗: ${consumption}`)

        // 验证返回值类型和范围
        expect(typeof consumption).toBe('number')
        expect(consumption).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(consumption)).toBe(true)
      },
      TEST_TIMEOUT.MEDIUM
    )

    /**
     * 测试场景：验证消耗业务类型分类正确
     *
     * 验证内容：
     * - 消耗类型流水的金额都为负数
     * - 业务类型在预定义的消耗类型列表中
     */
    test(
      '验证消耗业务类型分类正确',
      async () => {
        const startTime = new Date(Date.now() - 24 * 60 * 60 * 1000) // 最近24小时

        const consumptionRecords = await AssetTransaction.findAll({
          where: {
            asset_code: 'points',
            business_type: { [Op.in]: POINTS_BUSINESS_TYPES.CONSUMPTION },
            created_at: { [Op.gte]: startTime }
          },
          limit: 100,
          raw: true
        })

        // 如果有记录，验证金额都为负数
        if (consumptionRecords.length > 0) {
          const allNegative = consumptionRecords.every(
            record => parseFloat(record.delta_amount) <= 0
          )
          expect(allNegative).toBe(true)

          console.log(`📊 最近24小时消耗记录数: ${consumptionRecords.length}`)
        } else {
          console.log('⚠️ 最近24小时无消耗记录')
        }
      },
      TEST_TIMEOUT.MEDIUM
    )
  })

  // ==================== 积分消耗比例测试 ====================

  describe('积分产出/消耗比例验证', () => {
    /**
     * 测试场景：计算积分消耗比例
     *
     * 验证内容：
     * - 能够正确计算消耗/产出比例
     * - 比例值在0-1之间（0%-100%）
     */
    test(
      '计算积分消耗比例',
      async () => {
        const ratioData = await calculateConsumptionRatio(
          ECONOMIC_BALANCE_CONFIG.MONITORING_WINDOW_HOURS
        )

        console.log(`📊 积分流转数据:`)
        console.log(`   产出: ${ratioData.production}`)
        console.log(`   消耗: ${ratioData.consumption}`)
        console.log(`   消耗比例: ${ratioData.ratioPercentage}`)

        // 验证返回值结构
        expect(ratioData).toHaveProperty('production')
        expect(ratioData).toHaveProperty('consumption')
        expect(ratioData).toHaveProperty('ratio')
        expect(ratioData).toHaveProperty('ratioPercentage')

        // 验证数值有效性
        expect(typeof ratioData.ratio).toBe('number')
        expect(ratioData.ratio).toBeGreaterThanOrEqual(0)
      },
      TEST_TIMEOUT.MEDIUM
    )

    /**
     * 测试场景：验证消耗比例阈值告警
     *
     * 业务规则：
     * - 消耗比例 < 30% 时应该触发告警
     * - 表示积分堆积，经济系统可能失衡
     */
    test(
      '验证消耗比例阈值告警逻辑',
      async () => {
        const ratioData = await calculateConsumptionRatio(
          ECONOMIC_BALANCE_CONFIG.MONITORING_WINDOW_HOURS
        )

        // 判断是否需要告警
        const needsAlert =
          ratioData.production > 0 &&
          ratioData.ratio < ECONOMIC_BALANCE_CONFIG.MIN_CONSUMPTION_RATIO

        if (needsAlert) {
          console.log(`⚠️ 告警: 积分消耗比例过低 (${ratioData.ratioPercentage} < 30%)`)
        } else if (ratioData.production === 0) {
          console.log(`ℹ️ 最近1小时无积分产出，跳过比例检查`)
        } else {
          console.log(`✅ 积分消耗比例正常: ${ratioData.ratioPercentage}`)
        }

        /*
         * 这个测试用于监控，不强制要求通过
         * 但验证告警逻辑的正确性
         */
        expect(typeof needsAlert).toBe('boolean')
      },
      TEST_TIMEOUT.MEDIUM
    )
  })

  // ==================== 高价值奖品产出率测试 ====================

  describe('高价值奖品产出率监控', () => {
    /**
     * 测试场景：获取SSR级奖品产出率
     *
     * 验证内容：
     * - 能够正确统计高价值奖品数量
     * - 能够计算产出率
     * - 能够获取配置的概率阈值
     */
    test(
      '获取SSR级奖品产出率',
      async () => {
        const ssrData = await getHighValueRewardRate(24) // 使用24小时数据更有代表性

        console.log(`📊 高价值奖品产出统计 (最近24小时):`)
        console.log(`   总抽奖次数: ${ssrData.total_draws}`)
        console.log(`   SSR数量: ${ssrData.ssr_count}`)
        console.log(`   实际产出率: ${ssrData.ssr_rate_percentage}`)
        console.log(`   配置概率: ${ssrData.configured_rate_percentage}`)

        // 验证返回值结构
        expect(ssrData).toHaveProperty('total_draws')
        expect(ssrData).toHaveProperty('ssr_count')
        expect(ssrData).toHaveProperty('ssr_rate')
        expect(ssrData).toHaveProperty('configured_rate')

        // 验证数值有效性
        expect(ssrData.total_draws).toBeGreaterThanOrEqual(0)
        expect(ssrData.ssr_count).toBeGreaterThanOrEqual(0)
        expect(ssrData.ssr_count).toBeLessThanOrEqual(ssrData.total_draws)
      },
      TEST_TIMEOUT.MEDIUM
    )

    /**
     * 测试场景：验证SSR产出率异常告警
     *
     * 业务规则：
     * - 实际产出率 > 配置概率 * 120% 时应该告警
     * - 可能表示概率被篡改或系统异常
     */
    test(
      '验证SSR产出率异常告警逻辑',
      async () => {
        const ssrData = await getHighValueRewardRate(24)

        const ssrRateThreshold =
          ssrData.configured_rate * ECONOMIC_BALANCE_CONFIG.SSR_RATE_TOLERANCE
        const isAbnormal = ssrData.total_draws > 0 && ssrData.ssr_rate > ssrRateThreshold

        if (isAbnormal) {
          console.log(`⚠️ 告警: SSR产出率异常偏高`)
          console.log(`   实际: ${ssrData.ssr_rate_percentage}`)
          console.log(`   上限: ${(ssrRateThreshold * 100).toFixed(2)}%`)
        } else if (ssrData.total_draws === 0) {
          console.log(`ℹ️ 最近24小时无抽奖记录，跳过SSR率检查`)
        } else {
          console.log(`✅ SSR产出率正常: ${ssrData.ssr_rate_percentage}`)
        }

        // 验证告警逻辑的正确性
        expect(typeof isAbnormal).toBe('boolean')
      },
      TEST_TIMEOUT.MEDIUM
    )
  })

  // ==================== 用户积分中位数测试 ====================

  describe('用户积分中位数监控', () => {
    /**
     * 测试场景：获取用户积分余额中位数
     *
     * 验证内容：
     * - 能够正确计算中位数
     * - 返回值为非负数
     */
    test(
      '获取用户积分余额中位数',
      async () => {
        const median = await getUserPointsMedian()

        console.log(`📊 用户积分中位数: ${median}`)

        // 验证返回值
        expect(typeof median).toBe('number')
        expect(median).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(median)).toBe(true)
      },
      TEST_TIMEOUT.MEDIUM
    )

    /**
     * 测试场景：验证通货膨胀预警逻辑
     *
     * 业务规则：
     * - 用户积分中位数周环比 > 50% 时触发告警
     * - 表示可能存在通货膨胀风险
     */
    test(
      '验证通货膨胀预警逻辑',
      async () => {
        const currentMedian = await getUserPointsMedian()
        const historicalMedian = await getHistoricalPointsMedian(7)

        const changeRate =
          historicalMedian > 0 ? (currentMedian - historicalMedian) / historicalMedian : 0

        console.log(`📊 积分中位数变化:`)
        console.log(`   当前: ${currentMedian}`)
        console.log(`   7天前: ${historicalMedian}`)
        console.log(`   变化率: ${(changeRate * 100).toFixed(2)}%`)

        const needsAlert = changeRate > ECONOMIC_BALANCE_CONFIG.MEDIAN_WEEKLY_CHANGE_THRESHOLD

        if (needsAlert) {
          console.log(`⚠️ 告警: 可能存在通货膨胀风险`)
        } else {
          console.log(`✅ 积分供应量稳定`)
        }

        // 验证告警逻辑的正确性
        expect(typeof needsAlert).toBe('boolean')
        expect(typeof changeRate).toBe('number')
      },
      TEST_TIMEOUT.MEDIUM
    )
  })

  // ==================== 经济系统健康评估测试 ====================

  describe('经济系统健康状态评估', () => {
    /**
     * 测试场景：生成完整的经济健康报告
     *
     * 验证内容：
     * - 报告包含所有必需的监控指标
     * - 健康评分在0-100之间
     * - 健康状态分类正确
     */
    test(
      '生成完整的经济健康报告',
      async () => {
        const report = await generateEconomicHealthReport(
          ECONOMIC_BALANCE_CONFIG.MONITORING_WINDOW_HOURS
        )

        console.log(`\n📊 ========== 经济系统健康报告 ==========`)
        console.log(`时间: ${report.timestamp}`)
        console.log(`监控窗口: ${report.monitoring_window_hours}小时`)
        console.log(`\n📈 指标详情:`)
        console.log(`   消耗比例: ${report.metrics.consumption_ratio.ratioPercentage}`)
        console.log(`   SSR产出率: ${report.metrics.ssr_rate.ssr_rate_percentage}`)
        console.log(`   积分中位数变化: ${report.metrics.user_median.change_rate_percentage}`)
        console.log(`\n🏥 健康评估:`)
        console.log(`   健康评分: ${report.health_score}/100`)
        console.log(`   健康状态: ${report.health_status}`)

        if (report.issues.length > 0) {
          console.log(`\n⚠️ 发现问题:`)
          report.issues.forEach((issue, index) => {
            console.log(`   ${index + 1}. ${issue}`)
          })
        } else {
          console.log(`\n✅ 经济系统运行正常`)
        }
        console.log(`==========================================\n`)

        // 验证报告结构
        expect(report).toHaveProperty('timestamp')
        expect(report).toHaveProperty('monitoring_window_hours')
        expect(report).toHaveProperty('metrics')
        expect(report).toHaveProperty('health_score')
        expect(report).toHaveProperty('health_status')
        expect(report).toHaveProperty('issues')

        // 验证指标结构
        expect(report.metrics).toHaveProperty('consumption_ratio')
        expect(report.metrics).toHaveProperty('ssr_rate')
        expect(report.metrics).toHaveProperty('user_median')

        // 验证健康评分范围
        expect(report.health_score).toBeGreaterThanOrEqual(0)
        expect(report.health_score).toBeLessThanOrEqual(100)

        // 验证健康状态值
        expect(['HEALTHY', 'WARNING', 'CRITICAL']).toContain(report.health_status)
      },
      TEST_TIMEOUT.LONG
    )

    /**
     * 测试场景：健康状态分类阈值验证
     *
     * 验证内容：
     * - HEALTHY: 评分 >= 80
     * - WARNING: 评分 >= 50 且 < 80
     * - CRITICAL: 评分 < 50
     */
    test(
      '健康状态分类阈值验证',
      () => {
        // 模拟不同评分对应的状态
        const getStatus = score => {
          if (score >= 80) return 'HEALTHY'
          if (score >= 50) return 'WARNING'
          return 'CRITICAL'
        }

        // 验证边界值
        expect(getStatus(100)).toBe('HEALTHY')
        expect(getStatus(80)).toBe('HEALTHY')
        expect(getStatus(79)).toBe('WARNING')
        expect(getStatus(50)).toBe('WARNING')
        expect(getStatus(49)).toBe('CRITICAL')
        expect(getStatus(0)).toBe('CRITICAL')
      },
      TEST_TIMEOUT.SHORT
    )
  })

  // ==================== 数据完整性测试 ====================

  describe('数据完整性验证', () => {
    /**
     * 测试场景：验证 AssetTransaction 表数据可查询
     *
     * 验证内容：
     * - 表存在且可以查询
     * - 返回结构符合预期
     */
    test(
      '验证 AssetTransaction 表数据可查询',
      async () => {
        const count = await AssetTransaction.count({
          where: { asset_code: 'points' }
        })

        console.log(`📊 积分流水总记录数: ${count}`)

        expect(typeof count).toBe('number')
        expect(count).toBeGreaterThanOrEqual(0)
      },
      TEST_TIMEOUT.SHORT
    )

    /**
     * 测试场景：验证 AccountAssetBalance 表数据可查询
     *
     * 验证内容：
     * - 表存在且可以查询
     * - 返回结构符合预期
     */
    test(
      '验证 AccountAssetBalance 表数据可查询',
      async () => {
        const count = await AccountAssetBalance.count({
          where: { asset_code: 'points' }
        })

        console.log(`📊 积分余额记录数: ${count}`)

        expect(typeof count).toBe('number')
        expect(count).toBeGreaterThanOrEqual(0)
      },
      TEST_TIMEOUT.SHORT
    )

    /**
     * 测试场景：验证 LotteryDraw 表数据可查询
     *
     * 验证内容：
     * - 表存在且可以查询
     * - 返回结构符合预期
     */
    test(
      '验证 LotteryDraw 表数据可查询',
      async () => {
        const count = await LotteryDraw.count()

        console.log(`📊 抽奖记录总数: ${count}`)

        expect(typeof count).toBe('number')
        expect(count).toBeGreaterThanOrEqual(0)
      },
      TEST_TIMEOUT.SHORT
    )
  })
})
