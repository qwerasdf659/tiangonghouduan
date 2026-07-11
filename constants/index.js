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
 * 更新时间：2026-01-09（新增 ErrorCodes）
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

// 错误代码相关常量（P0-3 实施）
const {
  NON_RETRYABLE_ERROR_CODES,
  RETRYABLE_ERROR_CODES,
  BUSINESS_ERROR_KEYWORDS,
  RETRYABLE_ERROR_KEYWORDS,
  isNonRetryableError,
  isRetryableError,
  isBusinessErrorByMessage,
  isRetryableErrorByMessage,
  getRetryStrategy
} = require('./ErrorCodes')

// 审计日志 target_type 常量
const {
  AUDIT_TARGET_TYPES,
  VALID_TARGET_TYPES,
  normalizeTargetType,
  isValidTargetType,
  getTargetTypeDisplayName,
  normalizeTargetTypes
} = require('./AuditTargetTypes')

// 权限资源定义（角色权限 UI / 校验）
const {
  PERMISSION_RESOURCES,
  SYSTEM_ROLES,
  isSystemRole,
  getPermissionResources,
  validatePermissions
} = require('./PermissionResources')

// 虚拟资产代码常量（V4.1.0 资产命名重构）
const { AssetCode, AssetForm } = require('./AssetCode')

// 物品类型 × 可计价货币白名单（竞价双层防护·硬约束层）
const {
  ItemType,
  VALUABLE_ITEM_TYPES,
  BIDDABLE_ITEM_TYPES,
  isValuableType,
  isBiddableType
} = require('./ProductCurrencyWhitelist')

module.exports = {
  // 审计操作类型
  OPERATION_TYPES,
  DB_ENUM_VALUES,
  OPERATION_TYPE_DESCRIPTIONS,
  CRITICAL_OPERATIONS,
  isValidOperationType,
  isCriticalOperation,
  getOperationTypeDescription,

  // 错误代码（P0-3 实施）
  NON_RETRYABLE_ERROR_CODES,
  RETRYABLE_ERROR_CODES,
  BUSINESS_ERROR_KEYWORDS,
  RETRYABLE_ERROR_KEYWORDS,
  isNonRetryableError,
  isRetryableError,
  isBusinessErrorByMessage,
  isRetryableErrorByMessage,
  getRetryStrategy,

  // 审计日志 target_type
  AUDIT_TARGET_TYPES,
  VALID_TARGET_TYPES,
  normalizeTargetType,
  isValidTargetType,
  getTargetTypeDisplayName,
  normalizeTargetTypes,

  // 权限资源（PermissionResources）
  PERMISSION_RESOURCES,
  SYSTEM_ROLES,
  isSystemRole,
  getPermissionResources,
  validatePermissions,

  // 虚拟资产代码（AssetCode V4.1.0）
  AssetCode,
  AssetForm,

  // 物品类型 × 可计价货币白名单（竞价双层防护）
  ItemType,
  VALUABLE_ITEM_TYPES,
  BIDDABLE_ITEM_TYPES,
  isValuableType,
  isBiddableType,

  // 命名空间导出（便于按模块引用）
  AuditOperationTypes: require('./AuditOperationTypes'),
  ErrorCodes: require('./ErrorCodes'),
  AuditTargetTypes: require('./AuditTargetTypes'),
  PermissionResources: require('./PermissionResources'),
  AssetCodeModule: require('./AssetCode'),
  ProductCurrencyWhitelist: require('./ProductCurrencyWhitelist')
}
