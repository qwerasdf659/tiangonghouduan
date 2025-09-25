/**
 * 数据库模块统一入口点 V4
 * 提供所有拆分后的数据访问对象
 * 创建时间：2025年01月21日 北京时间
 */

// 导入所有专门的数据库服务
const { DatabaseConnectionManager, getConnectionManager } = require('./DatabaseConnectionManager')
const { DatabaseSchemaManager, getSchemaManager } = require('./DatabaseSchemaManager')
const { DatabaseHealthChecker, getHealthChecker } = require('./DatabaseHealthChecker')
const { DatabaseMaintenanceService, getMaintenanceService } = require('./DatabaseMaintenanceService')
const { DatabaseValidationService, getValidationService } = require('./DatabaseValidationService')

/**
 * 数据库模块管理器 - 统一入口类
 * 协调各个专门的数据库服务
 */
class DatabaseModuleManager {
  constructor () {
    // 获取所有服务实例
    this.connectionManager = getConnectionManager()
    this.schemaManager = getSchemaManager()
    this.healthChecker = getHealthChecker()
    this.maintenanceService = getMaintenanceService()
    this.validationService = getValidationService()
  }

  /**
   * 获取Sequelize实例
   * @returns {Sequelize} Sequelize实例
   */
  getSequelize () {
    return this.connectionManager.getSequelize()
  }

  /**
   * 确保数据库连接
   * @returns {Promise<Sequelize>} 连接的Sequelize实例
   */
  async ensureConnection () {
    return this.connectionManager.ensureConnection()
  }

  /**
   * 基础查询方法
   * @param {string} sql SQL语句
   * @param {Array} params 参数
   * @param {Object} options 选项
   * @returns {Promise<Array>} 查询结果
   */
  async query (sql, params = [], options = {}) {
    await this.connectionManager.ensureConnection()
    const { QueryTypes } = require('sequelize')
    return this.connectionManager.getSequelize().query(sql, {
      replacements: params,
      type: options.type || QueryTypes.SELECT,
      ...options
    })
  }

  /**
   * 事务执行
   * @param {Function} callback 事务回调
   * @param {Object} options 事务选项
   * @returns {Promise<any>} 执行结果
   */
  async executeTransaction (callback, options = {}) {
    await this.connectionManager.ensureConnection()
    const sequelize = this.connectionManager.getSequelize()

    return sequelize.transaction(options, async (transaction) => {
      return callback(transaction)
    })
  }

  /**
   * 批量插入
   * @param {string} tableName 表名
   * @param {Array} records 记录数组
   * @param {Object} options 选项
   * @returns {Promise<Object>} 插入结果
   */
  async bulkInsert (tableName, records, options = {}) {
    if (!records || records.length === 0) {
      return { inserted: 0, message: '没有记录需要插入' }
    }

    try {
      await this.connectionManager.ensureConnection()
      const sequelize = this.connectionManager.getSequelize()

      const result = await sequelize.getQueryInterface().bulkInsert(
        tableName,
        records,
        {
          updateOnDuplicate: options.updateOnDuplicate || [],
          ...options
        }
      )

      return {
        inserted: records.length,
        result,
        message: `成功插入 ${records.length} 条记录到 ${tableName}`
      }
    } catch (error) {
      console.error(`[DatabaseModuleManager] 批量插入失败 (${tableName}):`, error.message)
      throw error
    }
  }

  // 代理所有其他方法到相应的服务
  async performCompleteCheck (options = {}) {
    return this.validationService.performCompleteCheck(options)
  }

  async healthCheck () {
    return this.healthChecker.healthCheck()
  }

  async getStats () {
    return this.healthChecker.getStats()
  }

  async backupTables (tableNames = []) {
    return this.maintenanceService.backupTables(tableNames)
  }

  async cleanupTestData (options = {}) {
    return this.maintenanceService.cleanupTestData(options)
  }

  async systemCleanup (options = {}) {
    return this.maintenanceService.systemCleanup(options)
  }

  async tableExists (tableName) {
    return this.schemaManager.tableExists(tableName)
  }

  async getTableStructure (tableName) {
    return this.schemaManager.getTableStructure(tableName)
  }

  async columnExists (tableName, columnName) {
    return this.schemaManager.columnExists(tableName, columnName)
  }

  async addColumn (tableName, columnName, columnDefinition) {
    return this.schemaManager.addColumn(tableName, columnName, columnDefinition)
  }

  async modifyColumn (tableName, columnName, columnDefinition) {
    return this.schemaManager.modifyColumn(tableName, columnName, columnDefinition)
  }

  async validateDatabaseConfig () {
    return this.validationService.validateDatabaseConfig()
  }

  async validateLotteryStrategies () {
    return this.validationService.validateLotteryStrategies()
  }

  async checkDatabasePerformance () {
    return this.healthChecker.checkDatabasePerformance()
  }

  async disconnect () {
    return this.connectionManager.disconnect()
  }

  getConnectionStatus () {
    return this.connectionManager.getConnectionStatus()
  }

  async checkIndexIntegrity () {
    return this.schemaManager.checkIndexIntegrity()
  }

  async createMissingIndexes (missingIndexes) {
    return this.schemaManager.createMissingIndexes(missingIndexes)
  }

  async checkForeignKeyConstraints () {
    return this.schemaManager.checkForeignKeyConstraints()
  }

  async createMissingForeignKeys (missingConstraints) {
    return this.schemaManager.createMissingForeignKeys(missingConstraints)
  }

  async checkDuplicateTables () {
    return this.schemaManager.checkDuplicateTables()
  }

  generateSystemCleanupReport (results) {
    return this.maintenanceService.generateCleanupReport(results)
  }

  async getTableIndexes (tableName) {
    return this.schemaManager.getTableIndexes(tableName)
  }
}

// 创建单例实例
let moduleManager = null

/**
 * 获取数据库模块管理器实例
 * @returns {DatabaseModuleManager} 管理器实例
 */
function getDatabaseHelper () {
  if (!moduleManager) {
    moduleManager = new DatabaseModuleManager()
  }
  return moduleManager
}

/**
 * 获取Sequelize实例
 * @returns {Sequelize} Sequelize实例
 */
function getSequelize () {
  return getDatabaseHelper().getSequelize()
}

/**
 * 快速健康检查
 * @returns {Promise<boolean>} 是否健康
 */
async function isDatabaseHealthy () {
  try {
    const helper = getDatabaseHelper()
    const result = await helper.healthCheck()
    return result.connected
  } catch (error) {
    return false
  }
}

// 统一导出所有数据库相关功能
module.exports = {
  // 主要接口（推荐使用）
  getDatabaseHelper,
  getSequelize,
  isDatabaseHealthy,

  // 专门的服务类（高级用户使用）
  DatabaseConnectionManager,
  DatabaseSchemaManager,
  DatabaseHealthChecker,
  DatabaseMaintenanceService,
  DatabaseValidationService,
  DatabaseModuleManager,

  // 服务实例获取函数
  getConnectionManager,
  getSchemaManager,
  getHealthChecker,
  getMaintenanceService,
  getValidationService,

  // 向后兼容
  UnifiedDatabaseHelper: DatabaseModuleManager
}
