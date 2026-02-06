const logger = require('../utils/logger').logger

/**
 * 公告/通知统一服务层
 * 解决三套接口查询逻辑重复问题
 *
 * 服务对象:
 * - /api/v4/system/announcements* (用户端公告)
 * - /api/v4/notifications* (管理员通知中心)
 * - /api/v4/console/announcements* (后台内容管理)
 */

const { SystemAnnouncement, User } = require('../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')
const DataSanitizer = require('./DataSanitizer')
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')

/**
 * 公告服务类
 * @class AnnouncementService
 * @description 提供统一的公告查询、创建、更新、删除等操作，解决三套接口查询逻辑重复问题
 */
class AnnouncementService {
  /**
   * 统一的公告查询方法
   * @param {Object} options - 查询选项
   * @param {string} options.type - 公告类型 (system/notice/maintenance/all)
   * @param {string} options.priority - 优先级 (high/medium/low/all)
   * @param {boolean} options.activeOnly - 仅查询活跃公告 (默认true)
   * @param {boolean} options.filterExpired - 过滤过期公告 (默认true)
   * @param {number} options.limit - 数量限制 (默认20)
   * @param {number} options.offset - 偏移量 (默认0)
   * @param {string} options.dataLevel - 数据级别 (public/full)
   * @param {boolean} options.includeCreator - 是否关联创建者信息
   * @returns {Promise<Array>} 公告列表
   */
  static async getAnnouncements(options = {}) {
    const {
      type = null,
      priority = null,
      activeOnly = true,
      filterExpired = true,
      limit = 20,
      offset = 0,
      dataLevel = 'public',
      includeCreator = true
    } = options

    // 构建查询条件
    const whereClause = {}

    // 活跃状态过滤
    if (activeOnly) {
      whereClause.is_active = true
    }

    // 类型过滤
    if (type && type !== 'all') {
      whereClause.type = type
    }

    // 优先级过滤
    if (priority && priority !== 'all') {
      whereClause.priority = priority
    }

    // 过期时间过滤
    if (filterExpired) {
      whereClause[Op.or] = [
        { expires_at: null },
        { expires_at: { [Op.gt]: BeijingTimeHelper.createBeijingTime() } }
      ]
    }

    // 数据级别决定查询限制
    const maxLimit = dataLevel === 'full' ? 100 : 50
    const actualLimit = Math.min(parseInt(limit) || 20, maxLimit)

    // 执行查询
    const queryOptions = {
      where: whereClause,
      order: [
        ['priority', 'DESC'],
        ['created_at', 'DESC']
      ],
      limit: actualLimit,
      offset: parseInt(offset) || 0
    }

    // 关联创建者信息
    if (includeCreator) {
      queryOptions.include = [
        {
          model: User,
          as: 'creator',
          attributes: ['user_id', 'nickname']
        }
      ]
    }

    const announcements = await SystemAnnouncement.findAll(queryOptions)

    // 数据脱敏处理
    const plainAnnouncements = announcements.map(a => a.toJSON())

    // 附加中文显示名称（type/priority → _display/_color）
    await attachDisplayNames(plainAnnouncements, [
      { field: 'type', dictType: DICT_TYPES.ANNOUNCEMENT_TYPE },
      { field: 'priority', dictType: DICT_TYPES.PRIORITY }
    ])

    return DataSanitizer.sanitizeAnnouncements(plainAnnouncements, dataLevel)
  }

  /**
   * 获取公告总数（支持相同的过滤条件）
   * @param {Object} options - 查询选项（同getAnnouncements）
   * @returns {Promise<number>} 公告总数
   */
  static async getAnnouncementsCount(options = {}) {
    const { type = null, priority = null, activeOnly = true, filterExpired = true } = options

    const whereClause = {}

    if (activeOnly) whereClause.is_active = true
    if (type && type !== 'all') whereClause.type = type
    if (priority && priority !== 'all') whereClause.priority = priority

    if (filterExpired) {
      whereClause[Op.or] = [
        { expires_at: null },
        { expires_at: { [Op.gt]: BeijingTimeHelper.createBeijingTime() } }
      ]
    }

    return await SystemAnnouncement.count({ where: whereClause })
  }

  /**
   * 获取单个公告详情
   * @param {number} announcementId - 公告ID
   * @param {string} dataLevel - 数据级别 (public/full)
   * @returns {Promise<Object|null>} 公告详情
   */
  static async getAnnouncementById(announcementId, dataLevel = 'public') {
    const announcement = await SystemAnnouncement.findByPk(announcementId, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    if (!announcement) return null

    const plainAnnouncement = announcement.toJSON()
    const sanitized = DataSanitizer.sanitizeAnnouncements([plainAnnouncement], dataLevel)
    return sanitized[0]
  }

  /**
   * 增加公告浏览次数
   * @param {number} announcementId - 公告ID
   * @returns {Promise<boolean>} 是否成功
   */
  static async incrementViewCount(announcementId) {
    try {
      const announcement = await SystemAnnouncement.findByPk(announcementId)
      if (announcement) {
        await announcement.increment('view_count')
        return true
      }
      return false
    } catch (error) {
      logger.error('增加浏览次数失败:', error)
      return false
    }
  }

  /**
   * 转换为通知格式（用于管理员通知中心）
   * @param {Array} announcements - 公告列表
   * @returns {Array} 通知格式列表
   */
  static convertToNotificationFormat(announcements) {
    return announcements.map(ann => ({
      notification_id: ann.announcement_id,
      id: ann.announcement_id,
      type: ann.type,
      title: ann.title,
      content: ann.content,
      is_read: ann.view_count > 0,
      created_at: ann.created_at,
      priority: ann.priority,
      expires_at: ann.expires_at,
      creator: ann.creator
    }))
  }

  /**
   * 获取未读通知数量（管理员通知中心专用）
   * @param {Object} options - 查询选项
   * @returns {Promise<number>} 未读数量
   */
  static async getUnreadCount(options = {}) {
    const { type = null } = options

    const whereClause = {
      is_active: true,
      view_count: 0
    }

    if (type && type !== 'all') {
      whereClause.type = type
    }

    return await SystemAnnouncement.count({ where: whereClause })
  }

  /**
   * 批量标记已读（管理员通知中心专用）
   * @param {Array<number>} announcementIds - 公告ID数组
   * @returns {Promise<number>} 更新数量
   */
  static async markAsReadBatch(announcementIds = []) {
    if (announcementIds.length === 0) {
      // 全部标记已读
      const [affectedCount] = await SystemAnnouncement.update(
        { view_count: 1 },
        {
          where: {
            is_active: true,
            view_count: 0
          }
        }
      )
      return affectedCount
    } else {
      // 指定ID标记已读
      const [affectedCount] = await SystemAnnouncement.update(
        { view_count: 1 },
        {
          where: {
            announcement_id: { [Op.in]: announcementIds }
          }
        }
      )
      return affectedCount
    }
  }

  /**
   * 创建公告（管理员后台专用）
   * @param {Object} data - 公告数据
   * @param {number} creatorId - 创建者ID
   * @returns {Promise<Object>} 创建的公告
   */
  static async createAnnouncement(data, creatorId) {
    const {
      title,
      content,
      type = 'notice',
      priority = 'medium',
      expires_at = null,
      target_groups = null,
      internal_notes = null
    } = data

    const announcement = await SystemAnnouncement.create({
      title,
      content,
      type,
      priority,
      expires_at,
      target_groups,
      internal_notes,
      admin_id: creatorId,
      is_active: true,
      view_count: 0
    })

    return announcement.toJSON()
  }

  /**
   * 更新公告（管理员后台专用）
   * @param {number} announcementId - 公告ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object|null>} 更新后的公告
   */
  static async updateAnnouncement(announcementId, data) {
    const announcement = await SystemAnnouncement.findByPk(announcementId)
    if (!announcement) return null

    const allowedFields = ['title', 'content', 'type', 'priority', 'expires_at', 'is_active']
    const updateData = {}

    allowedFields.forEach(field => {
      if (data[field] !== undefined) {
        updateData[field] = data[field]
      }
    })

    await announcement.update(updateData)
    return announcement.toJSON()
  }

  /**
   * 删除公告（管理员后台专用）
   * @param {number} announcementId - 公告ID
   * @returns {Promise<boolean>} 是否成功
   */
  static async deleteAnnouncement(announcementId) {
    const announcement = await SystemAnnouncement.findByPk(announcementId)
    if (!announcement) return false

    await announcement.destroy()
    return true
  }

  /**
   * 批量停用公告（设置为不活跃）
   * 用于清空已读通知等场景
   *
   * @param {Array<number>} announcementIds - 公告ID数组
   * @returns {Promise<number>} 更新的记录数
   */
  static async deactivateBatch(announcementIds = []) {
    if (announcementIds.length === 0) {
      return 0
    }

    const [updatedCount] = await SystemAnnouncement.update(
      { is_active: false },
      {
        where: {
          announcement_id: { [Op.in]: announcementIds }
        }
      }
    )

    return updatedCount
  }

  /**
   * 获取公告统计信息（管理员后台专用）
   * @returns {Promise<Object>} 统计数据
   */
  static async getStatistics() {
    const [totalCount, activeCount, expiredCount, unreadCount] = await Promise.all([
      SystemAnnouncement.count(),
      SystemAnnouncement.count({ where: { is_active: true } }),
      SystemAnnouncement.count({
        where: {
          expires_at: { [Op.lt]: BeijingTimeHelper.createBeijingTime() }
        }
      }),
      SystemAnnouncement.count({
        where: {
          is_active: true,
          view_count: 0
        }
      })
    ])

    return {
      total: totalCount,
      active: activeCount,
      expired: expiredCount,
      unread: unreadCount
    }
  }

  /**
   * 获取通知统计信息（前端通知中心专用）
   * 返回格式符合前端期望：total, unread, today, week
   * @param {Object} options - 查询选项
   * @param {string} options.type - 通知类型过滤
   * @returns {Promise<Object>} 统计数据 {total, unread, today, week}
   */
  static async getNotificationStatistics(options = {}) {
    const { type = null } = options

    // 构建基础条件
    const baseWhere = { is_active: true }
    if (type && type !== 'all') {
      baseWhere.type = type
    }

    // 计算今日开始时间（北京时间）
    const now = BeijingTimeHelper.createBeijingTime()
    const todayStart = new Date(now)
    todayStart.setHours(0, 0, 0, 0)

    // 计算本周开始时间（周一）
    const weekStart = new Date(now)
    const dayOfWeek = weekStart.getDay()
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // 周日是0，需要减6天
    weekStart.setDate(weekStart.getDate() - daysFromMonday)
    weekStart.setHours(0, 0, 0, 0)

    // 并行执行所有统计查询
    const [totalCount, unreadCount, todayCount, weekCount] = await Promise.all([
      // 总数
      SystemAnnouncement.count({ where: baseWhere }),
      // 未读数（view_count = 0）
      SystemAnnouncement.count({
        where: {
          ...baseWhere,
          view_count: 0
        }
      }),
      // 今日通知数
      SystemAnnouncement.count({
        where: {
          ...baseWhere,
          created_at: { [Op.gte]: todayStart }
        }
      }),
      // 本周通知数
      SystemAnnouncement.count({
        where: {
          ...baseWhere,
          created_at: { [Op.gte]: weekStart }
        }
      })
    ])

    return {
      total: totalCount,
      unread: unreadCount,
      today: todayCount,
      week: weekCount
    }
  }
}

module.exports = AnnouncementService
