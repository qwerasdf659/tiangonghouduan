/**
 * 用户管理 API 模块
 *
 * @module api/user
 * @description 用户管理相关的 API 调用，包括用户列表、详情、角色管理、层级管理等
 * @version 1.0.0
 * @date 2026-01-23
 */

import { API_PREFIX, request, buildURL, buildQueryString } from './base.js'

// ========== 类型定义 ==========

/**
 * 用户状态枚举
 * @typedef {'active'|'inactive'|'banned'} UserStatus
 */

/**
 * 用户角色枚举
 * @typedef {'user'|'admin'|'ops'|'merchant'|'regional_manager'|'sales_manager'|'sales_rep'} UserRole
 */

/**
 * 层级角色级别枚举
 * @typedef {80|60|40} RoleLevel - 80=区域负责人, 60=业务经理, 40=业务员
 */

/**
 * 用户列表查询参数
 * @typedef {Object} UserListParams
 * @property {number} [page=1] - 页码，从1开始
 * @property {number} [limit=20] - 每页数量，后端使用 limit 字段
 * @property {string} [search] - 搜索关键词，支持用户名/手机号搜索
 * @property {UserRole} [role_filter] - 角色筛选
 */

/**
 * 用户信息
 * @typedef {Object} UserInfo
 * @property {number} user_id - 用户ID
 * @property {string} mobile - 手机号
 * @property {string} [nickname] - 昵称
 * @property {UserStatus} status - 用户状态
 * @property {string} role_name - 当前角色名称
 * @property {number} role_level - 角色级别
 * @property {string} created_at - 创建时间（ISO8601格式）
 * @property {string} [last_login_at] - 最后登录时间
 */

/**
 * 角色更新数据
 * @typedef {Object} RoleUpdateData
 * @property {UserRole} role_name - 新角色名称
 * @property {string} [reason] - 变更原因
 */

/**
 * 状态更新数据
 * @typedef {Object} StatusUpdateData
 * @property {UserStatus} status - 新状态 ('active'|'inactive'|'banned')
 * @property {string} [reason] - 变更原因
 */

/**
 * 层级列表查询参数
 * @typedef {Object} HierarchyListParams
 * @property {number} [superior_user_id] - 上级用户ID筛选（查看某用户的下级）
 * @property {boolean|string} [is_active] - 是否激活（true/false）
 * @property {RoleLevel} [role_level] - 角色级别筛选（80=区域负责人, 60=业务经理, 40=业务员）
 * @property {number} [page=1] - 页码
 * @property {number} [page_size=20] - 每页数量
 */

/**
 * 创建层级关系数据
 * @typedef {Object} HierarchyCreateData
 * @property {number} user_id - 用户ID（要建立层级关系的用户）
 * @property {number} [superior_user_id] - 上级用户ID（NULL表示顶级区域负责人）
 * @property {number} role_id - 角色ID
 * @property {number} [store_id] - 门店ID（可选，仅业务员需要）
 */

/**
 * 下级用户查询参数
 * @typedef {Object} SubordinatesParams
 * @property {boolean|string} [include_inactive=false] - 是否包含已停用的下级
 */

/**
 * 层级信息
 * @typedef {Object} HierarchyInfo
 * @property {number} hierarchy_id - 层级记录ID
 * @property {number} user_id - 用户ID
 * @property {string} [user_mobile] - 用户手机号
 * @property {string} [user_nickname] - 用户昵称
 * @property {UserStatus} [user_status] - 用户状态
 * @property {number} [superior_user_id] - 上级用户ID
 * @property {string} [superior_mobile] - 上级手机号
 * @property {string} [superior_nickname] - 上级昵称
 * @property {number} role_id - 角色ID
 * @property {string} [role_name] - 角色名称
 * @property {RoleLevel} [role_level] - 角色级别
 * @property {number} [store_id] - 门店ID
 * @property {boolean} is_active - 是否激活
 * @property {string} [activated_at] - 激活时间
 * @property {string} [deactivated_at] - 停用时间
 * @property {string} [deactivation_reason] - 停用原因
 * @property {string} created_at - 创建时间
 */

/**
 * 角色信息
 * @typedef {Object} RoleInfo
 * @property {number} role_id - 角色ID
 * @property {string} role_name - 角色名称
 * @property {RoleLevel} role_level - 角色级别
 * @property {string} [description] - 角色描述
 * @property {string} [level_name] - 级别名称（区域负责人/业务经理/业务员）
 */

/**
 * 标准 API 响应结构
 * @typedef {Object} ApiResponse
 * @property {boolean} success - 请求是否成功
 * @property {string} code - 业务状态码
 * @property {string} message - 响应消息
 * @property {*} data - 响应数据
 * @property {string} [request_id] - 请求追踪ID
 */

/**
 * 分页响应数据
 * @typedef {Object} PaginatedData
 * @property {Array} rows - 数据列表
 * @property {number} count - 总记录数
 * @property {Object} pagination - 分页信息
 * @property {number} pagination.page - 当前页码
 * @property {number} pagination.page_size - 每页数量
 * @property {number} pagination.total_pages - 总页数
 */

// ========== API 端点 ==========

/**
 * 用户管理 API 端点常量
 * @description 定义所有用户管理相关的 API 路径
 * @type {Object}
 *
 * @property {string} LIST - [GET] 获取用户列表
 * @property {string} DETAIL - [GET] 获取用户详情 - Path: :user_id
 * @property {string} UPDATE_ROLE - [PUT] 更新用户角色 - Path: :user_id
 * @property {string} UPDATE_STATUS - [PUT] 更新用户状态 - Path: :user_id
 * @property {string} DELETE - [DELETE] 删除用户 - Path: :user_id
 *
 * @property {string} ROLES - [GET] 获取角色列表
 *
 * @property {string} PERMISSION_CHECK - [POST] 检查权限
 * @property {string} USER_PERMISSIONS - [GET] 获取用户权限 - Path: :userId
 * @property {string} MY_PERMISSIONS - [GET] 获取当前用户权限
 * @property {string} PROMOTE - [POST] 提升用户权限
 * @property {string} CREATE_ADMIN - [POST] 创建管理员
 *
 * @property {string} HIERARCHY_LIST - [GET] 获取用户层级列表
 * @property {string} HIERARCHY_ROLES - [GET] 获取层级角色列表
 * @property {string} HIERARCHY_DETAIL - [GET] 获取层级详情 - Path: :id
 * @property {string} HIERARCHY_CREATE - [POST] 创建层级关系
 * @property {string} HIERARCHY_SUBORDINATES - [GET] 获取下级用户 - Path: :user_id
 * @property {string} HIERARCHY_UPDATE_STATUS - [PUT] 更新层级状态 - Path: :id
 * @property {string} HIERARCHY_DEACTIVATE - [POST] 停用层级 - Path: :user_id
 * @property {string} HIERARCHY_ACTIVATE - [POST] 激活层级 - Path: :user_id
 *
 * @property {string} PREMIUM_LIST - [GET] 获取高级用户列表
 * @property {string} PREMIUM_DETAIL - [GET] 获取高级状态详情 - Path: :user_id
 * @property {string} PREMIUM_UPDATE - [PUT] 更新高级状态 - Path: :user_id
 * @property {string} PREMIUM_UNLOCK - [POST] 解锁高级功能 - Path: :user_id
 *
 * @property {string} RISK_PROFILE_LIST - [GET] 获取风控配置列表
 * @property {string} RISK_PROFILE_USER - [GET] 获取用户风控配置 - Path: :user_id
 * @property {string} RISK_PROFILE_UPDATE - [PUT] 更新风控配置 - Path: :user_id
 *
 * @property {string} SESSION_LIST - [GET] 获取会话列表
 * @property {string} SESSION_STATS - [GET] 获取会话统计
 * @property {string} SESSION_DETAIL - [GET] 获取会话详情 - Path: :id
 * @property {string} SESSION_DEACTIVATE - [POST] 停用会话 - Path: :id
 * @property {string} SESSION_CLEANUP - [POST] 清理过期会话
 * @property {string} SESSION_ONLINE_USERS - [GET] 获取在线用户
 */
export const USER_ENDPOINTS = {
  /** @type {string} [GET] 获取用户列表 - Query: { page?, limit?, search?, role_filter? } */
  LIST: `${API_PREFIX}/console/user-management/users`,
  /** @type {string} [GET] 获取用户详情 - Path: :user_id */
  DETAIL: `${API_PREFIX}/console/user-management/users/:user_id`,
  /** @type {string} [PUT] 更新用户角色 - Path: :user_id, Body: { role_name, reason? } */
  UPDATE_ROLE: `${API_PREFIX}/console/user-management/users/:user_id/role`,
  /** @type {string} [PUT] 更新用户状态 - Path: :user_id, Body: { status, reason? } */
  UPDATE_STATUS: `${API_PREFIX}/console/user-management/users/:user_id/status`,
  /** @type {string} [DELETE] 删除用户 - Path: :user_id */
  DELETE: `${API_PREFIX}/console/user-management/users/:user_id`,

  // 角色管理 CRUD
  /** @type {string} [GET] 获取角色列表 */
  ROLES: `${API_PREFIX}/console/user-management/roles`,
  /** @type {string} [POST] 创建角色 - Body: { role_name, description?, role_level, permissions? } */
  ROLE_CREATE: `${API_PREFIX}/console/user-management/roles`,
  /** @type {string} [PUT] 更新角色 - Path: :role_id, Body: { role_name?, description?, role_level?, permissions? } */
  ROLE_UPDATE: `${API_PREFIX}/console/user-management/roles/:role_id`,
  /** @type {string} [DELETE] 删除角色（软删除） - Path: :role_id */
  ROLE_DELETE: `${API_PREFIX}/console/user-management/roles/:role_id`,
  /** @type {string} [GET] 获取权限资源列表（角色配置用） */
  PERMISSION_RESOURCES: `${API_PREFIX}/console/user-management/permission-resources`,

  // 权限管理
  /** @type {string} [POST] 检查权限 - Body: { permission, resource? } */
  PERMISSION_CHECK: `${API_PREFIX}/permissions/check`,
  /** @type {string} [GET] 获取用户权限 - Path: :userId */
  USER_PERMISSIONS: `${API_PREFIX}/permissions/user/:userId`,
  /** @type {string} [GET] 获取当前用户权限 */
  MY_PERMISSIONS: `${API_PREFIX}/permissions/me`,
  /** @type {string} [POST] 提升用户权限 - Body: { user_id, role } */
  PROMOTE: `${API_PREFIX}/permissions/promote`,
  /** @type {string} [POST] 创建管理员 - Body: { user_id, ... } */
  CREATE_ADMIN: `${API_PREFIX}/permissions/create-admin`,

  // 用户层级
  /** @type {string} [GET] 获取用户层级列表 - Query: { superior_user_id?, is_active?, role_level?, page?, page_size? } */
  HIERARCHY_LIST: `${API_PREFIX}/console/user-hierarchy`,
  /** @type {string} [GET] 获取层级角色列表 */
  HIERARCHY_ROLES: `${API_PREFIX}/console/user-hierarchy/roles`,
  /** @type {string} [GET] 获取层级详情 - Path: :id */
  HIERARCHY_DETAIL: `${API_PREFIX}/console/user-hierarchy/:id`,
  /** @type {string} [POST] 创建层级关系 - Body: { user_id, superior_user_id?, role_id, store_id? } */
  HIERARCHY_CREATE: `${API_PREFIX}/console/user-hierarchy`,
  /** @type {string} [GET] 获取下级用户 - Path: :user_id, Query: { include_inactive? } */
  HIERARCHY_SUBORDINATES: `${API_PREFIX}/console/user-hierarchy/:user_id/subordinates`,
  /** @type {string} [PUT] 更新层级状态 - Path: :id, Body: { status } */
  HIERARCHY_UPDATE_STATUS: `${API_PREFIX}/console/user-hierarchy/:id/status`,
  /** @type {string} [POST] 停用层级 - Path: :user_id, Body: { reason, include_subordinates? } */
  HIERARCHY_DEACTIVATE: `${API_PREFIX}/console/user-hierarchy/:user_id/deactivate`,
  /** @type {string} [POST] 激活层级 - Path: :user_id, Body: { include_subordinates? } */
  HIERARCHY_ACTIVATE: `${API_PREFIX}/console/user-hierarchy/:user_id/activate`,

  // 用户高级状态
  /** @type {string} [GET] 获取高级用户列表 - Query: { page?, page_size?, status? } */
  PREMIUM_LIST: `${API_PREFIX}/console/user-premium`,
  /** @type {string} [GET] 获取高级状态详情 - Path: :user_id */
  PREMIUM_DETAIL: `${API_PREFIX}/console/user-premium/:user_id`,
  /** @type {string} [PUT] 更新高级状态 - Path: :user_id, Body: { premium_level, expires_at? } */
  PREMIUM_UPDATE: `${API_PREFIX}/console/user-premium/:user_id`,
  /** @type {string} [POST] 解锁高级功能 - Path: :user_id, Body: { feature } */
  PREMIUM_UNLOCK: `${API_PREFIX}/console/user-premium/:user_id/unlock`,

  // 用户风控配置
  /** @type {string} [GET] 获取风控配置列表 - Query: { page?, page_size?, risk_level? } */
  RISK_PROFILE_LIST: `${API_PREFIX}/console/risk-profiles`,
  /** @type {string} [GET] 获取用户风控配置 - Path: :user_id */
  RISK_PROFILE_USER: `${API_PREFIX}/console/risk-profiles/user/:user_id`,
  /** @type {string} [PUT] 更新风控配置 - Path: :user_id, Body: { risk_level, limits, ... } */
  RISK_PROFILE_UPDATE: `${API_PREFIX}/console/risk-profiles/user/:user_id`,

  // 会话管理
  /** @type {string} [GET] 获取会话列表 - Query: { page?, page_size?, user_id?, status? } */
  SESSION_LIST: `${API_PREFIX}/console/sessions`,
  /** @type {string} [GET] 获取会话统计 */
  SESSION_STATS: `${API_PREFIX}/console/sessions/stats`,
  /** @type {string} [GET] 获取会话详情 - Path: :id */
  SESSION_DETAIL: `${API_PREFIX}/console/sessions/:id`,
  /** @type {string} [POST] 停用会话 - Path: :id */
  SESSION_DEACTIVATE: `${API_PREFIX}/console/sessions/:id/deactivate`,
  /** @type {string} [POST] 清理过期会话 */
  SESSION_CLEANUP: `${API_PREFIX}/console/sessions/cleanup`,
  /** @type {string} [GET] 获取在线用户 */
  SESSION_ONLINE_USERS: `${API_PREFIX}/console/sessions/online-users`,
  /** @type {string} [POST] 失效用户所有会话（强制下线） - Body: { user_type, user_id, reason? } */
  SESSION_DEACTIVATE_USER: `${API_PREFIX}/console/sessions/deactivate-user`,

  /** @type {string} [GET] 获取用户管理统计 - Query: { refresh?: 'true' } */
  STATS: `${API_PREFIX}/console/user-management/stats`,

  // 概率调整
  /** @type {string} [POST] 调整用户中奖概率 - Path: :user_id, Body: { probability, reason } */
  ADJUST_PROBABILITY: `${API_PREFIX}/console/lottery-management/users/:user_id/probability-adjust`,

  // 认证（使用后端 console/auth 路径）
  /** @type {string} [POST] 登录 - Body: { mobile, verification_code } */
  AUTH_LOGIN: `${API_PREFIX}/console/auth/login`,
  /** @type {string} [POST] 登出 */
  AUTH_LOGOUT: `${API_PREFIX}/console/auth/logout`,

  // 权限扩展（使用 /api/v4/permissions 独立模块）
  /** @type {string} [GET] 获取权限列表 */
  PERMISSION_LIST: `${API_PREFIX}/permissions/me`,

  // 角色扩展（使用 user-management 模块）
  /** @type {string} [GET] 获取角色列表 */
  ROLE_LIST: `${API_PREFIX}/console/user-management/roles`,
  // 注意：后端没有角色权限CRUD的独立API，权限是嵌入在角色的 permissions JSON 字段中

  // 用户角色管理
  /** @type {string} [GET] 查询用户角色列表（只读，来自 system-data 模块） */
  USER_ROLE_LIST: `${API_PREFIX}/console/system-data/user-roles`,
  // 注意：后端没有 POST/DELETE 用户角色的 API
  // 用户角色变更应使用 UPDATE_ROLE (PUT /api/v4/console/user-management/users/:user_id/role)

  // 角色变更历史（来自 business-records 路由）
  /** @type {string} [GET] 获取角色变更历史 - Query: { user_id?, operator_id?, old_role?, new_role?, start_date?, end_date?, page?, page_size? } */
  ROLE_CHANGE_HISTORY_LIST: `${API_PREFIX}/console/business-records/user-role-changes`,
  /** @type {string} [GET] 获取角色变更详情 - Path: :record_id */
  ROLE_CHANGE_HISTORY_DETAIL: `${API_PREFIX}/console/business-records/user-role-changes/:record_id`,

  // 状态变更历史（来自 business-records 路由）
  /** @type {string} [GET] 获取状态变更历史 - Query: { user_id?, operator_id?, old_status?, new_status?, start_date?, end_date?, page?, page_size? } */
  STATUS_CHANGE_HISTORY_LIST: `${API_PREFIX}/console/business-records/user-status-changes`,
  /** @type {string} [GET] 获取状态变更详情 - Path: :record_id */
  STATUS_CHANGE_HISTORY_DETAIL: `${API_PREFIX}/console/business-records/user-status-changes/:record_id`,

  // 高级状态扩展
  /** @type {string} [GET] 获取高级状态统计 */
  PREMIUM_STATUS_STATS: `${API_PREFIX}/console/user-premium/stats`,
  /** @type {string} [POST] 延长高级状态 - Path: :user_id, Body: { days } */
  PREMIUM_STATUS_EXTEND: `${API_PREFIX}/console/user-premium/:user_id/extend`,
  /** @type {string} [POST] 撤销高级状态 - Path: :user_id */
  PREMIUM_STATUS_REVOKE: `${API_PREFIX}/console/user-premium/:user_id/revoke`,

  // 风控配置扩展
  /** @type {string} [POST] 创建风控配置 - Body: { user_id, risk_level, limits } */
  RISK_PROFILE_CREATE: `${API_PREFIX}/console/risk-profiles`,
  /** @type {string} [PUT] 更新风控配置（按记录ID） - Path: :id */
  RISK_PROFILE_UPDATE_BY_ID: `${API_PREFIX}/console/risk-profiles/:id`,
  /** @type {string} [POST] 冻结用户 - Path: :user_id */
  RISK_PROFILE_FREEZE: `${API_PREFIX}/console/risk-profiles/:user_id/freeze`,
  /** @type {string} [POST] 解冻用户 - Path: :user_id */
  RISK_PROFILE_UNFREEZE: `${API_PREFIX}/console/risk-profiles/:user_id/unfreeze`
}

// ========== API 调用方法 ==========

export const UserAPI = {
  /**
   * 获取用户列表
   * @async
   * @param {UserListParams} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码，从1开始
   * @param {number} [params.limit=20] - 每页数量（后端使用 limit 字段）
   * @param {string} [params.search] - 搜索关键词，支持用户名/手机号搜索
   * @param {UserRole} [params.role_filter] - 角色筛选
   * @returns {Promise<ApiResponse>} 用户列表响应
   * @throws {Error} 网络错误或服务器异常时抛出
   *
   * @example
   * // 基础用法 - 获取第一页
   * const result = await UserAPI.getList()
   *
   * @example
   * // 带筛选条件
   * const result = await UserAPI.getList({
   *   page: 1,
   *   limit: 20,
   *   search: '138',
   *   role_filter: 'admin'
   * })
   */
  async getList(params = {}) {
    const url = USER_ENDPOINTS.LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户详情
   * @async
   * @param {number|string} userId - 用户 ID
   * @returns {Promise<ApiResponse>} 用户详情响应
   * @throws {Error} 当用户不存在时抛出 USER_NOT_FOUND 错误
   * @throws {Error} 网络错误或服务器异常时抛出
   *
   * @example
   * // 获取用户详情
   * const result = await UserAPI.getDetail(12345)
   * logger.debug(result.data) // { user_id, mobile, nickname, ... }
   */
  async getDetail(userId) {
    const url = buildURL(USER_ENDPOINTS.DETAIL, { user_id: userId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 更新用户角色
   * @async
   * @param {number|string} userId - 用户 ID
   * @param {RoleUpdateData} roleData - 角色数据
   * @param {UserRole} roleData.role_name - 新角色名称
   * @param {string} [roleData.reason] - 变更原因
   * @returns {Promise<ApiResponse>} 更新结果响应
   * @throws {Error} 当用户不存在时抛出 USER_NOT_FOUND 错误
   * @throws {Error} 当角色无效时抛出 ROLE_NOT_FOUND 错误
   * @throws {Error} 当权限不足时抛出 PERMISSION_DENIED 错误
   *
   * @example
   * // 更新用户角色为管理员
   * const result = await UserAPI.updateRole(12345, {
   *   role_name: 'admin',
   *   reason: '晋升为系统管理员'
   * })
   */
  async updateRole(userId, roleData) {
    const url = buildURL(USER_ENDPOINTS.UPDATE_ROLE, { user_id: userId })
    return await request({ url, method: 'PUT', data: roleData })
  },

  /**
   * 更新用户状态
   * @async
   * @param {number|string} userId - 用户 ID
   * @param {StatusUpdateData} statusData - 状态数据
   * @param {UserStatus} statusData.status - 新状态 ('active'|'inactive'|'banned')
   * @param {string} [statusData.reason] - 变更原因
   * @returns {Promise<ApiResponse>} 更新结果响应
   * @throws {Error} 当用户不存在时抛出 USER_NOT_FOUND 错误
   * @throws {Error} 当修改自己状态时抛出 CANNOT_MODIFY_SELF 错误
   * @throws {Error} 当状态无效时抛出 INVALID_STATUS 错误
   *
   * @example
   * // 禁用用户账号
   * const result = await UserAPI.updateStatus(12345, {
   *   status: 'banned',
   *   reason: '违规操作，永久封禁'
   * })
   */
  async updateStatus(userId, statusData) {
    const url = buildURL(USER_ENDPOINTS.UPDATE_STATUS, { user_id: userId })
    return await request({ url, method: 'PUT', data: statusData })
  },

  /**
   * 删除用户
   * @async
   * @param {number|string} userId - 用户 ID
   * @returns {Promise<ApiResponse>} 删除结果响应
   * @throws {Error} 当用户不存在时抛出 USER_NOT_FOUND 错误
   * @throws {Error} 当权限不足时抛出 PERMISSION_DENIED 错误
   */
  async delete(userId) {
    const url = buildURL(USER_ENDPOINTS.DELETE, { user_id: userId })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 获取角色列表
   * @async
   * @returns {Promise<ApiResponse>} 角色列表响应
   * @throws {Error} 网络错误或服务器异常时抛出
   */
  async getRoles() {
    return await request({ url: USER_ENDPOINTS.ROLES, method: 'GET' })
  },

  /**
   * 创建角色
   * @async
   * @param {Object} roleData - 角色数据
   * @param {string} roleData.role_name - 角色名称（唯一）
   * @param {string} [roleData.description] - 角色描述
   * @param {number} roleData.role_level - 角色级别（0-999）
   * @param {Object} [roleData.permissions] - 权限配置 { resource: [actions] }
   * @returns {Promise<ApiResponse>} 创建结果响应
   * @throws {Error} 当权限不足或角色名重复时抛出错误
   */
  async createRole(roleData) {
    return await request({ url: USER_ENDPOINTS.ROLE_CREATE, method: 'POST', data: roleData })
  },

  /**
   * 更新角色配置（编辑角色本身）
   * @async
   * @param {number|string} roleId - 角色 ID
   * @param {Object} roleData - 更新数据
   * @param {string} [roleData.role_name] - 新角色名称
   * @param {string} [roleData.description] - 新描述
   * @param {number} [roleData.role_level] - 新级别
   * @param {Object} [roleData.permissions] - 新权限配置
   * @returns {Promise<ApiResponse>} 更新结果响应
   * @throws {Error} 当角色不存在或权限不足时抛出错误
   */
  async updateRoleConfig(roleId, roleData) {
    const url = buildURL(USER_ENDPOINTS.ROLE_UPDATE, { role_id: roleId })
    return await request({ url, method: 'PUT', data: roleData })
  },

  /**
   * 删除角色（软删除）
   * @async
   * @param {number|string} roleId - 角色 ID
   * @returns {Promise<ApiResponse>} 删除结果响应
   * @throws {Error} 当角色不存在、是系统角色或仍有用户使用时抛出错误
   */
  async deleteRole(roleId) {
    const url = buildURL(USER_ENDPOINTS.ROLE_DELETE, { role_id: roleId })
    return await request({ url, method: 'DELETE' })
  },

  /**
   * 获取权限资源列表
   * @async
   * @description 获取所有可配置的权限资源和操作，用于角色权限配置
   * @returns {Promise<ApiResponse>} 权限资源列表响应
   */
  async getPermissionResources() {
    return await request({ url: USER_ENDPOINTS.PERMISSION_RESOURCES, method: 'GET' })
  },

  /**
   * 获取用户权限
   * @async
   * @param {number|string} userId - 用户 ID
   * @returns {Promise<ApiResponse>} 用户权限响应
   * @throws {Error} 当用户不存在时抛出 USER_NOT_FOUND 错误
   */
  async getPermissions(userId) {
    const url = buildURL(USER_ENDPOINTS.USER_PERMISSIONS, { userId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取当前用户权限
   * @async
   * @returns {Promise<ApiResponse>} 当前用户权限响应
   */
  async getMyPermissions() {
    return await request({ url: USER_ENDPOINTS.MY_PERMISSIONS, method: 'GET' })
  },

  // ===== 用户层级 =====

  /**
   * 获取用户层级列表
   * @async
   * @param {HierarchyListParams} [params={}] - 查询参数
   * @param {number} [params.superior_user_id] - 上级用户ID筛选（查看某用户的下级）
   * @param {boolean|string} [params.is_active] - 是否激活（true/false）
   * @param {RoleLevel} [params.role_level] - 角色级别筛选（80=区域负责人, 60=业务经理, 40=业务员）
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<ApiResponse>} 层级列表响应，包含分页信息
   * @throws {Error} 网络错误或服务器异常时抛出
   *
   * @example
   * // 获取所有活跃的区域负责人
   * const result = await UserAPI.getHierarchyList({
   *   is_active: true,
   *   role_level: 80,
   *   page: 1,
   *   page_size: 20
   * })
   *
   * @example
   * // 获取某用户的所有直接下级
   * const result = await UserAPI.getHierarchyList({
   *   superior_user_id: 12345
   * })
   */
  async getHierarchyList(params = {}) {
    const url = USER_ENDPOINTS.HIERARCHY_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取层级角色列表
   * @async
   * @returns {Promise<ApiResponse>} 角色列表响应
   * @throws {Error} 网络错误或服务器异常时抛出
   */
  async getHierarchyRoles() {
    return await request({ url: USER_ENDPOINTS.HIERARCHY_ROLES, method: 'GET' })
  },

  /**
   * 获取用户层级详情
   * @async
   * @param {number|string} id - 层级记录 ID
   * @returns {Promise<ApiResponse>} 层级详情响应
   * @throws {Error} 当层级记录不存在时抛出错误
   */
  async getHierarchyDetail(id) {
    const url = buildURL(USER_ENDPOINTS.HIERARCHY_DETAIL, { id })
    return await request({ url, method: 'GET' })
  },

  /**
   * 创建用户层级
   * @async
   * @param {HierarchyCreateData} data - 层级数据
   * @param {number} data.user_id - 用户ID（要建立层级关系的用户）
   * @param {number} [data.superior_user_id] - 上级用户ID（NULL表示顶级区域负责人）
   * @param {number} data.role_id - 角色ID
   * @param {number} [data.store_id] - 门店ID（可选，仅业务员需要）
   * @returns {Promise<ApiResponse>} 创建结果响应
   * @throws {Error} 当用户ID为空时抛出 MISSING_USER_ID 错误
   * @throws {Error} 当角色ID为空时抛出 MISSING_ROLE_ID 错误
   * @throws {Error} 当创建失败时抛出 CREATE_HIERARCHY_FAILED 错误
   *
   * @example
   * // 创建顶级区域负责人
   * const result = await UserAPI.createHierarchy({
   *   user_id: 12345,
   *   role_id: 1  // 区域负责人角色ID
   * })
   *
   * @example
   * // 为业务经理创建层级，指定上级
   * const result = await UserAPI.createHierarchy({
   *   user_id: 12346,
   *   superior_user_id: 12345,
   *   role_id: 2  // 业务经理角色ID
   * })
   *
   * @example
   * // 为业务员创建层级，并关联门店
   * const result = await UserAPI.createHierarchy({
   *   user_id: 12347,
   *   superior_user_id: 12346,
   *   role_id: 3,  // 业务员角色ID
   *   store_id: 100
   * })
   */
  async createHierarchy(data) {
    return await request({ url: USER_ENDPOINTS.HIERARCHY_CREATE, method: 'POST', data })
  },

  /**
   * 获取下级用户
   * @async
   * @param {number|string} userId - 用户 ID
   * @param {SubordinatesParams} [params={}] - 查询参数
   * @param {boolean|string} [params.include_inactive=false] - 是否包含已停用的下级
   * @returns {Promise<ApiResponse>} 下级用户列表响应
   * @throws {Error} 网络错误或服务器异常时抛出
   *
   * @example
   * // 获取某用户的所有活跃下级
   * const result = await UserAPI.getSubordinates(12345)
   *
   * @example
   * // 获取某用户的所有下级（包含已停用的）
   * const result = await UserAPI.getSubordinates(12345, {
   *   include_inactive: true
   * })
   */
  async getSubordinates(userId, params = {}) {
    const url =
      buildURL(USER_ENDPOINTS.HIERARCHY_SUBORDINATES, { user_id: userId }) +
      buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 更新用户层级状态
   * @async
   * @param {number|string} id - 层级记录 ID
   * @param {Object} statusData - 状态数据
   * @param {boolean} statusData.status - 新状态
   * @returns {Promise<ApiResponse>} 更新结果响应
   * @throws {Error} 当层级记录不存在时抛出错误
   */
  async updateHierarchyStatus(id, statusData) {
    const url = buildURL(USER_ENDPOINTS.HIERARCHY_UPDATE_STATUS, { id })
    return await request({ url, method: 'PUT', data: statusData })
  },

  /**
   * 停用用户层级
   * @async
   * @param {number|string} userId - 用户 ID
   * @param {Object} [data={}] - 停用参数
   * @param {string} data.reason - 停用原因（必填）
   * @param {boolean} [data.include_subordinates=false] - 是否同时停用所有下级
   * @returns {Promise<ApiResponse>} 停用结果响应
   * @throws {Error} 当停用原因为空时抛出 MISSING_REASON 错误
   * @throws {Error} 当停用失败时抛出 DEACTIVATE_FAILED 错误
   */
  async deactivateHierarchy(userId, data = {}) {
    const url = buildURL(USER_ENDPOINTS.HIERARCHY_DEACTIVATE, { user_id: userId })
    return await request({ url, method: 'POST', data })
  },

  /**
   * 激活用户层级
   * @async
   * @param {number|string} userId - 用户 ID
   * @param {Object} [data={}] - 激活参数
   * @param {boolean} [data.include_subordinates=false] - 是否同时激活所有下级
   * @returns {Promise<ApiResponse>} 激活结果响应
   * @throws {Error} 当激活失败时抛出 ACTIVATE_FAILED 错误
   */
  async activateHierarchy(userId, data = {}) {
    const url = buildURL(USER_ENDPOINTS.HIERARCHY_ACTIVATE, { user_id: userId })
    return await request({ url, method: 'POST', data })
  },

  // ===== 用户高级状态 =====

  /**
   * 获取高级用户列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {string} [params.status] - 状态筛选
   * @returns {Promise<ApiResponse>} 高级用户列表响应
   */
  async getPremiumList(params = {}) {
    const url = USER_ENDPOINTS.PREMIUM_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户高级状态
   * @async
   * @param {number|string} userId - 用户 ID
   * @returns {Promise<ApiResponse>} 高级状态详情响应
   */
  async getPremiumDetail(userId) {
    const url = buildURL(USER_ENDPOINTS.PREMIUM_DETAIL, { user_id: userId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 更新用户高级状态
   * @async
   * @param {number|string} userId - 用户 ID
   * @param {Object} data - 更新数据
   * @param {number} data.premium_level - 高级等级
   * @param {string} [data.expires_at] - 到期时间
   * @returns {Promise<ApiResponse>} 更新结果响应
   */
  async updatePremium(userId, data) {
    const url = buildURL(USER_ENDPOINTS.PREMIUM_UPDATE, { user_id: userId })
    return await request({ url, method: 'PUT', data })
  },

  /**
   * 解锁用户高级功能
   * @async
   * @param {number|string} userId - 用户 ID
   * @param {Object} [data={}] - 解锁参数
   * @param {string} [data.feature] - 要解锁的功能
   * @returns {Promise<ApiResponse>} 解锁结果响应
   */
  async unlockPremium(userId, data = {}) {
    const url = buildURL(USER_ENDPOINTS.PREMIUM_UNLOCK, { user_id: userId })
    return await request({ url, method: 'POST', data })
  },

  // ===== 用户风控配置 =====

  /**
   * 获取风控配置列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {string} [params.risk_level] - 风险级别筛选
   * @returns {Promise<ApiResponse>} 风控配置列表响应
   */
  async getRiskProfiles(params = {}) {
    const url = USER_ENDPOINTS.RISK_PROFILE_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取用户风控配置
   * @async
   * @param {number|string} userId - 用户 ID
   * @returns {Promise<ApiResponse>} 用户风控配置响应
   */
  async getUserRiskProfile(userId) {
    const url = buildURL(USER_ENDPOINTS.RISK_PROFILE_USER, { user_id: userId })
    return await request({ url, method: 'GET' })
  },

  /**
   * 更新用户风控配置
   * @async
   * @param {number|string} userId - 用户 ID
   * @param {Object} data - 配置数据
   * @param {string} [data.risk_level] - 风险级别
   * @param {Object} [data.limits] - 限制配置
   * @returns {Promise<ApiResponse>} 更新结果响应
   */
  async updateUserRiskProfile(userId, data) {
    const url = buildURL(USER_ENDPOINTS.RISK_PROFILE_UPDATE, { user_id: userId })
    return await request({ url, method: 'PUT', data })
  },

  // ===== 角色变更历史 =====

  /**
   * 获取角色变更历史列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.user_id] - 被变更角色的用户ID
   * @param {number} [params.operator_id] - 执行变更的操作员ID
   * @param {string} [params.old_role] - 变更前角色
   * @param {string} [params.new_role] - 变更后角色
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<ApiResponse>} 角色变更记录列表响应
   */
  async getRoleChangeHistory(params = {}) {
    const url = USER_ENDPOINTS.ROLE_CHANGE_HISTORY_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取角色变更记录详情
   * @async
   * @param {number|string} recordId - 记录 ID
   * @returns {Promise<ApiResponse>} 角色变更记录详情响应
   */
  async getRoleChangeHistoryDetail(recordId) {
    const url = buildURL(USER_ENDPOINTS.ROLE_CHANGE_HISTORY_DETAIL, { record_id: recordId })
    return await request({ url, method: 'GET' })
  },

  // ===== 状态变更历史 =====

  /**
   * 获取状态变更历史列表
   * @async
   * @param {Object} [params={}] - 查询参数
   * @param {number} [params.user_id] - 被变更状态的用户ID
   * @param {number} [params.operator_id] - 执行变更的操作员ID
   * @param {string} [params.old_status] - 变更前状态
   * @param {string} [params.new_status] - 变更后状态
   * @param {string} [params.start_date] - 开始日期
   * @param {string} [params.end_date] - 结束日期
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<ApiResponse>} 状态变更记录列表响应
   */
  async getStatusChangeHistory(params = {}) {
    const url = USER_ENDPOINTS.STATUS_CHANGE_HISTORY_LIST + buildQueryString(params)
    return await request({ url, method: 'GET' })
  },

  /**
   * 获取状态变更记录详情
   * @async
   * @param {number|string} recordId - 记录 ID
   * @returns {Promise<ApiResponse>} 状态变更记录详情响应
   */
  async getStatusChangeHistoryDetail(recordId) {
    const url = buildURL(USER_ENDPOINTS.STATUS_CHANGE_HISTORY_DETAIL, { record_id: recordId })
    return await request({ url, method: 'GET' })
  }
}

export default UserAPI
