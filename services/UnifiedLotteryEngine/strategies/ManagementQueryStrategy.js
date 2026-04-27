/**
 * 管理查询策略（ManagementQueryStrategy）- 从 ManagementStrategy 拆分
 *
 * 职责：查询类操作（获取用户管理状态、操作日志、策略状态）
 * 写操作保留在 ManagementStrategy.js 中
 *
 * 依赖：共享 ManagementStrategy 的缓存和日志实例
 */

const BusinessError = require('../../../utils/BusinessError')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { LotteryManagementSetting } = require('../../../models')
const { getUserRoles } = require('../../../middleware/auth')
const { User } = require('../../../models')
const { Op } = require('sequelize')

/**
 * 管理查询策略 - 处理查询类操作
 */
class ManagementQueryStrategy {
  /**
   * 创建管理查询策略实例
   * @param {Object} options - 配置选项
   * @param {Map} options.cache - 共享缓存实例
   * @param {number} options.cacheTTL - 缓存 TTL（毫秒）
   * @param {Object} options.logger - 日志器实例
   */
  constructor({ cache, cacheTTL, logger }) {
    this.cache = cache
    this.cacheTTL = cacheTTL
    this.logger = logger
  }

  /**
   * 获取用户的管理设置状态
   * @param {number} userId - 用户 ID
   * @returns {Promise<Object>} 各类型管理设置状态
   */
  async getUserManagementStatus(userId) {
    try {
      const status = {
        force_win: null,
        force_lose: null,
        probability_adjust: null,
        user_queue: null
      }

      const settingTypes = ['force_win', 'force_lose', 'probability_adjust', 'user_queue']

      for (const settingType of settingTypes) {
        const cacheKey = `user_${userId}_${settingType}`
        const cached = this.cache.get(cacheKey)

        if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
          status[settingType] = cached.data
          continue
        }

        // eslint-disable-next-line no-await-in-loop -- 配置项需要逐个查询和缓存
        const setting = await LotteryManagementSetting.findOne({
          where: {
            user_id: userId,
            setting_type: settingType,
            status: 'active'
          },
          order: [['created_at', 'DESC']]
        })

        if (setting && setting.isActive()) {
          status[settingType] = setting
          this.cache.set(cacheKey, {
            data: setting,
            timestamp: Date.now()
          })
        }
      }

      return status
    } catch (error) {
      this.logError('获取用户管理设置状态失败', { userId, error: error.message })
      throw error
    }
  }

  /**
   * 获取管理员操作日志
   * @param {number} adminId - 管理员 ID
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Object>} 分页操作日志
   */
  async getOperationLogs(adminId, filters = {}) {
    try {
      const hasAdminAccess = await this.checkAdminPermission(adminId)
      if (!hasAdminAccess) {
        throw new BusinessError('管理员权限验证失败', 'ENGINE_FAILED', 500)
      }

      return {
        logs: [],
        total: 0,
        page: filters.page || 1,
        limit: filters.limit || 20
      }
    } catch (error) {
      this.logError('获取管理员操作日志失败', { adminId, error: error.message })
      throw error
    }
  }

  /**
   * 检查管理员权限
   * @param {number} adminId - 管理员 ID
   * @returns {Promise<boolean>} 是否具有管理员权限
   */
  async checkAdminPermission(adminId) {
    try {
      const userRoles = await getUserRoles(adminId)
      if (userRoles.role_level < 100) {
        return false
      }
      const admin = await User.findByPk(adminId)
      if (!admin || admin.status !== 'active') {
        return false
      }
      return true
    } catch (error) {
      this.logError('检查管理员权限失败', { adminId, error: error.message })
      return false
    }
  }

  /**
   * 获取管理策略的运行状态
   * @returns {Promise<Object>} 策略状态信息
   */
  async getStatus() {
    try {
      const settingTypes = ['force_win', 'force_lose', 'probability_adjust', 'user_queue']
      const activeSettings = {
        force_win: 0,
        force_lose: 0,
        probability_adjust: 0,
        user_queue: 0,
        total: 0
      }

      for (const settingType of settingTypes) {
        try {
          // eslint-disable-next-line no-await-in-loop -- 统计各类型需要逐个查询
          const count = await LotteryManagementSetting.count({
            where: {
              setting_type: settingType,
              status: 'active',
              [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: new Date() } }]
            }
          })
          activeSettings[settingType] = count
          activeSettings.total += count
        } catch (countError) {
          this.logger.warn(`统计${settingType}设置数量失败`, { error: countError.message })
        }
      }

      const status = {
        strategy_name: 'ManagementStrategy',
        version: '4.1',
        status: 'active',
        cache_info: { size: this.cache.size, ttl_ms: this.cacheTTL },
        active_settings: activeSettings,
        timestamp: BeijingTimeHelper.now()
      }

      this.logger.debug('获取管理策略状态成功', {
        cache_size: status.cache_info.size,
        active_settings_total: status.active_settings.total
      })

      return status
    } catch (error) {
      this.logError('获取管理策略状态失败', { error: error.message })
      return {
        strategy_name: 'ManagementStrategy',
        version: '4.1',
        status: 'error',
        cache_info: { size: this.cache ? this.cache.size : 0, ttl_ms: this.cacheTTL || 300000 },
        active_settings: {
          force_win: 0,
          force_lose: 0,
          probability_adjust: 0,
          user_queue: 0,
          total: 0
        },
        error: error.message,
        timestamp: BeijingTimeHelper.now()
      }
    }
  }

  /**
   * 记录错误日志
   * @param {string} message - 错误消息
   * @param {Object} data - 附加数据
   * @returns {void}
   */
  logError(message, data) {
    this.logger.error(message, { ...data, timestamp: BeijingTimeHelper.now() })
  }
}

module.exports = ManagementQueryStrategy
