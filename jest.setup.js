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

/*
 * 🕐 强制测试进程使用北京时间（Asia/Shanghai），与项目「全链路北京时间」规范及
 * 数据库会话 timezone:'+08:00' 对齐。
 * 根因：devbox 系统 TZ 为 UTC；config/database.js 用 dateStrings:true（返回北京墙钟字符串、无时区后缀），
 * 进程若为 UTC 则 new Date(字符串) 被当作 UTC 解析，时间相差 8 小时。
 * 注意：V8 在进程启动时即缓存时区，运行时改 process.env.TZ 对已缓存的 Date 解析不生效，
 * 因此真正生效点是 package.json 测试脚本里的 `TZ=Asia/Shanghai jest`（进程启动即注入）。
 * 这里再写一次仅为：①让读取 process.env.TZ 的代码拿到正确值；②单独 `node node_modules/.bin/jest`
 * 调试时作为兜底（此时设置发生在首个 Date 之前可生效）。
 */
process.env.TZ = process.env.TZ || 'Asia/Shanghai'

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
    const testData = await initRealTestData('13612227910')

    // 将测试数据存储到 global 供所有测试使用
    global.testData = {
      // 测试用户（从数据库动态获取）
      testUser: {
        user_id: testData.testUser.user_id,
        mobile: testData.testUser.mobile
      },
      // 管理员用户（超级管理员 13612227910，role_level>=100）
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

    /*
     * 🔐 账号角色契约校验（2026-06-14 新增 - 防止角色漂移）
     *
     * 目的：在所有测试开始前，对 TEST_ACCOUNTS 契约表里每个账号查真实库，
     *   断言「真实 role_level >= 契约声明的 expected_role_level」。
     *   一旦库里账号被降级/改角色，立即在 setup 阶段报「账号契约不符」，
     *   而不是在某个业务断言里报莫名的 403，便于快速定位根因。
     *
     * 数据源：真实库 restaurant_points_dev（通过 getUserRoles 实查），不使用 mock。
     */
    try {
      const { TEST_ACCOUNTS } = require('./tests/helpers/test-data')
      const { User } = require('./models')
      const { getUserRoles } = require('./middleware/auth')
      const contractErrors = []

      for (const [roleKey, account] of Object.entries(TEST_ACCOUNTS)) {
        const user = await User.findByMobile(account.mobile)
        if (!user) {
          contractErrors.push(`角色[${roleKey}] 账号 ${account.mobile} 在真实库中不存在`)
          continue
        }
        const roles = await getUserRoles(user.user_id)
        const actualLevel = roles.role_level || 0
        if (actualLevel < account.expected_role_level) {
          contractErrors.push(
            `角色[${roleKey}] 账号 ${account.mobile} 真实 role_level=${actualLevel}，` +
              `低于契约要求 ${account.expected_role_level}（请检查真实库角色分配）`
          )
        }
      }

      if (contractErrors.length > 0) {
        // 契约不符属于环境/数据问题，明确报错指引根因，避免后续测试出现误导性 403
        const err = new Error(
          '账号角色契约校验失败（真实库与 TEST_ACCOUNTS 不符）:\n  - ' +
            contractErrors.join('\n  - ')
        )
        err.isContractError = true // 标记：让外层 catch 识别并穿透，不被降级吞掉
        throw err
      }
      console.log('✅ [Jest Setup] 账号角色契约校验通过（已对齐真实库角色）')
    } catch (contractError) {
      // 契约校验失败直接抛出，让测试运行明确停在根因处
      console.error('❌ [Jest Setup] 账号角色契约校验失败:', contractError.message)
      contractError.isContractError = true
      throw contractError
    }
  } catch (error) {
    // 🔐 账号契约错误必须穿透，不能被降级吞掉（否则会掩盖根因）
    if (error.isContractError) {
      throw error
    }
    console.error('❌ [Jest Setup] 初始化失败:', error.message)
    // 设置空数据，允许测试继续（某些测试可能不需要这些数据）
    global.testData = {
      testUser: { user_id: null, mobile: '13612227910' },
      adminUser: { user_id: null, mobile: '13612227910' },
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
