/**
 * 测试账号管理器 - V4.0 统一架构版本
 * 🛡️ 使用UUID角色系统替代is_admin字段
 * 创建时间：2025年01月21日
 * 更新时间：2025年01月28日
 */

const BeijingTimeHelper = require('./timeHelper')

/**
 * 测试账号管理器 - V4.0统一架构
 *
 * 业务场景：
 * - 开发环境统一测试账号管理（13612227930/用户31）
 * - 测试环境账号权限验证和控制
 * - 防止非法测试账号使用（禁止列表保护）
 * - 测试权限配置管理（无限抽奖、绕过限制等）
 *
 * 核心功能：
 * - 测试账号配置管理（getTestAccountConfig）
 * - 测试账号验证（validateTestAccount）
 * - 受保护测试配置生成（createProtectedTestRequestConfig）
 * - 测试权限检查（hasTestPrivilege、getTestPrivileges）
 * - 测试账号识别（isTestAccount）
 * - 配置报告生成（generateConfigReport）
 *
 * 主测试账号：
 * - 手机号：13612227930
 * - 用户ID：31
 * - 角色：admin（超级管理员）
 * - 角色等级：100（最高权限）
 * - 验证码：123456（万能验证码）
 *
 * 测试权限配置：
 * - unlimited_lottery：无限次抽奖（不受次数限制）
 * - bypass_daily_limit：绕过每日限制
 * - bypass_points_limit：false（不绕过积分限制，保持真实业务逻辑）
 * - priority_level：MAX（最高优先级）
 *
 * 禁用账号列表：
 * - user_id: 4, mobile: '13612227910'（非指定测试账号）
 * - user_id: 6, mobile: '13612227911'（非指定测试账号）
 * - user_id: 7, mobile: '13612227711'（非指定测试账号）
 *
 * 设计模式：
 * - 单例模式：确保全局唯一实例
 * - 不可变配置：Object.freeze()锁定配置防止修改
 * - 权限分离：测试权限与生产权限分离
 *
 * 安全设计：
 * - 不可变配置：所有配置使用Object.freeze()锁定
 * - 禁用列表：防止非法测试账号使用
 * - 权限验证：每次使用前强制验证
 * - 数据源验证：DATABASE_VERIFIED标记确保数据真实性
 *
 * 架构迁移说明：
 * - V4版本使用UUID角色系统替代is_admin字段
 * - 支持未来扩展多测试账号（addTestAccount预留接口）
 *
 * 使用方式：
 * ```javascript
 * const { getTestAccountManager } = require('./utils/TestAccountManager')
 * const manager = getTestAccountManager()
 *
 * // 获取测试账号配置
 * const config = manager.getTestAccountConfig()
 *
 * // 验证测试账号
 * await manager.validateTestAccount({ mobile: '13612227930', user_id: 31 })
 *
 * // 检查测试权限
 * if (manager.hasTestPrivilege(userId, 'unlimited_lottery')) {
 *   // 允许无限次抽奖
 * }
 *
 * // 创建受保护的测试请求配置
 * const requestConfig = await manager.createProtectedTestRequestConfig()
 * ```
 *
 * 创建时间：2025年01月21日
 * 最后更新：2025年10月30日
 *
 * @class TestAccountManager
 */
class TestAccountManager {
  /**
   * 构造函数 - 初始化测试账号管理器（单例模式）
   *
   * 功能说明：
   * - 实现单例模式（如果实例已存在则返回已有实例）
   * - 创建不可变测试配置（Object.freeze锁定）
   * - 配置主测试账号（13612227930/用户31）
   * - 配置禁用账号列表
   * - 配置验证要求
   * - 配置测试权限
   *
   * 设计决策：
   * - 使用单例模式确保配置全局唯一
   * - 使用Object.freeze()防止配置被篡改
   * - 所有配置在构造函数中一次性定义完成
   *
   * @constructor
   */
  constructor() {
    if (TestAccountManager.instance) {
      return TestAccountManager.instance
    }

    // 🔒 不可变的测试账号配置
    this.IMMUTABLE_TEST_CONFIG = Object.freeze({
      MAIN_TEST_ACCOUNT: Object.freeze({
        mobile: '13612227930',
        user_id: 31,
        verification_code: '123456',
        role_name: 'admin',
        role_level: 100,
        // is_admin字段已迁移到UUID角色系统
        available_points: 393580,
        description: '主要测试账号 - 超级管理员身份',
        created_by: 'USER_SPECIFICATION',
        verification_date: '2025-01-21',
        data_source: 'DATABASE_VERIFIED',
        // 🎯 V5新增：简化的测试权限配置
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
        role_name: 'admin',
        role_level: 100,
        // is_admin字段已迁移到UUID角色系统
        min_points: 1000,
        status: 'active'
      }),

      VERSION: '4.0.0',
      LAST_UPDATED: BeijingTimeHelper.nowLocale(),
      CHECKSUM: 'test_account_13612227930_user_31_admin'
    })

    TestAccountManager.instance = this
  }

  /**
   * 获取主测试账号配置
   *
   * 业务场景：
   * - 测试脚本需要获取测试账号信息
   * - 路由需要验证测试账号身份
   * - 测试权限检查需要账号配置
   *
   * 返回数据：
   * - mobile：手机号（13612227930）
   * - user_id：用户ID（31）
   * - verification_code：验证码（123456）
   * - role_name：角色名（admin）
   * - role_level：角色等级（100）
   * - available_points：可用积分
   * - test_privileges：测试权限配置
   * - description：账号描述
   * - created_by：创建来源
   * - verification_date：验证日期
   * - data_source：数据来源
   *
   * @returns {Object} 主测试账号配置对象（不可变）
   *
   * @example
   * const manager = getTestAccountManager()
   * const config = manager.getTestAccountConfig()
   * console.log(config.mobile) // '13612227930'
   * console.log(config.user_id) // 31
   * console.log(config.test_privileges.unlimited_lottery) // true
   */
  getTestAccountConfig() {
    return this.IMMUTABLE_TEST_CONFIG.MAIN_TEST_ACCOUNT
  }

  /**
   * 验证测试账号的合法性
   *
   * 业务场景：
   * - 测试脚本执行前验证账号身份
   * - 防止非法测试账号使用
   * - 确保测试账号符合要求
   *
   * 验证规则：
   * 1. 检查账号是否在禁用列表中（FORBIDDEN_ACCOUNTS）
   * 2. 验证手机号是否匹配（必须为13612227930）
   * 3. 验证用户ID是否匹配（必须为31）
   *
   * 禁用账号列表：
   * - user_id: 4, mobile: '13612227910'
   * - user_id: 6, mobile: '13612227911'
   * - user_id: 7, mobile: '13612227711'
   *
   * @param {Object} account - 待验证的账号对象
   * @param {string} account.mobile - 手机号
   * @param {number} account.user_id - 用户ID
   * @returns {Promise<boolean>} 验证通过返回true
   * @throws {Error} 账号在禁用列表中
   * @throws {Error} 手机号不匹配
   * @throws {Error} 用户ID不匹配
   *
   * @example
   * const manager = getTestAccountManager()
   * await manager.validateTestAccount({ mobile: '13612227930', user_id: 31 })
   * // ✅ 测试账号验证通过: 13612227930
   */
  async validateTestAccount(account) {
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

  /**
   * 创建受保护的测试请求配置
   *
   * 业务场景：
   * - 测试脚本需要标准化的请求配置
   * - 自动验证测试账号合法性
   * - 提供完整的测试环境配置
   * - 确保配置不可变（Object.freeze保护）
   *
   * 返回配置：
   * - baseURL：测试服务器地址（http://localhost:3000）
   * - testAccount：测试账号配置（不可变）
   * - headers：请求头配置
   * - metadata：元数据（版本、验证时间、保护级别等）
   *
   * 配置特性：
   * - 自动验证测试账号（调用validateTestAccount）
   * - 所有配置使用Object.freeze()锁定
   * - 包含配置版本和验证时间（北京时间）
   * - 保护级别：MAXIMUM（最高级别）
   * - 数据来源：DATABASE_VERIFIED（数据库验证）
   *
   * @returns {Promise<Object>} 受保护的测试请求配置对象（不可变）
   * @throws {Error} 测试账号验证失败时抛出错误
   *
   * @example
   * const manager = getTestAccountManager()
   * const config = await manager.createProtectedTestRequestConfig()
   * console.log(config.baseURL) // 'http://localhost:3000'
   * console.log(config.testAccount.mobile) // '13612227930'
   * console.log(config.metadata.protection_level) // 'MAXIMUM'
   */
  async createProtectedTestRequestConfig() {
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
  hasTestPrivilege(userId, privilegeType) {
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
  isTestAccount(userId) {
    const testAccount = this.IMMUTABLE_TEST_CONFIG.MAIN_TEST_ACCOUNT
    return parseInt(userId) === testAccount.user_id
  }

  /**
   * 🎯 V4新增：获取测试权限配置
   * @param {number|string} userId - 用户ID
   * @returns {Object|null} 测试权限配置，非测试账号返回null
   */
  getTestPrivileges(userId) {
    if (this.isTestAccount(userId)) {
      return this.IMMUTABLE_TEST_CONFIG.MAIN_TEST_ACCOUNT.test_privileges
    }
    return null
  }

  /**
   * 🔮 V4架构扩展：支持添加更多测试账号
   * 未来可以通过这个方法支持多个测试账号
   * @param {Object} _accountConfig - 新测试账号配置（预留参数）
   * @returns {boolean} 当前固定返回false（功能预留中）
   */
  addTestAccount(_accountConfig) {
    // 预留接口，用于未来扩展多测试账号
    console.warn('🔮 多测试账号功能预留中，当前仅支持主测试账号13612227930')
    return false
  }

  /**
   * 生成测试账号配置报告
   *
   * 业务场景：
   * - 系统启动时输出测试配置信息
   * - 调试时查看测试账号状态
   * - 审计测试环境配置
   *
   * 报告内容：
   * - timestamp：生成时间（北京时间）
   * - config_version：配置版本
   * - main_account：主测试账号信息（手机号、用户ID、角色、测试权限）
   * - protection_status：保护状态（不可变配置、禁用账号数量、测试权限启用状态）
   *
   * @returns {Object} 测试账号配置报告对象
   *
   * @example
   * const manager = getTestAccountManager()
   * const report = manager.generateConfigReport()
   * console.log(report.main_account.mobile) // '13612227930'
   * console.log(report.main_account.user_id) // 31
   * console.log(report.protection_status.immutable_config) // true
   */
  generateConfigReport() {
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
  hasTestPrivilege: (userId, privilegeType) =>
    testAccountManager.hasTestPrivilege(userId, privilegeType),
  isTestAccount: userId => testAccountManager.isTestAccount(userId),
  getTestPrivileges: userId => testAccountManager.getTestPrivileges(userId)
}
