/**
 * 数据库模块统一入口点 V4 - 简化版
 * 消除过度拆分的技术债务，专注核心业务功能
 * 更新时间：2025年09月29日 UTC时间
 */

// 统一导入数据库助手
const {
  UnifiedDatabaseHelper,
  getDatabaseHelper,
  getSequelize,
  isDatabaseHealthy
} = require('../UnifiedDatabaseHelper')

// 保持Redis客户端独立
const { UnifiedRedisClient, getRedisClient, isRedisHealthy } = require('../UnifiedRedisClient')

// 统一导出所有数据库相关功能 - 只保留核心接口
module.exports = {
  // === 核心接口（推荐使用）===
  getDatabaseHelper, // 获取数据库助手实例
  getSequelize, // 获取Sequelize实例
  isDatabaseHealthy, // 数据库健康检查

  // === Redis客户端接口 ===
  getRedisClient, // 获取Redis客户端
  isRedisHealthy, // Redis健康检查

  // === 类导出（高级用户使用）===
  UnifiedDatabaseHelper,
  UnifiedRedisClient
}
