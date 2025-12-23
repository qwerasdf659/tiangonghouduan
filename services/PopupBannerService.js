/**
 * 弹窗Banner服务层
 *
 * 业务场景：
 * - 微信小程序首页弹窗图片展示
 * - Web后台弹窗Banner管理（上传、编辑、删除、启用/禁用）
 *
 * 服务对象：
 * - /api/v4/popup-banners/active（小程序端 - 获取有效弹窗）
 * - /api/v4/admin/popup-banners（管理端 - CRUD操作）
 *
 * 创建时间：2025-12-22
 */

const logger = require('../utils/logger').logger
const { PopupBanner, User } = require('../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')
const SealosStorageService = require('./sealosStorage')

/**
 * 弹窗Banner服务类
 *
 * @class PopupBannerService
 * @description 提供弹窗Banner的查询、创建、更新、删除等操作
 */
class PopupBannerService {
  /**
   * 获取当前有效的弹窗列表（供小程序端调用）
   *
   * 业务规则：
   * - 必须 is_active = true
   * - start_time 为 NULL 或 <= 当前时间
   * - end_time 为 NULL 或 > 当前时间
   * - 按 display_order 升序、created_at 降序排序
   *
   * @param {Object} options - 查询选项
   * @param {string} options.position - 显示位置（默认 home）
   * @param {number} options.limit - 返回数量限制（默认 10）
   * @returns {Promise<Array>} 有效弹窗列表（仅包含小程序需要的字段）
   */
  static async getActiveBanners(options = {}) {
    const { position = 'home', limit = 10 } = options
    const now = BeijingTimeHelper.createBeijingTime()

    try {
      const banners = await PopupBanner.findAll({
        where: {
          is_active: true,
          position,
          // 开始时间：NULL 或 <= 当前时间
          [Op.or]: [{ start_time: null }, { start_time: { [Op.lte]: now } }],
          // 结束时间：NULL 或 > 当前时间（嵌套在 [Op.and] 中）
          [Op.and]: [
            {
              [Op.or]: [{ end_time: null }, { end_time: { [Op.gt]: now } }]
            }
          ]
        },
        order: [
          ['display_order', 'ASC'],
          ['created_at', 'DESC']
        ],
        limit: parseInt(limit) || 10,
        // 仅返回小程序需要的字段（数据脱敏）
        attributes: ['banner_id', 'title', 'image_url', 'link_url', 'link_type']
      })

      logger.info('获取有效弹窗成功', {
        position,
        count: banners.length
      })

      return banners.map(banner => banner.toJSON())
    } catch (error) {
      logger.error('获取有效弹窗失败', { error: error.message, position })
      throw error
    }
  }

  /**
   * 获取管理后台弹窗列表（包含全部信息）
   *
   * @param {Object} options - 查询选项
   * @param {string|null} options.position - 显示位置筛选
   * @param {boolean|null} options.is_active - 启用状态筛选
   * @param {number} options.limit - 每页数量
   * @param {number} options.offset - 偏移量
   * @returns {Promise<Object>} { banners: Array, total: number }
   */
  static async getAdminBannerList(options = {}) {
    const { position = null, is_active = null, limit = 20, offset = 0 } = options

    try {
      const whereClause = {}
      if (position) whereClause.position = position
      if (is_active !== null) whereClause.is_active = is_active === 'true' || is_active === true

      const { rows: banners, count: total } = await PopupBanner.findAndCountAll({
        where: whereClause,
        order: [
          ['display_order', 'ASC'],
          ['created_at', 'DESC']
        ],
        limit: parseInt(limit) || 20,
        offset: parseInt(offset) || 0,
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['user_id', 'nickname']
          }
        ]
      })

      // 添加状态描述
      const bannersWithStatus = banners.map(banner => {
        const plain = banner.toJSON()
        plain.status_description = banner.getStatusDescription()
        return plain
      })

      logger.info('获取管理后台弹窗列表成功', {
        position,
        is_active,
        total,
        returned: banners.length
      })

      return {
        banners: bannersWithStatus,
        total
      }
    } catch (error) {
      logger.error('获取管理后台弹窗列表失败', { error: error.message })
      throw error
    }
  }

  /**
   * 获取单个弹窗详情
   *
   * @param {number} bannerId - 弹窗ID
   * @returns {Promise<Object|null>} 弹窗详情
   */
  static async getBannerById(bannerId) {
    try {
      const banner = await PopupBanner.findByPk(bannerId, {
        include: [
          {
            model: User,
            as: 'creator',
            attributes: ['user_id', 'nickname']
          }
        ]
      })

      if (!banner) return null

      const plain = banner.toJSON()
      plain.status_description = banner.getStatusDescription()
      return plain
    } catch (error) {
      logger.error('获取弹窗详情失败', { error: error.message, banner_id: bannerId })
      throw error
    }
  }

  /**
   * 创建弹窗Banner
   *
   * @param {Object} data - 弹窗数据
   * @param {string} data.title - 弹窗标题
   * @param {string} data.image_url - 图片URL
   * @param {string|null} data.link_url - 跳转链接
   * @param {string} data.link_type - 跳转类型
   * @param {string} data.position - 显示位置
   * @param {boolean} data.is_active - 是否启用
   * @param {number} data.display_order - 显示顺序
   * @param {Date|null} data.start_time - 开始时间
   * @param {Date|null} data.end_time - 结束时间
   * @param {number} creatorId - 创建人ID
   * @returns {Promise<Object>} 创建的弹窗
   */
  static async createBanner(data, creatorId) {
    try {
      const {
        title,
        image_url,
        link_url = null,
        link_type = 'none',
        position = 'home',
        is_active = false,
        display_order = 0,
        start_time = null,
        end_time = null
      } = data

      const banner = await PopupBanner.create({
        title,
        image_url,
        link_url,
        link_type,
        position,
        is_active,
        display_order: parseInt(display_order) || 0,
        start_time: start_time ? new Date(start_time) : null,
        end_time: end_time ? new Date(end_time) : null,
        created_by: creatorId,
        created_at: BeijingTimeHelper.createBeijingTime(),
        updated_at: BeijingTimeHelper.createBeijingTime()
      })

      logger.info('创建弹窗Banner成功', {
        banner_id: banner.banner_id,
        title: banner.title,
        position: banner.position,
        created_by: creatorId
      })

      return banner.toJSON()
    } catch (error) {
      logger.error('创建弹窗Banner失败', { error: error.message, data })
      throw error
    }
  }

  /**
   * 上传弹窗图片到Sealos对象存储
   *
   * @param {Buffer} fileBuffer - 文件缓冲区
   * @param {string} originalName - 原始文件名
   * @returns {Promise<string>} 图片访问URL
   */
  static async uploadBannerImage(fileBuffer, originalName) {
    try {
      const storageService = new SealosStorageService()
      const imageUrl = await storageService.uploadImage(fileBuffer, originalName, 'popup-banners')

      logger.info('上传弹窗图片成功', {
        original_name: originalName,
        image_url: imageUrl
      })

      return imageUrl
    } catch (error) {
      logger.error('上传弹窗图片失败', { error: error.message, original_name: originalName })
      throw error
    }
  }

  /**
   * 更新弹窗Banner
   *
   * @param {number} bannerId - 弹窗ID
   * @param {Object} data - 更新数据
   * @returns {Promise<Object|null>} 更新后的弹窗
   */
  static async updateBanner(bannerId, data) {
    try {
      const banner = await PopupBanner.findByPk(bannerId)
      if (!banner) return null

      // 允许更新的字段
      const allowedFields = [
        'title',
        'image_url',
        'link_url',
        'link_type',
        'position',
        'is_active',
        'display_order',
        'start_time',
        'end_time'
      ]

      const updateData = {}
      allowedFields.forEach(field => {
        if (data[field] !== undefined) {
          // 时间字段特殊处理
          if (field === 'start_time' || field === 'end_time') {
            updateData[field] = data[field] ? new Date(data[field]) : null
          } else if (field === 'display_order') {
            updateData[field] = parseInt(data[field]) || 0
          } else if (field === 'is_active') {
            updateData[field] = data[field] === 'true' || data[field] === true
          } else {
            updateData[field] = data[field]
          }
        }
      })

      updateData.updated_at = BeijingTimeHelper.createBeijingTime()

      await banner.update(updateData)

      logger.info('更新弹窗Banner成功', {
        banner_id: bannerId,
        updated_fields: Object.keys(updateData)
      })

      const updated = await PopupBannerService.getBannerById(bannerId)
      return updated
    } catch (error) {
      logger.error('更新弹窗Banner失败', { error: error.message, banner_id: bannerId })
      throw error
    }
  }

  /**
   * 删除弹窗Banner
   *
   * @param {number} bannerId - 弹窗ID
   * @returns {Promise<boolean>} 是否成功
   */
  static async deleteBanner(bannerId) {
    try {
      const banner = await PopupBanner.findByPk(bannerId)
      if (!banner) return false

      // 可选：删除Sealos上的图片文件（暂不实现，保留图片历史）

      await banner.destroy()

      logger.info('删除弹窗Banner成功', { banner_id: bannerId })

      return true
    } catch (error) {
      logger.error('删除弹窗Banner失败', { error: error.message, banner_id: bannerId })
      throw error
    }
  }

  /**
   * 切换弹窗启用状态
   *
   * @param {number} bannerId - 弹窗ID
   * @returns {Promise<Object|null>} 更新后的弹窗
   */
  static async toggleBannerActive(bannerId) {
    try {
      const banner = await PopupBanner.findByPk(bannerId)
      if (!banner) return null

      banner.is_active = !banner.is_active
      banner.updated_at = BeijingTimeHelper.createBeijingTime()
      await banner.save()

      logger.info('切换弹窗启用状态成功', {
        banner_id: bannerId,
        is_active: banner.is_active
      })

      return await PopupBannerService.getBannerById(bannerId)
    } catch (error) {
      logger.error('切换弹窗启用状态失败', { error: error.message, banner_id: bannerId })
      throw error
    }
  }

  /**
   * 获取弹窗统计信息（管理后台首页用）
   *
   * @returns {Promise<Object>} 统计数据
   */
  static async getStatistics() {
    try {
      const now = BeijingTimeHelper.createBeijingTime()

      const [totalCount, activeCount, scheduledCount, expiredCount] = await Promise.all([
        // 总数
        PopupBanner.count(),
        // 当前启用中
        PopupBanner.count({ where: { is_active: true } }),
        // 待生效（未开始）
        PopupBanner.count({
          where: {
            is_active: true,
            start_time: { [Op.gt]: now }
          }
        }),
        // 已过期
        PopupBanner.count({
          where: {
            end_time: { [Op.lt]: now }
          }
        })
      ])

      return {
        total: totalCount,
        active: activeCount,
        scheduled: scheduledCount,
        expired: expiredCount
      }
    } catch (error) {
      logger.error('获取弹窗统计信息失败', { error: error.message })
      throw error
    }
  }

  /**
   * 批量更新显示顺序
   *
   * @param {Array<{banner_id: number, display_order: number}>} orderList - 排序列表
   * @returns {Promise<number>} 更新的记录数
   */
  static async updateDisplayOrder(orderList) {
    try {
      // 使用 Promise.all 并行处理批量更新，提升性能
      const updatePromises = orderList.map(item =>
        PopupBanner.update(
          {
            display_order: parseInt(item.display_order) || 0,
            updated_at: BeijingTimeHelper.createBeijingTime()
          },
          {
            where: { banner_id: item.banner_id }
          }
        )
      )

      const results = await Promise.all(updatePromises)
      const updatedCount = results.reduce((sum, [affectedRows]) => sum + affectedRows, 0)

      logger.info('批量更新显示顺序成功', { updated_count: updatedCount })

      return updatedCount
    } catch (error) {
      logger.error('批量更新显示顺序失败', { error: error.message })
      throw error
    }
  }
}

module.exports = PopupBannerService
