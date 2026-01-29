/**
 * 系统 API 模块（转发模块）
 *
 * @module api/system
 * @description 保持向后兼容的转发模块，实际实现已拆分到 system/ 目录
 * @version 2.0.0
 * @date 2026-01-29
 *
 * 拆分后结构：
 * - system/core.js: 系统基础、设置、配置、缓存
 * - system/admin.js: 公告、通知、Banner、告警、审计、会话、字典、功能开关
 * - system/index.js: 统一导出入口
 *
 * 原文件 1633 行 → 拆分后 ~850 行（包含本转发文件）
 */

// 从新的模块目录导入并重新导出
export {
  SYSTEM_ENDPOINTS,
  SystemAPI,
  SYSTEM_CORE_ENDPOINTS,
  SystemCoreAPI,
  SYSTEM_ADMIN_ENDPOINTS,
  SystemAdminAPI
} from './system/index.js'

// 默认导出
export { default } from './system/index.js'
