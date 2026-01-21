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
 * - 省市区街道级联选择（四级行政区划）
 *
 * 技术特性：
 * - 静态方法设计（符合项目规范）
 * - 事务支持（通过 options.transaction）
 * - 完整的数据验证
 * - 北京时间统一处理
 * - 行政区划代码校验和自动填充名称
 *
 * @since 2026-01-12
 * @updated 2026-01-12 新增省市区街道字段支持（8个）
 * @see docs/省市区级联选择功能设计方案.md
 */

'use strict'

const { Op } = require('sequelize')
const { sequelize } = require('../models')
const { Store, User, StoreStaff, AdministrativeRegion } = require('../models')
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
   * @param {string} [storeData.store_address] - 门店详细地址
   * @param {string} [storeData.contact_name] - 联系人姓名
   * @param {string} [storeData.contact_mobile] - 联系电话
   * @param {string} storeData.province_code - 省级区划代码（必填）
   * @param {string} storeData.city_code - 市级区划代码（必填）
   * @param {string} storeData.district_code - 区县级区划代码（必填）
   * @param {string} storeData.street_code - 街道级区划代码（必填）
   * @param {string} [storeData.status='pending'] - 门店状态（active/inactive/pending）
   * @param {number} [storeData.assigned_to] - 分配给哪个业务员
   * @param {number} [storeData.merchant_id] - 商户ID
   * @param {string} [storeData.notes] - 备注
   * @param {Object} options - 选项
   * @param {number} options.operator_id - 操作者ID（必填）
   * @param {Transaction} [options.transaction] - 事务对象
   * @returns {Promise<Object>} 创建结果
   * @throws {Error} 当门店名称为空、门店编号重复或区划代码无效时
   */
  static async createStore(storeData, options = {}) {
    const { operator_id, transaction } = options

    // 1. 数据验证 - 门店名称
    if (!storeData.store_name || storeData.store_name.trim() === '') {
      throw new Error('门店名称不能为空')
    }

    // 2. 数据验证 - 行政区划（必填校验）
    const regionValidation = await StoreService.validateAndFillRegionNames(storeData, {
      transaction
    })
    if (!regionValidation.valid) {
      throw new Error(`行政区划校验失败: ${regionValidation.errors.join(', ')}`)
    }

    // 3. 生成门店编号（如未提供）
    let storeCode = storeData.store_code
    if (!storeCode) {
      storeCode = await StoreService.generateStoreCode()
    }

    // 4. 检查门店编号是否重复
    const existingStore = await Store.findOne({
      where: { store_code: storeCode },
      transaction
    })

    if (existingStore) {
      throw new Error(`门店编号 ${storeCode} 已存在`)
    }

    // 5. 验证关联用户（如有）
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

    // 6. 创建门店（使用校验后自动填充的名称）
    const store = await Store.create(
      {
        store_name: storeData.store_name.trim(),
        store_code: storeCode,
        store_address: storeData.store_address || null,
        contact_name: storeData.contact_name || null,
        contact_mobile: storeData.contact_mobile || null,
        // 行政区划字段（code + name）
        province_code: regionValidation.names.province_code,
        province_name: regionValidation.names.province_name,
        city_code: regionValidation.names.city_code,
        city_name: regionValidation.names.city_name,
        district_code: regionValidation.names.district_code,
        district_name: regionValidation.names.district_name,
        street_code: regionValidation.names.street_code,
        street_name: regionValidation.names.street_name,
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
      region: `${store.province_name}${store.city_name}${store.district_name}${store.street_name}`,
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
   * @param {string} [queryParams.province_code] - 省级区划代码筛选
   * @param {string} [queryParams.city_code] - 市级区划代码筛选
   * @param {string} [queryParams.district_code] - 区县级区划代码筛选
   * @param {string} [queryParams.street_code] - 街道级区划代码筛选
   * @param {string} [queryParams.keyword] - 关键词搜索（门店名称/编号/联系人/地址）
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
      province_code,
      city_code,
      district_code,
      street_code,
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

    // 行政区划筛选（支持按省/市/区县/街道级别筛选）
    if (province_code) {
      where.province_code = province_code
    }
    if (city_code) {
      where.city_code = city_code
    }
    if (district_code) {
      where.district_code = district_code
    }
    if (street_code) {
      where.street_code = street_code
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
        { contact_name: { [Op.like]: `%${keyword}%` } },
        { store_address: { [Op.like]: `%${keyword}%` } },
        { province_name: { [Op.like]: `%${keyword}%` } },
        { city_name: { [Op.like]: `%${keyword}%` } },
        { district_name: { [Op.like]: `%${keyword}%` } },
        { street_name: { [Op.like]: `%${keyword}%` } }
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

    // 3. 行政区划校验（如有更新任一区划字段）
    const regionFieldsToUpdate = ['province_code', 'city_code', 'district_code', 'street_code']
    const hasRegionUpdate = regionFieldsToUpdate.some(field => updateData[field] !== undefined)

    let regionNames = null
    if (hasRegionUpdate) {
      // 合并现有值和更新值
      const regionCodes = {
        province_code: updateData.province_code || store.province_code,
        city_code: updateData.city_code || store.city_code,
        district_code: updateData.district_code || store.district_code,
        street_code: updateData.street_code || store.street_code
      }

      const regionValidation = await StoreService.validateAndFillRegionNames(regionCodes, {
        transaction
      })
      if (!regionValidation.valid) {
        throw new Error(`行政区划校验失败: ${regionValidation.errors.join(', ')}`)
      }

      regionNames = regionValidation.names
    }

    // 4. 验证关联用户（如有更新）
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

    // 5. 构建更新字段
    const allowedFields = [
      'store_name',
      'store_code',
      'store_address',
      'contact_name',
      'contact_mobile',
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

    // 更新行政区划字段（如有变更）
    if (regionNames) {
      updateFields.province_code = regionNames.province_code
      updateFields.province_name = regionNames.province_name
      updateFields.city_code = regionNames.city_code
      updateFields.city_name = regionNames.city_name
      updateFields.district_code = regionNames.district_code
      updateFields.district_name = regionNames.district_name
      updateFields.street_code = regionNames.street_code
      updateFields.street_name = regionNames.street_name
    }

    updateFields.updated_at = BeijingTimeHelper.createDatabaseTime()

    // 6. 执行更新
    await store.update(updateFields, { transaction })

    logger.info('✅ 门店更新成功', {
      store_id,
      updated_fields: Object.keys(updateFields),
      operator_id
    })

    // 7. 返回更新后的门店信息
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
   * 行政区划辅助方法
   * =================================================================
   */

  /**
   * 校验行政区划代码并自动填充名称
   *
   * @param {Object} codes - 区划代码对象
   * @param {string} codes.province_code - 省级代码（必填）
   * @param {string} codes.city_code - 市级代码（必填）
   * @param {string} codes.district_code - 区县级代码（必填）
   * @param {string} codes.street_code - 街道级代码（必填）
   * @param {Object} [options] - 选项
   * @returns {Promise<Object>} 校验结果 { valid: boolean, errors: string[], names: Object }
   */
  static async validateAndFillRegionNames(codes, options = {}) {
    const { transaction } = options
    const errors = []

    // 必填字段检查
    const requiredFields = [
      { field: 'province_code', level: 1, name: '省级' },
      { field: 'city_code', level: 2, name: '市级' },
      { field: 'district_code', level: 3, name: '区县级' },
      { field: 'street_code', level: 4, name: '街道级' }
    ]

    const validations = []
    for (const { field, level, name } of requiredFields) {
      if (!codes[field]) {
        errors.push(`${name}区划代码不能为空`)
      } else {
        validations.push({ field, code: codes[field], level, name })
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, names: null }
    }

    // 并行查询所有区划
    try {
      const codeList = validations.map(v => v.code)
      const regions = await AdministrativeRegion.findAll({
        where: {
          region_code: { [Op.in]: codeList },
          status: 'active'
        },
        attributes: ['region_code', 'region_name', 'level', 'parent_code'],
        transaction
      })

      const regionMap = new Map()
      regions.forEach(r => {
        regionMap.set(r.region_code, r)
      })

      // 校验每个代码是否存在且层级正确
      const results = []
      for (const v of validations) {
        const region = regionMap.get(v.code)
        if (!region) {
          errors.push(`无效的${v.name}区划代码: ${v.code}`)
        } else if (region.level !== v.level) {
          errors.push(
            `${v.name}区划代码 ${v.code} 层级不正确（期望层级 ${v.level}，实际层级 ${region.level}）`
          )
        } else {
          results.push({ ...v, region })
        }
      }

      if (errors.length > 0) {
        return { valid: false, errors, names: null }
      }

      // 校验层级关系（省→市→区县→街道）
      const provinceResult = results.find(r => r.field === 'province_code')
      const cityResult = results.find(r => r.field === 'city_code')
      const districtResult = results.find(r => r.field === 'district_code')
      const streetResult = results.find(r => r.field === 'street_code')

      // 校验市级的父级是省级
      if (cityResult.region.parent_code !== provinceResult.code) {
        errors.push(
          `市级区划"${cityResult.region.region_name}"不属于省级区划"${provinceResult.region.region_name}"`
        )
      }

      // 校验区县级的父级是市级
      if (districtResult.region.parent_code !== cityResult.code) {
        errors.push(
          `区县级区划"${districtResult.region.region_name}"不属于市级区划"${cityResult.region.region_name}"`
        )
      }

      // 校验街道级的父级是区县级
      if (streetResult.region.parent_code !== districtResult.code) {
        errors.push(
          `街道级区划"${streetResult.region.region_name}"不属于区县级区划"${districtResult.region.region_name}"`
        )
      }

      if (errors.length > 0) {
        return { valid: false, errors, names: null }
      }

      // 返回有效的名称信息
      const names = {
        province_code: codes.province_code,
        province_name: provinceResult.region.region_name,
        city_code: codes.city_code,
        city_name: cityResult.region.region_name,
        district_code: codes.district_code,
        district_name: districtResult.region.region_name,
        street_code: codes.street_code,
        street_name: streetResult.region.region_name
      }

      return { valid: true, errors: [], names }
    } catch (error) {
      logger.error('行政区划校验失败', { codes, error: error.message })
      throw error
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
      // 行政区划信息
      province_code: store.province_code,
      province_name: store.province_name,
      city_code: store.city_code,
      city_name: store.city_name,
      district_code: store.district_code,
      district_name: store.district_name,
      street_code: store.street_code,
      street_name: store.street_name,
      // 完整地区显示名称
      full_region_name: [
        store.province_name,
        store.city_name,
        store.district_name,
        store.street_name
      ]
        .filter(Boolean)
        .join(' '),
      // 级联选择器回显用的代码数组
      region_codes: [
        store.province_code,
        store.city_code,
        store.district_code,
        store.street_code
      ].filter(Boolean),
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
   * 统计门店数据
   *
   * @returns {Promise<Object>} 统计结果
   */
  static async getStoreStats() {
    // 1. 门店状态统计
    const storeStats = await Store.findAll({
      attributes: ['status', [sequelize.fn('COUNT', sequelize.col('store_id')), 'count']],
      group: ['status']
    })

    const result = {
      total: 0,
      active: 0,
      inactive: 0,
      pending: 0,
      total_staff: 0,
      cities: 0
    }

    storeStats.forEach(stat => {
      const count = parseInt(stat.get('count'), 10)
      result[stat.status] = count
      result.total += count
    })

    // 2. 员工总数统计（在职员工）
    try {
      const staffCount = await StoreStaff.count({
        where: { status: 'active' }
      })
      result.total_staff = staffCount
    } catch (error) {
      logger.warn('获取员工统计失败', { error: error.message })
      result.total_staff = 0
    }

    // 3. 覆盖城市数量统计（去重）
    try {
      const cityStats = await Store.findAll({
        attributes: [[sequelize.fn('DISTINCT', sequelize.col('city_code')), 'city_code']],
        where: {
          city_code: { [Op.ne]: null },
          status: 'active'
        },
        raw: true
      })
      result.cities = cityStats.length
    } catch (error) {
      logger.warn('获取城市统计失败', { error: error.message })
      result.cities = 0
    }

    return result
  }

  /**
   * 按区域统计门店数量
   *
   * @param {string} [level='province'] - 统计级别（province/city/district/street）
   * @returns {Promise<Array>} 区域统计结果
   */
  static async getStoreStatsByRegion(level = 'province') {
    const codeField = `${level}_code`
    const nameField = `${level}_name`

    const stats = await Store.findAll({
      attributes: [
        codeField,
        nameField,
        [sequelize.fn('COUNT', sequelize.col('store_id')), 'count']
      ],
      where: { status: 'active' },
      group: [codeField, nameField],
      order: [[sequelize.fn('COUNT', sequelize.col('store_id')), 'DESC']]
    })

    return stats.map(stat => ({
      code: stat.get(codeField),
      name: stat.get(nameField),
      count: parseInt(stat.get('count'), 10)
    }))
  }
}

module.exports = StoreService
