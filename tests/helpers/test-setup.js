/**
 * 测试环境配置和工具函数
 * V4版本 - 移除Mock数据，使用真实数据库
 * 创建时间：2025年01月21日
 * 🔴 更新：统一使用生产数据库，移除内存数据库配置，清除所有Mock数据
 */

// 🔧 修复：测试环境变量配置 - 解决环境变量缺失问题
const BeijingTimeHelper = require('../../utils/timeHelper')
require('dotenv').config()

// 🔧 修复：设置必需的环境变量
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-development-only'
// ✅ 测试环境关闭限流（避免 429 干扰业务断言）
process.env.DISABLE_RATE_LIMITER = 'true'

// 🔴 统一数据库配置 - 使用唯一真实数据库 restaurant_points_dev
if (!process.env.DB_HOST) {
  console.log('🔧 设置测试环境数据库配置...')
  process.env.DB_HOST = process.env.DB_HOST || 'dbconn.sealosbja.site'
  // 🔴 统一数据库：测试/开发/生产全部连接唯一真实库 restaurant_points_dev
  process.env.DB_PORT = process.env.DB_PORT || '42569'
  process.env.DB_USER = process.env.DB_USER || 'root'
  process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'mc6r9cgb'
  process.env.DB_NAME = process.env.DB_NAME || 'restaurant_points_dev'
}

// 🔧 设置测试超时时间（仅在jest环境中）
if (typeof jest !== 'undefined') {
  jest.setTimeout(30000)
}

// 🔧 禁用Redis连接（测试环境可选）
process.env.DISABLE_REDIS = 'false' // 启用Redis，因为我们有真实的Redis

/**
 * 测试断言工具
 */
class TestAssertions {
  /**
   * 验证API响应格式 - 符合业务标准（接口规范文档）
   * @param {Object} response - API响应对象
   * @param {boolean} expectSuccess - 是否期望成功响应
   */
  static validateApiResponse(response, expectSuccess = true) {
    // 验证业务标准必需字段
    expect(response).toHaveProperty('success')
    expect(response).toHaveProperty('code')
    expect(response).toHaveProperty('message')
    expect(response).toHaveProperty('data')
    expect(response).toHaveProperty('timestamp')
    expect(response).toHaveProperty('version')
    expect(response).toHaveProperty('request_id')

    // 验证字段类型符合业务标准
    expect(typeof response.success).toBe('boolean')
    expect(typeof response.code).toBe('string') // 业务代码是字符串
    expect(typeof response.message).toBe('string') // 用户友好消息
    expect(typeof response.timestamp).toBe('string')
    expect(typeof response.version).toBe('string')
    expect(typeof response.request_id).toBe('string')

    if (expectSuccess) {
      // 业务成功响应：success = true
      expect(response.success).toBe(true)
      expect(response.data).not.toBeNull()
    } else {
      // 业务失败响应：success = false
      expect(response.success).toBe(false)
      // 错误响应的data可以包含错误详情
      expect(response.data).toBeDefined()
    }
  }

  /**
   * 验证数据库记录
   */
  static validateDatabaseRecord(record, requiredFields = []) {
    expect(record).toBeTruthy()

    requiredFields.forEach(field => {
      expect(record).toHaveProperty(field)
      expect(record[field]).not.toBeNull()
    })
  }

  /**
   * 验证时间戳格式
   */
  static validateTimestamp(timestamp) {
    expect(timestamp).toBeTruthy()
    expect(new Date(timestamp).toString()).not.toBe('Invalid Date')
  }

  /**
   * 🚨 验证业务语义一致性 - 防止测试适配错误实现
   */
  static validateBusinessSemantics(actualValue, businessContext) {
    // 业务语义映射表
    const businessTerminology = {
      // 奖品发放状态
      prize_status: {
        correct: 'distributed', // 业务正确术语
        incorrect: ['completed', 'finished', 'done'], // 技术术语
        message: '奖品状态应使用业务术语 "distributed"（已分发）'
      },
      // 策略名称
      strategy_names: {
        correct: ['BasicGuaranteeStrategy', 'ManagementStrategy'],
        incorrect: ['basic', 'guarantee', 'management'],
        message: '策略名称应使用完整类名，不应降低测试标准'
      }
    }

    const terminology = businessTerminology[businessContext]
    if (!terminology) return

    // 检查是否使用了错误的技术术语
    if (terminology.incorrect.includes(actualValue)) {
      throw new Error(
        `❌ 业务语义错误: ${terminology.message}.\n` +
          `实际值: "${actualValue}"\n` +
          `正确值应该是: ${JSON.stringify(terminology.correct)}`
      )
    }
  }

  /**
   * 🚨 验证测试标准不被降低
   */
  static validateTestStandards(testExpectation, context) {
    const dangerousPatterns = [
      {
        pattern: /basic|guarantee|management/, // 简化的策略名
        context: 'strategy_validation',
        message: '测试标准被降低：应验证完整策略类名而不是简化名称'
      },
      {
        pattern: /undefined.*toBe\(true\)/, // 允许undefined值
        context: 'value_validation',
        message: '危险的测试：允许undefined值可能掩盖实现问题'
      },
      {
        pattern: /completed/, // 技术术语在业务场景中
        context: 'business_status',
        message: '可能使用了技术术语而非业务术语'
      }
    ]

    const testString =
      typeof testExpectation === 'string' ? testExpectation : JSON.stringify(testExpectation)

    dangerousPatterns.forEach(({ pattern, context: patternContext, message }) => {
      if (patternContext === context && pattern.test(testString)) {
        console.warn(`⚠️ 测试质量警告: ${message}`)
        console.warn(`   检查内容: ${testString}`)
        console.warn(`   上下文: ${context}`)
      }
    })
  }

  /**
   * 🚨 验证API响应格式一致性 - 业务标准验证
   */
  static validateApiResponseConsistency(response) {
    // 验证业务标准的API响应格式：{success, code, message, data, timestamp, version, request_id}
    const requiredFields = [
      'success',
      'code',
      'message',
      'data',
      'timestamp',
      'version',
      'request_id'
    ]
    const missingFields = requiredFields.filter(
      field => !Object.prototype.hasOwnProperty.call(response, field)
    )

    if (missingFields.length > 0) {
      throw new Error(`API响应不符合业务标准，缺少字段: ${missingFields.join(', ')}`)
    }

    // 验证业务标准字段类型
    if (typeof response.success !== 'boolean') {
      throw new Error('业务标准错误：success字段必须是boolean类型')
    }

    if (typeof response.code !== 'string') {
      throw new Error('业务标准错误：code字段必须是string类型（业务代码）')
    }

    if (typeof response.message !== 'string') {
      throw new Error('业务标准错误：message字段必须是string类型（用户友好消息）')
    }

    if (typeof response.timestamp !== 'string') {
      throw new Error('业务标准错误：timestamp字段必须是string类型')
    }

    if (typeof response.version !== 'string') {
      throw new Error('业务标准错误：version字段必须是string类型')
    }

    if (typeof response.request_id !== 'string') {
      throw new Error('业务标准错误：request_id字段必须是string类型')
    }

    // 检查是否误用了旧的技术格式
    if (typeof response.code === 'number') {
      console.warn('⚠️ 检测到旧的技术格式：code应该是业务代码（string），不是数字状态码')
    }

    if (Object.prototype.hasOwnProperty.call(response, 'msg')) {
      console.warn('⚠️ 检测到旧的技术格式：应使用message字段，不是msg字段')
    }
  }
}

/**
 * 测试时间工具
 */
class TestTimeHelper {
  static getCurrentBeijingTime() {
    return BeijingTimeHelper.now()
  }

  static isValidTimestamp(timestamp) {
    return !isNaN(Date.parse(timestamp))
  }

  static getTimeDifference(time1, time2) {
    return Math.abs(new Date(time1) - new Date(time2))
  }
}

/**
 * 性能测试工具
 */
class PerformanceHelper {
  static async measureExecutionTime(fn) {
    const start = process.hrtime.bigint()
    const result = await fn()
    const end = process.hrtime.bigint()
    const duration = Number(end - start) / 1000000 // 转换为毫秒

    return { result, duration }
  }

  static validateResponseTime(duration, maxTime = 1000) {
    expect(duration).toBeLessThan(maxTime)
  }
}

/**
 * 测试配置
 */
const TestConfig = {
  // 数据库配置 - 使用真实数据库
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    database: process.env.DB_NAME || 'restaurant_points_dev',
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'test' ? false : console.log
  },

  // 测试超时配置
  defaultTimeout: 30000, // 30秒
  longRunningTimeout: 60000, // 60秒

  // API测试配置
  api: {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    timeout: 10000
  },

  // 真实测试数据配置 - 使用统一的测试账号
  realData: {
    // ✅ 统一测试用户信息 - 使用13612227930测试账号
    testUser: {
      mobile: '13612227930', // 统一测试用户手机号
      user_id: 31 // 统一测试用户ID (需要从数据库确认)
    },

    // ✅ 统一管理员信息 - 同一账号既是用户也是管理员
    adminUser: {
      mobile: '13612227930', // 统一管理员手机号
      user_id: 31 // 统一管理员用户ID (需要从数据库确认)
    },

    // ✅ 测试活动信息 - 使用主体功能文档中的活动
    testCampaign: {
      campaign_id: 2, // 默认测试活动ID (餐厅积分抽奖)
      campaignName: '餐厅积分抽奖活动' // 测试活动名称
    }
  },

  // V4抽奖策略配置验证
  strategyValidation: {
    // 实际存在的策略类（V4架构）
    correct: ['BasicGuaranteeStrategy', 'ManagementStrategy'],
    // 期待的策略数量
    expectedCount: 2
  }
}

/**
 * 🔧 修复测试超时问题 - 清理定时器
 *
 * 问题根因:
 * - ManagementStrategy.js的startCacheCleanup()启动了setInterval
 * - routes/v4/system.js中有多个setInterval定时任务
 * - 这些定时器在测试环境中不会自动清理，导致Jest超时
 *
 * 解决方案:
 * - 在测试环境中mock所有定时器函数
 * - 测试完成后清理所有定时器
 *
 * 创建时间: 2025-11-14
 */
if (typeof jest !== 'undefined') {
  // 保存原始的定时器函数
  const originalSetInterval = global.setInterval
  const originalSetTimeout = global.setTimeout
  const timers = []

  // Mock setInterval - 记录所有定时器
  global.setInterval = function (...args) {
    const timer = originalSetInterval.apply(this, args)
    timers.push({ type: 'interval', timer })
    return timer
  }

  // Mock setTimeout - 记录所有定时器
  global.setTimeout = function (...args) {
    const timer = originalSetTimeout.apply(this, args)
    timers.push({ type: 'timeout', timer })
    return timer
  }

  // 在每个测试套件结束后清理定时器
  afterAll(() => {
    console.log(`🧹 清理${timers.length}个定时器...`)
    timers.forEach(({ type, timer }) => {
      try {
        if (type === 'interval') {
          clearInterval(timer)
        } else {
          clearTimeout(timer)
        }
      } catch (error) {
        // 忽略清理错误
      }
    })
    timers.length = 0

    // 恢复原始函数
    global.setInterval = originalSetInterval
    global.setTimeout = originalSetTimeout
  })

  // 🔧 清理 Redis 连接（避免 open handles 导致 Jest 报告 TCPWRAP）
  afterAll(async () => {
    try {
      const { getRedisClient } = require('../../utils/UnifiedRedisClient')
      const redisClient = getRedisClient()
      if (redisClient && typeof redisClient.disconnect === 'function') {
        await redisClient.disconnect()
      }
    } catch (error) {
      // 忽略清理错误，避免影响测试结果
    }
  })
}

// 导出工具类 - 只保留真实数据工具
module.exports = {
  TestAssertions,
  TestTimeHelper,
  PerformanceHelper,
  TestConfig
}
