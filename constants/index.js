/**
 * 常量模块统一导出入口
 *
 * 文件路径：constants/index.js
 *
 * 设计原则：
 * - 所有常量定义集中管理
 * - 统一导出入口，便于引用
 *
 * 创建时间：2026-01-08
 */

'use strict'

// 审计操作类型相关常量
const {
  OPERATION_TYPES,
  DB_ENUM_VALUES,
  OPERATION_TYPE_DESCRIPTIONS,
  CRITICAL_OPERATIONS,
  isValidOperationType,
  isCriticalOperation,
  getOperationTypeDescription
} = require('./AuditOperationTypes')

module.exports = {
  // 审计操作类型
  OPERATION_TYPES,
  DB_ENUM_VALUES,
  OPERATION_TYPE_DESCRIPTIONS,
  CRITICAL_OPERATIONS,
  isValidOperationType,
  isCriticalOperation,
  getOperationTypeDescription,

  // 命名空间导出（便于按模块引用）
  AuditOperationTypes: require('./AuditOperationTypes')
}
