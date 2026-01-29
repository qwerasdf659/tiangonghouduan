/**
 * 系统 API 模块统一导出入口
 *
 * @module api/system
 * @description 合并导出 core.js 和 admin.js 的所有 API，保持向后兼容
 * @version 2.0.0
 * @date 2026-01-29
 *
 * 拆分说明：
 * - core.js (~180行): 系统基础、设置、配置、缓存
 * - admin.js (~620行): 公告、通知、Banner、告警、审计、会话、字典、功能开关
 *
 * 原 system.js (1633行) → 拆分后总计 ~800行（含本文件）
 */

// ========== 导入子模块 ==========
import { SYSTEM_CORE_ENDPOINTS, SystemCoreAPI } from './core.js'
import { SYSTEM_ADMIN_ENDPOINTS, SystemAdminAPI } from './admin.js'

// ========== 合并导出端点（向后兼容） ==========
export const SYSTEM_ENDPOINTS = {
  ...SYSTEM_CORE_ENDPOINTS,
  ...SYSTEM_ADMIN_ENDPOINTS
}

// ========== 合并导出 API（向后兼容） ==========
export const SystemAPI = {
  ...SystemCoreAPI,
  ...SystemAdminAPI
}

// ========== 分离导出（按需引入） ==========
export { SYSTEM_CORE_ENDPOINTS, SystemCoreAPI } from './core.js'
export { SYSTEM_ADMIN_ENDPOINTS, SystemAdminAPI } from './admin.js'

// ========== 默认导出 ==========
export default SystemAPI

