'use strict'

/**
 * 数据范围解析服务（数据范围隔离的单一事实源）
 *
 * 业务背景：
 * - 商家功能（消费记录、审核待办、运营看板等）"点进去看到的数据"必须按组织层级逐级收窄，
 *   后端强制过滤，绝不用职级数字（role_level）判断可见范围。
 * - 数据范围一律锚定"组织归属"：门店（store_staff 在职门店）+ 组织层级树（user_hierarchy 自关联，
 *   含本人直挂门店 + 递归收集所有下级管辖门店）。
 *
 * 架构定位（2026-06-24 §12.4 拍板）：
 * - 把原 ApprovalChainService._getUserScopedStoreIds 私有实现提升为独立服务，四处（审核待办/消费列表/
 *   运营看板/未来扩展）统一复用，杜绝"各写一套隔离口径漂移"。
 * - 递归直接复用 HierarchyManagementService.getAllSubordinates（已带循环检测 + 深度限制 maxDepth=10），
 *   不自写 MySQL 递归 CTE（零新增、技术债最低）。
 * - 静态类，经 ServiceManager 以 'data_scope' 键注册；路由层通过 ServiceManager 获取。
 *
 * @module services/DataScopeService
 * @since 2026-06-24
 */

const { StoreStaff, UserHierarchy } = require('../models')
const HierarchyManagementService = require('./HierarchyManagementService')
const UserRoleService = require('./UserRoleService')

/** 管理员角色等级门槛（role_level >= 该值视为全局可见，与 middleware/auth.js 口径一致） */
const ADMIN_ROLE_LEVEL = 100

/**
 * 数据范围解析服务
 *
 * @class DataScopeService
 */
class DataScopeService {
  /**
   * 计算用户的数据可见门店范围（数据范围单一事实源）
   *
   * 范围来源（合并去重）：
   * 1. 管理员（最高 role_level >= 100）→ 全局可见，直接返回 { scope: 'all' }
   * 2. store_staff 在职门店（status='active'）——店长/店员本人所在门店
   * 3. user_hierarchy 本人直挂门店（is_active=true）——业务员本人门店
   * 4. 递归下级管辖门店——经 getAllSubordinates 收集所有层级下级的 user_hierarchy.store_id
   *    （区域→经理→店长多级，已含循环检测/深度限制）
   *
   * @param {number} userId - 用户ID（users.user_id）
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - Sequelize 事务（可选，跨表读保持一致性）
   * @returns {Promise<Object>} 数据范围结果
   *   - { scope: 'all' }：管理员全局可见（调用方不加门店过滤）
   *   - { scope: 'stores', store_ids: number[] }：仅可见这些门店（空数组表示无任何可见门店）
   */
  static async getAccessibleStoreIds(userId, options = {}) {
    const transaction = options.transaction

    // 1. 管理员全局可见：复用 UserRoleService 计算最高角色等级
    const userPerms = await UserRoleService.getUserPermissions(userId)
    if ((userPerms.role_level || 0) >= ADMIN_ROLE_LEVEL) {
      return { scope: 'all' }
    }

    const storeIds = new Set()

    // 2. store_staff 在职门店（店长/店员本人所在门店）
    const staffRecords = await StoreStaff.findAll({
      where: { user_id: userId, status: 'active' },
      attributes: ['store_id'],
      transaction
    })
    staffRecords.forEach(r => {
      if (r.store_id != null) storeIds.add(Number(r.store_id))
    })

    // 3. user_hierarchy 本人直挂门店（业务员本人门店）
    const ownHierarchy = await UserHierarchy.findAll({
      where: { user_id: userId, is_active: true },
      attributes: ['store_id'],
      transaction
    })
    ownHierarchy.forEach(h => {
      if (h.store_id != null) storeIds.add(Number(h.store_id))
    })

    /*
     * 4. 递归下级管辖门店（区域/经理管辖的所有层级下级门店）
     *    复用现成递归（含循环检测 + maxDepth=10），不自写 CTE
     */
    const subordinates = await HierarchyManagementService.getAllSubordinates(userId, false)
    subordinates.forEach(sub => {
      if (sub.store_id != null) storeIds.add(Number(sub.store_id))
    })

    return { scope: 'stores', store_ids: [...storeIds] }
  }

  /**
   * 把数据范围结果转换为 Sequelize where 片段（便于列表查询直接展开）
   *
   * @param {Object} scopeResult - getAccessibleStoreIds 的返回值
   * @param {string} [column='store_id'] - 目标表的门店外键列名
   * @returns {Object} where 片段：
   *   - 管理员：{} （不加门店过滤）
   *   - 受限：{ [column]: { [Op.in]: store_ids } }（store_ids 为空时下发 [0] 保证查不到任何记录）
   */
  static buildStoreWhere(scopeResult, column = 'store_id') {
    if (!scopeResult || scopeResult.scope === 'all') return {}
    const { Op } = require('sequelize')
    const ids =
      scopeResult.store_ids && scopeResult.store_ids.length > 0 ? scopeResult.store_ids : [0]
    return { [column]: { [Op.in]: ids } }
  }
}

module.exports = DataScopeService
