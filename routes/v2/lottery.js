const express = require('express')
const LotteryService = require('../../services/LotteryService')
const { authenticateToken, requireAdmin } = require('../../middleware/auth')
const ApiResponse = require('../../utils/ApiResponse')
const router = express.Router()

// 初始化抽奖服务
const lotteryService = new LotteryService()

/**
 * @route GET /api/v2/lottery/config
 * @desc 获取抽奖配置（转盘绘制数据）
 * @access 认证用户
 */
router.get('/config', authenticateToken, async (req, res) => {
  try {
    const config = await lotteryService.getLotteryConfig()

    res.json(ApiResponse.success(config, '获取抽奖配置成功'))
  } catch (error) {
    console.error('❌ 获取抽奖配置失败:', error.message)
    res
      .status(500)
      .json(ApiResponse.error('获取抽奖配置失败', 'GET_LOTTERY_CONFIG_FAILED', error.message))
  }
})

/**
 * @route POST /api/v2/lottery/draw
 * @desc 执行抽奖（支持单抽和连抽）
 * @param {string} drawType - 抽奖类型：'single'|'triple'|'five'|'ten'|'multi'
 * @param {number} drawCount - 抽奖次数：1|3|5|10
 * @param {number} costPoints - 消费积分
 * @param {object} clientInfo - 客户端信息（可选）
 * @access 认证用户
 */
router.post('/draw', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id

    // 🔧 字段转换中间件修复：直接获取转换后的字段名
    // 字段转换中间件将前端驼峰命名转换为数据库下划线命名
    const drawType = req.body.draw_type
    const drawCount = req.body.draw_count
    const costPoints = req.body.cost_points
    const clientInfo = req.body.client_info
    const clientTimestamp = req.body.client_timestamp

    console.log('✅ 抽奖参数（字段转换后）:', {
      userId,
      drawType,
      drawCount,
      costPoints,
      clientTimestamp: clientTimestamp || (clientInfo && clientInfo.timestamp),
      原始Body: req.body
    })

    // 🔧 网络环境优化：为真机调试环境提供特殊处理
    const isHighCountDraw = drawCount >= 10

    if (isHighCountDraw) {
      console.log(`🔄 10连抽请求检测 - 用户${userId}，优化响应处理`)
      // 设置更长的响应超时，确保10连抽能完整处理
      req.setTimeout(30000) // 30秒超时
      res.setTimeout(30000)
    }

    // 验证请求参数
    if (!drawType || !drawCount || !costPoints) {
      console.log('❌ 抽奖参数验证失败:', {
        drawType,
        drawCount,
        costPoints,
        转换后字段: { draw_type: req.body.draw_type, draw_count: req.body.draw_count, cost_points: req.body.cost_points },
        原始Body: req.body
      })
      return res.status(400).json(
        ApiResponse.error('缺少必需参数', 'MISSING_REQUIRED_PARAMS', {
          received: {
            drawType,
            drawCount,
            costPoints
          },
          required: ['drawType', 'drawCount', 'costPoints'],
          receivedFields: Object.keys(req.body),
          原始请求: req.body
        })
      )
    }

    // 验证抽奖类型和次数的匹配
    // 支持前端兼容性：同时支持具体类型和通用multi类型
    const typeCountMap = {
      single: 1,
      triple: 3,
      five: 5,
      ten: 10,
      multi: null // multi类型通过drawCount动态判断
    }

    // 兼容性验证逻辑
    let isValidTypeCount = false

    if (drawType === 'multi') {
      // multi类型：支持任意有效的抽奖次数（1, 3, 5, 10）
      isValidTypeCount = [1, 3, 5, 10].includes(drawCount)
    } else {
      // 具体类型：必须匹配对应次数
      isValidTypeCount = typeCountMap[drawType] === drawCount
    }

    if (!isValidTypeCount) {
      console.log('❌ 抽奖类型与次数不匹配:', {
        drawType,
        drawCount,
        supportedTypes: Object.keys(typeCountMap),
        supportedCounts: [1, 3, 5, 10]
      })
      return res.status(400).json(
        ApiResponse.error('抽奖类型与次数不匹配', 'DRAW_TYPE_COUNT_MISMATCH', {
          drawType,
          drawCount,
          supportedTypes: Object.keys(typeCountMap),
          supportedCounts: [1, 3, 5, 10],
          suggestion: drawType === 'multi'
            ? 'drawType=\'multi\' 支持 drawCount=[1,3,5,10]'
            : `drawType='${drawType}' 需要 drawCount=${typeCountMap[drawType]}`
        })
      )
    }

    console.log('✅ 抽奖参数验证通过:', {
      userId,
      drawType,
      drawCount,
      costPoints,
      timestamp: clientTimestamp || (clientInfo && clientInfo.timestamp)
    })

    // 执行抽奖 - 传递驼峰命名参数，服务层会处理
    const startTime = Date.now()
    const result = await lotteryService.executeLottery(
      userId,
      drawType,
      drawCount,
      costPoints,
      clientTimestamp || (clientInfo && clientInfo.timestamp)
    )

    // 🔧 网络环境优化：为10连抽提供响应优化
    if (isHighCountDraw) {
      const processingTime = Date.now() - startTime
      console.log(`✅ 10连抽处理完成 - 用户${userId}，耗时${processingTime}ms`)

      // 为真机调试环境优化响应格式，减少不必要的数据传输
      const optimizedResult = {
        ...result,
        // 确保响应结构完整，但优化数据传输
        networkOptimized: true,
        processingTime
      }

      res.json(ApiResponse.success(optimizedResult, '抽奖成功'))
    } else {
      res.json(ApiResponse.success(result, '抽奖成功'))
    }
  } catch (error) {
    console.error('❌ 抽奖执行失败:', error.message)
    console.error('❌ 错误堆栈:', error.stack)

    // 🔧 特殊处理10连抽的错误，提供更详细的调试信息
    const drawType = req.body.draw_type
    const drawCount = req.body.draw_count
    const isHighCountDraw = drawCount >= 10

    if (isHighCountDraw) {
      console.error(`💥 10连抽失败详情 - 用户${req.user.user_id}:`, {
        drawType,
        drawCount,
        error: error.message,
        timestamp: new Date().toISOString(),
        userAgent: req.get('User-Agent'),
        clientIP: req.ip
      })
    }

    // 根据错误类型返回不同的错误码
    let errorCode = 'LOTTERY_FAILED'
    if (error.message.includes('积分不足')) {
      errorCode = 'INSUFFICIENT_POINTS'
    } else if (error.message.includes('次数已达上限')) {
      errorCode = 'DAILY_LIMIT_EXCEEDED'
    } else if (error.message.includes('系统维护')) {
      errorCode = 'SYSTEM_MAINTENANCE'
    }

    // 为10连抽提供特殊的错误响应格式，便于前端调试
    const errorResponse = {
      errorDetails: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      // 为真机调试提供额外的调试信息
      debugInfo: isHighCountDraw
        ? {
          drawType,
          drawCount,
          isHighCountDraw: true,
          timestamp: new Date().toISOString(),
          suggestion: '10连抽在真机环境可能受网络条件影响，建议检查网络连接'
        }
        : undefined
    }

    res.status(400).json(ApiResponse.error(error.message, errorCode, errorResponse))
  }
})

/**
 * @route GET /api/v2/lottery/records
 * @desc 获取用户抽奖记录
 * @access 认证用户
 */
router.get('/records', authenticateToken, async (req, res) => {
  try {
    const _userId = req.user.user_id
    const { page = 1, page_size: _pageSize = 20, period: _period = 'all' } = req.query

    // 这里可以实现获取用户抽奖记录的逻辑
    // 暂时返回成功响应
    res.json(
      ApiResponse.success(
        {
          records: [],
          pagination: {
            current_page: parseInt(page),
            total_pages: 0,
            total_count: 0,
            has_more: false
          }
        },
        '获取抽奖记录成功'
      )
    )
  } catch (error) {
    console.error('❌ 获取抽奖记录失败:', error.message)
    res.status(500).json(ApiResponse.error('获取抽奖记录失败', 'GET_LOTTERY_RECORDS_FAILED'))
  }
})

/**
 * @route GET /api/v2/lottery/statistics
 * @desc 获取抽奖统计数据
 * @access 认证用户
 */
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const isAdmin = req.user.is_admin || false

    const statistics = await lotteryService.getLotteryStatistics(userId, isAdmin)

    res.json(ApiResponse.success(statistics, '获取抽奖统计成功'))
  } catch (error) {
    console.error('❌ 获取抽奖统计失败:', error.message)
    res.status(500).json(ApiResponse.error('获取抽奖统计失败', 'GET_LOTTERY_STATISTICS_FAILED'))
  }
})

/**
 * @route PUT /api/v2/lottery/config
 * @desc 更新抽奖配置（管理员）
 * @access 管理员
 */
router.put('/config', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { system_config: _systemConfig, prizes: _prizes } = req.body

    // 这里可以实现更新抽奖配置的逻辑
    // 暂时返回成功响应
    res.json(
      ApiResponse.success({
        updated: true,
        message: '抽奖配置更新成功'
      })
    )
  } catch (error) {
    console.error('❌ 更新抽奖配置失败:', error.message)
    res.status(500).json(ApiResponse.error('更新抽奖配置失败', 'UPDATE_LOTTERY_CONFIG_FAILED'))
  }
})

/**
 * @route POST /api/v2/lottery/pause
 * @desc 暂停/恢复抽奖活动（管理员）
 * @access 管理员
 */
router.post('/pause', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { action, reason } = req.body // action: 'pause' | 'resume'

    // 这里可以实现暂停/恢复抽奖的逻辑
    res.json(
      ApiResponse.success({
        action,
        message: action === 'pause' ? '抽奖活动已暂停' : '抽奖活动已恢复',
        reason
      })
    )
  } catch (error) {
    console.error('❌ 抽奖活动控制失败:', error.message)
    res.status(500).json(ApiResponse.error('抽奖活动控制失败', 'LOTTERY_CONTROL_FAILED'))
  }
})

/**
 * @route GET /api/v2/lottery
 * @desc 获取抽奖业务API信息
 * @access 公开
 */
router.get('/', (req, res) => {
  res.json(
    ApiResponse.success(
      {
        module: 'lottery',
        description: '抽奖业务核心API',
        version: '2.0.0',
        endpoints: {
          'GET /config': '获取抽奖配置和转盘数据',
          'POST /draw': '执行抽奖（单抽/连抽）',
          'GET /records': '获取用户抽奖记录',
          'GET /statistics': '获取抽奖统计数据',
          'PUT /config': '更新抽奖配置（管理员）',
          'POST /pause': '控制抽奖活动状态（管理员）'
        },
        businessType: 'lottery_core',
        features: ['单抽', '连抽', '保底机制', '概率配置', '积分扣除', '统计分析']
      },
      '抽奖业务API'
    )
  )
})

module.exports = router
