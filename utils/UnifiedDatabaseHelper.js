/**
 * 统一数据库操作助手 V4
 * 整合并优化scripts中重复的数据库连接和查询代码
 * 提供统一的数据库操作接口，消除技术债务
 * 创建时间：2025年01月21日 北京时间
 *
 * 核心功能：
 * 1. 统一数据库连接管理
 * 2. 标准化查询操作
 * 3. 事务管理和错误处理
 * 4. 表结构检查和验证
 * 5. 数据迁移支持
 */

const { Sequelize, QueryTypes } = require('sequelize')
const BeijingTimeHelper = require('./timeHelper')

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
        timezone: '+08:00', // 北京时间
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

    // 连接状态
    this.isConnected = false
    this.connectionPromise = null

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
      console.log(`[UnifiedDatabaseHelper] 数据库连接成功: ${process.env.DB_NAME}`)
    } catch (error) {
      console.error('[UnifiedDatabaseHelper] 数据库连接失败:', error.message)
      throw error
    }
  }

  /**
   * 关闭数据库连接
   */
  async disconnect () {
    if (this.sequelize) {
      await this.sequelize.close()
      this.isConnected = false
      console.log('[UnifiedDatabaseHelper] 数据库连接已关闭')
    }
  }

  /**
   * 执行SQL查询
   * @param {string} sql SQL语句
   * @param {Object} options 查询选项
   * @returns {Promise<Array>} 查询结果
   */
  async query (sql, params = [], options = {}) {
    const sequelize = await this.ensureConnection()

    const queryOptions = {
      type: QueryTypes.SELECT,
      replacements: params,
      ...options
    }

    try {
      console.log(`[SQL查询] ${sql.replace(/\s+/g, ' ').substring(0, 100)}...`)
      const result = await sequelize.query(sql, queryOptions)
      return result
    } catch (error) {
      console.error('[SQL查询失败]:', error.message)
      throw error
    }
  }

  /**
   * 执行插入操作
   * @param {string} sql 插入SQL语句
   * @param {Array} params 参数数组
   * @returns {Promise<Array>} 插入结果
   */
  async insert (sql, params = []) {
    return await this.query(sql, {
      type: QueryTypes.INSERT,
      replacements: params
    })
  }

  /**
   * 执行更新操作
   * @param {string} sql 更新SQL语句
   * @param {Array} params 参数数组
   * @returns {Promise<Array>} 更新结果
   */
  async update (sql, params = []) {
    return await this.query(sql, {
      type: QueryTypes.UPDATE,
      replacements: params
    })
  }

  /**
   * 执行删除操作
   * @param {string} sql 删除SQL语句
   * @param {Array} params 参数数组
   * @returns {Promise<Array>} 删除结果
   */
  async delete (sql, params = []) {
    return await this.query(sql, {
      type: QueryTypes.DELETE,
      replacements: params
    })
  }

  /**
   * 检查表是否存在
   * @param {string} tableName 表名
   * @returns {Promise<boolean>} 表是否存在
   */
  async tableExists (tableName) {
    try {
      const result = await this.query(`SHOW TABLES LIKE '${tableName}'`)
      return result.length > 0
    } catch (error) {
      console.error(`[表检查失败] ${tableName}:`, error.message)
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
      return await this.query(`DESCRIBE ${tableName}`)
    } catch (error) {
      console.error(`[获取表结构失败] ${tableName}:`, error.message)
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
      const columns = await this.query(
        `
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
      `,
        {
          replacements: [process.env.DB_NAME, tableName, columnName]
        }
      )
      return columns.length > 0
    } catch (error) {
      console.error(`[列检查失败] ${tableName}.${columnName}:`, error.message)
      return false
    }
  }

  /**
   * 添加列
   * @param {string} tableName 表名
   * @param {string} columnName 列名
   * @param {string} columnDefinition 列定义
   * @returns {Promise<void>}
   */
  async addColumn (tableName, columnName, columnDefinition) {
    const exists = await this.columnExists(tableName, columnName)
    if (exists) {
      console.log(`[跳过] 列 ${tableName}.${columnName} 已存在`)
      return
    }

    try {
      await this.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`)
      console.log(`[成功] 添加列 ${tableName}.${columnName}`)
    } catch (error) {
      console.error(`[失败] 添加列 ${tableName}.${columnName}:`, error.message)
      throw error
    }
  }

  /**
   * 修改列
   * @param {string} tableName 表名
   * @param {string} columnName 列名
   * @param {string} columnDefinition 新列定义
   * @returns {Promise<void>}
   */
  async modifyColumn (tableName, columnName, columnDefinition) {
    try {
      await this.query(`ALTER TABLE ${tableName} MODIFY COLUMN ${columnName} ${columnDefinition}`)
      console.log(`[成功] 修改列 ${tableName}.${columnName}`)
    } catch (error) {
      console.error(`[失败] 修改列 ${tableName}.${columnName}:`, error.message)
      throw error
    }
  }

  /**
   * 安全事务执行
   * @param {Function} callback 事务执行函数
   * @param {Object} options 事务选项
   * @returns {Promise<any>} 事务结果
   */
  async executeTransaction (callback, options = {}) {
    const sequelize = await this.ensureConnection()
    const transaction = await sequelize.transaction(options)

    try {
      console.log('[事务开始] 执行数据库事务')
      const result = await callback(transaction)

      if (!transaction.finished) {
        await transaction.commit()
        console.log('[事务提交] 事务执行成功')
      }

      return result
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback()
        console.log('[事务回滚] 事务执行失败')
      }

      console.error('[事务错误]:', error.message)
      throw error
    }
  }

  /**
   * 批量插入数据
   * @param {string} tableName 表名
   * @param {Array<Object>} records 记录数组
   * @param {Object} options 插入选项
   * @returns {Promise<Array>} 插入结果
   */
  async bulkInsert (tableName, records, _options = {}) {
    if (!records || records.length === 0) {
      return []
    }

    return await this.executeTransaction(async transaction => {
      const results = []

      for (const record of records) {
        // 添加时间戳
        const recordWithTimestamp = {
          ...record,
          created_at: BeijingTimeHelper.apiTimestamp(),
          updated_at: BeijingTimeHelper.apiTimestamp()
        }

        const columns = Object.keys(recordWithTimestamp)
        const values = columns.map(() => '?').join(', ')
        const columnNames = columns.join(', ')

        const sql = `INSERT INTO ${tableName} (${columnNames}) VALUES (${values})`
        const result = await this.query(sql, {
          type: QueryTypes.INSERT,
          replacements: Object.values(recordWithTimestamp),
          transaction
        })

        results.push(result)
      }

      console.log(`[批量插入] ${tableName}: ${records.length} 条记录`)
      return results
    })
  }

  /**
   * 数据库健康检查
   * @returns {Promise<Object>} 健康检查结果
   */
  async healthCheck () {
    const result = {
      connected: false,
      responseTime: 0,
      version: null,
      database: process.env.DB_NAME,
      tables: 0,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    try {
      const startTime = Date.now()

      // 测试连接
      await this.ensureConnection()
      await this.query('SELECT 1')

      result.connected = true
      result.responseTime = Date.now() - startTime

      // 获取MySQL版本
      const [versionResult] = await this.query('SELECT VERSION() as version')
      result.version = versionResult?.version

      // 获取表数量
      const tables = await this.query('SHOW TABLES')
      result.tables = tables.length

      console.log(`[数据库健康] 连接正常 - ${result.responseTime}ms, ${result.tables}个表`)
    } catch (error) {
      result.error = error.message
      console.error('[数据库健康检查失败]:', error.message)
    }

    return result
  }

  /**
   * 获取数据库统计信息
   * @returns {Promise<Object>} 统计信息
   */
  async getStats () {
    try {
      const stats = {
        database: process.env.DB_NAME,
        tables: [],
        totalRecords: 0,
        timestamp: BeijingTimeHelper.apiTimestamp()
      }

      // 获取所有表
      const tables = await this.query('SHOW TABLES')
      const tableNames = tables.map(table => Object.values(table)[0])

      // 获取每个表的记录数
      for (const tableName of tableNames) {
        try {
          const [countResult] = await this.query(`SELECT COUNT(*) as count FROM ${tableName}`)
          const recordCount = countResult.count

          stats.tables.push({
            name: tableName,
            records: recordCount
          })

          stats.totalRecords += recordCount
        } catch (error) {
          console.warn(`[统计警告] 无法获取表 ${tableName} 的记录数:`, error.message)
        }
      }

      console.log(`[数据库统计] ${stats.tables.length}个表，总记录数：${stats.totalRecords}`)
      return stats
    } catch (error) {
      console.error('[数据库统计失败]:', error.message)
      throw error
    }
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
      const tablesToBackup =
        tableNames.length > 0
          ? tableNames
          : await this.query('SHOW TABLES').then(tables =>
            tables.map(table => Object.values(table)[0])
          )

      for (const tableName of tablesToBackup) {
        try {
          const records = await this.query(`SELECT * FROM ${tableName}`)
          backupData.tables[tableName] = records
          backupData.totalRecords += records.length
          console.log(`[备份] ${tableName}: ${records.length} 条记录`)
        } catch (error) {
          console.warn(`[备份警告] 无法备份表 ${tableName}:`, error.message)
          backupData.tables[tableName] = { error: error.message }
        }
      }

      console.log(
        `[备份完成] ${Object.keys(backupData.tables).length}个表，总计${backupData.totalRecords}条记录`
      )
      return backupData
    } catch (error) {
      console.error('[数据备份失败]:', error.message)
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
      tables = ['lottery_records', 'user_points_accounts', 'user_tasks'],
      condition = 'created_at < DATE_SUB(NOW(), INTERVAL 1 DAY) AND (phone LIKE \'136%\' OR nickname LIKE \'测试%\')',
      dryRun = false
    } = options

    const result = {
      tables: {},
      totalCleaned: 0,
      dryRun,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    for (const tableName of tables) {
      try {
        // 先查询要删除的记录数
        const [countResult] = await this.query(`
          SELECT COUNT(*) as count FROM ${tableName} WHERE ${condition}
        `)
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
          await this.query(`DELETE FROM ${tableName} WHERE ${condition}`)
          result.tables[tableName] = {
            cleaned: recordCount,
            message: '清理完成'
          }
          result.totalCleaned += recordCount
        }

        console.log(`[清理${dryRun ? '模拟' : ''}] ${tableName}: ${recordCount} 条记录`)
      } catch (error) {
        console.error(`[清理失败] ${tableName}:`, error.message)
        result.tables[tableName] = { error: error.message }
      }
    }

    return result
  }

  /**
   * 系统性数据清理和问题解决
   * 扩展现有清理功能，支持模拟数据清理、V3兼容代码检查等
   * @param {Object} options 清理选项
   * @returns {Promise<Object>} 系统清理结果
   */
  async systemCleanup (options = {}) {
    const {
      cleanupMockData = true,
      validateDatabase = true,
      checkStrategies = true,
      generateReport = true
    } = options

    console.log('🚀 V4系统性数据清理启动')
    console.log('='.repeat(60))

    const results = {
      timestamp: BeijingTimeHelper.apiTimestamp(),
      database: process.env.DB_NAME,
      issues: [],
      summary: {}
    }

    try {
      // 1. 数据库配置统一检查
      if (validateDatabase) {
        console.log('\n📋 1. 数据库配置统一检查...')
        const dbValidation = await this.validateDatabaseConfig()
        results.issues.push(dbValidation)
      }

      // 2. 清理测试数据（基于现有功能）
      if (cleanupMockData) {
        console.log('\n📋 2. 清理测试和模拟数据...')
        const testDataResult = await this.cleanupTestData({
          tables: ['lottery_records', 'user_points_accounts', 'user_tasks', 'chat_messages'],
          condition: 'created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) AND (phone LIKE \'123%\' OR phone = \'13612227930\' OR nickname LIKE \'测试%\')',
          dryRun: false
        })
        results.issues.push({
          type: 'testDataCleanup',
          success: true,
          ...testDataResult
        })
      }

      // 3. 验证三种抽奖策略实现
      if (checkStrategies) {
        console.log('\n📋 3. 验证抽奖策略实现...')
        const strategyValidation = await this.validateLotteryStrategies()
        results.issues.push(strategyValidation)
      }

      // 4. 数据库索引和性能检查
      console.log('\n📋 4. 数据库性能检查...')
      const performanceCheck = await this.checkDatabasePerformance()
      results.issues.push(performanceCheck)

      // 生成总结
      results.summary = this.generateCleanupSummary(results.issues)

      if (generateReport) {
        await this.generateSystemCleanupReport(results)
      }

      console.log('\n✅ 系统清理完成')
      return results
    } catch (error) {
      console.error('💥 系统清理失败:', error.message)
      throw error
    }
  }

  /**
   * 验证数据库配置统一性
   * @returns {Promise<Object>} 验证结果
   */
  async validateDatabaseConfig () {
    const expectedDb = process.env.DB_NAME

    try {
      // 检查当前连接的数据库
      const [currentDbResult] = await this.query('SELECT DATABASE() as current_db')
      const currentDb = currentDbResult.current_db

      const isCorrect = currentDb === expectedDb

      console.log(`${isCorrect ? '✅' : '❌'} 数据库连接: ${currentDb} ${isCorrect ? '(正确)' : `(期望: ${expectedDb})`}`)

      return {
        type: 'databaseConfigValidation',
        success: isCorrect,
        currentDatabase: currentDb,
        expectedDatabase: expectedDb,
        configCorrect: isCorrect
      }
    } catch (error) {
      console.error('❌ 数据库配置检查失败:', error.message)
      return {
        type: 'databaseConfigValidation',
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 验证三种抽奖策略实现
   * @returns {Promise<Object>} 验证结果
   */
  async validateLotteryStrategies () {
    const requiredStrategies = [
      'BasicLotteryStrategy',
      'GuaranteeStrategy',
      'ManagementStrategy'
    ]

    const fs = require('fs')
    const path = require('path')
    const strategyPath = path.join(__dirname, '../services/UnifiedLotteryEngine/strategies')
    const strategyResults = []

    for (const strategy of requiredStrategies) {
      const filePath = path.join(strategyPath, `${strategy}.js`)

      if (fs.existsSync(filePath)) {
        try {
          const content = fs.readFileSync(filePath, 'utf8')
          const analysis = {
            hasClass: content.includes(`class ${strategy}`),
            hasExecute: content.includes('execute') || content.includes('run'),
            hasValidation: content.includes('validate') || content.includes('check'),
            lineCount: content.split('\n').length
          }

          strategyResults.push({
            strategy,
            exists: true,
            implementation: analysis
          })

          console.log(`✅ ${strategy}: 已实现 (${analysis.lineCount}行)`)
        } catch (error) {
          strategyResults.push({
            strategy,
            exists: true,
            error: error.message
          })
          console.log(`⚠️ ${strategy}: 分析失败`)
        }
      } else {
        strategyResults.push({
          strategy,
          exists: false
        })
        console.log(`❌ ${strategy}: 文件不存在`)
      }
    }

    const existingStrategies = strategyResults.filter(s => s.exists).length

    return {
      type: 'strategyValidation',
      success: existingStrategies === requiredStrategies.length,
      requiredCount: requiredStrategies.length,
      existingCount: existingStrategies,
      details: strategyResults
    }
  }

  /**
   * 检查数据库性能
   * @returns {Promise<Object>} 性能检查结果
   */
  async checkDatabasePerformance () {
    try {
      // 检查慢查询
      const [slowQueries] = await this.query(`
        SELECT COUNT(*) as slow_query_count 
        FROM information_schema.PROCESSLIST 
        WHERE TIME > 2
      `)

      // 检查连接数
      const [connections] = await this.query('SHOW STATUS LIKE "Threads_connected"')
      const currentConnections = parseInt(connections.Value)

      // 检查表大小
      const tableSizes = await this.query(`
        SELECT 
          TABLE_NAME,
          ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) AS size_mb
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = ?
        ORDER BY size_mb DESC
        LIMIT 5
      `, [process.env.DB_NAME])

      console.log(`📊 数据库性能: 连接数=${currentConnections}, 慢查询=${slowQueries.slow_query_count}`)

      return {
        type: 'performanceCheck',
        success: true,
        slowQueries: slowQueries.slow_query_count,
        connections: currentConnections,
        largestTables: tableSizes
      }
    } catch (error) {
      console.error('❌ 性能检查失败:', error.message)
      return {
        type: 'performanceCheck',
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 生成清理总结
   * @param {Array} issues 清理问题列表
   * @returns {Object} 总结信息
   */
  generateCleanupSummary (issues) {
    return {
      total: issues.length,
      successful: issues.filter(i => i.success).length,
      failed: issues.filter(i => !i.success).length,
      database: process.env.DB_NAME,
      cleanupTime: BeijingTimeHelper.apiTimestamp()
    }
  }

  /**
   * 生成系统清理报告
   * @param {Object} results 清理结果
   */
  async generateSystemCleanupReport (results) {
    const fs = require('fs').promises
    const path = require('path')

    const reportDir = path.join(__dirname, '../reports')
    const reportPath = path.join(reportDir, `system-cleanup-${new Date().toISOString().slice(0, 10)}.json`)

    try {
      // 确保报告目录存在
      await fs.mkdir(reportDir, { recursive: true })

      // 写入报告
      await fs.writeFile(reportPath, JSON.stringify(results, null, 2), 'utf8')
      console.log(`📄 系统清理报告已生成: ${reportPath}`)
    } catch (error) {
      console.error('❌ 报告生成失败:', error.message)
    }
  }

  /**
   * 获取连接状态
   * @returns {Object} 连接状态信息
   */
  getConnectionStatus () {
    return {
      isConnected: this.isConnected,
      database: process.env.DB_NAME,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
      dialect: 'mysql',
      timezone: '+08:00'
    }
  }

  /**
   * 获取表的索引信息
   * @param {string} tableName 表名
   * @returns {Promise<Array>} 索引信息数组
   */
  async getTableIndexes (tableName) {
    try {
      const indexes = await this.query(`SHOW INDEX FROM ${tableName}`)
      return indexes
    } catch (error) {
      console.error(`[获取表索引失败] ${tableName}:`, error.message)
      return []
    }
  }

  /**
   * 执行完整的数据库结构检查
   * @param {Object} options 检查选项
   * @returns {Promise<Object>} 完整的检查结果
   */
  async performCompleteCheck (options = {}) {
    const { verbose = true } = options

    if (verbose) {
      console.log('🔍 开始数据库完整性检查...\n')
    }

    try {
      const checkResult = {
        database: {
          host: process.env.DB_HOST,
          name: process.env.DB_NAME,
          user: process.env.DB_USER
        },
        connection: null,
        tables: [],
        summary: {
          totalTables: 0,
          totalRecords: 0,
          totalIndexes: 0
        },
        timestamp: BeijingTimeHelper.apiTimestamp()
      }

      // 1. 检查数据库连接
      try {
        await this.ensureConnection()
        checkResult.connection = { status: 'connected', message: '数据库连接成功' }
        if (verbose) console.log('✅ 数据库连接成功\n')
      } catch (error) {
        checkResult.connection = { status: 'failed', message: error.message }
        if (verbose) console.error('❌ 数据库连接失败:', error.message)
        return checkResult
      }

      // 2. 获取所有表
      const tables = await this.query('SHOW TABLES')
      const tableNames = tables.map(table => Object.values(table)[0])

      if (verbose) {
        console.log(`📋 发现 ${tableNames.length} 个表:`)
        tableNames.forEach(table => console.log(`   - ${table}`))
        console.log('')
      }

      // 3. 检查每个表的详细信息
      for (const tableName of tableNames) {
        if (verbose) {
          console.log(`\n🔧 检查表: ${tableName}`)
          console.log('='.repeat(50))
        }

        const tableInfo = {
          name: tableName,
          structure: [],
          recordCount: 0,
          indexes: []
        }

        try {
          // 获取表结构
          const structure = await this.getTableStructure(tableName)
          tableInfo.structure = structure

          if (verbose && structure.length > 0) {
            console.log('📋 字段结构:')
            structure.forEach(field => {
              const nullable = field.Null === 'YES' ? '允许NULL' : '不允许NULL'
              const key = field.Key ? ` [${field.Key}]` : ''
              const defaultVal = field.Default !== null ? ` 默认值: ${field.Default}` : ''
              console.log(`   ${field.Field}: ${field.Type} - ${nullable}${key}${defaultVal}`)
            })
          }

          // 获取记录数量
          const [countResult] = await this.query(`SELECT COUNT(*) as count FROM ${tableName}`)
          tableInfo.recordCount = countResult.count
          checkResult.summary.totalRecords += countResult.count

          if (verbose) {
            console.log(`📊 记录数量: ${tableInfo.recordCount}`)
          }

          // 获取索引信息
          const indexes = await this.getTableIndexes(tableName)
          tableInfo.indexes = indexes

          if (verbose && indexes.length > 0) {
            console.log('🔍 索引信息:')
            const indexGroups = {}
            indexes.forEach(idx => {
              if (!indexGroups[idx.Key_name]) {
                indexGroups[idx.Key_name] = []
              }
              indexGroups[idx.Key_name].push(idx.Column_name)
            })

            Object.entries(indexGroups).forEach(([keyName, columns]) => {
              const indexType = keyName === 'PRIMARY' ? 'PRIMARY KEY' : 'INDEX'
              console.log(`   ${keyName}: ${indexType} (${columns.join(', ')})`)
              checkResult.summary.totalIndexes++
            })
          }
        } catch (error) {
          tableInfo.error = error.message
          if (verbose) {
            console.error(`❌ 检查表 ${tableName} 失败:`, error.message)
          }
        }

        checkResult.tables.push(tableInfo)
      }

      checkResult.summary.totalTables = tableNames.length

      if (verbose) {
        console.log('\n' + '='.repeat(50))
        console.log('📊 检查总结:')
        console.log(`   总表数: ${checkResult.summary.totalTables}`)
        console.log(`   总记录数: ${checkResult.summary.totalRecords}`)
        console.log(`   总索引数: ${checkResult.summary.totalIndexes}`)
        console.log('\n✅ 数据库完整性检查完成')
      }

      return checkResult
    } catch (error) {
      if (verbose) {
        console.error('❌ 数据库检查失败:', error.message)
      }
      throw error
    }
  }

  /**
   * 🔥 新增：检查数据库外键约束
   * 验证模型定义的外键是否在数据库中实际存在
   * @returns {Promise<object>} 外键检查结果
   */
  async checkForeignKeyConstraints () {
    try {
      console.log('🔍 检查数据库外键约束...')

      // 获取当前数据库中的外键约束
      const [constraintsResult] = await this.sequelize.query(`
        SELECT 
          CONSTRAINT_NAME,
          TABLE_NAME,
          COLUMN_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND REFERENCED_TABLE_NAME IS NOT NULL
        ORDER BY TABLE_NAME, COLUMN_NAME
      `)

      // 定义预期的外键关系（基于模型定义）
      const expectedForeignKeys = [
        {
          table: 'lottery_records',
          column: 'user_id',
          referencedTable: 'users',
          referencedColumn: 'user_id'
        },
        {
          table: 'lottery_records',
          column: 'prize_id',
          referencedTable: 'lottery_prizes',
          referencedColumn: 'prize_id'
        },
        {
          table: 'user_specific_prize_queue',
          column: 'user_id',
          referencedTable: 'users',
          referencedColumn: 'user_id'
        },
        {
          table: 'user_specific_prize_queue',
          column: 'campaign_id',
          referencedTable: 'lottery_campaigns',
          referencedColumn: 'campaign_id'
        },
        {
          table: 'user_specific_prize_queue',
          column: 'prize_id',
          referencedTable: 'lottery_prizes',
          referencedColumn: 'prize_id'
        },
        {
          table: 'user_inventory',
          column: 'user_id',
          referencedTable: 'users',
          referencedColumn: 'user_id'
        },
        {
          table: 'points_transactions',
          column: 'user_id',
          referencedTable: 'users',
          referencedColumn: 'user_id'
        },
        {
          table: 'user_points_accounts',
          column: 'user_id',
          referencedTable: 'users',
          referencedColumn: 'user_id'
        }
      ]

      const missingConstraints = []
      const existingConstraintsMap = new Map()

      // 建立现有约束的映射
      constraintsResult.forEach(constraint => {
        const key = `${constraint.TABLE_NAME}.${constraint.COLUMN_NAME}->${constraint.REFERENCED_TABLE_NAME}.${constraint.REFERENCED_COLUMN_NAME}`
        existingConstraintsMap.set(key, constraint)
      })

      // 检查每个预期的外键
      expectedForeignKeys.forEach(expected => {
        const key = `${expected.table}.${expected.column}->${expected.referencedTable}.${expected.referencedColumn}`
        if (!existingConstraintsMap.has(key)) {
          missingConstraints.push(expected)
        }
      })

      return {
        existing: constraintsResult.length,
        missing: missingConstraints,
        hasMissingConstraints: missingConstraints.length > 0
      }
    } catch (error) {
      console.error('❌ 外键约束检查失败:', error.message)
      return { error: error.message }
    }
  }

  /**
   * 🔥 新增：创建缺失的外键约束
   * @param {Array} missingConstraints - 缺失的外键列表
   * @returns {Promise<object>} 创建结果
   */
  async createMissingForeignKeys (missingConstraints) {
    const results = {
      created: [],
      failed: [],
      total: missingConstraints.length
    }

    for (const constraint of missingConstraints) {
      try {
        const constraintName = `fk_${constraint.table}_${constraint.column}`

        console.log(`🔧 创建外键约束: ${constraintName}`)

        await this.sequelize.query(`
          ALTER TABLE ${constraint.table}
          ADD CONSTRAINT ${constraintName}
          FOREIGN KEY (${constraint.column})
          REFERENCES ${constraint.referencedTable}(${constraint.referencedColumn})
          ON DELETE CASCADE
          ON UPDATE CASCADE
        `)

        results.created.push(constraintName)
        console.log(`✅ 外键约束创建成功: ${constraintName}`)
      } catch (error) {
        console.error(
          `❌ 外键约束创建失败: ${constraint.table}.${constraint.column} ->`,
          error.message
        )
        results.failed.push({
          constraint,
          error: error.message
        })
      }
    }

    return results
  }

  /**
   * 🔥 新增：检查数据库索引完整性
   * @returns {Promise<object>} 索引检查结果
   */
  async checkIndexIntegrity () {
    try {
      console.log('🔍 检查数据库索引完整性...')

      // 获取当前数据库中的索引
      const [indexesResult] = await this.sequelize.query(`
        SELECT 
          TABLE_NAME,
          INDEX_NAME,
          COLUMN_NAME,
          NON_UNIQUE
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND INDEX_NAME != 'PRIMARY'
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
      `)

      // 定义重要的索引要求
      const requiredIndexes = [
        { table: 'users', columns: ['mobile'], unique: true },
        { table: 'users', columns: ['status', 'is_admin'], unique: false },
        { table: 'users', columns: ['history_total_points'], unique: false },
        { table: 'lottery_records', columns: ['user_id', 'created_at'], unique: false },
        { table: 'lottery_records', columns: ['campaign_id', 'created_at'], unique: false },
        { table: 'lottery_records', columns: ['is_winner'], unique: false },
        {
          table: 'user_specific_prize_queue',
          columns: ['user_id', 'campaign_id', 'status'],
          unique: false
        },
        { table: 'user_specific_prize_queue', columns: ['user_id', 'queue_order'], unique: false },
        { table: 'user_inventory', columns: ['user_id', 'status'], unique: false },
        { table: 'user_inventory', columns: ['source_type', 'created_at'], unique: false },
        { table: 'points_transactions', columns: ['user_id', 'created_at'], unique: false },
        {
          table: 'points_transactions',
          columns: ['transaction_type', 'is_successful'],
          unique: false
        }
      ]

      // 按表分组现有索引
      const existingIndexesByTable = {}
      indexesResult.forEach(index => {
        if (!existingIndexesByTable[index.TABLE_NAME]) {
          existingIndexesByTable[index.TABLE_NAME] = {}
        }
        if (!existingIndexesByTable[index.TABLE_NAME][index.INDEX_NAME]) {
          existingIndexesByTable[index.TABLE_NAME][index.INDEX_NAME] = []
        }
        existingIndexesByTable[index.TABLE_NAME][index.INDEX_NAME].push({
          column: index.COLUMN_NAME,
          unique: index.NON_UNIQUE === 0
        })
      })

      const missingIndexes = []

      // 检查每个必需的索引
      requiredIndexes.forEach(required => {
        const tableIndexes = existingIndexesByTable[required.table] || {}
        let indexExists = false

        // 检查是否存在匹配的索引
        Object.keys(tableIndexes).forEach(indexName => {
          const indexColumns = tableIndexes[indexName]

          // 检查列匹配
          if (indexColumns.length === required.columns.length) {
            const columnsMatch = required.columns.every(
              (col, idx) => indexColumns[idx] && indexColumns[idx].column === col
            )

            if (columnsMatch) {
              indexExists = true
            }
          }
        })

        if (!indexExists) {
          missingIndexes.push(required)
        }
      })

      return {
        existingCount: Object.keys(existingIndexesByTable).length,
        missingIndexes,
        hasMissingIndexes: missingIndexes.length > 0
      }
    } catch (error) {
      console.error('❌ 索引完整性检查失败:', error.message)
      return { error: error.message }
    }
  }

  /**
   * 🔥 新增：创建缺失的索引
   * @param {Array} missingIndexes - 缺失的索引列表
   * @returns {Promise<object>} 创建结果
   */
  async createMissingIndexes (missingIndexes) {
    const results = {
      created: [],
      failed: [],
      total: missingIndexes.length
    }

    for (const index of missingIndexes) {
      try {
        const indexName = `idx_${index.table}_${index.columns.join('_')}`
        const uniqueClause = index.unique ? 'UNIQUE' : ''
        const columnsClause = index.columns.join(', ')

        console.log(`🔧 创建索引: ${indexName}`)

        await this.sequelize.query(`
          CREATE ${uniqueClause} INDEX ${indexName}
          ON ${index.table} (${columnsClause})
        `)

        results.created.push(indexName)
        console.log(`✅ 索引创建成功: ${indexName}`)
      } catch (error) {
        console.error(
          `❌ 索引创建失败: ${index.table}(${index.columns.join(', ')}) ->`,
          error.message
        )
        results.failed.push({
          index,
          error: error.message
        })
      }
    }

    return results
  }

  /**
   * 🔥 新增：检查重复表问题
   * 检查是否存在功能重复的表
   * @returns {Promise<object>} 重复表检查结果
   */
  async checkDuplicateTables () {
    try {
      console.log('🔍 检查重复表...')

      const [tables] = await this.sequelize.query(`
        SELECT TABLE_NAME, TABLE_COMMENT
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `)

      // 检查可能重复的表
      const potentialDuplicates = [
        {
          pattern: 'user_specific_prize_queue',
          alternatives: ['user_specific_prize_queues']
        },
        {
          pattern: 'points_record',
          alternatives: ['points_records']
        },
        {
          pattern: 'probability_log',
          alternatives: ['probability_logs', 'probabilitylog']
        }
      ]

      const duplicateIssues = []

      potentialDuplicates.forEach(duplicate => {
        const mainTable = tables.find(t => t.TABLE_NAME === duplicate.pattern)
        const alternativeTables = tables.filter(t => duplicate.alternatives.includes(t.TABLE_NAME))

        if (mainTable && alternativeTables.length > 0) {
          duplicateIssues.push({
            mainTable: mainTable.TABLE_NAME,
            duplicates: alternativeTables.map(t => t.TABLE_NAME),
            recommendation: `保留 ${mainTable.TABLE_NAME}，考虑删除重复表`
          })
        }
      })

      return {
        totalTables: tables.length,
        duplicateIssues,
        hasDuplicates: duplicateIssues.length > 0
      }
    } catch (error) {
      console.error('❌ 重复表检查失败:', error.message)
      return { error: error.message }
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
 * 获取原生Sequelize实例（向后兼容）
 * @returns {Sequelize} Sequelize实例
 */
function getSequelize () {
  return getDatabaseHelper().sequelize
}

/**
 * 快速健康检查
 * @returns {Promise<boolean>} 数据库是否健康
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

// 导出接口
module.exports = {
  UnifiedDatabaseHelper,
  getDatabaseHelper,
  getSequelize,
  isDatabaseHealthy
}
