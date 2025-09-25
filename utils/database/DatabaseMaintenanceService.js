/**
 * 数据库维护服务 V4
 * 专门负责数据清理、备份和系统维护操作
 * 从UnifiedDatabaseHelper中拆分的维护职责
 * 创建时间：2025年01月21日 北京时间
 */

const { QueryTypes } = require('sequelize')
const { getConnectionManager } = require('./DatabaseConnectionManager')
const { getSchemaManager } = require('./DatabaseSchemaManager')
const BeijingTimeHelper = require('../timeHelper')

class DatabaseMaintenanceService {
  constructor () {
    this.connectionManager = getConnectionManager()
    this.schemaManager = getSchemaManager()
  }

  /**
   * 获取Sequelize实例
   * @returns {Sequelize} Sequelize实例
   */
  get sequelize () {
    return this.connectionManager.getSequelize()
  }

  /**
   * 数据备份
   * @param {Array<string>} tableNames 要备份的表名列表
   * @returns {Promise<Object>} 备份结果
   */
  async backupTables (tableNames = []) {
    const backupData = {
      timestamp: BeijingTimeHelper.apiTimestamp(),
      tables: {},
      totalRecords: 0
    }

    try {
      await this.connectionManager.ensureConnection()

      const tablesToBackup = tableNames.length > 0
        ? tableNames
        : await this.sequelize.query('SHOW TABLES', { type: QueryTypes.SELECT })
          .then(tables => tables.map(table => Object.values(table)[0]))

      for (const tableName of tablesToBackup) {
        try {
          const records = await this.sequelize.query(`SELECT * FROM ${tableName}`, {
            type: QueryTypes.SELECT
          })
          backupData.tables[tableName] = records
          backupData.totalRecords += records.length
          console.log(`[DatabaseMaintenanceService] 备份 ${tableName}: ${records.length} 条记录`)
        } catch (error) {
          console.warn(`[DatabaseMaintenanceService] 无法备份表 ${tableName}:`, error.message)
          backupData.tables[tableName] = { error: error.message }
        }
      }

      console.log(
        `[DatabaseMaintenanceService] 备份完成: ${Object.keys(backupData.tables).length}个表，总计${backupData.totalRecords}条记录`
      )
      return backupData
    } catch (error) {
      console.error('[DatabaseMaintenanceService] 数据备份失败:', error.message)
      throw error
    }
  }

  /**
   * 清理测试数据
   * @param {Object} options 清理选项
   * @returns {Promise<Object>} 清理结果
   */
  async cleanupTestData (options = {}) {
    const {
      tables = ['lottery_draws', 'user_points_accounts', 'user_tasks'],
      condition = 'created_at < DATE_SUB(NOW(), INTERVAL 1 DAY) AND (phone LIKE \'136%\' OR nickname LIKE \'测试%\')',
      dryRun = false
    } = options

    const result = {
      tables: {},
      totalCleaned: 0,
      dryRun,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    try {
      await this.connectionManager.ensureConnection()

      for (const tableName of tables) {
        try {
          // 检查表是否存在
          const tableExists = await this.schemaManager.tableExists(tableName)
          if (!tableExists) {
            result.tables[tableName] = { cleaned: 0, message: '表不存在' }
            continue
          }

          // 先查询要删除的记录数
          const [countResult] = await this.sequelize.query(`
            SELECT COUNT(*) as count FROM ${tableName} WHERE ${condition}
          `, { type: QueryTypes.SELECT })

          const recordCount = countResult.count

          if (recordCount === 0) {
            result.tables[tableName] = { cleaned: 0, message: '没有符合条件的记录' }
            continue
          }

          if (dryRun) {
            result.tables[tableName] = {
              wouldClean: recordCount,
              message: '模拟运行，实际未删除'
            }
          } else {
            await this.sequelize.query(`DELETE FROM ${tableName} WHERE ${condition}`)
            result.tables[tableName] = {
              cleaned: recordCount,
              message: '清理完成'
            }
            result.totalCleaned += recordCount
          }
        } catch (error) {
          result.tables[tableName] = {
            error: error.message,
            message: '清理失败'
          }
          console.error(`[DatabaseMaintenanceService] 清理表 ${tableName} 失败:`, error.message)
        }
      }

      console.log(`[DatabaseMaintenanceService] 测试数据清理完成，总计清理 ${result.totalCleaned} 条记录`)
      return result
    } catch (error) {
      console.error('[DatabaseMaintenanceService] 测试数据清理失败:', error.message)
      throw error
    }
  }

  /**
   * 系统清理
   * @param {Object} options 清理选项
   * @returns {Promise<Object>} 清理结果
   */
  async systemCleanup (options = {}) {
    const {
      cleanTestData = true,
      optimizeTables = true,
      cleanupLogs = true,
      dryRun = false
    } = options

    const results = {
      timestamp: BeijingTimeHelper.apiTimestamp(),
      operations: {},
      totalRecords: 0,
      dryRun
    }

    try {
      await this.connectionManager.ensureConnection()

      // 1. 清理测试数据
      if (cleanTestData) {
        console.log('[DatabaseMaintenanceService] 开始清理测试数据...')
        const cleanResult = await this.cleanTestData({ dryRun })
        results.operations.testDataCleanup = cleanResult
        results.totalRecords += cleanResult.totalCleaned
      }

      // 2. 清理过期日志数据
      if (cleanupLogs) {
        console.log('[DatabaseMaintenanceService] 开始清理过期日志...')
        const logResult = await this.cleanupExpiredLogs({ dryRun })
        results.operations.logCleanup = logResult
        results.totalRecords += logResult.totalCleaned || 0
      }

      // 3. 优化表
      if (optimizeTables && !dryRun) {
        console.log('[DatabaseMaintenanceService] 开始优化表...')
        const optimizeResult = await this.optimizeTables()
        results.operations.tableOptimization = optimizeResult
      }

      console.log(`[DatabaseMaintenanceService] 系统清理完成，总计处理 ${results.totalRecords} 条记录`)
      return results
    } catch (error) {
      console.error('[DatabaseMaintenanceService] 系统清理失败:', error.message)
      throw error
    }
  }

  /**
   * 清理过期日志数据
   * @param {Object} options 清理选项
   * @returns {Promise<Object>} 清理结果
   */
  async cleanupExpiredLogs (options = {}) {
    const { daysToKeep = 30, dryRun = false } = options

    const result = {
      totalCleaned: 0,
      details: {},
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    try {
      // 清理超过保留期的日志记录（如果有日志表的话）
      const logTables = ['system_logs', 'error_logs', 'access_logs']

      for (const tableName of logTables) {
        try {
          const tableExists = await this.schemaManager.tableExists(tableName)
          if (!tableExists) {
            result.details[tableName] = { message: '表不存在' }
            continue
          }

          const condition = `created_at < DATE_SUB(NOW(), INTERVAL ${daysToKeep} DAY)`

          const [countResult] = await this.sequelize.query(`
            SELECT COUNT(*) as count FROM ${tableName} WHERE ${condition}
          `, { type: QueryTypes.SELECT })

          const recordCount = countResult.count

          if (recordCount === 0) {
            result.details[tableName] = { cleaned: 0, message: '没有过期记录' }
            continue
          }

          if (dryRun) {
            result.details[tableName] = {
              wouldClean: recordCount,
              message: '模拟运行，实际未删除'
            }
          } else {
            await this.sequelize.query(`DELETE FROM ${tableName} WHERE ${condition}`)
            result.details[tableName] = {
              cleaned: recordCount,
              message: '清理完成'
            }
            result.totalCleaned += recordCount
          }
        } catch (error) {
          result.details[tableName] = {
            error: error.message,
            message: '清理失败'
          }
          console.error(`[DatabaseMaintenanceService] 清理日志表 ${tableName} 失败:`, error.message)
        }
      }

      return result
    } catch (error) {
      console.error('[DatabaseMaintenanceService] 清理过期日志失败:', error.message)
      throw error
    }
  }

  /**
   * 优化表
   * @returns {Promise<Object>} 优化结果
   */
  async optimizeTables () {
    const result = {
      optimized: 0,
      failed: 0,
      details: [],
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    try {
      await this.connectionManager.ensureConnection()

      // 获取所有表名
      const tables = await this.sequelize.query('SHOW TABLES', {
        type: QueryTypes.SELECT
      })

      for (const table of tables) {
        const tableName = Object.values(table)[0]

        try {
          await this.sequelize.query(`OPTIMIZE TABLE ${tableName}`)
          result.optimized++
          result.details.push({
            table: tableName,
            status: 'optimized'
          })
          console.log(`[DatabaseMaintenanceService] 表优化成功: ${tableName}`)
        } catch (error) {
          result.failed++
          result.details.push({
            table: tableName,
            status: 'failed',
            error: error.message
          })
          console.error(`[DatabaseMaintenanceService] 表优化失败 ${tableName}:`, error.message)
        }
      }

      console.log(`[DatabaseMaintenanceService] 表优化完成: 成功${result.optimized}个，失败${result.failed}个`)
      return result
    } catch (error) {
      console.error('[DatabaseMaintenanceService] 表优化失败:', error.message)
      throw error
    }
  }

  /**
   * 生成系统清理报告
   * @param {Object} results 清理结果
   * @returns {string} 格式化的报告
   */
  generateCleanupReport (results) {
    let report = `
=== 数据库系统清理报告 ===
时间: ${results.timestamp}
模式: ${results.dryRun ? '模拟运行' : '实际清理'}
总处理记录数: ${results.totalRecords}

`

    // 测试数据清理
    if (results.operations.testDataCleanup) {
      const testDataCleanup = results.operations.testDataCleanup
      report += '## 测试数据清理:\n'
      Object.entries(testDataCleanup.tables).forEach(([table, result]) => {
        if (result.cleaned !== undefined) {
          report += `  - ${table}: 清理 ${result.cleaned} 条记录\n`
        } else if (result.wouldClean !== undefined) {
          report += `  - ${table}: 将清理 ${result.wouldClean} 条记录 (模拟)\n`
        } else {
          report += `  - ${table}: ${result.message}\n`
        }
      })
    }

    // 日志清理
    if (results.operations.logCleanup) {
      const logData = results.operations.logCleanup
      report += '\n## 日志数据清理:\n'
      report += `  总清理记录: ${logData.totalCleaned}\n`
    }

    // 表优化
    if (results.operations.tableOptimization) {
      const optimize = results.operations.tableOptimization
      report += '\n## 表优化:\n'
      report += `  成功优化: ${optimize.optimized} 个表\n`
      report += `  优化失败: ${optimize.failed} 个表\n`
    }

    report += '\n=== 报告结束 ===\n'
    return report
  }

  /**
   * 执行数据库维护任务
   * @param {Object} taskConfig 任务配置
   * @returns {Promise<Object>} 维护结果
   */
  async performMaintenance (taskConfig = {}) {
    const {
      backup = false,
      cleanup = true,
      optimize = false,
      dryRun = false
    } = taskConfig

    const maintenanceResult = {
      timestamp: BeijingTimeHelper.apiTimestamp(),
      tasks: {},
      summary: {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0
      }
    }

    try {
      await this.connectionManager.ensureConnection()

      // 1. 数据备份
      if (backup) {
        try {
          console.log('[DatabaseMaintenanceService] 执行数据备份...')
          maintenanceResult.tasks.backup = await this.backupTables()
          maintenanceResult.summary.totalTasks++
          maintenanceResult.summary.successfulTasks++
        } catch (error) {
          maintenanceResult.tasks.backup = { error: error.message }
          maintenanceResult.summary.totalTasks++
          maintenanceResult.summary.failedTasks++
        }
      }

      // 2. 系统清理
      if (cleanup) {
        try {
          console.log('[DatabaseMaintenanceService] 执行系统清理...')
          maintenanceResult.tasks.cleanup = await this.systemCleanup({ dryRun })
          maintenanceResult.summary.totalTasks++
          maintenanceResult.summary.successfulTasks++
        } catch (error) {
          maintenanceResult.tasks.cleanup = { error: error.message }
          maintenanceResult.summary.totalTasks++
          maintenanceResult.summary.failedTasks++
        }
      }

      // 3. 表优化
      if (optimize && !dryRun) {
        try {
          console.log('[DatabaseMaintenanceService] 执行表优化...')
          maintenanceResult.tasks.optimize = await this.optimizeTables()
          maintenanceResult.summary.totalTasks++
          maintenanceResult.summary.successfulTasks++
        } catch (error) {
          maintenanceResult.tasks.optimize = { error: error.message }
          maintenanceResult.summary.totalTasks++
          maintenanceResult.summary.failedTasks++
        }
      }

      console.log(`[DatabaseMaintenanceService] 维护任务完成: ${maintenanceResult.summary.successfulTasks}/${maintenanceResult.summary.totalTasks} 成功`)
      return maintenanceResult
    } catch (error) {
      console.error('[DatabaseMaintenanceService] 数据库维护失败:', error.message)
      throw error
    }
  }
}

// 导出单例实例获取函数
let maintenanceService = null

function getMaintenanceService () {
  if (!maintenanceService) {
    maintenanceService = new DatabaseMaintenanceService()
  }
  return maintenanceService
}

module.exports = {
  DatabaseMaintenanceService,
  getMaintenanceService
}
