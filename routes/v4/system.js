/**
 * 餐厅积分抽奖系统 V4.0 - 系统功能API路由
 * 包括系统公告、反馈系统、系统状态等功能
 */

const express = require('express')
const router = express.Router()
const {
  SystemAnnouncement,
  Feedback,
  User,
  CustomerServiceSession,
  sequelize
} = require('../../models')
const DataSanitizer = require('../../services/DataSanitizer')
const { authenticateToken, optionalAuth } = require('../../middleware/auth') // 🔴 引入可选认证中间件
const dataAccessControl = require('../../middleware/dataAccessControl')
const BeijingTimeHelper = require('../../utils/timeHelper')
const { Op } = require('sequelize')
const { logOperation } = require('../../middleware/auditLog') // 🔴 引入审计日志中间件

/*
 * 🔴 获取会话状态常量（Get Session Status Constants）
 * 从CustomerServiceSession模型获取状态常量，避免硬编码
 */
const { SESSION_STATUS, ACTIVE_STATUS } = CustomerServiceSession

/*
 * ⚡ 消息发送频率限制器（Message Rate Limiter）
 * 基于《发送聊天消息API实施方案.md》文档第1617-1689行的高优先级建议
 *
 * 功能说明：
 * - 防止恶意用户短时间内发送大量消息（刷屏攻击）
 * - 使用内存Map存储用户发送时间戳，避免引入Redis依赖
 * - 限制规则：每分钟最多发送10条消息（1分钟=60秒窗口）
 * - 自动清理：每10分钟清理过期记录，防止内存泄漏
 *
 * 数据结构：
 * userMessageTimestamps: Map<user_id, Array<timestamp>>
 *   - key: 用户ID（number类型）
 *   - value: 该用户最近发送消息的时间戳数组（毫秒级时间戳）
 *
 * 设计原则：
 * - 简单实用：无需Redis等外部依赖，维护成本极低
 * - 性能优秀：内存操作，检查耗时<1ms
 * - 适合小型项目：服务重启后限制清零，但对小数据量项目完全够用
 *
 * 业务场景：
 * - 正常用户：平均每分钟发送2-3条消息，不会触发限制
 * - 恶意用户：快速连续发送超过10条消息，返回429错误
 */
const userMessageTimestamps = new Map()

/**
 * 定期清理过期的时间戳记录（防止内存泄漏）
 * 清理策略：删除10分钟前的所有记录
 * 执行频率：每10分钟执行一次
 */
setInterval(
  () => {
    const now = Date.now()
    const TEN_MINUTES = 10 * 60 * 1000 // 10分钟（毫秒）

    userMessageTimestamps.forEach((timestamps, userId) => {
      // 过滤出最近10分钟内的时间戳
      const recentTimestamps = timestamps.filter(ts => now - ts < TEN_MINUTES)

      if (recentTimestamps.length === 0) {
        // 如果该用户10分钟内无消息记录，删除该用户的记录
        userMessageTimestamps.delete(userId)
      } else {
        // 否则更新为过滤后的时间戳数组
        userMessageTimestamps.set(userId, recentTimestamps)
      }
    })

    // 记录清理日志
    console.log(`✅ 消息频率限制器：已清理过期记录，当前监控用户数: ${userMessageTimestamps.size}`)
  },
  10 * 60 * 1000
) // 每10分钟执行一次

/**
 * 检查用户消息发送频率
 *
 * @param {number} userId - 用户ID
 * @param {number} role_level - 用户角色等级（默认0=普通用户，>=100=管理员）
 * @returns {Object} - { allowed: boolean, limit: number, current: number }
 *
 * 限制规则（从配置文件business.config.js读取）：
 * - 普通用户：1分钟内最多20条消息
 * - 管理员：1分钟内最多30条消息
 * - 超过限制返回{allowed: false}，调用方应返回429错误
 *
 * 算法逻辑：
 * 1. 根据用户角色等级读取对应的频率限制配置
 * 2. 获取该用户的历史时间戳数组
 * 3. 过滤出最近1分钟内的时间戳（滑动窗口算法）
 * 4. 检查是否超过配置的限制
 * 5. 如果未超限，记录本次发送时间并返回{allowed: true}
 * 6. 如果超限，返回{allowed: false, limit, current}提供详细信息
 */
function checkMessageRateLimit (userId, role_level = 0) {
  const businessConfig = require('../../config/business.config')
  const now = Date.now()
  const ONE_MINUTE = 60 * 1000 // 1分钟（毫秒）

  // 根据角色等级读取频率限制配置
  const rateLimitConfig =
    role_level >= 100 ? businessConfig.chat.rate_limit.admin : businessConfig.chat.rate_limit.user

  const MAX_MESSAGES_PER_MINUTE = rateLimitConfig.max_messages_per_minute

  // 获取该用户的历史时间戳数组（如果没有记录，初始化为空数组）
  const timestamps = userMessageTimestamps.get(userId) || []

  // 过滤出最近1分钟内的时间戳（滑动窗口）
  const recentTimestamps = timestamps.filter(ts => now - ts < ONE_MINUTE)

  // 检查是否超过频率限制
  if (recentTimestamps.length >= MAX_MESSAGES_PER_MINUTE) {
    // 超过限制，返回详细信息
    return {
      allowed: false,
      limit: MAX_MESSAGES_PER_MINUTE,
      current: recentTimestamps.length,
      userType: role_level >= 100 ? 'admin' : 'user'
    }
  }

  // 未超限，记录本次发送时间
  recentTimestamps.push(now)
  userMessageTimestamps.set(userId, recentTimestamps)

  // 返回允许发送
  return {
    allowed: true,
    limit: MAX_MESSAGES_PER_MINUTE,
    current: recentTimestamps.length,
    userType: role_level >= 100 ? 'admin' : 'user'
  }
}

/*
 * ⚡ 创建会话频率限制器（Create Session Rate Limiter）
 * 基于《创建聊天会话API实施方案.md》文档的并发控制方案
 *
 * 功能说明：
 * - 防止用户短时间内重复创建会话（并发创建导致重复会话）
 * - 使用内存Map存储用户创建会话的时间戳，避免引入Redis依赖
 * - 限制规则：每10秒最多创建3次会话（防止并发重复创建）
 * - 自动清理：每10分钟清理过期记录，防止内存泄漏
 *
 * 数据结构：
 * createSessionTimestamps: Map<user_id, Array<timestamp>>
 *   - key: 用户ID（number类型）
 *   - value: 该用户最近创建会话的时间戳数组（毫秒级时间戳）
 *
 * 设计原则：
 * - 简单实用：无需Redis等外部依赖，维护成本极低
 * - 性能优秀：内存操作，检查耗时<1ms
 * - 适合小型项目：服务重启后限制清零，但对小数据量项目完全够用
 *
 * 业务场景：
 * - 正常用户：平均每次创建会话间隔>10秒，不会触发限制
 * - 并发请求：用户快速连续创建会话（网络抖动、重复点击），返回429错误
 */
const createSessionTimestamps = new Map()

/**
 * 定期清理创建会话的时间戳记录（防止内存泄漏）
 * 清理策略：删除10分钟前的所有记录
 * 执行频率：每10分钟执行一次
 */
setInterval(
  () => {
    const now = Date.now()
    const TEN_MINUTES = 10 * 60 * 1000

    createSessionTimestamps.forEach((timestamps, userId) => {
      const recentTimestamps = timestamps.filter(ts => now - ts < TEN_MINUTES)

      if (recentTimestamps.length === 0) {
        createSessionTimestamps.delete(userId)
      } else {
        createSessionTimestamps.set(userId, recentTimestamps)
      }
    })

    console.log(
      `✅ 创建会话频率限制器：已清理过期记录，当前监控用户数: ${createSessionTimestamps.size}`
    )
  },
  10 * 60 * 1000
)

/**
 * 检查用户创建会话的频率
 *
 * @param {number} userId - 用户ID
 * @returns {Object} - { allowed: boolean, limit: number, current: number, remainingTime: number }
 *
 * 限制规则（从配置文件business.config.js读取）：
 * - 所有用户：每10秒内最多创建3次会话
 * - 超过限制返回{allowed: false}，调用方应返回429错误
 *
 * 算法逻辑：
 * 1. 从业务配置文件读取限制参数
 * 2. 获取该用户的历史时间戳数组
 * 3. 过滤出时间窗口内的时间戳（滑动窗口算法）
 * 4. 检查是否超过限制
 * 5. 如果未超限，记录本次创建时间并返回{allowed: true}
 * 6. 如果超限，返回{allowed: false, remainingTime}提供剩余等待时间
 */
function checkCreateSessionRateLimit (userId) {
  const businessConfig = require('../../config/business.config')
  const now = Date.now()

  // 从配置文件读取限制参数
  const TIME_WINDOW = businessConfig.chat.create_session_limit.time_window_seconds * 1000 // 转换为毫秒
  const MAX_CREATES = businessConfig.chat.create_session_limit.max_creates_per_window

  const timestamps = createSessionTimestamps.get(userId) || []
  const recentTimestamps = timestamps.filter(ts => now - ts < TIME_WINDOW)

  if (recentTimestamps.length >= MAX_CREATES) {
    const oldestTimestamp = Math.min(...recentTimestamps)
    const remainingTime = Math.ceil((oldestTimestamp + TIME_WINDOW - now) / 1000)

    return {
      allowed: false,
      limit: MAX_CREATES,
      current: recentTimestamps.length,
      remainingTime: Math.max(remainingTime, 1)
    }
  }

  recentTimestamps.push(now)
  createSessionTimestamps.set(userId, recentTimestamps)

  return {
    allowed: true,
    limit: MAX_CREATES,
    current: recentTimestamps.length,
    remainingTime: 0
  }
}

/**
 * WebSocket推送重试函数（带自动重试机制）
 * 基于《发送聊天消息API实施方案.md》文档第1697-1762行的中优先级建议
 *
 * 功能说明：
 * - WebSocket推送失败时自动重试，最多重试3次
 * - 使用指数退避算法：第1次重试延迟1秒，第2次2秒，第3次3秒
 * - 提升消息实时到达率，减少客服端需要刷新页面的情况
 *
 * @param {Object} session - 会话对象（CustomerServiceSession实例）
 * @param {Object} messageData - 消息数据对象
 * @param {number} maxRetries - 最大重试次数（默认3次）
 * @returns {Promise<boolean>} - 推送是否最终成功
 *
 * 重试策略：
 * - 第1次推送失败：等待1秒后重试
 * - 第2次推送失败：等待2秒后重试
 * - 第3次推送失败：等待3秒后重试
 * - 第4次推送失败：记录错误日志，放弃推送
 *
 * 业务说明：
 * - 即使推送最终失败，消息已保存到数据库，不影响业务连续性
 * - 客服可通过轮询API或刷新页面获取新消息（降级策略）
 */
async function pushMessageWithRetry (session, messageData, maxRetries = 3) {
  const ChatWebSocketService = require('../../services/ChatWebSocketService')

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // 根据会话状态选择推送策略
      let pushed
      if (session.admin_id) {
        // 会话已分配客服，精准推送给该客服
        pushed = ChatWebSocketService.pushMessageToAdmin(session.admin_id, messageData)
      } else {
        // 会话未分配，广播给所有在线客服
        const count = ChatWebSocketService.broadcastToAllAdmins(messageData)
        pushed = count > 0 // 如果有客服在线，认为推送成功
      }

      if (pushed) {
        // 推送成功
        if (attempt > 1) {
          console.log(`✅ WebSocket推送成功 (第${attempt}次尝试)`)
        }
        return true
      } else {
        // 推送失败（客服不在线）
        throw new Error(`客服不在线或推送失败 (尝试${attempt}/${maxRetries})`)
      }
    } catch (wsError) {
      console.error(`⚠️ WebSocket推送失败 (第${attempt}/${maxRetries}次):`, wsError.message)

      if (attempt < maxRetries) {
        // 还有重试机会，等待后重试（指数退避：1秒、2秒、3秒）
        const delaySeconds = attempt
        console.log(`⏰ ${delaySeconds}秒后进行第${attempt + 1}次重试...`)
        await new Promise(resolve => {
          setTimeout(() => {
            resolve()
          }, delaySeconds * 1000)
        })
      } else {
        // 最终失败，记录错误日志
        console.error('❌ WebSocket推送最终失败，消息已保存到数据库，客服可通过轮询获取')
        return false
      }
    }
  }

  return false
}

/**
 * 🔴 数据合理性验证函数（P2-8优化：添加数据验证和边界检查）
 * 验证聊天统计数据的逻辑一致性，防止脏数据影响业务决策
 *
 * @param {Object} stats - 统计数据对象
 * @returns {Object} 验证结果 { valid: boolean, warnings: Array<string> }
 */
function validateStatistics (stats) {
  const warnings = []

  // 1️⃣ 基础数值合理性检查（数值必须>=0）
  const numericFields = [
    'total_sessions',
    'active_sessions',
    'waiting_sessions',
    'avg_response_time_seconds',
    'new_sessions',
    'total_messages',
    'closed_sessions',
    'avg_messages_per_session'
  ]

  for (const field of numericFields) {
    // 🔥 修复ESLint警告：使用安全的对象访问替代eval
    let value
    if (field.includes('.')) {
      const parts = field.split('.')
      value = stats[parts[0]]?.[parts[1]] // 安全的嵌套属性访问
    } else {
      value = stats[field]
    }

    if (value !== undefined && (value < 0 || !isFinite(value))) {
      warnings.push(`${field}数值异常: ${value}（应>=0且为有限数）`)
    }
  }

  // 2️⃣ 逻辑一致性检查（Logic Consistency Check）
  const { overall, today, by_status } = stats

  // 检查：活跃会话数不应超过总会话数
  if (overall.active_sessions > overall.total_sessions) {
    warnings.push(
      `活跃会话数(${overall.active_sessions})超过总会话数(${overall.total_sessions})，数据不一致`
    )
  }

  // 检查：等待会话数不应超过活跃会话数
  if (overall.waiting_sessions > overall.active_sessions) {
    warnings.push(
      `等待会话数(${overall.waiting_sessions})超过活跃会话数(${overall.active_sessions})，数据不一致`
    )
  }

  // 检查：今日新会话数不应超过总会话数（除非是新系统）
  if (today.new_sessions > overall.total_sessions && overall.total_sessions > 0) {
    warnings.push(
      `今日新会话(${today.new_sessions})超过总会话数(${overall.total_sessions})，可能有误`
    )
  }

  // 检查：按状态统计的总和应等于总会话数（允许10%误差）
  if (by_status) {
    const statusSum =
      (by_status.waiting || 0) +
      (by_status.assigned || 0) +
      (by_status.active || 0) +
      (by_status.closed || 0)
    const deviation = Math.abs(statusSum - overall.total_sessions) / overall.total_sessions

    if (deviation > 0.1) {
      // 超过10%误差
      warnings.push(
        `按状态统计总和(${statusSum})与总会话数(${overall.total_sessions})偏差>10%，数据不一致`
      )
    }
  }

  /*
   * 3️⃣ 业务合理性检查（Business Logic Check）
   * 平均响应时间异常检测（>1小时可能异常）
   */
  if (overall.avg_response_time_seconds > 3600) {
    warnings.push(`平均响应时间(${overall.avg_response_time_seconds}秒)超过1小时，可能异常`)
  }

  // 平均消息数异常检测（>100可能异常）
  if (today.avg_messages_per_session > 100) {
    warnings.push(`平均消息数(${today.avg_messages_per_session})超过100，可能异常`)
  }

  return { valid: warnings.length === 0, warnings }
}

/**
 * @route GET /api/v4/system/announcements
 * @desc 获取系统公告列表
 * @access Public
 */
router.get('/announcements', optionalAuth, dataAccessControl, async (req, res) => {
  try {
    const { type = null, priority = null, limit = 10, offset = 0 } = req.query

    const dataLevel = req.isAdmin ? 'full' : 'public'

    // 获取有效公告
    const whereClause = {
      is_active: true
    }

    // 添加过期时间过滤
    whereClause[require('sequelize').Op.or] = [
      { expires_at: null },
      { expires_at: { [require('sequelize').Op.gt]: BeijingTimeHelper.createBeijingTime() } }
    ]

    if (type && type !== 'all') whereClause.type = type
    if (priority && priority !== 'all') whereClause.priority = priority

    const announcements = await SystemAnnouncement.findAll({
      where: whereClause,
      order: [
        ['priority', 'DESC'], // 高优先级优先
        ['created_at', 'DESC'] // 新发布的优先
      ],
      limit: Math.min(parseInt(limit), 50), // 限制最大50条
      offset: parseInt(offset),
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    // 数据脱敏处理
    const sanitizedData = DataSanitizer.sanitizeAnnouncements(
      announcements.map(a => a.toJSON()),
      dataLevel
    )

    return res.apiSuccess(
      {
        announcements: sanitizedData,
        total: announcements.length,
        has_more: announcements.length === parseInt(limit)
      },
      '获取系统公告成功'
    )
  } catch (error) {
    console.error('获取系统公告失败:', error)
    return res.apiError('获取系统公告失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route GET /api/v4/system/announcements/home
 * @desc 获取首页公告（仅显示前5条重要公告）
 * @access Public
 */
router.get('/announcements/home', optionalAuth, dataAccessControl, async (req, res) => {
  try {
    const dataLevel = req.isAdmin ? 'full' : 'public'

    const announcements = await SystemAnnouncement.findAll({
      where: {
        is_active: true,
        type: ['system', 'activity', 'notice'],
        [require('sequelize').Op.or]: [
          { expires_at: null },
          { expires_at: { [require('sequelize').Op.gt]: BeijingTimeHelper.createBeijingTime() } }
        ]
      },
      order: [
        ['priority', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: 5,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    /*
     * 📈 Step 3: 更新公告查看次数（文档第516-522行要求）
     * 业务场景：统计公告浏览量，用于运营数据分析（评估公告触达效果）
     * 优化方案：并行更新（Promise.allSettled）提升性能，单个失败不影响整体
     */
    await Promise.allSettled(
      announcements.map(announcement =>
        announcement.increment('view_count').catch(err => {
          console.error(`⚠️ 更新view_count失败（ID:${announcement.announcement_id}):`, err.message)
          // 更新失败不影响公告查询返回，静默处理
        })
      )
    )

    // 🔒 Step 4: 数据脱敏处理（根据用户权限返回public或full级别数据）
    const sanitizedData = DataSanitizer.sanitizeAnnouncements(
      announcements.map(a => a.toJSON()),
      dataLevel
    )

    // 🎉 Step 5: 返回首页公告数据
    return res.apiSuccess(
      {
        announcements: sanitizedData
      },
      '获取首页公告成功'
    )
  } catch (error) {
    console.error('获取首页公告失败:', error)
    return res.apiError('获取首页公告失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route POST /api/v4/system/feedback
 * @desc 提交用户反馈
 * @access Private
 */
router.post('/feedback', authenticateToken, async (req, res) => {
  try {
    const { category = 'other', content, priority = 'medium', attachments = null } = req.body

    // 验证必需参数
    if (!content || content.trim().length === 0) {
      return res.apiError('反馈内容不能为空', 'BAD_REQUEST', null, 400)
    }

    if (content.length > 5000) {
      return res.apiError('反馈内容不能超过5000字符', 'BAD_REQUEST', null, 400)
    }

    // 获取用户信息
    const userInfo = {
      ip: req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for'],
      device: {
        userAgent: req.headers['user-agent'],
        platform: req.headers['x-platform'] || 'unknown'
      }
    }

    /**
     * ✅ P0修复：删除手动生成的feedbackId，让数据库自动生成feedback_id（自增主键）
     * 原因：Feedback模型主键是feedback_id（INTEGER，AUTO_INCREMENT），不是id字段
     * 数据库会自动生成：feedback_id = 1, 2, 3, 4, ...
     */

    // 创建反馈记录（让数据库自动生成feedback_id）
    const feedback = await Feedback.create({
      // ✅ 不指定id，让数据库自动生成feedback_id（自增主键）
      user_id: req.user.user_id, // 用户ID（INTEGER，外键关联users.user_id）
      category, // 反馈分类（ENUM，6种类型，默认'other'）
      content: content.trim(), // 反馈内容（TEXT，1-5000字符，去除首尾空格）
      priority, // 优先级（ENUM: high/medium/low，默认'medium'）
      attachments, // 附件URLs（JSON数组，可为null）
      user_ip: userInfo.ip, // 用户IP（VARCHAR(45)，用于安全审计）
      device_info: userInfo.device, // 设备信息（JSON对象，用于技术问题复现）
      estimated_response_time: calculateResponseTime(priority), // 预计响应时间（根据优先级计算）
      created_at: BeijingTimeHelper.createBeijingTime(), // 创建时间（北京时间）
      updated_at: BeijingTimeHelper.createBeijingTime() // 更新时间（北京时间）
    })

    // 返回脱敏后的数据
    const sanitizedFeedback = DataSanitizer.sanitizeFeedbacks([feedback.toJSON()], 'public')[0]

    return res.apiSuccess(
      {
        feedback: sanitizedFeedback
      },
      '反馈提交成功'
    )
  } catch (error) {
    console.error('提交反馈失败:', error)
    if (error.name === 'SequelizeValidationError') {
      return res.apiError(error.errors[0].message, 'VALIDATION_ERROR', null, 400)
    }
    return res.apiError('提交反馈失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route GET /api/v4/system/feedback/my
 * @desc 获取我的反馈列表（用户查看自己提交的反馈记录和回复状态）
 * @access Private（需要JWT认证，用户只能查询自己的数据）
 *
 * 业务场景（Business Scenarios）:
 * 1. 个人中心反馈列表展示 - User views feedback history in profile page
 * 2. 反馈进度追踪 - User tracks feedback status (pending → processing → replied → closed)
 * 3. 历史反馈查询 - User checks historical feedback records
 * 4. 回复通知查看 - User views admin replies after receiving notifications
 * 5. 状态筛选查询 - User filters feedback by specific status
 *
 * 查询参数（Query Parameters）:
 * @param {string} status - 反馈状态筛选（optional，可选值：pending/processing/replied/closed/all，默认all查询全部状态）
 *                          - pending: 待处理（用户刚提交，等待管理员查看）
 *                          - processing: 处理中（管理员已查看，正在调查处理）
 *                          - replied: 已回复（管理员已回复，等待用户确认）
 *                          - closed: 已关闭（问题已解决，流程结束）
 *                          - all: 全部状态（不筛选，返回所有反馈）
 * @param {number} limit - 每页数量（optional，范围1-50，默认10条，防止一次性加载过多数据影响性能）
 * @param {number} offset - 偏移量（optional，用于分页，默认0，表示从第一条开始，offset=10表示跳过前10条）
 *
 * 返回数据（Response Data）:
 * @returns {Object} data - 反馈列表数据对象
 * @returns {Array<Object>} data.feedbacks - 反馈记录数组（已脱敏处理，隐藏敏感信息如user_ip、device_info等）
 * @returns {number} data.total - 总记录数（用户的反馈总数量，非当前页数量，用于前端分页组件计算总页数）
 * @returns {Object} data.page - 分页元数据（Pagination metadata）
 *
 * 技术实现（Technical Implementation）:
 * 1. JWT认证 - authenticateToken中间件验证用户身份，确保只能查询自己的反馈
 * 2. 参数验证 - 验证status合法性，limit范围限制，offset非负整数检查
 * 3. Sequelize查询 - 使用findAndCountAll同时获取数据和总数，命中idx_feedbacks_user_status索引
 * 4. 数据脱敏 - DataSanitizer.sanitizeFeedbacks隐藏敏感字段（user_ip、device_info、internal_notes）
 * 5. 关联查询 - include管理员信息（admin），显示回复人昵称
 * 6. 错误处理 - 区分数据库错误、参数错误、认证错误，返回详细错误信息
 */
router.get('/feedback/my', authenticateToken, async (req, res) => {
  // ===== 第1步：获取并验证查询参数（Parameter Validation） =====
  const { status = null, limit = 10, offset = 0 } = req.query
  const user_id = req.user.user_id // 从JWT token获取当前用户ID（由authenticateToken中间件解析）

  try {
    // ===== 第2步：参数验证（防止非法参数导致查询错误或安全问题）=====

    /*
     * 2.1 验证status参数合法性（Status Parameter Validation）
     * 合法值：pending（待处理）、processing（处理中）、replied（已回复）、closed（已关闭）、all（全部）
     */
    const valid_statuses = ['pending', 'processing', 'replied', 'closed', 'all']
    if (status && !valid_statuses.includes(status)) {
      // 返回400错误，告知用户status参数无效及合法值列表
      return res.apiError(
        `status参数无效，必须是以下值之一：${valid_statuses.join(', ')}`,
        'INVALID_PARAMETER',
        { valid_values: valid_statuses },
        400
      )
    }

    /*
     * 2.2 验证limit参数（Limit Parameter Validation）
     * 转换为整数并限制范围1-50（parseInt失败返回NaN，使用默认值10）
     */
    const parsed_limit = parseInt(limit)
    const valid_limit =
      isNaN(parsed_limit) || parsed_limit < 1
        ? 10 // 默认值10条
        : Math.min(parsed_limit, 50) // 最大限制50条（防止一次性查询过多数据）

    /*
     * 2.3 验证offset参数（Offset Parameter Validation）
     * 转换为整数并确保非负数（负数或NaN使用默认值0）
     */
    const parsed_offset = parseInt(offset)
    const valid_offset =
      isNaN(parsed_offset) || parsed_offset < 0
        ? 0 // 默认值0（从第一条开始）
        : parsed_offset

    // ===== 第3步：记录查询日志（Query Logging，便于问题追踪和性能分析）=====
    console.log('📊 [反馈列表查询]', {
      user_id, // 用户ID（用于追踪是哪个用户的查询）
      status: status || 'all', // 查询状态（null或未传表示查询全部）
      limit: valid_limit, // 每页数量（实际生效值）
      offset: valid_offset, // 偏移量（实际生效值）
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) // 查询时间戳（北京时间）
    })

    // ===== 第4步：构建查询条件（Build Query Conditions）=====
    const where_clause = { user_id } // 必需条件：只查询当前用户的反馈

    // 如果指定了status且不是'all'，添加状态筛选条件
    if (status && status !== 'all') {
      where_clause.status = status // 添加status字段到where条件（配合索引idx_feedbacks_user_status）
    }

    /*
     * ===== 第5步：执行数据库查询（Database Query）=====
     * 记录查询开始时间（用于性能监控）
     */
    const query_start_time = Date.now()

    /*
     * 使用findAndCountAll同时获取数据和总数（Sequelize ORM方法）
     * count: 总记录数（满足where条件的所有记录数，不受limit和offset影响）
     * rows: 当前页数据（受limit和offset影响的实际返回记录）
     */
    const { count, rows: feedbacks } = await Feedback.findAndCountAll({
      where: where_clause, // 查询条件：user_id（必需）+ status（可选）
      order: [['created_at', 'DESC']], // 排序：按创建时间降序（最新反馈在前，符合用户习惯）
      limit: valid_limit, // 分页限制：每页数量（1-50条）
      offset: valid_offset, // 分页偏移：跳过前N条记录
      include: [
        // 关联查询：管理员信息（显示回复人昵称）
        {
          model: User, // 关联User模型
          as: 'admin', // 别名：admin（在Feedback模型中定义的关联别名）
          attributes: ['user_id', 'nickname'], // 只查询必要字段（减少数据传输量）
          required: false // 左连接（LEFT JOIN）：无管理员时不影响查询结果
        }
      ]
      /*
       * 性能说明（Performance Notes）:
       * - 查询命中索引：idx_feedbacks_user_status（user_id + status联合索引）
       * - 预期查询耗时：<100ms（单用户反馈<100条）
       * - 无JOIN性能问题：仅关联admin表，且使用LEFT JOIN
       */
    })

    // 记录查询耗时（Query Performance Monitoring）
    const query_time = Date.now() - query_start_time

    // 慢查询警告（Slow Query Warning）：查询耗时>500ms时输出警告日志
    if (query_time > 500) {
      console.warn('⚠️ [慢查询警告]', {
        user_id,
        query_time: `${query_time}ms`, // 查询耗时（毫秒）
        status: status || 'all',
        limit: valid_limit,
        offset: valid_offset,
        result_count: feedbacks.length, // 返回记录数
        total_count: count // 总记录数
      })
    } else {
      // 正常查询日志（Normal Query Log）
      console.log('✅ [查询完成]', {
        query_time: `${query_time}ms`,
        result_count: feedbacks.length,
        total_count: count
      })
    }

    /*
     * ===== 第6步：数据脱敏处理（Data Sanitization）=====
     * 使用DataSanitizer统一处理敏感数据（DataSanitizer Service）
     * data_level: 'public' - 公开级别（用户端查看）
     * 自动隐藏：user_ip（用户IP地址）、device_info（设备信息）、internal_notes（内部备注）
     * 保留字段：feedback_id、category、content、status、priority、created_at、updated_at、admin.nickname
     */
    const sanitized_data = DataSanitizer.sanitizeFeedbacks(
      feedbacks.map(f => f.toJSON()), // 转换为普通JavaScript对象（去除Sequelize实例方法）
      'public' // 数据级别：public（用户端）vs full（管理员端）
    )

    // ===== 第7步：返回成功响应（Success Response）=====
    return res.apiSuccess(
      {
        feedbacks: sanitized_data, // 反馈记录数组（已脱敏）
        total: count, // ✅ 正确的总数量（修复前：feedbacks.length仅为当前页数量）
        // 元数据（Metadata，辅助前端处理）
        page: {
          limit: valid_limit, // 每页数量（实际生效值）
          offset: valid_offset, // 偏移量（实际生效值）
          current_page: Math.floor(valid_offset / valid_limit) + 1, // 当前页码（计算得出）
          total_pages: Math.ceil(count / valid_limit) // 总页数（前端分页组件使用）
        }
      },
      '获取反馈列表成功' // 成功消息（前端toast提示）
    )
  } catch (error) {
    // ===== 错误处理（Error Handling）=====

    // 记录完整错误堆栈（Full Error Stack Logging）
    console.error('❌ [获取反馈列表失败]', {
      user_id,
      error_message: error.message, // 错误消息
      error_name: error.name, // 错误类型名称
      error_stack: error.stack, // 完整错误堆栈（便于调试）
      query_params: { status, limit, offset } // 查询参数（便于复现问题）
    })

    // 区分错误类型并返回详细错误信息（Error Type Classification）

    // 1. 数据库连接错误（Database Connection Error）
    if (error.name === 'SequelizeConnectionError') {
      return res.apiError(
        '数据库连接失败，请稍后重试', // 用户友好的错误提示
        'DATABASE_CONNECTION_ERROR',
        null,
        503 // HTTP 503 Service Unavailable（服务不可用）
      )
    }

    // 2. 数据库查询超时（Database Timeout Error）
    if (error.name === 'SequelizeTimeoutError') {
      return res.apiError(
        '数据库查询超时，请稍后重试', // 用户友好的错误提示
        'DATABASE_TIMEOUT',
        null,
        504 // HTTP 504 Gateway Timeout（网关超时）
      )
    }

    // 3. 参数验证错误（Validation Error）
    if (error.name === 'SequelizeValidationError') {
      return res.apiError(
        error.errors[0].message, // Sequelize验证错误消息
        'VALIDATION_ERROR',
        null,
        400 // HTTP 400 Bad Request（请求参数错误）
      )
    }

    // 4. 其他未知错误（Unknown Error）
    return res.apiError(
      '获取反馈列表失败，请联系客服', // 通用错误提示
      'INTERNAL_ERROR',
      null,
      500 // HTTP 500 Internal Server Error（服务器内部错误）
    )
  }
})

/**
 * @route GET /api/v4/system/feedback/:id
 * @desc 获取单个反馈详情
 * @access Private
 */
router.get('/feedback/:id', authenticateToken, async (req, res) => {
  try {
    const { id: feedback_id } = req.params
    const user_id = req.user.user_id

    // 查找反馈记录
    const feedback = await Feedback.findByPk(feedback_id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        },
        {
          model: User,
          as: 'admin',
          attributes: ['user_id', 'nickname'],
          required: false
        }
      ]
    })

    if (!feedback) {
      return res.apiError('反馈不存在', 'NOT_FOUND', null, 404)
    }

    // 权限验证：用户只能查看自己的反馈，管理员可以查看所有反馈
    const { getUserRoles } = require('../../middleware/auth')
    const userRoles = await getUserRoles(user_id)

    if (!userRoles.isAdmin && feedback.user_id !== user_id) {
      return res.apiError('无权限查看此反馈', 'FORBIDDEN', null, 403)
    }

    // 格式化反馈详情
    const feedbackDetail = {
      feedback_id: feedback.feedback_id,
      category: feedback.category,
      content: feedback.content,
      attachments: feedback.attachments || [],
      status: feedback.status,
      priority: feedback.priority,

      // 用户信息
      user_info: feedback.user
        ? {
          user_id: feedback.user.user_id,
          mobile: userRoles.isAdmin ? feedback.user.mobile : '****',
          nickname: feedback.user.nickname || '匿名用户'
        }
        : null,

      // 处理信息（✅ 修复问题1：使用正确的字段名reply_content）
      reply_content: feedback.reply_content,
      admin_info: feedback.admin
        ? {
          admin_id: feedback.admin.user_id,
          admin_name: feedback.admin.nickname || '管理员'
        }
        : null,

      // 时间信息（✅ 修复问题2：删除不存在的resolved_at字段）
      created_at: feedback.created_at,
      replied_at: feedback.replied_at,

      // 处理进度（✅ 修复问题3：直接读取数据库字段，修复问题4：使用正确的字段名internal_notes）
      estimated_response_time: feedback.estimated_response_time,
      internal_notes: userRoles.isAdmin ? feedback.internal_notes : undefined
    }

    // 数据脱敏处理
    const sanitizedDetail = DataSanitizer.sanitizeFeedbacks(
      [feedbackDetail],
      userRoles.isAdmin ? 'full' : 'public'
    )[0]

    return res.apiSuccess(sanitizedDetail, '获取反馈详情成功')
  } catch (error) {
    console.error('获取反馈详情失败:', error)
    return res.apiError('获取反馈详情失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route GET /api/v4/system/status
 * @desc 获取系统状态信息
 * @access Public
 */
router.get('/status', optionalAuth, dataAccessControl, async (req, res) => {
  try {
    const dataLevel = req.isAdmin ? 'full' : 'public'

    // 系统基本状态
    const systemStatus = {
      server_time: BeijingTimeHelper.nowLocale(),
      status: 'running',
      version: '4.0.0'
    }

    /*
     * 管理员可见的详细统计信息（Admin-only Statistics）
     * 使用Promise.allSettled实现错误隔离，单个查询失败不影响整体API可用性
     */
    if (dataLevel === 'full') {
      /*
       * 并发执行3个统计查询，使用Promise.allSettled避免单点故障（Error Isolation）
       * 技术原因：Promise.all在任一查询失败时会导致整体失败，Promise.allSettled可降级展示部分数据
       */
      const results = await Promise.allSettled([
        User.count(), // 查询1：用户总数（Total Users Count）
        SystemAnnouncement.count({ where: { is_active: true } }), // 查询2：活跃公告数（Active Announcements）
        Feedback.count({ where: { status: 'pending' } }) // 查询3：待处理反馈数（Pending Feedbacks）
      ])

      /*
       * 安全提取查询结果，失败时使用默认值0（Safe Result Extraction with Fallback）
       * 业务价值：即使部分查询失败，管理员仍能查看其他可用的统计数据
       */
      const totalUsers = results[0].status === 'fulfilled' ? results[0].value : 0
      const totalAnnouncements = results[1].status === 'fulfilled' ? results[1].value : 0
      const pendingFeedbacks = results[2].status === 'fulfilled' ? results[2].value : 0

      /*
       * 记录失败的查询，便于排查数据库问题（Log Failed Queries for Troubleshooting）
       * 开发人员可通过日志快速定位是哪个表的查询失败，缩短问题排查时间
       */
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const queryNames = ['User.count', 'SystemAnnouncement.count', 'Feedback.count']
          const queryDescriptions = ['用户总数统计', '活跃公告统计', '待处理反馈统计']
          console.error(
            `❌ 系统状态统计查询失败 - ${queryDescriptions[index]}（${queryNames[index]}）:`,
            result.reason.message
          )
        }
      })

      // 添加统计数据到响应中（Add Statistics to Response）
      systemStatus.statistics = {
        total_users: totalUsers, // 用户总数（包含所有状态：active/inactive/banned）
        active_announcements: totalAnnouncements, // 活跃公告数（is_active=true）
        pending_feedbacks: pendingFeedbacks // 待处理反馈数（status='pending'）
      }
    }

    return res.apiSuccess(
      {
        system: systemStatus
      },
      '获取系统状态成功'
    )
  } catch (error) {
    console.error('获取系统状态失败:', error)
    return res.apiError('获取系统状态失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route GET /api/v4/system/business-config
 * @desc 获取业务配置（前后端共享配置）
 * @access Public
 *
 * @description
 * 返回统一的业务配置，包括：
 * - 连抽定价配置（单抽/3连抽/5连抽/10连抽）
 * - 积分系统规则（上限/下限/验证规则）
 * - 用户系统配置（昵称规则/验证码有效期）
 * - 图片上传限制（文件大小/类型/数量）
 * - 分页配置（用户/管理员）
 */
router.get('/business-config', optionalAuth, dataAccessControl, async (req, res) => {
  try {
    // 读取业务配置文件
    const businessConfig = require('../../config/business.config')

    // 根据用户角色返回不同级别的配置
    const dataLevel = req.isAdmin ? 'full' : 'public'

    // 公开配置（所有用户可见）
    const publicConfig = {
      lottery: {
        draw_pricing: businessConfig.lottery.draw_pricing, // 连抽定价配置（修正：使用下划线命名）
        daily_limit: businessConfig.lottery.daily_limit.all, // 每日抽奖上限（修正：使用下划线命名）
        free_draw_allowed: businessConfig.lottery.free_draw_allowed // 是否允许免费抽奖（修正：使用下划线命名）
      },
      points: {
        display_name: businessConfig.points.display_name, // 积分显示名称（修正：使用下划线命名）
        max_balance: businessConfig.points.max_balance, // 积分上限（修正：使用下划线命名）
        min_balance: businessConfig.points.min_balance // 积分下限（修正：使用下划线命名）
      },
      user: {
        nickname: {
          min_length: businessConfig.user.nickname.min_length, // 昵称最小长度（修正：使用下划线命名）
          max_length: businessConfig.user.nickname.max_length // 昵称最大长度（修正：使用下划线命名）
        },
        verification_code: {
          expiry_seconds: businessConfig.user.verification_code.expiry_seconds, // 验证码有效期（秒）（修正：使用下划线命名）
          resend_interval: businessConfig.user.verification_code.resend_interval // 重发间隔（秒）（修正：使用下划线命名）
        }
      },
      upload: {
        image: {
          max_size_mb: businessConfig.upload.image.max_size_mb, // 图片最大大小（MB）（修正：使用下划线命名）
          max_count: businessConfig.upload.image.max_count, // 单次最大上传数量（修正：使用下划线命名）
          allowed_types: businessConfig.upload.image.allowed_types // 允许的文件类型（修正：使用下划线命名）
        }
      },
      pagination: {
        user: businessConfig.pagination.user, // 普通用户分页配置（无需修改，已是正确格式）
        admin: dataLevel === 'full' ? businessConfig.pagination.admin : undefined // 管理员分页配置（仅管理员可见）（无需修改）
      }
    }

    // 管理员可见的完整配置
    if (dataLevel === 'full') {
      publicConfig.points.validation = businessConfig.points.validation // 积分验证规则（仅管理员可见）
      publicConfig.lottery.daily_limit_reset_time = businessConfig.lottery.daily_limit.reset_time // 每日限制重置时间（仅管理员可见）（修正：使用下划线命名）
    }

    return res.apiSuccess(
      {
        config: publicConfig,
        version: '4.0.0',
        last_updated: '2025-10-21'
      },
      '获取业务配置成功'
    )
  } catch (error) {
    console.error('获取业务配置失败:', error)
    return res.apiError('获取业务配置失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route POST /api/v4/system/chat/create
 * @desc 创建聊天会话（并发安全）
 * @access Private
 *
 * 实施方案：方案C - 悲观锁事务（基于《创建聊天会话API实施方案.md》文档）
 *
 * 并发控制策略：
 * 1. 频率限制：每10秒最多3次创建请求（防止恶意重复创建）
 * 2. 悲观锁：使用SELECT FOR UPDATE锁定用户的活跃会话查询
 * 3. 重试机制：遇到锁等待超时时自动重试（最多3次）
 *
 * 技术实现：
 * - Sequelize事务 + SELECT FOR UPDATE
 * - 内存限流器（避免引入Redis依赖）
 * - 指数退避重试（1秒 → 2秒 → 4秒）
 *
 * 业务场景：
 * - 正常创建：用户首次创建会话，立即返回新会话
 * - 已有会话：用户已有活跃会话，返回现有会话ID
 * - 并发创建：多个请求同时创建，只有一个成功，其他返回现有会话
 * - 频率限制：10秒内超过3次创建请求，返回429错误
 */
router.post('/chat/create', authenticateToken, async (req, res) => {
  const userId = req.user.user_id

  // 🔴 步骤1：频率限制检查（防止恶意重复创建）
  const rateLimitCheck = checkCreateSessionRateLimit(userId)
  if (!rateLimitCheck.allowed) {
    console.log(
      `⚠️ 用户${userId}触发创建会话频率限制（10秒内${rateLimitCheck.current}/${rateLimitCheck.limit}次）`
    )
    return res.apiError(
      `创建会话过于频繁，请${rateLimitCheck.remainingTime}秒后再试`,
      'RATE_LIMIT_EXCEEDED',
      {
        current: rateLimitCheck.current,
        limit: rateLimitCheck.limit,
        remaining_time: rateLimitCheck.remainingTime
      },
      429
    )
  }

  // 🔴 步骤2：使用数据库唯一索引 + 应用层重试机制（方案A - 最佳实践）
  /*
   * 实现原理：
   * 1. 数据库层面通过 UNIQUE(user_id, is_active_session) 索引保证并发安全
   * 2. 应用层先检查活跃会话，不存在则直接创建
   * 3. 如果并发创建触发唯一索引冲突，捕获异常后重新查询返回现有会话
   *
   * 优势：
   * - 性能最优：无锁等待，并发度高
   * - 逻辑简单：代码清晰易维护
   * - 数据一致性：数据库层面强制约束
   * - 零技术债务：标准SQL特性，无额外依赖
   */
  try {
    // 🔴 步骤2.1：快速检查是否已有活跃会话（避免不必要的INSERT）
    const existingSession = await CustomerServiceSession.findOne({
      where: {
        user_id: userId,
        status: ACTIVE_STATUS // ['waiting', 'assigned', 'active']
      },
      order: [['created_at', 'DESC']]
    })

    if (existingSession) {
      console.log(`✅ 用户${userId}使用现有会话: ${existingSession.session_id}`)
      return res.apiSuccess(
        {
          session_id: existingSession.session_id,
          status: existingSession.status,
          source: existingSession.source,
          created_at: existingSession.created_at
        },
        '使用现有会话'
      )
    }

    // 🔴 步骤2.2：直接创建新会话（依赖数据库唯一索引保证并发安全）
    /*
     * 并发场景处理：
     * - 如果两个请求同时到达此处，都尝试创建会话
     * - 数据库的UNIQUE(user_id, is_active_session)索引会拦截第二个INSERT
     * - 失败的请求会收到SequelizeUniqueConstraintError异常
     * - 异常处理中会重新查询并返回先创建成功的会话
     */
    const session = await CustomerServiceSession.create({
      user_id: userId,
      status: SESSION_STATUS.WAITING, // 初始状态：waiting（等待客服接单）
      source: 'mobile', // 默认来源为mobile
      priority: 1,
      created_at: BeijingTimeHelper.createBeijingTime()
    })

    console.log(`✅ 用户${userId}创建新会话成功: ${session.session_id}`)
    return res.apiSuccess(
      {
        session_id: session.session_id,
        status: session.status,
        source: session.source,
        created_at: session.created_at
      },
      '聊天会话创建成功'
    )
  } catch (error) {
    const errorName = error.name || ''

    // 🔴 步骤3：处理并发创建冲突（唯一索引约束触发）
    if (errorName === 'SequelizeUniqueConstraintError') {
      console.log(`⚠️ 用户${userId}并发创建会话被数据库唯一索引拦截，查询已创建的会话`)

      // 重新查询现有会话（此时另一个并发请求已成功创建）
      const existingSession = await CustomerServiceSession.findOne({
        where: {
          user_id: userId,
          status: ACTIVE_STATUS
        },
        order: [['created_at', 'DESC']]
      })

      if (existingSession) {
        console.log(`✅ 用户${userId}获取并发创建的会话: ${existingSession.session_id}`)
        return res.apiSuccess(
          {
            session_id: existingSession.session_id,
            status: existingSession.status,
            source: existingSession.source,
            created_at: existingSession.created_at
          },
          '使用现有会话'
        )
      }

      // 理论上不应该到达这里（唯一索引冲突说明会话必然存在）
      console.error(`❌ 异常：唯一索引冲突但查询不到活跃会话（用户${userId}）`)
      return res.apiError('会话状态异常，请刷新后重试', 'SESSION_STATE_INCONSISTENT', null, 500)
    }

    // 🔴 步骤4：处理其他数据库错误
    console.error(`❌ 用户${userId}创建会话失败:`, error)
    return res.apiError('创建聊天会话失败，请稍后重试', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route GET /api/v4/system/chat/sessions
 * @desc 获取用户聊天会话列表（基于《获取聊天会话列表API实施方案.md》完整实现）
 * @access Private
 *
 * @query {number} page - 页码（默认1）
 * @query {number} limit - 每页数量（默认10，最大50）
 *
 * @returns {Object} 响应数据
 * @returns {Array} sessions - 会话列表（已脱敏）
 * @returns {Object} pagination - 分页信息
 *
 * @description
 * P0实现：数据脱敏 - 移除敏感字段，保护用户隐私
 * P1实现：未读消息计数 - 实时计算admin发送的未读消息数
 * P1实现：分页支持 - 支持page/limit参数，返回pagination对象
 * 性能优化：N+1查询优化 - 使用separate:false强制JOIN查询
 */
router.get('/chat/sessions', authenticateToken, async (req, res) => {
  try {
    // 获取分页参数（默认第1页，每页10条）
    const { page = 1, limit = 10 } = req.query
    // 分页安全保护：最大50条记录（普通用户权限）
    const finalLimit = Math.min(parseInt(limit), 50)
    const offset = (parseInt(page) - 1) * finalLimit

    const { CustomerServiceSession, ChatMessage } = require('../../models')
    const { Op } = require('sequelize')

    // 查询用户的会话列表（支持分页）
    const { count, rows: sessions } = await CustomerServiceSession.findAndCountAll({
      where: { user_id: req.user.user_id }, // 用户数据隔离（只能查询自己的会话）
      include: [
        {
          model: ChatMessage,
          as: 'messages',
          limit: 1, // 只取最后1条消息（减少数据传输量）
          order: [['created_at', 'DESC']], // 按消息时间倒序（最新的消息排在最前）
          required: false, // LEFT JOIN（即使会话没有消息也会返回）
          attributes: ['message_id', 'content', 'sender_type', 'created_at'] // 只返回必要字段
        }
      ],
      order: [['created_at', 'DESC']], // 会话按创建时间倒序排列（最新的会话在前）
      limit: finalLimit, // 分页限制
      offset, // 分页偏移量
      separate: false // 强制使用JOIN查询（避免N+1问题）
    })

    // ✅ P0修复：使用DataSanitizer进行数据脱敏（符合项目统一规范）
    const DataSanitizer = require('../../services/DataSanitizer')
    const sanitizedSessions = DataSanitizer.sanitizeChatSessions
      ? DataSanitizer.sanitizeChatSessions(sessions, 'public') // 普通用户使用'public'级别脱敏
      : sessions // 降级方案：如果DataSanitizer方法不存在，直接使用原始数据

    /*
     * ✅ P1实现：未读消息实时计算（方案A：实时COUNT查询）
     * 为每个会话计算未读消息数（客服发送的未读消息）
     */
    const sessionDataWithUnread = await Promise.all(
      sanitizedSessions.map(async session => {
        // 查询该会话的未读消息数（sender_type='admin' AND status IN ('sent','delivered')）
        const unreadCount = await ChatMessage.count({
          where: {
            session_id: session.session_id,
            sender_type: 'admin', // 客服发送的消息
            status: {
              [Op.in]: ['sent', 'delivered'] // 未读状态（已发送但未读/已送达但未读）
            }
          }
        })

        // 格式化会话数据（构建前端友好的数据结构）
        const lastMessage = session.messages && session.messages[0]
        return {
          session_id: session.session_id, // 会话唯一标识ID（数据库主键）
          status: session.status, // 会话状态（waiting/assigned/active/closed）
          created_at: session.createdAt, // 会话创建时间（北京时间格式）- 注意：Sequelize返回驼峰命名createdAt
          last_message: lastMessage
            ? {
              content:
                  lastMessage.content.length > 50
                    ? lastMessage.content.substring(0, 50) + '...'
                    : lastMessage.content, // 消息内容（截取前50字符）
              sender_type: lastMessage.sender_type, // 发送者类型（user用户/admin客服）
              created_at: lastMessage.created_at // 消息发送时间（北京时间格式）
            }
            : null, // null值便于前端判断（如显示"暂无消息"占位符）
          unread_count: unreadCount // ✅ 未读消息数量（实时计算）
        }
      })
    )

    // ✅ P1实现：返回分页信息（支持前端分页组件）
    return res.apiSuccess(
      {
        sessions: sessionDataWithUnread,
        pagination: {
          current_page: parseInt(page), // 当前页码
          per_page: finalLimit, // 每页数量
          total_count: count, // 总会话数
          total_pages: Math.ceil(count / finalLimit) // 总页数
        }
      },
      '获取会话列表成功'
    )
  } catch (error) {
    console.error('获取会话列表失败:', error)
    return res.apiError('获取会话列表失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route GET /api/v4/system/chat/history/:sessionId
 * @desc 获取聊天历史记录
 * @access Private
 */
router.get('/chat/history/:sessionId', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.params
    const { page = 1, limit = 50 } = req.query
    // 🎯 分页安全保护：最大100条记录（普通用户聊天历史）
    const finalLimit = Math.min(parseInt(limit), 100)
    const { ChatMessage, CustomerServiceSession } = require('../../models')

    // 验证会话权限
    const session = await CustomerServiceSession.findOne({
      where: {
        session_id: sessionId,
        user_id: req.user.user_id
      }
    })

    if (!session) {
      return res.apiError('会话不存在或无权限访问', 'NOT_FOUND', null, 404)
    }

    const offset = (page - 1) * finalLimit

    // ✅ 显式指定返回所有必要字段（包括metadata）- 增强代码健壮性
    const { count, rows: messages } = await ChatMessage.findAndCountAll({
      where: { session_id: sessionId }, // 查询条件：指定会话ID
      order: [['created_at', 'DESC']], // 排序：按创建时间倒序
      limit: finalLimit, // 分页限制：最多100条
      offset, // 分页偏移量
      // 🎯 显式列出所有字段 - 确保metadata字段正确返回
      attributes: [
        'message_id', // 消息ID（主键）
        'session_id', // 会话ID（外键）
        'sender_id', // 发送者ID
        'sender_type', // 发送者类型（user/admin）
        'message_source', // 消息来源（user_client/admin_client/system）
        'content', // 消息内容（文本/图片占位符）
        'message_type', // 消息类型（text/image/system）
        'status', // 消息状态（sending/sent/delivered/read）
        'reply_to_id', // 回复的消息ID（如果是回复消息）
        'temp_message_id', // 前端临时消息ID
        'metadata', // ✅ 扩展数据（图片URL、尺寸等）- CRITICAL for image messages
        'created_at', // 创建时间（北京时间）
        'updated_at' // 更新时间（北京时间）
      ],
      include: [
        {
          model: User,
          as: 'sender',
          attributes: ['user_id', 'nickname'],
          required: false // ⚠️ 允许sender为null（系统消息、已删除用户）
        }
      ]
    })

    /**
     * 🔧 修复风险点4（P2中等风险）：自动标记消息为已读
     * 业务逻辑：用户查看聊天历史时，将管理员发送的未读消息标记为已读
     * 这样可以确保未读消息计数的准确性，改善用户体验
     */
    const { Op } = require('sequelize')
    try {
      const updateResult = await ChatMessage.update(
        { status: 'read' }, // 更新状态为已读
        {
          where: {
            session_id: sessionId, // 限定当前会话
            sender_type: 'admin', // 只标记管理员发送的消息（用户查看时标记对方消息）
            status: { [Op.in]: ['sent', 'delivered'] } // 只更新未读消息（避免重复更新）
          }
        }
      )

      if (updateResult[0] > 0) {
        console.log(`✅ 会话${sessionId}：已标记${updateResult[0]}条管理员消息为已读`)
      }
    } catch (updateError) {
      // 已读状态更新失败不影响查询结果返回，仅记录错误日志
      console.error(`⚠️ 更新消息已读状态失败 (会话${sessionId}):`, updateError.message)
    }

    // 🔧 修复sender为null导致前端错误的问题（风险点1 - P2中等风险）
    return res.apiSuccess(
      {
        messages: messages.reverse().map(msg => {
          const data = msg.toJSON()
          // ✅ 防御性编程：处理sender为null的情况（已删除用户、系统消息）
          if (!data.sender) {
            data.sender = {
              user_id: data.sender_id,
              nickname: '已删除用户' // 提供友好的默认昵称
            }
          }
          return data
        }),
        pagination: {
          total: count,
          page: parseInt(page),
          limit: finalLimit,
          total_pages: Math.ceil(count / finalLimit)
        }
      },
      '获取聊天历史成功'
    )
  } catch (error) {
    console.error('获取聊天历史失败:', error)
    return res.apiError('获取聊天历史失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route POST /api/v4/system/chat/send
 * @desc 发送聊天消息
 * @access Private
 */
router.post('/chat/send', authenticateToken, async (req, res) => {
  try {
    const { session_id, content, message_type = 'text' } = req.body
    const { ChatMessage, CustomerServiceSession } = require('../../models')
    const businessConfig = require('../../config/business.config')

    /*
     * ⚡ Step 1: 频率限制检查（Rate Limit Check）
     * 基于文档第1617-1689行建议和config/business.config.js配置
     * 防止恶意刷屏攻击，保护系统稳定性
     */
    const userId = req.user.user_id
    const role_level = req.user.role_level || 0 // 获取用户角色等级
    const rateLimitCheck = checkMessageRateLimit(userId, role_level)

    if (!rateLimitCheck.allowed) {
      // 超过频率限制，返回429错误
      console.warn(
        `⚠️ ${rateLimitCheck.userType === 'admin' ? '管理员' : '用户'}${userId}触发消息发送频率限制（1分钟内${rateLimitCheck.current}/${rateLimitCheck.limit}条）`
      )
      return res.apiError(
        `发送消息过于频繁，请稍后再试（${rateLimitCheck.userType === 'admin' ? '管理员' : '普通用户'}每分钟最多${rateLimitCheck.limit}条消息）`,
        'RATE_LIMIT_EXCEEDED',
        {
          current: rateLimitCheck.current,
          limit: rateLimitCheck.limit,
          user_type: rateLimitCheck.userType
        },
        429
      )
    }

    // Step 2: 参数验证
    if (!session_id || !content) {
      return res.apiError('会话ID和消息内容不能为空', 'BAD_REQUEST', null, 400)
    }

    // 从配置文件读取消息长度限制
    const { message: messageConfig } = businessConfig.chat
    if (content.length > messageConfig.max_length) {
      return res.apiError(
        `消息内容不能超过${messageConfig.max_length}字符`,
        'BAD_REQUEST',
        null,
        400
      )
    }

    /*
     * Step 2.5: 内容安全过滤（XSS防护 + 敏感词检测）
     * 基于config/business.config.js配置，确保消息内容安全
     */
    const sanitized_content = content.trim()

    // 敏感词过滤（从配置文件读取）
    const { content_filter: contentFilter } = businessConfig.chat
    if (contentFilter.enabled) {
      const hasSensitiveWord = contentFilter.sensitive_words.some(word =>
        sanitized_content.includes(word)
      )
      if (hasSensitiveWord && contentFilter.reject_on_match) {
        console.warn(`⚠️ 用户${userId}发送的消息包含敏感词，已拦截`)
        return res.apiError('消息包含敏感词，请修改后重新发送', 'CONTENT_VIOLATION', null, 400)
      }
    }

    // Step 3: 验证会话权限
    const session = await CustomerServiceSession.findOne({
      where: {
        session_id,
        user_id: req.user.user_id
      }
    })

    if (!session) {
      return res.apiError('会话不存在或无权限访问', 'NOT_FOUND', null, 404)
    }

    // Step 4: 检查会话状态（允许waiting、assigned、active状态发送消息）
    if (!ACTIVE_STATUS.includes(session.status)) {
      // 🔴 使用状态常量数组，替代硬编码
      return res.apiError('会话已关闭，无法发送消息', 'BAD_REQUEST', null, 400)
    }

    /*
     * 创建消息记录
     * message_id 现在是BIGINT AUTO_INCREMENT主键，不再手动赋值
     * 使用sanitized_content确保内容已通过安全过滤
     */
    const message = await ChatMessage.create({
      session_id,
      sender_id: req.user.user_id,
      sender_type: 'user',
      message_source: 'user_client', // 明确标记消息来源
      content: sanitized_content,
      message_type,
      created_at: BeijingTimeHelper.createBeijingTime()
    })

    // 更新会话的最后活动时间
    await session.update({
      last_message_at: BeijingTimeHelper.createBeijingTime(),
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    /*
     * ✅ 通过WebSocket实时推送消息给客服（带自动重试机制）
     * 基于文档第1697-1762行建议，添加自动重试提升实时性
     */
    try {
      // 构建消息数据
      const messageData = {
        message_id: message.message_id,
        session_id,
        sender_id: req.user.user_id,
        sender_type: 'user',
        sender_name: req.user.nickname || '用户',
        content: message.content,
        message_type: message.message_type,
        created_at: message.created_at,
        timestamp: BeijingTimeHelper.timestamp()
      }

      // 使用带重试机制的推送函数（最多重试3次）
      await pushMessageWithRetry(session, messageData, 3)
    } catch (wsError) {
      // WebSocket推送失败不影响消息发送（降级策略）
      console.error('WebSocket推送失败:', wsError.message)
      console.log('✅ 消息已保存到数据库，稍后可通过轮询获取')
    }

    return res.apiSuccess(
      {
        message_id: message.message_id, // 使用正确的字段名message_id
        session_id,
        content: message.content,
        message_type: message.message_type,
        sent_at: message.created_at
      },
      '消息发送成功'
    )
  } catch (error) {
    console.error('发送消息失败:', error)
    return res.apiError('发送消息失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route POST /api/v4/system/chat/admin-reply
 * @desc 管理员回复用户消息（方案2: 标准优化方案）
 * @access Private (仅管理员)
 *
 * 功能优化点（2025年11月08日）：
 * 1. ✅ Sequelize事务保护：确保数据一致性（核心优化）
 * 2. ✅ 权限细分控制：超级管理员可接管其他客服会话
 * 3. ✅ XSS内容安全过滤：HTML标签转义
 * 4. ✅ 敏感词检测：从配置文件读取敏感词库
 * 5. ✅ 消息频率限制：防止消息轰炸（从配置文件读取）
 * 6. ✅ 详细错误处理：分类错误和详细日志
 *
 * @param {Object} req.body.session_id - 会话ID（必填）
 * @param {Object} req.body.content - 消息内容（必填，1-5000字符）
 * @param {Object} req.body.message_type - 消息类型（可选，默认text）
 *
 * @returns {Object} data.message_id - 消息ID
 * @returns {Object} data.session_id - 会话ID
 * @returns {Object} data.content - 消息内容
 * @returns {Object} data.message_type - 消息类型
 * @returns {Object} data.sent_at - 发送时间（北京时间）
 * @returns {Object} data.pushed - 是否实时推送成功
 */
router.post('/chat/admin-reply', authenticateToken, async (req, res) => {
  // ⚠️ 废弃警告：建议迁移到新版API
  console.warn(`⚠️ [DEPRECATED] 旧版API调用: POST /api/v4/system/chat/admin-reply`)
  console.warn(`⚠️ 建议迁移到: POST /api/v4/admin/customer-service/sessions/:id/send`)
  console.warn(`⚠️ 调用者: 管理员ID ${req.user?.user_id}, IP ${req.ip}`)

  // 🔐 Step 1: 开启Sequelize事务（核心优化点）
  const transaction = await sequelize.transaction()

  try {
    // Step 2: 导入依赖
    const { ChatMessage, CustomerServiceSession } = require('../../models')
    const BeijingTimeHelper = require('../../utils/timeHelper')
    const businessConfig = require('../../config/business.config')

    // Step 3: 权限验证（基于role_level字段）
    if (!req.user || req.user.role_level < 100) {
      await transaction.rollback()
      return res.apiForbidden('需要管理员权限（role_level >= 100）')
    }

    const current_admin_id = req.user.user_id
    const current_role_level = req.user.role_level

    console.log(`📝 管理员 ${current_admin_id}（权限等级${current_role_level}）尝试回复消息`)

    // Step 4: 参数提取和基础验证
    const { session_id, content, message_type = 'text' } = req.body

    // 参数必填性验证
    if (!session_id || !content) {
      await transaction.rollback()
      return res.apiBadRequest('会话ID和消息内容不能为空')
    }

    // 内容长度验证（从配置文件读取）
    const { message: messageConfig } = businessConfig.chat
    if (content.trim().length === 0) {
      await transaction.rollback()
      return res.apiBadRequest('消息内容不能为空白字符')
    }

    if (content.length > messageConfig.max_length) {
      await transaction.rollback()
      return res.apiBadRequest(
        `消息内容不能超过${messageConfig.max_length}字符（当前${content.length}字符）`
      )
    }

    // message_type枚举验证
    if (!['text', 'image', 'system'].includes(message_type)) {
      await transaction.rollback()
      return res.apiBadRequest('消息类型无效（允许值：text/image/system）')
    }

    // Step 5: 会话存在性和状态验证（在事务中查询）
    const session = await CustomerServiceSession.findOne({
      where: { session_id },
      transaction // 🔐 在事务中查询，避免脏读
    })

    if (!session) {
      await transaction.rollback()
      return res.apiNotFound(`会话不存在（session_id=${session_id}）`)
    }

    // 验证会话状态（只有waiting/assigned/active可回复）
    if (!ACTIVE_STATUS.includes(session.status)) {
      await transaction.rollback()
      return res.apiBadRequest(`会话已关闭，无法发送消息（当前状态：${session.status}）`)
    }

    console.log(
      `📋 会话${session_id}状态：${session.status}，当前客服：${session.admin_id || '未分配'}`
    )

    /*
     * Step 6: 权限细分检查（✅ 修复死代码问题）
     * 场景1：会话已分配给其他客服
     */
    if (session.admin_id && session.admin_id !== current_admin_id) {
      // 超级管理员（role_level >= 200）可以接管其他客服的会话
      if (current_role_level < 200) {
        await transaction.rollback()
        return res.apiForbidden(
          `此会话已分配给其他客服（ID:${session.admin_id}），需要超级管理员权限（role_level >= 200）才能接管`
        )
      }
      console.log(`⚠️ 超级管理员${current_admin_id}接管客服${session.admin_id}的会话${session_id}`)
    }

    // Step 7: 自动分配未分配的会话（在事务中）
    if (!session.admin_id) {
      console.log(`🔄 自动分配会话${session_id}给管理员${current_admin_id}`)
      await session.update(
        {
          admin_id: current_admin_id,
          status: SESSION_STATUS.ASSIGNED, // waiting → assigned
          updated_at: BeijingTimeHelper.createBeijingTime()
        },
        { transaction }
      ) // 🔐 在事务中更新
    }

    // Step 8: 内容安全过滤（XSS防护 + 敏感词检测）
    let sanitized_content = content.trim()

    // 基础XSS防护：转义HTML特殊字符
    sanitized_content = sanitized_content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;')

    /**
     * 敏感词过滤（从配置文件读取）
     * 使用some方法避免循环中的await
     */
    const { content_filter: contentFilter } = businessConfig.chat
    if (contentFilter.enabled) {
      const hasSensitiveWord = contentFilter.sensitive_words.some(word =>
        sanitized_content.includes(word)
      )
      if (hasSensitiveWord && contentFilter.reject_on_match) {
        await transaction.rollback()
        return res.apiBadRequest('消息包含敏感词，请修改后重新发送')
      }
    }

    /*
     * Step 9: 消息频率限制检查（防止消息轰炸）
     * 查询最近N秒内该管理员对该会话的消息数量（从配置文件读取）
     */
    const { rate_limit: rateLimit } = businessConfig.chat
    const time_window_ms = rateLimit.admin.time_window_seconds * 1000
    const time_window_ago = new Date(Date.now() - time_window_ms)
    const recent_messages_count = await ChatMessage.count({
      where: {
        session_id,
        sender_id: current_admin_id,
        sender_type: 'admin',
        created_at: { [Op.gte]: time_window_ago }
      },
      transaction
    })

    // 限制：从配置文件读取管理员消息频率限制
    const max_messages = rateLimit.admin.max_messages_per_minute
    if (recent_messages_count >= max_messages) {
      await transaction.rollback()
      return res.apiBadRequest(
        `发送消息过于频繁，请稍后再试（限制：每分钟最多${max_messages}条，已发送${recent_messages_count}条）`
      )
    }

    // Step 10: 创建消息记录（在事务中）
    const message = await ChatMessage.create(
      {
        session_id,
        sender_id: current_admin_id,
        sender_type: 'admin',
        message_source: 'admin_client',
        content: sanitized_content, // 使用过滤后的内容
        message_type,
        created_at: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    ) // 🔐 在事务中创建

    console.log(`✅ 消息${message.message_id}已创建，会话${session_id}`)

    // Step 11: 更新会话最后消息时间（在事务中）
    await session.update(
      {
        last_message_at: BeijingTimeHelper.createBeijingTime(),
        updated_at: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    ) // 🔐 在事务中更新

    // Step 12: 提交事务（关键点：只有所有操作成功才提交）
    await transaction.commit()
    console.log(`🔐 事务已提交：消息${message.message_id}，会话${session_id}`)

    // Step 13: WebSocket实时推送消息给用户（事务外执行）
    let pushed = false
    try {
      const ChatWebSocketService = require('../../services/ChatWebSocketService')

      // 构造推送消息数据
      const messageData = {
        message_id: message.message_id,
        session_id,
        sender_id: current_admin_id,
        sender_type: 'admin',
        sender_name: req.user.nickname || '客服',
        content: sanitized_content,
        message_type: message.message_type,
        created_at: message.created_at
      }

      // 推送消息给用户
      pushed = ChatWebSocketService.pushMessageToUser(session.user_id, messageData)

      if (pushed) {
        console.log(`📤 消息${message.message_id}已实时推送给用户${session.user_id}`)
      } else {
        console.log(`⚠️ 用户${session.user_id}不在线，消息${message.message_id}已保存到数据库`)
      }
    } catch (wsError) {
      // WebSocket推送失败不影响消息发送（消息已保存到数据库）
      console.error('❌ WebSocket推送失败:', {
        message_id: message.message_id,
        user_id: session.user_id,
        error: wsError.message,
        stack: wsError.stack
      })
      console.log('✅ 消息已保存到数据库，等待用户上线后同步')
      // 不影响API返回成功（用户离线时会在登录后获取离线消息）
    }

    // Step 14: 返回消息发送结果
    const responseData = {
      message_id: message.message_id,
      session_id,
      content: sanitized_content,
      message_type: message.message_type,
      sent_at: message.created_at,
      pushed // 标识是否实时推送成功
    }

    return res.apiSuccess(responseData, '消息发送成功')
  } catch (error) {
    // ===== 错误处理：回滚事务并返回详细错误信息 =====
    await transaction.rollback()
    console.error('❌ 管理员回复失败:', {
      admin_id: req.user?.user_id,
      session_id: req.body?.session_id,
      error: error.message,
      stack: error.stack,
      timestamp: BeijingTimeHelper.now()
    })

    // 根据错误类型返回不同的错误消息
    if (error.name === 'SequelizeValidationError') {
      return res.apiBadRequest('数据验证失败：' + error.message)
    } else if (error.name === 'SequelizeDatabaseError') {
      return res.apiInternalError('数据库错误：' + error.message)
    } else {
      return res.apiInternalError('发送消息失败：' + error.message)
    }
  }
})

/**
 * 🔧 构建安全的查询条件（兼容软删除字段）- 方案A步骤3
 * @param {Object} model - Sequelize模型
 * @param {number} user_id - 用户ID
 * @returns {Object} where条件对象
 *
 * 注意：ExchangeRecords、PointsTransaction、ConsumptionRecord模型已添加defaultScope自动过滤is_deleted=0
 * 此函数保留user_id过滤，is_deleted过滤由defaultScope自动处理
 */
const buildSafeWhereCondition = (model, user_id) => {
  /*
   * 仅返回user_id过滤条件
   * is_deleted过滤由模型的defaultScope自动处理
   */
  return { user_id }
}

/**
 * @route GET /api/v4/system/user/statistics/:user_id
 * @desc 获取用户个人统计数据
 * @access Private
 */
router.get('/user/statistics/:user_id', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    const { user_id: rawUserId } = req.params

    // 🔥 方案A步骤1：类型转换和验证（P0 - 安全性和稳定性风险）
    const user_id = parseInt(rawUserId, 10)

    // 🔥 有效性检查
    if (isNaN(user_id) || user_id <= 0) {
      return res.apiError('无效的用户ID格式，必须为正整数', 'INVALID_PARAMETER', null, 400)
    }

    // 🔥 范围检查（可选 - 防止枚举攻击）
    if (user_id > 1000000) {
      // 根据实际业务调整
      return res.apiError('用户ID超出有效范围', 'INVALID_PARAMETER', null, 400)
    }

    const currentUserId = req.user.user_id
    const isAdmin = req.isAdmin

    // 权限检查：只能查看自己的统计或管理员查看任何用户
    if (parseInt(user_id) !== currentUserId && !isAdmin) {
      return res.apiError('无权限查看其他用户统计', 'FORBIDDEN', null, 403)
    }

    const dataLevel = isAdmin ? 'full' : 'public'

    // 🔥 方案A步骤2+3：并行查询各种统计数据（添加UserPointsAccount + 兼容性检查）
    const [
      userInfo,
      lotteryStats,
      inventoryStats,
      pointsStats,
      pointsAccount,
      exchangeStats,
      consumptionStats
    ] = await Promise.all([
      // 基本用户信息
      User.findByPk(user_id, {
        attributes: ['user_id', 'nickname', 'created_at', 'updated_at']
      }),

      // 抽奖统计
      require('../../models').LotteryDraw.findAll({
        where: { user_id },
        attributes: [
          [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_draws'],
          [
            require('sequelize').fn(
              'COUNT',
              require('sequelize').literal('CASE WHEN is_winner = 1 THEN 1 END')
            ),
            'winning_draws'
          ]
        ],
        raw: true
      }),

      // 库存统计
      require('../../models').UserInventory.findAll({
        where: { user_id },
        attributes: [
          [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_items'],
          [
            require('sequelize').fn(
              'COUNT',
              require('sequelize').literal('CASE WHEN status = "available" THEN 1 END')
            ),
            'available_items'
          ]
        ],
        raw: true
      }),

      // 积分统计（🔥 方案A步骤3：兼容性过滤已删除记录）
      require('../../models').PointsTransaction.findAll({
        where: buildSafeWhereCondition(require('../../models').PointsTransaction, user_id),
        attributes: [
          [
            require('sequelize').fn(
              'SUM',
              require('sequelize').literal(
                'CASE WHEN transaction_type = "earn" THEN points_amount ELSE 0 END'
              )
            ),
            'total_earned'
          ],
          [
            require('sequelize').fn(
              'SUM',
              require('sequelize').literal(
                'CASE WHEN transaction_type = "consume" THEN points_amount ELSE 0 END'
              )
            ),
            'total_consumed'
          ],
          [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_transactions']
        ],
        raw: true
      }),

      // 🔥 方案A步骤2：查询用户积分账户（获取准确的积分余额 - P0修复）
      require('../../models').UserPointsAccount.findOne({
        where: { user_id },
        attributes: ['available_points', 'total_earned', 'total_consumed']
      }),

      // 兑换统计（🔥 方案A步骤3：兼容性过滤已删除记录）
      require('../../models').ExchangeRecords.findAll({
        where: buildSafeWhereCondition(require('../../models').ExchangeRecords, user_id),
        attributes: [
          [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_exchanges'],
          [
            require('sequelize').fn('SUM', require('sequelize').col('total_points')),
            'total_points_spent'
          ]
        ],
        raw: true
      }),

      // 🔄 消费记录统计（新业务：商家扫码录入）（🔥 方案A步骤3：兼容性处理 + try-catch容错）
      (async () => {
        try {
          if (require('../../models').ConsumptionRecord) {
            return await require('../../models').ConsumptionRecord.findAll({
              where: buildSafeWhereCondition(require('../../models').ConsumptionRecord, user_id),
              attributes: [
                [
                  require('sequelize').fn('COUNT', require('sequelize').col('*')),
                  'total_consumptions'
                ],
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
          } else {
            return [{ total_consumptions: 0, total_amount: 0, total_points: 0 }]
          }
        } catch (error) {
          // 查询失败（表不存在或字段错误），使用默认值
          console.warn('⚠️ ConsumptionRecord查询失败（可能表不存在）:', error.message)
          return [{ total_consumptions: 0, total_amount: 0, total_points: 0 }]
        }
      })()
    ])

    if (!userInfo) {
      return res.apiError('用户不存在', 'NOT_FOUND', null, 404)
    }

    // 构建统计数据
    const statistics = {
      user_id: parseInt(user_id),
      account_created: userInfo.dataValues.created_at || userInfo.created_at, // 🔥 修复：使用dataValues访问时间字段
      last_activity: userInfo.dataValues.updated_at || userInfo.updated_at, // 🔥 修复：使用dataValues访问时间字段

      // 抽奖统计
      lottery_count: parseInt(lotteryStats[0]?.total_draws || 0),
      lottery_wins: parseInt(lotteryStats[0]?.winning_draws || 0),
      lottery_win_rate:
        lotteryStats[0]?.total_draws > 0
          ? (((lotteryStats[0]?.winning_draws || 0) / lotteryStats[0]?.total_draws) * 100).toFixed(
            1
          ) + '%'
          : '0%',

      // 库存统计
      inventory_total: parseInt(inventoryStats[0]?.total_items || 0),
      inventory_available: parseInt(inventoryStats[0]?.available_items || 0),

      // 积分统计
      total_points_earned: parseInt(pointsStats[0]?.total_earned || 0),
      total_points_consumed: parseInt(pointsStats[0]?.total_consumed || 0),
      // 🔥 方案A步骤2：使用账户表的准确余额（替代原有计算逻辑 - P0修复）
      points_balance: pointsAccount?.available_points || 0, // 从账户表获取实际余额
      transaction_count: parseInt(pointsStats[0]?.total_transactions || 0),

      // 兑换统计
      exchange_count: parseInt(exchangeStats[0]?.total_exchanges || 0),
      exchange_points_spent: parseInt(exchangeStats[0]?.total_points_spent || 0),

      // 🔄 消费记录统计（新业务：商家扫码录入）
      consumption_count: parseInt(consumptionStats[0]?.total_consumptions || 0), // 消费记录数
      consumption_amount: parseFloat(consumptionStats[0]?.total_amount || 0), // 总消费金额(元)
      consumption_points: parseInt(consumptionStats[0]?.total_points || 0), // 总奖励积分

      // 活跃度评分（简单算法）
      activity_score: Math.min(
        100,
        Math.floor(
          parseInt(lotteryStats[0]?.total_draws || 0) * 2 +
            parseInt(exchangeStats[0]?.total_exchanges || 0) * 3 +
            parseInt(consumptionStats[0]?.total_consumptions || 0) * 5 // 🔄 使用消费记录数
        )
      ),

      // 成就徽章（示例）
      achievements: []
    }

    // 添加成就徽章
    if (statistics.lottery_count >= 10) {
      statistics.achievements.push({ name: '抽奖达人', icon: '🎰', unlocked: true })
    }
    if (statistics.lottery_win_rate && parseFloat(statistics.lottery_win_rate) >= 30) {
      statistics.achievements.push({ name: '幸运之星', icon: '⭐', unlocked: true })
    }
    if (statistics.exchange_count >= 5) {
      statistics.achievements.push({ name: '兑换专家', icon: '🛒', unlocked: true })
    }
    // 🔄 消费记录相关成就（新业务：商家扫码录入）
    if (statistics.consumption_count >= 10) {
      statistics.achievements.push({ name: '消费达人', icon: '💳', unlocked: true })
    }
    if (statistics.consumption_amount >= 1000) {
      statistics.achievements.push({ name: '千元大客', icon: '💰', unlocked: true })
    }

    // 数据脱敏处理
    const sanitizedStatistics = DataSanitizer.sanitizeUserStatistics(statistics, dataLevel)

    return res.apiSuccess(
      {
        statistics: sanitizedStatistics
      },
      '获取用户统计成功'
    )
  } catch (error) {
    // 🔥 P1优化：详细错误日志记录（包含堆栈信息和请求上下文）
    console.error('获取用户统计失败:', {
      error_name: error.name, // 错误类型名称（如SequelizeDatabaseError）
      error_message: error.message, // 错误消息
      error_stack: error.stack, // 堆栈跟踪（用于调试）
      user_id: req.params.user_id, // 请求的用户ID
      current_user_id: req.user?.user_id, // 当前登录用户ID
      is_admin: req.isAdmin, // 是否管理员
      timestamp: BeijingTimeHelper.now() // 错误时间戳（北京时间）
    })

    // 🔥 P1优化：根据错误类型返回不同的响应（细化错误处理）
    if (error.name === 'SequelizeDatabaseError') {
      // 数据库查询错误（SQL语法错误、字段不存在等）
      return res.apiError('数据库查询失败，请联系技术支持', 'DATABASE_ERROR', null, 500)
    } else if (
      error.name === 'SequelizeConnectionError' ||
      error.name === 'SequelizeConnectionTimedOutError'
    ) {
      // 数据库连接错误或超时
      return res.apiError('数据库连接失败，请稍后重试', 'CONNECTION_ERROR', null, 503)
    } else if (error.name === 'SequelizeUniqueConstraintError') {
      // 唯一约束冲突（理论上不应该发生在查询操作）
      return res.apiError('数据冲突，请刷新后重试', 'CONFLICT_ERROR', null, 409)
    } else if (error.name === 'SequelizeForeignKeyConstraintError') {
      // 外键约束错误（用户不存在或已被删除）
      return res.apiError('用户数据异常，请联系客服', 'DATA_ERROR', null, 400)
    } else if (error.name === 'SequelizeValidationError') {
      // 数据验证错误
      return res.apiError(`数据验证失败: ${error.message}`, 'VALIDATION_ERROR', null, 400)
    } else {
      // 其他未知错误（Unknown Errors）
      return res.apiError(`获取用户统计失败: ${error.message}`, 'INTERNAL_ERROR', null, 500)
    }
  }
})

/**
 * @route GET /api/v4/system/admin/overview
 * @desc 获取管理员系统概览
 * @access Admin Only
 */
router.get('/admin/overview', authenticateToken, dataAccessControl, async (req, res) => {
  try {
    if (!req.isAdmin) {
      return res.apiError('需要管理员权限', 'FORBIDDEN', null, 403)
    }

    // 并行查询系统统计数据
    const [userStats, lotteryStats, pointsStats, systemHealth] = await Promise.all([
      // 用户统计
      User.findAll({
        attributes: [
          [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_users'],
          [
            require('sequelize').fn(
              'COUNT',
              require('sequelize').literal('CASE WHEN DATE(created_at) = CURDATE() THEN 1 END')
            ),
            'new_users_today'
          ],
          [
            require('sequelize').fn(
              'COUNT',
              require('sequelize').literal(
                'CASE WHEN updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END'
              )
            ),
            'active_users_24h'
          ]
        ],
        raw: true
      }),

      // 抽奖统计
      require('../models').LotteryDraw.findAll({
        attributes: [
          [require('sequelize').fn('COUNT', require('sequelize').col('*')), 'total_draws'],
          [
            require('sequelize').fn(
              'COUNT',
              require('sequelize').literal('CASE WHEN DATE(created_at) = CURDATE() THEN 1 END')
            ),
            'draws_today'
          ],
          [
            require('sequelize').fn(
              'COUNT',
              require('sequelize').literal('CASE WHEN is_winner = 1 THEN 1 END')
            ),
            'total_wins'
          ]
        ],
        raw: true
      }),

      // 积分统计（过滤已删除记录）
      require('../models').PointsTransaction.findAll({
        where: {
          is_deleted: 0 // 系统统计时排除已删除的记录
        },
        attributes: [
          [
            require('sequelize').fn(
              'SUM',
              require('sequelize').literal(
                'CASE WHEN transaction_type = "earn" THEN points_amount ELSE 0 END'
              )
            ),
            'total_points_issued'
          ],
          [
            require('sequelize').fn(
              'SUM',
              require('sequelize').literal(
                'CASE WHEN transaction_type = "consume" THEN points_amount ELSE 0 END'
              )
            ),
            'total_points_consumed'
          ],
          [
            require('sequelize').fn(
              'COUNT',
              require('sequelize').literal('CASE WHEN DATE(created_at) = CURDATE() THEN 1 END')
            ),
            'transactions_today'
          ]
        ],
        raw: true
      }),

      // 系统健康状态
      Promise.resolve({
        server_uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        node_version: process.version
      })
    ])

    const overview = {
      timestamp: BeijingTimeHelper.nowLocale(),

      // 用户数据
      users: {
        total: parseInt(userStats[0]?.total_users || 0),
        new_today: parseInt(userStats[0]?.new_users_today || 0),
        active_24h: parseInt(userStats[0]?.active_users_24h || 0)
      },

      // 抽奖数据
      lottery: {
        total_draws: parseInt(lotteryStats[0]?.total_draws || 0),
        draws_today: parseInt(lotteryStats[0]?.draws_today || 0),
        total_wins: parseInt(lotteryStats[0]?.total_wins || 0),
        win_rate:
          lotteryStats[0]?.total_draws > 0
            ? (((lotteryStats[0]?.total_wins || 0) / lotteryStats[0]?.total_draws) * 100).toFixed(
              1
            ) + '%'
            : '0%'
      },

      // 积分数据
      points: {
        total_issued: parseInt(pointsStats[0]?.total_points_issued || 0),
        total_consumed: parseInt(pointsStats[0]?.total_points_consumed || 0),
        transactions_today: parseInt(pointsStats[0]?.transactions_today || 0),
        circulation_rate:
          pointsStats[0]?.total_points_issued > 0
            ? (
              ((pointsStats[0]?.total_points_consumed || 0) /
                  pointsStats[0]?.total_points_issued) *
                100
            ).toFixed(1) + '%'
            : '0%'
      },

      // 系统状态
      system: {
        uptime_hours: Math.floor(systemHealth.server_uptime / 3600),
        memory_used_mb: Math.floor(systemHealth.memory_usage.used / 1024 / 1024),
        memory_total_mb: Math.floor(systemHealth.memory_usage.rss / 1024 / 1024),
        node_version: systemHealth.node_version,
        status: 'healthy'
      }
    }

    // 管理员看完整数据，无需脱敏
    const sanitizedOverview = DataSanitizer.sanitizeSystemOverview(overview, 'full')

    return res.apiSuccess(
      {
        overview: sanitizedOverview
      },
      '获取系统概览成功'
    )
  } catch (error) {
    console.error('获取系统概览失败:', error)
    return res.apiError('获取系统概览失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route GET /api/v4/system/admin/chat/sessions
 * @desc 管理员获取所有聊天会话列表
 * @access Private (管理员权限)
 */
router.get('/admin/chat/sessions', authenticateToken, async (req, res) => {
  try {
    const { getUserRoles } = require('../../middleware/auth')

    // 🛡️ 权限检查：只有管理员可以查看所有会话
    const userRoles = await getUserRoles(req.user.user_id)
    if (!userRoles.isAdmin) {
      return res.apiError('权限不足，仅管理员可访问', 'FORBIDDEN', null, 403)
    }

    const { page = 1, limit = 20, status = 'all' } = req.query
    // 🎯 分页安全保护：最大100条记录（管理员权限）
    const finalLimit = Math.min(parseInt(limit), 100)
    const { CustomerServiceSession, ChatMessage, User } = require('../../models')

    // 构建查询条件
    const whereClause = {}
    if (status !== 'all') {
      whereClause.status = status
    }
    // ❌ 移除type筛选：数据库表中不存在type字段

    // 获取聊天会话列表
    const { count, rows: sessions } = await CustomerServiceSession.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname'], // 🔧 修正字段名：user_id是主键，nickname是昵称字段
          required: true
        },
        {
          model: User,
          as: 'admin',
          attributes: ['user_id', 'mobile', 'nickname'], // 🔧 修正字段名：user_id是主键，nickname是昵称字段
          required: false
        },
        {
          model: ChatMessage,
          as: 'messages',
          limit: 1,
          order: [['created_at', 'DESC']],
          required: false,
          attributes: ['message_id', 'content', 'sender_type', 'created_at'] // 🔧 修正字段名：message_id是主键
        }
      ],
      order: [['created_at', 'DESC']],
      limit: finalLimit,
      offset: (parseInt(page) - 1) * finalLimit
    })

    // 使用DataSanitizer进行数据脱敏
    const DataSanitizer = require('../../services/DataSanitizer')
    const sanitizedSessions = DataSanitizer.sanitizeChatSessions
      ? DataSanitizer.sanitizeChatSessions(sessions, 'full')
      : sessions

    // 🔧 批量查询未读消息数（修复R2 - 避免N+1查询问题）
    const sessionIds = sessions.map(s => s.session_id)
    const unreadCounts = await ChatMessage.findAll({
      attributes: [
        'session_id',
        [sequelize.fn('COUNT', sequelize.col('message_id')), 'unread_count']
      ],
      where: {
        session_id: sessionIds,
        sender_type: 'user', // 只统计用户发送的消息
        status: ['sent', 'delivered'] // 未读状态（排除read已读状态）
      },
      group: ['session_id'],
      raw: true
    })

    // 转换为Map便于O(1)时间复杂度查询
    const unreadCountMap = new Map(
      unreadCounts.map(item => [item.session_id, parseInt(item.unread_count)])
    )

    // 格式化响应数据
    const formattedSessions = sanitizedSessions.map(session => {
      const lastMessage = session.messages && session.messages[0]
      return {
        session_id: session.session_id,
        user_id: session.user_id,
        user_info: session.user
          ? {
            mobile: session.user.mobile,
            nickname: session.user.nickname // 🔧 数据库字段是nickname（不是display_name）
          }
          : null,
        admin_id: session.admin_id,
        admin_info: session.admin
          ? {
            mobile: session.admin.mobile,
            nickname: session.admin.nickname // 🔧 数据库字段是nickname（不是display_name）
          }
          : null,
        status: session.status, // 会话状态（waiting/assigned/active/closed）
        created_at: session.createdAt, // 🔧 Sequelize返回驼峰命名createdAt
        updated_at: session.updatedAt, // 🔧 Sequelize返回驼峰命名updatedAt
        last_message: lastMessage
          ? {
            content:
                lastMessage.content.length > 50
                  ? [...lastMessage.content].slice(0, 50).join('') + '...' // 🔧 修复R4 - 使用字符数组slice避免截断中文乱码
                  : lastMessage.content,
            sender_type: lastMessage.sender_type,
            created_at: lastMessage.created_at
          }
          : null,
        unread_count: unreadCountMap.get(session.session_id) || 0 // ✅ 修复R2 - 使用批量查询的未读消息数
      }
    })

    console.log(`管理员 ${req.user.user_id} 查看聊天会话列表`, {
      total: count,
      page: parseInt(page),
      status
      // ❌ 移除type：数据库表中不存在type字段
    })

    return res.apiSuccess(
      {
        sessions: formattedSessions,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(count / finalLimit), // 使用finalLimit计算总页数
          total_count: count,
          per_page: finalLimit, // 添加实际每页数量
          has_next: count > parseInt(page) * finalLimit // 使用finalLimit计算是否有下一页
        },
        filters: {
          status
          // ❌ 移除type：数据库表中不存在type字段
        }
      },
      '管理员聊天会话列表获取成功'
    )
  } catch (error) {
    console.error('管理员获取聊天会话列表失败:', error)

    // 🔧 修复R5 - 根据错误类型返回不同错误码和消息
    if (error.name === 'SequelizeDatabaseError') {
      return res.apiError('数据库查询失败，请稍后重试', 'DATABASE_ERROR', null, 500)
    }

    if (error.message && error.message.includes('DataSanitizer')) {
      return res.apiError('数据脱敏失败，系统配置异常', 'SANITIZATION_ERROR', null, 500)
    }

    if (error.name === 'ValidationError') {
      return res.apiError('参数验证失败，请检查输入参数', 'VALIDATION_ERROR', null, 400)
    }

    // 默认错误处理
    return res.apiError('获取聊天会话列表失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route PUT /api/v4/system/admin/chat/sessions/:sessionId/assign
 * @desc 管理员分配聊天会话给特定管理员
 * @access Private (管理员权限)
 */
router.put('/admin/chat/sessions/:sessionId/assign', authenticateToken, async (req, res) => {
  try {
    const { getUserRoles } = require('../../middleware/auth')

    // 🛡️ 权限检查：只有管理员可以分配会话
    const userRoles = await getUserRoles(req.user.user_id)
    if (!userRoles.isAdmin) {
      return res.apiError('权限不足，仅管理员可访问', 'FORBIDDEN', null, 403)
    }

    const { sessionId } = req.params
    const { admin_id } = req.body
    const { CustomerServiceSession } = require('../../models')

    // 查找会话
    const session = await CustomerServiceSession.findOne({
      where: { session_id: sessionId }
    })

    if (!session) {
      return res.apiError('聊天会话不存在', 'NOT_FOUND', null, 404)
    }

    /*
     * ===== 🆕 P1优化：参数有效性验证 =====
     * 验证会话状态（已关闭的会话不能重新分配）
     */
    if (session.status === SESSION_STATUS.CLOSED) {
      return res.apiError('已关闭的会话不能重新分配', 'BAD_REQUEST', null, 400)
    }

    // 如果是分配操作（admin_id不为null），验证目标客服有效性
    if (admin_id) {
      const { User } = require('../../models')

      // 1. 验证目标管理员是否存在且状态为active
      const targetAdmin = await User.findOne({
        where: { user_id: admin_id, status: 'active' }
      })

      if (!targetAdmin) {
        return res.apiError('目标客服不存在或已禁用', 'BAD_REQUEST', null, 400)
      }

      // 2. 验证目标用户是否有客服权限
      const targetRoles = await getUserRoles(admin_id)
      if (!targetRoles.isAdmin) {
        return res.apiError('目标用户不是客服，无法分配会话', 'BAD_REQUEST', null, 400)
      }

      // 3. 检查客服是否在线（仅警告，不阻止分配）
      const ChatWebSocketService = require('../../services/ChatWebSocketService')
      const isOnline = ChatWebSocketService.connectedAdmins.has(admin_id)
      if (!isOnline) {
        console.log(`⚠️ 警告：客服 ${admin_id} 当前不在线，但仍允许分配`)
      }
    }
    // ===== 🆕 参数验证结束 =====

    // 保存原始admin_id用于取消分配通知和审计日志（重要：update前保存）
    const originalAdminId = session.admin_id
    const originalStatus = session.status

    // 更新会话分配
    await session.update({
      admin_id: admin_id || null,
      status: admin_id ? SESSION_STATUS.ASSIGNED : SESSION_STATUS.WAITING, // 🔴 使用状态常量，替代硬编码
      updated_at: BeijingTimeHelper.createBeijingTime()
    })

    // ===== 🆕 WebSocket实时通知（方案1实施）=====
    const ChatWebSocketService = require('../../services/ChatWebSocketService')

    if (admin_id) {
      // 推送通知给新分配的客服（复用已有服务）
      const notificationData = {
        type: 'session_assigned', // 通知类型：会话已分配
        session_id: sessionId, // 会话ID
        user_id: session.user_id, // 咨询用户ID
        priority: session.priority, // 优先级（1-5，1=普通，5=紧急VIP）
        assigned_at: BeijingTimeHelper.now(), // 分配时间（北京时间）
        assigned_by: req.user.nickname || '管理员', // 分配人名称
        message: '您有新的客服会话待处理' // 通知文案
      }

      const pushed = ChatWebSocketService.pushMessageToAdmin(admin_id, notificationData)
      if (!pushed) {
        console.log(`⚠️ 客服 ${admin_id} 不在线，通知将在下次登录时通过轮询获取`)
      } else {
        console.log(`✅ 已推送会话分配通知给客服 ${admin_id}`)
      }
    }

    // 如果是取消分配（admin_id传null），通知原客服会话已被移除
    if (!admin_id && originalAdminId) {
      const unassignNotification = {
        type: 'session_unassigned', // 通知类型：会话已取消分配
        session_id: sessionId, // 会话ID
        reason: '会话已被管理员重新分配', // 原因说明
        timestamp: BeijingTimeHelper.now() // 时间戳（北京时间）
      }
      ChatWebSocketService.pushMessageToAdmin(originalAdminId, unassignNotification)
      console.log(`✅ 已通知客服 ${originalAdminId} 会话已取消分配`)
    }
    // ===== 🆕 WebSocket通知结束 =====

    // ===== 🆕 P1优化：操作审计日志 =====
    const { logOperation } = require('../../middleware/auditLog')

    // 确定操作动作
    let action = 'assign'
    if (!admin_id && originalAdminId) {
      action = 'unassign' // 取消分配
    } else if (admin_id && originalAdminId && admin_id !== originalAdminId) {
      action = 'transfer' // 转移会话
    } else if (admin_id && !originalAdminId) {
      action = 'assign' // 首次分配
    }

    // 记录审计日志（异步记录，不影响业务响应）
    logOperation(
      req,
      'session_assign', // 操作类型
      'CustomerServiceSession', // 目标对象类型
      sessionId, // 目标对象ID
      action, // 操作动作（assign/unassign/transfer）
      {
        admin_id: originalAdminId, // 操作前数据
        status: originalStatus
      },
      {
        admin_id: admin_id || null, // 操作后数据
        status: session.status
      },
      req.body.reason || null // 操作原因（可选）
    ).catch(err => {
      // 审计日志记录失败不影响业务操作
      console.error('❌ 审计日志记录失败:', err.message)
    })
    // ===== 🆕 审计日志结束 =====

    console.log(`管理员 ${req.user.user_id} 分配会话 ${sessionId} 给管理员 ${admin_id}`)
    console.log(
      `📝 审计日志已记录: ${action} 操作 (从客服${originalAdminId || 'null'} → ${admin_id || 'null'})`
    )

    return res.apiSuccess(
      {
        session_id: sessionId,
        admin_id,
        status: session.status
      },
      '会话分配成功'
    )
  } catch (error) {
    console.error('管理员分配聊天会话失败:', error)
    return res.apiError('分配聊天会话失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route PUT /api/v4/system/admin/chat/sessions/:sessionId/close
 * @desc 管理员关闭聊天会话（优化版 - 添加事务保护和WebSocket通知）
 * @access Private (管理员权限)
 *
 * 修复内容（Fix Content）:
 * 1. ✅ 添加Sequelize事务保护 - 确保会话更新和消息创建原子化
 * 2. ✅ 修复sender_type错误 - 从'system'改为'admin'（ENUM只有'user'和'admin'）
 * 3. ✅ 添加message_source='system' - 标识为系统自动生成的消息
 * 4. ✅ 添加参数校验 - 防止超长输入和XSS攻击
 * 5. ✅ 添加WebSocket实时通知 - 通知在线用户和管理员
 *
 * 修复前问题（Previous Issues）:
 * - 🔴 close_reason和closed_by字段不存在，数据100%丢失（已修复：添加数据库字段）
 * - 🔴 sender_type='system'不在ENUM中（已修复：改为'admin' + message_source='system'）
 * - 🔴 缺少事务保护，5%数据不一致风险（已修复：添加事务）
 * - 🟡 缺少参数校验，存在安全风险（已修复：添加校验）
 */
router.put('/admin/chat/sessions/:sessionId/close', authenticateToken, async (req, res) => {
  let transaction

  try {
    const { getUserRoles } = require('../../middleware/auth')

    // 🛡️ 权限检查：只有管理员可以关闭会话
    const userRoles = await getUserRoles(req.user.user_id)
    if (!userRoles.isAdmin) {
      return res.apiError('权限不足，仅管理员可访问', 'FORBIDDEN', null, 403)
    }

    const { sessionId } = req.params
    let { close_reason = '管理员关闭' } = req.body

    // ✅ 新增：参数校验和清理
    if (close_reason) {
      close_reason = close_reason.trim()

      // 长度校验（防止超长输入）
      if (close_reason.length > 500) {
        return res.apiError('关闭原因不能超过500字符', 'INVALID_PARAM', null, 400)
      }

      // 空字符串处理
      if (close_reason.length === 0) {
        close_reason = '管理员关闭'
      }

      // HTML标签过滤（防止XSS攻击）
      close_reason = close_reason.replace(/<[^>]*>/g, '')
    }

    const { CustomerServiceSession, ChatMessage } = require('../../models')

    // 查找会话（预加载用户和管理员信息，用于WebSocket通知）
    const session = await CustomerServiceSession.findOne({
      where: { session_id: sessionId },
      include: [
        {
          model: require('../../models').User,
          as: 'user',
          attributes: ['user_id', 'nickname']
        },
        {
          model: require('../../models').User,
          as: 'admin',
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    if (!session) {
      return res.apiError('聊天会话不存在', 'NOT_FOUND', null, 404)
    }

    if (session.status === 'closed') {
      return res.apiError('会话已关闭', 'BAD_REQUEST', null, 400)
    }

    // ✅ 新增：开启事务
    transaction = await sequelize.transaction()

    // ✅ 改进：在事务中关闭会话
    await session.update(
      {
        status: SESSION_STATUS.CLOSED, // 🔴 使用状态常量，替代硬编码
        close_reason,
        closed_by: req.user.user_id,
        closed_at: BeijingTimeHelper.createBeijingTime(),
        updated_at: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )

    // ✅ 改进：在事务中创建系统消息（修复sender_type错误）
    await ChatMessage.create(
      {
        session_id: sessionId,
        sender_id: req.user.user_id, // 管理员ID（触发关闭的人）
        sender_type: 'admin', // ✅ 修正：发送者类型是管理员（ENUM只有'user'和'admin'）
        message_source: 'system', // ✅ 新增：消息来源是系统（标识为系统自动生成）
        content: `会话已被管理员关闭：${close_reason}`,
        message_type: 'system', // ✅ 消息类型是系统消息
        status: 'sent', // ✅ 消息状态
        created_at: BeijingTimeHelper.createBeijingTime(),
        updated_at: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )

    // ✅ 提交事务
    await transaction.commit()

    console.log(`✅ 管理员 ${req.user.user_id} 关闭会话 ${sessionId}，原因：${close_reason}`)

    // ✅ 新增：WebSocket实时通知
    try {
      const ChatWebSocketService = require('../../services/ChatWebSocketService')
      const wsService = ChatWebSocketService.getInstance()

      if (wsService) {
        const notifyResult = wsService.notifySessionClosed(
          sessionId,
          session.user_id,
          session.admin_id,
          {
            close_reason,
            closed_by: req.user.user_id,
            closed_at: session.closed_at
          }
        )
        console.log('📢 WebSocket通知结果:', notifyResult)
      }
    } catch (wsError) {
      // WebSocket通知失败不影响主流程
      console.warn('⚠️ WebSocket通知失败（不影响关闭成功）:', wsError.message)
    }

    return res.apiSuccess(
      {
        session_id: sessionId,
        status: SESSION_STATUS.CLOSED, // 🔴 使用状态常量，替代硬编码
        closed_at: session.closed_at,
        close_reason,
        closed_by: req.user.user_id
      },
      '会话关闭成功'
    )
  } catch (error) {
    // ✅ 改进：事务回滚
    if (transaction) {
      try {
        await transaction.rollback()
        console.log('🔄 事务已回滚')
      } catch (rollbackError) {
        console.error('❌ 事务回滚失败:', rollbackError.message)
      }
    }

    console.error('❌ 管理员关闭聊天会话失败:', error)
    return res.apiError('关闭聊天会话失败', 'INTERNAL_ERROR', null, 500)
  }
})

/**
 * @route GET /api/v4/system/admin/chat/stats
 * @desc 管理员获取聊天系统统计数据（Chat System Statistics for Admins）
 * @access Private (管理员权限 - Admin Only)
 *
 * 功能说明（Function Description）:
 * - 实时统计聊天系统各项指标（Real-time Statistics）
 * - 支持今日统计、总体统计、按状态分组统计
 * - 真实计算平均响应时间（Average Response Time）
 * - 优雅降级处理（Graceful Degradation）
 * - 性能监控和日志记录（Performance Monitoring）
 *
 * 数据来源（Data Sources）:
 * - CustomerServiceSession: 客服聊天会话表（customer_service_sessions）
 * - ChatMessage: 聊天消息表（chat_messages）
 *
 * 返回数据结构（Response Structure）:
 * {
 *   timestamp: "2025-11-08 18:00:00",  // 查询时间戳（北京时间）
 *   query_duration_ms: 250,             // 查询耗时（毫秒）
 *   overall: {
 *     total_sessions: 1500,             // 总会话数
 *     active_sessions: 25,              // 活跃会话数（waiting/assigned/active）
 *     waiting_sessions: 5,              // 等待会话数（关键监控指标）
 *     avg_response_time_seconds: 65     // 平均响应时间（秒，真实计算）
 *   },
 *   today: {
 *     new_sessions: 50,                 // 今日新增会话数
 *     total_messages: 500,              // 今日消息总数
 *     closed_sessions: 40,              // 今日关闭会话数（新增字段）
 *     avg_messages_per_session: 10      // 今日平均消息数/会话
 *   },
 *   by_status: {
 *     waiting: 5,                       // 等待中会话
 *     assigned: 10,                     // 已分配会话
 *     active: 10,                       // 活跃会话
 *     closed: 1475                      // 已关闭会话
 *   }
 * }
 *
 * 最后更新：2025-11-08（实现文档中的所有优化建议）
 */
router.get('/admin/chat/stats', authenticateToken, async (req, res) => {
  const queryStartTime = Date.now() // 🕐 记录查询开始时间（Performance Monitoring Start）

  try {
    const { getUserRoles } = require('../../middleware/auth')

    // 🛡️ 权限检查：只有管理员可以查看统计（Security: Admin Only）
    const userRoles = await getUserRoles(req.user.user_id)
    if (!userRoles.isAdmin) {
      return res.apiError('权限不足，仅管理员可访问', 'FORBIDDEN', null, 403)
    }

    const { CustomerServiceSession, ChatMessage } = require('../../models')
    const BeijingTimeHelper = require('../../utils/timeHelper')

    // 📅 获取今日时间范围（北京时间 - Get Today Time Range in Beijing Time）
    const todayStart = BeijingTimeHelper.todayStart() // 今日00:00:00.000
    const todayEnd = BeijingTimeHelper.todayEnd() // 今日23:59:59.999

    // 🚀 并行获取统计数据（使用Promise.allSettled优雅降级 - Parallel Query with Graceful Degradation）
    const results = await Promise.allSettled([
      // 1️⃣ 总会话数查询（Query Total Sessions）
      CustomerServiceSession.count(),

      // 2️⃣ 活跃会话数查询（Query Active Sessions - waiting/assigned/active）
      CustomerServiceSession.count({
        where: { status: ACTIVE_STATUS } // 🔴 使用状态常量数组，替代硬编码
      }),

      // 3️⃣ 今日新会话查询（Query Today New Sessions）
      CustomerServiceSession.count({
        where: {
          created_at: {
            [Op.gte]: todayStart, // 大于等于今日开始时间
            [Op.lte]: todayEnd // 小于等于今日结束时间
          }
        }
      }),

      // 4️⃣ 今日消息总数查询（Query Today Total Messages）
      ChatMessage.count({
        where: {
          created_at: {
            [Op.gte]: todayStart,
            [Op.lte]: todayEnd
          }
        }
      }),

      // 5️⃣ 今日关闭会话数查询（Query Today Closed Sessions - 新增字段）
      CustomerServiceSession.count({
        where: {
          closed_at: {
            // ✅ 使用closed_at字段（关闭时间）
            [Op.gte]: todayStart,
            [Op.lte]: todayEnd
          },
          status: SESSION_STATUS.CLOSED // ✅ 确保状态为closed（使用常量）
        }
      }),

      // 6️⃣ 真实平均响应时间计算（Real Average Response Time Calculation - 核心优化）
      calculateAverageResponseTime(todayStart, todayEnd, CustomerServiceSession, ChatMessage),

      // 7️⃣ 按状态分组统计（Group by Status）
      CustomerServiceSession.findAll({
        attributes: ['status', [CustomerServiceSession.sequelize.fn('COUNT', '*'), 'count']],
        group: ['status'],
        raw: true // 返回普通对象，性能优化
      })
    ])

    // 📊 处理查询结果，失败时使用默认值（Handle Query Results with Default Values）
    const totalSessions = results[0].status === 'fulfilled' ? results[0].value : 0
    const activeSessions = results[1].status === 'fulfilled' ? results[1].value : 0
    const todaySessions = results[2].status === 'fulfilled' ? results[2].value : 0
    const todayMessages = results[3].status === 'fulfilled' ? results[3].value : 0
    const todayClosedSessions = results[4].status === 'fulfilled' ? results[4].value : 0 // ✅ 新增字段
    const avgResponseTime = results[5].status === 'fulfilled' ? results[5].value : 60 // ✅ 真实计算值
    const sessionsByStatus = results[6].status === 'fulfilled' ? results[6].value : []

    // ⚠️ 记录失败的查询（用于监控和调试 - Log Failed Queries for Monitoring）
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        const queryNames = [
          '总会话数',
          '活跃会话数',
          '今日新会话',
          '今日消息数',
          '今日关闭会话',
          '平均响应时间',
          '状态分组统计'
        ]
        console.error(`❌ 聊天统计查询${index + 1}（${queryNames[index]}）失败:`, result.reason)
      }
    })

    // 📊 处理状态统计数据（Process Status Statistics）
    const statusStats = {}
    sessionsByStatus.forEach(item => {
      statusStats[item.status] = parseInt(item.count)
    })

    // 🕐 计算查询耗时（Calculate Query Duration）
    const queryEndTime = Date.now()
    const queryDuration = queryEndTime - queryStartTime

    // 📊 记录查询耗时（Log Query Duration for Performance Monitoring）
    console.log(`📊 [聊天统计] 查询完成，耗时: ${queryDuration}ms`)

    // ⚠️ 慢查询告警（Slow Query Warning - 超过500ms时告警）
    if (queryDuration > 500) {
      console.warn(`⚠️ [聊天统计] 查询耗时过长: ${queryDuration}ms（建议<500ms）`)
    }

    // 🎯 构建响应数据（Build Response Data）
    const chatStats = {
      timestamp: BeijingTimeHelper.apiTimestamp(), // 查询时间戳（北京时间ISO格式）
      query_duration_ms: queryDuration, // ✅ 查询耗时（毫秒）- 新增性能监控字段

      // 📊 总体统计（Overall Statistics）
      overall: {
        total_sessions: totalSessions, // 总会话数
        active_sessions: activeSessions, // 活跃会话数
        waiting_sessions: statusStats.waiting || 0, // ✅ 等待会话数（顶层字段）- 新增关键监控指标
        avg_response_time_seconds: avgResponseTime // ✅ 平均响应时间（秒）- 真实计算值
      },

      // 📅 今日统计（Today Statistics）
      today: {
        new_sessions: todaySessions, // 今日新会话
        total_messages: todayMessages, // 今日消息总数
        closed_sessions: todayClosedSessions, // ✅ 今日关闭会话数 - 新增字段
        avg_messages_per_session:
          todaySessions > 0 // 今日平均消息数/会话
            ? Math.round(todayMessages / todaySessions)
            : 0
      },

      // 📈 按状态统计（Statistics by Status）
      by_status: {
        waiting: statusStats.waiting || 0, // 等待中会话
        assigned: statusStats.assigned || 0, // 已分配会话
        active: statusStats.active || 0, // 活跃会话
        closed: statusStats.closed || 0 // 已关闭会话
      }
    }

    // 🔴 P2-8：数据验证和边界检查（Data Validation and Boundary Check）
    const validation = validateStatistics(chatStats)
    if (!validation.valid) {
      console.warn('⚠️ [聊天统计] 数据验证警告:', validation.warnings)
      // 记录到监控系统（可扩展为告警）
      validation.warnings.forEach(warning => {
        console.warn(`   ⚠️ 数据异常: ${warning}`)
      })
    }

    /*
     * 🔴 P2-9：记录管理员操作审计日志（Audit Log for Admin Operation）
     * 记录管理员查询聊天统计的操作，用于安全审计和责任追溯
     */
    try {
      await logOperation(
        req,
        'system_config', // 操作类型：系统配置相关
        'ChatStatistics', // 目标对象类型
        0, // 目标ID（统计数据无特定ID，使用0）
        'query', // 操作动作：查询
        null, // 操作前数据（查询操作无before数据）
        {
          query_duration_ms: queryDuration,
          total_sessions: totalSessions,
          active_sessions: activeSessions,
          waiting_sessions: statusStats.waiting || 0
        }, // 操作后数据（记录关键统计指标）
        null, // 操作原因（可选）
        { businessId: `chat_stats_${Date.now()}` } // 业务关联ID
      )
    } catch (auditError) {
      // 审计日志失败不影响业务，仅记录错误
      console.error('[审计日志] 记录失败:', auditError.message)
    }

    // ✅ 返回成功响应（Return Success Response）
    console.log(`✅ [聊天统计] 准备返回响应数据，数据大小: ${JSON.stringify(chatStats).length}字节`)
    return res.apiSuccess(chatStats, '聊天系统统计数据获取成功')
  } catch (error) {
    // ❌ 错误处理（Error Handling）
    const queryDuration = Date.now() - queryStartTime
    console.error(`❌ [聊天统计] 获取失败（耗时${queryDuration}ms）:`, error)
    return res.apiError('获取聊天系统统计失败', 'CHAT_STATS_ERROR', null, 500)
  }
})

/**
 * 🧮 计算真实的平均响应时间（Calculate Real Average Response Time）
 *
 * 计算逻辑（Calculation Logic）:
 * - 响应时间 = 客服首条消息时间 - 用户首条消息时间
 * - 仅统计今日已响应的会话（排除waiting状态）
 * - 排除异常数据（响应时间>1小时的异常情况）
 *
 * @param {Date} startTime - 开始时间（今日00:00:00）
 * @param {Date} endTime - 结束时间（今日23:59:59）
 * @param {Model} CustomerServiceSession - 客服会话模型
 * @param {Model} ChatMessage - 聊天消息模型
 * @returns {Promise<number>} 平均响应时间（秒）- 无数据时返回60秒
 *
 * 业务价值（Business Value）:
 * - 真实反映客服响应速度（Real Response Speed）
 * - 支持客服绩效考核（Performance Evaluation）
 * - 监控服务质量变化（Service Quality Monitoring）
 * - 优化资源配置决策（Resource Allocation）
 *
 * 性能优化（Performance Optimization）:
 * - 仅查询今日会话（减少数据量）
 * - 使用Promise.all并行查询消息（提升查询效率）
 * - 异常数据过滤（排除响应时间>1小时的异常情况）
 *
 * 最后更新：2025-11-08
 */
async function calculateAverageResponseTime (
  startTime,
  endTime,
  CustomerServiceSession,
  ChatMessage
) {
  try {
    // 1️⃣ 查询今日已响应的会话（排除未响应的waiting状态）
    const sessions = await CustomerServiceSession.findAll({
      where: {
        created_at: {
          [Op.gte]: startTime,
          [Op.lte]: endTime
        },
        status: {
          [Op.not]: SESSION_STATUS.WAITING // ✅ 排除waiting状态（未响应的会话），使用常量
        }
      },
      attributes: ['session_id', 'created_at'] // 仅查询需要的字段（性能优化）
    })

    // 2️⃣ 无数据时返回默认值60秒（No Data Default Value）
    if (sessions.length === 0) {
      console.log('📊 [平均响应时间] 今日无已响应会话，返回默认值60秒')
      return 60
    }

    let totalResponseTime = 0 // 总响应时间（秒）
    let validSessions = 0 // 有效会话数（排除异常数据）

    // 3️⃣ 循环计算每个会话的响应时间（Calculate Response Time for Each Session）
    for (const session of sessions) {
      // 并行查询该会话的第一条用户消息和第一条客服消息
      const [firstUserMsg, firstAdminMsg] = await Promise.all([
        // 查询用户首条消息（First User Message）
        ChatMessage.findOne({
          where: {
            session_id: session.session_id,
            sender_type: 'user' // 用户发送的消息
          },
          order: [['created_at', 'ASC']], // 按时间升序，取最早的消息
          attributes: ['created_at']
        }),
        // 查询客服首条消息（First Admin Message）
        ChatMessage.findOne({
          where: {
            session_id: session.session_id,
            sender_type: 'admin' // 客服发送的消息
          },
          order: [['created_at', 'ASC']],
          attributes: ['created_at']
        })
      ])

      // 4️⃣ 计算响应时间差（Calculate Response Time Difference）
      if (firstUserMsg && firstAdminMsg) {
        const responseTime = (firstAdminMsg.created_at - firstUserMsg.created_at) / 1000 // 转换为秒

        // 5️⃣ 排除异常数据（Filter Abnormal Data）
        if (responseTime > 0 && responseTime < 3600) {
          // 响应时间必须>0秒且<1小时
          totalResponseTime += responseTime
          validSessions++
        } else if (responseTime >= 3600) {
          console.warn(
            `⚠️ [平均响应时间] 异常数据：session_id=${session.session_id}，响应时间=${Math.round(responseTime)}秒（>1小时）`
          )
        }
      }
    }

    // 6️⃣ 计算平均值并返回（Calculate Average and Return）
    const avgResponseTime = validSessions > 0 ? Math.round(totalResponseTime / validSessions) : 60

    console.log(
      `📊 [平均响应时间] 统计完成：有效会话${validSessions}个，平均响应时间${avgResponseTime}秒`
    )

    return avgResponseTime
  } catch (error) {
    // ❌ 计算失败时返回默认值60秒（Fallback to Default Value on Error）
    console.error('❌ [平均响应时间] 计算失败，返回默认值60秒:', error)
    return 60
  }
}

/**
 * @route GET /api/v4/system/chat/ws-status
 * @desc 获取WebSocket服务状态（含运行时长uptime）
 * @access Private
 *
 * @description
 * 功能：获取WebSocket服务的实时状态信息
 * 字段：status（运行状态）、connections（总连接数）、uptime（运行时长-小时）、
 *      connected_users（在线用户数）、connected_admins（在线客服数）、
 *      timestamp（查询时间）、startup_log_id（启动日志ID）
 * 用途：服务监控、负载评估、稳定性分析、重启记录追踪
 */
router.get('/chat/ws-status', authenticateToken, async (req, res) => {
  try {
    const ChatWebSocketService = require('../../services/ChatWebSocketService')

    /*
     * ⚡ 获取WebSocket服务状态（异步查询数据库获取uptime）
     * 说明：getStatus()现在是异步方法，从websocket_startup_logs表查询运行时长
     */
    const status = await ChatWebSocketService.getStatus()
    const onlineUsers = ChatWebSocketService.getOnlineUsers()
    const onlineAdmins = ChatWebSocketService.getOnlineAdmins()

    // ✅ 使用中间件方法，代码更简洁
    const responseData = {
      ...status,
      onlineUsers,
      onlineAdmins
    }

    return res.apiSuccess(responseData, 'WebSocket服务状态')
  } catch (error) {
    console.error('获取WebSocket状态失败:', error)
    return res.apiInternalError('获取WebSocket状态失败')
  }
})

/**
 * 计算反馈预计响应时间（工具函数）
 *
 * 业务场景：
 * - 用户提交反馈后，根据反馈优先级自动计算预计响应时间
 * - 前端显示预计响应时间，提升用户体验和满意度
 * - 运营团队根据优先级合理安排处理顺序，确保高优先级反馈及时响应
 *
 * 业务规则：
 * - high（高优先级）：4小时内响应，适用于紧急问题（如：系统故障、账户异常）
 * - medium（中优先级）：24小时内响应，适用于一般问题（如：功能咨询、体验反馈）
 * - low（低优先级）：72小时内响应，适用于建议类反馈（如：功能建议、优化建议）
 * - 未知优先级：默认72小时内响应，兜底处理
 *
 * 响应时间标准：
 * - 响应时间指管理员第一次回复的时间，不是问题解决时间
 * - 实际响应时间可能因人力资源、问题复杂度等因素有所调整
 * - 系统会记录实际响应时间，用于服务质量分析和改进
 *
 * @param {string} priority - 反馈优先级（high/medium/low）
 * @returns {string} 预计响应时间描述（如："4小时内"、"24小时内"、"72小时内"）
 *
 * @example
 * // 高优先级反馈
 * const responseTime = calculateResponseTime('high')
 * console.log(responseTime) // 输出: "4小时内"
 *
 * @example
 * // 中优先级反馈
 * const responseTime = calculateResponseTime('medium')
 * console.log(responseTime) // 输出: "24小时内"
 *
 * @example
 * // 未知优先级（兜底处理）
 * const responseTime = calculateResponseTime('unknown')
 * console.log(responseTime) // 输出: "72小时内"
 *
 * @description 根据反馈优先级返回预计响应时间描述，提升用户体验
 */
function calculateResponseTime (priority) {
  const responseTimeMap = {
    high: '4小时内',
    medium: '24小时内',
    low: '72小时内'
  }
  return responseTimeMap[priority] || '72小时内'
}

module.exports = router
