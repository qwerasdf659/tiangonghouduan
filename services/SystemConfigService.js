/**
 * 系统配置服务（SystemConfigService）
 *
 * @description 从 AdminSystemService 拆分，负责所有系统配置的读写和缓存管理
 *
 * 核心功能：
 * 1. 配置查询管理（getSettingsByCategory, getSettingsSummary）
 * 2. 配置更新业务（updateSettings, upsertConfig）
 * 3. 单值/批量配置读取（getSettingValue, getSettingValues, getConfigValue, getConfigProperty）
 * 4. 批量操作配置（getBatchRateLimitConfig, getBatchGlobalConfig, getAllBatchConfigs, warmupBatchConfigs）
 * 5. 缓存管理（clearCache, _getConfigFromCache, _setConfigToCache, _clearConfigCache）
 *
 * 拆分自：AdminSystemService（2026-04-24）
 */

const BusinessError = require('../utils/BusinessError')
const BeijingTimeHelper = require('../utils/timeHelper')
const models = require('../models')
const { SystemSettings, sequelize } = models
const { Op } = require('sequelize')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')

const logger = require('../utils/logger').logger

const {
  getWhitelist,
  isForbidden,
  validateSettingValue
} = require('../config/system-settings-whitelist')
const { getRedisClient, getRawClient } = require('../utils/UnifiedRedisClient')

const { BusinessCacheHelper } = require('../utils/BusinessCacheHelper')

/**
 * 系统配置服务，负责配置的读写、缓存管理和批量操作
 */
class SystemConfigService {
  static SETTING_DISPLAY_NAMES = {
    system_name: '系统名称',
    system_version: '系统版本',
    customer_phone: '客服电话',
    customer_email: '客服邮箱',
    maintenance_mode: '维护模式',
    maintenance_message: '维护公告',
    maintenance_end_time: '维护结束时间',
    lottery_cost_points: '抽奖消耗积分',
    points_expire_days: '积分过期天数',
    initial_points: '新用户初始积分',
    budget_allocation_ratio: '预算分配比例',
    daily_lottery_limit: '每日抽奖次数限制',
    merchant_review_budget_ratio: '商户审核预算比例',
    merchant_review_campaign_id: '商户审核活动ID',
    sms_enabled: '短信通知',
    email_enabled: '邮件通知',
    app_notification_enabled: 'APP推送通知',
    max_login_attempts: '最大登录尝试次数',
    lockout_duration: '锁定时长(分钟)',
    password_min_length: '密码最小长度',
    api_rate_limit: 'API请求限制(次/分钟)',
    max_active_listings: '最大同时上架数',
    listing_expiry_days: '挂牌过期天数',
    monitor_price_low_threshold: '价格下限阈值',
    monitor_price_high_threshold: '价格上限阈值',
    monitor_long_listing_days: '超长挂牌天数',
    monitor_alert_enabled: '市场监控告警',
    allowed_settlement_assets: '允许结算币种',
    fee_rate_star_stone: '星石手续费率',
    fee_rate_red_core_shard: '红源晶碎片手续费率',
    fee_min_star_stone: '星石最低手续费',
    fee_min_red_core_shard: '红源晶碎片最低手续费',
    min_price_red_core_shard: '红源晶碎片最低价格',
    max_price_red_core_shard: '红源晶碎片最高价格',
    daily_max_listings_star_stone: '星石每日最大上架数',
    daily_max_listings_red_core_shard: '红源晶碎片每日最大上架数',
    daily_max_trades_star_stone: '星石每日最大交易数',
    daily_max_trades_red_core_shard: '红源晶碎片每日最大交易数',
    daily_max_amount_star_stone: '星石每日最大交易额',
    daily_max_amount_red_core_shard: '红源晶碎片每日最大交易额',
    allowed_listing_assets: '允许上架资产类型',
    backpack_use_instructions: '物品使用操作指引文案',
    item_type_action_rules: '物品类型操作规则'
  }

  static VALID_CATEGORIES = [
    'basic',
    'points',
    'notification',
    'security',
    'marketplace',
    'redemption',
    'exchange',
    'batch_operation',
    'rate_limit',
    'feature',
    'general',
    'ad_system',
    'ad_pricing',
    'backpack',
    'data_management'
  ]

  /**
   * 按分类获取系统设置列表
   * @param {string} category - 设置分类名称
   * @returns {Promise<{category: string, count: number, settings: Array}>} 分类设置列表
   */
  static async getSettingsByCategory(category) {
    try {
      if (!this.VALID_CATEGORIES.includes(category)) {
        throw new BusinessError(
          `无效的设置分类: ${category}。有效分类: ${this.VALID_CATEGORIES.join(', ')}`,
          'SERVICE_INVALID',
          400
        )
      }

      const settings = await SystemSettings.findAll({
        where: { category, is_visible: true },
        attributes: [
          'system_setting_id',
          'category',
          'setting_key',
          'setting_value',
          'value_type',
          'description',
          'is_readonly',
          'updated_by',
          'updated_at'
        ],
        order: [['system_setting_id', 'ASC']]
      })
      const parsedSettings = settings.map(setting => {
        const data = setting.toJSON()
        data.parsed_value = setting.getParsedValue()
        data.display_name =
          SystemConfigService.SETTING_DISPLAY_NAMES[data.setting_key] || data.setting_key
        return data
      })

      logger.info('获取系统设置成功', { category, count: settings.length })
      return { category, count: settings.length, settings: parsedSettings }
    } catch (error) {
      logger.error('获取系统设置失败', { error: error.message, category })
      throw error
    }
  }

  /**
   * 获取所有分类的设置数量概览
   * @returns {Promise<{total_settings: number, categories: Object}>} 设置概览
   */
  static async getSettingsSummary() {
    try {
      const categoryCounts = await SystemSettings.findAll({
        attributes: [
          'category',
          [sequelize.fn('COUNT', sequelize.col('system_setting_id')), 'count']
        ],
        where: { is_visible: true },
        group: ['category']
      })

      const summary = { total_settings: 0, categories: {} }
      categoryCounts.forEach(item => {
        const data = item.toJSON()
        summary.categories[data.category] = parseInt(data.count)
        summary.total_settings += parseInt(data.count)
      })

      logger.info('获取系统设置概览成功', {
        total_settings: summary.total_settings,
        categories: Object.keys(summary.categories).length
      })
      return summary
    } catch (error) {
      logger.error('获取系统设置概览失败', { error: error.message })
      throw error
    }
  }

  /**
   * 批量更新指定分类下的系统设置
   * @param {string} category - 设置分类
   * @param {Object} settingsToUpdate - 要更新的键值对
   * @param {number} userId - 操作用户ID
   * @param {Object} [options={}] - 可选参数（含事务和变更原因）
   * @returns {Promise<Object>} 更新结果摘要
   */
  static async updateSettings(category, settingsToUpdate, userId, options = {}) {
    const transaction = assertAndGetTransaction(options, 'SystemConfigService.updateSettings')
    const { reason } = options

    if (!this.VALID_CATEGORIES.includes(category)) {
      throw new BusinessError(
        `无效的设置分类: ${category}。有效分类: ${this.VALID_CATEGORIES.join(', ')}`,
        'SERVICE_INVALID',
        400
      )
    }

    if (
      !settingsToUpdate ||
      typeof settingsToUpdate !== 'object' ||
      Object.keys(settingsToUpdate).length === 0
    ) {
      throw new BusinessError('请提供要更新的设置项', 'SERVICE_ERROR', 400)
    }

    const settingKeys = Object.keys(settingsToUpdate)
    const updateResults = []
    const errors = []

    for (const settingKey of settingKeys) {
      try {
        const whitelistKey = `${category}/${settingKey}`

        if (isForbidden(settingKey)) {
          errors.push({
            setting_key: settingKey,
            error: `配置项 ${settingKey} 属于禁止类（密钥/结算逻辑），不允许存储在数据库`
          })
          continue
        }

        const whitelist = getWhitelist(whitelistKey)
        if (!whitelist) {
          errors.push({
            setting_key: settingKey,
            error: `配置项 ${whitelistKey} 不在白名单内，禁止修改。请联系技术团队添加白名单。`
          })
          continue
        }

        if (whitelist.readonly) {
          errors.push({
            setting_key: settingKey,
            error: `配置项 ${settingKey} 为只读（白名单定义），禁止修改`
          })
          continue
        }
        const newValue = settingsToUpdate[settingKey]
        const validation = validateSettingValue(whitelistKey, newValue)
        if (!validation.valid) {
          errors.push({ setting_key: settingKey, error: validation.error })
          continue
        }

        // eslint-disable-next-line no-await-in-loop -- 批量配置更新需要串行处理事务
        const setting = await SystemSettings.findOne({
          where: { category, setting_key: settingKey },
          transaction
        })

        if (!setting) {
          errors.push({ setting_key: settingKey, error: '配置项不存在于数据库中' })
          continue
        }

        if (setting.is_readonly) {
          errors.push({ setting_key: settingKey, error: '此配置项在数据库中标记为只读，不可修改' })
          continue
        }
        const oldValue = setting.setting_value
        setting.setValue(newValue)
        setting.updated_by = userId
        setting.updated_at = BeijingTimeHelper.createBeijingTime()

        // eslint-disable-next-line no-await-in-loop -- 批量配置更新需要串行保存
        await setting.save({ transaction })

        if (
          whitelist.auditRequired ||
          whitelist.businessImpact === 'HIGH' ||
          whitelist.businessImpact === 'CRITICAL'
        ) {
          logger.warn('高影响配置修改', {
            setting_key: whitelistKey,
            business_impact: whitelist.businessImpact,
            operator_id: userId,
            old_value: oldValue,
            new_value: newValue,
            reason: reason || '未提供变更原因',
            audit_required: true,
            timestamp: BeijingTimeHelper.apiTimestamp()
          })
        }

        updateResults.push({
          setting_key: settingKey,
          old_value: oldValue,
          new_value: newValue,
          success: true,
          business_impact: whitelist.businessImpact
        })

        logger.info('系统设置更新成功', {
          user_id: userId,
          category,
          setting_key: settingKey,
          new_value: newValue
        })
      } catch (error) {
        errors.push({ setting_key: settingKey, error: error.message })
      }
    }
    if (updateResults.length > 0) {
      try {
        await Promise.all(
          updateResults.map(update =>
            BusinessCacheHelper.invalidateSysConfig(
              category,
              update.setting_key,
              'service_settings_updated'
            )
          )
        )
        logger.info('[缓存] 系统配置缓存已失效', {
          category,
          invalidated_keys: updateResults.map(u => u.setting_key)
        })
      } catch (cacheError) {
        logger.warn('[缓存] 系统配置缓存失效失败（非致命）', {
          error: cacheError.message,
          category
        })
      }
    }

    const responseData = {
      category,
      total_requested: settingKeys.length,
      success_count: updateResults.length,
      error_count: errors.length,
      updates: updateResults,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }
    if (errors.length > 0) {
      responseData.errors = errors
    }

    logger.info('批量更新系统设置完成', {
      category,
      success_count: updateResults.length,
      error_count: errors.length
    })
    return responseData
  }

  /**
   * 获取单个配置项的值，支持缓存和严格模式
   * @param {string} category - 设置分类
   * @param {string} setting_key - 配置键名
   * @param {*} [default_value=null] - 默认值
   * @param {Object} [options={}] - 可选参数（strict: 缺失时是否抛错）
   * @returns {Promise<*>} 配置值或默认值
   */
  static async getSettingValue(category, setting_key, default_value = null, options = {}) {
    const { strict = false } = options
    const configKey = `${category}/${setting_key}`

    try {
      const cached = await BusinessCacheHelper.getSysConfig(category, setting_key)
      if (cached !== null) {
        logger.debug('[系统配置] Redis 缓存命中', { category, setting_key, value: cached })
        return cached
      }

      const setting = await SystemSettings.findOne({ where: { category, setting_key } })

      if (setting) {
        const parsed_value = setting.getParsedValue()
        await BusinessCacheHelper.setSysConfig(category, setting_key, parsed_value)
        logger.debug('[系统配置] 读取成功（已缓存）', {
          category,
          setting_key,
          value: parsed_value,
          value_type: setting.value_type
        })
        return parsed_value
      }
      if (strict) {
        const error = new Error(`关键配置缺失: ${configKey}`)
        error.code = 'CONFIG_MISSING'
        error.config_key = configKey
        error.category = category
        error.setting_key = setting_key
        logger.error('[系统配置] 严格模式：关键配置缺失，拒绝兜底', {
          category,
          setting_key,
          config_key: configKey,
          strict: true
        })
        throw error
      }

      logger.warn('[系统配置] 未找到配置项，使用默认值', { category, setting_key, default_value })
      return default_value
    } catch (error) {
      if (error.code === 'CONFIG_MISSING') {
        throw error
      }

      if (strict) {
        const configError = new Error(`关键配置读取失败: ${configKey}（${error.message}）`)
        configError.code = 'CONFIG_READ_FAILED'
        configError.config_key = configKey
        configError.category = category
        configError.setting_key = setting_key
        configError.originalError = error.message
        logger.error('[系统配置] 严格模式：配置读取失败，拒绝兜底', {
          category,
          setting_key,
          config_key: configKey,
          error: error.message,
          strict: true
        })
        throw configError
      }

      logger.error('[系统配置] 读取失败，使用默认值', {
        category,
        setting_key,
        default_value,
        error: error.message
      })
      return default_value
    }
  }

  /**
   * 批量获取多个配置项的值
   * @param {Array<{category: string, setting_key: string, default_value: *}>} config_list - 配置项列表
   * @returns {Promise<Object>} 以 setting_key 为键的配置值映射
   */
  static async getSettingValues(config_list) {
    const result = {}
    try {
      const where_conditions = config_list.map(({ category, setting_key }) => ({
        category,
        setting_key
      }))
      const settings = await SystemSettings.findAll({
        where: { [Op.or]: where_conditions }
      })

      const setting_map = new Map()
      settings.forEach(setting => {
        setting_map.set(setting.setting_key, setting.getParsedValue())
      })

      config_list.forEach(({ setting_key, default_value }) => {
        result[setting_key] = setting_map.has(setting_key)
          ? setting_map.get(setting_key)
          : default_value
      })

      logger.debug('[系统配置] 批量读取完成', {
        requested: config_list.length,
        found: settings.length
      })
      return result
    } catch (error) {
      logger.error('[系统配置] 批量读取失败，使用默认值', { error: error.message })
      config_list.forEach(({ setting_key, default_value }) => {
        result[setting_key] = default_value
      })
      return result
    }
  }

  /**
   * 生成配置项的 Redis 缓存键
   * @param {string} setting_key - 配置键名
   * @returns {string} 缓存键
   */
  static _getConfigCacheKey(setting_key) {
    return `system_config:${setting_key}`
  }

  /**
   * 从 Redis 缓存读取配置值
   * @param {string} setting_key - 配置键名
   * @returns {Promise<*|null>} 缓存值或 null
   */
  static async _getConfigFromCache(setting_key) {
    try {
      const redis = getRedisClient()
      if (!redis) return null
      const cached = await redis.get(this._getConfigCacheKey(setting_key))
      return cached ? JSON.parse(cached) : null
    } catch {
      return null
    }
  }

  /**
   * 将配置值写入 Redis 缓存
   * @param {string} setting_key - 配置键名
   * @param {*} value - 要缓存的值
   * @param {number} [ttl=300] - 过期时间（秒）
   * @returns {Promise<void>} 无返回值
   */
  static async _setConfigToCache(setting_key, value, ttl = 300) {
    try {
      const redis = getRedisClient()
      if (!redis) return
      await redis.set(this._getConfigCacheKey(setting_key), JSON.stringify(value), 'EX', ttl)
    } catch {
      /* non-fatal */
    }
  }

  /**
   * 清除指定配置项的 Redis 缓存
   * @param {string} setting_key - 配置键名
   * @returns {Promise<void>} 无返回值
   */
  static async _clearConfigCache(setting_key) {
    try {
      const redis = getRedisClient()
      if (!redis) return
      await redis.del(this._getConfigCacheKey(setting_key))
    } catch {
      /* non-fatal */
    }
  }

  /**
   * 通过键名获取配置值（带缓存）
   * @param {string} setting_key - 配置键名
   * @param {*} [defaultValue=null] - 默认值
   * @returns {Promise<*>} 配置值或默认值
   */
  static async getConfigValue(setting_key, defaultValue = null) {
    try {
      const cached = await this._getConfigFromCache(setting_key)
      if (cached !== null) return cached

      const setting = await SystemSettings.findOne({ where: { setting_key } })
      if (!setting) return defaultValue

      const parsed = setting.getParsedValue()
      await this._setConfigToCache(setting_key, parsed)
      return parsed
    } catch (error) {
      logger.error('获取配置值失败', { setting_key, error: error.message })
      return defaultValue
    }
  }

  /**
   * 获取 JSON 类型配置中的指定属性值
   * @param {string} setting_key - 配置键名
   * @param {string} property - 属性名
   * @param {*} [defaultValue=null] - 默认值
   * @returns {Promise<*>} 属性值或默认值
   */
  static async getConfigProperty(setting_key, property, defaultValue = null) {
    const value = await this.getConfigValue(setting_key)
    if (value && typeof value === 'object') {
      return value[property] !== undefined ? value[property] : defaultValue
    }
    return defaultValue
  }

  /**
   * 获取指定操作类型的批量速率限制配置
   * @param {string} operation_type - 操作类型标识
   * @returns {Promise<{max_items_per_request: number, cooldown_seconds: number}>} 速率限制配置
   */
  static async getBatchRateLimitConfig(operation_type) {
    const keyMap = {
      quota_grant_batch: 'batch_rate_limit_quota_grant',
      preset_batch: 'batch_rate_limit_preset',
      redemption_verify_batch: 'batch_rate_limit_redemption',
      campaign_status_batch: 'batch_rate_limit_campaign_status',
      budget_adjust_batch: 'batch_rate_limit_budget'
    }
    const setting_key = keyMap[operation_type]
    if (!setting_key) {
      return { max_items_per_request: 50, cooldown_seconds: 60 }
    }
    const config = await this.getConfigValue(setting_key)
    if (!config) {
      return { max_items_per_request: 50, cooldown_seconds: 60 }
    }
    return {
      max_items_per_request: config.max_items_per_request || 50,
      cooldown_seconds: config.cooldown_seconds || 60
    }
  }

  /**
   * 获取批量操作全局配置
   * @returns {Promise<Object>} 全局配置（含并发数、重试策略等）
   */
  static async getBatchGlobalConfig() {
    const config = await this.getConfigValue('batch_operation_global')
    if (!config) {
      return {
        max_concurrent_batches: 3,
        default_retry_count: 3,
        retry_delay_seconds: 5,
        idempotency_key_ttl_hours: 24
      }
    }
    return config
  }

  /**
   * 创建或更新配置项
   * @param {string} setting_key - 配置键名
   * @param {*} setting_value - 配置值
   * @param {Object} [options={}] - 可选参数（description, category, transaction）
   * @returns {Promise<{setting_key: string, created: boolean}>} 操作结果
   */
  static async upsertConfig(setting_key, setting_value, options = {}) {
    const { description, category = 'general', transaction } = options
    try {
      const serialized =
        typeof setting_value === 'string' ? setting_value : JSON.stringify(setting_value)

      const value_type =
        typeof setting_value === 'object'
          ? 'json'
          : typeof setting_value === 'number'
            ? 'number'
            : typeof setting_value === 'boolean'
              ? 'boolean'
              : 'json'

      const [setting, created] = await SystemSettings.findOrCreate({
        where: { setting_key },
        defaults: {
          setting_key,
          setting_value: serialized,
          value_type,
          category,
          description: description || null,
          is_visible: true,
          is_readonly: false
        },
        transaction
      })

      if (!created) {
        setting.setting_value = serialized
        setting.value_type = value_type
        if (description) setting.description = description
        await setting.save({ transaction })
      }

      await this._clearConfigCache(setting_key)
      logger.info(created ? '配置已创建' : '配置已更新', { setting_key })
      return { setting_key, created }
    } catch (error) {
      logger.error('创建或更新配置失败', { setting_key, error: error.message })
      throw error
    }
  }

  /**
   * 获取所有批量操作配置列表
   * @returns {Promise<Array<Object>>} 批量操作配置数组
   */
  static async getAllBatchConfigs() {
    try {
      const settings = await SystemSettings.findAll({
        where: { category: 'batch_operation' },
        order: [['system_setting_id', 'ASC']]
      })
      return settings.map(s => ({
        setting_key: s.setting_key,
        setting_value: s.getParsedValue(),
        description: s.description,
        category: s.category,
        updated_at: s.updated_at
      }))
    } catch (error) {
      logger.error('获取批量操作配置失败', { error: error.message })
      throw error
    }
  }

  /**
   * 预热批量操作配置到 Redis 缓存
   * @returns {Promise<void>} 无返回值
   */
  static async warmupBatchConfigs() {
    try {
      logger.info('开始预热批量操作配置缓存...')
      const settings = await SystemSettings.findAll({
        where: { category: 'batch_operation' }
      })
      for (const setting of settings) {
        // eslint-disable-next-line no-await-in-loop
        await this._setConfigToCache(setting.setting_key, setting.getParsedValue(), 60)
      }
      logger.info('批量操作配置缓存预热完成', { count: settings.length })
    } catch (error) {
      logger.warn('配置缓存预热失败', { error: error.message })
    }
  }

  /**
   * 按模式清除系统 Redis 缓存
   * @param {string} [pattern='*'] - 缓存键匹配模式
   * @returns {Promise<{pattern: string, cleared_count: number, matched_keys: number, timestamp: string}>} 清除结果
   */
  static async clearCache(pattern = '*') {
    try {
      const rawClient = getRawClient()
      let clearedCount = 0
      const cachePattern = pattern || '*'

      let cursor = '0'
      let matchedKeys = 0
      const batchSize = 200

      do {
        // eslint-disable-next-line no-await-in-loop
        const scanResult = await rawClient.scan(cursor, 'MATCH', cachePattern, 'COUNT', batchSize)
        cursor = scanResult?.[0] ?? '0'
        const keys = scanResult?.[1] ?? []

        if (keys.length > 0) {
          matchedKeys += keys.length
          // eslint-disable-next-line no-await-in-loop
          const deleted = await rawClient.del(...keys)
          clearedCount += Number(deleted) || 0
        }
      } while (cursor !== '0')

      logger.info('系统缓存清除完成', {
        pattern: cachePattern,
        cleared_count: clearedCount,
        matched_keys: matchedKeys
      })

      return {
        pattern: cachePattern,
        cleared_count: clearedCount,
        matched_keys: matchedKeys,
        timestamp: BeijingTimeHelper.apiTimestamp()
      }
    } catch (error) {
      logger.error('清除缓存失败', { error: error.message })
      throw error
    }
  }
}

module.exports = SystemConfigService
