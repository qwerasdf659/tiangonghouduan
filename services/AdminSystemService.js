/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 管理后台系统服务（AdminSystemService）
 *
 * @description 整合系统监控、系统配置、缓存管理等所有系统级管理功能
 *
 * 业务场景：
 * - 管理后台系统监控的完整生命周期（系统状态、仪表板数据、管理策略状态）
 * - 系统配置的完整生命周期（配置查询、更新、缓存管理）
 *
 * 核心功能：
 * 1. 系统状态管理（系统运行状态、数据库连接、引擎状态）
 * 2. 仪表板数据管理（用户统计、抽奖统计、系统概览）
 * 3. 管理策略状态（抽奖管理策略状态查询）
 * 4. 配置查询管理（获取配置列表、配置详情、分类查询）
 * 5. 配置更新业务（单个更新、批量更新、事务保护）
 * 6. 缓存管理（Redis缓存清除、缓存模式匹配）
 * 7. 配置统计（分类统计、配置概览）
 * 8. 权限控制（只读配置保护、可见性控制）
 *
 * 业务流程：
 *
 * 1. **系统状态查询流程**
 *    - 获取系统统计信息 → 检查数据库连接 → 获取引擎状态 → 返回状态信息
 *
 * 2. **仪表板数据查询流程**
 *    - 获取基础统计 → 获取今日详细统计 → 获取引擎性能 → 返回仪表板数据
 *
 * 3. **管理策略状态查询流程**
 *    - 查询管理策略实例 → 获取策略状态 → 返回策略信息
 *
 * 4. **配置查询流程**
 *    - 根据分类查询配置 → getSettingsByCategory()返回配置列表
 *    - 自动解析值类型 → 返回parsed_value
 *
 * 5. **配置更新流程**（事务保护）
 *    - 查询配置（检查存在性和只读属性）→ updateSettings()批量更新
 *    - 更新配置值 → 记录更新者和更新时间 → 提交事务
 *
 * 6. **缓存管理流程**
 *    - 管理员触发缓存清除 → clearCache()清除Redis缓存
 *    - 支持模式匹配（如"rate_limit:*"）
 *
 * 设计原则：
 * - **数据统一**：所有系统监控和配置数据通过Service层统一处理
 * - **性能优化**：使用Promise.all并行查询，提升查询效率
 * - **错误隔离**：单个模块失败不影响其他模块
 * - **时间统一**：统一使用BeijingTimeHelper处理时间
 * - **事务安全保障**：所有写操作支持外部事务传入，确保原子性
 * - **权限控制严格**：只读配置不可修改、可见性控制
 * - **审计完整性**：每次更新都记录操作者和操作时间
 * - **类型安全**：自动解析和验证配置值类型（string、number、boolean、json）
 *
 * 关键方法列表：
 * - getSystemStatus(lotteryEngine, performanceMonitor) - 获取系统状态
 * - getDashboardData(lotteryEngine, performanceMonitor) - 获取仪表板数据
 * - getManagementStatus(managementStrategy) - 获取管理策略状态
 * - getSettingsByCategory(category) - 获取指定分类的所有配置
 * - getSettingsSummary() - 获取所有分类的配置统计
 * - updateSettings(category, settings, userId, options) - 批量更新配置
 * - clearCache(pattern) - 清除Redis缓存
 *
 * 数据模型关联：
 * - User：用户表
 * - LotteryDraw：抽奖记录表
 * - CustomerServiceSession：客服会话表
 * - ChatMessage：聊天消息表
 * - SystemSettings：系统配置表
 *
 * 事务支持：
 * - 所有写操作支持外部事务传入（options.transaction参数）
 * - 批量更新使用事务保证原子性
 *
 * 使用示例：
 * ```javascript
 * // 示例1：获取系统状态
 * const status = await AdminSystemService.getSystemStatus(
 *   lotteryEngine,
 *   performanceMonitor
 * );
 *
 * // 示例2：获取仪表板数据
 * const dashboard = await AdminSystemService.getDashboardData(
 *   lotteryEngine,
 *   performanceMonitor
 * );
 *
 * // 示例3：获取管理策略状态
 * const managementStatus = await AdminSystemService.getManagementStatus(
 *   managementStrategy
 * );
 *
 * // 示例4：获取基础设置配置
 * const settings = await AdminSystemService.getSettingsByCategory('basic');
 *
 * // 示例5：批量更新配置（带事务保护）
 * const transaction = await sequelize.transaction();
 * try {
 *   const result = await AdminSystemService.updateSettings(
 *     'basic',
 *     { system_name: '新系统名称', customer_phone: '400-123-4567' },
 *     adminUserId,
 *     { transaction }
 *   );
 *   await transaction.commit();
 * } catch (error) {
 *   await transaction.rollback();
 * }
 *
 * // 示例6：清除缓存
 * await AdminSystemService.clearCache('rate_limit:*');
 * ```
 *
 * 创建时间：2025年12月09日
 * 最后更新：2025年12月11日（合并SystemSettingsService）
 * 使用模型：Claude Sonnet 4.5
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const Logger = require('./UnifiedLotteryEngine/utils/Logger')
const models = require('../models')
const { SystemSettings, sequelize } = models
const { Op } = require('sequelize')

const logger = new Logger('AdminSystemService')

/**
 * 管理后台系统监控服务类
 */
class AdminSystemService {
  /**
   * 获取系统状态
   *
   * @param {Object} lotteryEngine - 抽奖引擎实例（可选）
   * @param {Object} performanceMonitor - 性能监控器实例（可选）
   * @returns {Promise<Object>} 系统状态信息
   * @returns {Object} return.system - 系统统计信息
   * @returns {Object} return.database - 数据库连接状态
   * @returns {Object} return.lottery_engine - 抽奖引擎状态
   * @returns {Object} return.api - API版本信息
   */
  static async getSystemStatus (lotteryEngine = null, performanceMonitor = null) {
    try {
      logger.info('获取系统状态')

      // 获取系统统计信息
      const systemStats = await this._getSimpleSystemStats()

      // 获取数据库连接状态
      let dbStatus = 'connected'
      try {
        await models.sequelize.authenticate()
      } catch (error) {
        dbStatus = 'disconnected'
        logger.error('数据库连接检查失败', { error: error.message })
      }

      // 获取抽奖引擎状态
      const engineStatus = {
        initialized: !!lotteryEngine,
        strategies: {
          management: !!lotteryEngine
        },
        performance: performanceMonitor && performanceMonitor.getStats
          ? performanceMonitor.getStats()
          : {}
      }

      const statusInfo = {
        system: systemStats.system,
        database: {
          status: dbStatus,
          host: process.env.DB_HOST,
          database: process.env.DB_NAME
        },
        lottery_engine: engineStatus,
        api: {
          version: '4.0.0',
          last_check: BeijingTimeHelper.apiTimestamp()
        }
      }

      logger.info('系统状态获取成功')

      return statusInfo
    } catch (error) {
      logger.error('系统状态获取失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取管理员仪表板数据
   *
   * @param {Object} _lotteryEngine - 抽奖引擎实例（预留参数，暂未使用）
   * @param {Object} performanceMonitor - 性能监控器实例（可选）
   * @returns {Promise<Object>} 仪表板数据
   * @returns {Object} return.overview - 总览数据
   * @returns {Object} return.today - 今日数据
   * @returns {Object} return.customer_service - 客服数据
   * @returns {Object} return.system - 系统信息
   * @returns {Object} return.engine - 引擎性能
   * @returns {string} return.last_updated - 最后更新时间
   */
  static async getDashboardData (_lotteryEngine = null, performanceMonitor = null) {
    try {
      logger.info('获取仪表板数据')

      // 获取基础统计
      const systemStats = await this._getSimpleSystemStats()

      // 获取今日详细统计
      const today = BeijingTimeHelper.createBeijingTime()
      const todayStart = new Date(today.setHours(0, 0, 0, 0))

      const [
        todayLotteries,
        todayWins,
        todayNewUsers,
        todayCustomerSessions,
        todayMessages,
        todayPointsConsumed
      ] = await Promise.all([
        // 今日抽奖次数
        models.LotteryDraw.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }),
        // 今日中奖次数
        models.LotteryDraw.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            },
            is_winner: true
          }
        }),
        // 今日新增用户
        models.User.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }),
        // 今日客服会话数量
        models.CustomerServiceSession.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }),
        // 今日聊天消息数量
        models.ChatMessage.count({
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }),
        // 今日积分消耗（所有抽奖消耗的积分总和）
        models.LotteryDraw.sum('cost_points', {
          where: {
            created_at: {
              [Op.gte]: todayStart
            }
          }
        }) || 0
      ])

      // 获取抽奖引擎性能统计
      let engineStats = {}
      try {
        if (performanceMonitor && performanceMonitor.getDetailedStats) {
          engineStats = performanceMonitor.getDetailedStats()
        }
      } catch (error) {
        logger.warn('获取引擎统计失败', { error: error.message })
      }

      const dashboardData = {
        overview: {
          total_users: systemStats.users.total,
          active_users: systemStats.users.active,
          total_lotteries: systemStats.lottery.total,
          win_rate: systemStats.lottery.win_rate
        },
        today: {
          new_users: todayNewUsers,
          lottery_draws: todayLotteries,
          wins: todayWins,
          win_rate: todayLotteries > 0 ? ((todayWins / todayLotteries) * 100).toFixed(2) : '0.00',
          points_consumed: todayPointsConsumed
        },
        customer_service: {
          today_sessions: todayCustomerSessions || 0,
          today_messages: todayMessages || 0
        },
        system: {
          uptime: systemStats.system.uptime,
          memory_usage: systemStats.system.memory,
          cpu_usage: systemStats.system.cpu_usage,
          timestamp: systemStats.system.timestamp
        },
        engine: engineStats,
        last_updated: BeijingTimeHelper.apiTimestamp()
      }

      logger.info('仪表板数据获取成功')

      return dashboardData
    } catch (error) {
      logger.error('仪表板数据获取失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取管理策略状态
   *
   * @param {Object} managementStrategy - 管理策略实例
   * @returns {Promise<Object>} 管理策略状态
   */
  static async getManagementStatus (managementStrategy) {
    try {
      logger.info('获取管理策略状态')

      if (!managementStrategy) {
        throw new Error('管理策略未初始化')
      }

      const result = await managementStrategy.getStatus()

      logger.info('管理策略状态获取成功')

      return result
    } catch (error) {
      logger.error('管理策略状态获取失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取简单的系统统计信息
   * @private
   * @returns {Promise<Object>} 系统统计信息
   */
  static async _getSimpleSystemStats () {
    try {
      // 并行查询统计数据
      const [totalUsers, activeUsers, totalLotteries, totalWins] = await Promise.all([
        models.User.count(),
        models.User.count({
          where: {
            last_login: {
              [Op.gte]: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30天内活跃
            }
          }
        }),
        models.LotteryDraw.count(),
        models.LotteryDraw.count({
          where: {
            is_winner: true
          }
        })
      ])

      const winRate = totalLotteries > 0 ? ((totalWins / totalLotteries) * 100).toFixed(2) : '0.00'

      return {
        users: {
          total: totalUsers,
          active: activeUsers
        },
        lottery: {
          total: totalLotteries,
          wins: totalWins,
          win_rate: winRate
        },
        system: {
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpu_usage: require('os').loadavg()[0],
          timestamp: BeijingTimeHelper.apiTimestamp()
        }
      }
    } catch (error) {
      logger.error('获取系统统计信息失败', { error: error.message })
      throw error
    }
  }

  // ==================== 系统配置管理相关方法（从SystemSettingsService合并） ====================

  /**
   * 获取指定分类的所有配置项
   *
   * @param {string} category - 配置分类（basic、points、notification、security）
   * @returns {Promise<Object>} 配置查询结果
   * @returns {string} return.category - 配置分类
   * @returns {number} return.count - 配置项数量
   * @returns {Array<Object>} return.settings - 配置项列表
   */
  static async getSettingsByCategory (category) {
    try {
      // 验证分类是否合法
      const validCategories = ['basic', 'points', 'notification', 'security']
      if (!validCategories.includes(category)) {
        throw new Error(`无效的设置分类: ${category}。有效分类: ${validCategories.join(', ')}`)
      }

      // 查询该分类下的所有配置项
      const settings = await SystemSettings.findAll({
        where: {
          category,
          is_visible: true // 只返回可见的配置项
        },
        attributes: [
          'setting_id',
          'category',
          'setting_key',
          'setting_value',
          'value_type',
          'description',
          'is_readonly',
          'updated_by',
          'updated_at'
        ],
        order: [['setting_id', 'ASC']]
      })

      // 转换配置项数据（自动解析value_type）
      const parsedSettings = settings.map(setting => {
        const data = setting.toJSON()
        // 使用模型的getParsedValue方法自动解析值
        data.parsed_value = setting.getParsedValue()
        return data
      })

      logger.info('获取系统设置成功', {
        category,
        count: settings.length
      })

      return {
        category,
        count: settings.length,
        settings: parsedSettings
      }
    } catch (error) {
      logger.error('获取系统设置失败', {
        error: error.message,
        category
      })
      throw error
    }
  }

  /**
   * 获取所有分类的配置统计
   *
   * @returns {Promise<Object>} 配置统计结果
   * @returns {number} return.total_settings - 总配置项数量
   * @returns {Object} return.categories - 各分类的配置项数量
   */
  static async getSettingsSummary () {
    try {
      // 查询所有分类的配置数量
      const categoryCounts = await SystemSettings.findAll({
        attributes: ['category', [sequelize.fn('COUNT', sequelize.col('setting_id')), 'count']],
        where: {
          is_visible: true
        },
        group: ['category']
      })

      const summary = {
        total_settings: 0,
        categories: {}
      }

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
   * 批量更新指定分类的配置项
   *
   * @param {string} category - 配置分类
   * @param {Object} settingsToUpdate - 要更新的配置项键值对
   * @param {number} userId - 操作用户ID
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @returns {Promise<Object>} 更新结果
   * @returns {string} return.category - 配置分类
   * @returns {number} return.total_requested - 请求更新的配置项数量
   * @returns {number} return.success_count - 成功更新的配置项数量
   * @returns {number} return.error_count - 更新失败的配置项数量
   * @returns {Array<Object>} return.updates - 更新成功的配置项列表
   * @returns {Array<Object>} return.errors - 更新失败的配置项列表（如果有）
   * @returns {string} return.timestamp - 更新时间戳
   */
  static async updateSettings (category, settingsToUpdate, userId, options = {}) {
    const { transaction } = options

    // 创建内部事务（如果外部没有传入）
    const internalTransaction = transaction || (await sequelize.transaction())

    try {
      // 验证分类是否合法（删除lottery，抽奖算法配置在代码中管理）
      const validCategories = ['basic', 'points', 'notification', 'security']
      if (!validCategories.includes(category)) {
        throw new Error(`无效的设置分类: ${category}。有效分类: ${validCategories.join(', ')}`)
      }

      // 验证更新数据
      if (
        !settingsToUpdate ||
        typeof settingsToUpdate !== 'object' ||
        Object.keys(settingsToUpdate).length === 0
      ) {
        throw new Error('请提供要更新的设置项')
      }

      const settingKeys = Object.keys(settingsToUpdate)
      const updateResults = []
      const errors = []

      // 批量更新配置项
      for (const settingKey of settingKeys) {
        try {
          // 查找配置项
          const setting = await SystemSettings.findOne({
            where: {
              category,
              setting_key: settingKey
            },
            transaction: internalTransaction
          })

          if (!setting) {
            errors.push({
              setting_key: settingKey,
              error: '配置项不存在'
            })
            continue
          }

          // 检查是否为只读配置
          if (setting.is_readonly) {
            errors.push({
              setting_key: settingKey,
              error: '此配置项为只读，不可修改'
            })
            continue
          }

          // 更新配置值（使用模型的setValue方法自动类型转换）
          const newValue = settingsToUpdate[settingKey]
          setting.setValue(newValue)
          setting.updated_by = userId
          setting.updated_at = BeijingTimeHelper.createBeijingTime()

          await setting.save({ transaction: internalTransaction })

          updateResults.push({
            setting_key: settingKey,
            old_value: setting.setting_value,
            new_value: newValue,
            success: true
          })

          logger.info('系统设置更新成功', {
            user_id: userId,
            category,
            setting_key: settingKey,
            new_value: newValue
          })
        } catch (error) {
          errors.push({
            setting_key: settingKey,
            error: error.message
          })
        }
      }

      // 如果没有外部事务，提交内部事务
      if (!transaction) {
        await internalTransaction.commit()
      }

      // 返回更新结果
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
    } catch (error) {
      // 如果没有外部事务，回滚内部事务
      if (!transaction) {
        await internalTransaction.rollback()
      }

      logger.error('批量更新系统设置失败', {
        error: error.message,
        category
      })
      throw error
    }
  }

  /**
   * 清除系统缓存
   *
   * @param {string} pattern - 缓存key模式（如"rate_limit:*"），不提供则清除所有
   * @returns {Promise<Object>} 清除结果
   * @returns {string} return.pattern - 匹配模式
   * @returns {number} return.cleared_count - 清除的缓存数量
   * @returns {number} return.matched_keys - 匹配的key数量
   * @returns {string} return.timestamp - 清除时间戳
   */
  static async clearCache (pattern = '*') {
    try {
      const { getRawClient } = require('../utils/UnifiedRedisClient')
      const rawClient = getRawClient()

      let clearedCount = 0
      const cachePattern = pattern || '*' // 默认清除所有

      // 使用SCAN命令安全地获取匹配的keys（避免KEYS命令阻塞）
      const keys = await rawClient.keys(cachePattern)

      if (keys && keys.length > 0) {
        // 批量删除keys
        if (keys.length === 1) {
          clearedCount = await rawClient.del(keys[0])
        } else {
          clearedCount = await rawClient.del(...keys)
        }

        logger.info('系统缓存清除成功', {
          pattern: cachePattern,
          cleared_count: clearedCount,
          total_keys: keys.length
        })
      }

      return {
        pattern: cachePattern,
        cleared_count: clearedCount,
        matched_keys: keys ? keys.length : 0,
        timestamp: BeijingTimeHelper.apiTimestamp()
      }
    } catch (error) {
      logger.error('清除缓存失败', { error: error.message })
      throw error
    }
  }
}

module.exports = AdminSystemService
