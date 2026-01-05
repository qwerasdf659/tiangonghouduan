/**
 * 餐厅积分抽奖系统 - SystemSettings 白名单与准入规则
 *
 * @description 所有允许进 system_settings 的 key 必须在此注册
 * @version 1.0.0
 * @created 2025-12-30
 *
 * 业务决策（2025-12-30）：
 * - 7 个关键参数保留在 DB，运营可调
 * - 所有配置均不需要双人审核，运营主管可直接修改
 * - 通过审计日志事后追溯
 * - 范围约束是硬性防护，超出范围直接拒绝
 *
 * 参考文档：docs/配置管理三层分离与校验统一方案.md
 */

/**
 * SystemSettings 白名单定义
 *
 * 字段说明：
 * - type: 值类型（'string' | 'number' | 'boolean'）
 * - min/max: 数字类型的范围限制
 * - step: 数字类型的精度限制
 * - minLength/maxLength: 字符串类型的长度限制
 * - pattern: 字符串类型的格式正则
 * - default: 默认值
 * - readonly: 是否只读（true 表示只有系统可以修改）
 * - description: 配置项描述
 * - changeRequiresRestart: 修改后是否需要重启服务
 * - businessImpact: 业务影响级别（'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'）
 * - auditRequired: 是否强制审计（记录谁改的、改前改后值、改动原因）
 * - approvalRequired: 是否需要审批（业务决策 2025-12-30：无需审批）
 * - conflict: 配置冲突说明和解决方案
 */
const SYSTEM_SETTINGS_WHITELIST = {
  // ===== 基础设置（展示类，适合 DB）=====
  'basic/system_name': {
    type: 'string',
    minLength: 2,
    maxLength: 50,
    default: '餐厅积分抽奖系统',
    readonly: false,
    description: '系统名称（显示在前端页面标题）',
    changeRequiresRestart: false,
    businessImpact: 'LOW'
  },

  'basic/system_version': {
    type: 'string',
    pattern: /^\d+\.\d+\.\d+$/,
    default: '4.0.0',
    readonly: true, // 只读，仅系统更新时自动修改
    description: '系统版本号',
    changeRequiresRestart: false,
    businessImpact: 'LOW'
  },

  'basic/customer_email': {
    type: 'string',
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    default: 'support@example.com',
    readonly: false,
    description: '客服邮箱',
    changeRequiresRestart: false,
    businessImpact: 'LOW'
  },

  'basic/customer_phone': {
    type: 'string',
    pattern: /^[\d-]+$/,
    default: '400-000-0000',
    readonly: false,
    description: '客服电话',
    changeRequiresRestart: false,
    businessImpact: 'LOW'
  },

  // ===== 积分设置（运营策略）=====
  'points/points_expire_days': {
    type: 'number',
    min: 0,
    max: 3650, // 最长 10 年
    default: 0, // 0 表示永久有效
    readonly: false,
    description: '积分有效期（天数，0表示永久有效）',
    changeRequiresRestart: false,
    businessImpact: 'MEDIUM'
  },

  'points/initial_points': {
    type: 'number',
    min: 0,
    max: 10000,
    default: 200,
    readonly: false,
    description: '新用户初始积分',
    changeRequiresRestart: false,
    businessImpact: 'MEDIUM',
    auditRequired: true
  },

  'points/sign_in_points': {
    type: 'number',
    min: 0,
    max: 1000,
    default: 20,
    readonly: false,
    description: '每日签到积分',
    changeRequiresRestart: false,
    businessImpact: 'MEDIUM',
    auditRequired: true
  },

  // ===== 运营可调的关键参数（需强约束）=====
  'points/lottery_cost_points': {
    type: 'number',
    min: 50, // ✅ 业务决策确认：最低 50 积分（防止过低导致刷量）
    max: 500, // ✅ 业务决策确认：最高 500 积分（防止过高影响用户体验）
    default: 100,
    readonly: false, // ✅ 业务决策：运营可调（用于活动/促销）
    description: '单次抽奖消耗积分（运营可调，用于活动定价）',
    changeRequiresRestart: false,
    businessImpact: 'HIGH',
    auditRequired: true, // ✅ 强制审计：记录谁改的、改前改后值、改动原因
    approvalRequired: false // ✅ 业务决策：无需审批，运营主管可直接修改
    // 代码配置已删除：config/business.config.js 中不再包含 single_draw，统一使用 DB 配置
  },

  'points/budget_allocation_ratio': {
    type: 'number',
    min: 0.1, // ✅ 业务决策：最低 10%（防止预算过低）
    max: 0.5, // ✅ 业务决策：最高 50%（防止预算过高导致亏损）
    step: 0.01, // 精度：0.01（即 1%）
    default: 0.24,
    readonly: false, // ✅ 业务决策：运营可调（用于动态调整预算策略）
    description: '预算分配系数（消费金额×该系数=预算积分）',
    changeRequiresRestart: false,
    businessImpact: 'CRITICAL',
    auditRequired: true, // ✅ 强制审计
    approvalRequired: false // ✅ 业务决策：无需审批，运营主管可直接修改
  },

  'points/daily_lottery_limit': {
    type: 'number',
    min: 10, // ✅ 业务决策：最低 10 次（防止过低）
    max: 200, // ✅ 业务决策：最高 200 次（防止刷量）
    default: 50,
    readonly: false, // ✅ 业务决策：运营可调（活动期临时调整）
    description: '每日抽奖次数上限（运营可调，用于活动调整）',
    changeRequiresRestart: false,
    businessImpact: 'HIGH',
    auditRequired: true,
    approvalRequired: false
    // 代码配置已删除：config/business.config.js 中不再包含 daily_limit.all，统一使用 DB 配置
  },

  // ===== 市场设置（运营可调）=====
  'marketplace/max_active_listings': {
    type: 'number',
    min: 1, // ✅ 业务决策：最低 1 件
    max: 50, // ✅ 业务决策：最高 50 件
    default: 10,
    readonly: false, // ✅ 业务决策：运营可调（业务规则灵活调整）
    description: '用户最多同时上架商品数（运营可调）',
    changeRequiresRestart: false,
    businessImpact: 'MEDIUM',
    auditRequired: true,
    approvalRequired: false
    // 代码配置已删除：config/marketplace.config.js 中不再包含 max_active_listings，统一使用 DB 配置
  },

  // ===== 安全设置（运营可调）=====
  'security/max_login_attempts': {
    type: 'number',
    min: 3, // ✅ 业务决策：最低 3 次
    max: 10, // ✅ 业务决策：最高 10 次
    default: 5,
    readonly: false, // ✅ 业务决策：运营可调（安全策略灵活调整）
    description: '最大登录失败次数（运营可调）',
    changeRequiresRestart: false,
    businessImpact: 'HIGH',
    auditRequired: true,
    approvalRequired: false
  },

  'security/lockout_duration': {
    type: 'number',
    min: 5,
    max: 1440, // 最长 24 小时
    default: 30,
    readonly: false,
    description: '账户锁定时长（分钟）',
    changeRequiresRestart: false,
    businessImpact: 'MEDIUM',
    auditRequired: true,
    approvalRequired: false
  },

  'security/password_min_length': {
    type: 'number',
    min: 6, // ✅ 业务决策：最低 6 字符
    max: 32, // ✅ 业务决策：最高 32 字符
    default: 8,
    readonly: false, // ✅ 业务决策：运营可调（安全策略灵活调整）
    description: '密码最小长度（运营可调）',
    changeRequiresRestart: false,
    businessImpact: 'HIGH',
    auditRequired: true,
    approvalRequired: false
  },

  'security/api_rate_limit': {
    type: 'number',
    min: 10, // ✅ 业务决策：最低 10 次/分钟
    max: 1000, // ✅ 业务决策：最高 1000 次/分钟
    default: 100,
    readonly: false, // ✅ 业务决策：运营可调（风控策略灵活调整）
    description: 'API 请求频率限制（每分钟，运营可调）',
    changeRequiresRestart: false,
    businessImpact: 'HIGH',
    auditRequired: true,
    approvalRequired: false
  },

  // ===== 通知设置（开关类，适合 DB）=====
  'notification/sms_enabled': {
    type: 'boolean',
    default: true,
    readonly: false,
    description: '是否启用短信通知',
    changeRequiresRestart: false,
    businessImpact: 'LOW'
  },

  'notification/email_enabled': {
    type: 'boolean',
    default: true,
    readonly: false,
    description: '是否启用邮件通知',
    changeRequiresRestart: false,
    businessImpact: 'LOW'
  },

  'notification/app_notification_enabled': {
    type: 'boolean',
    default: true,
    readonly: false,
    description: '是否启用 APP 内通知',
    changeRequiresRestart: false,
    businessImpact: 'LOW'
  }
}

/**
 * 禁止进 DB 的配置黑名单
 *
 * 这些配置绝对不允许存储在数据库中：
 * - 密钥/密码类配置
 * - 基础设施连接信息
 * - 结算核心参数（手续费率等）
 */
const FORBIDDEN_IN_DB = {
  patterns: [
    /.*_SECRET$/, // 任何以 _SECRET 结尾的
    /.*_PASSWORD$/, // 任何以 _PASSWORD 结尾的
    /.*_KEY$/, // 任何以 _KEY 结尾的（除非明确白名单）
    /^DB_/, // 数据库连接信息
    /^REDIS_/, // Redis 连接信息
    /^JWT_/, // JWT 密钥
    /^SEALOS_/, // 对象存储密钥
    /^WX_/ // 微信密钥
  ],

  keywords: [
    'transaction', // 事务相关
    'pool', // 连接池相关
    'timeout', // 超时配置（技术参数）
    'fee_strategy', // 手续费策略（结算参数）
    'charge_target', // 收费对象（结算参数）
    'fee_rate' // 手续费率（结算参数）
  ],

  exactMatch: [
    'price_validation.min_ratio', // 风控参数
    'price_validation.max_ratio', // 风控参数
    'enforce_transaction' // 事务强制开关
  ]
}

/**
 * 验证配置项是否在白名单内
 *
 * @param {string} settingKey - 配置项键名（格式：category/setting_key）
 * @returns {Object|null} 返回白名单定义或 null（不在白名单内）
 *
 * @example
 * const whitelist = getWhitelist('points/lottery_cost_points')
 * if (!whitelist) {
 *   throw new Error('配置项不在白名单内')
 * }
 */
function getWhitelist (settingKey) {
  return SYSTEM_SETTINGS_WHITELIST[settingKey] || null
}

/**
 * 检查配置项是否在黑名单内
 *
 * @param {string} settingKey - 配置项键名
 * @returns {boolean} 是否在黑名单内
 *
 * @example
 * if (isForbidden('JWT_SECRET')) {
 *   throw new Error('该配置禁止存储在数据库')
 * }
 */
function isForbidden (settingKey) {
  // 检查精确匹配
  if (FORBIDDEN_IN_DB.exactMatch.includes(settingKey)) {
    return true
  }

  // 检查正则模式
  for (const pattern of FORBIDDEN_IN_DB.patterns) {
    if (pattern.test(settingKey)) {
      return true
    }
  }

  // 检查关键词
  const lowerKey = settingKey.toLowerCase()
  for (const keyword of FORBIDDEN_IN_DB.keywords) {
    if (lowerKey.includes(keyword)) {
      return true
    }
  }

  return false
}

/**
 * 校验配置值是否合规
 *
 * @param {string} settingKey - 配置项键名（格式：category/setting_key）
 * @param {any} value - 要校验的值
 * @returns {Object} { valid: boolean, error: string|null }
 *
 * @example
 * const result = validateSettingValue('points/lottery_cost_points', 100)
 * if (!result.valid) {
 *   throw new Error(result.error)
 * }
 */
function validateSettingValue (settingKey, value) {
  const whitelist = getWhitelist(settingKey)

  if (!whitelist) {
    return { valid: false, error: `配置项 ${settingKey} 不在白名单内，禁止修改` }
  }

  if (whitelist.readonly) {
    return { valid: false, error: `配置项 ${settingKey} 为只读，禁止修改` }
  }

  // 类型校验
  if (whitelist.type === 'number') {
    const num = Number(value)
    if (isNaN(num)) {
      return { valid: false, error: `${settingKey} 必须是数字` }
    }
    if (whitelist.min !== undefined && num < whitelist.min) {
      return { valid: false, error: `${settingKey} 不能小于 ${whitelist.min}（当前值: ${num}）` }
    }
    if (whitelist.max !== undefined && num > whitelist.max) {
      return { valid: false, error: `${settingKey} 不能大于 ${whitelist.max}（当前值: ${num}）` }
    }
    // 精度校验
    if (whitelist.step !== undefined) {
      const remainder = Math.abs((num * 1000) % (whitelist.step * 1000))
      if (remainder > 0.001) {
        return {
          valid: false,
          error: `${settingKey} 精度必须为 ${whitelist.step}（当前值: ${num}）`
        }
      }
    }
  }

  if (whitelist.type === 'boolean') {
    const boolValue = String(value).toLowerCase()
    if (!['true', 'false', '1', '0'].includes(boolValue)) {
      return { valid: false, error: `${settingKey} 必须是布尔值（true/false/1/0）` }
    }
  }

  if (whitelist.type === 'string') {
    if (whitelist.minLength && String(value).length < whitelist.minLength) {
      return { valid: false, error: `${settingKey} 长度不能小于 ${whitelist.minLength}` }
    }
    if (whitelist.maxLength && String(value).length > whitelist.maxLength) {
      return { valid: false, error: `${settingKey} 长度不能大于 ${whitelist.maxLength}` }
    }
    if (whitelist.pattern && !whitelist.pattern.test(String(value))) {
      return { valid: false, error: `${settingKey} 格式不正确` }
    }
  }

  return { valid: true, error: null }
}

/**
 * 获取所有白名单配置项
 *
 * @returns {string[]} 白名单配置项列表
 */
function getAllWhitelistKeys () {
  return Object.keys(SYSTEM_SETTINGS_WHITELIST)
}

/**
 * 获取需要审计的配置项
 *
 * @returns {string[]} 需要审计的配置项列表
 */
function getAuditRequiredKeys () {
  return Object.entries(SYSTEM_SETTINGS_WHITELIST)
    .filter(([, schema]) => schema.auditRequired)
    .map(([key]) => key)
}

module.exports = {
  SYSTEM_SETTINGS_WHITELIST,
  FORBIDDEN_IN_DB,
  getWhitelist,
  isForbidden,
  validateSettingValue,
  getAllWhitelistKeys,
  getAuditRequiredKeys
}
