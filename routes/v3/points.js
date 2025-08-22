/**
 * 🔥 积分系统API接口 v3 - 全新分离式架构
 * 创建时间：2025年08月19日 UTC
 * 特点：与抽奖系统完全分离 + 事件驱动 + 独立业务逻辑
 * 路径：/api/v3/points
 */

'use strict'

const express = require('express')
const router = express.Router()
const PointsSystemService = require('../../services/PointsSystemService')
const { requireUser, requireAdmin } = require('../../middleware/auth')
const validationMiddleware = require('../../middleware/validation')

/**
 * 🔥 用户积分查询接口
 */

/**
 * GET /api/v3/points/balance
 * 获取当前用户积分余额
 */
router.get('/balance', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id

    console.log(`💰 获取用户积分余额: 用户ID=${userId}`)
    console.log('🔍 DEBUG: req.user =', req.user)

    // 🔥 调用PointsSystemService获取真实积分
    const accountResult = await PointsSystemService.getUserPointsAccount(userId)
    console.log('🔍 DEBUG: accountResult =', JSON.stringify(accountResult, null, 2))

    if (!accountResult.success) {
      console.log('❌ DEBUG: accountResult not successful')
      return res.status(400).json({
        success: false,
        error: accountResult.error,
        message: accountResult.message,
        timestamp: new Date().toISOString()
      })
    }

    const responseData = {
      success: true,
      data: accountResult.data,
      message: '获取积分余额成功',
      timestamp: new Date().toISOString()
    }
    console.log('🔍 DEBUG: final response =', JSON.stringify(responseData, null, 2))

    res.json(responseData)
  } catch (error) {
    console.error('获取积分余额失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_POINTS_BALANCE_FAILED',
      message: '获取积分余额失败',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔥 积分交易记录接口
 */

/**
 * GET /api/v3/points/transactions
 * 获取用户积分交易记录
 */
router.get('/transactions', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id
    const {
      page = 1,
      limit = 20,
      type: _type,
      start_date: _start_date,
      end_date: _end_date
    } = req.query

    console.log(`📋 获取积分交易记录: 用户ID=${userId}`)

    // 🔥 调用PointsSystemService获取真实交易记录
    const transactionsResult = await PointsSystemService.getUserTransactions(userId, {
      page: parseInt(page),
      limit: parseInt(limit),
      type: _type,
      start_date: _start_date,
      end_date: _end_date
    })

    if (!transactionsResult.success) {
      return res.status(400).json({
        success: false,
        error: transactionsResult.error,
        message: transactionsResult.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: transactionsResult.data,
      message: '获取交易记录成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取积分交易记录失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_POINTS_TRANSACTIONS_FAILED',
      message: '获取交易记录失败',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔥 积分获取接口
 */

/**
 * POST /api/v3/points/earn
 * 用户获得积分
 */
router.post(
  '/earn',
  requireUser,
  validationMiddleware([
    { field: 'points_amount', type: 'number', required: true, min: 1 },
    { field: 'source', type: 'string', required: true },
    { field: 'description', type: 'string', required: false }
  ]),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const { points_amount, source, description } = req.body

      console.log(`💰 用户获得积分: 用户ID=${userId}, 积分=${points_amount}, 来源=${source}`)

      // 🔥 调用PointsSystemService添加积分
      const result = await PointsSystemService.earnPoints(userId, points_amount, {
        source,
        description,
        business_type: 'manual_reward',
        source_type: 'admin',
        title: '积分获得',
        operator_id: req.user.user_id
      })

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
          timestamp: new Date().toISOString()
        })
      }

      res.json({
        success: true,
        data: result.data,
        message: '积分获得成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('积分获得失败:', error)
      res.status(500).json({
        success: false,
        error: 'EARN_POINTS_FAILED',
        message: '积分获得失败',
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * 🔥 积分消费接口
 */

/**
 * POST /api/v3/points/consume
 * 用户消费积分
 */
router.post(
  '/consume',
  requireUser,
  validationMiddleware([
    { field: 'points_amount', type: 'number', required: true, min: 1 },
    { field: 'source', type: 'string', required: true },
    { field: 'description', type: 'string', required: false }
  ]),
  async (req, res) => {
    try {
      const userId = req.user.user_id
      const { points_amount, source, description } = req.body

      console.log(`💸 用户消费积分: 用户ID=${userId}, 积分=${points_amount}, 用途=${source}`)

      // 🔥 调用PointsSystemService扣除积分
      const result = await PointsSystemService.consumePoints(userId, points_amount, {
        source,
        description,
        business_type: 'manual_consume',
        source_type: 'user',
        title: '积分消费',
        operator_id: req.user.user_id
      })

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
          timestamp: new Date().toISOString()
        })
      }

      res.json({
        success: true,
        data: result.data,
        message: '积分消费成功',
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('积分消费失败:', error)
      res.status(500).json({
        success: false,
        error: 'CONSUME_POINTS_FAILED',
        message: '积分消费失败',
        timestamp: new Date().toISOString()
      })
    }
  }
)

/**
 * 🔥 积分规则管理
 */

/**
 * GET /api/v3/points/rules
 * 获取积分获得规则
 */
router.get('/rules', requireUser, async (req, res) => {
  try {
    console.log('📋 获取积分规则')

    // 🔥 固定规则配置 - 从业务配置中获取
    const rules = {
      earning_rules: [
        {
          rule_id: 1,
          rule_name: '每日签到',
          points_amount: 10,
          daily_limit: 1,
          description: '每日首次登录获得积分'
        },
        {
          rule_id: 2,
          rule_name: '分享内容',
          points_amount: 5,
          daily_limit: 3,
          description: '分享内容到社交媒体'
        },
        {
          rule_id: 3,
          rule_name: '完善资料',
          points_amount: 20,
          daily_limit: 1,
          description: '完善个人资料信息'
        }
      ],
      consumption_rules: [
        {
          rule_id: 1,
          rule_name: '抽奖活动',
          points_cost: 10,
          description: '参与抽奖活动消费积分'
        },
        {
          rule_id: 2,
          rule_name: '兑换奖品',
          points_cost: 50,
          description: '兑换实物奖品'
        }
      ],
      level_rules: [
        {
          level_name: 'Bronze',
          min_points: 0,
          max_points: 999,
          benefits: ['基础功能']
        },
        {
          level_name: 'Silver',
          min_points: 1000,
          max_points: 4999,
          benefits: ['基础功能', '优先抽奖']
        },
        {
          level_name: 'Gold',
          min_points: 5000,
          max_points: 19999,
          benefits: ['基础功能', '优先抽奖', '专属活动']
        },
        {
          level_name: 'Diamond',
          min_points: 20000,
          max_points: 999999,
          benefits: ['基础功能', '优先抽奖', '专属活动', '臻选空间']
        }
      ]
    }

    res.json({
      success: true,
      data: rules,
      message: '获取积分规则成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取积分规则失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_POINTS_RULES_FAILED',
      message: '获取积分规则失败',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔥 管理员接口
 */

/**
 * GET /api/v3/points/statistics
 * 获取积分系统统计信息（仅管理员）
 */
router.get('/statistics', requireAdmin, async (req, res) => {
  try {
    const { time_range = '7d', start_date, end_date } = req.query

    console.log(`📊 获取积分统计: 时间范围=${time_range}`)

    // 🔥 调用PointsSystemService获取真实统计数据
    const statisticsResult = await PointsSystemService.getPointsStatistics({
      time_range,
      start_date,
      end_date
    })

    if (!statisticsResult.success) {
      return res.status(400).json({
        success: false,
        error: statisticsResult.error,
        message: statisticsResult.message,
        timestamp: new Date().toISOString()
      })
    }

    res.json({
      success: true,
      data: { statistics: statisticsResult.data },
      message: '获取积分统计成功',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('获取积分统计失败:', error)
    res.status(500).json({
      success: false,
      error: 'GET_POINTS_STATISTICS_FAILED',
      message: '获取积分统计失败',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 🔥 健康检查和监控接口
 */

/**
 * GET /api/v3/points/health
 * 积分系统健康检查
 */
router.get('/health', async (req, res) => {
  try {
    const startTime = Date.now()

    // 简单的数据库连接测试
    const { sequelize } = require('../../models')
    await sequelize.authenticate()

    const responseTime = Date.now() - startTime

    res.json({
      success: true,
      status: 'healthy',
      data: {
        service: 'points-system-v3',
        timestamp: new Date().toISOString(),
        response_time_ms: responseTime,
        version: '3.0.0',
        database: 'connected'
      },
      message: '积分系统运行正常'
    })
  } catch (error) {
    console.error('健康检查失败:', error)
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'SERVICE_UNAVAILABLE',
      message: '积分系统服务不可用',
      timestamp: new Date().toISOString()
    })
  }
})

/**
 * 错误处理中间件
 */
router.use((error, req, res, _next) => {
  console.error('积分系统API错误:', error)

  // 参数验证错误
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: '参数验证失败',
      details: error.details,
      timestamp: new Date().toISOString()
    })
  }

  // 数据库错误
  if (error.name === 'SequelizeError') {
    return res.status(500).json({
      success: false,
      error: 'DATABASE_ERROR',
      message: '数据库操作失败',
      timestamp: new Date().toISOString()
    })
  }

  // 默认错误
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: '服务器内部错误',
    timestamp: new Date().toISOString()
  })
})

module.exports = router
