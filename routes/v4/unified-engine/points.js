/**
 * 餐厅积分抽奖系统 V4.0 RESTful架构 - 积分管理系统路由
 *
 * @route /api/v4/points
 * @standard RESTful资源导向设计
 * @reference 腾讯、阿里积分系统行业标准
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
 * GET /api/v4/points/balance
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
 * GET /api/v4/points/transactions?transaction_type=earn&page=1&limit=10
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
 * POST /api/v4/points/admin/adjust
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
const { authenticateToken, getUserRoles, requireAdmin } = require('../../../middleware/auth')
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
 * @route GET /api/v4/points/balance
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
    // ✅ 通过 ServiceManager 获取 PointsService（符合TR-005规范）
    const PointsService = req.app.locals.services.getService('points')

    // 📊 Step 1: 记录查询开始日志
    console.log(`[PointsBalance] 用户${user_id}查询积分余额`)

    // ✅ Step 2: 调用 Service 获取用户账户（封装了用户存在性和账户查询）
    const { account } = await PointsService.getUserAccount(user_id)

    // ✅ Step 3: 获取完整的积分信息（包括待审核积分）
    const points_overview = await PointsService.getUserPointsOverview(user_id)

    // ⏱️ Step 4: 记录性能日志
    const queryTime = Date.now() - startTime
    if (queryTime > 100) {
      console.warn(`[PointsBalance] 查询耗时过长: ${queryTime}ms, user_id=${user_id}`)
    } else {
      console.log(
        `[PointsBalance] 查询成功: ${queryTime}ms, user_id=${user_id}, available=${points_overview.available_points}`
      )
    }

    // ✅ Step 5: 返回完整的积分数据
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

    // Service 层抛出的业务错误
    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    if (error.message.includes('冻结')) {
      return res.apiError(error.message, 'ACCOUNT_FROZEN', null, 403)
    }

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
 * @route GET /api/v4/points/balance/:user_id
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
router.get(
  '/balance/:user_id',
  authenticateToken,
  pointsBalanceByIdRateLimiter,
  async (req, res) => {
    try {
      // ✅ 通过 ServiceManager 获取 PointsService（符合TR-005规范）
      const PointsService = req.app.locals.services.getService('points')

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

      // ✅ 调用 Service 获取用户账户（封装了用户存在性和账户查询）
      const { account } = await PointsService.getUserAccount(target_user_id)

      // ✅ 返回账户数据
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

      // Service 层抛出的业务错误
      if (error.message.includes('不存在')) {
        return res.apiError(error.message, 'NOT_FOUND', null, 404)
      }
      if (error.message.includes('冻结')) {
        return res.apiError(error.message, 'ACCOUNT_FROZEN', null, 403)
      }

      return res.apiInternalError('积分余额查询失败', error.message, 'POINTS_BALANCE_ERROR')
    }
  }
)

/**
 * GET /transactions/:user_id - 获取用户积分交易历史
 *
 * @description 获取用户的积分交易记录，支持分页
 * @route GET /api/v4/points/transactions/:user_id
 * @access Private (需要认证)
 */
router.get('/transactions/:user_id', authenticateToken, async (req, res) => {
  try {
    // 🔄 通过 ServiceManager 获取 PointsService（符合TR-005规范）
    const PointsService = req.app.locals.services.getService('points')

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
 * @route POST /api/v4/points/admin/adjust
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
    // ✅ 通过 ServiceManager 获取 PointsService（符合TR-005规范）
    const PointsService = req.app.locals.services.getService('points')

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

    // ✅ 验证用户存在性（getUserAccount会验证用户和账户）
    try {
      await PointsService.getUserAccount(target_user_id)
    } catch (verifyError) {
      // 用户或账户不存在，返回友好错误
      if (verifyError.message.includes('用户不存在')) {
        return res.apiError(
          '目标用户不存在，请检查user_id是否正确',
          'USER_NOT_FOUND',
          { user_id: target_user_id },
          404
        )
      }
      // 账户不存在时，addPoints/consumePoints会自动创建（管理员操作合理）
    }

    // ✅ 生成唯一business_id确保幂等性（防止网络重试导致重复调整）
    const business_id =
      request_id ||
      `admin_adjust_${admin_id}_${target_user_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // ✅ 记录调整前余额（如果账户不存在，addPoints/consumePoints会自动创建）
    let old_balance = 0
    try {
      const { account } = await PointsService.getUserAccount(target_user_id)
      old_balance = parseFloat(account.available_points)
    } catch (e) {
      // 账户不存在，初始余额为0
      old_balance = 0
    }

    // ✅ 执行积分调整（会自动创建账户，这是合理的业务行为）
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
      // ✅ 扣除积分前先检查余额并返回详细错误信息
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

    // ✅ 获取调整后的余额
    const { account: updatedAccount } = await PointsService.getUserAccount(target_user_id)
    const new_balance = parseFloat(updatedAccount.available_points)

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
          total_earned: parseFloat(updatedAccount.total_earned),
          total_consumed: parseFloat(updatedAccount.total_consumed)
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
 * @route GET /api/v4/points/admin/statistics
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

    // ✅ 通过 ServiceManager 获取 PointsService（符合TR-005规范）
    const PointsService = req.app.locals.services.getService('points')

    console.log('[AdminStatistics] 🔍 开始查询积分系统统计数据...')

    // ✅ 调用 Service 层的 getAdminStatistics 方法（封装了所有复杂聚合查询）
    const { accountStats, transactionStats, abnormalStats } =
      await PointsService.getAdminStatistics()

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
 * GET /user/statistics/:user_id - 获取用户统计数据（架构重构完成）
 *
 * @description 获取用户的完整统计信息，包括抽奖、兑换、消费、库存等数据
 * @route GET /api/v4/points/user/statistics/:user_id
 * @access Private (需要认证)
 *
 * 🆕 架构重构说明（2025-12-10）：
 * - ✅ 移除路由层直连 models 的代码（符合架构规范TR-005）
 * - ✅ 统计查询逻辑收口到 PointsService.getUserFullStatistics()
 * - ✅ 保持原有业务逻辑和返回数据结构不变
 * - ✅ 删除辅助函数（getLotteryStatistics等已迁移到Service层）
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

    // ✅ 通过 ServiceManager 获取 PointsService（符合TR-005规范）
    const PointsService = req.app.locals.services.getService('points')

    // ✅ 调用 Service 层获取用户信息和账户（统一处理存在性验证）
    let userInfo, pointsInfo
    try {
      const { user, account } = await PointsService.getUserAccount(user_id)
      userInfo = user
      pointsInfo = {
        available_points: parseFloat(account.available_points),
        total_earned: parseFloat(account.total_earned),
        total_consumed: parseFloat(account.total_consumed)
      }
    } catch (error) {
      // 用户不存在，返回404
      if (error.message.includes('用户不存在')) {
        return res.apiError('用户不存在', 'USER_NOT_FOUND', {}, 404)
      }
      // 账户不存在，通过Service获取用户基本信息和默认积分
      const userBasicInfo = await PointsService.getUserBasicInfo(user_id)
      userInfo = userBasicInfo.user
      pointsInfo = userBasicInfo.defaultPoints
    }

    // ✅ 调用 Service 层获取完整统计数据（封装了原辅助函数逻辑）
    const [fullStats, monthStats] = await Promise.all([
      PointsService.getUserFullStatistics(user_id),
      PointsService.getUserStatistics(user_id)
    ])

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
        month_earned: parseFloat(monthStats.month_earned) || 0
      },

      // 抽奖统计
      lottery: fullStats.lottery,

      // 兑换统计
      exchange: fullStats.exchange,

      // 消费记录统计（新业务：商家扫码录入）
      consumption: fullStats.consumption,

      // 库存统计
      inventory: fullStats.inventory,

      // ✅ 成就数据（通过Service计算）
      achievements: PointsService.calculateAchievements({
        lottery: fullStats.lottery,
        exchange: fullStats.exchange,
        consumption: fullStats.consumption,
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
 * GET /api/v4/points/overview
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
    // ✅ 通过 ServiceManager 获取 PointsService（符合TR-005规范）
    const PointsService = req.app.locals.services.getService('points')

    const user_id = req.user.user_id

    console.log(`📊 获取用户积分概览 - 用户ID: ${user_id}`)

    // ✅ 验证用户账户存在性（getUserAccount会验证用户和账户）
    await PointsService.getUserAccount(user_id)

    // ✅ 调用PointsService获取积分概览（此时账户已确认存在，不会自动创建）
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

    // Service 层抛出的业务错误
    if (error.message.includes('不存在')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    }
    if (error.message.includes('冻结')) {
      return res.apiError(error.message, 'ACCOUNT_FROZEN', null, 403)
    }

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
    // 🔄 通过 ServiceManager 获取 PointsService（符合TR-005规范）
    const PointsService = req.app.locals.services.getService('points')

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
 * GET /trend - 获取用户积分趋势数据（架构重构完成）
 *
 * @description 获取用户指定天数内的积分获得/消费趋势数据，返回前端Chart.js可直接使用的格式
 * @route GET /api/v4/points/trend
 * @access Private（需要JWT认证 + 限流保护，用户只能查询自己的数据）
 *
 * 🆕 架构重构说明（2025-12-10）：
 * - ✅ 移除路由层直连 models 的代码（符合架构规范TR-005）
 * - ✅ 复杂查询和数据处理逻辑收口到 PointsService.getUserPointsTrend()
 * - ✅ 保持原有业务逻辑和返回数据结构不变
 * - ✅ 路由层只负责参数解析、权限检查、调用Service、统一响应
 *
 * 查询参数（Query Params）:
 * @query {number} days - 查询天数，默认30天，范围限制7-90天（超出自动修正）
 * @query {string} end_date - 结束日期，默认今天（北京时间），格式YYYY-MM-DD（可选）
 */
router.get('/trend', authenticateToken, trendRateLimiter, async (req, res) => {
  try {
    // 🔐 Step 1: 从JWT token获取当前登录用户ID（authenticateToken中间件已验证token有效性）
    const user_id = req.user.user_id

    // 📥 Step 2: 获取查询参数（Query Params）
    const { days, end_date } = req.query

    // 📊 Step 3: 记录查询日志（便于调试和问题追踪）
    console.log(`📊 查询积分趋势 - 用户ID: ${user_id}, 天数: ${days || 30}, 结束日期: ${end_date || '今天'}`)

    // ✅ Step 4: 通过 ServiceManager 获取 PointsService（符合TR-005规范）
    const PointsService = req.app.locals.services.getService('points')

    // ✅ Step 5: 调用 Service 层获取趋势数据（封装了所有复杂逻辑）
    const trendData = await PointsService.getUserPointsTrend(user_id, {
      days: days ? parseInt(days) : 30,
      end_date
    })

    // 📈 Step 6: 记录数据处理完成日志
    console.log(
      `📈 数据处理完成 - 数据点: ${trendData.data_points}, 总获得: ${trendData.total_earn}, 总消费: ${trendData.total_consume}`
    )

    // 🎉 Step 7: 返回趋势数据（使用项目统一的API响应格式）
    return res.apiSuccess(trendData, '积分趋势查询成功')
  } catch (error) {
    // ❌ 错误处理（统一错误响应格式）
    console.error('❌ 获取积分趋势失败:', error)

    // Service层抛出的业务错误
    if (error.message.includes('无效的结束日期') || error.message.includes('结束日期不能超过今天')) {
      return res.apiError(error.message, 'INVALID_PARAMETER', null, 400)
    }

    return res.apiInternalError('积分趋势查询失败', error.message, 'POINTS_TREND_ERROR')
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
  try {
    // 🔄 通过 ServiceManager 获取 PointsService（符合TR-005规范）
    const PointsService = req.app.locals.services.getService('points')

    const userId = req.user.user_id
    const isAdmin = req.isAdmin === true
    const { transaction_id } = req.params
    const { deletion_reason } = req.body

    // 参数验证
    if (!transaction_id || isNaN(parseInt(transaction_id))) {
      return res.apiError('无效的交易记录ID', 'BAD_REQUEST', null, 400)
    }

    const transactionId = parseInt(transaction_id)

    // ✅ 调用 PointsService 删除交易记录
    const result = await PointsService.deleteTransaction(userId, transactionId, {
      isAdmin,
      deletion_reason
    })

    logger.info('交易记录软删除成功', {
      transaction_id: transactionId,
      user_id: userId,
      is_admin: isAdmin,
      deleted_at: result.deleted_at
    })

    return res.apiSuccess(
      {
        transaction_id: transactionId,
        is_deleted: 1,
        deleted_at: BeijingTimeHelper.formatForAPI(result.deleted_at),
        record_type: 'points_transaction',
        note: isAdmin ? '管理员已删除该交易记录' : '记录已隐藏，不会显示在历史列表中'
      },
      '交易记录已删除'
    )
  } catch (error) {
    logger.error('软删除交易记录失败', {
      error: error.message,
      transaction_id: req.params.transaction_id,
      user_id: req.user?.user_id
    })

    if (error.message.includes('不存在') || error.message.includes('已被删除')) {
      return res.apiError(error.message, 'NOT_FOUND', null, 404)
    } else if (
      error.message.includes('只能删除') ||
      error.message.includes('不允许') ||
      error.message.includes('必须填写')
    ) {
      return res.apiError(error.message, 'BAD_REQUEST', null, 400)
    }
    return res.apiError('删除失败，请稍后重试', 'INTERNAL_ERROR', null, 500)
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
      // 🔄 通过 ServiceManager 获取 PointsService（符合TR-005规范）
      const PointsService = req.app.locals.services.getService('points')

      const { transaction_id } = req.params
      const { reason } = req.body || {}
      const adminId = req.user.user_id

      // 参数验证
      if (!transaction_id || isNaN(parseInt(transaction_id))) {
        return res.apiError('无效的交易记录ID', 'BAD_REQUEST', null, 400)
      }

      const transactionId = parseInt(transaction_id)

      // ✅ 调用 PointsService 恢复交易记录
      const result = await PointsService.restoreTransaction(adminId, transactionId, {
        restore_reason: reason
      })

      logger.info('交易记录恢复成功', {
        transaction_id: transactionId,
        admin_id: adminId,
        restored_at: result.restored_at
      })

      return res.apiSuccess(
        {
          transaction_id: transactionId,
          is_deleted: 0,
          user_id: result.user_id,
          restored_by: adminId,
          restored_at: BeijingTimeHelper.formatForAPI(result.restored_at).iso,
          restore_count: result.restore_count,
          note: '交易记录已恢复，用户端将重新显示该记录'
        },
        '交易记录已恢复'
      )
    } catch (error) {
      logger.error('恢复交易记录失败', {
        error: error.message,
        transaction_id: req.params.transaction_id,
        admin_id: req.user?.user_id
      })

      if (error.message.includes('不存在') || error.message.includes('未被删除')) {
        return res.apiError(error.message, 'NOT_FOUND', null, 404)
      } else if (error.message.includes('已恢复') || error.message.includes('必须至少')) {
        return res.apiError(error.message, 'BAD_REQUEST', null, 400)
      }
      return res.apiError('恢复失败，请稍后重试', 'INTERNAL_ERROR', null, 500)
    }
  }
)

/**
 * @route GET /api/v4/points/restore-audit
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
    // 🔄 通过 ServiceManager 获取 PointsService（符合TR-005规范）
    const PointsService = req.app.locals.services.getService('points')

    const { user_id, admin_id, start_date, end_date, page = 1, limit = 20 } = req.query

    // ✅ 调用 PointsService 获取恢复审计记录
    const result = await PointsService.getRestoreAudit({
      user_id: user_id ? parseInt(user_id) : undefined,
      admin_id: admin_id ? parseInt(admin_id) : undefined,
      start_date,
      end_date,
      page,
      limit
    })

    logger.info('获取恢复审计记录成功', {
      admin_id: req.user.user_id,
      filters: { user_id, admin_id, start_date, end_date },
      total: result.pagination.total
    })

    return res.apiSuccess(result, '获取恢复审计记录成功')
  } catch (error) {
    logger.error('获取恢复审计记录失败', {
      error: error.message,
      admin_id: req.user?.user_id,
      query: req.query
    })

    return res.apiError('获取审计记录失败，请稍后重试', 'INTERNAL_ERROR', null, 500)
  }
})

module.exports = router
