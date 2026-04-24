/**
 * 广告地域定向服务层（AdTargetZoneService）
 *
 * 业务范围：
 * - 地域区域（商圈/区域）CRUD 管理
 * - 联合广告组 CRUD 管理
 * - 联合组成员（地域关联）管理
 * - 地域匹配查询（供竞价引擎调用）
 *
 * 服务对象：
 * - /api/v4/console/zone-management（管理端 - 地域定向管理）
 * - AdBiddingService._resolveZoneSlots()（竞价时地域匹配）
 *
 * @module services/AdTargetZoneService
 */

const BusinessError = require('../utils/BusinessError')
const logger = require('../utils/logger').logger
const { AdTargetZone, AdZoneGroup, AdZoneGroupMember, AdSlot } = require('../models')
const { Op } = require('sequelize')

/**
 * 广告地域定向服务类
 *
 * @class AdTargetZoneService
 */
class AdTargetZoneService {
  /*
   * ═══════════════════════════════════════════════════
   * 地域区域 CRUD
   * ═══════════════════════════════════════════════════
   */

  /**
   * 查询地域列表（支持类型筛选、状态筛选、分页）
   *
   * @param {Object} params - 查询参数
   * @param {string} [params.zone_type] - 地域类型筛选：district/region
   * @param {string} [params.status] - 状态筛选：active/inactive
   * @param {string} [params.keyword] - 名称模糊搜索
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页条数
   * @param {Object} [options={}] - 可选项（transaction 等）
   * @returns {Promise<{rows: Array, count: number, page: number, page_size: number}>} 分页地域列表
   */
  static async listZones(params = {}, options = {}) {
    const { zone_type, status, keyword, page = 1, page_size = 20 } = params

    const where = {}
    if (zone_type) where.zone_type = zone_type
    if (status) where.status = status
    if (keyword) {
      where.zone_name = { [Op.like]: `%${keyword}%` }
    }

    const { rows, count } = await AdTargetZone.findAndCountAll({
      where,
      include: [
        {
          model: AdTargetZone,
          as: 'parent_zone',
          attributes: ['zone_id', 'zone_name', 'zone_type'],
          required: false
        }
      ],
      order: [
        ['priority', 'ASC'],
        ['zone_id', 'ASC']
      ],
      limit: page_size,
      offset: (page - 1) * page_size,
      transaction: options.transaction
    })

    logger.info('[AdTargetZoneService] 查询地域列表', {
      zone_type,
      status,
      keyword,
      total: count
    })

    return { rows, count, page, page_size }
  }

  /**
   * 根据ID获取地域详情（包含子区域和关联广告位）
   *
   * @param {number} zoneId - 地域ID
   * @param {Object} [options={}] - 可选项
   * @returns {Promise<Object|null>} 地域详情或 null
   */
  static async getZoneById(zoneId, options = {}) {
    const zone = await AdTargetZone.findByPk(zoneId, {
      include: [
        {
          model: AdTargetZone,
          as: 'parent_zone',
          attributes: ['zone_id', 'zone_name', 'zone_type'],
          required: false
        },
        {
          model: AdTargetZone,
          as: 'child_zones',
          attributes: ['zone_id', 'zone_name', 'zone_type', 'priority', 'status'],
          required: false
        },
        {
          model: AdSlot,
          as: 'ad_slots',
          attributes: ['ad_slot_id', 'slot_key', 'slot_name', 'slot_type', 'is_active'],
          required: false
        }
      ],
      transaction: options.transaction
    })

    return zone
  }

  /**
   * 创建地域区域
   *
   * @param {Object} data - 地域数据
   * @param {string} data.zone_type - 地域类型
   * @param {string} data.zone_name - 地域名称
   * @param {number} [data.priority=10] - 匹配优先级
   * @param {number|null} [data.parent_zone_id] - 上级区域ID
   * @param {Object} [data.geo_scope] - 覆盖范围
   * @param {Object} [options={}] - 可选项（transaction）
   * @returns {Promise<Object>} 创建的地域对象
   */
  static async createZone(data, options = {}) {
    const { zone_type, zone_name, priority = 10, parent_zone_id, geo_scope } = data

    if (parent_zone_id) {
      const parentZone = await AdTargetZone.findByPk(parent_zone_id, {
        transaction: options.transaction
      })
      if (!parentZone) {
        throw new BusinessError(`上级区域不存在: parent_zone_id=${parent_zone_id}`, 'AD_NOT_FOUND', 404)
      }
    }

    const zone = await AdTargetZone.create(
      { zone_type, zone_name, priority, parent_zone_id, geo_scope, status: 'active' },
      { transaction: options.transaction }
    )

    logger.info('[AdTargetZoneService] 创建地域区域', {
      zone_id: zone.zone_id,
      zone_type,
      zone_name
    })

    return zone
  }

  /**
   * 更新地域区域
   *
   * @param {number} zoneId - 地域ID
   * @param {Object} data - 更新数据
   * @param {Object} [options={}] - 可选项
   * @returns {Promise<Object>} 更新后的地域对象
   */
  static async updateZone(zoneId, data, options = {}) {
    const zone = await AdTargetZone.findByPk(zoneId, { transaction: options.transaction })
    if (!zone) {
      throw new BusinessError(`地域不存在: zone_id=${zoneId}`, 'AD_NOT_FOUND', 404)
    }

    const allowedFields = [
      'zone_name',
      'zone_type',
      'priority',
      'parent_zone_id',
      'geo_scope',
      'status'
    ]
    const updateData = {}
    for (const field of allowedFields) {
      if (data[field] !== undefined) updateData[field] = data[field]
    }

    if (updateData.parent_zone_id && updateData.parent_zone_id === zoneId) {
      throw new BusinessError('不能将自己设为上级区域', 'AD_NOT_ALLOWED', 400)
    }

    await zone.update(updateData, { transaction: options.transaction })

    logger.info('[AdTargetZoneService] 更新地域区域', {
      zone_id: zoneId,
      updated_fields: Object.keys(updateData)
    })

    return zone.reload({ transaction: options.transaction })
  }

  /**
   * 删除地域区域（硬删除）
   *
   * 前置检查：不能删除有下级区域或关联广告位的地域
   *
   * @param {number} zoneId - 地域ID
   * @param {Object} [options={}] - 可选项
   * @returns {Promise<void>} 无返回值，删除失败抛出异常
   */
  static async deleteZone(zoneId, options = {}) {
    const zone = await AdTargetZone.findByPk(zoneId, {
      include: [
        { model: AdTargetZone, as: 'child_zones', attributes: ['zone_id'] },
        { model: AdSlot, as: 'ad_slots', attributes: ['ad_slot_id'] }
      ],
      transaction: options.transaction
    })

    if (!zone) {
      throw new BusinessError(`地域不存在: zone_id=${zoneId}`, 'AD_NOT_FOUND', 404)
    }

    if (zone.child_zones && zone.child_zones.length > 0) {
      throw new BusinessError(`该地域下有 ${zone.child_zones.length} 个子区域，请先删除子区域`, 'AD_ERROR', 400)
    }

    if (zone.ad_slots && zone.ad_slots.length > 0) {
      throw new BusinessError(`该地域关联了 ${zone.ad_slots.length} 个广告位，请先解除关联`, 'AD_ERROR', 400)
    }

    await AdZoneGroupMember.destroy({
      where: { zone_id: zoneId },
      transaction: options.transaction
    })

    await zone.destroy({ transaction: options.transaction })

    logger.info('[AdTargetZoneService] 删除地域区域', { zone_id: zoneId })
  }

  /*
   * ═══════════════════════════════════════════════════
   * 联合广告组 CRUD
   * ═══════════════════════════════════════════════════
   */

  /**
   * 查询联合组列表（分页）
   *
   * @param {Object} params - 查询参数
   * @param {string} [params.status] - 状态筛选
   * @param {string} [params.keyword] - 名称模糊搜索
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页条数
   * @param {Object} [options={}] - 可选项
   * @returns {Promise<{rows: Array, count: number, page: number, page_size: number}>} 分页联合组列表
   */
  static async listGroups(params = {}, options = {}) {
    const { status, keyword, page = 1, page_size = 20 } = params

    const where = {}
    if (status) where.status = status
    if (keyword) where.group_name = { [Op.like]: `%${keyword}%` }

    const { rows, count } = await AdZoneGroup.findAndCountAll({
      where,
      include: [
        {
          model: AdZoneGroupMember,
          as: 'members',
          include: [
            {
              model: AdTargetZone,
              as: 'zone',
              attributes: ['zone_id', 'zone_name', 'zone_type', 'status']
            }
          ]
        }
      ],
      order: [['group_id', 'DESC']],
      limit: page_size,
      offset: (page - 1) * page_size,
      distinct: true,
      transaction: options.transaction
    })

    return { rows, count, page, page_size }
  }

  /**
   * 根据ID获取联合组详情
   *
   * @param {number} groupId - 联合组ID
   * @param {Object} [options={}] - 可选项
   * @returns {Promise<Object|null>} 联合组详情（含成员列表），不存在返回 null
   */
  static async getGroupById(groupId, options = {}) {
    return AdZoneGroup.findByPk(groupId, {
      include: [
        {
          model: AdZoneGroupMember,
          as: 'members',
          include: [
            {
              model: AdTargetZone,
              as: 'zone',
              attributes: ['zone_id', 'zone_name', 'zone_type', 'priority', 'status']
            }
          ]
        }
      ],
      transaction: options.transaction
    })
  }

  /**
   * 创建联合广告组
   *
   * @param {Object} data - 联合组数据
   * @param {string} data.group_name - 联合组名称
   * @param {string} [data.pricing_mode='sum'] - 定价模式
   * @param {number} [data.discount_rate=1.00] - 折扣率
   * @param {number|null} [data.fixed_price] - 固定联合价
   * @param {number[]} [data.zone_ids=[]] - 初始成员地域ID列表
   * @param {Object} [options={}] - 可选项
   * @returns {Promise<Object>} 创建的联合组
   */
  static async createGroup(data, options = {}) {
    const {
      group_name,
      pricing_mode = 'sum',
      discount_rate = 1.0,
      fixed_price,
      zone_ids = []
    } = data

    const group = await AdZoneGroup.create(
      { group_name, pricing_mode, discount_rate, fixed_price, status: 'active' },
      { transaction: options.transaction }
    )

    if (zone_ids.length > 0) {
      const memberRecords = zone_ids.map(zone_id => ({
        group_id: group.group_id,
        zone_id
      }))
      await AdZoneGroupMember.bulkCreate(memberRecords, {
        transaction: options.transaction,
        ignoreDuplicates: true
      })
    }

    logger.info('[AdTargetZoneService] 创建联合组', {
      group_id: group.group_id,
      group_name,
      member_count: zone_ids.length
    })

    return AdTargetZoneService.getGroupById(group.group_id, options)
  }

  /**
   * 更新联合广告组
   *
   * @param {number} groupId - 联合组ID
   * @param {Object} data - 更新数据
   * @param {Object} [options={}] - 可选项
   * @returns {Promise<Object>} 更新后的联合组
   */
  static async updateGroup(groupId, data, options = {}) {
    const group = await AdZoneGroup.findByPk(groupId, { transaction: options.transaction })
    if (!group) {
      throw new BusinessError(`联合组不存在: group_id=${groupId}`, 'AD_NOT_FOUND', 404)
    }

    const allowedFields = ['group_name', 'pricing_mode', 'discount_rate', 'fixed_price', 'status']
    const updateData = {}
    for (const field of allowedFields) {
      if (data[field] !== undefined) updateData[field] = data[field]
    }

    await group.update(updateData, { transaction: options.transaction })

    logger.info('[AdTargetZoneService] 更新联合组', {
      group_id: groupId,
      updated_fields: Object.keys(updateData)
    })

    return AdTargetZoneService.getGroupById(groupId, options)
  }

  /**
   * 删除联合广告组（硬删除，级联删除成员记录）
   *
   * @param {number} groupId - 联合组ID
   * @param {Object} [options={}] - 可选项
   * @returns {Promise<void>} 无返回值，删除失败抛出异常
   */
  static async deleteGroup(groupId, options = {}) {
    const group = await AdZoneGroup.findByPk(groupId, { transaction: options.transaction })
    if (!group) {
      throw new BusinessError(`联合组不存在: group_id=${groupId}`, 'AD_NOT_FOUND', 404)
    }

    await AdZoneGroupMember.destroy({
      where: { group_id: groupId },
      transaction: options.transaction
    })

    await group.destroy({ transaction: options.transaction })

    logger.info('[AdTargetZoneService] 删除联合组', { group_id: groupId })
  }

  /*
   * ═══════════════════════════════════════════════════
   * 联合组成员管理
   * ═══════════════════════════════════════════════════
   */

  /**
   * 添加地域到联合组
   *
   * @param {number} groupId - 联合组ID
   * @param {number[]} zoneIds - 地域ID列表
   * @param {Object} [options={}] - 可选项
   * @returns {Promise<{group_id: number, added_count: number}>} 添加结果
   */
  static async addGroupMembers(groupId, zoneIds, options = {}) {
    const group = await AdZoneGroup.findByPk(groupId, { transaction: options.transaction })
    if (!group) {
      throw new BusinessError(`联合组不存在: group_id=${groupId}`, 'AD_NOT_FOUND', 404)
    }

    const zones = await AdTargetZone.findAll({
      where: { zone_id: { [Op.in]: zoneIds } },
      transaction: options.transaction
    })

    if (zones.length !== zoneIds.length) {
      const foundIds = zones.map(z => z.zone_id)
      const missingIds = zoneIds.filter(id => !foundIds.includes(id))
      throw new BusinessError(`以下地域不存在: ${missingIds.join(', ')}`, 'AD_NOT_FOUND', 404)
    }

    const memberRecords = zoneIds.map(zone_id => ({
      group_id: groupId,
      zone_id
    }))

    await AdZoneGroupMember.bulkCreate(memberRecords, {
      transaction: options.transaction,
      ignoreDuplicates: true
    })

    logger.info('[AdTargetZoneService] 添加联合组成员', {
      group_id: groupId,
      added_zones: zoneIds
    })

    return { group_id: groupId, added_count: zoneIds.length }
  }

  /**
   * 从联合组移除地域
   *
   * @param {number} groupId - 联合组ID
   * @param {number[]} zoneIds - 要移除的地域ID列表
   * @param {Object} [options={}] - 可选项
   * @returns {Promise<Object>} 移除结果
   */
  static async removeGroupMembers(groupId, zoneIds, options = {}) {
    const deletedCount = await AdZoneGroupMember.destroy({
      where: {
        group_id: groupId,
        zone_id: { [Op.in]: zoneIds }
      },
      transaction: options.transaction
    })

    logger.info('[AdTargetZoneService] 移除联合组成员', {
      group_id: groupId,
      removed_zones: zoneIds,
      deleted_count: deletedCount
    })

    return { group_id: groupId, removed_count: deletedCount }
  }

  /*
   * ═══════════════════════════════════════════════════
   * 地域匹配查询（供竞价引擎使用）
   * ═══════════════════════════════════════════════════
   */

  /**
   * 获取指定地域下所有活跃广告位ID
   *
   * 竞价引擎调用此方法替代原来的 raw SQL 查询
   *
   * @param {number|null} zoneId - 地域ID（null 表示匹配所有活跃地域）
   * @param {Object} [options={}] - 可选项
   * @returns {Promise<number[]>} 匹配到的广告位ID列表
   */
  static async getZoneMatchedSlotIds(zoneId, options = {}) {
    const where = { is_active: true }

    if (zoneId) {
      where.zone_id = zoneId
    }

    const slots = await AdSlot.findAll({
      where,
      attributes: ['ad_slot_id'],
      transaction: options.transaction
    })

    return slots.map(s => s.ad_slot_id)
  }

  /**
   * 获取所有活跃地域（按优先级排序）
   *
   * @param {Object} [options={}] - 可选项
   * @returns {Promise<Array>} 活跃地域列表
   */
  static async getActiveZones(options = {}) {
    return AdTargetZone.scope('active').findAll({
      order: [['priority', 'ASC']],
      transaction: options.transaction
    })
  }
}

module.exports = AdTargetZoneService
