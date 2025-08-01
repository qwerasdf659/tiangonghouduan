/**
 * 餐厅积分抽奖系统 v2.0 - 交易路由
 * 实现交易系统的核心API接口
 */

const express = require('express')
const TradeService = require('../../services/TradeService')
const { authenticateToken, requireAdmin } = require('../../middleware/auth')
const ApiResponse = require('../../utils/ApiResponse')
const router = express.Router()

// 初始化交易服务
const tradeService = new TradeService()

/**
 * @route GET /api/v2/trade
 * @desc 获取交易系统API信息
 * @access 公开
 */
router.get('/', (req, res) => {
  res.json(
    ApiResponse.success({
      module: 'trade',
      description: '交易系统API',
      version: '2.0.0',
      endpoints: {
        'POST /transfer': '执行积分转账',
        'GET /records': '获取交易记录',
        'GET /details/:tradeId': '获取交易详情',
        'GET /statistics': '获取交易统计数据',
        'PUT /verify/:tradeId': '管理员验证交易',
        'POST /cancel/:tradeId': '取消交易'
      },
      business_types: {
        point_transfer: '积分转账',
        exchange_refund: '兑换退款',
        prize_claim: '奖品认领',
        admin_adjustment: '管理员调整',
        system_reward: '系统奖励'
      }
    })
  )
})

/**
 * @route POST /api/v2/trade/transfer
 * @desc 执行积分转账
 * @access 需要认证
 */
router.post('/transfer', authenticateToken, async (req, res) => {
  try {
    const { to_user_id, amount, reason, trade_password, client_info = {} } = req.body

    // 参数验证
    if (!to_user_id || !amount || !reason) {
      return res.json(ApiResponse.error('缺少必需参数', 400))
    }

    if (amount <= 0 || amount > 100000) {
      return res.json(ApiResponse.error('转账金额必须在1-100000之间', 400))
    }

    if (to_user_id === req.user.id) {
      return res.json(ApiResponse.error('不能向自己转账', 400))
    }

    const result = await tradeService.transferPoints({
      fromUserId: req.user.id,
      toUserId: to_user_id,
      amount,
      reason,
      tradePassword: trade_password,
      clientInfo: client_info
    })

    res.json(ApiResponse.success(result, '转账成功'))
  } catch (error) {
    console.error('❌ 积分转账失败:', error.message)

    if (error.message.includes('积分不足')) {
      return res.json(ApiResponse.error(error.message, 1001))
    }
    if (error.message.includes('用户不存在')) {
      return res.json(ApiResponse.error(error.message, 1002))
    }
    if (error.message.includes('密码')) {
      return res.json(ApiResponse.error(error.message, 1003))
    }

    res.json(ApiResponse.error('转账失败，请稍后重试', 500))
  }
})

/**
 * @route GET /api/v2/trade/records
 * @desc 获取用户交易记录
 * @access 需要认证
 */
router.get('/records', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      tradeType = 'all',
      status = 'all',
      period = 'all',
      sortBy = 'trade_time',
      order = 'DESC'
    } = req.query

    const result = await tradeService.getTradeRecords(req.user.id, {
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      tradeType,
      status,
      period,
      sortBy,
      order
    })

    res.json(ApiResponse.success(result, '获取交易记录成功'))
  } catch (error) {
    console.error('❌ 获取交易记录失败:', error.message)
    res.json(ApiResponse.error('获取交易记录失败', 500))
  }
})

/**
 * @route GET /api/v2/trade/details/:tradeId
 * @desc 获取交易详情
 * @access 需要认证
 */
router.get('/details/:tradeId', authenticateToken, async (req, res) => {
  try {
    const { tradeId } = req.params

    if (!tradeId) {
      return res.json(ApiResponse.error('交易ID不能为空', 400))
    }

    const result = await tradeService.getTradeDetails(tradeId, req.user.id)

    res.json(ApiResponse.success(result, '获取交易详情成功'))
  } catch (error) {
    console.error('❌ 获取交易详情失败:', error.message)

    if (error.message.includes('不存在')) {
      return res.json(ApiResponse.error(error.message, 404))
    }
    if (error.message.includes('权限')) {
      return res.json(ApiResponse.error(error.message, 403))
    }

    res.json(ApiResponse.error('获取交易详情失败', 500))
  }
})

/**
 * @route GET /api/v2/trade/statistics
 * @desc 获取交易统计数据
 * @access 需要认证
 */
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const { period = 'month', tradeType = 'all' } = req.query

    const result = await tradeService.getTradeStatistics(req.user.id, {
      period,
      tradeType
    })

    res.json(ApiResponse.success(result, '获取统计数据成功'))
  } catch (error) {
    console.error('❌ 获取交易统计失败:', error.message)
    res.json(ApiResponse.error('获取统计数据失败', 500))
  }
})

/**
 * @route PUT /api/v2/trade/verify/:tradeId
 * @desc 管理员验证交易
 * @access 需要管理员权限
 */
router.put('/verify/:tradeId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { tradeId } = req.params
    const {
      action, // approve/reject
      reason = ''
    } = req.body

    if (!tradeId || !action) {
      return res.json(ApiResponse.error('缺少必需参数', 400))
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.json(ApiResponse.error('无效的操作类型', 400))
    }

    const result = await tradeService.verifyTrade(tradeId, {
      action,
      reason,
      adminId: req.user.id
    })

    res.json(ApiResponse.success(result, `交易${action === 'approve' ? '通过' : '拒绝'}成功`))
  } catch (error) {
    console.error('❌ 交易验证失败:', error.message)

    if (error.message.includes('不存在')) {
      return res.json(ApiResponse.error(error.message, 404))
    }
    if (error.message.includes('状态')) {
      return res.json(ApiResponse.error(error.message, 400))
    }

    res.json(ApiResponse.error('交易验证失败', 500))
  }
})

/**
 * @route POST /api/v2/trade/cancel/:tradeId
 * @desc 取消交易
 * @access 需要认证
 */
router.post('/cancel/:tradeId', authenticateToken, async (req, res) => {
  try {
    const { tradeId } = req.params
    const { reason = '用户主动取消' } = req.body

    if (!tradeId) {
      return res.json(ApiResponse.error('交易ID不能为空', 400))
    }

    const result = await tradeService.cancelTrade(tradeId, req.user.id, reason)

    res.json(ApiResponse.success(result, '交易取消成功'))
  } catch (error) {
    console.error('❌ 取消交易失败:', error.message)

    if (error.message.includes('不存在')) {
      return res.json(ApiResponse.error(error.message, 404))
    }
    if (error.message.includes('权限')) {
      return res.json(ApiResponse.error(error.message, 403))
    }
    if (error.message.includes('状态')) {
      return res.json(ApiResponse.error(error.message, 400))
    }

    res.json(ApiResponse.error('取消交易失败', 500))
  }
})

/**
 * @route GET /api/v2/trade/admin/pending
 * @desc 管理员获取待验证交易列表
 * @access 需要管理员权限
 */
router.get('/admin/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 20,
      riskLevel = 'all',
      sortBy = 'trade_time',
      order = 'DESC'
    } = req.query

    const result = await tradeService.getPendingTrades({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      riskLevel,
      sortBy,
      order
    })

    res.json(ApiResponse.success(result, '获取待验证交易成功'))
  } catch (error) {
    console.error('❌ 获取待验证交易失败:', error.message)
    res.json(ApiResponse.error('获取待验证交易失败', 500))
  }
})

module.exports = router
