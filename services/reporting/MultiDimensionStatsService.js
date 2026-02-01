/**
 * 多维度统计服务（B-25/B-27 任务实现）
 *
 * @description 提供多维度组合统计和下钻明细查询功能
 * @see docs/后端数据库开发任务清单-2026年1月.md B-25, B-27
 *
 * 功能列表：
 * - getMultiDimensionStats() - 多维度组合统计（B-25）
 * - getDrillDownDetails() - 下钻明细查询（B-27）
 *
 * 支持的维度：
 * - store: 门店维度
 * - campaign: 活动维度
 * - time: 时间维度（日/周/月）
 * - user_level: 用户等级维度
 *
 * 支持的指标：
 * - draws: 抽奖次数
 * - consumption: 消费金额
 * - users: 活跃用户数
 * - win_rate: 中奖率
 *
 * 技术框架对齐：
 * - 复用 BusinessCacheHelper 缓存
 * - 复用 BeijingTimeHelper 时间处理
 * - 统一 snake_case 命名
 * - 北京时间全链路
 *
 * @module services/reporting/MultiDimensionStatsService
 * @version 1.0.0
 * @date 2026-01-31
 */

'use strict'

const { Op, fn, col, literal } = require('sequelize')
const models = require('../../models')
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../utils/timeHelper')
const logger = require('../../utils/logger').logger

/**
 * 支持的维度配置
 * @constant {Object}
 */
const DIMENSION_CONFIG = {
  store: {
    field: 'store_id',
    label: '门店',
    // 门店维度需要关联查询门店名称
    join_table: 'stores',
    name_field: 'store_name'
  },
  campaign: {
    field: 'lottery_campaign_id',
    label: '活动',
    join_table: 'lottery_campaigns',
    name_field: 'name'
  },
  time: {
    field: 'created_at',
    label: '时间',
    // 时间维度根据 period 参数动态处理
    formats: {
      day: '%Y-%m-%d',
      week: '%Y-W%u',
      month: '%Y-%m'
    }
  },
  user_level: {
    field: 'user_id',
    label: '用户等级',
    // 需要关联用户表获取等级信息
    join_table: 'users',
    name_field: 'nickname'
  }
}

/**
 * 支持的指标配置
 * @constant {Object}
 */
const METRIC_CONFIG = {
  draws: {
    label: '抽奖次数',
    aggregate: 'COUNT',
    source_table: 'lottery_draws',
    field: 'lottery_draw_id'
  },
  consumption: {
    label: '消费金额',
    aggregate: 'SUM',
    source_table: 'consumption_records',
    field: 'consumption_amount'
  },
  users: {
    label: '活跃用户',
    aggregate: 'COUNT_DISTINCT',
    source_table: 'lottery_draws',
    field: 'user_id'
  },
  win_rate: {
    label: '中奖率',
    aggregate: 'CUSTOM',
    // 中奖率需要特殊计算
    source_table: 'lottery_draws'
  }
}

/**
 * 时间周期配置
 * @constant {Object}
 */
const PERIOD_CONFIG = {
  day: {
    label: '按日',
    days: 1,
    format: '%Y-%m-%d',
    compare_offset: 1 // 环比偏移天数
  },
  week: {
    label: '按周',
    days: 7,
    format: '%Y-W%u',
    compare_offset: 7
  },
  month: {
    label: '按月',
    days: 30,
    format: '%Y-%m',
    compare_offset: 30
  }
}

/**
 * 缓存配置
 * @constant {Object}
 */
const CACHE_CONFIG = {
  TTL: 300, // 5分钟缓存
  KEY_PREFIX: 'multi_dimension_stats'
}

/**
 * 多维度统计服务类
 *
 * @class MultiDimensionStatsService
 */
class MultiDimensionStatsService {
  /**
   * 获取多维度统计数据（B-25 实现）
   *
   * @description 支持门店/时间/活动等多维度组合统计
   *
   * @param {Object} params - 查询参数
   * @param {string} params.dimensions - 维度列表，逗号分隔（如 "store,time"）
   * @param {string} params.metrics - 指标列表，逗号分隔（如 "draws,consumption"）
   * @param {string} [params.period='week'] - 时间周期：day/week/month
   * @param {string} [params.compare] - 对比类型：wow(周环比)/mom(月环比)/yoy(同比)
   * @param {Date} [params.start_date] - 开始日期
   * @param {Date} [params.end_date] - 结束日期
   * @param {number} [params.store_id] - 门店ID过滤
   * @param {number} [params.lottery_campaign_id] - 活动ID过滤
   * @param {Object} [options={}] - 选项
   * @param {boolean} [options.refresh=false] - 是否强制刷新缓存
   * @returns {Promise<Object>} 多维度统计结果
   *
   * @example
   * // 按门店+时间维度，统计抽奖和消费
   * const result = await MultiDimensionStatsService.getMultiDimensionStats({
   *   dimensions: 'store,time',
   *   metrics: 'draws,consumption',
   *   period: 'week',
   *   compare: 'wow'
   * })
   */
  static async getMultiDimensionStats(params, options = {}) {
    const { refresh = false } = options

    try {
      // ========== 1. 参数验证和解析 ==========
      const {
        dimensions: dimensionsStr,
        metrics: metricsStr,
        period = 'week',
        compare,
        start_date,
        end_date,
        store_id,
        lottery_campaign_id
      } = params

      // 解析维度和指标
      const dimensions = this._parseDimensions(dimensionsStr)
      const metrics = this._parseMetrics(metricsStr)
      // 计算时间范围
      const { startTime, endTime, compareStartTime, compareEndTime } = this._calculateTimeRange(
        start_date,
        end_date,
        period,
        compare
      )

      // ========== 2. 缓存检查 ==========
      const cacheParams = {
        dimensions: dimensions.join(','),
        metrics: metrics.join(','),
        period,
        compare: compare || 'none',
        start: startTime.toISOString().split('T')[0],
        end: endTime.toISOString().split('T')[0],
        store_id: store_id || 'all',
        lottery_campaign_id: lottery_campaign_id || 'all'
      }

      if (!refresh) {
        const cached = await BusinessCacheHelper.getStats(CACHE_CONFIG.KEY_PREFIX, cacheParams)
        if (cached) {
          logger.debug('[多维度统计] 缓存命中', cacheParams)
          return cached
        }
      }

      logger.info('[多维度统计] 开始查询', {
        dimensions,
        metrics,
        period,
        compare,
        time_range: { start: startTime, end: endTime }
      })

      // ========== 3. 构建查询 ==========
      const whereClause = this._buildWhereClause(startTime, endTime, {
        store_id,
        lottery_campaign_id
      })
      const groupByFields = this._buildGroupByFields(dimensions, period)

      // ========== 4. 执行主查询 ==========
      const currentData = await this._executeMultiDimensionQuery(
        dimensions,
        metrics,
        whereClause,
        groupByFields,
        period
      )

      // ========== 5. 执行对比查询（如果需要）==========
      let compareData = []
      if (compare && compareStartTime && compareEndTime) {
        const compareWhereClause = this._buildWhereClause(compareStartTime, compareEndTime, {
          store_id,
          lottery_campaign_id
        })
        compareData = await this._executeMultiDimensionQuery(
          dimensions,
          metrics,
          compareWhereClause,
          groupByFields,
          period
        )
      }

      // ========== 6. 合并数据并计算变化率 ==========
      const rows = this._mergeAndCalculateChange(currentData, compareData, metrics, compare)

      // ========== 7. 计算汇总数据 ==========
      const summary = this._calculateSummary(rows, metrics)

      // ========== 8. 组装响应 ==========
      const result = {
        dimensions,
        metrics,
        period,
        compare: compare || null,
        time_range: {
          start: BeijingTimeHelper.apiTimestamp(startTime),
          end: BeijingTimeHelper.apiTimestamp(endTime)
        },
        rows,
        summary,
        row_count: rows.length,
        generated_at: BeijingTimeHelper.apiTimestamp()
      }

      // ========== 9. 写入缓存 ==========
      await BusinessCacheHelper.setStats(
        CACHE_CONFIG.KEY_PREFIX,
        cacheParams,
        result,
        CACHE_CONFIG.TTL
      )

      logger.info('[多维度统计] 查询完成', {
        row_count: rows.length,
        dimensions,
        metrics
      })

      return result
    } catch (error) {
      logger.error('[多维度统计] 查询失败', {
        error: error.message,
        stack: error.stack,
        params
      })
      throw error
    }
  }

  /**
   * 下钻明细查询（B-27 实现）
   *
   * @description 从汇总数据下钻到明细记录
   *
   * @param {Object} params - 查询参数
   * @param {string} params.source - 数据源：lottery/consumption
   * @param {Object} params.filters - 过滤条件（来自汇总行的维度值）
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {string} [params.sort_by='created_at'] - 排序字段
   * @param {string} [params.sort_order='DESC'] - 排序方向
   * @returns {Promise<Object>} 明细数据和分页信息
   *
   * @example
   * // 下钻查询某门店某周的抽奖明细
   * const details = await MultiDimensionStatsService.getDrillDownDetails({
   *   source: 'lottery',
   *   filters: {
   *     store_id: 1,
   *     period: '2026-W04'
   *   },
   *   page: 1,
   *   page_size: 20
   * })
   */
  static async getDrillDownDetails(params) {
    try {
      const {
        source,
        filters = {},
        page = 1,
        page_size = 20,
        sort_by = 'created_at',
        sort_order = 'DESC'
      } = params

      // ========== 1. 验证数据源 ==========
      const validSources = ['lottery', 'consumption']
      if (!validSources.includes(source)) {
        const error = new Error(`无效的数据源: ${source}，支持: ${validSources.join(', ')}`)
        error.code = 'INVALID_SOURCE'
        throw error
      }

      logger.info('[下钻查询] 开始', { source, filters, page, page_size })

      // ========== 2. 根据数据源选择模型和字段 ==========
      const modelConfig = this._getModelConfig(source)

      // ========== 3. 构建查询条件 ==========
      const whereClause = this._buildDrillDownWhereClause(filters, modelConfig)

      // ========== 4. 执行查询 ==========
      const offset = (page - 1) * page_size
      const limit = Math.min(page_size, 100) // 最大100条

      const [rows, totalCount] = await Promise.all([
        modelConfig.model.findAll({
          where: whereClause,
          include: modelConfig.includes,
          order: [[sort_by, sort_order.toUpperCase()]],
          offset,
          limit,
          raw: false
        }),
        modelConfig.model.count({ where: whereClause })
      ])

      // ========== 5. 格式化数据 ==========
      const formattedRows = rows.map(row => this._formatDrillDownRow(row, source))

      // ========== 6. 计算分页信息 ==========
      const totalPages = Math.ceil(totalCount / page_size)

      const result = {
        source,
        filters,
        rows: formattedRows,
        pagination: {
          page,
          page_size,
          total_count: totalCount,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1
        },
        generated_at: BeijingTimeHelper.apiTimestamp()
      }

      logger.info('[下钻查询] 完成', {
        source,
        total_count: totalCount,
        returned_count: formattedRows.length
      })

      return result
    } catch (error) {
      logger.error('[下钻查询] 失败', {
        error: error.message,
        stack: error.stack,
        params
      })
      throw error
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 解析维度参数
   *
   * @private
   * @param {string} dimensionsStr - 维度参数字符串（逗号分隔）
   * @returns {string[]} 解析后的维度数组
   * @throws {Error} 当缺少维度参数或维度无效时抛出错误
   */
  static _parseDimensions(dimensionsStr) {
    if (!dimensionsStr) {
      const error = new Error('缺少必需参数: dimensions')
      error.code = 'MISSING_DIMENSIONS'
      throw error
    }

    const dimensions = dimensionsStr.split(',').map(d => d.trim().toLowerCase())
    const validDimensions = Object.keys(DIMENSION_CONFIG)

    for (const dim of dimensions) {
      if (!validDimensions.includes(dim)) {
        const error = new Error(`无效的维度: ${dim}，支持: ${validDimensions.join(', ')}`)
        error.code = 'INVALID_DIMENSION'
        throw error
      }
    }

    return dimensions
  }

  /**
   * 解析指标参数
   *
   * @private
   * @param {string} metricsStr - 指标参数字符串（逗号分隔）
   * @returns {string[]} 解析后的指标数组
   * @throws {Error} 当缺少指标参数或指标无效时抛出错误
   */
  static _parseMetrics(metricsStr) {
    if (!metricsStr) {
      const error = new Error('缺少必需参数: metrics')
      error.code = 'MISSING_METRICS'
      throw error
    }

    const metrics = metricsStr.split(',').map(m => m.trim().toLowerCase())
    const validMetrics = Object.keys(METRIC_CONFIG)

    for (const metric of metrics) {
      if (!validMetrics.includes(metric)) {
        const error = new Error(`无效的指标: ${metric}，支持: ${validMetrics.join(', ')}`)
        error.code = 'INVALID_METRIC'
        throw error
      }
    }

    return metrics
  }

  /**
   * 计算时间范围
   *
   * @private
   * @param {string|Date} startDate - 开始日期
   * @param {string|Date} endDate - 结束日期
   * @param {string} period - 时间周期（day/week/month）
   * @param {string} compare - 对比类型（wow/mom/yoy）
   * @returns {Object} 时间范围对象 { startTime, endTime, compareStartTime, compareEndTime }
   */
  static _calculateTimeRange(startDate, endDate, period, compare) {
    const now = BeijingTimeHelper.createBeijingTime()

    // 结束时间：默认今天
    const endTime = endDate ? new Date(endDate) : now
    endTime.setHours(23, 59, 59, 999)

    // 开始时间：默认过去30天
    const startTime = startDate
      ? new Date(startDate)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    startTime.setHours(0, 0, 0, 0)

    // 对比时间范围
    let compareStartTime = null
    let compareEndTime = null

    if (compare) {
      const duration = endTime.getTime() - startTime.getTime()

      switch (compare) {
        case 'wow': // 周环比
          compareEndTime = new Date(startTime.getTime() - 1)
          compareStartTime = new Date(compareEndTime.getTime() - duration)
          break
        case 'mom': // 月环比
          compareEndTime = new Date(startTime.getTime() - 1)
          compareStartTime = new Date(compareEndTime.getTime() - duration)
          break
        case 'yoy': // 同比
          compareEndTime = new Date(endTime.getTime() - 365 * 24 * 60 * 60 * 1000)
          compareStartTime = new Date(startTime.getTime() - 365 * 24 * 60 * 60 * 1000)
          break
      }
    }

    return { startTime, endTime, compareStartTime, compareEndTime }
  }

  /**
   * 构建WHERE条件
   *
   * @private
   * @param {Date} startTime - 开始时间
   * @param {Date} endTime - 结束时间
   * @param {Object} filters - 过滤条件
   * @returns {Object} Sequelize WHERE 条件对象
   */
  static _buildWhereClause(startTime, endTime, filters = {}) {
    const where = {
      created_at: {
        [Op.between]: [startTime, endTime]
      }
    }

    if (filters.store_id) {
      where.store_id = filters.store_id
    }

    if (filters.lottery_campaign_id) {
      where.lottery_campaign_id = filters.lottery_campaign_id
    }

    return where
  }

  /**
   * 构建GROUP BY字段
   *
   * @private
   * @param {string[]} dimensions - 维度数组
   * @param {string} period - 时间周期
   * @returns {Array} GROUP BY 字段数组
   */
  static _buildGroupByFields(dimensions, period) {
    const groupByFields = []
    const periodConfig = PERIOD_CONFIG[period] || PERIOD_CONFIG.week

    for (const dim of dimensions) {
      if (dim === 'time') {
        // 时间维度使用DATE_FORMAT
        groupByFields.push(literal(`DATE_FORMAT(created_at, '${periodConfig.format}')`))
      } else {
        const config = DIMENSION_CONFIG[dim]
        groupByFields.push(config.field)
      }
    }

    return groupByFields
  }

  /**
   * 执行多维度查询
   *
   * @private
   * @param {string[]} dimensions - 维度数组
   * @param {string[]} metrics - 指标数组
   * @param {Object} whereClause - WHERE条件
   * @param {Array} groupByFields - GROUP BY字段
   * @param {string} period - 时间周期
   * @returns {Promise<Array>} 查询结果数组
   */
  static async _executeMultiDimensionQuery(
    dimensions,
    metrics,
    whereClause,
    groupByFields,
    period
  ) {
    const periodConfig = PERIOD_CONFIG[period] || PERIOD_CONFIG.week

    // 构建SELECT字段
    const selectAttrs = []

    // 添加维度字段
    for (const dim of dimensions) {
      if (dim === 'time') {
        selectAttrs.push([literal(`DATE_FORMAT(created_at, '${periodConfig.format}')`), 'period'])
      } else {
        const config = DIMENSION_CONFIG[dim]
        selectAttrs.push(config.field)
      }
    }

    // 添加指标字段
    for (const metric of metrics) {
      const config = METRIC_CONFIG[metric]

      if (config.aggregate === 'COUNT') {
        selectAttrs.push([fn('COUNT', col(config.field)), metric])
      } else if (config.aggregate === 'SUM') {
        selectAttrs.push([fn('SUM', col(config.field)), metric])
      } else if (config.aggregate === 'COUNT_DISTINCT') {
        selectAttrs.push([fn('COUNT', fn('DISTINCT', col(config.field))), metric])
      } else if (metric === 'win_rate') {
        // 中奖率特殊计算
        selectAttrs.push([
          literal(
            `ROUND(SUM(CASE WHEN reward_tier IN ('high', 'mid', 'low') THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2)`
          ),
          'win_rate'
        ])
      }
    }

    // 确定主查询表
    const primaryMetric = metrics[0]
    const primaryConfig = METRIC_CONFIG[primaryMetric]

    let model
    if (primaryConfig.source_table === 'lottery_draws') {
      model = models.LotteryDraw
    } else if (primaryConfig.source_table === 'consumption_records') {
      model = models.ConsumptionRecord
    } else {
      model = models.LotteryDraw
    }

    // 执行查询
    const results = await model.findAll({
      attributes: selectAttrs,
      where: whereClause,
      group: groupByFields,
      raw: true
    })

    return results
  }

  /**
   * 合并数据并计算变化率
   *
   * @private
   * @param {Array} currentData - 当前时间段数据
   * @param {Array} compareData - 对比时间段数据
   * @param {string[]} metrics - 指标数组
   * @param {string} compare - 对比类型（wow/mom/yoy）
   * @returns {Array} 合并后的数据（包含变化率）
   */
  static _mergeAndCalculateChange(currentData, compareData, metrics, compare) {
    if (!compare || compareData.length === 0) {
      return currentData.map(row => ({
        ...row,
        ...metrics.reduce((acc, m) => {
          acc[m] = parseFloat(row[m]) || 0
          return acc
        }, {})
      }))
    }

    // 创建对比数据的Map
    const compareMap = new Map()
    for (const row of compareData) {
      const key = this._buildRowKey(row)
      compareMap.set(key, row)
    }

    // 合并并计算变化率
    return currentData.map(row => {
      const key = this._buildRowKey(row)
      const compareRow = compareMap.get(key)

      const result = { ...row }

      for (const metric of metrics) {
        const currentValue = parseFloat(row[metric]) || 0
        result[metric] = currentValue

        if (compareRow) {
          const previousValue = parseFloat(compareRow[metric]) || 0
          const change =
            previousValue > 0
              ? (currentValue - previousValue) / previousValue
              : currentValue > 0
                ? 1
                : 0
          result[`${metric}_change`] = parseFloat(change.toFixed(4))
          result[`${metric}_previous`] = previousValue
        } else {
          result[`${metric}_change`] = null
          result[`${metric}_previous`] = null
        }
      }

      return result
    })
  }

  /**
   * 构建行的唯一键
   *
   * @private
   * @param {Object} row - 数据行对象
   * @returns {string} 唯一键字符串
   */
  static _buildRowKey(row) {
    const keyParts = []
    if (row.store_id !== undefined) keyParts.push(`store:${row.store_id}`)
    if (row.lottery_campaign_id !== undefined) keyParts.push(`campaign:${row.lottery_campaign_id}`)
    if (row.period !== undefined) keyParts.push(`period:${row.period}`)
    if (row.user_id !== undefined) keyParts.push(`user:${row.user_id}`)
    return keyParts.join('|') || 'all'
  }

  /**
   * 计算汇总数据
   *
   * @private
   * @param {Array} rows - 数据行数组
   * @param {string[]} metrics - 指标数组
   * @returns {Object} 汇总统计对象
   */
  static _calculateSummary(rows, metrics) {
    const summary = {}

    for (const metric of metrics) {
      const values = rows.map(r => parseFloat(r[metric]) || 0)
      const total = values.reduce((sum, v) => sum + v, 0)
      const avg = values.length > 0 ? total / values.length : 0

      summary[`total_${metric}`] =
        metric === 'win_rate' ? parseFloat(avg.toFixed(2)) : Math.round(total)

      // 计算平均变化率
      const changeValues = rows
        .map(r => r[`${metric}_change`])
        .filter(v => v !== null && v !== undefined)

      if (changeValues.length > 0) {
        const avgChange = changeValues.reduce((sum, v) => sum + v, 0) / changeValues.length
        summary[`avg_${metric}_change`] = parseFloat(avgChange.toFixed(4))
      }
    }

    return summary
  }

  /**
   * 获取模型配置
   *
   * @private
   * @param {string} source - 数据源类型（lottery/consumption）
   * @returns {Object} 模型配置对象
   */
  static _getModelConfig(source) {
    const configs = {
      lottery: {
        model: models.LotteryDraw,
        includes: [
          {
            model: models.User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: models.LotteryPrize,
            as: 'prize',
            attributes: ['lottery_prize_id', 'prize_name', 'prize_type'],
            required: false
          }
        ],
        fields: [
          'lottery_draw_id',
          'user_id',
          'lottery_campaign_id',
          'lottery_prize_id',
          'reward_tier',
          'created_at'
        ]
      },
      consumption: {
        model: models.ConsumptionRecord,
        includes: [
          {
            model: models.User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile']
          }
        ],
        fields: [
          'consumption_record_id',
          'user_id',
          'consumption_amount',
          'status',
          'store_id',
          'created_at'
        ]
      }
    }

    return configs[source]
  }

  /**
   * 构建下钻查询的WHERE条件
   *
   * @private
   * @param {Object} filters - 过滤条件对象
   * @param {Object} _modelConfig - 模型配置（预留扩展）
   * @returns {Object} Sequelize WHERE 条件对象
   */
  static _buildDrillDownWhereClause(filters, _modelConfig) {
    const where = {}

    // 处理时间周期过滤
    if (filters.period) {
      const periodParts = filters.period.match(/^(\d{4})-W(\d{2})$/)
      if (periodParts) {
        // 周格式：2026-W04
        const year = parseInt(periodParts[1])
        const week = parseInt(periodParts[2])
        const startOfWeek = this._getStartOfWeek(year, week)
        const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

        where.created_at = { [Op.between]: [startOfWeek, endOfWeek] }
      } else {
        // 日期格式：2026-01-31
        const date = new Date(filters.period)
        if (!isNaN(date.getTime())) {
          const startOfDay = new Date(date)
          startOfDay.setHours(0, 0, 0, 0)
          const endOfDay = new Date(date)
          endOfDay.setHours(23, 59, 59, 999)

          where.created_at = { [Op.between]: [startOfDay, endOfDay] }
        }
      }
    }

    // 处理其他过滤条件
    if (filters.store_id) {
      where.store_id = filters.store_id
    }

    if (filters.lottery_campaign_id) {
      where.lottery_campaign_id = filters.lottery_campaign_id
    }

    if (filters.user_id) {
      where.user_id = filters.user_id
    }

    if (filters.start_date && filters.end_date) {
      where.created_at = {
        [Op.between]: [new Date(filters.start_date), new Date(filters.end_date)]
      }
    }

    return where
  }

  /**
   * 格式化下钻行数据
   *
   * @private
   * @param {Object} row - 原始数据行
   * @param {string} source - 数据源类型（lottery/consumption）
   * @returns {Object} 格式化后的数据行
   */
  static _formatDrillDownRow(row, source) {
    const data = row.toJSON ? row.toJSON() : row

    // 处理时间格式
    if (data.created_at) {
      data.created_at = BeijingTimeHelper.apiTimestamp(data.created_at)
    }

    // 处理金额（分转元）
    if (source === 'consumption' && data.consumption_amount) {
      data.consumption_amount_yuan = (data.consumption_amount / 100).toFixed(2)
    }

    return data
  }

  /**
   * 获取某年某周的开始日期
   *
   * @private
   * @param {number} year - 年份
   * @param {number} week - ISO周数（1-53）
   * @returns {Date} 该周的开始日期（周一）
   */
  static _getStartOfWeek(year, week) {
    const jan1 = new Date(year, 0, 1)
    const daysToAdd = (week - 1) * 7 + (1 - jan1.getDay())
    return new Date(year, 0, 1 + daysToAdd)
  }
}

module.exports = MultiDimensionStatsService
