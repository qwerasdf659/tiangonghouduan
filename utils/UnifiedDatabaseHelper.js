/**
 * 统一数据库助手 V4 - 整合版
 * 消除过度拆分的技术债务，提供完整的数据库管理功能
 * 包含连接管理、健康检查、表结构管理、维护服务、验证服务
 * 🕐 全系统统一使用北京时间 (UTC+8)
 * 更新时间：2025年09月29日 北京时间
 */

const { Sequelize, QueryTypes } = require('sequelize')

class UnifiedDatabaseHelper {
  constructor () {
    // 单例模式
    if (UnifiedDatabaseHelper.instance) {
      return UnifiedDatabaseHelper.instance
    }

    // 创建Sequelize实例
    this.sequelize = new Sequelize(
      process.env.DB_NAME || 'restaurant_points_dev',
      process.env.DB_USER || 'root',
      process.env.DB_PASSWORD || '',
      {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        timezone: '+08:00', // 全系统统一使用北京时间
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000
        },
        define: {
          timestamps: true,
          underscored: true,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      }
    )

    // 连接状态管理
    this.isConnected = false
    this.connectionPromise = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 3

    // V4项目标准表结构
    this.standardSchema = {
      users: {
        primaryKey: 'user_id',
        requiredFields: ['mobile', 'nickname', 'is_admin', 'status'],
        fieldMappings: {
          phone_number: 'mobile',
          phone: 'mobile'
        }
      },
      lottery_draws: {
        primaryKey: 'draw_id',
        requiredFields: ['user_id', 'draw_time', 'is_winner'],
        indexes: [
          { columns: ['user_id'], unique: false },
          { columns: ['draw_time'], unique: false },
          { columns: ['is_winner'], unique: false }
        ]
      },
      lottery_prizes: {
        primaryKey: 'prize_id',
        requiredFields: ['prize_name', 'stock', 'status']
      },
      user_points_accounts: {
        primaryKey: 'account_id',
        requiredFields: ['user_id', 'total_points', 'available_points'],
        indexes: [
          { columns: ['user_id'], unique: true }
        ]
      }
    }

    // 核心表列表
    this.coreTables = ['users', 'lottery_draws', 'lottery_prizes', 'user_points_accounts']

    UnifiedDatabaseHelper.instance = this
    console.log('[UnifiedDatabaseHelper] 初始化完成')
  }

  /**
   * 确保数据库连接
   * @returns {Promise<Sequelize>} 连接的Sequelize实例
   */
  async ensureConnection () {
    if (this.isConnected) {
      return this.sequelize
    }

    if (!this.connectionPromise) {
      this.connectionPromise = this.connect()
    }

    await this.connectionPromise
    return this.sequelize
  }

  /**
   * 连接数据库
   * @returns {Promise<void>}
   */
  async connect () {
    try {
      await this.sequelize.authenticate()
      this.isConnected = true
      this.reconnectAttempts = 0
      console.log(`[UnifiedDatabaseHelper] 数据库连接成功: ${process.env.DB_NAME}`)
    } catch (error) {
      console.error('[UnifiedDatabaseHelper] 数据库连接失败:', error.message)
      await this.handleConnectionError(error)
    }
  }

  /**
   * 处理连接错误
   * @param {Error} error 连接错误
   */
  async handleConnectionError (error) {
    this.reconnectAttempts++

    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      console.log(`[UnifiedDatabaseHelper] 尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

      // 指数退避重试
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000)
      await new Promise(resolve => {
        setTimeout(resolve, delay)
      })

      this.connectionPromise = null
      await this.ensureConnection()
    } else {
      console.error('[UnifiedDatabaseHelper] 达到最大重连次数，连接失败')
      throw error
    }
  }

  /**
   * 数据库健康检查 - 整合版
   * @returns {Promise<Object>} 健康检查结果
   */
  async healthCheck () {
    const checkTime = new Date().toISOString()

    try {
      await this.ensureConnection()

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
      console.error('[UnifiedDatabaseHelper] 健康检查失败:', error.message)
      return {
        timestamp: checkTime,
        connected: false,
        error: error.message
      }
    }
  }

  /**
   * 测试基础数据库连接
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
   */
  async checkCoreTables () {
    try {
      const existingTables = await this.sequelize.query('SHOW TABLES', {
        type: QueryTypes.SELECT
      })

      const tableNames = existingTables.map(table => Object.values(table)[0])
      const missingTables = this.coreTables.filter(table => !tableNames.includes(table))

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
        LEFT JOIN users u ON lr.user_id = u.user_id 
        WHERE u.user_id IS NULL
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
      console.warn(`[UnifiedDatabaseHelper] 无法获取表 ${tableName} 的记录数:`, error.message)
      return 0
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getStats () {
    const stats = {
      timestamp: new Date().toISOString(),
      tables: [],
      totalRecords: 0,
      databaseSize: 0
    }

    try {
      await this.ensureConnection()

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
          stats.databaseSize += parseFloat(sizeInfo.size_mb) || 0
        } catch (error) {
          console.warn(`[UnifiedDatabaseHelper] 无法获取表 ${tableName} 的统计信息:`, error.message)
        }
      }

      console.log(`[UnifiedDatabaseHelper] 统计完成: ${stats.tables.length}个表，总记录数：${stats.totalRecords}`)
      return stats
    } catch (error) {
      console.error('[UnifiedDatabaseHelper] 获取统计信息失败:', error.message)
      throw error
    }
  }

  /**
   * 检查表是否存在
   * @param {string} tableName 表名
   * @returns {Promise<boolean>} 表是否存在
   */
  async tableExists (tableName) {
    try {
      await this.ensureConnection()
      const result = await this.sequelize.query(
        'SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = ? AND table_name = ?',
        {
          replacements: [process.env.DB_NAME, tableName],
          type: QueryTypes.SELECT
        }
      )
      return result[0].count > 0
    } catch (error) {
      console.error(`[UnifiedDatabaseHelper] 检查表存在性失败 (${tableName}):`, error.message)
      return false
    }
  }

  /**
   * 获取表结构
   * @param {string} tableName 表名
   * @returns {Promise<Array>} 表结构信息
   */
  async getTableStructure (tableName) {
    try {
      await this.ensureConnection()
      return await this.sequelize.query(`DESCRIBE ${tableName}`, {
        type: QueryTypes.SELECT
      })
    } catch (error) {
      console.error(`[UnifiedDatabaseHelper] 获取表结构失败 (${tableName}):`, error.message)
      throw error
    }
  }

  /**
   * 检查列是否存在
   * @param {string} tableName 表名
   * @param {string} columnName 列名
   * @returns {Promise<boolean>} 列是否存在
   */
  async columnExists (tableName, columnName) {
    try {
      const structure = await this.getTableStructure(tableName)
      return structure.some(column => column.Field === columnName)
    } catch (error) {
      console.error(`[UnifiedDatabaseHelper] 检查列存在性失败 (${tableName}.${columnName}):`, error.message)
      return false
    }
  }

  /**
   * 基础查询方法
   * @param {string} sql SQL语句
   * @param {Array} params 参数
   * @param {Object} options 选项
   * @returns {Promise<Array>} 查询结果
   */
  async query (sql, params = [], options = {}) {
    await this.ensureConnection()
    return this.sequelize.query(sql, {
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
    await this.ensureConnection()
    return this.sequelize.transaction(options, async (transaction) => {
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
      await this.ensureConnection()

      const result = await this.sequelize.getQueryInterface().bulkInsert(
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
      console.error(`[UnifiedDatabaseHelper] 批量插入失败 (${tableName}):`, error.message)
      throw error
    }
  }

  /**
   * 数据库性能检查
   */
  async checkDatabasePerformance () {
    try {
      await this.ensureConnection()

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

      return {
        type: 'performanceCheck',
        success: true,
        metrics: {
          slowQueries: slowQueries.slow_query_count,
          connections: connections.Value
        },
        recommendations: this.generatePerformanceRecommendations({
          slowQueries: slowQueries.slow_query_count,
          connections: connections.Value
        })
      }
    } catch (error) {
      console.error('[UnifiedDatabaseHelper] 性能检查失败:', error.message)
      return {
        type: 'performanceCheck',
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 生成性能建议
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
   * 关闭数据库连接
   */
  async disconnect () {
    if (this.sequelize) {
      await this.sequelize.close()
      this.isConnected = false
      this.connectionPromise = null
      console.log('[UnifiedDatabaseHelper] 数据库连接已关闭')
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus () {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      database: process.env.DB_NAME,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT
    }
  }

  /**
   * 获取Sequelize实例
   * @returns {Sequelize} Sequelize实例
   */
  getSequelize () {
    return this.sequelize
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

  /**
   * 系统清理 - 基础版本
   * @param {Object} options 清理选项
   * @returns {Promise<Object>} 清理结果
   */
  async systemCleanup (_options = {}) {
    const results = {
      tablesChecked: 0,
      issuesFound: 0,
      issuesFixed: 0,
      summary: []
    }

    try {
      await this.ensureConnection()

      // 基础数据一致性检查
      const consistencyCheck = await this.checkDataConsistency()
      results.tablesChecked++

      if (!consistencyCheck.success) {
        results.issuesFound += consistencyCheck.issues?.length || 1
        results.summary.push('数据一致性问题需要手动处理')
      } else {
        results.summary.push('数据一致性正常')
      }

      // 基础清理完成
      results.summary.push(`检查完成：${results.tablesChecked}个表`)

      console.log('[UnifiedDatabaseHelper] 系统清理完成')
      return results
    } catch (error) {
      console.error('[UnifiedDatabaseHelper] 系统清理失败:', error.message)
      throw error
    }
  }
}

// 创建单例实例
let databaseHelper = null

/**
 * 获取统一数据库助手实例
 * @returns {UnifiedDatabaseHelper} 数据库助手实例
 */
function getDatabaseHelper () {
  if (!databaseHelper) {
    databaseHelper = new UnifiedDatabaseHelper()
  }
  return databaseHelper
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
    return await helper.isHealthy()
  } catch (error) {
    return false
  }
}

// 导出接口
module.exports = {
  UnifiedDatabaseHelper,
  getDatabaseHelper,
  getSequelize,
  isDatabaseHealthy
}
