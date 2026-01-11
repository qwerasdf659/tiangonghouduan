'use strict'

/**
 * 员工管理服务 - 餐厅积分抽奖系统 V4.0
 *
 * 业务场景：
 * - 管理员工的入职/离职/调店/禁用
 * - 员工与门店的绑定关系管理
 * - 门店员工列表查询
 *
 * 事务边界治理（2026-01-05 决策）：
 * - 所有写操作 **强制要求** 外部事务传入（options.transaction）
 * - 未提供事务时直接报错（使用 assertAndGetTransaction）
 * - 服务层禁止自建事务，由入口层统一使用 TransactionManager.execute()
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md Phase 3.1
 */

const logger = require('../utils/logger').logger
const { StoreStaff, User, Store } = require('../models')
const BeijingTimeHelper = require('../utils/timeHelper')
const { invalidateUserPermissions } = require('../middleware/auth')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const AuditLogService = require('./AuditLogService')

/**
 * 员工管理服务类
 * 职责：管理员工与门店的绑定关系（入职/调店/禁用/查询）
 *
 * @class StaffManagementService
 */
class StaffManagementService {
  /**
   * 添加员工到门店（入职）
   *
   * 业务场景：
   * - 商家管理员邀请员工加入门店
   * - 员工接受邀请后完成入职
   *
   * @param {Object} data - 员工数据
   * @param {number} data.user_id - 员工用户ID
   * @param {number} data.store_id - 门店ID
   * @param {string} [data.role_in_store='staff'] - 门店内角色（staff/manager）
   * @param {number} data.operator_id - 操作人ID（邀请人/审批人）
   * @param {string} [data.notes] - 备注信息
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<StoreStaff>} 创建的员工记录
   * @throws {Error} 用户不存在、门店不存在、员工已在门店等情况
   */
  static async addStaffToStore(data, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'StaffManagementService.addStaffToStore')

    // 1. 验证员工用户存在
    const user = await User.findByPk(data.user_id, { transaction })
    if (!user) {
      throw new Error(`用户不存在: user_id=${data.user_id}`)
    }

    // 2. 验证门店存在
    const store = await Store.findByPk(data.store_id, { transaction })
    if (!store) {
      throw new Error(`门店不存在: store_id=${data.store_id}`)
    }

    // 3. 验证门店是否激活
    if (store.status !== 'active') {
      throw new Error(`门店未激活或已关闭: store_id=${data.store_id}, status=${store.status}`)
    }

    // 4. 检查员工是否已在该门店在职
    const existingActive = await StoreStaff.findOne({
      where: {
        user_id: data.user_id,
        store_id: data.store_id,
        status: 'active'
      },
      transaction
    })

    if (existingActive) {
      throw new Error(
        `该员工已在此门店在职，无需重复添加: user_id=${data.user_id}, store_id=${data.store_id}`
      )
    }

    // 5. 创建员工记录
    const staffRecord = await StoreStaff.create(
      {
        user_id: data.user_id,
        store_id: data.store_id,
        role_in_store: data.role_in_store || 'staff',
        status: 'active',
        joined_at: BeijingTimeHelper.createDatabaseTime(),
        operator_id: data.operator_id,
        notes: data.notes || null,
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 6. 记录审计日志
    await AuditLogService.logOperation({
      operator_id: data.operator_id,
      operation_type: 'staff_onboard',
      target_type: 'StoreStaff',
      target_id: staffRecord.store_staff_id,
      action: 'create',
      after_data: {
        user_id: data.user_id,
        store_id: data.store_id,
        role_in_store: data.role_in_store || 'staff',
        status: 'active'
      },
      reason: data.notes || '员工入职',
      transaction
    })

    // 7. 清除员工权限缓存（确保新门店权限立即生效）
    await invalidateUserPermissions(data.user_id, '员工入职', data.operator_id)

    logger.info('✅ 员工入职成功', {
      store_staff_id: staffRecord.store_staff_id,
      user_id: data.user_id,
      store_id: data.store_id,
      role_in_store: data.role_in_store || 'staff',
      operator_id: data.operator_id
    })

    return staffRecord
  }

  /**
   * 员工调店（从旧门店转到新门店）
   *
   * 业务场景：
   * - 员工跨门店调动
   * - 保留原角色，更换所属门店
   *
   * @param {Object} data - 调店数据
   * @param {number} data.user_id - 员工用户ID
   * @param {number} data.from_store_id - 原门店ID
   * @param {number} data.to_store_id - 新门店ID
   * @param {number} data.operator_id - 操作人ID
   * @param {string} [data.notes] - 调店原因
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} { old_record, new_record }
   * @throws {Error} 员工不在原门店、新门店不存在等情况
   */
  static async transferStaff(data, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'StaffManagementService.transferStaff')

    // 1. 验证新门店存在且激活
    const newStore = await Store.findByPk(data.to_store_id, { transaction })
    if (!newStore) {
      throw new Error(`新门店不存在: store_id=${data.to_store_id}`)
    }
    if (newStore.status !== 'active') {
      throw new Error(`新门店未激活或已关闭: store_id=${data.to_store_id}`)
    }

    // 2. 查找员工在原门店的在职记录
    const oldRecord = await StoreStaff.findOne({
      where: {
        user_id: data.user_id,
        store_id: data.from_store_id,
        status: 'active'
      },
      transaction
    })

    if (!oldRecord) {
      throw new Error(
        `员工不在原门店或已离职: user_id=${data.user_id}, store_id=${data.from_store_id}`
      )
    }

    // 3. 检查员工是否已在新门店在职
    const existingInNewStore = await StoreStaff.findOne({
      where: {
        user_id: data.user_id,
        store_id: data.to_store_id,
        status: 'active'
      },
      transaction
    })

    if (existingInNewStore) {
      throw new Error(`员工已在新门店在职: user_id=${data.user_id}, store_id=${data.to_store_id}`)
    }

    // 4. 将原门店记录置为离职
    await oldRecord.update(
      {
        status: 'inactive',
        left_at: BeijingTimeHelper.createDatabaseTime(),
        notes: data.notes || `调店至门店 ${data.to_store_id}`,
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 5. 创建新门店记录（保持原角色）
    const newRecord = await StoreStaff.create(
      {
        user_id: data.user_id,
        store_id: data.to_store_id,
        role_in_store: oldRecord.role_in_store, // 保持原角色
        status: 'active',
        joined_at: BeijingTimeHelper.createDatabaseTime(),
        operator_id: data.operator_id,
        notes: `从门店 ${data.from_store_id} 调入`,
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 6. 记录审计日志
    await AuditLogService.logOperation({
      operator_id: data.operator_id,
      operation_type: 'staff_transfer',
      target_type: 'StoreStaff',
      target_id: newRecord.store_staff_id,
      action: 'transfer',
      before_data: {
        old_store_staff_id: oldRecord.store_staff_id,
        from_store_id: data.from_store_id
      },
      after_data: {
        new_store_staff_id: newRecord.store_staff_id,
        to_store_id: data.to_store_id,
        role_in_store: oldRecord.role_in_store
      },
      reason: data.notes || '员工调店',
      transaction
    })

    // 7. 清除权限缓存
    await invalidateUserPermissions(data.user_id, '员工调店', data.operator_id)

    logger.info('✅ 员工调店成功', {
      user_id: data.user_id,
      from_store_id: data.from_store_id,
      to_store_id: data.to_store_id,
      old_record_id: oldRecord.store_staff_id,
      new_record_id: newRecord.store_staff_id,
      operator_id: data.operator_id
    })

    return { old_record: oldRecord, new_record: newRecord }
  }

  /**
   * 员工离职（指定门店）
   *
   * 业务场景：
   * - 员工从某个门店离职
   * - 保留历史记录
   *
   * @param {Object} data - 离职数据
   * @param {number} data.user_id - 员工用户ID
   * @param {number} data.store_id - 门店ID
   * @param {number} data.operator_id - 操作人ID
   * @param {string} [data.reason] - 离职原因
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<StoreStaff>} 更新后的员工记录
   * @throws {Error} 员工不在该门店等情况
   */
  static async removeStaffFromStore(data, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(
      options,
      'StaffManagementService.removeStaffFromStore'
    )

    // 1. 查找员工在该门店的在职记录
    const staffRecord = await StoreStaff.findOne({
      where: {
        user_id: data.user_id,
        store_id: data.store_id,
        status: 'active'
      },
      transaction
    })

    if (!staffRecord) {
      throw new Error(`员工不在该门店或已离职: user_id=${data.user_id}, store_id=${data.store_id}`)
    }

    // 2. 更新为离职状态
    await staffRecord.update(
      {
        status: 'inactive',
        left_at: BeijingTimeHelper.createDatabaseTime(),
        notes: data.reason || '员工离职',
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 3. 记录审计日志
    await AuditLogService.logOperation({
      operator_id: data.operator_id,
      operation_type: 'staff_offboard',
      target_type: 'StoreStaff',
      target_id: staffRecord.store_staff_id,
      action: 'update',
      before_data: { status: 'active' },
      after_data: { status: 'inactive', left_at: staffRecord.left_at },
      reason: data.reason || '员工离职',
      transaction
    })

    // 4. 清除权限缓存
    await invalidateUserPermissions(data.user_id, '员工离职', data.operator_id)

    logger.info('✅ 员工离职成功（指定门店）', {
      store_staff_id: staffRecord.store_staff_id,
      user_id: data.user_id,
      store_id: data.store_id,
      operator_id: data.operator_id
    })

    return staffRecord
  }

  /**
   * 禁用员工（所有门店）
   *
   * 业务场景：
   * - 员工违规，批量禁用所有门店权限
   * - 紧急冻结员工账号
   *
   * @param {number} user_id - 员工用户ID
   * @param {number} operator_id - 操作人ID
   * @param {string} [reason] - 禁用原因
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<Object>} { affected_stores: number }
   * @throws {Error} 员工未绑定任何门店等情况
   */
  static async disableStaff(user_id, operator_id, reason, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'StaffManagementService.disableStaff')

    // 1. 获取员工所有在职记录
    const activeRecords = await StoreStaff.findAll({
      where: {
        user_id,
        status: 'active'
      },
      transaction
    })

    if (activeRecords.length === 0) {
      throw new Error(`该员工未绑定任何门店或已被禁用: user_id=${user_id}`)
    }

    // 2. 批量更新为离职状态
    const [affectedCount] = await StoreStaff.update(
      {
        status: 'inactive',
        left_at: BeijingTimeHelper.createDatabaseTime(),
        notes: reason || '员工禁用（全部门店）',
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      {
        where: {
          user_id,
          status: 'active'
        },
        transaction
      }
    )

    // 3. 记录审计日志
    const affectedStoreIds = activeRecords.map(r => r.store_id)
    await AuditLogService.logOperation({
      operator_id,
      operation_type: 'staff_disable_all',
      target_type: 'User',
      target_id: user_id,
      action: 'batch_update',
      before_data: { active_stores: affectedStoreIds },
      after_data: { status: 'inactive', affected_count: affectedCount },
      reason: reason || '员工禁用（全部门店）',
      transaction
    })

    // 4. 清除权限缓存
    await invalidateUserPermissions(user_id, '员工禁用', operator_id)

    logger.info('✅ 员工禁用成功（全部门店）', {
      user_id,
      affected_stores: affectedCount,
      affected_store_ids: affectedStoreIds,
      operator_id
    })

    return { affected_stores: affectedCount }
  }

  /**
   * 启用员工（在指定门店重新入职）
   *
   * 业务场景：
   * - 恢复被禁用的员工
   * - 员工重新入职某门店
   *
   * @param {number} user_id - 员工用户ID
   * @param {number} store_id - 门店ID
   * @param {number} operator_id - 操作人ID
   * @param {string} [notes] - 备注
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<StoreStaff>} 启用后的员工记录
   * @throws {Error} 员工未在该门店等情况
   */
  static async enableStaff(user_id, store_id, operator_id, notes, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'StaffManagementService.enableStaff')

    // 1. 验证门店存在
    const store = await Store.findByPk(store_id, { transaction })
    if (!store) {
      throw new Error(`门店不存在: store_id=${store_id}`)
    }

    // 2. 查找员工记录（包括已禁用的）
    const staffRecord = await StoreStaff.findOne({
      where: {
        user_id,
        store_id,
        status: 'inactive'
      },
      transaction
    })

    if (!staffRecord) {
      // 检查是否已在职
      const activeRecord = await StoreStaff.findOne({
        where: { user_id, store_id, status: 'active' },
        transaction
      })

      if (activeRecord) {
        throw new Error(
          `该员工已在此门店在职，无需重复启用: user_id=${user_id}, store_id=${store_id}`
        )
      }

      throw new Error(`该员工未在此门店或不存在禁用记录: user_id=${user_id}, store_id=${store_id}`)
    }

    // 3. 更新为在职状态
    await staffRecord.update(
      {
        status: 'active',
        left_at: null,
        notes: notes || '员工重新启用',
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 4. 记录审计日志
    await AuditLogService.logOperation({
      operator_id,
      operation_type: 'staff_enable',
      target_type: 'StoreStaff',
      target_id: staffRecord.id,
      action: 'update',
      before_data: { status: 'inactive' },
      after_data: { status: 'active' },
      reason: notes || '员工重新启用',
      transaction
    })

    // 5. 清除权限缓存
    await invalidateUserPermissions(user_id, '员工启用', operator_id)

    logger.info('✅ 员工启用成功', {
      user_id,
      store_id,
      operator_id
    })

    return staffRecord
  }

  /**
   * 更新员工角色（在指定门店）
   *
   * 业务场景：
   * - 提升员工为店长
   * - 店长降级为普通员工
   *
   * @param {Object} data - 更新数据
   * @param {number} data.user_id - 员工用户ID
   * @param {number} data.store_id - 门店ID
   * @param {string} data.role_in_store - 新角色（staff/manager）
   * @param {number} data.operator_id - 操作人ID
   * @param {string} [data.notes] - 备注
   * @param {Object} options - 选项参数
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<StoreStaff>} 更新后的员工记录
   */
  static async updateStaffRole(data, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'StaffManagementService.updateStaffRole')

    // 1. 验证角色值
    if (!['staff', 'manager'].includes(data.role_in_store)) {
      throw new Error(`无效的门店角色: ${data.role_in_store}，必须是 staff 或 manager`)
    }

    // 2. 查找员工记录
    const staffRecord = await StoreStaff.findOne({
      where: {
        user_id: data.user_id,
        store_id: data.store_id,
        status: 'active'
      },
      transaction
    })

    if (!staffRecord) {
      throw new Error(`员工不在该门店或已离职: user_id=${data.user_id}, store_id=${data.store_id}`)
    }

    // 3. 保存旧角色
    const oldRole = staffRecord.role_in_store

    // 4. 更新角色
    await staffRecord.update(
      {
        role_in_store: data.role_in_store,
        notes: data.notes || `角色变更: ${oldRole} → ${data.role_in_store}`,
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 5. 记录审计日志
    await AuditLogService.logOperation({
      operator_id: data.operator_id,
      operation_type: 'staff_role_change',
      target_type: 'StoreStaff',
      target_id: staffRecord.store_staff_id,
      action: 'update',
      before_data: { role_in_store: oldRole },
      after_data: { role_in_store: data.role_in_store },
      reason: data.notes || `角色变更: ${oldRole} → ${data.role_in_store}`,
      transaction
    })

    // 6. 清除权限缓存
    await invalidateUserPermissions(data.user_id, '员工角色变更', data.operator_id)

    logger.info('✅ 员工角色变更成功', {
      store_staff_id: staffRecord.store_staff_id,
      user_id: data.user_id,
      store_id: data.store_id,
      old_role: oldRole,
      new_role: data.role_in_store,
      operator_id: data.operator_id
    })

    return staffRecord
  }

  /**
   * 查询员工列表
   *
   * 业务场景：
   * - 商家管理后台查看门店员工列表
   * - 按门店/状态/角色筛选
   *
   * @param {Object} filters - 筛选条件
   * @param {number} [filters.store_id] - 门店ID（可选）
   * @param {number} [filters.user_id] - 员工用户ID（可选）
   * @param {string} [filters.status] - 状态（可选）：active/inactive/pending
   * @param {string} [filters.role_in_store] - 门店内角色（可选）：staff/manager
   * @param {number} [filters.page=1] - 页码
   * @param {number} [filters.page_size=20] - 每页数量
   * @returns {Promise<Object>} { staff, total, page, page_size }
   */
  static async getStaffList(filters = {}) {
    const { store_id, user_id, status, role_in_store, page = 1, page_size = 20 } = filters

    // 构建查询条件
    const whereClause = {}
    if (store_id) {
      whereClause.store_id = store_id
    }
    if (user_id) {
      whereClause.user_id = user_id
    }
    if (status) {
      whereClause.status = status
    }
    if (role_in_store) {
      whereClause.role_in_store = role_in_store
    }

    // 分页参数安全限制
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(page_size, 10) || 20))
    const offset = (pageNum - 1) * pageSize

    // 执行查询
    const { count, rows } = await StoreStaff.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname', 'status']
        },
        {
          model: Store,
          as: 'store',
          attributes: ['store_id', 'store_name', 'store_code', 'status']
        },
        {
          model: User,
          as: 'operator',
          attributes: ['user_id', 'nickname']
        }
      ],
      order: [
        ['status', 'ASC'], // active 在前
        ['role_in_store', 'DESC'], // manager 在前
        ['joined_at', 'DESC']
      ],
      limit: pageSize,
      offset
    })

    // 格式化输出
    const staffList = rows.map(record => record.toAPIResponse())

    logger.info('获取员工列表成功', {
      total: count,
      page: pageNum,
      page_size: pageSize,
      filters: { store_id, user_id, status, role_in_store }
    })

    return {
      staff: staffList,
      total: count,
      page: pageNum,
      page_size: pageSize,
      total_pages: Math.ceil(count / pageSize)
    }
  }

  /**
   * 获取员工详情
   *
   * @param {number} store_staff_id - 员工记录ID
   * @returns {Promise<Object|null>} 员工详情或null
   */
  static async getStaffDetail(store_staff_id) {
    const record = await StoreStaff.findByPk(store_staff_id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname', 'status']
        },
        {
          model: Store,
          as: 'store',
          attributes: ['store_id', 'store_name', 'store_code', 'status', 'address']
        },
        {
          model: User,
          as: 'operator',
          attributes: ['user_id', 'nickname']
        }
      ]
    })

    if (!record) {
      return null
    }

    return record.toAPIResponse()
  }

  /**
   * 获取用户所属的所有门店（活跃状态）
   *
   * @param {number} user_id - 用户ID
   * @returns {Promise<Array>} 门店列表
   */
  static async getUserStores(user_id) {
    const records = await StoreStaff.findAll({
      where: {
        user_id,
        status: 'active'
      },
      include: [
        {
          model: Store,
          as: 'store',
          attributes: ['store_id', 'store_name', 'store_code', 'status', 'address']
        }
      ],
      order: [['joined_at', 'ASC']]
    })

    return records.map(r => ({
      store_staff_id: r.store_staff_id,
      store_id: r.store_id,
      store_name: r.store?.store_name,
      store_code: r.store?.store_code,
      role_in_store: r.role_in_store,
      role_name: r.getRoleName(),
      joined_at: BeijingTimeHelper.formatForAPI(r.joined_at)
    }))
  }

  /**
   * 获取门店的所有员工（活跃状态）
   *
   * @param {number} store_id - 门店ID
   * @returns {Promise<Array>} 员工列表
   */
  static async getStoreStaff(store_id) {
    const records = await StoreStaff.findAll({
      where: {
        store_id,
        status: 'active'
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['user_id', 'mobile', 'nickname']
        }
      ],
      order: [
        ['role_in_store', 'DESC'], // manager 在前
        ['joined_at', 'ASC']
      ]
    })

    return records.map(r => ({
      store_staff_id: r.store_staff_id,
      user_id: r.user_id,
      nickname: r.user?.nickname,
      mobile: r.user?.mobile,
      role_in_store: r.role_in_store,
      role_name: r.getRoleName(),
      joined_at: BeijingTimeHelper.formatForAPI(r.joined_at)
    }))
  }

  /**
   * 统计门店员工数量
   *
   * @param {number} store_id - 门店ID
   * @returns {Promise<Object>} { total, managers, staff }
   */
  static async getStoreStaffStats(store_id) {
    const [total, managers, staff] = await Promise.all([
      StoreStaff.count({ where: { store_id, status: 'active' } }),
      StoreStaff.count({ where: { store_id, status: 'active', role_in_store: 'manager' } }),
      StoreStaff.count({ where: { store_id, status: 'active', role_in_store: 'staff' } })
    ])

    return { total, managers, staff }
  }
}

module.exports = StaffManagementService
