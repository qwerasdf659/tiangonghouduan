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
 * @access 认证用户
 */
router.post('/draw', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const {
      draw_type, // 'single', 'triple', 'five', 'ten'
      draw_count,
      cost_points,
      user_timestamp
    } = req.body

    // 验证请求参数
    if (!draw_type || !draw_count || !cost_points) {
      return res.status(400).json(ApiResponse.error('缺少必需参数', 'MISSING_REQUIRED_PARAMS'))
    }

    // 验证抽奖类型和次数的匹配
    const typeCountMap = {
      single: 1,
      triple: 3,
      five: 5,
      ten: 10
    }

    if (typeCountMap[draw_type] !== draw_count) {
      return res
        .status(400)
        .json(ApiResponse.error('抽奖类型与次数不匹配', 'DRAW_TYPE_COUNT_MISMATCH'))
    }

    // 执行抽奖
    const result = await lotteryService.executeLottery(
      userId,
      draw_type,
      draw_count,
      cost_points,
      user_timestamp
    )

    res.json(ApiResponse.success(result, '抽奖成功'))
  } catch (error) {
    console.error('❌ 抽奖执行失败:', error.message)

    // 根据错误类型返回不同的错误码
    let errorCode = 'LOTTERY_FAILED'
    if (error.message.includes('积分不足')) {
      errorCode = 'INSUFFICIENT_POINTS'
    } else if (error.message.includes('次数已达上限')) {
      errorCode = 'DAILY_LIMIT_EXCEEDED'
    } else if (error.message.includes('系统维护')) {
      errorCode = 'SYSTEM_MAINTENANCE'
    }

    res.status(400).json(ApiResponse.error(error.message, errorCode))
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
