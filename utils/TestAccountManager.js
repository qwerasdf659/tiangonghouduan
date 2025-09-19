/**
 * 测试账号统一管理工具 V4
 * 🎯 目标：固定测试账号13612227930，防止被意外修改
 * 🔐 核心：建立不可变的测试配置保护机制
 * 📊 数据驱动：基于真实数据库验证的配置
 * 创建时间：2025年01月21日 北京时间
 */

const { getDatabaseHelper } = require('./UnifiedDatabaseHelper')
const BeijingTimeHelper = require('./timeHelper')

class TestAccountManager {
  constructor () {
    if (TestAccountManager.instance) {
      return TestAccountManager.instance
    }

    this.db = getDatabaseHelper()

    // 🔒 不可变的测试账号配置
    this.IMMUTABLE_TEST_CONFIG = Object.freeze({
      MAIN_TEST_ACCOUNT: Object.freeze({
        mobile: '13612227930',
        user_id: 31,
        verification_code: '123456',
        is_admin: true,
        available_points: 393580,
        description: '主要测试账号 - 用户和管理员双重身份',
        created_by: 'USER_SPECIFICATION',
        verification_date: '2025-01-21',
        data_source: 'DATABASE_VERIFIED',
        // 🎯 V4新增：测试权限配置
        test_privileges: Object.freeze({
          unlimited_lottery: true, // 无限次抽奖
          bypass_daily_limit: true, // 绕过每日限制
          bypass_points_limit: false, // 不绕过积分限制（保持真实业务逻辑）
          priority_level: 'MAX' // 最高优先级
        })
      }),

      FORBIDDEN_ACCOUNTS: Object.freeze([
        Object.freeze({ user_id: 4, mobile: '13612227910', reason: '非指定测试账号' }),
        Object.freeze({ user_id: 6, mobile: '13612227911', reason: '非指定测试账号' }),
        Object.freeze({ user_id: 7, mobile: '13612227711', reason: '非指定测试账号' })
      ]),

      VALIDATION_REQUIREMENTS: Object.freeze({
        mobile: '13612227930',
        user_id: 31,
        is_admin: true,
        min_points: 1000,
        status: 'active'
      }),

      VERSION: '1.0.0',
      LAST_UPDATED: BeijingTimeHelper.nowLocale(),
      CHECKSUM: 'test_account_13612227930_user_31'
    })

    TestAccountManager.instance = this
  }

  getTestAccountConfig () {
    return this.IMMUTABLE_TEST_CONFIG.MAIN_TEST_ACCOUNT
  }

  async validateTestAccount (account) {
    const required = this.IMMUTABLE_TEST_CONFIG.VALIDATION_REQUIREMENTS
    const forbidden = this.IMMUTABLE_TEST_CONFIG.FORBIDDEN_ACCOUNTS

    const forbiddenAccount = forbidden.find(
      fa => fa.mobile === account.mobile || fa.user_id === account.user_id
    )

    if (forbiddenAccount) {
      throw new Error(`🚫 禁止使用测试账号 ${forbiddenAccount.mobile}: ${forbiddenAccount.reason}`)
    }

    if (account.mobile !== required.mobile) {
      throw new Error(`🚫 错误的测试账号: ${account.mobile}，必须使用: ${required.mobile}`)
    }

    if (account.user_id !== required.user_id) {
      throw new Error(`🚫 错误的用户ID: ${account.user_id}，必须使用: ${required.user_id}`)
    }

    console.log('✅ 测试账号验证通过:', account.mobile)
    return true
  }

  async createProtectedTestRequestConfig () {
    const testAccount = this.getTestAccountConfig()
    await this.validateTestAccount(testAccount)

    const protectedConfig = Object.freeze({
      baseURL: 'http://localhost:3000',
      testAccount: Object.freeze({ ...testAccount }),
      headers: Object.freeze({
        'Content-Type': 'application/json'
      }),
      metadata: Object.freeze({
        config_version: this.IMMUTABLE_TEST_CONFIG.VERSION,
        validated_at: BeijingTimeHelper.nowLocale(),
        protection_level: 'MAXIMUM',
        data_source: 'DATABASE_VERIFIED'
      })
    })

    console.log('🛡️ 创建受保护测试配置:')
    console.log(`   📱 手机号: ${protectedConfig.testAccount.mobile}`)
    console.log(`   👤 用户ID: ${protectedConfig.testAccount.user_id}`)
    console.log(`   👨‍💼 管理员: ${protectedConfig.testAccount.is_admin ? '是' : '否'}`)
    console.log(`   💰 积分: ${protectedConfig.testAccount.available_points}`)

    return protectedConfig
  }

  /**
   * 🎯 V4新增：检查用户是否有测试权限
   * @param {number|string} userId - 用户ID
   * @param {string} privilegeType - 权限类型：'unlimited_lottery', 'bypass_daily_limit', 'bypass_points_limit'
   * @returns {boolean} 是否具有指定权限
   */
  hasTestPrivilege (userId, privilegeType) {
    const testAccount = this.IMMUTABLE_TEST_CONFIG.MAIN_TEST_ACCOUNT

    // 检查是否为主测试账号
    if (parseInt(userId) === testAccount.user_id) {
      const privilege = testAccount.test_privileges[privilegeType]
      if (privilege) {
        console.log(`✅ 测试权限验证通过: 用户${userId} 拥有权限 ${privilegeType}`)
        return true
      }
    }

    return false
  }

  /**
   * 🎯 V4新增：检查是否为测试账号
   * @param {number|string} userId - 用户ID
   * @returns {boolean} 是否为测试账号
   */
  isTestAccount (userId) {
    const testAccount = this.IMMUTABLE_TEST_CONFIG.MAIN_TEST_ACCOUNT
    return parseInt(userId) === testAccount.user_id
  }

  /**
   * 🎯 V4新增：获取测试权限配置
   * @param {number|string} userId - 用户ID
   * @returns {object|null} 测试权限配置，非测试账号返回null
   */
  getTestPrivileges (userId) {
    if (this.isTestAccount(userId)) {
      return this.IMMUTABLE_TEST_CONFIG.MAIN_TEST_ACCOUNT.test_privileges
    }
    return null
  }

  /**
   * 🔮 V4架构扩展：支持添加更多测试账号
   * 未来可以通过这个方法支持多个测试账号
   * @param {object} _accountConfig - 新测试账号配置（预留参数）
   */
  addTestAccount (_accountConfig) {
    // 预留接口，用于未来扩展多测试账号
    console.warn('🔮 多测试账号功能预留中，当前仅支持主测试账号13612227930')
    return false
  }

  generateConfigReport () {
    const config = this.IMMUTABLE_TEST_CONFIG
    return {
      timestamp: BeijingTimeHelper.nowLocale(),
      config_version: config.VERSION,
      main_account: {
        mobile: config.MAIN_TEST_ACCOUNT.mobile,
        user_id: config.MAIN_TEST_ACCOUNT.user_id,
        is_admin: config.MAIN_TEST_ACCOUNT.is_admin,
        // 🎯 V4新增：测试权限报告
        test_privileges: config.MAIN_TEST_ACCOUNT.test_privileges
      },
      protection_status: {
        immutable_config: true,
        forbidden_accounts_count: config.FORBIDDEN_ACCOUNTS.length,
        test_privileges_enabled: true
      }
    }
  }
}

// 导出单例实例
const testAccountManager = new TestAccountManager()

module.exports = {
  TestAccountManager,
  getTestAccountManager: () => testAccountManager,
  getTestAccountConfig: () => testAccountManager.getTestAccountConfig(),
  validateTestAccount: account => testAccountManager.validateTestAccount(account),
  createProtectedTestRequestConfig: () => testAccountManager.createProtectedTestRequestConfig(),
  // 🎯 V4新增：测试权限方法导出
  hasTestPrivilege: (userId, privilegeType) => testAccountManager.hasTestPrivilege(userId, privilegeType),
  isTestAccount: userId => testAccountManager.isTestAccount(userId),
  getTestPrivileges: userId => testAccountManager.getTestPrivileges(userId)
}
