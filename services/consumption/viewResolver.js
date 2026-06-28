'use strict'

/**
 * 消费「我的提交」多视角解析引擎（纯函数，零副作用）
 *
 * 职责（单一）：把前端传入的 `view` 意图 + 调用者系统角色等级，
 * 标准化为「最终生效视角 + 是否越权」。数据范围（可见门店集合）由
 * DataScopeService 单独提供，本模块不查库、不做门店集合计算，只做「视角准入」裁决。
 *
 * 设计依据（执行方案 §四/§13）：
 * - 视角枚举：self（看本人）/ store（看本门店）/ staff（看某员工）/ all（看全局）。
 * - 角色门槛（与真实库 roles 表 + 后端 role_level 口径一致）：
 *     role_level <  40  店员级 → 仅 self
 *     role_level 40~99  店长/经理/区域 → self / store / staff（多店来自 DataScopeService 递归辖区）
 *     role_level >= 100 管理员 → self / store / staff / all
 * - 缺省视角：店员 self、店长 store、管理员 all（进页面先看各自主诉求全貌）。
 *
 * @module services/consumption/viewResolver
 * @since 2026-06-28
 */

/** 店长级准入门槛（与 StaffManagementService.isStoreManager 的 role_level>=40 口径一致） */
const MANAGER_ROLE_LEVEL = 40
/** 管理员准入门槛（与 DataScopeService / middleware/auth.js 的 role_level>=100 口径一致） */
const ADMIN_ROLE_LEVEL = 100

/** 合法视角枚举（对外契约，前端同名传参，零映射） */
const VALID_VIEWS = ['self', 'store', 'staff', 'all']

/**
 * 计算某角色等级允许使用的视角集合
 *
 * @param {number} roleLevel - 调用者最高系统角色等级（role_level）
 * @returns {string[]} 允许的视角枚举数组（按从小到大数据范围排序）
 */
function getAllowedViews(roleLevel) {
  const level = Number(roleLevel) || 0
  if (level >= ADMIN_ROLE_LEVEL) {
    return ['self', 'store', 'staff', 'all']
  }
  if (level >= MANAGER_ROLE_LEVEL) {
    return ['self', 'store', 'staff']
  }
  return ['self']
}

/**
 * 计算某角色等级的缺省视角（前端不传 view 时生效）
 *
 * @param {number} roleLevel - 调用者最高系统角色等级（role_level）
 * @returns {string} 缺省视角：店员 self / 店长 store / 管理员 all
 */
function getDefaultView(roleLevel) {
  const level = Number(roleLevel) || 0
  if (level >= ADMIN_ROLE_LEVEL) {
    return 'all'
  }
  if (level >= MANAGER_ROLE_LEVEL) {
    return 'store'
  }
  return 'self'
}

/**
 * 解析并校验视角（引擎入口，列表 / 统计共用同一套解析，杜绝口径漂移）
 *
 * @param {string|undefined|null} rawView - 前端传入的原始 view（可为空，空则取角色缺省）
 * @param {number} roleLevel - 调用者最高系统角色等级（role_level）
 * @returns {{ view: string, allowed: boolean, allowed_views: string[], default_view: string }}
 *   - view：最终生效视角（缺省/非法时回落到角色缺省视角）
 *   - allowed：所请求视角是否被该角色允许（false 时路由层应返回 403 VIEW_NOT_ALLOWED）
 *   - allowed_views：该角色允许的全部视角（便于前端渲染可切换项）
 *   - default_view：该角色缺省视角（便于前端高亮默认项）
 */
function resolveView(rawView, roleLevel) {
  const allowedViews = getAllowedViews(roleLevel)
  const defaultView = getDefaultView(roleLevel)

  // 缺省：不传 view → 取角色缺省视角，allowed=true
  if (rawView === undefined || rawView === null || rawView === '') {
    return {
      view: defaultView,
      allowed: true,
      allowed_views: allowedViews,
      default_view: defaultView
    }
  }

  const requested = String(rawView).trim().toLowerCase()

  // 非枚举值：视为非法请求，回落缺省视角并标记 allowed=false（路由层据此 403）
  if (!VALID_VIEWS.includes(requested)) {
    return {
      view: defaultView,
      allowed: false,
      allowed_views: allowedViews,
      default_view: defaultView
    }
  }

  // 合法枚举但超出角色权限：allowed=false（路由层 403 VIEW_NOT_ALLOWED）
  if (!allowedViews.includes(requested)) {
    return {
      view: defaultView,
      allowed: false,
      allowed_views: allowedViews,
      default_view: defaultView
    }
  }

  return { view: requested, allowed: true, allowed_views: allowedViews, default_view: defaultView }
}

module.exports = {
  resolveView,
  getAllowedViews,
  getDefaultView,
  VALID_VIEWS,
  MANAGER_ROLE_LEVEL,
  ADMIN_ROLE_LEVEL
}
