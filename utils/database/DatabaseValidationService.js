/**
 * 数据库验证服务 V4
 * 专门负责配置验证、数据一致性检查和业务规则验证
 * 从UnifiedDatabaseHelper中拆分的验证职责
 * 创建时间：2025年01月21日 北京时间
 */

const { QueryTypes } = require('sequelize')
const fs = require('fs')
const path = require('path')
const { getConnectionManager } = require('./DatabaseConnectionManager')
const { getSchemaManager } = require('./DatabaseSchemaManager')
const { getHealthChecker } = require('./DatabaseHealthChecker')

class DatabaseValidationService {
  constructor () {
    this.connectionManager = getConnectionManager()
    this.schemaManager = getSchemaManager()
    this.healthChecker = getHealthChecker()
  }

  /**
   * 获取Sequelize实例
   * @returns {Sequelize} Sequelize实例
   */
  get sequelize () {
    return this.connectionManager.getSequelize()
  }

  /**
   * 验证数据库配置
   * @returns {Promise<Object>} 验证结果
   */
  async validateDatabaseConfig () {
    try {
      await this.connectionManager.ensureConnection()

      // 获取当前连接的数据库名
      const [result] = await this.sequelize.query('SELECT DATABASE() as current_db', {
        type: QueryTypes.SELECT
      })

      const currentDb = result.current_db
      const expectedDb = process.env.DB_NAME || 'restaurant_points_dev'
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

    const strategyPath = path.join(__dirname, '../../services/UnifiedLotteryEngine/strategies')
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
   * 执行完整性检查
   * @param {Object} options 检查选项
   * @returns {Promise<Object>} 完整性检查结果
   */
  async performCompleteCheck (options = {}) {
    const {
      checkConfig = true,
      checkSchema = true,
      checkHealth = true,
      checkStrategies = true,
      checkIndexes = true,
      checkForeignKeys = true
    } = options

    const checkResults = {
      timestamp: new Date().toISOString(),
      checks: {},
      overallSuccess: false,
      summary: {
        total: 0,
        passed: 0,
        failed: 0
      }
    }

    try {
      await this.connectionManager.ensureConnection()

      console.log('🔍 开始执行数据库完整性检查...')

      // 1. 数据库配置检查
      if (checkConfig) {
        console.log('📋 检查数据库配置...')
        checkResults.checks.config = await this.validateDatabaseConfig()
        checkResults.summary.total++
        if (checkResults.checks.config.success) checkResults.summary.passed++
        else checkResults.summary.failed++
      }

      // 2. 健康状态检查
      if (checkHealth) {
        console.log('🏥 检查数据库健康状态...')
        checkResults.checks.health = await this.healthChecker.healthCheck()
        checkResults.summary.total++
        if (checkResults.checks.health.connected) checkResults.summary.passed++
        else checkResults.summary.failed++
      }

      // 3. 表结构检查
      if (checkSchema) {
        console.log('🗂️ 检查表结构...')
        checkResults.checks.schema = await this.validateCoreTablesSchema()
        checkResults.summary.total++
        if (checkResults.checks.schema.success) checkResults.summary.passed++
        else checkResults.summary.failed++
      }

      // 4. 索引完整性检查
      if (checkIndexes) {
        console.log('📊 检查索引完整性...')
        checkResults.checks.indexes = await this.schemaManager.checkIndexIntegrity()
        checkResults.summary.total++
        if (checkResults.checks.indexes.success) checkResults.summary.passed++
        else checkResults.summary.failed++
      }

      // 5. 外键约束检查
      if (checkForeignKeys) {
        console.log('🔗 检查外键约束...')
        checkResults.checks.foreignKeys = await this.schemaManager.checkForeignKeyConstraints()
        checkResults.summary.total++
        if (checkResults.checks.foreignKeys.success) checkResults.summary.passed++
        else checkResults.summary.failed++
      }

      // 6. 抽奖策略检查
      if (checkStrategies) {
        console.log('🎲 检查抽奖策略实现...')
        checkResults.checks.strategies = await this.validateLotteryStrategies()
        checkResults.summary.total++
        if (checkResults.checks.strategies.success) checkResults.summary.passed++
        else checkResults.summary.failed++
      }

      // 计算总体成功率
      checkResults.overallSuccess = checkResults.summary.failed === 0
      const successRate = (checkResults.summary.passed / checkResults.summary.total * 100).toFixed(1)

      console.log('\n📊 完整性检查完成:')
      console.log(`   总检查项: ${checkResults.summary.total}`)
      console.log(`   通过: ${checkResults.summary.passed}`)
      console.log(`   失败: ${checkResults.summary.failed}`)
      console.log(`   成功率: ${successRate}%`)

      if (checkResults.overallSuccess) {
        console.log('✅ 所有检查项均通过!')
      } else {
        console.log('❌ 发现问题，需要修复!')
        this.logCheckFailures(checkResults.checks)
      }

      return checkResults
    } catch (error) {
      console.error('❌ 完整性检查失败:', error.message)
      checkResults.error = error.message
      return checkResults
    }
  }

  /**
   * 验证核心表结构
   * @returns {Promise<Object>} 验证结果
   */
  async validateCoreTablesSchema () {
    const coreTableRequirements = {
      users: {
        requiredColumns: ['id', 'phone', 'nickname', 'is_admin', 'created_at', 'updated_at'],
        indexes: ['phone']
      },
      lottery_draws: {
        requiredColumns: ['id', 'user_id', 'draw_type', 'is_winner', 'prize_type', 'draw_time', 'created_at'],
        indexes: ['user_id', 'draw_time', 'is_winner']
      },
      lottery_prizes: {
        requiredColumns: ['id', 'name', 'type', 'probability', 'total_quantity', 'remaining_quantity'],
        indexes: ['type']
      },
      user_points_accounts: {
        requiredColumns: ['id', 'user_id', 'current_points', 'total_earned', 'total_used', 'updated_at'],
        indexes: ['user_id']
      }
    }

    const validationResults = {
      success: true,
      checkedTables: 0,
      issues: []
    }

    try {
      for (const [tableName, requirements] of Object.entries(coreTableRequirements)) {
        validationResults.checkedTables++

        // 检查表是否存在
        const tableExists = await this.schemaManager.tableExists(tableName)
        if (!tableExists) {
          validationResults.success = false
          validationResults.issues.push(`表 ${tableName} 不存在`)
          continue
        }

        // 检查必需列
        for (const columnName of requirements.requiredColumns) {
          const columnExists = await this.schemaManager.columnExists(tableName, columnName)
          if (!columnExists) {
            validationResults.success = false
            validationResults.issues.push(`表 ${tableName} 缺少列 ${columnName}`)
          }
        }

        // 检查索引（简化版）
        try {
          const indexes = await this.schemaManager.getTableIndexes(tableName)
          const indexColumns = indexes.map(idx => idx.columns.map(c => c.column)).flat()

          for (const requiredIndex of requirements.indexes) {
            if (!indexColumns.includes(requiredIndex)) {
              validationResults.issues.push(`表 ${tableName} 缺少索引: ${requiredIndex}`)
            }
          }
        } catch (error) {
          console.warn(`检查表 ${tableName} 索引时出错:`, error.message)
        }
      }

      return {
        type: 'coreTablesValidation',
        success: validationResults.success,
        checkedTables: validationResults.checkedTables,
        issues: validationResults.issues
      }
    } catch (error) {
      console.error('核心表结构验证失败:', error.message)
      return {
        type: 'coreTablesValidation',
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 验证数据完整性
   * @returns {Promise<Object>} 验证结果
   */
  async validateDataIntegrity () {
    const integrityResults = {
      success: true,
      checks: {},
      issues: []
    }

    try {
      await this.connectionManager.ensureConnection()

      // 检查用户数据完整性
      const userIntegrity = await this.validateUserDataIntegrity()
      integrityResults.checks.users = userIntegrity
      if (!userIntegrity.success) {
        integrityResults.success = false
        integrityResults.issues.push(...userIntegrity.issues)
      }

      // 检查抽奖记录完整性
      const lotteryIntegrity = await this.validateLotteryDataIntegrity()
      integrityResults.checks.lottery = lotteryIntegrity
      if (!lotteryIntegrity.success) {
        integrityResults.success = false
        integrityResults.issues.push(...lotteryIntegrity.issues)
      }

      // 检查积分账户完整性
      const pointsIntegrity = await this.validatePointsDataIntegrity()
      integrityResults.checks.points = pointsIntegrity
      if (!pointsIntegrity.success) {
        integrityResults.success = false
        integrityResults.issues.push(...pointsIntegrity.issues)
      }

      return {
        type: 'dataIntegrityValidation',
        success: integrityResults.success,
        checks: integrityResults.checks,
        totalIssues: integrityResults.issues.length,
        issues: integrityResults.issues
      }
    } catch (error) {
      console.error('数据完整性验证失败:', error.message)
      return {
        type: 'dataIntegrityValidation',
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 验证用户数据完整性
   * @returns {Promise<Object>} 验证结果
   */
  async validateUserDataIntegrity () {
    const issues = []

    try {
      // 检查重复手机号
      const [duplicatePhones] = await this.sequelize.query(`
        SELECT phone, COUNT(*) as count 
        FROM users 
        GROUP BY phone 
        HAVING COUNT(*) > 1
      `, { type: QueryTypes.SELECT })

      if (duplicatePhones && duplicatePhones.count > 0) {
        const [duplicates] = await this.sequelize.query(`
          SELECT phone, COUNT(*) as count 
          FROM users 
          GROUP BY phone 
          HAVING COUNT(*) > 1
        `, { type: QueryTypes.SELECT })

        if (duplicates.length > 0) {
          issues.push(`发现重复手机号: ${duplicates.length} 个`)
        }
      }

      // 检查无效手机号格式
      const [invalidPhones] = await this.sequelize.query(`
        SELECT COUNT(*) as count 
        FROM users 
        WHERE phone NOT REGEXP '^[0-9]{11}$' OR phone IS NULL
      `, { type: QueryTypes.SELECT })

      if (invalidPhones.count > 0) {
        issues.push(`发现无效手机号: ${invalidPhones.count} 个`)
      }

      return {
        success: issues.length === 0,
        issues
      }
    } catch (error) {
      console.error('用户数据完整性检查失败:', error.message)
      return {
        success: false,
        error: error.message,
        issues: ['用户数据完整性检查失败']
      }
    }
  }

  /**
   * 验证抽奖记录数据完整性
   * @returns {Promise<Object>} 验证结果
   */
  async validateLotteryDataIntegrity () {
    const issues = []

    try {
      // 检查孤立的抽奖记录（用户不存在）
      const [orphanRecords] = await this.sequelize.query(`
        SELECT COUNT(*) as count 
        FROM lottery_draws lr 
        LEFT JOIN users u ON lr.user_id = u.id 
        WHERE u.id IS NULL
      `, { type: QueryTypes.SELECT })

      if (orphanRecords.count > 0) {
        issues.push(`发现孤立的抽奖记录: ${orphanRecords.count} 条`)
      }

      // 检查无效的抽奖时间
      const [invalidTimes] = await this.sequelize.query(`
        SELECT COUNT(*) as count 
        FROM lottery_draws 
        WHERE draw_time IS NULL OR draw_time > NOW()
      `, { type: QueryTypes.SELECT })

      if (invalidTimes.count > 0) {
        issues.push(`发现无效的抽奖时间: ${invalidTimes.count} 条`)
      }

      return {
        success: issues.length === 0,
        issues
      }
    } catch (error) {
      console.error('抽奖记录完整性检查失败:', error.message)
      return {
        success: false,
        error: error.message,
        issues: ['抽奖记录完整性检查失败']
      }
    }
  }

  /**
   * 验证积分账户数据完整性
   * @returns {Promise<Object>} 验证结果
   */
  async validatePointsDataIntegrity () {
    const issues = []

    try {
      // 检查孤立的积分账户（用户不存在）
      const [orphanAccounts] = await this.sequelize.query(`
        SELECT COUNT(*) as count 
        FROM user_points_accounts upa 
        LEFT JOIN users u ON upa.user_id = u.id 
        WHERE u.id IS NULL
      `, { type: QueryTypes.SELECT })

      if (orphanAccounts.count > 0) {
        issues.push(`发现孤立的积分账户: ${orphanAccounts.count} 个`)
      }

      // 检查积分账户数据一致性
      const [inconsistentAccounts] = await this.sequelize.query(`
        SELECT COUNT(*) as count 
        FROM user_points_accounts 
        WHERE current_points < 0 
        OR total_earned < total_used 
        OR current_points != (total_earned - total_used)
      `, { type: QueryTypes.SELECT })

      if (inconsistentAccounts.count > 0) {
        issues.push(`发现不一致的积分账户: ${inconsistentAccounts.count} 个`)
      }

      return {
        success: issues.length === 0,
        issues
      }
    } catch (error) {
      console.error('积分账户完整性检查失败:', error.message)
      return {
        success: false,
        error: error.message,
        issues: ['积分账户完整性检查失败']
      }
    }
  }

  /**
   * 记录检查失败的详细信息
   * @param {Object} checks 检查结果
   */
  logCheckFailures (checks) {
    console.log('\n❌ 发现的问题详情:')

    Object.entries(checks).forEach(([checkName, result]) => {
      if (!result.success && !result.connected) {
        console.log(`\n🔍 ${checkName}:`)
        if (result.error) {
          console.log(`   错误: ${result.error}`)
        }
        if (result.issues && result.issues.length > 0) {
          result.issues.forEach(issue => {
            console.log(`   - ${issue}`)
          })
        }
        if (result.missingIndexes && result.missingIndexes.length > 0) {
          console.log(`   缺失索引: ${result.missingIndexes.length} 个`)
        }
        if (result.missingConstraints && result.missingConstraints.length > 0) {
          console.log(`   缺失外键: ${result.missingConstraints.length} 个`)
        }
      }
    })
  }
}

// 导出单例实例获取函数
let validationService = null

function getValidationService () {
  if (!validationService) {
    validationService = new DatabaseValidationService()
  }
  return validationService
}

module.exports = {
  DatabaseValidationService,
  getValidationService
}
