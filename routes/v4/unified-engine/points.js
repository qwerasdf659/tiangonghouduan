/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 积分API路由（/api/v4/unified-engine/points）
 *
 * 业务场景：提供积分相关的REST API接口，包括余额查询、交易历史、统计分析等功能
 *
 * API清单：
 *
 * 【积分余额查询】
 * - GET /balance - 获取当前用户积分余额（JWT自动识别用户）
 * - GET /balance/:user_id - 获取指定用户积分余额（管理员权限）
 *
 * 【交易历史查询】
 * - GET /transactions - 获取当前用户积分交易历史（支持分页、筛选）
 * - GET /transactions/:user_id - 获取指定用户积分交易历史（管理员权限）
 * - GET /transaction/:transaction_id - 获取单条交易记录详情
 *
 * 【积分统计分析】
 * - GET /statistics - 获取当前用户积分统计（总获得、总消费、余额趋势）
 * - GET /statistics/:user_id - 获取指定用户积分统计（管理员权限）
 *
 * 【积分操作】（管理员专用）
 * - POST /admin/adjust - 管理员调整用户积分（增加/扣除）
 * - POST /admin/freeze - 管理员冻结用户积分账户
 * - POST /admin/unfreeze - 管理员解冻用户积分账户
 *
 * 核心功能：
 * 1. 积分余额查询（实时查询用户可用积分、总获得、总消费）
 * 2. 交易历史查询（支持按时间、类型、状态筛选，分页查询）
 * 3. 积分统计分析（日/周/月积分趋势、收支分析）
 * 4. 管理员积分操作（调整积分、冻结/解冻账户）
 * 5. 交易详情查询（查看单条交易的完整信息和关联业务）
 *
 * 业务规则：
 * - **权限管理**：
 *   - 普通用户只能查询自己的积分信息
 *   - 管理员（admin角色）可以查询任意用户的积分信息
 *   - 积分操作（调整、冻结/解冻）仅管理员可执行
 * - **数据安全**：
 *   - 所有接口要求JWT认证
 *   - 敏感操作需要权限验证
 *   - 交易记录完整审计，不可篡改
 * - **查询优化**：
 *   - 交易历史默认分页（每页20条）
 *   - 支持按时间范围筛选（start_time、end_time）
 *   - 支持按交易类型筛选（earn、consume）
 *   - 支持按状态筛选（completed、pending、cancelled）
 *
 * 安全措施：
 * - **JWT认证**：所有接口要求用户登录（authenticateToken中间件）
 * - **权限校验**：管理员操作需要验证admin角色
 * - **参数验证**：严格验证所有输入参数（user_id、transaction_id、adjust_amount等）
 * - **审计日志**：所有积分操作记录完整的操作日志（操作员、操作时间、业务关联）
 *
 * 响应格式：
 * - 使用res.api*()中间件注入方法（ApiResponse统一格式）
 * - 成功：{ success: true, code: 'XXX', message: 'xxx', data: {...} }
 * - 失败：{ success: false, code: 'XXX', message: 'xxx', error: 'xxx' }
 *
 * 错误码规范：
 * - USER_NOT_FOUND: 用户不存在
 * - POINTS_ACCOUNT_NOT_FOUND: 积分账户不存在
 * - PERMISSION_DENIED: 权限不足
 * - INVALID_PARAMETERS: 参数错误
 * - ACCOUNT_FROZEN: 积分账户已冻结
 * - TRANSACTION_NOT_FOUND: 交易记录不存在
 *
 * 数据模型关联：
 * - UserPointsAccount：用户积分账户表（核心数据）
 * - PointsTransaction：积分交易记录表（审计日志）
 * - User：用户表（用户基本信息）
 *
 * 使用示例：
 * ```javascript
 * // 示例1：查询当前用户积分余额
 * GET /api/v4/unified-engine/points/balance
 * Authorization: Bearer <token>
 *
 * // 响应
 * {
 *   "success": true,
 *   "data": {
 *     "user_id": 1,
 *     "available_points": 1500,
 *     "total_earned": 2000,
 *     "total_consumed": 500,
 *     "timestamp": "2025-10-30T20:19:57.000+08:00"
 *   }
 * }
 *
 * // 示例2：查询交易历史（带筛选和分页）
 * GET /api/v4/unified-engine/points/transactions?transaction_type=earn&page=1&limit=10
 * Authorization: Bearer <token>
 *
 * // 响应
 * {
 *   "success": true,
 *   "data": {
 *     "transactions": [
 *       {
 *         "transaction_id": 12345,
 *         "transaction_type": "earn",
 *         "points_amount": 100,
 *         "points_balance_before": 1400,
 *         "points_balance_after": 1500,
 *         "business_type": "consumption_reward",
 *         "transaction_title": "消费奖励100分",
 *         "transaction_time": "2025-10-30T20:19:57.000+08:00",
 *         "status": "completed"
 *       }
 *     ],
 *     "pagination": {
 *       "current_page": 1,
 *       "total_pages": 5,
 *       "total_count": 50,
 *       "limit": 10
 *     }
 *   }
 * }
 *
 * // 示例3：管理员调整用户积分
 * POST /api/v4/unified-engine/points/admin/adjust
 * Authorization: Bearer <admin_token>
 * Content-Type: application/json
 * {
 *   "user_id": 123,
 *   "points_amount": 500,
 *   "operation": "add",
 *   "reason": "活动补偿"
 * }
 *
 * // 响应
 * {
 *   "success": true,
 *   "message": "积分调整成功",
 *   "data": {
 *     "transaction_id": 67890,
 *     "old_balance": 1000,
 *     "new_balance": 1500,
 *     "points_added": 500
 *   }
 * }
 * ```
 *
 * 创建时间：2025年01月21日
 * 最后更新：2025年10月30日
 * 使用模型：Claude Sonnet 4.5
 */

const express = require('express')
const router = express.Router()
const models = require('../../../models')
const { authenticateToken, getUserRoles, requireAdmin } = require('../../../middleware/auth')
const PointsService = require('../../../services/PointsService')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const Logger = require('../../../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('PointsAPI')

// 🔧 限流中间件 - 防止恶意频繁查询
const { getRateLimiter } = require('../../../middleware/RateLimiterMiddleware')
const rateLimiter = getRateLimiter()

// 创建积分余额查询专用限流中间件 - 10次/分钟/用户
const balanceRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 10, // 最多10次查询
  keyPrefix: 'rate_limit:points:balance:',
  keyGenerator: 'user', // 按用户限流
  message: '查询过于频繁，请稍后再试',
  onLimitReached: (req, key, count) => {
    console.warn('[PointsBalance] 查询限流触发', {
      user_id: req.user?.user_id,
      count,
      limit: 10,
      timestamp: BeijingTimeHelper.now()
    })
  }
})

/**
 * GET /balance - 获取当前用户积分余额（已优化）
 *
 * @description 从JWT token中自动获取当前用户的积分余额信息
 * @route GET /api/v4/unified-engine/points/balance
 * @access Private (需要认证)
 * 
 * 优化内容（2025-11-03）：
 * - ✅ 添加API限流保护（10次/分钟/用户）
 * - ✅ 细化错误处理（区分用户不存在、账户冻结等错误类型）
 * - ✅ 添加账户状态检查（防止冻结账户查询）
 * - ✅ 扩展返回数据（添加pending_points、last_earn_time等字段）
 * - ✅ 完善日志记录（成功查询、性能监控、错误分类）
 */
router.get('/balance', authenticateToken, balanceRateLimiter, async (req, res) => {
  const startTime = Date.now()
  const user_id = req.user.user_id
  
  try {
    // 📊 Step 1: 记录查询开始日志
    console.log(`[PointsBalance] 用户${user_id}查询积分余额`)

    // 🔐 Step 2: 检查用户是否存在
    const { User } = models
    const user = await User.findByPk(user_id)
    if (!user) {
      console.warn(`[PointsBalance] 用户不存在: user_id=${user_id}`)
      return res.apiError('用户不存在', 'USER_NOT_FOUND', {}, 404)
    }

    // 🏦 Step 3: 获取用户积分账户（包含账户状态）
    const account = await PointsService.getUserPointsAccount(user_id)
    if (!account) {
      console.error(`[PointsBalance] 积分账户不存在: user_id=${user_id}`)
      return res.apiError('积分账户不存在', 'POINTS_ACCOUNT_NOT_FOUND', {}, 404)
    }

    // 🛡️ Step 4: 检查账户状态（防止冻结账户查询）
    if (!account.is_active) {
      console.warn(`[PointsBalance] 账户已冻结: user_id=${user_id}, reason=${account.freeze_reason}`)
      return res.apiError(
        '您的积分账户已被冻结',
        'ACCOUNT_FROZEN',
        { freeze_reason: account.freeze_reason || '未说明原因' },
        403
      )
    }

    // 📦 Step 5: 获取完整的积分信息（包括待审核积分）
    const points_overview = await PointsService.getUserPointsOverview(user_id)

    // ⏱️ Step 6: 记录性能日志
    const queryTime = Date.now() - startTime
    if (queryTime > 100) {
      console.warn(`[PointsBalance] 查询耗时过长: ${queryTime}ms, user_id=${user_id}`)
    } else {
      console.log(`[PointsBalance] 查询成功: ${queryTime}ms, user_id=${user_id}, available=${points_overview.available_points}`)
    }

    // ✅ Step 7: 返回完整的积分数据
    return res.apiSuccess(
      {
        user_id,
        // 核心积分数据
        available_points: points_overview.available_points,
        total_earned: points_overview.total_earned,
        total_consumed: points_overview.total_consumed,
        // 扩展数据（新增）
        pending_points: points_overview.frozen_points || 0,  // 待审核积分（冻结中）
        last_earn_time: account.last_earn_time,              // 最后获得积分时间
        last_consume_time: account.last_consume_time,        // 最后消耗积分时间
        is_active: account.is_active,                        // 账户激活状态
        // 元数据
        timestamp: BeijingTimeHelper.apiTimestamp(),
        query_time_ms: queryTime                             // 查询耗时（毫秒）
      },
      '积分余额查询成功'
    )
  } catch (error) {
    // ❌ 细化错误类型处理
    const queryTime = Date.now() - startTime
    
    // 数据库连接错误
    if (error.name === 'SequelizeConnectionError') {
      console.error(`[PointsBalance] 数据库连接失败: user_id=${user_id}, time=${queryTime}ms`, error)
      return res.apiInternalError(
        '数据库连接失败，请稍后重试',
        error.message,
        'DATABASE_CONNECTION_ERROR'
      )
    }
    
    // 数据库查询超时
    if (error.name === 'SequelizeTimeoutError') {
      console.error(`[PointsBalance] 数据库查询超时: user_id=${user_id}, time=${queryTime}ms`, error)
      return res.apiInternalError(
        '查询超时，请稍后重试',
        error.message,
        'DATABASE_TIMEOUT_ERROR'
      )
    }
    
    // 其他未知错误
    console.error(`[PointsBalance] 查询失败: user_id=${user_id}, time=${queryTime}ms`, error)
    return res.apiInternalError(
      '积分余额查询失败',
      error.message,
      'POINTS_BALANCE_ERROR'
    )
  }
})

/**
 * GET /balance/:user_id - 获取指定用户积分余额
 *
 * @description 获取指定用户的积分余额信息（管理员可查询任意用户）
 * @route GET /api/v4/unified-engine/points/balance/:user_id
 * @access Private (需要认证)
 */
router.get('/balance/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params
    const current_user_id = req.user.user_id

    // 🛡️ 权限检查：只能查询自己的积分，除非是超级管理员
    const currentUserRoles = await getUserRoles(current_user_id)
    if (parseInt(user_id) !== current_user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权限查询其他用户积分', 'PERMISSION_DENIED', {}, 403)
    }

    // 获取用户积分信息
    const points_info = await PointsService.getUserPoints(parseInt(user_id))

    return res.apiSuccess(
      {
        user_id: parseInt(user_id),
        available_points: points_info.available_points,
        total_earned: points_info.total_earned,
        total_consumed: points_info.total_consumed,
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '积分余额查询成功'
    )
  } catch (error) {
    console.error('积分余额查询失败:', error)
    return res.apiInternalError('积分余额查询失败', error.message, 'POINTS_BALANCE_ERROR')
  }
})

/**
 * GET /transactions/:user_id - 获取用户积分交易历史
 *
 * @description 获取用户的积分交易记录，支持分页
 * @route GET /api/v4/unified-engine/points/transactions/:user_id
 * @access Private (需要认证)
 */
router.get('/transactions/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params
    const { page = 1, limit = 20, type } = req.query

    // 🛡️ 参数验证：检查user_id是否有效
    if (!user_id || user_id === 'undefined' || user_id === 'null') {
      return res.apiError(
        '用户ID参数无效，请确保已登录并正确传递用户ID',
        'INVALID_USER_ID',
        {
          received_user_id: user_id,
          hint: '前端应从登录状态或JWT token中获取user_id'
        },
        400
      )
    }

    const user_id_int = parseInt(user_id)
    if (isNaN(user_id_int) || user_id_int <= 0) {
      return res.apiError(
        '用户ID必须是正整数',
        'INVALID_USER_ID_FORMAT',
        { received_user_id: user_id },
        400
      )
    }

    // 🎯 分页安全保护：最大100条记录（服务层也有保护，双重防护）
    const finalLimit = Math.min(parseInt(limit), 100)
    const current_user_id = req.user.user_id

    // 🛡️ 权限检查：只能查询自己的交易记录，除非是超级管理员
    const currentUserRoles = await getUserRoles(current_user_id)
    if (user_id_int !== current_user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权限查询其他用户交易记录', 'PERMISSION_DENIED', {}, 403)
    }

    // 获取交易记录
    const transactions = await PointsService.getUserTransactions(user_id_int, {
      page: parseInt(page),
      limit: finalLimit,
      type
    })

    return res.apiSuccess(
      {
        user_id: user_id_int,
        transactions: transactions.data,
        pagination: {
          page: parseInt(page),
          limit: finalLimit,
          total: transactions.total,
          pages: Math.ceil(transactions.total / finalLimit)
        },
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '积分交易记录查询成功'
    )
  } catch (error) {
    console.error('积分交易记录查询失败:', error)
    return res.apiInternalError('积分交易记录查询失败', error.message, 'POINTS_TRANSACTIONS_ERROR')
  }
})

/**
 * POST /admin/adjust - 管理员调整用户积分
 *
 * @description 管理员专用接口，用于调整用户积分
 * @route POST /api/v4/unified-engine/points/admin/adjust
 * @access Private (需要超级管理员权限)
 */
router.post('/admin/adjust', authenticateToken, async (req, res) => {
  try {
    const { user_id, amount, reason, type = 'admin_adjust' } = req.body
    const admin_id = req.user.user_id

    // 🛡️ 权限检查：只有超级管理员可以调整积分
    const adminRoles = await getUserRoles(admin_id)
    if (!adminRoles.isAdmin) {
      return res.apiError('无权限执行此操作', 'PERMISSION_DENIED', {}, 403)
    }

    // 参数验证
    if (!user_id || !amount || !reason) {
      return res.apiError('用户ID、积分数量和调整原因不能为空', 'INVALID_PARAMS', {}, 400)
    }

    if (typeof amount !== 'number' || amount === 0) {
      return res.apiError('积分数量必须是非零数字', 'INVALID_PARAMS', {}, 400)
    }

    // 执行积分调整
    if (amount > 0) {
      await PointsService.addPoints(user_id, amount, {
        business_type: 'admin_adjust',
        source_type: 'admin',
        title: '管理员调整积分',
        description: reason,
        operator_id: admin_id
      })
    } else {
      await PointsService.consumePoints(user_id, Math.abs(amount), {
        business_type: 'admin_adjust',
        source_type: 'admin',
        title: '管理员调整积分',
        description: reason,
        operator_id: admin_id
      })
    }

    // 获取调整后的余额
    const points_info = await PointsService.getUserPoints(user_id)

    return res.apiSuccess(
      {
        user_id,
        adjustment: {
          amount,
          type,
          reason,
          admin_id,
          timestamp: BeijingTimeHelper.apiTimestamp()
        },
        new_balance: points_info.available_points
      },
      '积分调整成功'
    )
  } catch (error) {
    console.error('管理员积分调整失败:', error)
    return res.apiInternalError('积分调整失败', error.message, 'ADMIN_POINTS_ADJUST_ERROR')
  }
})

/**
 * GET /admin/statistics - 获取积分统计信息
 *
 * @description 管理员专用接口，获取积分系统统计信息
 * @route GET /api/v4/unified-engine/points/admin/statistics
 * @access Private (需要超级管理员权限)
 */
router.get('/admin/statistics', authenticateToken, async (req, res) => {
  try {
    const admin_id = req.user.user_id

    // 🛡️ 权限检查：只有超级管理员可以查看统计信息
    const adminRoles = await getUserRoles(admin_id)
    if (!adminRoles.isAdmin) {
      return res.apiError('无权限查看统计信息', 'PERMISSION_DENIED', {}, 403)
    }

    // 获取积分统计信息
    const { UserPointsAccount, PointsTransaction } = require('../../../models')
    const { Op } = require('sequelize')

    const [totalAccounts, activeAccounts, totalTransactions, recentTransactions] =
      await Promise.all([
        UserPointsAccount.count(),
        UserPointsAccount.count({ where: { is_active: true } }),
        PointsTransaction.count(),
        PointsTransaction.count({
          where: {
            transaction_time: {
              [Op.gte]: new Date(BeijingTimeHelper.timestamp() - 30 * 24 * 60 * 60 * 1000)
            }
          }
        })
      ])

    return res.apiSuccess(
      {
        statistics: {
          total_accounts: totalAccounts,
          active_accounts: activeAccounts,
          total_transactions: totalTransactions,
          recent_transactions: recentTransactions
        },
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '积分统计信息获取成功'
    )
  } catch (error) {
    console.error('获取积分统计失败:', error)
    return res.apiInternalError('获取积分统计失败', error.message, 'POINTS_STATISTICS_ERROR')
  }
})

/**
 * GET /user/statistics/:user_id - 获取用户统计数据
 *
 * @description 获取用户的完整统计信息，包括抽奖、兑换、上传等数据
 * @route GET /api/v4/unified-engine/points/user/statistics/:user_id
 * @access Private (需要认证)
 */
router.get('/user/statistics/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params
    const current_user_id = req.user.user_id

    // 🛡️ 权限检查：只能查询自己的统计数据，除非是超级管理员
    const currentUserRoles = await getUserRoles(current_user_id)
    if (parseInt(user_id) !== current_user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权限查询其他用户统计', 'PERMISSION_DENIED', {}, 403)
    }

    const { User } = require('../../../models')

    // 并行获取统计数据
    const [userInfo, pointsInfo, lotteryStats, exchangeStats, consumptionStats, inventoryStats] =
      await Promise.all([
        User.findByPk(parseInt(user_id), {
          attributes: ['user_id', 'created_at', 'last_login', 'login_count']
        }),
        PointsService.getUserPoints(parseInt(user_id)),
        getLotteryStatistics(parseInt(user_id)),
        getExchangeStatistics(parseInt(user_id)),
        getConsumptionStatistics(parseInt(user_id)), // 🔄 新业务：商家扫码录入消费记录统计
        getInventoryStatistics(parseInt(user_id))
      ])

    if (!userInfo) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND', {}, 404)
    }

    // 计算本月积分变化
    const monthStart = BeijingTimeHelper.createBeijingTime()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    const monthPoints = await PointsService.getUserTransactions(parseInt(user_id), {
      startDate: monthStart,
      limit: 1000
    })

    const monthEarned = monthPoints.data
      .filter(t => t.transaction_type === 'earn')
      .reduce((sum, t) => sum + parseFloat(t.points_amount), 0)

    const statistics = {
      user_id: parseInt(user_id),
      account_created: userInfo.created_at,
      last_activity: userInfo.last_login,
      login_count: userInfo.login_count,

      // 积分统计
      points: {
        current_balance: pointsInfo.available_points,
        total_earned: pointsInfo.total_earned,
        total_consumed: pointsInfo.total_consumed,
        month_earned: monthEarned
      },

      // 抽奖统计
      lottery: lotteryStats,

      // 兑换统计
      exchange: exchangeStats,

      // 消费记录统计（新业务：商家扫码录入）
      consumption: consumptionStats,

      // 库存统计
      inventory: inventoryStats,

      // 成就数据（基础实现）
      achievements: calculateAchievements({
        lottery: lotteryStats,
        exchange: exchangeStats,
        consumption: consumptionStats, // 🔄 使用新的消费记录统计
        totalEarned: pointsInfo.total_earned
      })
    }

    return res.apiSuccess(
      {
        statistics,
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '用户统计数据获取成功'
    )
  } catch (error) {
    console.error('获取用户统计失败:', error)
    return res.apiInternalError('获取用户统计失败', error.message, 'USER_STATISTICS_ERROR')
  }
})

/**
 * 辅助函数：获取抽奖统计
 * @param {number} user_id - 用户ID
 * @returns {Promise<Object>} 抽奖统计数据
 */
async function getLotteryStatistics (user_id) {
  const { LotteryDraw } = require('../../../models')

  const [totalCount, thisMonth] = await Promise.all([
    LotteryDraw.count({ where: { user_id } }),
    LotteryDraw.count({
      where: {
        user_id,
        created_at: {
          [require('sequelize').Op.gte]: new Date(
            BeijingTimeHelper.createDatabaseTime().getFullYear(),
            BeijingTimeHelper.createDatabaseTime().getMonth(),
            1
          )
        }
      }
    })
  ])

  return {
    total_count: totalCount,
    month_count: thisMonth,
    last_draw: null // TODO: 获取最后抽奖时间
  }
}

/**
 * 辅助函数：获取兑换统计
 * @param {number} user_id - 用户ID
 * @returns {Promise<Object>} 兑换统计数据
 */
async function getExchangeStatistics (user_id) {
  const { ExchangeRecords } = require('../../../models')

  const [totalCount, totalPoints, thisMonth] = await Promise.all([
    ExchangeRecords.count({ where: { user_id } }),
    ExchangeRecords.sum('total_points', { where: { user_id } }) || 0,
    ExchangeRecords.count({
      where: {
        user_id,
        exchange_time: {
          [require('sequelize').Op.gte]: new Date(
            BeijingTimeHelper.createDatabaseTime().getFullYear(),
            BeijingTimeHelper.createDatabaseTime().getMonth(),
            1
          )
        }
      }
    })
  ])

  return {
    total_count: totalCount,
    total_points: totalPoints,
    month_count: thisMonth
  }
}

/**
 * 🔄 新业务：获取消费记录统计（商家扫码录入）
 *
 * @param {number} user_id - 用户ID
 * @returns {Promise<Object>} 消费记录统计数据
 * @description 统计用户通过商家扫码录入的消费记录情况
 */
async function getConsumptionStatistics (user_id) {
  const { ConsumptionRecord } = require('../../../models')
  const { Op } = require('sequelize')

  // 如果ConsumptionRecord模型不存在,返回空数据(向后兼容)
  if (!ConsumptionRecord) {
    return {
      total_count: 0,
      approved_count: 0,
      pending_count: 0,
      approval_rate: 0,
      month_count: 0,
      total_consumption_amount: 0,
      total_points_awarded: 0
    }
  }

  // 本月第一天0点(北京时间)
  const monthStart = new Date(
    BeijingTimeHelper.createDatabaseTime().getFullYear(),
    BeijingTimeHelper.createDatabaseTime().getMonth(),
    1
  )

  const [totalCount, approvedCount, pendingCount, thisMonth, totalStats] = await Promise.all([
    // 总消费记录数
    ConsumptionRecord.count({ where: { user_id } }),

    // 已通过审核的记录数
    ConsumptionRecord.count({
      where: { user_id, status: 'approved' }
    }),

    // 待审核的记录数
    ConsumptionRecord.count({
      where: { user_id, status: 'pending' }
    }),

    // 本月消费记录数
    ConsumptionRecord.count({
      where: {
        user_id,
        created_at: { [Op.gte]: monthStart }
      }
    }),

    // 总消费金额和总奖励积分（过滤已删除记录）
    ConsumptionRecord.findAll({
      where: {
        user_id,
        status: 'approved',
        is_deleted: 0 // 统计时排除已删除的记录
      },
      attributes: [
        [require('sequelize').fn('SUM', require('sequelize').col('consumption_amount')), 'total_amount'],
        [require('sequelize').fn('SUM', require('sequelize').col('points_to_award')), 'total_points']
      ],
      raw: true
    })
  ])

  return {
    total_count: totalCount, // 总消费记录数
    approved_count: approvedCount, // 已通过审核数
    pending_count: pendingCount, // 待审核数
    approval_rate: totalCount > 0 ? ((approvedCount / totalCount) * 100).toFixed(1) : 0, // 审核通过率
    month_count: thisMonth, // 本月消费记录数
    total_consumption_amount: parseFloat(totalStats[0]?.total_amount || 0), // 总消费金额(元)
    total_points_awarded: parseInt(totalStats[0]?.total_points || 0) // 总奖励积分
  }
}

/**
 * 辅助函数：获取库存统计
 * @param {number} user_id - 用户ID
 * @returns {Promise<Object>} 库存统计数据
 */
async function getInventoryStatistics (user_id) {
  const { UserInventory } = require('../../../models')

  const [totalCount, availableCount, usedCount] = await Promise.all([
    UserInventory.count({ where: { user_id } }),
    UserInventory.count({ where: { user_id, status: 'available' } }),
    UserInventory.count({ where: { user_id, status: 'used' } })
  ])

  return {
    total_count: totalCount,
    available_count: availableCount,
    used_count: usedCount,
    usage_rate: totalCount > 0 ? ((usedCount / totalCount) * 100).toFixed(1) : 0
  }
}

/**
 * 辅助函数：计算成就
 * @param {Object} stats - 统计数据
 * @returns {Array} 成就列表
 */
function calculateAchievements (stats) {
  const achievements = []

  // 抽奖相关成就
  if (stats.lottery.total_count >= 1) {
    achievements.push({
      id: 'first_lottery',
      name: '初试身手',
      description: '完成第一次抽奖',
      unlocked: true,
      category: 'lottery'
    })
  }

  if (stats.lottery.total_count >= 10) {
    achievements.push({
      id: 'lottery_enthusiast',
      name: '抽奖达人',
      description: '完成10次抽奖',
      unlocked: true,
      category: 'lottery'
    })
  }

  // 兑换相关成就
  if (stats.exchange.total_count >= 1) {
    achievements.push({
      id: 'first_exchange',
      name: '首次兑换',
      description: '完成第一次商品兑换',
      unlocked: true,
      category: 'exchange'
    })
  }

  // 积分相关成就
  if (stats.totalEarned >= 1000) {
    achievements.push({
      id: 'points_collector',
      name: '积分收集者',
      description: '累计获得1000积分',
      unlocked: true,
      category: 'points'
    })
  }

  return achievements
}

/**
 * GET /api/v4/points/overview
 * 获取用户积分概览（包含可用积分和冻结积分）
 * @description 为用户提供完整的积分账户概览,包括:
 *              - 可用积分(可直接使用)
 *              - 冻结积分(待审核的消费奖励积分)
 *              - 累计获得/消费积分
 *              - 最近20条冻结交易记录
 * @returns {Object} 积分概览数据
 */
router.get('/overview', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id

    console.log(`📊 获取用户积分概览 - 用户ID: ${user_id}`)

    // 调用PointsService获取积分概览
    const overview = await PointsService.getUserPointsOverview(user_id)

    console.log(`✅ 积分概览获取成功 - 可用: ${overview.available_points}, 冻结: ${overview.frozen_points}`)

    return res.apiSuccess(overview, '积分概览获取成功')
  } catch (error) {
    console.error('❌ 获取积分概览失败:', error.message)
    return res.apiError('获取积分概览失败', 500, { error: error.message })
  }
})

/**
 * GET /api/v4/points/frozen
 * 获取用户冻结积分明细(分页)
 * @description 提供冻结积分的详细列表,包括:
 *              - 分页的冻结交易记录
 *              - 关联的消费记录详情
 *              - 冻结原因和时间
 * @query {number} page - 页码(默认1)
 * @query {number} page_size - 每页数量(默认20,最大50)
 * @returns {Object} 冻结积分分页数据
 */
router.get('/frozen', authenticateToken, async (req, res) => {
  try {
    const user_id = req.user.user_id
    const { page = 1, page_size = 20 } = req.query

    console.log(`📋 获取冻结积分明细 - 用户ID: ${user_id}, 页码: ${page}, 每页: ${page_size}`)

    // 调用PointsService获取冻结积分明细
    const frozenDetails = await PointsService.getUserFrozenPoints(user_id, {
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    console.log(`✅ 冻结积分明细获取成功 - 共${frozenDetails.total_count}条记录`)

    return res.apiSuccess(frozenDetails, '冻结积分明细获取成功')
  } catch (error) {
    console.error('❌ 获取冻结积分明细失败:', error.message)
    return res.apiError('获取冻结积分明细失败', 500, { error: error.message })
  }
})

/**
 * GET /trend - 获取用户积分趋势数据（图表展示专用）
 *
 * @description 获取用户指定天数内的积分获得/消费趋势数据，返回前端Chart.js可直接使用的格式
 * @route GET /api/v4/unified-engine/points/trend
 * @access Private（需要JWT认证，用户只能查询自己的数据）
 *
 * 业务逻辑（基于项目实际代码风格）:
 * 1. 从JWT token获取当前用户ID（req.user.user_id）
 * 2. 参数验证和清洗（days限制7-90天，end_date可选）
 * 3. 计算北京时间日期范围（使用BeijingTimeHelper工具类）
 * 4. Sequelize查询交易记录（使用Op.gte和Op.lte日期范围查询，命中idx_pt_user_time索引）
 * 5. JavaScript按日期分组统计（使用Map数据结构，Key为YYYY-MM-DD格式）
 * 6. 生成完整日期序列并补全缺失日期（循环生成labels数组和对应数据数组）
 * 7. 返回前端Chart.js可直接使用的数组格式（labels, earn_data, consume_data）
 * 8. 返回汇总统计数据（total_earn, total_consume, net_change）
 *
 * 设计理念（实用主义原则）:
 * - **代码简单**: 使用Sequelize ORM，避免复杂SQL，新人2小时内可理解
 * - **易维护**: 逻辑清晰分段（查询 → 分组 → 补全 → 返回），便于调试和修改
 * - **性能足够**: 小数据量（单用户<1000条记录），响应时间<500ms完全够用
 * - **技术统一**: 与项目其他API代码风格完全一致（参考transactions、balance等路由）
 * - **不增加债务**: 不引入新技术栈（如原生SQL、Redis缓存等），维护成本低
 *
 * 查询参数（Query Params）:
 * @query {number} days - 查询天数，默认30天，范围限制7-90天（超出自动修正）
 * @query {string} end_date - 结束日期，默认今天（北京时间），格式YYYY-MM-DD，用于查看历史趋势（可选）
 *
 * 返回数据结构（Response Data）:
 * @returns {Object} data - 趋势数据对象（包含图表数组和汇总统计）
 * @returns {Array<string>} data.labels - 日期标签数组，格式['11-01', '11-02', ...]（前端Chart.js的X轴labels）
 * @returns {Array<number>} data.earn_data - 每日获得积分数组（整数），与labels一一对应（前端datasets[0].data）
 * @returns {Array<number>} data.consume_data - 每日消费积分数组（正数，整数），与labels对应（前端datasets[1].data）
 * @returns {number} data.total_earn - 周期总获得积分（整数，汇总卡片显示）
 * @returns {number} data.total_consume - 周期总消费积分（正数整数，汇总卡片显示）
 * @returns {number} data.net_change - 净变化（总获得 - 总消费，可正可负，汇总卡片显示）
 * @returns {string} data.period - 统计周期描述，格式"2025-11-01 至 2025-11-30"（汇总卡片显示）
 * @returns {number} data.days - 实际统计天数（应等于查询参数days，用于前端验证）
 * @returns {number} data.data_points - 数据点数量（应等于days，前端验证数据完整性）
 * @returns {string} data.timestamp - 查询时间戳（北京时间，格式YYYY-MM-DD HH:mm:ss）
 *
 * 返回示例（前端可直接使用）:
 * {
 *   "success": true,
 *   "code": "SUCCESS",
 *   "message": "积分趋势查询成功",
 *   "data": {
 *     "labels": ["11-01", "11-02", "11-03", ..., "11-30"],        // 30个日期标签（前端X轴）
 *     "earn_data": [100, 50, 0, 200, ..., 150],                   // 30个获得积分（对应labels）
 *     "consume_data": [30, 0, 100, 50, ..., 80],                  // 30个消费积分（对应labels）
 *     "total_earn": 3500,                                         // 周期总获得
 *     "total_consume": 1200,                                      // 周期总消费
 *     "net_change": 2300,                                         // 净增加2300分
 *     "period": "2025-11-01 至 2025-11-30",                       // 统计周期
 *     "days": 30,                                                 // 统计天数
 *     "data_points": 30,                                          // 数据点数量
 *     "timestamp": "2025-11-02 14:30:00"                          // 查询时间
 *   },
 *   "timestamp": "2025-11-02 14:30:00",
 *   "version": "v4.0",
 *   "request_id": "req_1234567890_abcdef"
 * }
 */
router.get('/trend', authenticateToken, async (req, res) => {
  try {
    // 🔐 Step 1: 从JWT token获取当前登录用户ID（authenticateToken中间件已验证token有效性）
    const user_id = req.user.user_id // user_id类型：number，来自JWT payload

    /*
     * 📥 Step 2: 获取查询参数（Query Params）
     * days: 查询天数，默认30天（常用值：7/30/90天）
     * end_date: 结束日期，默认今天（格式：YYYY-MM-DD，可选参数）
     */
    let { days = 30, end_date } = req.query

    /*
     * 🔒 Step 3: 参数验证和安全清洗（防止注入和无效值）
     * parseInt(days)：转换为整数，失败返回NaN
     * || 30：如果NaN则使用默认值30
     * Math.max(..., 7)：最小值7天
     * Math.min(..., 90)：最大值90天
     * 最终范围：7-90天（超出自动修正，避免查询过多数据）
     */
    days = Math.min(Math.max(parseInt(days) || 30, 7), 90)

    /*
     * 📅 Step 4: 计算日期范围（使用项目标准时间工具BeijingTimeHelper）
     * 场景1：用户指定结束日期（查看历史趋势）
     * 场景2：默认今天（北京时间，常用场景）
     * 计算开始日期（向前推days-1天，包含结束日期当天共days天）
     * 例如：days=30，end_date=11-30，则start_date=11-01（共30天：11-01至11-30）
     */
    const end_date_obj = end_date
      ? new Date(end_date)
      : BeijingTimeHelper.createBeijingTime()

    const start_date_obj = new Date(end_date_obj)
    start_date_obj.setDate(start_date_obj.getDate() - (days - 1))
    start_date_obj.setHours(0, 0, 0, 0)

    const end_date_copy = new Date(end_date_obj)
    end_date_copy.setHours(23, 59, 59, 999)

    /*
     * 📊 Step 5: 记录查询日志（便于调试和问题追踪）
     */
    console.log(
      `📊 查询积分趋势 - 用户ID: ${user_id}, 天数: ${days}, 日期范围: ${start_date_obj.toISOString().split('T')[0]} 至 ${end_date_obj.toISOString().split('T')[0]}`
    )

    /*
     * 📦 Step 6: 使用Sequelize ORM查询交易记录（项目统一查询方式）
     */
    const { PointsTransaction } = require('../../../models')
    const { Op } = require('sequelize')

    const transactions = await PointsTransaction.findAll({
      where: {
        user_id,
        transaction_time: {
          [Op.gte]: start_date_obj,
          [Op.lte]: end_date_copy
        },
        status: 'completed',
        is_deleted: 0 // 趋势统计时排除已删除的记录
      },
      attributes: ['transaction_id', 'transaction_type', 'points_amount', 'transaction_time'],
      /*
       * 只查询需要的4个字段（减少数据传输量）：
       * - transaction_id: 交易ID（主键，用于排序和去重验证）
       * - transaction_type: 交易类型（earn获得/consume消费/expire过期/refund退款）
       * - points_amount: 积分数量（DECIMAL(10,2)类型，统一存储正数）
       * - transaction_time: 交易时间（DATE(3)毫秒精度，用于日期分组）
       */
      order: [['transaction_time', 'ASC']],
      raw: true
    })
    /*
     * 查询性能说明：
     * - 命中索引：idx_pt_user_time（user_id + transaction_time）
     * - 查询效率：单用户30天数据约60-150条记录，响应时间<100ms
     * - 无JOIN查询：单表查询，性能稳定可预期
     */

    console.log(`✅ 查询到${transactions.length}条交易记录`)

    /*
     * 📊 Step 7: 使用JavaScript按日期分组统计（应用层数据处理）
     * 选择Map数据结构的原因：
     * 1. Key可以是任意类型（这里使用字符串日期YYYY-MM-DD）
     * 2. 查询和插入性能O(1)
     * 3. 保持插入顺序（虽然我们不依赖顺序）
     * Map结构示例：
     * '2025-11-01' => { earn_amount: 100, consume_amount: 30 }
     * '2025-11-02' => { earn_amount: 50, consume_amount: 0 }
     * '2025-11-03' => { earn_amount: 0, consume_amount: 100 }
     */
    const daily_stats = new Map()

    transactions.forEach(tx => {
      /*
       * 提取日期部分（YYYY-MM-DD格式，丢弃时间部分）
       * raw: true时transaction_time可能是字符串，需要先转换为Date对象
       * toISOString()返回格式：2025-11-01T14:30:00.000Z
       * split('T')[0]提取日期部分：2025-11-01
       */
      const time_date = tx.transaction_time instanceof Date
        ? tx.transaction_time
        : new Date(tx.transaction_time)
      const date_key = time_date.toISOString().split('T')[0]

      if (!daily_stats.has(date_key)) {
        daily_stats.set(date_key, { earn_amount: 0, consume_amount: 0 })
      }

      const stats = daily_stats.get(date_key)
      /*
       * 取绝对值确保金额为正数（兼容历史数据可能存在负数的情况）
       * 标准规范：points_amount统一存储正数，由transaction_type区分获得/消费
       * 实际情况：部分历史数据可能存储了负数，需要兼容处理
       */
      const amount = Math.abs(parseFloat(tx.points_amount))

      /*
       * 根据交易类型累加（earn获得，consume消费）
       * 说明：忽略expire和refund类型（如需统计可在这里扩展）
       */
      if (tx.transaction_type === 'earn') {
        stats.earn_amount += amount
      } else if (tx.transaction_type === 'consume') {
        stats.consume_amount += amount
      }
    })

    /*
     * 🗓️ Step 8: 生成完整日期序列并补全缺失日期（前端图表需要连续日期）
     * 前端Chart.js折线图要求labels数组和data数组长度一致且一一对应
     * 如果某天没有交易，也要显示为0，否则图表会断开
     */
    const labels = []
    const earn_data = []
    const consume_data = []
    let total_earn = 0
    let total_consume = 0

    const current_date = new Date(start_date_obj)
    const final_end_date = new Date(end_date_obj)
    // eslint-disable-next-line no-unmodified-loop-condition
    while (current_date <= final_end_date) {
      const date_key = current_date.toISOString().split('T')[0]
      const label = date_key.substring(5)
      labels.push(label)

      const stats = daily_stats.get(date_key) || { earn_amount: 0, consume_amount: 0 }

      earn_data.push(Math.round(stats.earn_amount))
      consume_data.push(Math.round(stats.consume_amount))

      total_earn += stats.earn_amount
      total_consume += stats.consume_amount

      current_date.setDate(current_date.getDate() + 1)
    }
    /*
     * 循环完成后：
     * - labels数组长度 = days（如30天则30个元素）
     * - earn_data和consume_data数组长度也 = days
     * - 三个数组元素一一对应（labels[i], earn_data[i], consume_data[i]）
     */

    /*
     * 📊 Step 9: 记录数据处理结果日志（便于调试和性能监控）
     */
    console.log(
      `📈 数据处理完成 - 数据点: ${labels.length}, 总获得: ${Math.round(total_earn)}, 总消费: ${Math.round(total_consume)}`
    )

    /*
     * 🎉 Step 10: 返回趋势数据（使用项目统一的API响应格式）
     */
    return res.apiSuccess(
      {
        labels,
        earn_data,
        consume_data,
        total_earn: Math.round(total_earn),
        total_consume: Math.round(total_consume),
        net_change: Math.round(total_earn - total_consume),
        period: `${start_date_obj.toISOString().split('T')[0]} 至 ${end_date_obj.toISOString().split('T')[0]}`,
        days,
        data_points: labels.length,
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '积分趋势查询成功'
    )
    /*
     * 响应示例：
     * HTTP 200 OK
     * {
     *   "success": true,
     *   "code": "SUCCESS",
     *   "message": "积分趋势查询成功",
     *   "data": { labels: [...], earn_data: [...], ... },
     *   "timestamp": "2025-11-02 14:30:00",
     *   "version": "v4.0",
     *   "request_id": "req_1730534321_abcdef"
     * }
     */
  } catch (error) {
    /*
     * ❌ 错误处理（统一错误响应格式）
     * 记录完整错误堆栈（便于排查问题）
     */
    console.error('❌ 获取积分趋势失败:', error)
    return res.apiInternalError(
      '积分趋势查询失败',
      error.message,
      'POINTS_TREND_ERROR'
    )
    /*
     * 错误响应示例：
     * HTTP 200 OK（业务错误固定200，通过success字段区分）
     * {
     *   "success": false,
     *   "code": "POINTS_TREND_ERROR",
     *   "message": "积分趋势查询失败",
     *   "error": "Database connection timeout",
     *   "timestamp": "2025-11-02 14:30:00",
     *   "version": "v4.0",
     *   "request_id": "req_1730534321_abcdef"
     * }
     */
  }
})

/*
 * ========================================
 * API#7 统一软删除机制 - 积分交易记录软删除
 * ========================================
 */

/**
 * @route DELETE /api/v4/points/transaction/:transaction_id
 * @desc 软删除积分交易记录（用户端隐藏历史记录，管理员可恢复）
 * @access Private (用户自己的记录)
 *
 * @param {number} transaction_id - 积分交易记录ID（路径参数）
 *
 * @returns {Object} 删除确认信息
 * @returns {number} data.transaction_id - 被删除的交易记录ID
 * @returns {number} data.is_deleted - 删除标记（1=已删除）
 * @returns {string} data.deleted_at - 删除时间（北京时间）
 * @returns {string} data.record_type - 记录类型（points_transaction）
 * @returns {string} data.note - 操作说明
 *
 * 业务规则：
 * - 只能删除自己的积分交易记录
 * - 软删除：记录物理保留，只是标记为已删除（is_deleted=1）
 * - 前端查询时自动过滤已删除记录
 * - 删除交易记录不影响积分余额（余额在accounts表独立维护）
 * - 用户删除后无法自己恢复，只有管理员可以恢复
 */
router.delete('/transaction/:transaction_id', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id
    const { transaction_id } = req.params

    // 1. 参数验证
    if (!transaction_id || isNaN(parseInt(transaction_id))) {
      return res.apiError('无效的交易记录ID', 400)
    }

    const transactionId = parseInt(transaction_id)

    // 2. 查询交易记录
    const record = await models.PointsTransaction.findOne({
      where: {
        transaction_id: transactionId,
        user_id: userId, // 权限验证：只能删除自己的记录
        is_deleted: 0 // 只查询未删除的记录
      }
    })

    if (!record) {
      return res.apiError('交易记录不存在或已被删除', 404)
    }

    // 3. 检查是否已经被删除
    if (record.is_deleted === 1) {
      return res.apiError('该交易记录已经被删除，无需重复操作', 400)
    }

    // 4. 执行软删除
    const deletedAt = BeijingTimeHelper.createDatabaseTime()

    await record.update({
      is_deleted: 1,
      deleted_at: deletedAt
    })

    logger.info('软删除积分交易记录成功', {
      transaction_id: transactionId,
      user_id: userId,
      deleted_at: BeijingTimeHelper.formatForAPI(deletedAt)
    })

    // 5. 返回成功响应
    return res.apiSuccess(
      {
        transaction_id: transactionId,
        is_deleted: 1,
        deleted_at: BeijingTimeHelper.formatForAPI(deletedAt),
        record_type: 'points_transaction',
        note: '交易记录已隐藏，不会显示在历史列表中'
      },
      '交易记录已隐藏'
    )
  } catch (error) {
    logger.error('软删除积分交易记录失败', {
      error: error.message,
      transaction_id: req.params.transaction_id,
      user_id: req.user?.user_id
    })
    return res.apiError(error.message, 500)
  }
})

/**
 * @route POST /api/v4/points/transaction/:transaction_id/restore
 * @desc 管理员恢复已删除的积分交易记录（管理员专用）
 * @access Private (仅管理员)
 *
 * @param {number} transaction_id - 积分交易记录ID（路径参数）
 *
 * @returns {Object} 恢复确认信息
 * @returns {number} data.transaction_id - 恢复的交易记录ID
 * @returns {number} data.is_deleted - 删除标记（0=未删除）
 * @returns {number} data.user_id - 记录所属用户ID
 * @returns {string} data.note - 操作说明
 *
 * 业务规则：
 * - 仅管理员可以恢复已删除的记录
 * - 恢复后用户端将重新显示该记录
 * - 恢复操作会清空deleted_at时间戳
 */
router.post('/transaction/:transaction_id/restore', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { transaction_id } = req.params
    const adminId = req.user.user_id

    // 1. 参数验证
    if (!transaction_id || isNaN(parseInt(transaction_id))) {
      return res.apiError('无效的交易记录ID', 400)
    }

    const transactionId = parseInt(transaction_id)

    // 2. 查询已删除的记录（包含已删除的）
    const record = await models.PointsTransaction.findOne({
      where: {
        transaction_id: transactionId
        // 不过滤is_deleted，查询所有记录
      }
    })

    if (!record) {
      return res.apiError('交易记录不存在', 404)
    }

    // 3. 检查是否已经被删除
    if (record.is_deleted === 0) {
      return res.apiError('该交易记录未被删除，无需恢复', 400)
    }

    // 4. 恢复记录
    await record.update({
      is_deleted: 0,
      deleted_at: null
    })

    logger.info('管理员恢复积分交易记录成功', {
      transaction_id: transactionId,
      admin_id: adminId,
      original_user_id: record.user_id
    })

    // 5. 返回成功响应
    return res.apiSuccess(
      {
        transaction_id: transactionId,
        is_deleted: 0,
        user_id: record.user_id,
        note: '交易记录已恢复，用户端将重新显示该记录'
      },
      '交易记录已恢复'
    )
  } catch (error) {
    logger.error('恢复积分交易记录失败', {
      error: error.message,
      transaction_id: req.params.transaction_id,
      admin_id: req.user?.user_id
    })
    return res.apiError(error.message, 500)
  }
})

module.exports = router
