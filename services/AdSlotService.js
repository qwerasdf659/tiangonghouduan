/**
 * 广告位服务层（AdSlotService）
 *
 * 业务场景：
 * - 管理系统中可用的广告位（弹窗、轮播图等）
 * - 广告位的CRUD操作和状态管理
 * - 广告位的统计和查询功能
 *
 * 服务对象：
 * - /api/v4/ad/slots（小程序端 - 获取可用广告位）
 * - /api/v4/console/ad-slots（管理端 - 广告位管理）
 *
 * 创建时间：2026-02-18
 */

const logger = require('../utils/logger').logger
const { AdSlot } = require('../models')
const { attachDisplayNames, DICT_TYPES } = require('../utils/displayNameHelper')

/**
 * 广告位服务类
 */
class AdSlotService {
  /**
   * 获取所有启用的广告位
   *
   * @param {Object} options - 查询选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Array>} 广告位列表（包含显示名称）
   */
  static async getActiveSlots(options = {}) {
    try {
      const slots = await AdSlot.findAll({
        where: { is_active: true },
        order: [
          ['slot_type', 'ASC'],
          ['position', 'ASC']
        ],
        transaction: options.transaction
      })

      // 附加显示名称
      await attachDisplayNames(slots, [
        { field: 'slot_type', dictType: DICT_TYPES.AD_SLOT_TYPE },
        { field: 'is_active', dictType: DICT_TYPES.ENABLED_STATUS }
      ])

      logger.info(`获取启用广告位列表: ${slots.length}个`)
      return slots
    } catch (error) {
      logger.error('获取启用广告位失败', { error: error.message, stack: error.stack })
      throw error
    }
  }

  /**
   * 根据slot_key获取广告位
   *
   * @param {string} slotKey - 广告位标识
   * @param {Object} options - 查询选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object|null>} 广告位对象或null
   */
  static async getSlotByKey(slotKey, options = {}) {
    try {
      const slot = await AdSlot.findOne({
        where: { slot_key: slotKey },
        transaction: options.transaction
      })

      if (slot) {
        // 附加显示名称
        await attachDisplayNames(slot, [
          { field: 'slot_type', dictType: DICT_TYPES.AD_SLOT_TYPE },
          { field: 'is_active', dictType: DICT_TYPES.ENABLED_STATUS }
        ])
      }

      return slot
    } catch (error) {
      logger.error('根据slot_key获取广告位失败', { slotKey, error: error.message })
      throw error
    }
  }

  /**
   * 根据ID获取广告位
   *
   * @param {number} slotId - 广告位ID
   * @param {Object} options - 查询选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object|null>} 广告位对象或null
   */
  static async getSlotById(slotId, options = {}) {
    try {
      const slot = await AdSlot.findByPk(slotId, {
        transaction: options.transaction
      })

      if (slot) {
        // 附加显示名称
        await attachDisplayNames(slot, [
          { field: 'slot_type', dictType: DICT_TYPES.AD_SLOT_TYPE },
          { field: 'is_active', dictType: DICT_TYPES.ENABLED_STATUS }
        ])
      }

      return slot
    } catch (error) {
      logger.error('根据ID获取广告位失败', { slotId, error: error.message })
      throw error
    }
  }

  /**
   * 获取管理端广告位列表（分页、筛选）
   *
   * @param {Object} options - 查询选项
   * @param {number} options.page - 页码（默认1）
   * @param {number} options.pageSize - 每页数量（默认20）
   * @param {string} options.slot_type - 广告位类型筛选
   * @param {boolean} options.is_active - 是否启用筛选
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} { list, total, page, pageSize }
   */
  static async getAdminSlotList(options = {}) {
    try {
      const { page = 1, pageSize = 20, slot_type, is_active } = options

      // 构建查询条件
      const where = {}
      if (slot_type) {
        where.slot_type = slot_type
      }
      if (is_active !== undefined && is_active !== null) {
        where.is_active = is_active
      }

      // 查询总数
      const total = await AdSlot.count({
        where,
        transaction: options.transaction
      })

      // 查询列表
      const slots = await AdSlot.findAll({
        where,
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        transaction: options.transaction
      })

      // 附加显示名称
      await attachDisplayNames(slots, [
        { field: 'slot_type', dictType: DICT_TYPES.AD_SLOT_TYPE },
        { field: 'is_active', dictType: DICT_TYPES.ENABLED_STATUS }
      ])

      logger.info('获取管理端广告位列表', {
        page,
        pageSize,
        total,
        filters: { slot_type, is_active }
      })

      return {
        list: slots,
        total,
        page,
        pageSize
      }
    } catch (error) {
      logger.error('获取管理端广告位列表失败', { error: error.message, options })
      throw error
    }
  }

  /**
   * 创建广告位
   *
   * @param {Object} data - 广告位数据
   * @param {string} data.slot_key - 广告位标识（必填）
   * @param {string} data.slot_name - 广告位名称（必填）
   * @param {string} data.slot_type - 广告位类型（必填）
   * @param {string} data.position - 显示位置（必填）
   * @param {number} data.max_display_count - 最大展示次数（默认3）
   * @param {number} data.daily_price_diamond - 每日固定价格（钻石）
   * @param {number} data.min_bid_diamond - 最低竞价（钻石，默认50）
   * @param {number} data.min_budget_diamond - 最低预算（钻石，默认500）
   * @param {boolean} data.is_active - 是否启用（默认true）
   * @param {string} data.description - 描述
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 创建的广告位对象
   */
  static async createSlot(data, options = {}) {
    try {
      // 检查slot_key是否已存在
      const existing = await AdSlot.findOne({
        where: { slot_key: data.slot_key },
        transaction: options.transaction
      })

      if (existing) {
        throw new Error(`广告位标识 ${data.slot_key} 已存在`)
      }

      // 创建广告位
      const slot = await AdSlot.create(
        {
          slot_key: data.slot_key,
          slot_name: data.slot_name,
          slot_type: data.slot_type,
          position: data.position,
          max_display_count: data.max_display_count || 3,
          daily_price_diamond: data.daily_price_diamond || 0,
          min_bid_diamond: data.min_bid_diamond || 50,
          min_budget_diamond: data.min_budget_diamond || 500,
          is_active: data.is_active !== undefined ? data.is_active : true,
          description: data.description || null
        },
        { transaction: options.transaction }
      )

      logger.info('创建广告位成功', { slot_id: slot.ad_slot_id, slot_key: slot.slot_key })

      return slot
    } catch (error) {
      logger.error('创建广告位失败', { error: error.message, data })
      throw error
    }
  }

  /**
   * 更新广告位
   *
   * @param {number} slotId - 广告位ID
   * @param {Object} data - 要更新的数据
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 更新后的广告位对象
   */
  static async updateSlot(slotId, data, options = {}) {
    try {
      const slot = await AdSlot.findByPk(slotId, {
        transaction: options.transaction
      })

      if (!slot) {
        throw new Error(`广告位不存在: ${slotId}`)
      }

      // 如果更新slot_key，检查是否重复
      if (data.slot_key && data.slot_key !== slot.slot_key) {
        const existing = await AdSlot.findOne({
          where: { slot_key: data.slot_key },
          transaction: options.transaction
        })

        if (existing) {
          throw new Error(`广告位标识 ${data.slot_key} 已存在`)
        }
      }

      // 更新字段
      await slot.update(data, { transaction: options.transaction })

      logger.info('更新广告位成功', { slot_id: slotId, updated_fields: Object.keys(data) })

      return slot
    } catch (error) {
      logger.error('更新广告位失败', { slotId, error: error.message, data })
      throw error
    }
  }

  /**
   * 切换广告位启用状态
   *
   * @param {number} slotId - 广告位ID
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 数据库事务
   * @returns {Promise<Object>} 更新后的广告位对象
   */
  static async toggleSlotActive(slotId, options = {}) {
    try {
      const slot = await AdSlot.findByPk(slotId, {
        transaction: options.transaction
      })

      if (!slot) {
        throw new Error(`广告位不存在: ${slotId}`)
      }

      // 切换状态
      await slot.update({ is_active: !slot.is_active }, { transaction: options.transaction })

      logger.info('切换广告位启用状态成功', {
        slot_id: slotId,
        new_status: slot.is_active
      })

      return slot
    } catch (error) {
      logger.error('切换广告位启用状态失败', { slotId, error: error.message })
      throw error
    }
  }

  /**
   * 获取广告位统计信息
   *
   * @returns {Promise<Object>} 统计信息
   */
  static async getStatistics() {
    try {
      const total = await AdSlot.count()
      const active = await AdSlot.count({ where: { is_active: true } })

      // 按类型统计
      const byType = {
        popup: await AdSlot.count({ where: { slot_type: 'popup' } }),
        carousel: await AdSlot.count({ where: { slot_type: 'carousel' } })
      }

      return {
        total,
        active,
        inactive: total - active,
        by_type: byType
      }
    } catch (error) {
      logger.error('获取广告位统计信息失败', { error: error.message })
      throw error
    }
  }
}

module.exports = AdSlotService
