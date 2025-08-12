/**
 * 餐厅积分抽奖系统 v2.0 - 交易记录路由
 * 实现统一的交易历史记录API
 * 创建时间：2025年01月28日
 */

const express = require('express')
const TransactionService = require('../../services/TransactionService')
const { authenticateToken } = require('../../middleware/auth')
const ApiResponse = require('../../utils/ApiResponse')
const router = express.Router()

// 初始化交易记录服务
const transactionService = new TransactionService()

/**
 * @route GET /api/v2/transactions
 * @desc 获取交易记录API信息
 * @access 公开
 */
router.get('/', (req, res) => {
  res.json(
    ApiResponse.success({
      module: 'transactions',
      description: '统一交易记录API',
      version: '2.0.0',
      endpoints: {
        'GET /list': '获取交易记录列表（需要认证）',
        'GET /detail/:id': '获取交易详情（需要认证）',
        'POST /export': '导出交易数据（需要认证）'
      },
      supportedTypes: ['lottery', 'upload', 'exchange', 'trade', 'compensation', 'checkin', 'activity', 'referral'],
      supportedCategories: ['income', 'expense'],
      supportedStatuses: ['completed', 'pending', 'failed', 'cancelled'],
      timeFilters: ['all', 'today', 'week', 'month', 'quarter']
    })
  )
})

/**
 * @route GET /api/v2/transactions/list
 * @desc 获取交易记录列表
 * @access 需要认证
 */
router.get('/list', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const {
      page,
      pageSize,
      timeFilter,
      typeFilter,
      amountFilter,
      statusFilter,
      keyword
    } = req.query

    const options = {
      page: parseInt(page) || 1,
      pageSize: Math.min(parseInt(pageSize) || 20, 100),
      timeFilter: timeFilter || 'all',
      typeFilter: typeFilter || 'all',
      amountFilter: amountFilter || 'all',
      statusFilter: statusFilter || 'all',
      keyword: keyword || ''
    }

    const result = await transactionService.getTransactionList(userId, options)

    res.json(ApiResponse.success(result, '获取交易记录成功'))
  } catch (error) {
    console.error('❌ 获取交易记录失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取交易记录失败', 'GET_TRANSACTIONS_FAILED', error.message)
    )
  }
})

/**
 * @route GET /api/v2/transactions/detail/:id
 * @desc 获取交易详情
 * @access 需要认证
 */
router.get('/detail/:id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { id } = req.params

    if (!id) {
      return res.status(400).json(
        ApiResponse.error('缺少交易ID', 'MISSING_TRANSACTION_ID')
      )
    }

    const result = await transactionService.getTransactionDetail(userId, id)

    res.json(ApiResponse.success(result, '获取交易详情成功'))
  } catch (error) {
    console.error('❌ 获取交易详情失败:', error.message)

    let statusCode = 500
    let errorCode = 'GET_TRANSACTION_DETAIL_FAILED'

    if (error.message.includes('不存在')) {
      statusCode = 404
      errorCode = 'TRANSACTION_NOT_FOUND'
    } else if (error.message.includes('权限')) {
      statusCode = 403
      errorCode = 'ACCESS_DENIED'
    }

    res.status(statusCode).json(
      ApiResponse.error(error.message, errorCode)
    )
  }
})

/**
 * @route POST /api/v2/transactions/export
 * @desc 导出交易数据
 * @access 需要认证
 */
router.post('/export', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { timeFilter, typeFilter, format } = req.body

    const options = {
      timeFilter: timeFilter || 'month',
      typeFilter: typeFilter || 'all',
      format: format || 'excel'
    }

    // 验证格式参数
    if (!['excel', 'csv'].includes(options.format)) {
      return res.status(400).json(
        ApiResponse.error('不支持的导出格式', 'INVALID_FORMAT')
      )
    }

    const result = await transactionService.exportTransactionData(userId, options)

    res.json(ApiResponse.success(result, '导出请求已创建'))
  } catch (error) {
    console.error('❌ 导出交易数据失败:', error.message)
    res.status(500).json(
      ApiResponse.error('导出交易数据失败', 'EXPORT_FAILED', error.message)
    )
  }
})

/**
 * @route GET /api/v2/transactions/stats
 * @desc 获取交易统计信息
 * @access 需要认证
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { timeFilter } = req.query

    // 获取统计信息
    const result = await transactionService.getTransactionList(userId, {
      timeFilter: timeFilter || 'month',
      pageSize: 1 // 只需要统计信息，不需要记录列表
    })

    // 只返回统计信息
    const stats = {
      monthlyStats: result.monthlyStats,
      categoryStats: {
        income: {
          upload: 0,
          checkin: 0,
          activity: 0,
          referral: 0,
          other: 0
        },
        expense: {
          lottery: 0,
          exchange: 0,
          trade: 0,
          other: 0
        }
      },
      generatedAt: new Date().toISOString()
    }

    // 从记录中计算分类统计
    const fullResult = await transactionService.getTransactionList(userId, {
      timeFilter: timeFilter || 'month',
      pageSize: 10000
    })

    fullResult.records.forEach(record => {
      if (record.category === 'income') {
        stats.categoryStats.income[record.type] = (stats.categoryStats.income[record.type] || 0) + 1
      } else if (record.category === 'expense') {
        stats.categoryStats.expense[record.type] = (stats.categoryStats.expense[record.type] || 0) + 1
      }
    })

    // 转换为百分比
    const totalIncome = Object.values(stats.categoryStats.income).reduce((a, b) => a + b, 0)
    const totalExpense = Object.values(stats.categoryStats.expense).reduce((a, b) => a + b, 0)

    if (totalIncome > 0) {
      Object.keys(stats.categoryStats.income).forEach(key => {
        stats.categoryStats.income[key] = Math.round((stats.categoryStats.income[key] / totalIncome) * 100)
      })
    }

    if (totalExpense > 0) {
      Object.keys(stats.categoryStats.expense).forEach(key => {
        stats.categoryStats.expense[key] = Math.round((stats.categoryStats.expense[key] / totalExpense) * 100)
      })
    }

    res.json(ApiResponse.success(stats, '获取统计信息成功'))
  } catch (error) {
    console.error('❌ 获取交易统计失败:', error.message)
    res.status(500).json(
      ApiResponse.error('获取统计信息失败', 'GET_STATS_FAILED', error.message)
    )
  }
})

/**
 * @route GET /api/v2/transactions/health
 * @desc 交易记录健康检查
 * @access 公开
 */
router.get('/health', async (req, res) => {
  try {
    const { PointsRecord } = require('../../models')

    // 检查数据库连接
    const totalRecords = await PointsRecord.count()

    res.json(
      ApiResponse.success({
        status: 'healthy',
        module: 'transactions',
        version: '2.0.0',
        totalRecords,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }, '交易记录服务正常')
    )
  } catch (error) {
    console.error('❌ 交易记录健康检查失败:', error.message)
    res.status(500).json(
      ApiResponse.error('交易记录服务异常', 'HEALTH_CHECK_FAILED', error.message)
    )
  }
})

module.exports = router
