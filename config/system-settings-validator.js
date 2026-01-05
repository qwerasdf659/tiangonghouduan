/**
 * 餐厅积分抽奖系统 - SystemSettings 启动预检器
 *
 * @description 应用启动时强制预检关键配置，确保配置完整性
 * @version 1.0.0
 * @created 2025-12-30
 *
 * 业务决策（2025-12-31 兜底策略升级）：
 * - 关键配置禁止运行时兜底：读取失败直接报错
 * - 启动时强制预检：关键配置必须存在且符合白名单约束，否则拒绝启动
 * - 展示类/通知类配置允许兜底：影响低，不值得为此让核心接口 500
 *
 * 参考文档：docs/配置管理三层分离与校验统一方案.md
 */

const { SYSTEM_SETTINGS_WHITELIST } = require('./system-settings-whitelist')

/**
 * 关键配置清单（启动时强制预检）
 *
 * 这些配置直接影响积分经济/风控/安全，启动时必须存在且合规：
 * - 积分规则：lottery_cost_points, budget_allocation_ratio, daily_lottery_limit
 * - 市场规则：max_active_listings
 * - 安全规则：password_min_length, api_rate_limit, max_login_attempts
 */
const CRITICAL_SETTINGS_REQUIRED_AT_STARTUP = [
  'points/lottery_cost_points', // 抽奖单价（影响积分消耗）
  'points/budget_allocation_ratio', // 预算系数（影响积分发放）
  'points/daily_lottery_limit', // 每日上限（影响用户体验/风控）
  'marketplace/max_active_listings', // 上架上限（影响市场秩序）
  'security/max_login_attempts', // 登录限制（影响安全）
  'security/password_min_length', // 密码长度（影响安全）
  'security/api_rate_limit' // API限流（影响风控）
]

/**
 * 验证关键 SystemSettings 配置
 *
 * @description 在应用启动时调用，验证关键配置是否存在且合规
 * @returns {Promise<void>} 验证通过返回 undefined，不通过则 process.exit(1)
 *
 * @example
 * // 在 app.js 启动阶段调用
 * const { validateCriticalSettings } = require('./config/system-settings-validator')
 * await validateCriticalSettings()
 */
async function validateCriticalSettings () {
  // 延迟加载 models，避免循环依赖
  const models = require('../models')
  const { SystemSettings } = models

  console.log('\n🔍 检查关键 SystemSettings 配置...')

  const errors = []

  // 逐个检查关键配置
  for (const whitelistKey of CRITICAL_SETTINGS_REQUIRED_AT_STARTUP) {
    const [category, setting_key] = whitelistKey.split('/')
    const whitelist = SYSTEM_SETTINGS_WHITELIST[whitelistKey]

    // 白名单定义必须存在
    if (!whitelist) {
      errors.push({
        key: whitelistKey,
        type: 'WHITELIST_MISSING',
        message: `关键配置 ${whitelistKey} 未在白名单中定义`,
        fix: '请检查 config/system-settings-whitelist.js 中是否定义了该配置项'
      })
      continue
    }

    try {
      // 查询数据库
      const setting = await SystemSettings.findOne({
        where: { category, setting_key }
      })

      // 1. 检查配置是否存在
      if (!setting) {
        errors.push({
          key: whitelistKey,
          type: 'MISSING',
          message: `关键配置缺失: ${whitelistKey}`,
          fix: `INSERT INTO system_settings (category, setting_key, setting_value, value_type, description, is_readonly, is_visible) VALUES ('${category}', '${setting_key}', '${whitelist.default}', '${whitelist.type}', '${whitelist.description}', false, true);`
        })
        continue
      }

      // 2. 检查类型是否匹配
      if (setting.value_type !== whitelist.type) {
        errors.push({
          key: whitelistKey,
          type: 'TYPE_MISMATCH',
          message: `配置类型不匹配: ${whitelistKey}（期望 ${whitelist.type}，实际 ${setting.value_type}）`,
          fix: `UPDATE system_settings SET value_type = '${whitelist.type}' WHERE category = '${category}' AND setting_key = '${setting_key}';`
        })
      }

      // 3. 检查值范围（仅对 number 类型）
      if (whitelist.type === 'number') {
        const value = setting.getParsedValue()

        if (whitelist.min !== undefined && value < whitelist.min) {
          errors.push({
            key: whitelistKey,
            type: 'OUT_OF_RANGE',
            message: `配置值超出范围: ${whitelistKey}=${value} < ${whitelist.min}（最小值）`,
            fix: `UPDATE system_settings SET setting_value = '${whitelist.default}' WHERE category = '${category}' AND setting_key = '${setting_key}';`
          })
        }

        if (whitelist.max !== undefined && value > whitelist.max) {
          errors.push({
            key: whitelistKey,
            type: 'OUT_OF_RANGE',
            message: `配置值超出范围: ${whitelistKey}=${value} > ${whitelist.max}（最大值）`,
            fix: `UPDATE system_settings SET setting_value = '${whitelist.default}' WHERE category = '${category}' AND setting_key = '${setting_key}';`
          })
        }
      }
    } catch (error) {
      errors.push({
        key: whitelistKey,
        type: 'QUERY_FAILED',
        message: `查询配置失败: ${whitelistKey}（${error.message}）`,
        fix: '请检查数据库连接或表结构是否正确'
      })
    }
  }

  // 输出检查结果
  if (errors.length > 0) {
    console.error('\n❌ 关键 SystemSettings 配置校验失败:')

    errors.forEach((err, index) => {
      console.error(`\n${index + 1}. [${err.type}] ${err.message}`)
      console.error(`   修复方案: ${err.fix}`)
    })

    console.error(`\n🚫 检测到 ${errors.length} 个关键配置问题，应用无法启动`)
    console.error('💡 提示：这些配置影响积分经济核心规则，必须在启动前修复\n')

    // 拒绝启动
    process.exit(1)
  }

  console.log(
    `✅ 关键 SystemSettings 配置校验通过（${CRITICAL_SETTINGS_REQUIRED_AT_STARTUP.length} 项）\n`
  )
}

/**
 * 获取关键配置清单
 *
 * @returns {string[]} 关键配置键名列表
 */
function getCriticalSettingKeys () {
  return [...CRITICAL_SETTINGS_REQUIRED_AT_STARTUP]
}

/**
 * 检查配置是否为关键配置
 *
 * @param {string} whitelistKey - 配置键名（格式：category/setting_key）
 * @returns {boolean} 是否为关键配置
 */
function isCriticalSetting (whitelistKey) {
  return CRITICAL_SETTINGS_REQUIRED_AT_STARTUP.includes(whitelistKey)
}

module.exports = {
  validateCriticalSettings,
  getCriticalSettingKeys,
  isCriticalSetting,
  CRITICAL_SETTINGS_REQUIRED_AT_STARTUP
}
