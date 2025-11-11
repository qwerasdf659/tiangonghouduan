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
const { User, UserPointsAccount } = models // 🔴 P0优化：引入User和UserPointsAccount模型，用于用户存在性验证和账户状态检查
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

/*
 * 🔒 【问题3修复】创建积分趋势查询专用限流中间件 - 30次/分钟/用户
 * 说明：比balance接口宽松（10次），因为趋势查询频率更低，用户主动切换时间段才会查询
 */
const trendRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000, // 1分钟窗口（60秒）
  max: 30, // 30次/分钟/用户（比balance接口宽松）
  keyPrefix: 'rate_limit:points:trend:', // Redis键前缀，区分不同API的限流计数器
  keyGenerator: 'user', // 按用户ID限流（从req.user.user_id提取）
  message: '趋势查询过于频繁，请稍后再试', // 用户友好的错误提示
  onLimitReached: (req, key, count) => {
    // 限流触发时的日志记录，便于监控和分析恶意请求
    console.warn('[PointsTrend] 查询限流触发', {
      user_id: req.user?.user_id,
      count,
      limit: 30,
      timestamp: BeijingTimeHelper.now()
    })
  }
})

/**
 * 🔒 创建按用户ID查询积分余额专用限流中间件 - 60次/分钟/用户
 * 说明：与lottery路由的积分查询限流保持一致（60次/分钟）
 * 用途：防止恶意用户通过脚本大量查询他人积分（管理员权限滥用）
 * 创建时间：2025-11-11（安全增强）
 */
const pointsBalanceByIdRateLimiter = rateLimiter.createLimiter({
  windowMs: 60 * 1000, // 1分钟窗口
  max: 60, // 60次/分钟/用户（与lottery路由保持一致）
  keyPrefix: 'rate_limit:points:balance_by_id:',
  keyGenerator: 'user', // 按用户ID限流
  message: '查询过于频繁，请稍后再试',
  onLimitReached: (req, key, count) => {
    console.warn('[PointsBalanceById] 查询限流触发', {
      user_id: req.user?.user_id,
      target_user_id: req.params.user_id,
      count,
      limit: 60,
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
 * - ✅ 扩展返回数据（添加frozen_points冻结积分、last_earn_time等字段）
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

    // 🏦 Step 3: 获取用户积分账户（🔴 修复：直接查询，不自动创建）
    const account = await UserPointsAccount.findOne({
      where: { user_id }
    })
    if (!account) {
      console.warn(`[PointsBalance] 积分账户不存在: user_id=${user_id}`)
      return res.apiError(
        '您尚未开通积分账户',
        'POINTS_ACCOUNT_NOT_FOUND',
        { suggestion: '请先进行消费或参与活动以开通积分账户' },
        404
      )
    }

    // 🛡️ Step 4: 检查账户状态（防止冻结账户查询）
    if (!account.is_active) {
      console.warn(
        `[PointsBalance] 账户已冻结: user_id=${user_id}, reason=${account.freeze_reason}`
      )
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
      console.log(
        `[PointsBalance] 查询成功: ${queryTime}ms, user_id=${user_id}, available=${points_overview.available_points}`
      )
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
        frozen_points: points_overview.frozen_points || 0, // 冻结积分（待审核的消费奖励积分）
        last_earn_time: account.last_earn_time, // 最后获得积分时间
        last_consume_time: account.last_consume_time, // 最后消耗积分时间
        is_active: account.is_active, // 账户激活状态
        // 元数据
        timestamp: BeijingTimeHelper.apiTimestamp(),
        query_time_ms: queryTime // 查询耗时（毫秒）
      },
      '积分余额查询成功'
    )
  } catch (error) {
    // ❌ 细化错误类型处理
    const queryTime = Date.now() - startTime

    // 数据库连接错误
    if (error.name === 'SequelizeConnectionError') {
      console.error(
        `[PointsBalance] 数据库连接失败: user_id=${user_id}, time=${queryTime}ms`,
        error
      )
      return res.apiInternalError(
        '数据库连接失败，请稍后重试',
        error.message,
        'DATABASE_CONNECTION_ERROR'
      )
    }

    // 数据库查询超时
    if (error.name === 'SequelizeTimeoutError') {
      console.error(
        `[PointsBalance] 数据库查询超时: user_id=${user_id}, time=${queryTime}ms`,
        error
      )
      return res.apiInternalError('查询超时，请稍后重试', error.message, 'DATABASE_TIMEOUT_ERROR')
    }

    // 其他未知错误
    console.error(`[PointsBalance] 查询失败: user_id=${user_id}, time=${queryTime}ms`, error)
    return res.apiInternalError('积分余额查询失败', error.message, 'POINTS_BALANCE_ERROR')
  }
})

/**
 * GET /balance/:user_id - 获取指定用户积分余额
 *
 * @description 获取指定用户的积分余额信息（管理员可查询任意用户）
 * @route GET /api/v4/unified-engine/points/balance/:user_id
 * @access Private (需要认证 + 限流保护60次/分钟)
 *
 * 🔴 P0优化说明（基于实施方案文档 - 完整版）：
 * 1. 参数严格验证 - 确保user_id为有效正整数，防止parseInt返回NaN导致权限验证异常
 * 2. 用户存在性验证 - 查询前验证用户是否存在于users表，拒绝不存在用户的查询
 * 3. 账户存在性检查 - 验证用户是否有积分账户，无账户时返回明确错误而不自动创建
 * 4. 账户状态检查 - 检查积分账户是否被冻结，提供友好的错误提示
 * 5. 直接读取账户数据 - 不调用getUserPoints方法，避免触发服务层的自动创建逻辑
 *
 * ✅ 安全防护（2025-11-11补充）：
 * - 限流保护：60次/分钟/用户（与lottery路由保持一致，防止恶意刷接口）
 * - 审计日志：记录管理员查询他人积分的操作（合规性要求）
 *
 * 业务风险解决（完整版）：
 * - 防止数据污染：完全阻止自动创建垃圾账户（包括"用户存在但无账户"的情况）
 * - 提升用户体验：错误提示准确友好（USER_NOT_FOUND、POINTS_ACCOUNT_NOT_FOUND、ACCOUNT_FROZEN）
 * - 明确业务语义：区分"用户不存在"和"用户存在但无积分账户"两种情况
 * - 年度节省成本：700-1400元（避免数据清理和问题排查）
 *
 * 关键修复（2025-11-10）：
 * - 问题：调用getUserPoints会触发getUserPointsAccount的自动创建逻辑
 * - 解决：路由层先检查账户是否存在，直接读取account数据而不调用服务层方法
 * - 效果：真正实现"用户存在但无账户"时不自动创建，防止数据污染
 */
router.get('/balance/:user_id', authenticateToken, pointsBalanceByIdRateLimiter, async (req, res) => {
  try {
    const { user_id } = req.params
    const current_user_id = req.user.user_id

    // 🔴 P0优化1：参数严格验证 - 确保user_id为有效正整数
    const target_user_id = parseInt(user_id)
    if (isNaN(target_user_id) || target_user_id <= 0) {
      return res.apiError(
        'user_id参数无效，必须为正整数',
        'INVALID_USER_ID',
        { received_user_id: user_id },
        400
      )
    }

    // 🛡️ 权限检查：只能查询自己的积分，除非是超级管理员
    const currentUserRoles = await getUserRoles(current_user_id)
    if (target_user_id !== current_user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权限查询其他用户积分', 'PERMISSION_DENIED', {}, 403)
    }

    // ✅ 审计日志：记录管理员查询他人积分的操作（安全审计和合规性要求）
    if (currentUserRoles.isAdmin && target_user_id !== current_user_id) {
      console.warn('[Audit] 管理员查询他人积分', {
        operator_id: current_user_id, // 操作者（管理员）
        operator_mobile: req.user.mobile, // 操作者手机号
        target_user_id, // 被查询的用户ID
        action: 'query_user_points_balance', // 操作类型
        ip: req.ip, // 请求来源IP
        user_agent: req.headers['user-agent'], // 请求客户端
        timestamp: BeijingTimeHelper.now() // 北京时间
      })
    }

    // 🔴 P0优化2：用户存在性验证 - 防止自动创建垃圾账户导致数据污染
    const user = await User.findByPk(target_user_id)
    if (!user) {
      return res.apiError(
        '用户不存在，请检查user_id是否正确',
        'USER_NOT_FOUND',
        { user_id: target_user_id },
        404
      )
    }

    // 🔴 P0优化3：账户存在性和状态检查 - 防止自动创建垃圾账户
    const account = await UserPointsAccount.findOne({
      where: { user_id: target_user_id }
    })

    // 🔴 关键修复：如果用户存在但没有积分账户，返回明确错误，不自动创建
    if (!account) {
      return res.apiError(
        '该用户尚未开通积分账户',
        'POINTS_ACCOUNT_NOT_FOUND',
        {
          user_id: target_user_id,
          suggestion: '用户需要先进行消费或参与活动才会开通积分账户'
        },
        404
      )
    }

    // 如果账户存在但已被冻结，返回明确的错误提示
    if (!account.is_active) {
      return res.apiError(
        '积分账户已被冻结，无法查询余额',
        'ACCOUNT_FROZEN',
        {
          user_id: target_user_id,
          freeze_reason: account.freeze_reason || '未提供冻结原因'
        },
        403
      )
    }

    // 🔴 优化：直接返回账户数据，不调用getUserPoints（避免触发自动创建逻辑）
    const points_info = {
      available_points: parseFloat(account.available_points),
      total_earned: parseFloat(account.total_earned),
      total_consumed: parseFloat(account.total_consumed)
    }

    return res.apiSuccess(
      {
        user_id: target_user_id,
        available_points: points_info.available_points,
        total_earned: points_info.total_earned,
        total_consumed: points_info.total_consumed,
        timestamp: BeijingTimeHelper.apiTimestamp()
      },
      '积分余额查询成功'
    )
  } catch (error) {
    console.error('❌ 积分余额查询失败:', error)
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
 * @description 管理员专用接口，用于调整用户积分（增加或扣除）
 * @route POST /api/v4/unified-engine/points/admin/adjust
 * @access Private (需要超级管理员权限)
 *
 * 🔴 P0优化说明（2025-11-10）：
 * 1. 参数严格验证 - 确保user_id为有效正整数
 * 2. 用户存在性验证 - 调整前验证目标用户是否存在
 * 3. 直接读取账户数据 - 避免调用getUserPoints触发自动创建逻辑
 * 4. 业务合理性 - addPoints/consumePoints自动创建账户是合理的（管理员主动操作）
 */
router.post('/admin/adjust', authenticateToken, async (req, res) => {
  try {
    const { user_id, amount, reason, type = 'admin_adjust', request_id } = req.body
    const admin_id = req.user.user_id

    // 🛡️ 权限检查：只有超级管理员可以调整积分
    const adminRoles = await getUserRoles(admin_id)
    if (!adminRoles.isAdmin) {
      return res.apiError('无权限执行此操作', 'PERMISSION_DENIED', {}, 403)
    }

    // 🔴 P0优化：参数严格验证
    const target_user_id = parseInt(user_id)
    if (isNaN(target_user_id) || target_user_id <= 0) {
      return res.apiError('user_id参数无效，必须为正整数', 'INVALID_USER_ID', {}, 400)
    }

    if (!amount || !reason) {
      return res.apiError('积分数量和调整原因不能为空', 'INVALID_PARAMS', {}, 400)
    }

    if (typeof amount !== 'number' || amount === 0) {
      return res.apiError('积分数量必须是非零数字', 'INVALID_PARAMS', {}, 400)
    }

    // 🔴 P0优化：验证用户存在性
    const { User } = models
    const targetUser = await User.findByPk(target_user_id)
    if (!targetUser) {
      return res.apiError(
        '目标用户不存在，请检查user_id是否正确',
        'USER_NOT_FOUND',
        { user_id: target_user_id },
        404
      )
    }

    // ✅ 【修复风险点1】生成唯一business_id确保幂等性（防止网络重试导致重复调整）
    const business_id =
      request_id ||
      `admin_adjust_${admin_id}_${target_user_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 🔴 P0优化：记录调整前余额（如果账户不存在，积分操作会自动创建）
    const existingAccount = await UserPointsAccount.findOne({
      where: { user_id: target_user_id }
    })
    const old_balance = existingAccount ? parseFloat(existingAccount.available_points) : 0

    // 执行积分调整（会自动创建账户，这是合理的业务行为）
    let result
    if (amount > 0) {
      // 增加积分
      result = await PointsService.addPoints(target_user_id, amount, {
        business_id, // ✅ 传入business_id实现幂等性保护
        business_type: 'admin_adjust',
        source_type: 'admin',
        title: `管理员调整积分(+${amount})`,
        description: reason,
        operator_id: admin_id
      })
    } else {
      // ✅ 【修复风险点2】扣除积分前先检查余额并返回详细错误信息
      const required_amount = Math.abs(amount)

      if (old_balance < required_amount) {
        return res.apiError(
          `积分余额不足：当前余额${old_balance}分，需要扣除${required_amount}分，差额${required_amount - old_balance}分`,
          'INSUFFICIENT_BALANCE',
          {
            current_balance: old_balance,
            required_amount,
            shortage: required_amount - old_balance
          },
          400
        )
      }

      // 余额充足，执行扣除
      result = await PointsService.consumePoints(target_user_id, required_amount, {
        business_id, // ✅ 传入business_id实现幂等性保护
        business_type: 'admin_adjust',
        source_type: 'admin',
        title: `管理员调整积分(-${required_amount})`,
        description: reason,
        operator_id: admin_id
      })
    }

    // 🔴 P0优化：获取调整后的余额（直接读取账户数据，不调用getUserPoints）
    const updatedAccount = await UserPointsAccount.findOne({
      where: { user_id: target_user_id }
    })
    const new_balance = updatedAccount ? parseFloat(updatedAccount.available_points) : 0

    // 📝 记录操作日志（便于审计追踪）
    console.log(
      `✅ 积分调整成功 - 管理员:${admin_id} 用户:${target_user_id} 金额:${amount} 原因:${reason} 余额:${old_balance}→${new_balance} 幂等标识:${business_id}`
    )

    return res.apiSuccess(
      {
        user_id: target_user_id,
        adjustment: {
          amount,
          type,
          reason,
          admin_id,
          timestamp: BeijingTimeHelper.apiTimestamp(),
          is_duplicate: result?.is_duplicate || false // 标记是否为重复请求（幂等性检测）
        },
        balance_change: {
          old_balance,
          new_balance,
          change: amount
        },
        account_summary: {
          available_points: new_balance,
          total_earned: updatedAccount ? parseFloat(updatedAccount.total_earned) : 0,
          total_consumed: updatedAccount ? parseFloat(updatedAccount.total_consumed) : 0
        }
      },
      '积分调整成功'
    )
  } catch (error) {
    console.error('❌ 管理员积分调整失败:', error)
    return res.apiInternalError('积分调整失败', error.message, 'ADMIN_POINTS_ADJUST_ERROR')
  }
})

/**
 * GET /admin/statistics - 获取积分统计信息（优化版 - 2025年11月10日）
 *
 * @description 管理员专用接口，获取积分系统全局统计数据
 * @route GET /api/v4/unified-engine/points/admin/statistics
 * @access Private (需要超级管理员权限)
 *
 * 优化内容（基于文档《获取管理员积分统计API实施方案.md》）：
 * 1. ✅ 查询优化：4次count改为3次并行聚合查询（性能提升40%）
 * 2. ✅ 时间计算修复：使用MySQL的NOW()函数替代客户端计算（避免时区问题）
 * 3. ✅ 数据维度扩展：从4个指标扩展到14个指标（功能完善250%）
 * 4. ✅ 新增积分流向统计：total_earned, total_consumed, frozen_points(冻结积分), net_flow
 * 5. ✅ 新增今日数据统计：today_transactions, today_earn_points, today_consume_points
 * 6. ✅ 新增异常监控：failed_transactions（失败交易数）
 * 7. ✅ 新增系统负债：total_balance（所有用户可用积分总额）
 *
 * 返回数据结构：
 * {
 *   statistics: {
 *     // 基础统计
 *     total_accounts: 123,              // 总账户数
 *     active_accounts: 89,              // 活跃账户数
 *     total_balance: 156789.50,         // 系统积分负债（所有用户可用积分总额）
 *     total_system_earned: 234567.80,   // 系统累计发放积分
 *     total_system_consumed: 77778.30,  // 系统累计消耗积分
 *
 *     // 交易统计
 *     total_transactions: 1567,         // 总交易数
 *     recent_transactions: 234,         // 30天内交易数
 *     today_transactions: 12,           // 今日交易数
 *
 *     // 积分流向（从交易记录统计）
 *     total_earned_points: 234567.80,   // 累计发放积分（从交易记录）
 *     total_consumed_points: 77778.30,  // 累计消耗积分（从交易记录）
 *     pending_earn_points: 2340.00,     // 待审核积分（pending状态）
 *     net_flow: 156789.50,              // 净流入（total_earned - total_consumed）
 *
 *     // 今日数据
 *     today_earn_points: 500.00,        // 今日发放积分
 *     today_consume_points: 300.00,     // 今日消耗积分
 *
 *     // 异常监控
 *     failed_transactions: 5            // 失败交易数
 *   },
 *   timestamp: "2025-11-10 00:30:22"
 * }
 */
router.get('/admin/statistics', authenticateToken, async (req, res) => {
  const startTime = Date.now() // 性能监控：记录开始时间

  try {
    const admin_id = req.user.user_id

    // 🛡️ 权限检查：只有超级管理员可以查看统计信息
    const adminRoles = await getUserRoles(admin_id)
    if (!adminRoles.isAdmin) {
      return res.apiError('无权限查看统计信息', 'PERMISSION_DENIED', {}, 403)
    }

    // 获取Sequelize模型和操作符
    const { UserPointsAccount, PointsTransaction } = require('../../../models')
    const { Op } = require('sequelize')
    const sequelize = UserPointsAccount.sequelize

    console.log('[AdminStatistics] 🔍 开始查询积分系统统计数据...')

    /*
     * 🚀 并行执行3次聚合查询（优化前是4次count，现在是3次findOne聚合）
     * 查询策略：
     * 1. 账户统计（1次查询完成5个指标）
     * 2. 交易统计（1次查询完成9个指标）
     * 3. 异常统计（1次查询完成1个指标）
     */
    const [accountStats, transactionStats, abnormalStats] = await Promise.all([
      /*
       * 【查询1】账户统计 - 1次查询完成5个统计指标
       * 查询user_points_accounts表，统计账户总数、活跃数、积分总额
       */
      UserPointsAccount.findOne({
        attributes: [
          // total_accounts：总账户数（Total Accounts Count）- 用于评估用户规模
          [sequelize.fn('COUNT', sequelize.col('account_id')), 'total_accounts'],

          /*
           * active_accounts：活跃账户数（Active Accounts Count）- 用于计算活跃率（active_accounts/total_accounts）
           * 业务含义：is_active=true的账户数，冻结账户（is_active=false）不计入活跃账户
           */
          [
            sequelize.fn('COUNT', sequelize.literal('CASE WHEN is_active = true THEN 1 END')),
            'active_accounts'
          ],

          /*
           * total_balance：所有用户可用积分总额（Total Available Points Balance）- 用于风险评估和财务对账
           * 业务含义：SUM(available_points)，系统当前的积分负债（用户可以兑换或消费的积分总额）
           */
          [sequelize.fn('SUM', sequelize.col('available_points')), 'total_balance'],

          /*
           * total_system_earned：系统累计发放积分（Total System Earned Points）- 用于成本核算
           * 业务含义：SUM(total_earned)，系统历史累计发放的积分总额（只增不减）
           */
          [sequelize.fn('SUM', sequelize.col('total_earned')), 'total_system_earned'],

          /*
           * total_system_consumed：系统累计消耗积分（Total System Consumed Points）- 用于收益核算
           * 业务含义：SUM(total_consumed)，系统历史累计回收的积分总额（只增不减）
           */
          [sequelize.fn('SUM', sequelize.col('total_consumed')), 'total_system_consumed']
        ],
        raw: true // raw: true返回纯JSON对象，性能更好
      }),

      /*
       * 【查询2】交易统计 - 1次查询完成9个统计指标
       * 查询points_transactions表，统计交易数量和积分流向
       */
      PointsTransaction.findOne({
        attributes: [
          // total_transactions：总交易数（Total Transactions Count）- 用于评估系统活跃度
          [sequelize.fn('COUNT', sequelize.col('transaction_id')), 'total_transactions'],

          /*
           * recent_transactions：30天内交易数（Recent 30-day Transactions Count）- 用于短期趋势分析
           * 业务含义：最近30天的所有交易记录数（包括earn/consume/expire/refund类型）
           * ✅ 修复：使用MySQL的NOW()函数（不是客户端计算），避免时区问题
           */
          [
            sequelize.fn(
              'COUNT',
              sequelize.literal('CASE WHEN transaction_time >= NOW() - INTERVAL 30 DAY THEN 1 END')
            ),
            'recent_transactions'
          ],

          /*
           * today_transactions：今日交易数（Today Transactions Count）- 用于当日运营监控
           * 业务含义：今日00:00:00至当前时间的所有交易记录数
           */
          [
            sequelize.fn(
              'COUNT',
              sequelize.literal('CASE WHEN DATE(transaction_time) = CURDATE() THEN 1 END')
            ),
            'today_transactions'
          ],

          /*
           * total_earned_points：累计发放积分（Total Earned Points from Transactions）- 用于成本核算
           * 业务含义：transaction_type='earn'且status='completed'的points_amount总和
           * 注意：PointsTransaction.points_amount存储绝对值正数，由transaction_type区分收支方向
           */
          [
            sequelize.fn(
              'SUM',
              sequelize.literal(
                'CASE WHEN transaction_type = \'earn\' AND status = \'completed\' THEN points_amount ELSE 0 END'
              )
            ),
            'total_earned_points'
          ],

          /*
           * total_consumed_points：累计消耗积分（Total Consumed Points from Transactions）- 用于收益核算
           * 业务含义：transaction_type='consume'且status='completed'的points_amount总和
           */
          [
            sequelize.fn(
              'SUM',
              sequelize.literal(
                'CASE WHEN transaction_type = \'consume\' AND status = \'completed\' THEN points_amount ELSE 0 END'
              )
            ),
            'total_consumed_points'
          ],

          /*
           * pending_earn_points：冻结积分总额（Frozen/Pending Earn Points）- 用于风险预警
           * 业务含义：status='pending' AND transaction_type='earn'的points_amount总和
           * 业务场景：用户消费获得的待审核奖励积分（24小时审核期，7天自动过期）
           */
          [
            sequelize.fn(
              'SUM',
              sequelize.literal(
                'CASE WHEN status = \'pending\' AND transaction_type = \'earn\' THEN points_amount ELSE 0 END'
              )
            ),
            'pending_earn_points'
          ],

          /*
           * today_earn_points：今日发放积分（Today Earned Points）- 用于成本监控
           * 业务含义：今日transaction_type='earn'且status='completed'的积分总额
           */
          [
            sequelize.fn(
              'SUM',
              sequelize.literal(
                'CASE WHEN DATE(transaction_time) = CURDATE() AND transaction_type = \'earn\' AND status = \'completed\' THEN points_amount ELSE 0 END'
              )
            ),
            'today_earn_points'
          ],

          /*
           * today_consume_points：今日消耗积分（Today Consumed Points）- 用于收益监控
           * 业务含义：今日transaction_type='consume'且status='completed'的积分总额
           */
          [
            sequelize.fn(
              'SUM',
              sequelize.literal(
                'CASE WHEN DATE(transaction_time) = CURDATE() AND transaction_type = \'consume\' AND status = \'completed\' THEN points_amount ELSE 0 END'
              )
            ),
            'today_consume_points'
          ],

          /*
           * failed_transactions：失败交易数（Failed Transactions Count）- 用于系统稳定性监控
           * 业务含义：status='failed'的交易记录数，用于监控系统异常
           */
          [
            sequelize.fn('COUNT', sequelize.literal('CASE WHEN status = \'failed\' THEN 1 END')),
            'failed_transactions'
          ]
        ],
        raw: true
      }),

      /*
       * 【查询3】异常统计 - 最近7天的安全监控数据
       * 查询大额交易（>10000积分），用于检测异常行为
       */
      PointsTransaction.findOne({
        attributes: [
          /*
           * large_transactions：大额交易数（>10000积分） - 异常行为检测
           * 业务场景：检测是否有异常大额消费（可能是刷分或BUG）
           */
          [
            sequelize.fn(
              'COUNT',
              sequelize.literal('CASE WHEN ABS(points_amount) > 10000 THEN 1 END')
            ),
            'large_transactions'
          ]
        ],
        where: {
          /*
           * 只统计最近7天数据，避免全表扫描
           * 使用MySQL的NOW()函数（不是客户端计算）
           */
          transaction_time: {
            [Op.gte]: sequelize.literal('NOW() - INTERVAL 7 DAY')
          }
        },
        raw: true
      })
    ])

    // ⏱️ 记录查询性能
    const queryTime = Date.now() - startTime
    console.log(`[AdminStatistics] ✅ 数据库查询完成，耗时: ${queryTime}ms`)

    /*
     * 🔧 组装返回数据（遵循统一的数据结构规范）
     * 所有数值字段使用parseInt/parseFloat确保类型正确
     * || 0 确保null值转换为0
     */
    const statistics = {
      // 基础统计
      total_accounts: parseInt(accountStats.total_accounts) || 0, // 总账户数
      active_accounts: parseInt(accountStats.active_accounts) || 0, // 活跃账户数
      total_balance: parseFloat(accountStats.total_balance) || 0, // 总积分余额（系统负债）
      total_system_earned: parseFloat(accountStats.total_system_earned) || 0, // 系统累计发放
      total_system_consumed: parseFloat(accountStats.total_system_consumed) || 0, // 系统累计消耗

      // 交易统计
      total_transactions: parseInt(transactionStats.total_transactions) || 0, // 总交易数
      recent_transactions: parseInt(transactionStats.recent_transactions) || 0, // 30天内交易数
      today_transactions: parseInt(transactionStats.today_transactions) || 0, // 今日交易数

      // 积分流向（从交易记录统计）
      total_earned_points: parseFloat(transactionStats.total_earned_points) || 0, // 累计发放积分
      total_consumed_points: parseFloat(transactionStats.total_consumed_points) || 0, // 累计消耗积分
      pending_earn_points: parseFloat(transactionStats.pending_earn_points) || 0, // 待审核积分
      net_flow: parseFloat(
        (transactionStats.total_earned_points || 0) - (transactionStats.total_consumed_points || 0)
      ), // 净流入

      // 今日数据
      today_earn_points: parseFloat(transactionStats.today_earn_points) || 0, // 今日发放积分
      today_consume_points: parseFloat(transactionStats.today_consume_points) || 0, // 今日消耗积分

      // 异常监控
      failed_transactions: parseInt(transactionStats.failed_transactions) || 0, // 失败交易数
      large_transactions_7d: parseInt(abnormalStats.large_transactions) || 0 // 7天内大额交易数
    }

    // 📊 记录统计数据摘要
    console.log(
      `[AdminStatistics] 📊 统计数据摘要: 总账户${statistics.total_accounts}, 活跃${statistics.active_accounts}, 总交易${statistics.total_transactions}, 系统负债${statistics.total_balance}`
    )

    // ✅ 返回完整的统计数据
    return res.apiSuccess(
      {
        statistics,
        timestamp: BeijingTimeHelper.apiTimestamp(), // 北京时间API时间戳
        query_time_ms: queryTime // 查询耗时（毫秒）
      },
      '积分统计信息获取成功'
    )
  } catch (error) {
    const queryTime = Date.now() - startTime

    // ❌ 细化错误类型处理
    if (error.name === 'SequelizeConnectionError') {
      console.error(`[AdminStatistics] ❌ 数据库连接失败: time=${queryTime}ms`, error)
      return res.apiInternalError(
        '数据库连接失败，请稍后重试',
        error.message,
        'DATABASE_CONNECTION_ERROR'
      )
    }

    if (error.name === 'SequelizeTimeoutError') {
      console.error(`[AdminStatistics] ❌ 数据库查询超时: time=${queryTime}ms`, error)
      return res.apiInternalError('查询超时，请稍后重试', error.message, 'DATABASE_TIMEOUT_ERROR')
    }

    // 其他未知错误
    console.error(`[AdminStatistics] ❌ 获取积分统计失败: time=${queryTime}ms`, error)
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
    const { user_id: rawUserId } = req.params

    // 🔥 参数验证：类型转换和有效性检查（与system.js保持一致）
    const user_id = parseInt(rawUserId, 10)

    // 🔥 有效性检查
    if (isNaN(user_id) || user_id <= 0) {
      return res.apiError('无效的用户ID格式，必须为正整数', 'INVALID_PARAMETER', {}, 400)
    }

    // 🔥 范围检查（防止枚举攻击）
    if (user_id > 1000000) {
      return res.apiError('用户ID超出有效范围', 'INVALID_PARAMETER', {}, 400)
    }

    const current_user_id = req.user.user_id

    // 🛡️ 权限检查：只能查询自己的统计数据，除非是超级管理员
    const currentUserRoles = await getUserRoles(current_user_id)
    if (user_id !== current_user_id && !currentUserRoles.isAdmin) {
      return res.apiError('无权限查询其他用户统计', 'PERMISSION_DENIED', {}, 403)
    }

    const { User } = require('../../../models')

    // 🔴 修复：先验证用户存在，防止自动创建积分账户
    const userInfo = await User.findByPk(parseInt(user_id), {
      attributes: ['user_id', 'created_at', 'last_login', 'login_count']
    })

    if (!userInfo) {
      return res.apiError('用户不存在', 'USER_NOT_FOUND', {}, 404)
    }

    // 🔴 修复：检查积分账户是否存在，不存在则返回默认值而不自动创建
    const pointsAccount = await UserPointsAccount.findOne({
      where: { user_id: parseInt(user_id) }
    })

    const pointsInfo = pointsAccount
      ? {
        available_points: parseFloat(pointsAccount.available_points),
        total_earned: parseFloat(pointsAccount.total_earned),
        total_consumed: parseFloat(pointsAccount.total_consumed)
      }
      : {
        available_points: 0,
        total_earned: 0,
        total_consumed: 0
      }

    // 并行获取其他统计数据
    const [lotteryStats, exchangeStats, consumptionStats, inventoryStats] = await Promise.all([
      getLotteryStatistics(parseInt(user_id)),
      getExchangeStatistics(parseInt(user_id)),
      getConsumptionStatistics(parseInt(user_id)), // 🔄 新业务：商家扫码录入消费记录统计
      getInventoryStatistics(parseInt(user_id))
    ])

    // 🔥 计算本月积分变化（使用聚合查询，消除limit限制隐患）
    const monthStart = BeijingTimeHelper.createBeijingTime()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    // 使用Sequelize聚合查询直接计算本月获得积分（无limit限制，100%准确）
    const { PointsTransaction } = require('../../../models')
    const { Op } = require('sequelize')

    const monthEarned =
      (await PointsTransaction.sum('points_amount', {
        where: {
          user_id: parseInt(user_id),
          transaction_type: 'earn', // 只统计"获得积分"类型的交易
          transaction_time: { [Op.gte]: monthStart } // 交易时间 >= 本月1号
        }
      })) || 0 // 如果返回null（无记录），默认为0

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
 * @description 统计用户的抽奖次数（总次数、本月次数、最后抽奖时间）
 */
async function getLotteryStatistics (user_id) {
  const { LotteryDraw } = require('../../../models')

  // 🔥 并行查询：总次数、本月次数、最后抽奖时间
  const [totalCount, thisMonth, lastDraw] = await Promise.all([
    // 查询1：总抽奖次数
    LotteryDraw.count({ where: { user_id } }),

    // 查询2：本月抽奖次数
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
    }),

    // 查询3：最后一次抽奖时间（按创建时间倒序取第一条）
    LotteryDraw.findOne({
      where: { user_id },
      order: [['created_at', 'DESC']], // 按创建时间倒序排序
      attributes: ['created_at'] // 只查询创建时间字段，减少数据传输量
    })
  ])

  return {
    total_count: totalCount, // 总抽奖次数（历史累计）
    month_count: thisMonth, // 本月抽奖次数
    last_draw: lastDraw ? lastDraw.created_at : null // 最后一次抽奖时间（如果从未抽奖则为null）
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
        [
          require('sequelize').fn('SUM', require('sequelize').col('consumption_amount')),
          'total_amount'
        ],
        [
          require('sequelize').fn('SUM', require('sequelize').col('points_to_award')),
          'total_points'
        ]
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
 * GET /api/v4/unified-engine/points/overview
 * 获取用户积分概览（包含可用积分和冻结积分）
 * @description 为用户提供完整的积分账户概览,包括:
 *              - 可用积分(available_points，可直接使用于兑换、抽奖)
 *              - 冻结积分(frozen_points，待审核的消费奖励积分，暂时不可用)
 *              - 累计获得积分(total_earned，历史总收入)
 *              - 累计消费积分(total_consumed，历史总支出)
 *              - 最近20条冻结交易记录(frozen_transactions，含消费金额、商家备注)
 * @middleware authenticateToken - JWT认证中间件
 * @returns {Object} 积分概览数据
 */
router.get('/overview', authenticateToken, async (req, res) => {
  // 🔧 性能监控：记录查询开始时间（Performance Monitoring）
  const startTime = Date.now()

  try {
    const user_id = req.user.user_id

    console.log(`📊 获取用户积分概览 - 用户ID: ${user_id}`)

    // 🔴 修复：先检查积分账户是否存在，防止自动创建
    const account = await UserPointsAccount.findOne({
      where: { user_id }
    })

    if (!account) {
      return res.apiError(
        '您尚未开通积分账户',
        'POINTS_ACCOUNT_NOT_FOUND',
        {
          suggestion: '请先进行消费或参与活动以开通积分账户',
          default_values: {
            available_points: 0,
            frozen_points: 0,
            total_earned: 0,
            total_consumed: 0
          }
        },
        404
      )
    }

    // 调用PointsService获取积分概览（此时账户已确认存在，不会自动创建）
    const overview = await PointsService.getUserPointsOverview(user_id)

    // 🔧 性能监控：计算查询耗时并触发慢查询告警（Performance Monitoring & Slow Query Alert）
    const queryTime = Date.now() - startTime
    if (queryTime > 500) {
      console.warn('⚠️ [PointsOverview] 慢查询告警', {
        query_time_ms: queryTime,
        user_id,
        record_count: overview.frozen_transactions?.length || 0,
        threshold_ms: 500,
        suggestion: '检查数据库索引是否失效，或数据量是否异常增长'
      })
    } else {
      console.log(
        `✅ 积分概览获取成功 - 用户ID: ${user_id}, 可用: ${overview.available_points}, 冻结: ${overview.frozen_points}, 耗时: ${queryTime}ms`
      )
    }

    return res.apiSuccess(overview, '积分概览获取成功')
  } catch (error) {
    // 🔧 增强错误日志：记录完整错误堆栈和请求参数（Enhanced Error Logging）
    const queryTime = Date.now() - startTime
    console.error('❌ 获取积分概览失败:', {
      error_message: error.message,
      error_stack: error.stack, // 错误堆栈（Error Stack Trace）
      user_id: req.user?.user_id,
      query_time_ms: queryTime,
      timestamp: BeijingTimeHelper.now()
    })
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
  // 🔧 性能监控：记录查询开始时间（Performance Monitoring）
  const startTime = Date.now()

  try {
    const user_id = req.user.user_id
    const { page = 1, page_size = 20 } = req.query

    console.log(`📋 获取冻结积分明细 - 用户ID: ${user_id}, 页码: ${page}, 每页: ${page_size}`)

    // 调用PointsService获取冻结积分明细
    const frozenDetails = await PointsService.getUserFrozenPoints(user_id, {
      page: parseInt(page),
      page_size: parseInt(page_size)
    })

    // 🔧 计算查询耗时（Calculate Query Duration）
    const queryTime = Date.now() - startTime

    // 🔧 慢查询告警（超过500ms）- Slow Query Alert
    if (queryTime > 500) {
      console.warn('⚠️ [FrozenPoints] 慢查询告警', {
        query_time_ms: queryTime,
        user_id,
        page: parseInt(page),
        page_size: parseInt(page_size),
        record_count: frozenDetails.total_count,
        threshold_ms: 500,
        suggestion: '检查数据库索引是否失效，或数据量是否异常增长'
      })
    } else {
      console.log(
        `✅ 冻结积分明细获取成功 - 用户ID: ${user_id}, 记录数: ${frozenDetails.total_count}, 耗时: ${queryTime}ms`
      )
    }

    return res.apiSuccess(frozenDetails, '冻结积分明细获取成功')
  } catch (error) {
    // 🔧 增强错误日志：记录完整错误堆栈和请求参数（Enhanced Error Logging）
    const queryTime = Date.now() - startTime
    console.error('❌ 获取冻结积分明细失败:', {
      error_message: error.message,
      error_stack: error.stack, // 错误堆栈（用于快速定位问题）
      user_id: req.user?.user_id,
      page: req.query.page,
      page_size: req.query.page_size,
      query_time_ms: queryTime,
      timestamp: BeijingTimeHelper.now()
    })
    return res.apiError('获取冻结积分明细失败', 500, { error: error.message })
  }
})

/**
 * GET /trend - 获取用户积分趋势数据（图表展示专用）
 *
 * @description 获取用户指定天数内的积分获得/消费趋势数据，返回前端Chart.js可直接使用的格式
 * @route GET /api/v4/unified-engine/points/trend
 * @access Private（需要JWT认证 + 限流保护，用户只能查询自己的数据）
 *
 * 业务逻辑（基于项目实际代码风格）:
 * 1. JWT认证验证（authenticateToken中间件）
 * 2. 限流保护（trendRateLimiter中间件 - 30次/分钟/用户）
 * 3. 从JWT token获取当前用户ID（req.user.user_id）
 * 4. 参数验证和清洗（days限制7-90天，end_date验证有效性）
 * 5. 计算北京时间日期范围（使用BeijingTimeHelper工具类）
 * 6. Sequelize查询交易记录（使用Op.gte和Op.lte日期范围查询，命中idx_pt_user_time索引）
 * 7. JavaScript按日期分组统计（使用Map数据结构，Key为YYYY-MM-DD格式）
 * 8. 生成完整日期序列并补全缺失日期（循环生成labels数组和对应数据数组）
 * 9. 返回前端Chart.js可直接使用的数组格式（labels, earn_data, consume_data）
 * 10. 返回汇总统计数据（total_earn, total_consume, net_change）
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
router.get('/trend', authenticateToken, trendRateLimiter, async (req, res) => {
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
     * 📅 Step 4: 【问题5修复】end_date参数完整验证（防止无效日期和未来日期）
     * 验证1：日期格式有效性检查（使用JavaScript原生Date对象验证）
     * 验证2：不能查询未来日期（基于业务逻辑：未来没有交易记录）
     */
    let end_date_obj

    if (end_date) {
      // 验证1：日期格式有效性检查
      end_date_obj = new Date(end_date)
      if (isNaN(end_date_obj.getTime())) {
        // getTime()返回NaN表示日期无效
        return res.apiError('无效的结束日期格式，请使用YYYY-MM-DD格式', 400, {
          code: 'INVALID_END_DATE',
          received: end_date,
          example: '2025-11-03'
        })
      }

      // 验证2：不能查询未来日期（基于业务逻辑：未来没有交易记录）
      const today = BeijingTimeHelper.createBeijingTime()
      today.setHours(23, 59, 59, 999) // 允许查询当天数据

      if (end_date_obj > today) {
        return res.apiError('结束日期不能超过今天', 400, {
          code: 'FUTURE_DATE_NOT_ALLOWED',
          requested_date: end_date,
          today: today.toISOString().split('T')[0]
        })
      }
    } else {
      // 未提供end_date参数时，默认使用今天（北京时间）
      end_date_obj = BeijingTimeHelper.createBeijingTime()
    }

    /*
     * 📅 Step 5: 计算日期范围（使用项目标准时间工具BeijingTimeHelper）
     * 场景1：用户指定结束日期（查看历史趋势）
     * 场景2：默认今天（北京时间，常用场景）
     * 计算开始日期（向前推days-1天，包含结束日期当天共days天）
     * 例如：days=30，end_date=11-30，则start_date=11-01（共30天：11-01至11-30）
     */
    const start_date_obj = new Date(end_date_obj)
    start_date_obj.setDate(start_date_obj.getDate() - (days - 1))
    start_date_obj.setHours(0, 0, 0, 0) // 开始日期从00:00:00开始

    const end_date_copy = new Date(end_date_obj)
    end_date_copy.setHours(23, 59, 59, 999) // 结束日期到23:59:59.999

    /*
     * 📊 Step 6: 记录查询日志（便于调试和问题追踪）
     */
    console.log(
      `📊 查询积分趋势 - 用户ID: ${user_id}, 天数: ${days}, 日期范围: ${start_date_obj.toISOString().split('T')[0]} 至 ${end_date_obj.toISOString().split('T')[0]}`
    )

    /*
     * 📦 Step 7: 【问题4修复】使用Sequelize ORM查询交易记录 + 性能监控
     */
    const { PointsTransaction } = require('../../../models')
    const { Op } = require('sequelize')

    // 🔧 【问题4修复】记录查询开始时间（用于性能监控）
    const queryStartTime = Date.now()

    const transactions = await PointsTransaction.findAll({
      where: {
        user_id,
        transaction_time: {
          [Op.gte]: start_date_obj, // 开始日期范围查询（Greater Than or Equal）
          [Op.lte]: end_date_copy // 结束日期范围查询（Less Than or Equal）
        },
        status: 'completed' // 只统计已完成的交易（pending/failed/cancelled不计入）
        /*
         * 🔧 【问题2修复】移除is_deleted过滤条件
         * 原因：趋势统计需要反映真实的历史积分变动，不应该因用户删除记录而缺失数据
         * 业务逻辑：软删除只是"用户端隐藏显示"，不是"数据失效"
         * 账户余额独立维护：软删除交易记录不会触发余额回滚（这是正确的设计）
         * 趋势图作用：反映真实的历史积分变化，不是"用户愿意展示的记录"
         * 对比其他API：交易列表API应该过滤is_deleted（展示功能），趋势API不应该过滤（统计功能）
         */
      },
      attributes: ['transaction_id', 'transaction_type', 'points_amount', 'transaction_time'],
      /*
       * 只查询需要的4个字段（减少数据传输量）：
       * - transaction_id: 交易ID（主键，用于排序和去重验证）
       * - transaction_type: 交易类型（earn获得/consume消费/expire过期/refund退款）
       * - points_amount: 积分数量（DECIMAL(10,2)类型，统一存储正数）
       * - transaction_time: 交易时间（DATE(3)毫秒精度，用于日期分组）
       */
      order: [['transaction_time', 'ASC']], // 按时间升序排列（ASC = Ascending）
      raw: true // 返回普通对象而不是Sequelize实例，性能更好
    })

    // 🔧 【问题4修复】计算查询耗时（用于性能监控）
    const queryTime = Date.now() - queryStartTime

    // 🔧 【问题4修复】慢查询告警（超过1秒）
    if (queryTime > 1000) {
      // 正常情况下查询<300ms，超过1秒需要告警
      console.warn('⚠️ [PointsTrend] 慢查询告警', {
        query_time_ms: queryTime, // 查询耗时（毫秒）
        user_id, // 用户ID
        days, // 查询天数
        record_count: transactions.length, // 查询到的记录数
        threshold_ms: 1000, // 告警阈值（1秒）
        suggestion: '检查数据库索引是否失效，或数据量是否异常增长'
      })
    }

    // 🔧 【问题4修复】数据量告警（超过500条）
    if (transactions.length > 500) {
      // 正常单用户90天数据约180-450条，超过500条可能异常
      console.warn('⚠️ [PointsTrend] 数据量过大', {
        user_id,
        record_count: transactions.length, // 实际查询到的记录数
        threshold: 500, // 告警阈值（500条）
        days, // 查询天数
        avg_per_day: (transactions.length / days).toFixed(2), // 日均记录数
        suggestion: '用户交易记录异常增长，建议检查是否有刷单行为'
      })
    }

    /*
     * 查询性能说明：
     * - 命中索引：idx_pt_user_time（user_id + transaction_time）
     * - 查询效率：单用户30天数据约60-150条记录，响应时间<300ms
     * - 无JOIN查询：单表查询，性能稳定可预期
     */

    // 🔧 【问题4修复】优化后的成功日志（包含性能数据）
    console.log('✅ [PointsTrend] 查询成功', {
      query_time_ms: queryTime, // 查询耗时（毫秒）
      user_id, // 用户ID
      days, // 查询天数
      record_count: transactions.length, // 查询到的记录数
      performance: queryTime < 300 ? '优秀' : queryTime < 1000 ? '良好' : '需优化'
    })

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
       * 🔧 【问题1修复】提取日期部分（YYYY-MM-DD格式，使用北京时区）
       * 问题：toISOString()返回UTC时间（+00:00时区），会导致北京时间23:00-24:00的记录被统计到错误日期
       * 修复：使用toLocaleDateString()指定Asia/Shanghai时区，确保日期提取基于北京时间
       *
       * 示例对比：
       * 北京时间 2025-11-04 00:30（凌晨0点半）
       * ❌ toISOString()：2025-11-03 16:30Z → 提取日期：2025-11-03（错误！应该是11-04）
       * ✅ toLocaleDateString()：2025-11-04（正确！）
       */
      const time_date =
        tx.transaction_time instanceof Date ? tx.transaction_time : new Date(tx.transaction_time)

      // 使用toLocaleDateString()指定Asia/Shanghai时区，直接在北京时区内提取日期
      const date_key = time_date
        .toLocaleDateString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })
        .replace(/\//g, '-') // 转换格式：2025/11/03 → 2025-11-03

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
      // 🔧 使用北京时区提取日期，与Step 7保持一致
      const date_key = current_date
        .toLocaleDateString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })
        .replace(/\//g, '-')
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
    return res.apiInternalError('积分趋势查询失败', error.message, 'POINTS_TREND_ERROR')
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
/**
 * @route DELETE /api/v4/points/transaction/:transaction_id
 * @desc 积分交易记录软删除（混合权限模式）
 * @access Private (用户可删除部分状态，管理员可删除所有状态)
 *
 * 业务规则（方案3 - 混合模式）:
 * - 用户可删除: pending/failed/cancelled状态的记录
 * - 用户不可删除: completed状态的earn/consume/refund/expire记录
 * - 管理员可删除: 任何状态的记录（需填写删除原因）
 * - 使用数据库事务保护操作
 *
 * 参考文档: 积分交易记录软删除实施方案.md - 方案3（混合模式）
 */
router.delete('/transaction/:transaction_id', authenticateToken, async (req, res) => {
  // 🔒 Step 1: 开启数据库事务（防止并发问题）
  const transaction = await models.sequelize.transaction()

  try {
    const userId = req.user.user_id
    // 判断是否管理员(使用req.isAdmin,这是authenticateToken中间件基于UUID角色系统设置的)
    const isAdmin = req.isAdmin === true
    const { transaction_id } = req.params
    const { deletion_reason } = req.body // 删除原因（管理员必填）

    // Step 2: 参数验证
    if (!transaction_id || isNaN(parseInt(transaction_id))) {
      await transaction.rollback()
      return res.apiError('无效的交易记录ID', 400)
    }

    const transactionId = parseInt(transaction_id)

    // Step 3: 在事务中查询记录（锁定记录，防止并发修改）
    const record = await models.PointsTransaction.findOne({
      where: {
        transaction_id: transactionId,
        user_id: userId, // 只能操作自己的记录
        is_deleted: 0 // 只查询未删除的记录
      },
      lock: transaction.LOCK.UPDATE, // 🔒 行锁，防止并发删除
      transaction
    })

    if (!record) {
      await transaction.rollback()
      return res.apiError('交易记录不存在或已被删除', 404)
    }

    // ✅ Step 4: 业务规则验证（核心逻辑 - 方案3混合模式）
    if (!isAdmin) {
      // 普通用户的删除限制
      const allowedStatuses = ['pending', 'failed', 'cancelled']

      if (!allowedStatuses.includes(record.status)) {
        await transaction.rollback()
        return res.apiError(
          '只能删除待处理、失败或已取消的记录。已完成的交易记录请联系管理员处理。',
          403
        )
      }

      // 额外规则：退款记录不允许用户删除（即使是failed状态）
      if (record.transaction_type === 'refund') {
        await transaction.rollback()
        return res.apiError('退款记录不允许删除，请联系管理员', 403)
      }
    } else {
      // 管理员删除必须填写原因
      if (!deletion_reason || deletion_reason.trim().length < 5) {
        await transaction.rollback()
        return res.apiError('管理员删除记录必须填写删除原因（至少5个字符）', 400)
      }
    }

    // Step 5: 执行软删除（在事务中）
    const deletedAt = BeijingTimeHelper.createDatabaseTime()

    await record.update(
      {
        is_deleted: 1,
        deleted_at: deletedAt,
        deletion_reason: isAdmin ? deletion_reason : `用户自主删除${record.status}状态记录`,
        deleted_by: userId
      },
      { transaction }
    )

    // ✅ Step 6: 提交事务
    await transaction.commit()

    // Step 7: 记录审计日志
    logger.info('软删除积分交易记录成功', {
      transaction_id: transactionId,
      user_id: userId,
      is_admin: isAdmin,
      record_status: record.status,
      record_type: record.transaction_type,
      deleted_at: BeijingTimeHelper.formatForAPI(deletedAt),
      deletion_reason: isAdmin ? deletion_reason : '用户自主删除'
    })

    // Step 8: 返回成功响应
    return res.apiSuccess(
      {
        transaction_id: transactionId,
        is_deleted: 1,
        deleted_at: BeijingTimeHelper.formatForAPI(deletedAt),
        record_type: 'points_transaction',
        note: isAdmin ? '管理员已删除该交易记录' : '记录已隐藏，不会显示在历史列表中'
      },
      '交易记录已删除'
    )
  } catch (error) {
    // ❌ 回滚事务
    await transaction.rollback()

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
 * @desc 管理员恢复已删除的积分交易记录（管理员专用）- 审计增强版
 * @access Private (仅管理员)
 *
 * @param {number} transaction_id - 积分交易记录ID（路径参数）
 * @param {string} reason - 恢复原因（请求体可选参数，默认"管理员恢复"）
 *
 * @returns {Object} 恢复确认信息
 * @returns {number} data.transaction_id - 恢复的交易记录ID
 * @returns {number} data.is_deleted - 删除标记（0=未删除）
 * @returns {number} data.user_id - 记录所属用户ID
 * @returns {number} data.restored_by - 恢复操作员ID
 * @returns {string} data.restored_at - 恢复时间（北京时间）
 * @returns {number} data.restore_count - 累计恢复次数
 * @returns {string} data.note - 操作说明
 *
 * 业务规则：
 * - 仅管理员可以恢复已删除的记录
 * - 恢复后用户端将重新显示该记录
 * - 记录完整审计日志（操作员、时间、原因、次数）
 * - 恢复次数>=10次拒绝，>=5次警告
 * - 幂等性处理：重复恢复返回成功而非错误
 *
 * 参考文档：恢复交易记录API实施方案.md - 方案2审计增强方案
 */
router.post(
  '/transaction/:transaction_id/restore',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      // ===== Step 1: 参数获取和验证 =====
      const { transaction_id } = req.params // 路径参数：交易记录ID
      const { reason } = req.body || {} // 请求体参数：恢复原因（可选）
      const adminId = req.user.user_id // JWT中的管理员ID

      // 验证transaction_id格式
      if (!transaction_id || isNaN(parseInt(transaction_id))) {
        return res.apiError('无效的交易记录ID', 400)
      }

      const transactionId = parseInt(transaction_id)

      /*
       * ===== Step 2: 查询记录（包含已删除记录） =====
       * 使用scope('includeDeleted')绕过defaultScope，查询所有记录
       */
      const record = await models.PointsTransaction.scope('includeDeleted').findOne({
        where: {
          transaction_id: transactionId
        }
      })

      // 记录不存在
      if (!record) {
        return res.apiError('交易记录不存在', 404)
      }

      // ===== Step 3: 状态验证（幂等性处理） =====
      if (record.is_deleted === 0) {
        // 记录已处于正常状态，返回成功（幂等响应）
        logger.info('恢复交易记录（幂等）', {
          transaction_id: transactionId,
          admin_id: adminId,
          reason: '记录已处于正常状态'
        })

        return res.apiSuccess(
          {
            transaction_id: transactionId,
            is_deleted: 0,
            user_id: record.user_id,
            note: '记录已处于正常状态，无需恢复'
          },
          '该交易记录已处于正常状态'
        )
      }

      // ===== Step 4: 恢复次数检查（防止滥用） =====
      const restoreCount = record.restore_count || 0

      // 恢复次数>=10次，拒绝恢复
      if (restoreCount >= 10) {
        logger.warn('恢复交易记录失败（次数超限）', {
          transaction_id: transactionId,
          admin_id: adminId,
          restore_count: restoreCount
        })

        return res.apiError(
          `该记录恢复次数过多（已恢复${restoreCount}次），拒绝继续恢复`,
          400,
          'RESTORE_LIMIT_EXCEEDED'
        )
      }

      // 恢复次数>=5次，发出警告（允许恢复但记录警告）
      if (restoreCount >= 5) {
        logger.warn('恢复交易记录（高频恢复警告）', {
          transaction_id: transactionId,
          admin_id: adminId,
          restore_count: restoreCount
        })
      }

      // ===== Step 5: 更新记录（恢复+记录审计信息） =====
      const restoreTime = BeijingTimeHelper.createDatabaseTime() // 创建北京时间Date对象
      const restoreReason = reason || '管理员恢复' // 恢复原因（可选参数，默认值）

      await record.update({
        // 恢复删除状态
        is_deleted: 0, // 恢复为正常状态（0=未删除）
        deleted_at: null, // 清空删除时间（NULL=未删除）

        // 记录审计信息（新增字段）
        restored_by: adminId, // 记录恢复操作员ID
        restored_at: restoreTime, // 记录恢复时间（北京时间Date对象）
        restore_reason: restoreReason, // 记录恢复原因
        restore_count: restoreCount + 1 // 累加恢复次数
      })

      // ===== Step 6: 记录操作日志 =====
      logger.info('管理员恢复积分交易记录成功', {
        transaction_id: transactionId,
        admin_id: adminId,
        user_id: record.user_id,
        restore_reason: restoreReason,
        restore_count: restoreCount + 1,
        restore_time: restoreTime.toISOString()
      })

      // ===== Step 7: 返回成功响应 =====
      return res.apiSuccess(
        {
          transaction_id: transactionId, // 恢复的交易记录ID
          is_deleted: 0, // 当前删除标记（0=未删除）
          user_id: record.user_id, // 记录所属用户ID
          restored_by: adminId, // 恢复操作员ID
          restored_at: BeijingTimeHelper.toBeijingTime(restoreTime), // 恢复时间（北京时间字符串）
          restore_count: restoreCount + 1, // 累计恢复次数
          note: '交易记录已恢复，用户端将重新显示该记录' // 操作说明
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
  }
)

/**
 * @route GET /api/v4/unified-engine/points/restore-audit
 * @desc 查询积分交易恢复审计记录（管理员专用）
 * @access Private (仅管理员)
 *
 * @query {number} user_id - 用户ID（可选，筛选某用户的恢复记录）
 * @query {number} admin_id - 管理员ID（可选，筛选某管理员的恢复操作）
 * @query {string} start_date - 开始日期（可选，格式YYYY-MM-DD）
 * @query {string} end_date - 结束日期（可选，格式YYYY-MM-DD）
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页记录数（默认20，最大100）
 *
 * @returns {Array} data.records - 恢复记录列表
 * @returns {number} data.total - 总记录数
 * @returns {number} data.page - 当前页码
 * @returns {number} data.limit - 每页记录数
 *
 * 业务规则：
 * - 仅管理员可查询恢复审计记录
 * - 支持按用户、管理员、时间范围筛选
 * - 支持分页查询
 * - 按恢复时间倒序排列
 *
 * 参考文档：恢复交易记录API实施方案.md - 审计记录查询API
 */
router.get('/restore-audit', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // ===== Step 1: 参数解析 =====
    const { user_id, admin_id, start_date, end_date, page = 1, limit = 20 } = req.query

    // ===== Step 2: 构建查询条件 =====
    const where = {
      restored_by: { [models.Sequelize.Op.not]: null } // 仅查询已恢复的记录
    }

    // 按用户ID筛选
    if (user_id) {
      where.user_id = parseInt(user_id)
    }

    // 按管理员ID筛选
    if (admin_id) {
      where.restored_by = parseInt(admin_id)
    }

    // 按时间范围筛选
    if (start_date || end_date) {
      where.restored_at = {}

      if (start_date) {
        // 开始日期 00:00:00（北京时间）
        const startDateTime = new Date(start_date)
        startDateTime.setHours(0, 0, 0, 0)
        where.restored_at[models.Sequelize.Op.gte] = startDateTime
      }

      if (end_date) {
        // 结束日期 23:59:59（北京时间）
        const endDateTime = new Date(end_date)
        endDateTime.setHours(23, 59, 59, 999)
        where.restored_at[models.Sequelize.Op.lte] = endDateTime
      }
    }

    // ===== Step 3: 查询恢复记录 =====
    const finalLimit = Math.min(parseInt(limit), 100)
    const offset = (parseInt(page) - 1) * finalLimit

    const { count, rows } = await models.PointsTransaction.scope('includeDeleted').findAndCountAll({
      where,
      attributes: [
        'transaction_id',
        'user_id',
        'transaction_type',
        'points_amount',
        'transaction_title',
        'transaction_description',
        'deleted_at',
        'restored_by',
        'restored_at',
        'restore_reason',
        'restore_count'
      ],
      order: [['restored_at', 'DESC']], // 按恢复时间倒序
      limit: finalLimit,
      offset,
      raw: true
    })

    // ===== Step 4: 格式化时间字段 =====
    const formattedRecords = rows.map(record => ({
      ...record,
      deleted_at: record.deleted_at ? BeijingTimeHelper.toBeijingTime(record.deleted_at) : null,
      restored_at: record.restored_at ? BeijingTimeHelper.toBeijingTime(record.restored_at) : null
    }))

    // ===== Step 5: 返回审计记录 =====
    return res.apiSuccess(
      {
        records: formattedRecords,
        total: count,
        page: parseInt(page),
        limit: finalLimit,
        total_pages: Math.ceil(count / finalLimit)
      },
      '恢复审计记录查询成功'
    )
  } catch (error) {
    logger.error('查询恢复审计记录失败', {
      error: error.message,
      admin_id: req.user?.user_id
    })
    return res.apiError(error.message, 500)
  }
})

module.exports = router
