/**
 * 通用测试工具模块索引 (V2.0 - 架构一致性增强版)
 *
 * **使用说明**:
 * 1. 这个文件提供统一的导入入口,简化测试代码
 * 2. 所有通用测试工具都可以从这里导入
 * 3. 新增项目架构特定工具(北京时间/幂等性/服务层)
 *
 * **使用示例**:
 * ```javascript
 * const {
 *   SoftDeleteTestSuite,
 *   PaginationTestSuite,
 *   TransactionTestSuite,
 *   BeijingTimeTestSuite,     // 北京时间测试
 *   IdempotencyTestSuite,     // 幂等性测试
 *   ServiceTestSuite          // 服务层测试
 * } = require('../shared')
 * ```
 *
 * 创建时间: 2025-11-14
 * 更新时间: 2025-11-14 (V2.0架构一致性增强)
 * 符合规范: snake_case命名 + 项目架构标准
 */

// ========== 基础通用工具 ==========

// 软删除测试工具
const { SoftDeleteTestSuite, SoftDeleteHelpers } = require('./soft_delete.test')

// 分页测试工具
const { PaginationTestSuite, PaginationHelpers } = require('./pagination.test')

// 事务保护测试工具
const { TransactionTestSuite, TransactionHelpers } = require('./transaction.test')

// ========== 项目架构特定工具 ==========

// 北京时间测试工具（符合项目UTC+8标准）
const { BeijingTimeTestSuite } = require('./beijing_time.test')

// 幂等性测试工具（符合项目business_id标准）
const { IdempotencyTestSuite } = require('./idempotency.test')

// 服务层测试工具（符合项目服务架构）
const { ServiceTestSuite } = require('./service.test')

// ========== 统一导出 ==========

module.exports = {
  // 基础通用工具
  SoftDeleteTestSuite,
  SoftDeleteHelpers,
  PaginationTestSuite,
  PaginationHelpers,
  TransactionTestSuite,
  TransactionHelpers,

  // 项目架构特定工具
  BeijingTimeTestSuite,
  IdempotencyTestSuite,
  ServiceTestSuite
}
