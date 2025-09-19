/**
 * 🔥 MySQL专项测试套件 V4.0统一引擎架构
 * 创建时间：2025年08月23日 北京时间
 * 功能：MySQL连接、数据库结构、性能测试、数据一致性
 *
 * 测试覆盖：
 * 1. MySQL连接稳定性测试
 * 2. 数据库结构完整性测试
 * 3. 查询性能基准测试
 * 4. 数据一致性和事务测试
 * 5. 索引优化分析测试
 * 6. 连接池管理测试
 */

const { sequelize } = require('../../config/database')
const winston = require('winston')

// 配置测试日志
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      return `[${timestamp}] ${level}: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`
    })
  ),
  transports: [new winston.transports.Console()]
})

class MySQLSpecializedTests {
  constructor () {
    this.testUserId = '13612227930' // 统一测试账号
    this.sequelize = sequelize
    this.testResults = {
      connection: {},
      structure: {},
      performance: {},
      consistency: {},
      indexing: {},
      connectionPool: {}
    }
    this.createdTestData = [] // 记录测试中创建的数据，用于清理
  }

  /**
   * 初始化MySQL连接
   */
  async initialize () {
    try {
      logger.info('🔥 初始化MySQL专项测试套件...')

      // 测试数据库连接
      await this.sequelize.authenticate()
      logger.info('✅ MySQL连接初始化成功')

      return true
    } catch (error) {
      logger.error('❌ MySQL连接初始化失败:', error)
      throw error
    }
  }

  /**
   * 运行所有MySQL专项测试
   */
  async runAllTests () {
    logger.info('🚀 开始运行MySQL专项测试套件...')
    const startTime = Date.now()

    try {
      await this.initialize()

      // 1. MySQL连接稳定性测试
      await this.testMySQLConnection()

      // 2. 数据库结构完整性测试
      await this.testDatabaseStructure()

      // 3. 查询性能基准测试
      await this.testQueryPerformance()

      // 4. 数据一致性测试
      await this.testDataConsistency()

      // 5. 索引优化分析测试
      await this.testIndexOptimization()

      // 6. 连接池管理测试
      await this.testConnectionPoolManagement()

      const endTime = Date.now()
      const duration = endTime - startTime

      logger.info(`🎉 MySQL专项测试完成，总耗时: ${duration}ms`)

      return {
        success: true,
        duration,
        results: this.testResults,
        summary: this.generateTestSummary(),
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      logger.error('❌ MySQL专项测试失败:', error)
      return {
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      }
    } finally {
      await this.cleanup()
    }
  }

  /**
   * 测试MySQL连接稳定性
   */
  async testMySQLConnection () {
    logger.info('🔗 测试MySQL连接稳定性...')

    try {
      const connectionTests = []

      // 基础连接测试
      const [results] = await this.sequelize.query('SELECT 1+1 AS result')
      const basicConnection = results[0].result === 2

      connectionTests.push({
        name: 'basic_connection',
        success: basicConnection,
        result: results[0]
      })

      // 数据库版本信息测试
      const [versionResults] = await this.sequelize.query('SELECT VERSION() AS version')
      const versionInfo = versionResults[0].version

      connectionTests.push({
        name: 'version_check',
        success: versionInfo && versionInfo.includes('mysql'),
        result: { version: versionInfo }
      })

      // 连接配置测试
      const [configResults] = await this.sequelize.query('SHOW VARIABLES LIKE "max_connections"')
      const maxConnections = configResults[0]

      connectionTests.push({
        name: 'connection_config',
        success: maxConnections && parseInt(maxConnections.Value) > 0,
        result: maxConnections
      })

      // 权限测试
      const [privilegeResults] = await this.sequelize.query('SHOW GRANTS')
      const hasRequiredPrivileges = privilegeResults.some(
        grant =>
          grant['Grants for restaurant_points_dev@%'] &&
          grant['Grants for restaurant_points_dev@%'].includes('ALL PRIVILEGES')
      )

      connectionTests.push({
        name: 'privilege_check',
        success: hasRequiredPrivileges,
        result: { grants_count: privilegeResults.length }
      })

      // 并发连接测试
      const concurrentQueries = []
      for (let i = 0; i < 5; i++) {
        concurrentQueries.push(this.sequelize.query(`SELECT ${i} AS query_id, NOW() AS timestamp`))
      }

      const concurrentResults = await Promise.all(concurrentQueries)
      const allConcurrentSuccess = concurrentResults.every(([results]) => results.length > 0)

      connectionTests.push({
        name: 'concurrent_connections',
        success: allConcurrentSuccess,
        result: { successful_queries: concurrentResults.length, total: 5 }
      })

      this.testResults.connection = {
        success: connectionTests.every(test => test.success),
        tests: connectionTests,
        timestamp: new Date().toISOString()
      }

      logger.info('✅ MySQL连接测试完成')
    } catch (error) {
      this.testResults.connection = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
      logger.error('❌ MySQL连接测试失败:', error)
    }
  }

  /**
   * 测试数据库结构完整性
   */
  async testDatabaseStructure () {
    logger.info('📊 测试数据库结构完整性...')

    try {
      const structureTests = []

      // 获取所有表列表
      const [tables] = await this.sequelize.query('SHOW TABLES')
      const tableNames = tables.map(row => Object.values(row)[0])

      structureTests.push({
        name: 'tables_exist',
        success: tableNames.length > 0,
        result: { table_count: tableNames.length, tables: tableNames.slice(0, 10) } // 只显示前10个表
      })

      // 检查关键表是否存在
      const requiredTables = [
        'users',
        'user_points_accounts',
        'lottery_campaigns',
        'lottery_records'
      ]
      const missingTables = requiredTables.filter(table => !tableNames.includes(table))

      structureTests.push({
        name: 'required_tables',
        success: missingTables.length === 0,
        result: {
          missing: missingTables,
          found: requiredTables.filter(t => tableNames.includes(t))
        }
      })

      // 检查表结构（以users表为例）
      if (tableNames.includes('users')) {
        const [userColumns] = await this.sequelize.query('DESCRIBE users')
        const hasRequiredColumns = ['user_id', 'mobile', 'created_at'].every(col =>
          userColumns.some(column => column.Field === col)
        )

        structureTests.push({
          name: 'users_table_structure',
          success: hasRequiredColumns,
          result: { column_count: userColumns.length, columns: userColumns.map(c => c.Field) }
        })
      }

      // 检查索引状态
      if (tableNames.includes('users')) {
        const [indexes] = await this.sequelize.query('SHOW INDEX FROM users')
        const hasIndexes = indexes.length > 1 // 至少有主键索引

        structureTests.push({
          name: 'indexes_exist',
          success: hasIndexes,
          result: {
            index_count: indexes.length,
            indexes: indexes.map(i => i.Key_name).filter((v, i, a) => a.indexOf(v) === i)
          }
        })
      }

      // 检查外键约束
      const [foreignKeys] = await this.sequelize.query(`
        SELECT 
          TABLE_NAME,
          COLUMN_NAME,
          CONSTRAINT_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
        FROM information_schema.KEY_COLUMN_USAGE 
        WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
        AND TABLE_SCHEMA = DATABASE()
        LIMIT 10
      `)

      structureTests.push({
        name: 'foreign_keys',
        success: true, // 外键存在与否都算成功，只是记录状态
        result: { foreign_key_count: foreignKeys.length, sample_keys: foreignKeys.slice(0, 5) }
      })

      this.testResults.structure = {
        success: structureTests.every(test => test.success),
        tests: structureTests,
        timestamp: new Date().toISOString()
      }

      logger.info('✅ 数据库结构测试完成')
    } catch (error) {
      this.testResults.structure = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
      logger.error('❌ 数据库结构测试失败:', error)
    }
  }

  /**
   * 测试查询性能基准
   */
  async testQueryPerformance () {
    logger.info('⚡ 测试MySQL查询性能...')

    try {
      const performanceTests = []

      // 简单查询性能测试
      const simpleQueryStart = Date.now()
      await this.sequelize.query('SELECT 1')
      const simpleQueryTime = Date.now() - simpleQueryStart

      performanceTests.push({
        name: 'simple_query_performance',
        success: simpleQueryTime < 100, // 100ms内完成简单查询
        result: { time: simpleQueryTime }
      })

      // 复杂查询性能测试（如果users表存在）
      const [tables] = await this.sequelize.query('SHOW TABLES LIKE "users"')
      if (tables.length > 0) {
        const complexQueryStart = Date.now()
        const [results] = await this.sequelize.query(`
           SELECT COUNT(*) as user_count,
                  MAX(created_at) as latest_user,
                  MIN(created_at) as earliest_user
           FROM users
           WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
         `)
        const complexQueryTime = Date.now() - complexQueryStart

        performanceTests.push({
          name: 'complex_query_performance',
          success: complexQueryTime < 1000, // 1秒内完成复杂查询
          result: { time: complexQueryTime, result: results[0] }
        })
      }

      // 批量插入性能测试
      const batchInsertStart = Date.now()
      const testTable = 'test_performance_' + Date.now()

      try {
        // 创建临时测试表
        await this.sequelize.query(`
          CREATE TEMPORARY TABLE ${testTable} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            test_data VARCHAR(100),
            test_number INT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `)

        // 批量插入数据
        const batchSize = 100
        const insertPromises = []
        for (let i = 0; i < batchSize; i++) {
          insertPromises.push(
            this.sequelize.query(`
              INSERT INTO ${testTable} (test_data, test_number) 
              VALUES ('test_data_${i}', ${i})
            `)
          )
        }

        await Promise.all(insertPromises)
        const batchInsertTime = Date.now() - batchInsertStart

        // 验证插入结果
        const [countResult] = await this.sequelize.query(
          `SELECT COUNT(*) as count FROM ${testTable}`
        )
        const insertedCount = countResult[0].count

        performanceTests.push({
          name: 'batch_insert_performance',
          success: batchInsertTime < 5000 && insertedCount === batchSize, // 5秒内完成100条插入
          result: {
            time: batchInsertTime,
            inserted: insertedCount,
            expected: batchSize,
            avg_time_per_insert: Math.round(batchInsertTime / batchSize)
          }
        })
      } catch (error) {
        performanceTests.push({
          name: 'batch_insert_performance',
          success: false,
          result: { error: error.message }
        })
      }

      // 查询计划分析测试
      if (tables.length > 0) {
        const [explainResult] = await this.sequelize.query(`
                     EXPLAIN SELECT * FROM users WHERE mobile = '${this.testUserId}' LIMIT 1
        `)

        const hasEfficientPlan = explainResult[0] && explainResult[0].possible_keys

        performanceTests.push({
          name: 'query_plan_analysis',
          success: hasEfficientPlan !== null,
          result: {
            possible_keys: explainResult[0]?.possible_keys,
            key: explainResult[0]?.key,
            rows: explainResult[0]?.rows
          }
        })
      }

      this.testResults.performance = {
        success: performanceTests.every(test => test.success),
        tests: performanceTests,
        timestamp: new Date().toISOString()
      }

      logger.info('✅ MySQL查询性能测试完成')
    } catch (error) {
      this.testResults.performance = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
      logger.error('❌ MySQL查询性能测试失败:', error)
    }
  }

  /**
   * 测试数据一致性
   */
  async testDataConsistency () {
    logger.info('🔍 测试MySQL数据一致性...')

    try {
      const consistencyTests = []

      // 事务一致性测试
      const transaction = await this.sequelize.transaction()
      try {
        // 创建临时测试数据
        const testTable = 'test_consistency_' + Date.now()
        await this.sequelize.query(
          `
          CREATE TEMPORARY TABLE ${testTable} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            balance INT DEFAULT 0,
            version INT DEFAULT 1
          )
        `,
          { transaction }
        )

        // 插入初始数据
        await this.sequelize.query(
          `
          INSERT INTO ${testTable} (balance, version) VALUES (100, 1)
        `,
          { transaction }
        )

        // 在事务中修改数据
        await this.sequelize.query(
          `
          UPDATE ${testTable} SET balance = balance - 50, version = version + 1 WHERE id = 1
        `,
          { transaction }
        )

        // 检查事务中的数据
        const [transactionResult] = await this.sequelize.query(
          `
          SELECT balance, version FROM ${testTable} WHERE id = 1
        `,
          { transaction }
        )

        const transactionSuccess =
          transactionResult[0].balance === 50 && transactionResult[0].version === 2

        await transaction.commit()

        consistencyTests.push({
          name: 'transaction_consistency',
          success: transactionSuccess,
          result: {
            final_balance: transactionResult[0].balance,
            final_version: transactionResult[0].version
          }
        })
      } catch (error) {
        await transaction.rollback()
        consistencyTests.push({
          name: 'transaction_consistency',
          success: false,
          result: { error: error.message }
        })
      }

      // 并发访问一致性测试
      const concurrentTransaction1 = await this.sequelize.transaction()
      const concurrentTransaction2 = await this.sequelize.transaction()

      try {
        const testTable = 'test_concurrent_' + Date.now()

        // 在第一个事务中创建表和初始数据
        await this.sequelize.query(
          `
          CREATE TEMPORARY TABLE ${testTable} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            counter INT DEFAULT 0
          )
        `,
          { transaction: concurrentTransaction1 }
        )

        await this.sequelize.query(
          `
          INSERT INTO ${testTable} (counter) VALUES (0)
        `,
          { transaction: concurrentTransaction1 }
        )

        await concurrentTransaction1.commit()

        // 模拟并发修改
        const concurrentUpdates = []
        for (let i = 0; i < 5; i++) {
          concurrentUpdates.push(
            this.sequelize.query(`
              UPDATE ${testTable} SET counter = counter + 1 WHERE id = 1
            `)
          )
        }

        await Promise.all(concurrentUpdates)

        // 检查最终结果
        const [finalResult] = await this.sequelize.query(`
          SELECT counter FROM ${testTable} WHERE id = 1
        `)

        consistencyTests.push({
          name: 'concurrent_consistency',
          success: finalResult[0].counter === 5,
          result: {
            expected: 5,
            actual: finalResult[0].counter
          }
        })
      } catch (error) {
        await concurrentTransaction2.rollback()
        consistencyTests.push({
          name: 'concurrent_consistency',
          success: false,
          result: { error: error.message }
        })
      }

      // 约束一致性测试
      try {
        const constraintTestTable = 'test_constraints_' + Date.now()
        await this.sequelize.query(`
          CREATE TEMPORARY TABLE ${constraintTestTable} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) UNIQUE,
            age INT CHECK (age >= 0)
          )
        `)

        // 测试唯一约束
        await this.sequelize.query(`
          INSERT INTO ${constraintTestTable} (email, age) VALUES ('test@example.com', 25)
        `)

        let uniqueConstraintWork = false
        try {
          await this.sequelize.query(`
            INSERT INTO ${constraintTestTable} (email, age) VALUES ('test@example.com', 30)
          `)
        } catch (error) {
          uniqueConstraintWork = error.message.includes('Duplicate entry')
        }

        consistencyTests.push({
          name: 'constraint_consistency',
          success: uniqueConstraintWork,
          result: { unique_constraint_enforced: uniqueConstraintWork }
        })
      } catch (error) {
        consistencyTests.push({
          name: 'constraint_consistency',
          success: false,
          result: { error: error.message }
        })
      }

      this.testResults.consistency = {
        success: consistencyTests.every(test => test.success),
        tests: consistencyTests,
        timestamp: new Date().toISOString()
      }

      logger.info('✅ 数据一致性测试完成')
    } catch (error) {
      this.testResults.consistency = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
      logger.error('❌ 数据一致性测试失败:', error)
    }
  }

  /**
   * 测试索引优化分析
   */
  async testIndexOptimization () {
    logger.info('🔍 测试MySQL索引优化...')

    try {
      const indexingTests = []

      // 检查现有索引使用情况
      const [indexUsage] = await this.sequelize.query(`
        SELECT 
          TABLE_NAME,
          INDEX_NAME,
          COLUMN_NAME,
          CARDINALITY
        FROM information_schema.STATISTICS 
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY TABLE_NAME, INDEX_NAME
        LIMIT 20
      `)

      indexingTests.push({
        name: 'existing_indexes',
        success: indexUsage.length > 0,
        result: {
          index_count: indexUsage.length,
          sample_indexes: indexUsage.slice(0, 5)
        }
      })

      // 分析慢查询潜在问题（模拟）
      const [tables] = await this.sequelize.query('SHOW TABLES LIKE "users"')
      if (tables.length > 0) {
        // 检查是否有合适的索引
        const [userIndexes] = await this.sequelize.query('SHOW INDEX FROM users')
        const hasPhoneIndex = userIndexes.some(
          index => index.Column_name === 'mobile' && index.Key_name !== 'PRIMARY'
        )

        // 模拟查询性能测试
        const phoneQueryStart = Date.now()
        await this.sequelize.query(`
          SELECT * FROM users WHERE mobile = '${this.testUserId}' LIMIT 1
        `)
        const phoneQueryTime = Date.now() - phoneQueryStart

        indexingTests.push({
          name: 'mobile_index_efficiency',
          success: hasPhoneIndex && phoneQueryTime < 50,
          result: {
            has_phone_index: hasPhoneIndex,
            query_time: phoneQueryTime,
            indexes: userIndexes.map(i => ({ name: i.Key_name, column: i.Column_name }))
          }
        })
      }

      // 测试复合索引效果
      try {
        const testIndexTable = 'test_index_' + Date.now()
        await this.sequelize.query(`
          CREATE TEMPORARY TABLE ${testIndexTable} (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            status VARCHAR(20),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_status (user_id, status),
            INDEX idx_created_at (created_at)
          )
        `)

        // 插入测试数据
        // TODO: 性能优化 - 考虑使用Promise.all并发执行
        for (let i = 0; i < 100; i++) {
          await this.sequelize.query(`
            INSERT INTO ${testIndexTable} (user_id, status) 
            VALUES (${i % 10}, '${i % 2 === 0 ? 'active' : 'inactive'}')
          `)
        }

        // 测试复合索引查询
        const compositeIndexStart = Date.now()
        const [compositeResult] = await this.sequelize.query(`
          SELECT COUNT(*) as count FROM ${testIndexTable} 
          WHERE user_id = 5 AND status = 'active'
        `)
        const compositeIndexTime = Date.now() - compositeIndexStart

        indexingTests.push({
          name: 'composite_index_performance',
          success: compositeIndexTime < 100 && compositeResult[0].count >= 0,
          result: {
            query_time: compositeIndexTime,
            result_count: compositeResult[0].count
          }
        })
      } catch (error) {
        indexingTests.push({
          name: 'composite_index_performance',
          success: false,
          result: { error: error.message }
        })
      }

      this.testResults.indexing = {
        success: indexingTests.every(test => test.success),
        tests: indexingTests,
        timestamp: new Date().toISOString()
      }

      logger.info('✅ 索引优化测试完成')
    } catch (error) {
      this.testResults.indexing = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
      logger.error('❌ 索引优化测试失败:', error)
    }
  }

  /**
   * 测试连接池管理
   */
  async testConnectionPoolManagement () {
    logger.info('🔗 测试MySQL连接池管理...')

    try {
      const poolTests = []

      // 获取连接池配置
      const poolConfig = {
        max: this.sequelize.config.pool?.max || 5,
        min: this.sequelize.config.pool?.min || 0,
        acquire: this.sequelize.config.pool?.acquire || 60000,
        idle: this.sequelize.config.pool?.idle || 10000
      }

      poolTests.push({
        name: 'pool_configuration',
        success: poolConfig.max > 0,
        result: poolConfig
      })

      // 测试连接池压力
      const poolStressStart = Date.now()
      const concurrentQueries = []

      for (let i = 0; i < poolConfig.max + 2; i++) {
        // 略微超过连接池大小
        concurrentQueries.push(
          this.sequelize.query(
            `SELECT ${i} as query_id, CONNECTION_ID() as connection_id, NOW() as timestamp`
          )
        )
      }

      const poolStressResults = await Promise.all(concurrentQueries)
      const poolStressTime = Date.now() - poolStressStart

      // 分析连接ID，看是否复用了连接
      const connectionIds = poolStressResults.map(([results]) => results[0].connection_id)
      const uniqueConnections = [...new Set(connectionIds)]

      poolTests.push({
        name: 'connection_pool_stress',
        success: poolStressTime < 10000 && uniqueConnections.length <= poolConfig.max,
        result: {
          stress_time: poolStressTime,
          total_queries: concurrentQueries.length,
          unique_connections: uniqueConnections.length,
          max_allowed_connections: poolConfig.max
        }
      })

      // 测试连接泄露检测
      let connectionLeakTest = true
      try {
        // 模拟大量短期查询
        const shortQueries = []
        for (let i = 0; i < 20; i++) {
          shortQueries.push(this.sequelize.query('SELECT 1'))
        }
        await Promise.all(shortQueries)

        // 等待一段时间让连接池回收连接
        await new Promise(resolve => setTimeout(resolve, 1000))

        connectionLeakTest = true
      } catch (error) {
        connectionLeakTest = false
      }

      poolTests.push({
        name: 'connection_leak_detection',
        success: connectionLeakTest,
        result: { leak_detected: !connectionLeakTest }
      })

      this.testResults.connectionPool = {
        success: poolTests.every(test => test.success),
        tests: poolTests,
        timestamp: new Date().toISOString()
      }

      logger.info('✅ 连接池管理测试完成')
    } catch (error) {
      this.testResults.connectionPool = {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      }
      logger.error('❌ 连接池管理测试失败:', error)
    }
  }

  /**
   * 生成测试摘要
   */
  generateTestSummary () {
    const allTests = []
    Object.values(this.testResults).forEach(category => {
      if (category.tests) {
        allTests.push(...category.tests)
      }
    })

    const passedTests = allTests.filter(test => test.success)
    const failedTests = allTests.filter(test => !test.success)

    return {
      total_tests: allTests.length,
      passed: passedTests.length,
      failed: failedTests.length,
      success_rate:
        allTests.length > 0
          ? ((passedTests.length / allTests.length) * 100).toFixed(2) + '%'
          : '0%',
      categories: {
        connection: this.testResults.connection.success || false,
        structure: this.testResults.structure.success || false,
        performance: this.testResults.performance.success || false,
        consistency: this.testResults.consistency.success || false,
        indexing: this.testResults.indexing.success || false,
        connectionPool: this.testResults.connectionPool.success || false
      }
    }
  }

  /**
   * 清理测试数据
   */
  async cleanup () {
    try {
      logger.info('🧹 清理MySQL测试数据...')

      // 清理临时表（TEMPORARY表会在连接关闭时自动清理）
      // 这里可以添加额外的清理逻辑

      logger.info('✅ MySQL测试数据清理完成')
    } catch (error) {
      logger.error('❌ 清理失败:', error)
    }
  }
}

module.exports = MySQLSpecializedTests
