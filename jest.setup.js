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
 */

// 🔧 2026-01-09：统一从 .env 加载配置（单一真相源）
require('dotenv').config()

// 设置测试环境标识（允许覆盖）
process.env.NODE_ENV = 'test'

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
 * 🔴 P0-1修复：全局测试数据初始化
 *
 * 在所有测试开始前，从数据库加载真实测试数据：
 * - testUser: 通过 mobile='13612227930' 查询用户真实 user_id
 * - testCampaign: 查询 status='active' 的活跃活动
 *
 * 测试文件可以通过 global.testData 获取这些数据
 */
global.beforeAll(async () => {
  try {
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
        campaign_id: testData.testCampaign.campaign_id,
        campaign_name: testData.testCampaign.campaignName
      },
      // 标记初始化完成
      _initialized: true
    }

    // 验证关键数据
    if (!global.testData.testUser.user_id) {
      console.warn('⚠️ [Jest Setup] 测试用户未找到，某些测试可能失败')
    }
    if (!global.testData.testCampaign.campaign_id) {
      console.warn('⚠️ [Jest Setup] 活跃活动未找到，抽奖相关测试可能失败')
    }

    console.log(
      `✅ [Jest Setup] 测试数据初始化完成: user_id=${global.testData.testUser.user_id}, campaign_id=${global.testData.testCampaign.campaign_id}`
    )
  } catch (error) {
    console.error('❌ [Jest Setup] 测试数据初始化失败:', error.message)
    // 设置空数据，允许测试继续（某些测试可能不需要这些数据）
    global.testData = {
      testUser: { user_id: null, mobile: '13612227930' },
      adminUser: { user_id: null, mobile: '13612227930' },
      testCampaign: { campaign_id: null, campaign_name: null },
      _initialized: false
    }
  }
})

// 全局清理函数
global.afterAll(async () => {
  // 清理数据库连接
  if (global.sequelize) {
    await global.sequelize.close()
  }
})
