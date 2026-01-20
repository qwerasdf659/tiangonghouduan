/**
 * @file 用户高级空间状态查询服务 - P2表只读查询API
 * @description 提供用户高级空间状态的只读查询功能
 *
 * 覆盖P2优先级表：
 * - user_premium_status: 用户高级空间状态表
 *
 * 架构原则：
 * - 只读查询服务，不涉及写操作
 * - 所有方法均为查询方法，无需事务管理
 * - 严格遵循项目snake_case命名规范
 *
 * @version 1.0.0
 * @date 2026-01-21
 */

'use strict'

const { Op } = require('sequelize')
const logger = require('../utils/logger').logger

/**
 * 用户高级空间状态查询服务
 * 提供user_premium_status表的只读查询API
 */
class UserPremiumQueryService {
  /**
   * 构造函数
   * @param {Object} models - Sequelize模型集合
   */
  constructor(models) {
    this.models = models
    this.logger = logger
  }

  /**
   * 查询用户高级空间状态列表
   *
   * @param {Object} options - 查询参数
   * @param {number} [options.user_id] - 用户ID
   * @param {boolean} [options.is_unlocked] - 是否已解锁
   * @param {string} [options.unlock_method] - 解锁方式（points/exchange/vip/manual）
   * @param {boolean} [options.is_valid] - 是否在有效期内
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 用户高级空间状态列表和分页信息
   */
  async getPremiumStatuses(options = {}) {
    const { user_id, is_unlocked, unlock_method, is_valid, page = 1, page_size = 20 } = options

    const where = {}
    if (user_id) where.user_id = user_id
    if (is_unlocked !== undefined) where.is_unlocked = is_unlocked
    if (unlock_method) where.unlock_method = unlock_method

    // 有效期过滤
    if (is_valid !== undefined) {
      const now = new Date()
      if (is_valid) {
        where.is_unlocked = true
        where.expires_at = { [Op.gt]: now }
      } else {
        where[Op.or] = [{ is_unlocked: false }, { expires_at: { [Op.lte]: now } }]
      }
    }

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.UserPremiumStatus.findAndCountAll({
      where,
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile', 'history_total_points']
        }
      ],
      order: [['updated_at', 'DESC']],
      limit: page_size,
      offset
    })

    // 添加计算字段
    const statuses = rows.map(row => {
      const plain = row.get({ plain: true })
      const now = new Date()
      return {
        ...plain,
        is_valid: plain.is_unlocked && plain.expires_at && new Date(plain.expires_at) > now,
        remaining_hours: row.getRemainingHours ? row.getRemainingHours() : 0
      }
    })

    return {
      statuses,
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 获取单个用户的高级空间状态
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Object|null>} 用户高级空间状态或null
   */
  async getUserPremiumStatus(user_id) {
    const status = await this.models.UserPremiumStatus.findOne({
      where: { user_id },
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile', 'history_total_points']
        }
      ]
    })

    if (!status) return null

    const plain = status.get({ plain: true })
    const now = new Date()

    return {
      ...plain,
      is_valid: plain.is_unlocked && plain.expires_at && new Date(plain.expires_at) > now,
      remaining_hours: status.getRemainingHours ? status.getRemainingHours() : 0,
      remaining_minutes: status.getRemainingMinutes ? status.getRemainingMinutes() : 0
    }
  }

  /**
   * 获取高级空间状态统计汇总
   *
   * @returns {Promise<Object>} 统计汇总数据
   */
  async getPremiumStats() {
    const { fn, col } = require('sequelize')
    const now = new Date()

    // 总体统计
    const totalStats = await this.models.UserPremiumStatus.findOne({
      attributes: [
        [fn('COUNT', col('id')), 'total_records'],
        [fn('SUM', col('total_unlock_count')), 'total_unlock_count']
      ],
      raw: true
    })

    // 当前已解锁用户数
    const activeCount = await this.models.UserPremiumStatus.count({
      where: {
        is_unlocked: true,
        expires_at: { [Op.gt]: now }
      }
    })

    // 已过期用户数
    const expiredCount = await this.models.UserPremiumStatus.count({
      where: {
        is_unlocked: true,
        expires_at: { [Op.lte]: now }
      }
    })

    // 按解锁方式统计
    const methodStats = await this.models.UserPremiumStatus.findAll({
      attributes: ['unlock_method', [fn('COUNT', col('id')), 'count']],
      where: {
        is_unlocked: true,
        expires_at: { [Op.gt]: now }
      },
      group: ['unlock_method'],
      raw: true
    })

    return {
      summary: {
        total_records: parseInt(totalStats?.total_records) || 0,
        total_unlock_count: parseInt(totalStats?.total_unlock_count) || 0,
        active_users: activeCount,
        expired_users: expiredCount
      },
      by_unlock_method: methodStats.reduce((acc, item) => {
        acc[item.unlock_method] = parseInt(item.count) || 0
        return acc
      }, {})
    }
  }

  /**
   * 获取即将过期的用户列表
   *
   * @param {number} hours - 在多少小时内即将过期（默认24小时）
   * @param {number} [page=1] - 页码
   * @param {number} [page_size=20] - 每页数量
   * @returns {Promise<Object>} 即将过期用户列表和分页信息
   */
  async getExpiringUsers(hours = 24, page = 1, page_size = 20) {
    const now = new Date()
    const expiryThreshold = new Date(now.getTime() + hours * 60 * 60 * 1000)

    const offset = (page - 1) * page_size

    const { count, rows } = await this.models.UserPremiumStatus.findAndCountAll({
      where: {
        is_unlocked: true,
        expires_at: {
          [Op.gt]: now,
          [Op.lte]: expiryThreshold
        }
      },
      include: [
        {
          model: this.models.User,
          as: 'user',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      order: [['expires_at', 'ASC']],
      limit: page_size,
      offset
    })

    const statuses = rows.map(row => {
      const plain = row.get({ plain: true })
      return {
        ...plain,
        remaining_hours: row.getRemainingHours ? row.getRemainingHours() : 0,
        remaining_minutes: row.getRemainingMinutes ? row.getRemainingMinutes() : 0
      }
    })

    return {
      statuses,
      pagination: {
        total_count: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }
}

module.exports = UserPremiumQueryService
