/**
 * FeatureFlagService - 功能开关服务
 *
 * 职责：
 * 1. 功能开关 CRUD 操作
 * 2. 用户可用性判定（isEnabled）
 * 3. Redis 缓存管理
 * 4. 审计日志记录
 *
 * 设计原则：
 * - 判定顺序：黑名单 > 白名单 > 时间窗口 > 发布策略
 * - 缓存策略：Flag 配置缓存 5 分钟，判定结果缓存 1 分钟
 * - 审计要求：创建、更新、删除、切换操作必须记录审计日志
 *
 * @module services/FeatureFlagService
 * @author Feature Flag 灰度发布模块
 * @since 2026-01-21
 * @see docs/Feature-Flag灰度发布功能实施方案.md
 */

'use strict'

const { logger } = require('../utils/logger')
const { getRedisClient, isRedisHealthy } = require('../utils/UnifiedRedisClient')
const { OPERATION_TYPES } = require('../constants/AuditOperationTypes')
const crypto = require('crypto')
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')

// Redis 缓存 Key 前缀
const CACHE_PREFIX = 'feature_flag'
const FLAG_CACHE_TTL = 300 // 5 分钟
const DECISION_CACHE_TTL = 60 // 1 分钟

/**
 * 功能开关服务类
 * @class FeatureFlagService
 */
class FeatureFlagService {
  /**
   * 获取 FeatureFlag 模型（延迟加载避免循环依赖）
   * @returns {Object} FeatureFlag 模型
   */
  static getModel() {
    const { FeatureFlag } = require('../models')
    return FeatureFlag
  }

  /**
   * 获取 User 模型（用于分群判断）
   * @returns {Object} User 模型
   */
  static getUserModel() {
    const { User } = require('../models')
    return User
  }

  /**
   * 获取审计服务
   * @returns {Object} 审计日志服务（使用 AuditLogService.logOperation 方法）
   */
  static getAuditService() {
    const AuditLogService = require('./AuditLogService')
    return AuditLogService
  }

  // ==================== 核心判定方法 ====================

  /**
   * 判断用户是否可以使用指定功能
   *
   * 判定顺序（短路逻辑）：
   * 1. 功能是否存在且启用（is_enabled）
   * 2. 用户是否在黑名单（优先级最高，直接返回 false）
   * 3. 用户是否在白名单（优先于其他策略，直接返回 true）
   * 4. 是否在时间窗口内
   * 5. 发布策略判断（all/percentage/user_list/user_segment/schedule）
   *
   * @param {string} flagKey - 功能键名
   * @param {number} userId - 用户ID
   * @param {Object} options - 可选参数
   * @param {Object} options.userInfo - 用户信息（可选，用于分群判断）
   * @param {boolean} options.skipCache - 是否跳过缓存
   * @returns {Promise<Object>} 包含 enabled, reason, strategy 的判定结果
   */
  static async isEnabled(flagKey, userId, options = {}) {
    const startTime = Date.now()

    try {
      // 1. 尝试从缓存获取判定结果
      if (!options.skipCache) {
        const cachedDecision = await this.getCachedDecision(flagKey, userId)
        if (cachedDecision !== null) {
          logger.debug(`[FeatureFlag] 缓存命中: ${flagKey} user=${userId}`, {
            enabled: cachedDecision.enabled,
            duration: Date.now() - startTime
          })
          return cachedDecision
        }
      }

      // 2. 获取功能开关配置
      const flag = await this.getFlagByKey(flagKey, { skipCache: options.skipCache })

      // 功能不存在
      if (!flag) {
        const result = { enabled: false, reason: 'flag_not_found' }
        await this.cacheDecision(flagKey, userId, result)
        return result
      }

      // 功能未启用
      if (!flag.is_enabled) {
        const result = { enabled: false, reason: 'flag_disabled' }
        await this.cacheDecision(flagKey, userId, result)
        return result
      }

      // 3. 黑名单检查（优先级最高）
      if (flag.isUserInBlacklist(userId)) {
        const result = { enabled: false, reason: 'user_blacklisted' }
        await this.cacheDecision(flagKey, userId, result)
        return result
      }

      // 4. 白名单检查（优先于其他策略）
      if (flag.isUserInWhitelist(userId)) {
        const result = { enabled: true, reason: 'user_whitelisted', strategy: 'whitelist' }
        await this.cacheDecision(flagKey, userId, result)
        return result
      }

      // 5. 时间窗口检查
      if (!flag.isWithinTimeWindow()) {
        const result = { enabled: false, reason: 'outside_time_window' }
        await this.cacheDecision(flagKey, userId, result)
        return result
      }

      // 6. 发布策略判断
      const strategyResult = await this.evaluateStrategy(flag, userId, options.userInfo)
      await this.cacheDecision(flagKey, userId, strategyResult)

      logger.debug(`[FeatureFlag] 判定完成: ${flagKey} user=${userId}`, {
        enabled: strategyResult.enabled,
        strategy: strategyResult.strategy,
        reason: strategyResult.reason,
        duration: Date.now() - startTime
      })

      return strategyResult
    } catch (error) {
      logger.error(`[FeatureFlag] 判定异常: ${flagKey} user=${userId}`, {
        error: error.message,
        stack: error.stack
      })

      // 异常时返回降级结果（默认关闭功能）
      return { enabled: false, reason: 'evaluation_error', error: error.message }
    }
  }

  /**
   * 评估发布策略
   *
   * @param {Object} flag - 功能开关记录
   * @param {number} userId - 用户ID
   * @param {Object} [userInfo] - 用户信息
   * @returns {Promise<Object>} 包含 enabled, reason, strategy 的判定结果
   */
  static async evaluateStrategy(flag, userId, userInfo = null) {
    const strategy = flag.rollout_strategy

    switch (strategy) {
      case 'all':
        return { enabled: true, reason: 'all_users', strategy: 'all' }

      case 'percentage': {
        const percentage = flag.rollout_percentage
        const hash = this.hashUserId(userId, flag.flag_key)
        const inRange = hash < percentage
        return {
          enabled: inRange,
          reason: inRange ? 'percentage_included' : 'percentage_excluded',
          strategy: 'percentage',
          details: { percentage, hash: hash.toFixed(2) }
        }
      }

      case 'user_list':
        // 用户名单模式：仅白名单用户可用（已在前面处理）
        return { enabled: false, reason: 'user_list_excluded', strategy: 'user_list' }

      case 'user_segment': {
        const segments = flag.target_segments || []
        const userSegments = await this.getUserSegments(userId, userInfo)
        const hasMatch = segments.some(seg => userSegments.includes(seg))
        return {
          enabled: hasMatch,
          reason: hasMatch ? 'segment_matched' : 'segment_not_matched',
          strategy: 'user_segment',
          details: { targetSegments: segments, userSegments }
        }
      }

      case 'schedule':
        // 定时发布模式：仅按时间控制（已在时间窗口检查中处理）
        return { enabled: true, reason: 'schedule_active', strategy: 'schedule' }

      default:
        return { enabled: false, reason: 'unknown_strategy', strategy }
    }
  }

  /**
   * 计算用户ID的哈希值（用于百分比灰度）
   *
   * @param {number} userId - 用户ID
   * @param {string} flagKey - 功能键名（作为盐值）
   * @returns {number} 0-100 之间的值
   */
  static hashUserId(userId, flagKey) {
    const input = `${flagKey}:${userId}`
    const hash = crypto.createHash('md5').update(input).digest('hex')
    // 取前8位转为数字，模 10000 后除以 100 得到 0-100 的值
    const num = parseInt(hash.substring(0, 8), 16)
    return (num % 10000) / 100
  }

  /**
   * 获取用户所属的分群
   *
   * @param {number} userId - 用户ID
   * @param {Object} [userInfo] - 用户信息（如已有则复用）
   * @returns {Promise<string[]>} 用户所属分群列表
   */
  static async getUserSegments(userId, userInfo = null) {
    try {
      const user = userInfo || (await this.getUserModel().findByPk(userId))
      if (!user) return ['unknown']

      const segments = []

      // 基于 user_level 判断
      if (user.user_level) {
        segments.push(user.user_level) // vip, merchant, normal 等
      }

      // 新用户判断（注册30天内）
      if (user.created_at) {
        const daysSinceRegister = Math.floor(
          (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
        )
        if (daysSinceRegister <= 30) {
          segments.push('new_user')
        }
      }

      return segments.length > 0 ? segments : ['normal']
    } catch (error) {
      logger.error('[FeatureFlag] 获取用户分群失败', { userId, error: error.message })
      return ['unknown']
    }
  }

  // ==================== CRUD 操作 ====================

  /**
   * 创建功能开关
   *
   * @param {Object} flagData - 功能开关数据
   * @param {Object} operator - 操作人信息 { user_id, username }
   * @returns {Promise<FeatureFlag>} 创建的功能开关
   */
  static async createFlag(flagData, operator) {
    const FeatureFlag = this.getModel()

    try {
      // 检查 flag_key 是否已存在
      const existing = await FeatureFlag.findByKey(flagData.flag_key)
      if (existing) {
        throw new Error(`功能开关 ${flagData.flag_key} 已存在`)
      }

      // 创建记录
      const flag = await FeatureFlag.create({
        ...flagData,
        created_by: operator.user_id,
        updated_by: operator.user_id
      })

      // 记录审计日志
      await this.logAudit(OPERATION_TYPES.FEATURE_FLAG_CREATE, operator, {
        flag_id: flag.flag_id,
        flag_key: flag.flag_key,
        flag_name: flag.flag_name,
        is_enabled: flag.is_enabled,
        rollout_strategy: flag.rollout_strategy
      })

      // 清除缓存
      await this.invalidateFlagCache(flag.flag_key)

      logger.info('[FeatureFlag] 创建成功', {
        flag_key: flag.flag_key,
        operator_id: operator.user_id
      })

      return flag
    } catch (error) {
      logger.error('[FeatureFlag] 创建失败', { flagData, error: error.message })
      throw error
    }
  }

  /**
   * 更新功能开关
   *
   * @param {string} flagKey - 功能键名
   * @param {Object} updateData - 更新数据
   * @param {Object} operator - 操作人信息
   * @returns {Promise<FeatureFlag>} 更新后的功能开关
   */
  static async updateFlag(flagKey, updateData, operator) {
    const FeatureFlag = this.getModel()

    try {
      const flag = await FeatureFlag.findByKey(flagKey)
      if (!flag) {
        throw new Error(`功能开关 ${flagKey} 不存在`)
      }

      // 记录变更前的值
      const beforeData = {
        is_enabled: flag.is_enabled,
        rollout_strategy: flag.rollout_strategy,
        rollout_percentage: flag.rollout_percentage,
        whitelist_user_ids: flag.whitelist_user_ids,
        blacklist_user_ids: flag.blacklist_user_ids,
        target_segments: flag.target_segments,
        effective_start: flag.effective_start,
        effective_end: flag.effective_end
      }

      // 更新记录
      await flag.update({
        ...updateData,
        updated_by: operator.user_id
      })

      // 记录审计日志
      await this.logAudit(OPERATION_TYPES.FEATURE_FLAG_UPDATE, operator, {
        flag_id: flag.flag_id,
        flag_key: flag.flag_key,
        before: beforeData,
        after: updateData
      })

      // 清除缓存
      await this.invalidateFlagCache(flagKey)

      logger.info('[FeatureFlag] 更新成功', {
        flag_key: flagKey,
        operator_id: operator.user_id
      })

      return flag
    } catch (error) {
      logger.error('[FeatureFlag] 更新失败', { flagKey, updateData, error: error.message })
      throw error
    }
  }

  /**
   * 切换功能开关启用状态
   *
   * @param {string} flagKey - 功能键名
   * @param {boolean} enabled - 目标状态
   * @param {Object} operator - 操作人信息
   * @returns {Promise<FeatureFlag>} 更新后的功能开关
   */
  static async toggleFlag(flagKey, enabled, operator) {
    const FeatureFlag = this.getModel()

    try {
      const flag = await FeatureFlag.findByKey(flagKey)
      if (!flag) {
        throw new Error(`功能开关 ${flagKey} 不存在`)
      }

      const previousState = flag.is_enabled

      // 更新状态
      await flag.update({
        is_enabled: enabled,
        updated_by: operator.user_id
      })

      // 记录审计日志
      await this.logAudit(OPERATION_TYPES.FEATURE_FLAG_TOGGLE, operator, {
        flag_id: flag.flag_id,
        flag_key: flag.flag_key,
        previous_state: previousState,
        new_state: enabled
      })

      // 清除缓存
      await this.invalidateFlagCache(flagKey)

      logger.info('[FeatureFlag] 切换状态成功', {
        flag_key: flagKey,
        previous_state: previousState,
        new_state: enabled,
        operator_id: operator.user_id
      })

      return flag
    } catch (error) {
      logger.error('[FeatureFlag] 切换状态失败', { flagKey, enabled, error: error.message })
      throw error
    }
  }

  /**
   * 删除功能开关
   *
   * @param {string} flagKey - 功能键名
   * @param {Object} operator - 操作人信息
   * @returns {Promise<boolean>} 是否删除成功
   */
  static async deleteFlag(flagKey, operator) {
    const FeatureFlag = this.getModel()

    try {
      const flag = await FeatureFlag.findByKey(flagKey)
      if (!flag) {
        throw new Error(`功能开关 ${flagKey} 不存在`)
      }

      // 记录删除前的数据（用于审计）
      const flagData = flag.toJSON()

      // 删除记录
      await flag.destroy()

      // 记录审计日志
      await this.logAudit(OPERATION_TYPES.FEATURE_FLAG_DELETE, operator, {
        flag_id: flagData.flag_id,
        flag_key: flagData.flag_key,
        flag_name: flagData.flag_name,
        deleted_data: flagData
      })

      // 清除缓存
      await this.invalidateFlagCache(flagKey)

      logger.info('[FeatureFlag] 删除成功', {
        flag_key: flagKey,
        operator_id: operator.user_id
      })

      return true
    } catch (error) {
      logger.error('[FeatureFlag] 删除失败', { flagKey, error: error.message })
      throw error
    }
  }

  /**
   * 根据 flag_key 获取功能开关
   *
   * @param {string} flagKey - 功能键名
   * @param {Object} [options={}] - 选项
   * @param {boolean} [options.skipCache=false] - 是否跳过缓存
   * @returns {Promise<Object|null>} 功能开关记录或 null
   */
  static async getFlagByKey(flagKey, options = {}) {
    const FeatureFlag = this.getModel()

    try {
      // 尝试从缓存获取
      if (!options.skipCache) {
        const cached = await this.getCachedFlag(flagKey)
        if (cached) return cached
      }

      // 从数据库查询
      const flag = await FeatureFlag.findByKey(flagKey)

      // 缓存结果
      if (flag) {
        await this.cacheFlag(flag)
      }

      return flag
    } catch (error) {
      logger.error('[FeatureFlag] 获取失败', { flagKey, error: error.message })
      throw error
    }
  }

  /**
   * 获取所有功能开关列表
   *
   * @param {Object} [filters={}] - 筛选条件
   * @param {boolean} [filters.is_enabled] - 筛选启用状态
   * @param {string} [filters.rollout_strategy] - 筛选发布策略
   * @returns {Promise<Array>} 功能开关列表
   */
  static async getAllFlags(filters = {}) {
    const FeatureFlag = this.getModel()
    const flags = await FeatureFlag.findAllWithFilters(filters)

    // 转换为普通对象以便附加显示名称
    const flagsData = flags.map(f => (f.toJSON ? f.toJSON() : f))

    // 附加中文显示名称（rollout_strategy/fallback_behavior → _display/_color）
    await attachDisplayNames(flagsData, [
      { field: 'rollout_strategy', dictType: DICT_TYPES.ROLLOUT_STRATEGY },
      { field: 'fallback_behavior', dictType: DICT_TYPES.FALLBACK_BEHAVIOR }
    ])

    return flagsData
  }

  // ==================== 缓存管理 ====================

  /**
   * 获取缓存的 Flag 配置
   * @param {string} flagKey - 功能键名
   * @returns {Promise<Object|null>} 缓存的功能开关或 null
   */
  static async getCachedFlag(flagKey) {
    if (!(await isRedisHealthy())) return null

    try {
      const redis = getRedisClient()
      const key = `${CACHE_PREFIX}:config:${flagKey}`
      const data = await redis.get(key)
      if (!data) return null

      const parsed = JSON.parse(data)
      // 将缓存数据转换回模型实例
      const FeatureFlag = this.getModel()
      return FeatureFlag.build(parsed, { isNewRecord: false })
    } catch (error) {
      logger.warn('[FeatureFlag] 读取缓存失败', { flagKey, error: error.message })
      return null
    }
  }

  /**
   * 缓存 Flag 配置
   * @param {Object} flag - 功能开关记录
   * @returns {Promise<void>} 无返回值
   */
  static async cacheFlag(flag) {
    if (!(await isRedisHealthy())) return

    try {
      const redis = getRedisClient()
      const key = `${CACHE_PREFIX}:config:${flag.flag_key}`
      await redis.set(key, JSON.stringify(flag.toJSON()), FLAG_CACHE_TTL)
    } catch (error) {
      logger.warn('[FeatureFlag] 写入缓存失败', { flagKey: flag.flag_key, error: error.message })
    }
  }

  /**
   * 获取缓存的判定结果
   * @param {string} flagKey - 功能键名
   * @param {number} userId - 用户ID
   * @returns {Promise<Object|null>} 缓存的判定结果或 null
   */
  static async getCachedDecision(flagKey, userId) {
    if (!(await isRedisHealthy())) return null

    try {
      const redis = getRedisClient()
      const key = `${CACHE_PREFIX}:decision:${flagKey}:${userId}`
      const data = await redis.get(key)
      return data ? JSON.parse(data) : null
    } catch (error) {
      logger.warn('[FeatureFlag] 读取判定缓存失败', { flagKey, userId, error: error.message })
      return null
    }
  }

  /**
   * 缓存判定结果
   * @param {string} flagKey - 功能键名
   * @param {number} userId - 用户ID
   * @param {Object} result - 判定结果
   * @returns {Promise<void>} 无返回值
   */
  static async cacheDecision(flagKey, userId, result) {
    if (!(await isRedisHealthy())) return

    try {
      const redis = getRedisClient()
      const key = `${CACHE_PREFIX}:decision:${flagKey}:${userId}`
      await redis.set(key, JSON.stringify(result), DECISION_CACHE_TTL)
    } catch (error) {
      logger.warn('[FeatureFlag] 写入判定缓存失败', { flagKey, userId, error: error.message })
    }
  }

  /**
   * 清除指定 Flag 的所有缓存
   * @param {string} flagKey - 功能键名
   * @returns {Promise<void>} 无返回值
   */
  static async invalidateFlagCache(flagKey) {
    if (!(await isRedisHealthy())) return

    try {
      const redis = getRedisClient()
      // 清除配置缓存
      await redis.del(`${CACHE_PREFIX}:config:${flagKey}`)
      /*
       * 判定结果缓存会在 TTL 后自动过期（1分钟）
       * 对于紧急情况，管理员可以使用 skipCache=true 参数
       */
      logger.debug('[FeatureFlag] 配置缓存已清除', { flagKey })
    } catch (error) {
      logger.warn('[FeatureFlag] 清除缓存失败', { flagKey, error: error.message })
    }
  }

  // ==================== 审计日志 ====================

  /**
   * 记录审计日志
   * @param {string} operationType - 操作类型
   * @param {Object} operator - 操作人信息
   * @param {Object} details - 操作详情
   * @returns {Promise<void>} 无返回值
   */
  static async logAudit(operationType, operator, details) {
    try {
      const AuditService = this.getAuditService()

      // 根据操作类型映射到审计动作
      const actionMap = {
        [OPERATION_TYPES.FEATURE_FLAG_CREATE]: 'create',
        [OPERATION_TYPES.FEATURE_FLAG_UPDATE]: 'update',
        [OPERATION_TYPES.FEATURE_FLAG_DELETE]: 'delete',
        [OPERATION_TYPES.FEATURE_FLAG_TOGGLE]: 'toggle'
      }
      const action = actionMap[operationType] || 'unknown'

      /**
       * 生成幂等键：基于业务主键派生（flag_id + 操作类型 + 操作人）
       * 功能开关审计为非关键操作，幂等键格式：ff:{flag_id}:{action}:{operator_id}:{timestamp}
       */
      const idempotencyKey = `ff:${details.flag_id}:${action}:${operator.user_id}:${Date.now()}`

      // 使用 AuditLogService.logOperation 方法（统一审计日志接口）
      await AuditService.logOperation({
        operator_id: operator.user_id,
        operation_type: operationType,
        target_type: 'feature_flag',
        target_id: details.flag_id,
        action, // 必填字段：操作动作
        before_data: details.before || null,
        after_data: details.after || details,
        ip_address: operator.ip || '0.0.0.0',
        idempotency_key: idempotencyKey // 审计日志幂等键
      })
    } catch (error) {
      logger.error('[FeatureFlag] 审计日志记录失败', {
        operationType,
        details,
        error: error.message
      })
      // 审计失败不阻断业务
    }
  }

  // ==================== 批量操作 ====================

  /**
   * 批量检查多个功能开关状态
   *
   * @param {string[]} flagKeys - 功能键名列表
   * @param {number} userId - 用户ID
   * @returns {Promise<Object.<string, boolean>>} 键值对形式的结果
   */
  static async isEnabledBatch(flagKeys, userId) {
    const results = {}
    await Promise.all(
      flagKeys.map(async flagKey => {
        const result = await this.isEnabled(flagKey, userId)
        results[flagKey] = result.enabled
      })
    )
    return results
  }

  /**
   * 添加用户到白名单
   *
   * @param {string} flagKey - 功能键名
   * @param {number[]} userIds - 用户ID列表
   * @param {Object} operator - 操作人信息
   * @returns {Promise<Object>} 更新后的功能开关
   */
  static async addToWhitelist(flagKey, userIds, operator) {
    const flag = await this.getFlagByKey(flagKey, { skipCache: true })
    if (!flag) throw new Error(`功能开关 ${flagKey} 不存在`)

    const currentWhitelist = flag.whitelist_user_ids || []
    const newWhitelist = [...new Set([...currentWhitelist, ...userIds])]

    return this.updateFlag(flagKey, { whitelist_user_ids: newWhitelist }, operator)
  }

  /**
   * 从白名单移除用户
   *
   * @param {string} flagKey - 功能键名
   * @param {number[]} userIds - 用户ID列表
   * @param {Object} operator - 操作人信息
   * @returns {Promise<Object>} 更新后的功能开关
   */
  static async removeFromWhitelist(flagKey, userIds, operator) {
    const flag = await this.getFlagByKey(flagKey, { skipCache: true })
    if (!flag) throw new Error(`功能开关 ${flagKey} 不存在`)

    const currentWhitelist = flag.whitelist_user_ids || []
    const newWhitelist = currentWhitelist.filter(id => !userIds.includes(id))

    return this.updateFlag(flagKey, { whitelist_user_ids: newWhitelist }, operator)
  }

  /**
   * 添加用户到黑名单
   *
   * @param {string} flagKey - 功能键名
   * @param {number[]} userIds - 用户ID列表
   * @param {Object} operator - 操作人信息
   * @returns {Promise<Object>} 更新后的功能开关
   */
  static async addToBlacklist(flagKey, userIds, operator) {
    const flag = await this.getFlagByKey(flagKey, { skipCache: true })
    if (!flag) throw new Error(`功能开关 ${flagKey} 不存在`)

    const currentBlacklist = flag.blacklist_user_ids || []
    const newBlacklist = [...new Set([...currentBlacklist, ...userIds])]

    return this.updateFlag(flagKey, { blacklist_user_ids: newBlacklist }, operator)
  }

  /**
   * 从黑名单移除用户
   *
   * @param {string} flagKey - 功能键名
   * @param {number[]} userIds - 用户ID列表
   * @param {Object} operator - 操作人信息
   * @returns {Promise<Object>} 更新后的功能开关
   */
  static async removeFromBlacklist(flagKey, userIds, operator) {
    const flag = await this.getFlagByKey(flagKey, { skipCache: true })
    if (!flag) throw new Error(`功能开关 ${flagKey} 不存在`)

    const currentBlacklist = flag.blacklist_user_ids || []
    const newBlacklist = currentBlacklist.filter(id => !userIds.includes(id))

    return this.updateFlag(flagKey, { blacklist_user_ids: newBlacklist }, operator)
  }
}

module.exports = FeatureFlagService
