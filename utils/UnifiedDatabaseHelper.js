/**
 * 统一数据库操作助手 V4
 * 直接导出新的拆分架构，无向后兼容代码
 * 创建时间：2025年01月21日 北京时间
 *
 * 新架构说明：
 * - DatabaseConnectionManager: 连接管理
 * - DatabaseSchemaManager: 表结构管理
 * - DatabaseHealthChecker: 健康检查和性能监控
 * - DatabaseMaintenanceService: 数据维护和清理
 * - DatabaseValidationService: 验证服务
 */

// 直接导出新的拆分架构
module.exports = require('./database')
