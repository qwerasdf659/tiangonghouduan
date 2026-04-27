'use strict'

const crypto = require('crypto')
const { FeatureFlag } = require('../../../../models')
const {
  PITY_CONFIG,
  LUCK_DEBT_CONFIG,
  ANTI_EMPTY_CONFIG,
  ANTI_HIGH_CONFIG,
  parseEnvArray,
  isFeatureEnabled
} = require('./ComputeConfigDefaults')

const GRAYSCALE_CONFIG = {
  pity: {
    percentage: parseInt(process.env.PITY_GRAYSCALE_PERCENTAGE) || 100,
    user_whitelist: parseEnvArray(process.env.PITY_USER_WHITELIST),
    campaign_whitelist: parseEnvArray(process.env.PITY_CAMPAIGN_WHITELIST)
  },
  luck_debt: {
    percentage: parseInt(process.env.LUCK_DEBT_GRAYSCALE_PERCENTAGE) || 100,
    user_whitelist: parseEnvArray(process.env.LUCK_DEBT_USER_WHITELIST),
    campaign_whitelist: parseEnvArray(process.env.LUCK_DEBT_CAMPAIGN_WHITELIST)
  },
  anti_empty: {
    percentage: parseInt(process.env.ANTI_EMPTY_GRAYSCALE_PERCENTAGE) || 100,
    user_whitelist: parseEnvArray(process.env.ANTI_EMPTY_USER_WHITELIST),
    campaign_whitelist: parseEnvArray(process.env.ANTI_EMPTY_CAMPAIGN_WHITELIST)
  },
  anti_high: {
    percentage: parseInt(process.env.ANTI_HIGH_GRAYSCALE_PERCENTAGE) || 100,
    user_whitelist: parseEnvArray(process.env.ANTI_HIGH_USER_WHITELIST),
    campaign_whitelist: parseEnvArray(process.env.ANTI_HIGH_CAMPAIGN_WHITELIST)
  }
}

/**
 * 计算用户哈希值，用于灰度百分比判定
 * @param {number} user_id - 用户 ID
 * @returns {number} 0-99 之间的哈希值
 */
function calculateUserHash(user_id) {
  return Math.abs((user_id * 31 + 17) % 100)
}

/**
 * 判断指定功能在给定上下文中是否启用（含灰度策略）
 * @param {string} feature - 功能名称
 * @param {Object} context - 上下文信息
 * @param {number} [context.user_id] - 用户 ID
 * @param {number} [context.lottery_campaign_id] - 活动 ID
 * @returns {Promise<Object>} 灰度判定结果
 */
async function isFeatureEnabledForContext(feature, context = {}) {
  const { user_id, lottery_campaign_id } = context

  if (!isFeatureEnabled(feature)) {
    return {
      enabled: false,
      reason: 'global_disabled',
      grayscale_percentage: 0,
      user_hash_value: null
    }
  }

  const { DynamicConfigLoader } = require('./ComputeConfig')

  const grayscale = GRAYSCALE_CONFIG[feature] || {
    percentage: 100,
    user_whitelist: [],
    campaign_whitelist: []
  }
  const percentage_key = `${feature}_percentage`
  let effective_percentage = grayscale.percentage

  if (lottery_campaign_id) {
    const db_percentage = await DynamicConfigLoader.getValue('grayscale', percentage_key, null, {
      lottery_campaign_id
    })
    if (db_percentage !== null && db_percentage !== undefined) {
      effective_percentage = db_percentage
    }
  }

  if (user_id) {
    const env_hit = grayscale.user_whitelist.includes(user_id)

    let db_whitelist_hit = false
    if (lottery_campaign_id) {
      const whitelist_key = `${feature}_user_whitelist`
      const db_whitelist = await DynamicConfigLoader.getValue('grayscale', whitelist_key, null, {
        lottery_campaign_id
      })
      if (db_whitelist) {
        const user_ids = Array.isArray(db_whitelist)
          ? db_whitelist
          : typeof db_whitelist === 'string'
            ? JSON.parse(db_whitelist)
            : []
        db_whitelist_hit = user_ids.includes(user_id) || user_ids.includes(String(user_id))
      }
    }

    // STUB: feature_flag_hit + remaining checks below
    let feature_flag_hit = false
    try {
      const FEATURE_TO_FLAG_KEY = {
        pity: 'lottery_pity_system',
        luck_debt: 'lottery_luck_debt',
        anti_empty: 'lottery_anti_empty_streak',
        anti_high: 'lottery_anti_high_streak'
      }
      const flag_key = FEATURE_TO_FLAG_KEY[feature]
      if (flag_key) {
        const flag = await FeatureFlag.findByKey(flag_key)
        if (flag) {
          feature_flag_hit =
            flag.isUserInWhitelist(user_id) || flag.isUserInWhitelist(Number(user_id))
        }
      }
    } catch (_err) {
      /* Feature Flags 查询失败不阻断灰度判定 */
    }
    if (env_hit || db_whitelist_hit || feature_flag_hit) {
      const source = env_hit
        ? 'env_whitelist'
        : db_whitelist_hit
          ? 'db_config_whitelist'
          : 'feature_flag_whitelist'
      return {
        enabled: true,
        reason: source,
        grayscale_percentage: effective_percentage,
        user_hash_value: null
      }
    }
  }

  if (lottery_campaign_id && grayscale.campaign_whitelist.includes(lottery_campaign_id)) {
    return {
      enabled: true,
      reason: 'campaign_whitelist',
      grayscale_percentage: effective_percentage,
      user_hash_value: null
    }
  }

  if (effective_percentage >= 100) {
    return {
      enabled: true,
      reason: 'full_rollout',
      grayscale_percentage: 100,
      user_hash_value: null
    }
  }

  if (effective_percentage <= 0) {
    return {
      enabled: false,
      reason: 'zero_percentage',
      grayscale_percentage: 0,
      user_hash_value: null
    }
  }

  const hash_value = user_id ? calculateUserHash(user_id) : crypto.randomInt(0, 100)
  const is_hit = hash_value < effective_percentage

  return {
    enabled: is_hit,
    reason: is_hit ? 'percentage_hit' : 'percentage_miss',
    grayscale_percentage: effective_percentage,
    user_hash_value: hash_value
  }
}

/**
 * 获取所有功能的灰度配置摘要
 * @returns {Object} 各功能的灰度状态汇总
 */
function getGrayscaleSummary() {
  return {
    pity: {
      global_enabled: PITY_CONFIG.enabled,
      percentage: GRAYSCALE_CONFIG.pity.percentage,
      user_whitelist_count: GRAYSCALE_CONFIG.pity.user_whitelist.length,
      campaign_whitelist_count: GRAYSCALE_CONFIG.pity.campaign_whitelist.length
    },
    luck_debt: {
      global_enabled: LUCK_DEBT_CONFIG.enabled,
      percentage: GRAYSCALE_CONFIG.luck_debt.percentage,
      user_whitelist_count: GRAYSCALE_CONFIG.luck_debt.user_whitelist.length,
      campaign_whitelist_count: GRAYSCALE_CONFIG.luck_debt.campaign_whitelist.length
    },
    anti_empty: {
      global_enabled: ANTI_EMPTY_CONFIG.enabled,
      percentage: GRAYSCALE_CONFIG.anti_empty.percentage,
      user_whitelist_count: GRAYSCALE_CONFIG.anti_empty.user_whitelist.length,
      campaign_whitelist_count: GRAYSCALE_CONFIG.anti_empty.campaign_whitelist.length
    },
    anti_high: {
      global_enabled: ANTI_HIGH_CONFIG.enabled,
      percentage: GRAYSCALE_CONFIG.anti_high.percentage,
      user_whitelist_count: GRAYSCALE_CONFIG.anti_high.user_whitelist.length,
      campaign_whitelist_count: GRAYSCALE_CONFIG.anti_high.campaign_whitelist.length
    }
  }
}

module.exports = {
  GRAYSCALE_CONFIG,
  isFeatureEnabledForContext,
  getGrayscaleSummary,
  calculateUserHash
}
