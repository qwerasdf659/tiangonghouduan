/**
 * 多维度统计路由（B-25/B-27 实现）
 *
 * @description 提供多维度组合统计和下钻明细查询API
 * @see docs/后端数据库开发任务清单-2026年1月.md B-25, B-27
 *
 * API端点：
 * - GET /api/v4/console/statistics/multi-dimension - 多维度统计（B-25）
 * - GET /api/v4/console/statistics/drill-down - 下钻明细（B-27）
 *
 * @module routes/v4/console/multi-dimension-stats
 * @version 1.0.0
 * @date 2026-01-31
 */

'use strict'

const express = require('express')
const router = express.Router()
const { authenticateToken, requireRoleLevel } = require('../../../middleware/auth')
const logger = require('../../../utils/logger').logger

// 服务导入
const { MultiDimensionStatsService } = require('../../../services/reporting')

/**
 * GET /multi-dimension - 多维度统计接口（B-25）
 *
 * @description 支持门店/时间/活动等多维度组合统计
 *
 * Query参数：
 * - dimensions: 维度列表，逗号分隔（必需，如 "store,time"）
 *   - 支持: store/campaign/time/user_level
 * - metrics: 指标列表，逗号分隔（必需，如 "draws,consumption"）
 *   - 支持: draws/consumption/users/win_rate
 * - period: 时间周期（可选，默认 "week"）
 *   - 支持: day/week/month
 * - compare: 对比类型（可选）
 *   - 支持: wow(周环比)/mom(月环比)/yoy(同比)
 * - start_date: 开始日期（可选，ISO格式）
 * - end_date: 结束日期（可选，ISO格式）
 * - store_id: 门店ID过滤（可选）
 * - campaign_id: 活动ID过滤（可选）
 * - refresh: 是否强制刷新缓存（可选，默认 false）
 *
 * 响应格式：
 * {
 *   "success": true,
 *   "data": {
 *     "dimensions": ["store", "time"],
 *     "metrics": ["draws", "consumption"],
 *     "rows": [...],
 *     "summary": {...}
 *   }
 * }
 *
 * @example
 * GET /api/v4/console/statistics/multi-dimension?dimensions=store,time&metrics=draws,consumption&period=week&compare=wow
 */
router.get('/multi-dimension', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      dimensions,
      metrics,
      period = 'week',
      compare,
      start_date,
      end_date,
      store_id,
      campaign_id,
      refresh = 'false'
    } = req.query

    // 参数验证
    if (!dimensions) {
      return res.apiError(
        '缺少必需参数: dimensions',
        'MISSING_DIMENSIONS',
        { required: 'dimensions', supported: ['store', 'campaign', 'time', 'user_level'] },
        400
      )
    }

    if (!metrics) {
      return res.apiError(
        '缺少必需参数: metrics',
        'MISSING_METRICS',
        { required: 'metrics', supported: ['draws', 'consumption', 'users', 'win_rate'] },
        400
      )
    }

    // 调用服务
    const result = await MultiDimensionStatsService.getMultiDimensionStats(
      {
        dimensions,
        metrics,
        period,
        compare,
        start_date,
        end_date,
        store_id: store_id ? parseInt(store_id) : undefined,
        campaign_id: campaign_id ? parseInt(campaign_id) : undefined
      },
      { refresh: refresh === 'true' }
    )

    logger.info('[多维度统计API] 查询成功', {
      admin_id: req.user.user_id,
      dimensions,
      metrics,
      period,
      compare,
      row_count: result.row_count
    })

    return res.apiSuccess(result, '多维度统计查询成功')
  } catch (error) {
    logger.error('[多维度统计API] 查询失败', {
      error: error.message,
      code: error.code,
      admin_id: req.user?.user_id,
      query: req.query
    })

    // 处理业务错误
    if (error.code === 'MISSING_DIMENSIONS' || error.code === 'INVALID_DIMENSION') {
      return res.apiError(error.message, error.code, null, 400)
    }
    if (error.code === 'MISSING_METRICS' || error.code === 'INVALID_METRIC') {
      return res.apiError(error.message, error.code, null, 400)
    }

    return res.apiError(
      `多维度统计查询失败: ${error.message}`,
      'MULTI_DIMENSION_STATS_ERROR',
      null,
      500
    )
  }
})

/**
 * GET /drill-down - 下钻明细接口（B-27）
 *
 * @description 从汇总数据下钻到明细记录
 *
 * Query参数：
 * - source: 数据源（必需）
 *   - 支持: lottery/consumption
 * - store_id: 门店ID过滤（可选）
 * - campaign_id: 活动ID过滤（可选）
 * - period: 时间周期（可选，如 "2026-W04" 或 "2026-01-31"）
 * - start_date: 开始日期（可选）
 * - end_date: 结束日期（可选）
 * - user_id: 用户ID过滤（可选）
 * - page: 页码（可选，默认 1）
 * - page_size: 每页数量（可选，默认 20，最大 100）
 * - sort_by: 排序字段（可选，默认 "created_at"）
 * - sort_order: 排序方向（可选，默认 "DESC"）
 *
 * 响应格式：
 * {
 *   "success": true,
 *   "data": {
 *     "source": "lottery",
 *     "filters": {...},
 *     "rows": [...],
 *     "pagination": {...}
 *   }
 * }
 *
 * @example
 * GET /api/v4/console/statistics/drill-down?source=lottery&store_id=1&period=2026-W04&page=1&page_size=20
 */
router.get('/drill-down', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const {
      source,
      store_id,
      campaign_id,
      period,
      start_date,
      end_date,
      user_id,
      page = '1',
      page_size = '20',
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = req.query

    // 参数验证
    if (!source) {
      return res.apiError(
        '缺少必需参数: source',
        'MISSING_SOURCE',
        { required: 'source', supported: ['lottery', 'consumption'] },
        400
      )
    }

    // 构建过滤条件
    const filters = {}
    if (store_id) filters.store_id = parseInt(store_id)
    if (campaign_id) filters.campaign_id = parseInt(campaign_id)
    if (period) filters.period = period
    if (start_date) filters.start_date = start_date
    if (end_date) filters.end_date = end_date
    if (user_id) filters.user_id = parseInt(user_id)

    // 调用服务
    const result = await MultiDimensionStatsService.getDrillDownDetails({
      source,
      filters,
      page: parseInt(page),
      page_size: parseInt(page_size),
      sort_by,
      sort_order
    })

    logger.info('[下钻明细API] 查询成功', {
      admin_id: req.user.user_id,
      source,
      filters,
      total_count: result.pagination.total_count
    })

    return res.apiSuccess(result, '下钻明细查询成功')
  } catch (error) {
    logger.error('[下钻明细API] 查询失败', {
      error: error.message,
      code: error.code,
      admin_id: req.user?.user_id,
      query: req.query
    })

    // 处理业务错误
    if (error.code === 'INVALID_SOURCE') {
      return res.apiError(error.message, error.code, null, 400)
    }

    return res.apiError(`下钻明细查询失败: ${error.message}`, 'DRILL_DOWN_ERROR', null, 500)
  }
})

/**
 * GET /dimensions - 获取支持的维度和指标配置
 *
 * @description 返回多维度统计支持的所有维度和指标配置信息
 */
router.get('/dimensions', authenticateToken, requireRoleLevel(100), async (req, res) => {
  try {
    const config = {
      dimensions: {
        store: { label: '门店', description: '按门店分组统计' },
        campaign: { label: '活动', description: '按活动分组统计' },
        time: { label: '时间', description: '按时间周期分组统计' },
        user_level: { label: '用户等级', description: '按用户等级分组统计' }
      },
      metrics: {
        draws: { label: '抽奖次数', description: '抽奖总次数' },
        consumption: { label: '消费金额', description: '消费总金额（分）' },
        users: { label: '活跃用户', description: '去重活跃用户数' },
        win_rate: { label: '中奖率', description: '中奖百分比' }
      },
      periods: {
        day: { label: '按日', description: '每日统计' },
        week: { label: '按周', description: '每周统计' },
        month: { label: '按月', description: '每月统计' }
      },
      compare_types: {
        wow: { label: '周环比', description: '与上一周期对比' },
        mom: { label: '月环比', description: '与上月同期对比' },
        yoy: { label: '同比', description: '与去年同期对比' }
      },
      drill_down_sources: {
        lottery: { label: '抽奖记录', description: '下钻到抽奖明细' },
        consumption: { label: '消费记录', description: '下钻到消费明细' }
      }
    }

    return res.apiSuccess(config, '维度配置获取成功')
  } catch (error) {
    logger.error('[维度配置API] 获取失败', { error: error.message })
    return res.apiError('获取维度配置失败', 'GET_DIMENSIONS_CONFIG_ERROR', null, 500)
  }
})

module.exports = router
