/**
 * 数据库健康检查器 V4
 * 专门负责健康检查、性能监控和数据库统计
 * 从UnifiedDatabaseHelper中拆分的健康检查职责
 * 创建时间：2025年01月21日 北京时间
 */

const { QueryTypes } = require('sequelize')
const { getConnectionManager } = require('./DatabaseConnectionManager')
const BeijingTimeHelper = require('../timeHelper')

class DatabaseHealthChecker {
  constructor () {
    this.connectionManager = getConnectionManager()
  }

  /**
   * 获取Sequelize实例
   * @returns {Sequelize} Sequelize实例
   */
  get sequelize () {
    return this.connectionManager.getSequelize()
  }

  /**
   * 数据库健康检查
   * @returns {Promise<Object>} 健康检查结果
   */
  async healthCheck () {
    const checkTime = BeijingTimeHelper.apiTimestamp()

    try {
      await this.connectionManager.ensureConnection()

      // 基础连接测试
      const connectionTest = await this.testBasicConnection()

      // 权限测试
      const permissionTest = await this.testDatabasePermissions()

      // 表存在性检查
      const tableTest = await this.checkCoreTables()

      // 数据一致性检查
      const dataTest = await this.checkDataConsistency()

      const allPassed = connectionTest.success && permissionTest.success &&
                       tableTest.success && dataTest.success

      return {
        timestamp: checkTime,
        connected: allPassed,
        details: {
          connection: connectionTest,
          permissions: permissionTest,
          tables: tableTest,
          data: dataTest
        }
      }
    } catch (error) {
      console.error('[DatabaseHealthChecker] 健康检查失败:', error.message)
      return {
        timestamp: checkTime,
        connected: false,
        error: error.message
      }
    }
  }

  /**
   * 测试基础数据库连接
   * @returns {Promise<Object>} 连接测试结果
   */
  async testBasicConnection () {
    try {
      const startTime = Date.now()
      await this.sequelize.authenticate()
      const responseTime = Date.now() - startTime

      return {
        success: true,
        responseTime,
        message: '数据库连接正常'
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: '数据库连接失败'
      }
    }
  }

  /**
   * 测试数据库权限
   * @returns {Promise<Object>} 权限测试结果
   */
  async testDatabasePermissions () {
    try {
      // 测试基本查询权限
      await this.sequelize.query('SELECT 1', { type: QueryTypes.SELECT })

      // 测试表访问权限
      await this.sequelize.query('SHOW TABLES', { type: QueryTypes.SELECT })

      return {
        success: true,
        message: '数据库权限正常'
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: '数据库权限不足'
      }
    }
  }

  /**
   * 检查核心表存在性
   * @returns {Promise<Object>} 表检查结果
   */
  async checkCoreTables () {
    const coreTables = [
      'users',
      'lottery_draws',
      'lottery_prizes',
      'user_points_accounts'
    ]

    try {
      const existingTables = await this.sequelize.query('SHOW TABLES', {
        type: QueryTypes.SELECT
      })

      const tableNames = existingTables.map(table => Object.values(table)[0])
      const missingTables = coreTables.filter(table => !tableNames.includes(table))

      return {
        success: missingTables.length === 0,
        existingCount: tableNames.length,
        missingTables,
        message: missingTables.length === 0
          ? '所有核心表存在'
          : `缺少核心表: ${missingTables.join(', ')}`
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: '无法检查表结构'
      }
    }
  }

  /**
   * 检查数据一致性
   * @returns {Promise<Object>} 数据一致性检查结果
   */
  async checkDataConsistency () {
    try {
      const issues = []

      // 检查用户表基础数据
      const userCount = await this.getTableRecordCount('users')
      if (userCount === 0) {
        issues.push('用户表为空')
      }

      // 检查抽奖记录与用户关联
      const orphanRecords = await this.sequelize.query(`
        SELECT COUNT(*) as count 
        FROM lottery_draws lr 
        LEFT JOIN users u ON lr.user_id = u.id 
        WHERE u.id IS NULL
      `, { type: QueryTypes.SELECT })

      if (orphanRecords[0].count > 0) {
        issues.push(`发现${orphanRecords[0].count}条孤立的抽奖记录`)
      }

      return {
        success: issues.length === 0,
        issues,
        message: issues.length === 0 ? '数据一致性正常' : '发现数据一致性问题'
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: '数据一致性检查失败'
      }
    }
  }

  /**
   * 获取表记录数量
   * @param {string} tableName 表名
   * @returns {Promise<number>} 记录数量
   */
  async getTableRecordCount (tableName) {
    try {
      const result = await this.sequelize.query(
        `SELECT COUNT(*) as count FROM ${tableName}`,
        { type: QueryTypes.SELECT }
      )
      return result[0].count
    } catch (error) {
      console.warn(`[DatabaseHealthChecker] 无法获取表 ${tableName} 的记录数:`, error.message)
      return 0
    }
  }

  /**
   * 获取数据库统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStats () {
    const stats = {
      timestamp: BeijingTimeHelper.apiTimestamp(),
      tables: [],
      totalRecords: 0,
      databaseSize: 0
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
          const recordCount = await this.getTableRecordCount(tableName)

          // 获取表大小
          const sizeResult = await this.sequelize.query(`
            SELECT 
              ROUND(((data_length + index_length) / 1024 / 1024), 2) AS size_mb
            FROM information_schema.tables 
            WHERE table_schema = ? AND table_name = ?
          `, {
            replacements: [process.env.DB_NAME, tableName],
            type: QueryTypes.SELECT
          })

          const sizeInfo = sizeResult[0] || { size_mb: 0 }

          stats.tables.push({
            name: tableName,
            records: recordCount,
            sizeMB: sizeInfo.size_mb
          })

          stats.totalRecords += recordCount
          stats.databaseSize += sizeInfo.size_mb
        } catch (error) {
          console.warn(`[DatabaseHealthChecker] 无法获取表 ${tableName} 的统计信息:`, error.message)
        }
      }

      console.log(`[DatabaseHealthChecker] 统计完成: ${stats.tables.length}个表，总记录数：${stats.totalRecords}`)
      return stats
    } catch (error) {
      console.error('[DatabaseHealthChecker] 获取统计信息失败:', error.message)
      throw error
    }
  }

  /**
   * 检查数据库性能
   * @returns {Promise<Object>} 性能检查结果
   */
  async checkDatabasePerformance () {
    try {
      await this.connectionManager.ensureConnection()

      // 检查慢查询
      const [slowQueries] = await this.sequelize.query(`
        SELECT COUNT(*) as slow_query_count 
        FROM information_schema.PROCESSLIST 
        WHERE TIME > 2
      `, { type: QueryTypes.SELECT })

      // 检查连接数
      const [connections] = await this.sequelize.query(
        'SHOW STATUS LIKE "Threads_connected"',
        { type: QueryTypes.SELECT }
      )

      // 检查缓存命中率
      const cacheStatus = await this.sequelize.query(`
        SHOW STATUS LIKE 'Qcache%'
      `, { type: QueryTypes.SELECT })

      // 检查表锁等待
      const [tableLocks] = await this.sequelize.query(`
        SHOW STATUS LIKE 'Table_locks_waited'
      `, { type: QueryTypes.SELECT })

      return {
        type: 'performanceCheck',
        success: true,
        metrics: {
          slowQueries: slowQueries.slow_query_count,
          connections: connections.Value,
          tableLockWaits: tableLocks.Value,
          cacheStatus: cacheStatus.reduce((acc, item) => {
            acc[item.Variable_name] = item.Value
            return acc
          }, {})
        },
        recommendations: this.generatePerformanceRecommendations({
          slowQueries: slowQueries.slow_query_count,
          connections: connections.Value
        })
      }
    } catch (error) {
      console.error('[DatabaseHealthChecker] 性能检查失败:', error.message)
      return {
        type: 'performanceCheck',
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 生成性能建议
   * @param {Object} metrics 性能指标
   * @returns {Array} 建议列表
   */
  generatePerformanceRecommendations (metrics) {
    const recommendations = []

    if (metrics.slowQueries > 5) {
      recommendations.push('检测到较多慢查询，建议优化查询语句或添加索引')
    }

    if (metrics.connections > 50) {
      recommendations.push('数据库连接数较高，建议检查连接池配置')
    }

    if (recommendations.length === 0) {
      recommendations.push('数据库性能正常')
    }

    return recommendations
  }

  /**
   * 快速健康检查
   * @returns {Promise<boolean>} 是否健康
   */
  async isHealthy () {
    try {
      const result = await this.healthCheck()
      return result.connected
    } catch (error) {
      return false
    }
  }
}

// 导出单例实例获取函数
let healthChecker = null

function getHealthChecker () {
  if (!healthChecker) {
    healthChecker = new DatabaseHealthChecker()
  }
  return healthChecker
}

module.exports = {
  DatabaseHealthChecker,
  getHealthChecker
}
