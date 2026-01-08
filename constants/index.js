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

// C2C可交易资产类型常量（P0-4 实施）
const {
  C2C_BLACKLISTED_ASSET_CODES,
  isBlacklistedForC2C,
  getBlacklistReason,
  validateC2CTradability,
  createC2CBlacklistError
} = require('./TradableAssetTypes')

// 审计日志 target_type 常量（P0-5 实施）
const {
  AUDIT_TARGET_TYPES,
  TARGET_TYPE_LEGACY_MAPPING,
  VALID_TARGET_TYPES,
  normalizeTargetType,
  isValidTargetType,
  getTargetTypeDisplayName,
  getLegacyMappings,
  normalizeTargetTypes
} = require('./AuditTargetTypes')

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

  // C2C可交易资产类型（P0-4 实施）
  C2C_BLACKLISTED_ASSET_CODES,
  isBlacklistedForC2C,
  getBlacklistReason,
  validateC2CTradability,
  createC2CBlacklistError,

  // 审计日志 target_type（P0-5 实施）
  AUDIT_TARGET_TYPES,
  TARGET_TYPE_LEGACY_MAPPING,
  VALID_TARGET_TYPES,
  normalizeTargetType,
  isValidTargetType,
  getTargetTypeDisplayName,
  getLegacyMappings,
  normalizeTargetTypes,

  // 命名空间导出（便于按模块引用）
  AuditOperationTypes: require('./AuditOperationTypes'),
  ErrorCodes: require('./ErrorCodes'),
  TradableAssetTypes: require('./TradableAssetTypes'),
  AuditTargetTypes: require('./AuditTargetTypes')
}
