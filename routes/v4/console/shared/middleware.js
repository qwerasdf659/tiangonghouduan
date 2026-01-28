/**
 * Admin模块共享中间件和工具函数
 *
 * @description 提供admin子模块共用的中间件、初始化组件和工具函数
 * @version 4.0.0
 * @date 2025-09-24
 *
 * ⚠️ 架构收口规范：
 * - 本文件仅导出中间件、工具函数和共享组件
 * - 禁止导出 models / Op / BeijingTimeHelper 等基础依赖
 * - 新代码必须通过 ServiceManager 调用业务 Service
 * - 数据库操作必须收口到 Service 层，路由层禁止直连 models
 */

/*
 * P1-9：使用懒加载模式获取服务实例，避免顶部直接 require 服务
 * 抽奖引擎相关类 - 通过 ServiceManager 或懒加载获取
 */
const { requireRoleLevel, authenticateToken } = require('../../../../middleware/auth')
const { PERMISSION_LEVELS } = require('../../../../shared/permission-constants')
const logger = require('../../../../utils/logger').logger

// 共享组件 - 延迟初始化（首次访问时初始化）
let _sharedComponents = null

/**
 * 获取共享组件（懒加载模式）
 * @param {Object} serviceManager - 服务管理器实例（可选）
 * @returns {Object} 共享组件
 */
function getSharedComponents(serviceManager = null) {
  if (_sharedComponents) {
    return _sharedComponents
  }

  // P1-9：通过 ServiceManager 获取服务（如果可用）
  if (serviceManager) {
    try {
      _sharedComponents = {
        lotteryEngine: serviceManager.getService('unified_lottery_engine'),
        performanceMonitor: serviceManager.getService('performance_monitor'),
        logger
      }
      return _sharedComponents
    } catch (error) {
      logger.warn('通过 ServiceManager 获取服务失败，使用直接实例化:', error.message)
    }
  }

  // 降级方案：直接 require 并实例化
  const {
    UnifiedLotteryEngine
  } = require('../../../../services/UnifiedLotteryEngine/UnifiedLotteryEngine')
  const DrawOrchestrator = require('../../../../services/UnifiedLotteryEngine/pipeline/DrawOrchestrator')
  const ManagementStrategy = require('../../../../services/UnifiedLotteryEngine/strategies/ManagementStrategy')
  const PerformanceMonitor = require('../../../../services/UnifiedLotteryEngine/utils/PerformanceMonitor')

  _sharedComponents = {
    lotteryEngine: new UnifiedLotteryEngine(),
    /**
     * V4.6 管线编排器（2026-01-19 Phase 5 迁移）
     *
     * drawOrchestrator: 抽奖执行入口（替代原 basic_guarantee_strategy）
     * managementStrategy: 管理操作 API（forceWin/forceLose 等）- 继续保留
     */
    drawOrchestrator: new DrawOrchestrator(),
    managementStrategy: new ManagementStrategy(),
    performanceMonitor: new PerformanceMonitor(),
    logger
  }
  return _sharedComponents
}

/**
 * 懒加载组件封装：提供 sharedComponents 统一入口
 * 通过 getter 实现懒加载，首次访问时初始化组件
 * @type {Object}
 */
const sharedComponents = {
  /**
   * 获取抽奖引擎实例
   * @returns {Object} 抽奖引擎实例
   */
  get lotteryEngine() {
    return getSharedComponents().lotteryEngine
  },
  /**
   * V4.6 管线编排器（2026-01-19 Phase 5 迁移）
   *
   * 获取管线编排器实例（抽奖执行入口）
   *
   * @returns {Object} 管线编排器实例
   */
  get drawOrchestrator() {
    return getSharedComponents().drawOrchestrator
  },
  /**
   * 获取管理策略实例（管理操作 API）
   *
   * 用途：forceWin/forceLose/getUserStatus/clearUserSettings 等管理操作
   *
   * @returns {Object} 管理策略实例
   */
  get managementStrategy() {
    return getSharedComponents().managementStrategy
  },
  /**
   * 获取性能监控器实例
   * @returns {Object} 性能监控器实例
   */
  get performanceMonitor() {
    return getSharedComponents().performanceMonitor
  },
  /**
   * 获取日志记录器
   * @returns {Object} 日志记录器
   */
  get logger() {
    return logger
  }
}

/**
 * ✅ 简化的系统统计函数 - 通过ReportingService获取统计数据
 *
 * @description 使用Service层统一管理数据访问，符合V4架构规范（P2-C架构重构版）
 * @param {Object} serviceManager - 服务管理器实例
 * @returns {Promise<Object>} 简化的系统统计信息
 */
async function getSimpleSystemStats(serviceManager) {
  try {
    // ✅ 通过ServiceManager获取ReportingService（P2-C架构重构：已合并AdminAnalyticsService、StatisticsService、UserDashboardService）
    const ReportingService = serviceManager.getService('reporting')

    // ✅ 调用Service方法，不再直连models
    return await ReportingService.getSimpleSystemStats()
  } catch (error) {
    sharedComponents.logger.error('获取系统统计失败:', error)
    throw error
  }
}

/**
 * 管理员权限验证中间件组合（仅admin可访问）
 * 用于写操作和敏感数据
 */
const adminAuthMiddleware = [authenticateToken, requireRoleLevel(100)]

/**
 * 运营及以上权限验证中间件组合（role_level >= 30）
 *
 * @description 用于 P1 优先级只读 API
 * @note 2026-01-27 架构升级：使用 requireRoleLevel(30) 替代 requireRole(['admin', 'ops'])
 *
 * 可访问角色（role_level >= 30）：
 * - admin (100)
 * - regional_manager (80)
 * - business_manager (60)
 * - sales_staff (40)
 * - merchant_manager (40)
 * - ops (30)
 */
const adminOpsAuthMiddleware = [authenticateToken, requireRoleLevel(PERMISSION_LEVELS.OPS)]

/**
 * 错误处理包装器
 * @param {Function} fn 异步处理函数
 * @returns {Function} 包装后的中间件函数
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

/**
 * 参数验证工具集合
 *
 * 业务场景：管理员API参数验证，确保数据合法性
 *
 * 核心功能：
 * - 用户ID验证（validateUserId）
 * - 积分调整参数验证（validatePointsAdjustment）
 * - 奖品池配置验证（validatePrizePool）
 */
const validators = {
  /**
   * 验证用户ID的有效性
   *
   * 业务场景：管理员操作用户数据前，验证用户ID是否合法
   *
   * @param {string|number} user_id - 用户ID（可以是字符串或数字）
   * @returns {number} 解析后的用户ID（整数）
   *
   * @throws {Error} 当user_id为空或无法转换为整数时抛出错误
   *
   * @example
   * const validUserId = validators.validateUserId('10001') // 返回: 10001
   * const validUserId2 = validators.validateUserId(10001)  // 返回: 10001
   * // validators.validateUserId('abc')  // 抛出错误: 无效的用户ID
   */
  validateUserId: user_id => {
    if (!user_id || isNaN(parseInt(user_id))) {
      throw new Error('无效的用户ID')
    }
    return parseInt(user_id)
  },

  /**
   * 验证奖品ID的有效性
   *
   * @description 验证奖品ID是否合法（用于概率调整、强制中奖等功能）
   * @param {string|number} prize_id - 奖品ID
   * @returns {number} 解析后的奖品ID（整数）
   * @throws {Error} 当prize_id为空或无法转换为整数时抛出错误
   */
  validatePrizeId: prize_id => {
    if (!prize_id || isNaN(parseInt(prize_id))) {
      throw new Error('无效的奖品ID')
    }
    return parseInt(prize_id)
  },

  /**
   * 验证积分调整参数的有效性
   *
   * 业务场景：管理员手动调整用户积分前，验证积分数量和调整原因是否合法
   *
   * 业务规则：
   * - 积分数量必须是有效整数（可以是正数或负数）
   * - 调整原因必须提供且不能为空字符串
   * - 调整原因会记录到asset_transactions表的transaction_title字段
   *
   * @param {string|number} points - 积分数量（正数增加，负数扣减）
   * @param {string} reason - 调整原因（必填，会记录到交易记录）
   * @returns {Object} 验证后的参数对象
   * @returns {number} return.points - 解析后的积分数量（整数）
   * @returns {string} return.reason - 清理后的调整原因（去除前后空格）
   *
   * @throws {Error} 当积分数量无效或调整原因为空时抛出错误
   *
   * @example
   * const validated = validators.validatePointsAdjustment(100, '活动奖励')
   * // 返回: { points: 100, reason: '活动奖励' }
   *
   * const validated2 = validators.validatePointsAdjustment('-50', '  违规扣分  ')
   * // 返回: { points: -50, reason: '违规扣分' }
   *
   * // validators.validatePointsAdjustment(100, '')  // 抛出错误: 必须提供调整原因
   */
  validatePointsAdjustment: (points, reason) => {
    if (!points || isNaN(parseInt(points))) {
      throw new Error('无效的积分数量')
    }
    if (!reason || reason.trim().length === 0) {
      throw new Error('必须提供调整原因')
    }
    return {
      points: parseInt(points),
      reason: reason.trim()
    }
  },

  /**
   * 验证奖品池配置参数的有效性
   *
   * 业务场景：管理员配置抽奖活动奖品池前，验证奖品配置是否完整合法
   *
   * 业务规则：
   * - 奖品列表不能为空（至少包含1个奖品）
   * - 每个奖品必须包含：name（名称）、type（类型）、quantity（数量）
   * - 奖品数量必须为正整数（>0）
   * - 奖品类型包括：points（积分）、physical（实物）、coupon（优惠券）等
   *
   * @param {Array<Object>} prizes - 奖品配置数组
   * @param {string} prizes[].name - 奖品名称（必填，如"100积分"）
   * @param {string} prizes[].type - 奖品类型（必填，如"points"）
   * @param {number} prizes[].quantity - 奖品库存数量（必填，正整数）
   * @returns {boolean} 验证通过返回true
   *
   * @throws {Error} 当奖品列表为空、奖品信息不完整或数量无效时抛出错误
   *
   * @example
   * const prizes = [
   *   { name: '100积分', type: 'points', quantity: 100 },
   *   { name: '优惠券', type: 'coupon', quantity: 50 }
   * ]
   * validators.validatePrizePool(prizes)  // 返回: true
   *
   * // validators.validatePrizePool([])  // 抛出错误: 奖品列表不能为空
   * // validators.validatePrizePool([{ name: '奖品' }])  // 抛出错误: 奖品信息不完整
   */
  validatePrizePool: prizes => {
    if (!Array.isArray(prizes) || prizes.length === 0) {
      throw new Error('奖品列表不能为空')
    }

    for (const prize of prizes) {
      if (!prize.name || !prize.type || !prize.quantity) {
        throw new Error('奖品信息不完整')
      }
      if (isNaN(parseInt(prize.quantity)) || parseInt(prize.quantity) <= 0) {
        throw new Error('奖品数量必须为正整数')
      }
    }
    return true
  }
}

module.exports = {
  sharedComponents,
  getSimpleSystemStats,
  adminAuthMiddleware,
  adminOpsAuthMiddleware, // 🆕 P1只读API中间件（admin+ops，ops只读）
  asyncHandler,
  validators
  /**
   * ✅ models / Op / BeijingTimeHelper 已移除
   * 新代码必须通过 ServiceManager 调用业务 Service
   */
}
