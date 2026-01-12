/**
 * 门店管理服务 - 餐厅积分抽奖系统 V4.0
 *
 * @description 提供门店数据的完整 CRUD 操作和查询功能
 *              仅限平台管理员通过 /api/v4/console/stores 访问
 *
 * 业务场景：
 * - 平台管理员创建/编辑/删除门店
 * - 门店列表查询（支持分页、筛选）
 * - 门店详情查询
 * - 门店状态管理（激活/停用）
 *
 * 技术特性：
 * - 静态方法设计（符合项目规范）
 * - 事务支持（通过 options.transaction）
 * - 完整的数据验证
 * - 北京时间统一处理
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md - P1 门店数据维护入口
 */

'use strict'

const { Op } = require('sequelize')
const { sequelize } = require('../models')
const { Store, User, StoreStaff } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')
const logger = require('../utils/logger').logger

/**
 * 门店管理服务类
 *
 * @class StoreService
 */
class StoreService {
  /*
   * =================================================================
   * 创建门店
   * =================================================================
   */

  /**
   * 创建新门店
   *
   * @param {Object} storeData - 门店数据
   * @param {string} storeData.store_name - 门店名称（必填）
   * @param {string} [storeData.store_code] - 门店编号（可选，系统自动生成）
   * @param {string} [storeData.store_address] - 门店地址
   * @param {string} [storeData.contact_name] - 联系人姓名
   * @param {string} [storeData.contact_mobile] - 联系电话
   * @param {string} [storeData.region] - 所属区域
   * @param {string} [storeData.status='pending'] - 门店状态（active/inactive/pending）
   * @param {number} [storeData.assigned_to] - 分配给哪个业务员
   * @param {number} [storeData.merchant_id] - 商户ID
   * @param {string} [storeData.notes] - 备注
   * @param {Object} options - 选项
   * @param {number} options.operator_id - 操作者ID（必填）
   * @param {Transaction} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 创建结果
   * @throws {Error} 当门店名称为空或门店编号重复时
   */
  static async createStore(storeData, options = {}) {
    const { operator_id, transaction } = options

    // 1. 数据验证
    if (!storeData.store_name || storeData.store_name.trim() === '') {
      throw new Error('门店名称不能为空')
    }

    // 2. 生成门店编号（如未提供）
    let storeCode = storeData.store_code
    if (!storeCode) {
      storeCode = await StoreService.generateStoreCode()
    }

    // 3. 检查门店编号是否重复
    const existingStore = await Store.findOne({
      where: { store_code: storeCode },
      transaction
    })

    if (existingStore) {
      throw new Error(`门店编号 ${storeCode} 已存在`)
    }

    // 4. 验证关联用户（如有）
    if (storeData.assigned_to) {
      const assignedUser = await User.findByPk(storeData.assigned_to, { transaction })
      if (!assignedUser) {
        throw new Error(`分配的业务员 ID ${storeData.assigned_to} 不存在`)
      }
    }

    if (storeData.merchant_id) {
      const merchantUser = await User.findByPk(storeData.merchant_id, { transaction })
      if (!merchantUser) {
        throw new Error(`商户 ID ${storeData.merchant_id} 不存在`)
      }
    }

    // 5. 创建门店
    const store = await Store.create(
      {
        store_name: storeData.store_name.trim(),
        store_code: storeCode,
        store_address: storeData.store_address || null,
        contact_name: storeData.contact_name || null,
        contact_mobile: storeData.contact_mobile || null,
        region: storeData.region || null,
        status: storeData.status || 'pending',
        assigned_to: storeData.assigned_to || null,
        merchant_id: storeData.merchant_id || null,
        notes: storeData.notes || null,
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    logger.info('✅ 门店创建成功', {
      store_id: store.store_id,
      store_name: store.store_name,
      store_code: store.store_code,
      operator_id
    })

    return {
      success: true,
      store: StoreService.formatStoreForAPI(store)
    }
  }

  /*
   * =================================================================
   * 查询门店
   * =================================================================
   */

  /**
   * 获取门店列表（支持分页、筛选）
   *
   * @param {Object} queryParams - 查询参数
   * @param {number} [queryParams.page=1] - 页码
   * @param {number} [queryParams.page_size=20] - 每页数量
   * @param {string} [queryParams.status] - 状态筛选（active/inactive/pending）
   * @param {string} [queryParams.region] - 区域筛选
   * @param {string} [queryParams.keyword] - 关键词搜索（门店名称/编号/联系人）
   * @param {number} [queryParams.assigned_to] - 业务员筛选
   * @param {number} [queryParams.merchant_id] - 商户筛选
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>} 分页结果
   */
  static async getStoreList(queryParams = {}, options = {}) {
    const {
      page = 1,
      page_size = 20,
      status,
      region,
      keyword,
      assigned_to,
      merchant_id
    } = queryParams

    const { transaction } = options

    // 构建查询条件
    const where = {}

    if (status) {
      where.status = status
    }

    if (region) {
      where.region = region
    }

    if (assigned_to) {
      where.assigned_to = parseInt(assigned_to, 10)
    }

    if (merchant_id) {
      where.merchant_id = parseInt(merchant_id, 10)
    }

    if (keyword) {
      where[Op.or] = [
        { store_name: { [Op.like]: `%${keyword}%` } },
        { store_code: { [Op.like]: `%${keyword}%` } },
        { contact_name: { [Op.like]: `%${keyword}%` } }
      ]
    }

    // 分页参数
    const offset = (parseInt(page, 10) - 1) * parseInt(page_size, 10)
    const limit = parseInt(page_size, 10)

    // 执行查询
    const { count, rows } = await Store.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'assigned_staff',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: User,
          as: 'merchant',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset,
      transaction
    })

    // 格式化结果
    const stores = rows.map(store => StoreService.formatStoreForAPI(store))

    return {
      total: count,
      page: parseInt(page, 10),
      page_size: parseInt(page_size, 10),
      total_pages: Math.ceil(count / page_size),
      items: stores
    }
  }

  /**
   * 获取门店详情
   *
   * @param {number} store_id - 门店ID
   * @param {Object} [options] - 选项
   * @returns {Promise<Object|null>} 门店详情
   */
  static async getStoreById(store_id, options = {}) {
    const { transaction } = options

    const store = await Store.findByPk(store_id, {
      include: [
        {
          model: User,
          as: 'assigned_staff',
          attributes: ['user_id', 'nickname', 'mobile']
        },
        {
          model: User,
          as: 'merchant',
          attributes: ['user_id', 'nickname', 'mobile']
        }
      ],
      transaction
    })

    if (!store) {
      return null
    }

    // 获取门店员工数量统计
    const staffStats = await StoreStaff.findAll({
      where: { store_id },
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('store_staff_id')), 'count']],
      group: ['status'],
      transaction
    })

    const staffCounts = {
      active: 0,
      inactive: 0,
      pending: 0
    }

    staffStats.forEach(stat => {
      staffCounts[stat.status] = parseInt(stat.get('count'), 10)
    })

    const result = StoreService.formatStoreForAPI(store)
    result.staff_counts = staffCounts
    result.total_staff = staffCounts.active + staffCounts.inactive + staffCounts.pending

    return result
  }

  /*
   * =================================================================
   * 更新门店
   * =================================================================
   */

  /**
   * 更新门店信息
   *
   * @param {number} store_id - 门店ID
   * @param {Object} updateData - 更新数据
   * @param {Object} options - 选项
   * @param {number} options.operator_id - 操作者ID
   * @param {Transaction} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 更新结果
   */
  static async updateStore(store_id, updateData, options = {}) {
    const { operator_id, transaction } = options

    // 1. 查找门店
    const store = await Store.findByPk(store_id, { transaction })
    if (!store) {
      throw new Error(`门店 ID ${store_id} 不存在`)
    }

    // 2. 检查门店编号唯一性（如有更新）
    if (updateData.store_code && updateData.store_code !== store.store_code) {
      const existingStore = await Store.findOne({
        where: {
          store_code: updateData.store_code,
          store_id: { [Op.ne]: store_id }
        },
        transaction
      })

      if (existingStore) {
        throw new Error(`门店编号 ${updateData.store_code} 已被其他门店使用`)
      }
    }

    // 3. 验证关联用户（如有更新）
    if (updateData.assigned_to) {
      const assignedUser = await User.findByPk(updateData.assigned_to, { transaction })
      if (!assignedUser) {
        throw new Error(`分配的业务员 ID ${updateData.assigned_to} 不存在`)
      }
    }

    if (updateData.merchant_id) {
      const merchantUser = await User.findByPk(updateData.merchant_id, { transaction })
      if (!merchantUser) {
        throw new Error(`商户 ID ${updateData.merchant_id} 不存在`)
      }
    }

    // 4. 构建更新字段
    const allowedFields = [
      'store_name',
      'store_code',
      'store_address',
      'contact_name',
      'contact_mobile',
      'region',
      'status',
      'assigned_to',
      'merchant_id',
      'notes'
    ]

    const updateFields = {}
    allowedFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updateFields[field] = updateData[field]
      }
    })

    updateFields.updated_at = BeijingTimeHelper.createDatabaseTime()

    // 5. 执行更新
    await store.update(updateFields, { transaction })

    logger.info('✅ 门店更新成功', {
      store_id,
      updated_fields: Object.keys(updateFields),
      operator_id
    })

    // 6. 返回更新后的门店信息
    const updatedStore = await StoreService.getStoreById(store_id, { transaction })

    return {
      success: true,
      store: updatedStore
    }
  }

  /*
   * =================================================================
   * 删除门店
   * =================================================================
   */

  /**
   * 删除门店（软删除：设置状态为 inactive）
   *
   * @param {number} store_id - 门店ID
   * @param {Object} options - 选项
   * @param {number} options.operator_id - 操作者ID
   * @param {boolean} [options.force=false] - 是否强制物理删除
   * @param {Transaction} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 删除结果
   */
  static async deleteStore(store_id, options = {}) {
    const { operator_id, force = false, transaction } = options

    // 1. 查找门店
    const store = await Store.findByPk(store_id, { transaction })
    if (!store) {
      throw new Error(`门店 ID ${store_id} 不存在`)
    }

    // 2. 检查是否有在职员工
    const activeStaffCount = await StoreStaff.count({
      where: { store_id, status: 'active' },
      transaction
    })

    if (activeStaffCount > 0 && !force) {
      throw new Error(`门店 ${store.store_name} 下有 ${activeStaffCount} 名在职员工，无法删除`)
    }

    // 3. 执行删除
    if (force) {
      // 强制删除：先删除员工关系，再删除门店
      await StoreStaff.destroy({
        where: { store_id },
        transaction
      })

      await store.destroy({ transaction })

      logger.info('✅ 门店物理删除成功', {
        store_id,
        store_name: store.store_name,
        operator_id
      })

      return {
        success: true,
        message: '门店已永久删除',
        deleted_store_id: store_id
      }
    } else {
      // 软删除：设置状态为 inactive
      await store.update(
        {
          status: 'inactive',
          updated_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      logger.info('✅ 门店软删除成功', {
        store_id,
        store_name: store.store_name,
        operator_id
      })

      return {
        success: true,
        message: '门店已停用',
        store: StoreService.formatStoreForAPI(store)
      }
    }
  }

  /*
   * =================================================================
   * 辅助方法
   * =================================================================
   */

  /**
   * 生成门店编号
   *
   * @returns {Promise<string>} 门店编号（格式：ST + 年月日 + 3位序号）
   */
  static async generateStoreCode() {
    const dateStr = BeijingTimeHelper.formatDate(new Date(), 'YYYYMMDD')
    const prefix = `ST${dateStr}`

    // 查询当天最大编号
    const lastStore = await Store.findOne({
      where: {
        store_code: { [Op.like]: `${prefix}%` }
      },
      order: [['store_code', 'DESC']]
    })

    let sequence = 1
    if (lastStore && lastStore.store_code) {
      const lastSequence = parseInt(lastStore.store_code.slice(-3), 10)
      if (!isNaN(lastSequence)) {
        sequence = lastSequence + 1
      }
    }

    return `${prefix}${String(sequence).padStart(3, '0')}`
  }

  /**
   * 格式化门店数据为 API 响应格式
   *
   * @param {Object} store - Sequelize 门店实例
   * @returns {Object} API 响应格式的门店数据
   */
  static formatStoreForAPI(store) {
    if (!store) return null

    const result = {
      store_id: store.store_id,
      store_name: store.store_name,
      store_code: store.store_code,
      store_address: store.store_address,
      contact_name: store.contact_name,
      contact_mobile: store.contact_mobile,
      region: store.region,
      status: store.status,
      status_name: StoreService.getStatusName(store.status),
      assigned_to: store.assigned_to,
      merchant_id: store.merchant_id,
      notes: store.notes,
      created_at: BeijingTimeHelper.formatForAPI(store.created_at),
      updated_at: BeijingTimeHelper.formatForAPI(store.updated_at)
    }

    // 关联的业务员信息
    if (store.assigned_staff) {
      result.assigned_staff = {
        user_id: store.assigned_staff.user_id,
        nickname: store.assigned_staff.nickname,
        mobile: store.assigned_staff.mobile
      }
    }

    // 关联的商户信息
    if (store.merchant) {
      result.merchant = {
        user_id: store.merchant.user_id,
        nickname: store.merchant.nickname,
        mobile: store.merchant.mobile
      }
    }

    return result
  }

  /**
   * 获取状态名称（中文）
   *
   * @param {string} status - 状态值
   * @returns {string} 状态名称
   */
  static getStatusName(status) {
    const statusNames = {
      active: '正常营业',
      inactive: '已关闭',
      pending: '待审核'
    }
    return statusNames[status] || '未知'
  }

  /**
   * 获取所有可用区域列表
   *
   * @returns {Promise<Array<string>>} 区域列表
   */
  static async getRegions() {
    const regions = await Store.findAll({
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('region')), 'region']],
      where: { region: { [Op.ne]: null } },
      order: [['region', 'ASC']]
    })

    return regions.map(r => r.region).filter(Boolean)
  }

  /**
   * 统计门店数据
   *
   * @returns {Promise<Object>} 统计结果
   */
  static async getStoreStats() {
    const stats = await Store.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('store_id')), 'count']],
      group: ['status']
    })

    const result = {
      total: 0,
      active: 0,
      inactive: 0,
      pending: 0
    }

    stats.forEach(stat => {
      const count = parseInt(stat.get('count'), 10)
      result[stat.status] = count
      result.total += count
    })

    return result
  }
}

module.exports = StoreService
