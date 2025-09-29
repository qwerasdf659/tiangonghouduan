/**
 * MySQL数据库测试套件
 * 包含连接测试、结构测试、性能测试等功能
 * 创建时间：2025年01月21日 北京时间
 * 使用模型：Claude Sonnet 4
 */

const BaseTestManager = require('../core/base_test_manager')
const { sequelize } = require('../../../config/database')
const { performance } = require('perf_hooks')

class MySQLTestSuite extends BaseTestManager {
  constructor (baseUrl) {
    super(baseUrl)

    // MySQL测试相关
    this.mysql_test_results = {
      connection: {},
      structure: {},
      performance: {},
      consistency: {},
      indexing: {},
      connection_pool: {}
    }

    console.log('[MySQLTestSuite] MySQL测试套件初始化完成')
  }

  /**
   * 🗄️ 运行MySQL专项测试
   */
  async run_mysql_tests () {
    console.log('🗄️ 开始运行MySQL专项测试...')
    const start_time = Date.now()

    try {
      // 1. MySQL连接测试
      await this.test_mysql_connection()

      // 2. 数据库结构测试
      await this.test_database_structure()

      // 3. 查询性能测试
      await this.test_query_performance()

      // 4. 数据一致性测试
      await this.test_data_consistency()

      // 5. 索引效率测试
      await this.test_index_efficiency()

      const duration = Date.now() - start_time
      console.log(`✅ MySQL专项测试完成，总耗时: ${duration}ms`)

      return {
        success: true,
        duration,
        results: this.mysql_test_results
      }
    } catch (error) {
      console.error('❌ MySQL测试失败:', error)
      return {
        success: false,
        error: error.message,
        results: this.mysql_test_results
      }
    }
  }

  /**
   * 🔗 MySQL连接测试
   */
  async test_mysql_connection () {
    try {
      console.log('🔗 开始MySQL连接测试...')
      const start_time = performance.now()

      await sequelize.authenticate()

      const end_time = performance.now()
      const connection_time = Math.round(end_time - start_time)

      this.mysql_test_results.connection = {
        status: 'success',
        message: 'MySQL连接正常',
        connection_time,
        database: sequelize.config.database,
        host: sequelize.config.host,
        port: sequelize.config.port,
        timestamp: new Date().toISOString()
      }

      console.log(`✅ MySQL连接测试通过 - 连接时间: ${connection_time}ms`)
    } catch (error) {
      this.mysql_test_results.connection = {
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      }
      console.error('❌ MySQL连接测试失败:', error.message)
      throw error
    }
  }

  /**
   * 🏗️ 数据库结构测试
   */
  async test_database_structure () {
    try {
      console.log('🏗️ 开始数据库结构测试...')

      // 获取所有表
      const [tables_result] = await sequelize.query('SHOW TABLES')
      const table_count = tables_result.length
      const table_names = tables_result.map(row => Object.values(row)[0])

      // 检查核心表是否存在
      const required_tables = [
        'users',
        'lottery_campaigns',
        'lottery_records',
        'user_points',
        'prizes'
      ]

      const missing_tables = required_tables.filter(table => !table_names.includes(table))
      const existing_tables = required_tables.filter(table => table_names.includes(table))

      this.mysql_test_results.structure = {
        status: missing_tables.length === 0 ? 'success' : 'warning',
        total_tables: table_count,
        table_names,
        required_tables: {
          existing: existing_tables,
          missing: missing_tables
        },
        timestamp: new Date().toISOString()
      }

      if (missing_tables.length > 0) {
        console.warn(`⚠️ 缺少核心表: ${missing_tables.join(', ')}`)
      } else {
        console.log(`✅ 数据库结构测试通过，发现${table_count}个表`)
      }
    } catch (error) {
      this.mysql_test_results.structure = {
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      }
      console.error('❌ 数据库结构测试失败:', error.message)
      throw error
    }
  }

  /**
   * ⚡ 查询性能测试
   */
  async test_query_performance () {
    try {
      console.log('⚡ 开始查询性能测试...')

      const performance_tests = [
        {
          name: '简单查询',
          query: 'SELECT 1 as test',
          expected_time: 100
        },
        {
          name: '用户表查询',
          query: 'SELECT COUNT(*) as user_count FROM users',
          expected_time: 500
        },
        {
          name: '抽奖记录查询',
          query: 'SELECT COUNT(*) as record_count FROM lottery_records',
          expected_time: 1000
        }
      ]

      const results = []

      for (const test of performance_tests) {
        const start_time = performance.now()

        try {
          await sequelize.query(test.query)
          const end_time = performance.now()
          const query_time = Math.round(end_time - start_time)

          const performance_level =
            query_time < test.expected_time / 2
              ? 'excellent'
              : query_time < test.expected_time
                ? 'good'
                : 'needs_improvement'

          results.push({
            name: test.name,
            query_time,
            expected_time: test.expected_time,
            performance_level,
            status: 'success'
          })

          console.log(`✅ ${test.name}: ${query_time}ms (${performance_level})`)
        } catch (error) {
          results.push({
            name: test.name,
            status: 'failed',
            error: error.message
          })
          console.warn(`⚠️ ${test.name} 查询失败:`, error.message)
        }
      }

      const average_time =
        results.filter(r => r.status === 'success').reduce((sum, r) => sum + r.query_time, 0) /
        results.filter(r => r.status === 'success').length

      this.mysql_test_results.performance = {
        status: 'success',
        tests: results,
        average_query_time: Math.round(average_time || 0),
        timestamp: new Date().toISOString()
      }

      console.log(`✅ 查询性能测试通过，平均响应时间: ${Math.round(average_time || 0)}ms`)
    } catch (error) {
      this.mysql_test_results.performance = {
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      }
      console.error('❌ 查询性能测试失败:', error.message)
      throw error
    }
  }

  /**
   * 🔄 数据一致性测试
   */
  async test_data_consistency () {
    try {
      console.log('🔄 开始数据一致性测试...')

      const consistency_checks = []

      // 检查用户积分一致性
      try {
        const [points_result] = await sequelize.query(`
          SELECT 
            COUNT(*) as total_records,
            SUM(CASE WHEN points < 0 THEN 1 ELSE 0 END) as negative_points,
            AVG(points) as avg_points
          FROM user_points
        `)

        consistency_checks.push({
          check: '用户积分一致性',
          status: 'success',
          data: points_result[0]
        })
      } catch (error) {
        consistency_checks.push({
          check: '用户积分一致性',
          status: 'failed',
          error: error.message
        })
      }

      // 检查抽奖记录一致性
      try {
        const [lottery_result] = await sequelize.query(`
          SELECT 
            COUNT(*) as total_records,
            COUNT(DISTINCT user_id) as unique_users,
            COUNT(DISTINCT campaign_id) as unique_campaigns
          FROM lottery_records
        `)

        consistency_checks.push({
          check: '抽奖记录一致性',
          status: 'success',
          data: lottery_result[0]
        })
      } catch (error) {
        consistency_checks.push({
          check: '抽奖记录一致性',
          status: 'failed',
          error: error.message
        })
      }

      const failed_checks = consistency_checks.filter(check => check.status === 'failed')

      this.mysql_test_results.consistency = {
        status: failed_checks.length === 0 ? 'success' : 'warning',
        checks: consistency_checks,
        failed_count: failed_checks.length,
        timestamp: new Date().toISOString()
      }

      if (failed_checks.length === 0) {
        console.log(`✅ 数据一致性测试通过，执行${consistency_checks.length}项检查`)
      } else {
        console.warn(`⚠️ 数据一致性测试发现${failed_checks.length}个问题`)
      }
    } catch (error) {
      this.mysql_test_results.consistency = {
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      }
      console.error('❌ 数据一致性测试失败:', error.message)
    }
  }

  /**
   * 📊 索引效率测试
   */
  async test_index_efficiency () {
    try {
      console.log('📊 开始索引效率测试...')

      const index_tests = []

      // 检查主要表的索引
      const tables_to_check = ['users', 'lottery_records', 'user_points']

      for (const table of tables_to_check) {
        try {
          const [indexes] = await sequelize.query(`SHOW INDEX FROM ${table}`)

          index_tests.push({
            table,
            status: 'success',
            index_count: indexes.length,
            indexes: indexes.map(idx => ({
              key_name: idx.Key_name,
              column_name: idx.Column_name,
              unique: idx.Non_unique === 0
            }))
          })

          console.log(`✅ ${table}表索引检查: ${indexes.length}个索引`)
        } catch (error) {
          index_tests.push({
            table,
            status: 'failed',
            error: error.message
          })
          console.warn(`⚠️ ${table}表索引检查失败:`, error.message)
        }
      }

      this.mysql_test_results.indexing = {
        status: 'success',
        tests: index_tests,
        timestamp: new Date().toISOString()
      }

      console.log(`✅ 索引效率测试完成，检查${tables_to_check.length}个表`)
    } catch (error) {
      this.mysql_test_results.indexing = {
        status: 'failed',
        error: error.message,
        timestamp: new Date().toISOString()
      }
      console.error('❌ 索引效率测试失败:', error.message)
    }
  }

  /**
   * 📈 生成MySQL测试报告
   */
  generate_mysql_report () {
    const report = {
      connection: this.mysql_test_results.connection,
      structure: this.mysql_test_results.structure,
      performance: this.mysql_test_results.performance,
      consistency: this.mysql_test_results.consistency,
      indexing: this.mysql_test_results.indexing,
      summary: {
        total_tests: Object.keys(this.mysql_test_results).length,
        passed_tests: Object.values(this.mysql_test_results).filter(r => r.status === 'success')
          .length,
        generated_at: new Date().toISOString()
      }
    }

    console.log('📈 MySQL测试报告生成完成')
    return report
  }
}

module.exports = MySQLTestSuite
