/**
 * 📋 用户分层规则配置 - 统一抽奖架构核心组件
 * 创建时间：2026年01月18日 北京时间
 *
 * 业务职责：
 * - 定义用户分层规则（segment_key 的计算逻辑）
 * - 支持多版本配置，便于灰度发布和回滚
 * - 通过 lottery_strategy_config 表的 segment.resolver_version 指定使用哪个版本
 *
 * 核心规则（DR-15）：
 * - segment_key 不是数据库表字段，是代码级策略
 * - 存储在本配置文件中，版本化管理
 * - 相同版本的规则必须保持稳定，不可变更
 * - 新增规则必须使用新版本号
 *
 * 使用方式：
 * 1. lottery_strategy_config 配置 segment.resolver_version = 'v1'
 * 2. 抽奖时调用 resolveSegment('v1', user) 获取 segment_key
 * 3. 根据 segment_key 查询 lottery_tier_rules 表获取档位权重
 */

'use strict'

/**
 * 分层规则版本配置
 * 每个版本包含一组有序的规则，按优先级从高到低执行
 * 第一个匹配的规则决定用户的 segment_key
 */
const SEGMENT_RULE_VERSIONS = {
  /**
   * 默认版本 - 最基础的分层策略
   * 所有用户使用相同的档位概率配置
   * 适用场景：不需要用户分层的活动
   */
  default: {
    version: 'default',
    description: '默认分层策略 - 所有用户使用相同配置',
    rules: [
      {
        segment_key: 'default',
        description: '所有用户',
        condition: () => true, // 总是匹配
        priority: 0
      }
    ]
  },

  /**
   * V1版本 - 基于注册时间的新老用户分层
   * 新用户（注册7天内）享受更高的高档位概率
   * 适用场景：新用户激励活动
   */
  v1: {
    version: 'v1',
    description: '新老用户分层策略（注册7天内为新用户）',
    rules: [
      {
        segment_key: 'new_user',
        description: '新用户（注册7天内）',
        condition: user => {
          if (!user || !user.created_at) return false
          const createdAt = new Date(user.created_at)
          const now = new Date()
          const daysDiff = (now - createdAt) / (1000 * 60 * 60 * 24)
          return daysDiff <= 7
        },
        priority: 10
      },
      {
        segment_key: 'regular_user',
        description: '普通用户（注册超过7天）',
        condition: () => true,
        priority: 0
      }
    ]
  },

  /**
   * V2版本 - 基于消费等级的VIP分层
   * VIP用户享受更高的高档位概率
   * 适用场景：VIP用户激励活动
   */
  v2: {
    version: 'v2',
    description: 'VIP用户分层策略（基于历史消费积分）',
    rules: [
      {
        segment_key: 'vip_premium',
        description: '高级VIP（历史积分≥100000）',
        condition: user => {
          if (!user) return false
          return (user.history_total_points || 0) >= 100000
        },
        priority: 20
      },
      {
        segment_key: 'vip_basic',
        description: '普通VIP（历史积分≥10000）',
        condition: user => {
          if (!user) return false
          return (user.history_total_points || 0) >= 10000
        },
        priority: 10
      },
      {
        segment_key: 'regular_user',
        description: '普通用户',
        condition: () => true,
        priority: 0
      }
    ]
  },

  /**
   * V3版本 - 组合分层策略（新用户 + VIP）
   * 同时考虑注册时间和消费等级
   * 适用场景：综合性运营活动
   */
  v3: {
    version: 'v3',
    description: '组合分层策略（新用户 + VIP + 普通）',
    rules: [
      {
        segment_key: 'new_vip',
        description: '新VIP用户（注册7天内且历史积分≥10000）',
        condition: user => {
          if (!user || !user.created_at) return false
          const createdAt = new Date(user.created_at)
          const now = new Date()
          const daysDiff = (now - createdAt) / (1000 * 60 * 60 * 24)
          const isNew = daysDiff <= 7
          const isVip = (user.history_total_points || 0) >= 10000
          return isNew && isVip
        },
        priority: 30
      },
      {
        segment_key: 'new_user',
        description: '新用户（注册7天内）',
        condition: user => {
          if (!user || !user.created_at) return false
          const createdAt = new Date(user.created_at)
          const now = new Date()
          const daysDiff = (now - createdAt) / (1000 * 60 * 60 * 24)
          return daysDiff <= 7
        },
        priority: 20
      },
      {
        segment_key: 'vip_user',
        description: 'VIP用户（历史积分≥10000）',
        condition: user => {
          if (!user) return false
          return (user.history_total_points || 0) >= 10000
        },
        priority: 10
      },
      {
        segment_key: 'regular_user',
        description: '普通用户',
        condition: () => true,
        priority: 0
      }
    ]
  },

  /**
   * V4版本 - 活跃度分层策略
   * 基于用户最近活跃情况进行分层
   * 适用场景：召回活动、活跃用户激励
   */
  v4: {
    version: 'v4',
    description: '活跃度分层策略（基于最后活跃时间）',
    rules: [
      {
        segment_key: 'highly_active',
        description: '高活跃用户（7天内有活动）',
        condition: user => {
          if (!user) return false
          // 优先使用 last_active_at，回退到 updated_at
          const lastActiveTime = user.last_active_at || user.updated_at
          if (!lastActiveTime) return false
          const lastActive = new Date(lastActiveTime)
          const now = new Date()
          const daysDiff = (now - lastActive) / (1000 * 60 * 60 * 24)
          return daysDiff <= 7
        },
        priority: 20
      },
      {
        segment_key: 'moderately_active',
        description: '中等活跃用户（30天内有活动）',
        condition: user => {
          if (!user) return false
          // 优先使用 last_active_at，回退到 updated_at
          const lastActiveTime = user.last_active_at || user.updated_at
          if (!lastActiveTime) return false
          const lastActive = new Date(lastActiveTime)
          const now = new Date()
          const daysDiff = (now - lastActive) / (1000 * 60 * 60 * 24)
          return daysDiff <= 30
        },
        priority: 10
      },
      {
        segment_key: 'inactive_user',
        description: '不活跃用户（超过30天无活动）',
        condition: () => true,
        priority: 0
      }
    ]
  }
}

/**
 * SegmentResolver - 用户分层解析器
 *
 * 核心功能：
 * - 根据版本和用户信息解析出 segment_key
 * - 支持规则优先级排序和条件匹配
 * - 提供版本验证和规则查询能力
 */
class SegmentResolver {
  /**
   * 解析用户的分层标识
   *
   * 优先读取数据库 segment_rule_configs 表的自定义规则，
   * 未找到时回退到内置硬编码规则
   *
   * @param {string} version - 分层规则版本（如 'default', 'v1', 'v2'）
   * @param {Object} user - 用户对象（包含 created_at, history_total_points 等字段）
   * @returns {string} segment_key - 用户的分层标识
   *
   * @example
   * const segmentKey = SegmentResolver.resolveSegment('v1', user)
   */
  static async resolveSegment(version, user) {
    return SegmentResolver.resolveSegmentAsync(version, user)
  }

  /**
   * 异步版本：优先从数据库加载规则，回退到内置规则
   * 供 TierPickStage 等需要异步的场景使用
   *
   * @param {string} version - 分层规则版本
   * @param {Object} user - 用户对象
   * @returns {Promise<string>} segment_key
   */
  static async resolveSegmentAsync(version, user) {
    try {
      const { SegmentRuleConfig } = require('../models')
      const { SEGMENT_FIELD_REGISTRY } = require('./segment_field_registry')

      const dbConfig = await SegmentRuleConfig.findOne({
        where: { version_key: version, status: 'active' }
      })

      if (dbConfig && dbConfig.rules) {
        return SegmentResolver._evaluateConditions(dbConfig.rules, user, SEGMENT_FIELD_REGISTRY)
      }
    } catch {
      // 数据库查询失败（如表不存在），静默回退到内置规则
    }

    return SegmentResolver._resolveFromBuiltinRules(version, user)
  }

  /**
   * 通用条件求值器 — 解析数据库中运营搭建的条件 JSON 并执行
   * @param {Array} rules - 规则数组
   * @param {Object} user - 用户对象
   * @param {Object} registry - 字段运算符注册表
   * @returns {string} segment_key
   * @private
   */
  static _evaluateConditions(rules, user, registry) {
    const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0))

    for (const rule of sorted) {
      if (!rule.conditions || rule.conditions.length === 0) {
        return rule.segment_key
      }

      const results = rule.conditions.map(cond => {
        const fieldValue = user?.[cond.field]
        const operator = registry.operators[cond.operator]
        if (!operator) return false
        return operator.evaluate(fieldValue, cond.value)
      })

      const matched = rule.logic === 'OR' ? results.some(r => r) : results.every(r => r)

      if (matched) return rule.segment_key
    }

    return 'default'
  }

  /**
   * 从内置硬编码规则解析（同步版本，保持向后兼容）
   * @param {string} version - 分层规则版本
   * @param {Object} user - 用户对象
   * @returns {string} segment_key
   * @private
   */
  static _resolveFromBuiltinRules(version, user) {
    const config = SEGMENT_RULE_VERSIONS[version]

    if (!config) {
      console.warn(`[SegmentResolver] 未知的分层版本: ${version}，使用默认版本`)
      return SegmentResolver._resolveFromBuiltinRules('default', user)
    }

    const sortedRules = [...config.rules].sort((a, b) => b.priority - a.priority)

    for (const rule of sortedRules) {
      try {
        if (rule.condition(user)) {
          return rule.segment_key
        }
      } catch (error) {
        console.error(`[SegmentResolver] 规则执行错误: ${rule.segment_key}`, error.message)
      }
    }

    return 'default'
  }

  /**
   * 验证分层版本是否存在
   *
   * @param {string} version - 分层规则版本
   * @returns {boolean} 是否存在
   */
  static isValidVersion(version) {
    return Object.prototype.hasOwnProperty.call(SEGMENT_RULE_VERSIONS, version)
  }

  /**
   * 获取所有可用的分层版本列表
   *
   * @returns {Array<Object>} 版本列表（包含版本号和描述）
   */
  static getAvailableVersions() {
    return Object.entries(SEGMENT_RULE_VERSIONS).map(([key, config]) => ({
      version: key,
      description: config.description,
      rules_count: config.rules.length
    }))
  }

  /**
   * 获取指定版本的规则配置
   *
   * @param {string} version - 分层规则版本
   * @returns {Object|null} 版本配置或 null
   */
  static getVersionConfig(version) {
    return SEGMENT_RULE_VERSIONS[version] || null
  }

  /**
   * 获取指定版本的所有 segment_key 列表
   *
   * @param {string} version - 分层规则版本
   * @returns {Array<string>} segment_key 列表
   */
  static getSegmentKeys(version) {
    const config = SEGMENT_RULE_VERSIONS[version]
    if (!config) return ['default']
    return config.rules.map(rule => rule.segment_key)
  }

  /**
   * 批量解析多个用户的分层标识
   *
   * @param {string} version - 分层规则版本
   * @param {Array<Object>} users - 用户对象数组
   * @returns {Map<number, string>} user_id 到 segment_key 的映射
   */
  static async batchResolveSegments(version, users) {
    const result = new Map()

    for (const user of users) {
      const segmentKey = await SegmentResolver.resolveSegmentAsync(version, user)
      result.set(user.user_id, segmentKey)
    }

    return result
  }

  /**
   * 统计用户分层分布（用于运营分析）
   *
   * @param {string} version - 分层规则版本
   * @param {Array<Object>} users - 用户对象数组
   * @returns {Object} 各分层用户数量统计
   */
  static async getSegmentDistribution(version, users) {
    const distribution = {}

    for (const user of users) {
      const segmentKey = await SegmentResolver.resolveSegmentAsync(version, user)
      distribution[segmentKey] = (distribution[segmentKey] || 0) + 1
    }

    return distribution
  }

  /**
   * 模拟解析（用于测试和预览）
   *
   * @param {string} version - 分层规则版本
   * @param {Object} mockUserData - 模拟的用户数据
   * @returns {Object} 解析结果（包含 segment_key 和匹配的规则信息）
   */
  static simulateResolve(version, mockUserData) {
    const config = SEGMENT_RULE_VERSIONS[version]

    if (!config) {
      return {
        success: false,
        error: `未知的分层版本: ${version}`
      }
    }

    const sortedRules = [...config.rules].sort((a, b) => b.priority - a.priority)

    for (const rule of sortedRules) {
      try {
        if (rule.condition(mockUserData)) {
          return {
            success: true,
            segment_key: rule.segment_key,
            matched_rule: {
              description: rule.description,
              priority: rule.priority
            },
            version_info: {
              version: config.version,
              description: config.description
            }
          }
        }
      } catch (error) {
        // 继续检查下一个规则
      }
    }

    return {
      success: true,
      segment_key: 'default',
      matched_rule: null,
      version_info: {
        version: config.version,
        description: config.description
      }
    }
  }
}

module.exports = {
  SEGMENT_RULE_VERSIONS,
  SegmentResolver
}
