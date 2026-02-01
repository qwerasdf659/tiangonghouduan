/**
 * Jest测试环境设置
 * 统一从.env文件加载配置（单一真相源方案 - 2026-01-09更新）
 *
 * 规范说明（docs/Devbox单环境统一配置方案.md）：
 * - .env 是唯一配置真相源，测试环境也必须从 .env 加载
 * - 禁止在此硬编码数据库密码等敏感信息
 * - 测试必须连接真实数据库和Redis（不允许禁用）
 *
 * 🔴 P0-1修复（2026-01-08）：
 * - 添加 initRealTestData() 调用，从数据库动态加载测试数据
 * - 测试数据存储到 global.testData，供所有测试文件使用
 * - 解决硬编码 user_id=31, campaign_id=2 的问题
 *
 * 🔴 P1-9 集成（2026-01-09）：
 * - 初始化 ServiceManager（J2-RepoWide：全仓统一）
 * - 提供 global.getTestService() 方法供测试使用
 * - 确保测试使用与业务代码相同的服务获取方式
 */

// 🔧 2026-01-09：统一从 .env 加载配置（单一真相源）
require('dotenv').config()

// 设置测试环境标识（允许覆盖）
process.env.NODE_ENV = 'test'

/*
 * 🔧 测试环境配置
 * 禁用API限流器，避免并发测试被429干扰
 */
process.env.DISABLE_RATE_LIMITER = 'true'

// 🔧 仅在 .env 未配置时设置测试专用的JWT密钥（非敏感配置）
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-development-only'

/**
 * 🔧 Redis配置：优先使用 .env 中的 REDIS_URL
 * 如果 .env 中未配置，使用本地默认值（开发环境常见配置）
 */
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

// 设置测试超时时间
jest.setTimeout(30000)

// 设置数据库连接参数以避免编码问题
process.env.DB_CHARSET = 'utf8mb4'
process.env.DB_COLLATE = 'utf8mb4_unicode_ci'

// 禁用数据库连接的console.log输出
const originalConsoleLog = console.log
console.log = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Executing (default):')) {
    return // 忽略Sequelize查询日志
  }
  originalConsoleLog.apply(console, args)
}

/**
 * 🔴 P1-9 集成：初始化 ServiceManager
 *
 * 在所有测试开始前，初始化 ServiceManager：
 * - 确保测试使用与业务代码相同的服务获取方式（J2-RepoWide）
 * - 提供 global.getTestService() 方法供测试使用
 * - 使用 snake_case key（E2-Strict）
 */
const {
  initializeTestServiceManager,
  getTestService,
  getTestServiceManager,
  createMockAppServices,
  cleanupTestServiceManager
} = require('./tests/helpers/UnifiedTestManager')

// 🔴 P1-9：将服务获取方法挂载到 global，供所有测试文件使用
global.getTestService = getTestService
global.getTestServiceManager = getTestServiceManager
global.createMockAppServices = createMockAppServices

/**
 * 🔴 P0-1修复 + P1-9集成：全局测试数据和服务初始化
 *
 * 在所有测试开始前：
 * 1. 初始化 ServiceManager（P1-9）
 * 2. 从数据库加载真实测试数据（P0-1）
 *
 * 测试文件可以通过以下方式获取：
 * - global.testData：测试用户和活动数据
 * - global.getTestService('xxx')：通过 ServiceManager 获取服务
 */
global.beforeAll(async () => {
  try {
    // 🔴 P1-9：先初始化 ServiceManager
    await initializeTestServiceManager()
    console.log('✅ [Jest Setup] ServiceManager 初始化完成')

    // 🔴 P0-1：加载真实测试数据
    const { initRealTestData } = require('./tests/helpers/test-setup')
    const testData = await initRealTestData('13612227930')

    // 将测试数据存储到 global 供所有测试使用
    global.testData = {
      // 测试用户（从数据库动态获取）
      testUser: {
        user_id: testData.testUser.user_id,
        mobile: testData.testUser.mobile
      },
      // 管理员用户（同一用户）
      adminUser: {
        user_id: testData.adminUser.user_id,
        mobile: testData.adminUser.mobile
      },
      // 测试活动（从数据库动态获取活跃活动）
      testCampaign: {
        lottery_campaign_id: testData.testCampaign.lottery_campaign_id,
        campaign_name: testData.testCampaign.campaignName
      },
      // 🔴 P0-2新增：测试门店（从数据库动态获取活跃门店）
      testStore: {
        store_id: testData.testStore?.store_id || null,
        store_name: testData.testStore?.store_name || null
      },
      // 标记初始化完成
      _initialized: true
    }

    // 验证关键数据
    if (!global.testData.testUser.user_id) {
      console.warn('⚠️ [Jest Setup] 测试用户未找到，某些测试可能失败')
    }
    if (!global.testData.testCampaign.lottery_campaign_id) {
      console.warn('⚠️ [Jest Setup] 活跃活动未找到，抽奖相关测试可能失败')
    }
    if (!global.testData.testStore.store_id) {
      console.warn('⚠️ [Jest Setup] 活跃门店未找到，门店相关测试可能失败')
    }

    console.log(
      `✅ [Jest Setup] 测试数据初始化完成: user_id=${global.testData.testUser.user_id}, lottery_campaign_id=${global.testData.testCampaign.lottery_campaign_id}, store_id=${global.testData.testStore.store_id}`
    )
  } catch (error) {
    console.error('❌ [Jest Setup] 初始化失败:', error.message)
    // 设置空数据，允许测试继续（某些测试可能不需要这些数据）
    global.testData = {
      testUser: { user_id: null, mobile: '13612227930' },
      adminUser: { user_id: null, mobile: '13612227930' },
      testCampaign: { lottery_campaign_id: null, campaign_name: null },
      testStore: { store_id: null, store_name: null },
      _initialized: false
    }
  }
})

// 全局清理函数
global.afterAll(async () => {
  // 🔴 P1-9：清理 ServiceManager
  try {
    await cleanupTestServiceManager()
    console.log('🔌 [Jest Cleanup] ServiceManager 已关闭')
  } catch (error) {
    console.log('⚠️ [Jest Cleanup] ServiceManager 清理时出现警告（可忽略）:', error.message)
  }

  // 清理 Redis 连接，避免 Jest 卡死
  try {
    const { getRedisClient, isRedisHealthy } = require('./utils/UnifiedRedisClient')
    // 只有在 Redis 健康时才尝试断开
    if (await isRedisHealthy()) {
      const client = await getRedisClient()
      if (client && typeof client.disconnect === 'function') {
        await client.disconnect()
        console.log('🔌 [Jest Cleanup] Redis 客户端已断开')
      }
    }
  } catch (error) {
    // 忽略 Redis 清理错误，不影响测试结果
    console.log('⚠️ [Jest Cleanup] Redis 清理时出现警告（可忽略）:', error.message)
  }

  // 清理数据库连接
  if (global.sequelize) {
    await global.sequelize.close()
  }
})
