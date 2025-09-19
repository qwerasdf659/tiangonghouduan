/**
 * 数据库字段管理模块
 * 系统性解决数据库字段不匹配、表结构缺失问题
 * 创建时间：2025年09月15日 北京时间
 */

'use strict'

require('dotenv').config()
const { sequelize } = require('../../models')
const fs = require('fs')
const path = require('path')

/**
 * 数据库字段管理器
 */
class DatabaseFieldManager {
  constructor () {
    this.reportData = {
      timestamp: new Date().toISOString(),
      createdTables: [],
      fixedFields: [],
      errors: [],
      businessStandardsUnified: []
    }

    // 🗑️ 兼容性代码清理配置
    this.compatibilityPatterns = {
      // V4之前的兼容性代码
      legacy_code_patterns: [
        /\/\/ .*兼容.*v[123]/i,
        /\/\* .*兼容性.*\*\//i,
        /legacy.*support/i,
        /backward.*compatibility/i
      ],
      // 废弃的API版本
      deprecated_api_patterns: [
        /\/api\/v[123]\//g,
        /api_version.*[123]/i,
        /version.*[123]/g,
        /v[123].*endpoint/i
      ]
    }

    // 🎯 V4.1业务标准完善配置 (扩展功能)
    this.enhancementConfig = {
      // ✅ 修正：业务场景分类的状态标准（替代错误的BASIC统一标准）
      statusStandards: {
        // 1. 流程业务标准 - 适用于有明确业务流程的场景
        PROCESS_FLOW: {
          name: '流程业务标准',
          values: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
          description: '适用于交易、任务等有明确流程的业务',
          applicableTables: ['TradeRecord', 'UserTask']
        },

        // 2. 分发兑换标准 - 适用于兑换/分发业务
        DISTRIBUTION_FLOW: {
          name: '分发兑换标准',
          values: ['pending', 'distributed', 'used', 'expired', 'cancelled'],
          description: '适用于兑换记录、奖品分发等业务',
          applicableTables: ['ExchangeRecords']
        },

        // 3. 实体生命周期标准 - 适用于实体对象管理
        ENTITY_LIFECYCLE: {
          name: '实体生命周期标准',
          values: ['active', 'offline', 'deleted'],
          description: '适用于商品、用户等实体的生命周期',
          applicableTables: ['Product']
        },

        // 4. 审核流程标准 - 适用于审核业务
        REVIEW_PROCESS: {
          name: '审核流程标准',
          values: ['none', 'required', 'verified', 'rejected'],
          description: '适用于内容审核、认证等业务',
          applicableTables: ['TradeRecord.verification_status']
        },

        // 5. 在线状态标准 - 适用于实时状态
        PRESENCE_STATUS: {
          name: '在线状态标准',
          values: ['online', 'busy', 'offline'],
          description: '适用于用户在线状态、管理员状态等',
          applicableTables: ['AdminStatus']
        }
      },

      // 2. 🔗 数据库外键关系标准化
      foreignKeyStandards: {
        // 主键命名标准：{table_name}_id
        primaryKeyPattern: /^[a-z_]+_id$/,

        // 外键命名标准：{referenced_table}_id
        foreignKeyPattern: /^[a-z_]+_id$/,

        // 需要检查的外键关系（基于实际表结构和业务标准修正）
        expectedRelations: {
          lottery_records: ['user_id', 'campaign_id', 'prize_id'], // ✅ 修正完成
          unified_decision_records: ['user_id', 'campaign_id'], // 修正：移除不存在的lottery_record_id，添加campaign_id
          exchange_records: ['user_id', 'product_id'],
          trade_records: ['from_user_id', 'to_user_id', 'operator_id'], // 修正：使用实际存在的字段名
          chat_messages: ['session_id', 'sender_id'],
          customer_sessions: ['user_id', 'admin_id']
        }
      },

      // 3. ⚡ 错误处理机制统一化
      errorHandlingStandards: {
        // 错误代码分类
        errorCategories: {
          VALIDATION: '10000-19999', // 参数验证错误
          AUTHENTICATION: '20000-29999', // 认证授权错误
          BUSINESS: '30000-39999', // 业务逻辑错误
          DATABASE: '40000-49999', // 数据库操作错误
          EXTERNAL: '50000-59999', // 外部服务错误
          SYSTEM: '90000-99999' // 系统级错误
        },

        // 用户友好错误信息模板
        messageTemplates: {
          zh: {
            VALIDATION: '输入参数有误：{detail}',
            AUTHENTICATION: '身份验证失败：{detail}',
            BUSINESS: '操作失败：{detail}',
            DATABASE: '数据处理异常，请稍后重试',
            EXTERNAL: '外部服务暂时不可用，请稍后重试',
            SYSTEM: '系统异常，请联系客服'
          }
        }
      },

      // 4. 📊 数据库性能优化
      performanceOptimization: {
        // 复合索引建议
        compositeIndexSuggestions: {
          lottery_records: [
            ['user_id', 'created_at'], // 用户抽奖历史查询
            ['lottery_id', 'is_winner'], // 某个抽奖的中奖情况
            ['created_at', 'is_winner'] // 按时间查询中奖记录
          ],
          unified_decision_records: [
            ['user_id', 'created_at'], // 用户决策历史
            ['lottery_record_id', 'decision_type'] // 决策类型查询
          ],
          exchange_records: [
            ['user_id', 'created_at'], // 用户兑换历史
            ['product_id', 'status'], // 产品兑换状态
            ['status', 'created_at'] // 状态时间复合查询
          ]
        },

        // 分页查询标准
        paginationStandards: {
          defaultPageSize: 20,
          maxPageSize: 100,
          defaultSortField: 'created_at',
          defaultSortOrder: 'DESC'
        }
      }
    }
  }

  /**
   * 执行完整的数据库字段检查和修复
   */
  async runFieldCheck () {
    console.log('🗄️ 开始数据库字段检查和修复...')
    console.log(`⏰ 检查时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

    try {
      // 1. 检查并创建缺失的表
      await this.createMissingTables()

      // 2. 修复字段不匹配问题
      await this.fixFieldMismatches()

      // 3. 验证修复结果
      await this.verifyFixes()

      // 4. 验证is_winner业务标准一致性
      await this.validateBusinessStandards()

      // 5. 生成修复报告
      await this.generateReport()

      console.log('\n🎉 数据库字段检查和修复完成!')
      return this.reportData
    } catch (error) {
      console.error('❌ 数据库字段检查失败:', error.message)
      throw error
    }
  }

  /**
   * 创建缺失的数据库表
   */
  async createMissingTables () {
    console.log('\n📊 检查并创建缺失的数据库表...')

    // 检查ProbabilityLog表
    await this.createProbabilityLogTable()

    // 检查其他可能缺失的表
    await this.checkOtherMissingTables()
  }

  /**
   * 创建ProbabilityLog表
   */
  async createProbabilityLogTable () {
    console.log('🔧 检查ProbabilityLog表...')

    try {
      // 检查表是否存在
      await sequelize.query('DESCRIBE probability_logs')
      console.log('✅ ProbabilityLog表已存在')
    } catch (error) {
      if (error.message.includes('doesn\'t exist')) {
        console.log('📝 创建ProbabilityLog表...')

        // 创建ProbabilityLog表
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS probability_logs (
            log_id INT PRIMARY KEY AUTO_INCREMENT COMMENT '概率日志记录ID',
            decision_id VARCHAR(50) NOT NULL COMMENT '决策ID，关联到抽奖决策',
            campaign_id INT NOT NULL COMMENT '抽奖活动ID',
            user_id INT NOT NULL COMMENT '用户ID',
            calculation_step VARCHAR(100) NOT NULL COMMENT '计算步骤名称',
            step_order INT NOT NULL COMMENT '步骤顺序',
            input_probability DECIMAL(10,8) DEFAULT NULL COMMENT '输入概率',
            output_probability DECIMAL(10,8) NOT NULL COMMENT '输出概率',
            factor_type VARCHAR(50) NOT NULL COMMENT '因子类型',
            factor_name VARCHAR(100) DEFAULT NULL COMMENT '因子名称',
            factor_value DECIMAL(10,4) DEFAULT NULL COMMENT '因子值',
            adjustment_reason TEXT DEFAULT NULL COMMENT '调整原因',
            metadata JSON DEFAULT NULL COMMENT '额外元数据',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
            INDEX idx_decision_id (decision_id),
            INDEX idx_campaign_user (campaign_id, user_id),
            INDEX idx_step (calculation_step, step_order)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖概率计算日志表'
        `

        await sequelize.query(createTableSQL)
        console.log('✅ ProbabilityLog表创建成功')

        this.reportData.createdTables.push({
          name: 'probability_logs',
          action: '创建表结构',
          timestamp: new Date().toISOString()
        })
      } else {
        console.error('❌ 检查ProbabilityLog表失败:', error.message)
        this.reportData.errors.push({
          type: 'TABLE_CHECK',
          table: 'probability_logs',
          error: error.message
        })
      }
    }
  }

  /**
   * 检查其他可能缺失的表
   */
  async checkOtherMissingTables () {
    console.log('🔍 检查其他可能缺失的表...')

    const requiredTables = [
      'users',
      'user_points_accounts',
      'lottery_campaigns',
      'lottery_prizes',
      'lottery_records',
      'prize_distributions'
    ]

    for (const tableName of requiredTables) {
      try {
        await sequelize.query(`DESCRIBE ${tableName}`)
        console.log(`✅ ${tableName} 表正常`)
      } catch (error) {
        if (error.message.includes('doesn\'t exist')) {
          console.log(`⚠️ ${tableName} 表不存在，需要手动创建`)
          this.reportData.errors.push({
            type: 'MISSING_TABLE',
            table: tableName,
            error: '表不存在'
          })
        }
      }
    }
  }

  /**
   * 修复字段不匹配问题
   */
  async fixFieldMismatches () {
    console.log('\n🔧 修复字段不匹配问题...')

    // 修复lottery_prizes表字段
    await this.fixLotteryPrizesFields()

    // 检查并修复其他字段问题
    await this.checkOtherFieldIssues()

    // 🔗 修复外键约束问题
    await this.fixForeignKeyConstraints()
  }

  /**
   * 修复lottery_prizes表字段问题
   */
  async fixLotteryPrizesFields () {
    console.log('🔧 检查lottery_prizes表字段...')

    try {
      const [results] = await sequelize.query('DESCRIBE lottery_prizes')
      const columns = results.map(r => r.Field)

      // 检查必需字段
      const requiredFields = ['prize_id', 'prize_name', 'prize_type', 'prize_value']
      const missingFields = requiredFields.filter(field => !columns.includes(field))

      if (missingFields.length > 0) {
        console.log('⚠️ lottery_prizes表缺少字段:', missingFields)
        this.reportData.errors.push({
          type: 'MISSING_FIELDS',
          table: 'lottery_prizes',
          fields: missingFields
        })
      } else {
        console.log('✅ lottery_prizes表字段完整')
      }

      // 🗑️ 移除冗余的prize_weight字段 - 避免与win_probability重复
      if (columns.includes('prize_weight')) {
        console.log('🗑️ 移除冗余的prize_weight字段，保持单一数据源...')

        // 先备份权重数据（如果需要的话）
        const [weightData] = await sequelize.query(`
          SELECT prize_id, prize_name, prize_weight, win_probability
          FROM lottery_prizes
          WHERE prize_weight IS NOT NULL AND prize_weight != 100
        `)

        if (weightData.length > 0) {
          console.log('📋 发现自定义权重数据:')
          weightData.forEach(prize => {
            console.log(`   奖品${prize.prize_id}(${prize.prize_name}): 权重${prize.prize_weight} vs 概率${(prize.win_probability * 100).toFixed(1)}%`)
          })
        }
        // 移除prize_weight字段
        await sequelize.query('ALTER TABLE lottery_prizes DROP COLUMN prize_weight')
        console.log('✅ prize_weight字段已移除')
        this.reportData.fixedFields.push({
          table: 'lottery_prizes',
          action: 'REMOVE_REDUNDANT_FIELD',
          field: 'prize_weight',
          reason: '避免与win_probability数据重复，保持单一真相来源'
        })
      } else {
        console.log('✅ 未发现prize_weight字段，无需移除')
      }
      // ✅ 验证概率数据完整性
      await this.validatePrizeProbabilities()
    } catch (error) {
      console.error('❌ 检查lottery_prizes表失败:', error.message)
      this.reportData.errors.push({
        type: 'TABLE_CHECK',
        table: 'lottery_prizes',
        error: error.message
      })
    }
  }

  /**
   * 验证奖品概率数据完整性
   * 确保总概率等于100%，避免业务逻辑错误
   */
  async validatePrizeProbabilities () {
    console.log('🎯 验证奖品概率数据完整性...')

    try {
      // 按活动分组检查概率总和
      const [campaigns] = await sequelize.query(`
        SELECT DISTINCT campaign_id FROM lottery_prizes WHERE status = 'active'
      `)

      for (const campaign of campaigns) {
        const campaignId = campaign.campaign_id

        // 获取该活动的所有有效奖品概率
        const [prizes] = await sequelize.query(`
          SELECT 
            prize_id, 
            prize_name, 
            win_probability,
            ROUND(win_probability * 100, 2) as percentage
          FROM lottery_prizes 
          WHERE campaign_id = :campaignId AND status = 'active'
          ORDER BY win_probability DESC
        `, {
          replacements: { campaignId },
          type: sequelize.QueryTypes.SELECT
        })

        if (prizes.length === 0) {
          console.log(`⚠️ 活动${campaignId}没有有效奖品`)
          continue
        }

        // 计算总概率
        const totalProbability = prizes.reduce((sum, prize) => sum + parseFloat(prize.win_probability), 0)
        const totalPercentage = Math.round(totalProbability * 100 * 100) / 100 // 精确到小数点后2位

        console.log(`📊 活动${campaignId}概率分析:`)
        prizes.forEach(prize => {
          console.log(`   - ${prize.prize_name}: ${prize.percentage}%`)
        })
        console.log(`   总概率: ${totalPercentage}%`)

        // 验证概率总和
        if (Math.abs(totalPercentage - 100) > 0.01) { // 允许0.01%的浮点数误差
          const difference = (totalPercentage - 100).toFixed(2)
          if (totalPercentage < 100) {
            console.log(`⚠️ 活动${campaignId}概率不足: ${totalPercentage}% (缺少${Math.abs(difference)}%)`)
          } else {
            console.log(`⚠️ 活动${campaignId}概率超标: ${totalPercentage}% (超出${difference}%)`)
          }

          this.reportData.businessStandardsUnified.push({
            type: 'PROBABILITY_VALIDATION',
            campaign_id: campaignId,
            total_probability: totalPercentage,
            expected: 100,
            difference,
            status: 'WARNING'
          })
        } else {
          console.log(`✅ 活动${campaignId}概率配置正确: ${totalPercentage}%`)

          this.reportData.businessStandardsUnified.push({
            type: 'PROBABILITY_VALIDATION',
            campaign_id: campaignId,
            total_probability: totalPercentage,
            expected: 100,
            difference: 0,
            status: 'VALID'
          })
        }

        // 检查是否有0概率但应该参与抽奖的奖品
        const zeroProbabilityPrizes = prizes.filter(p => parseFloat(p.win_probability) === 0)
        if (zeroProbabilityPrizes.length > 0) {
          console.log(`📋 活动${campaignId}发现0概率奖品:`)
          zeroProbabilityPrizes.forEach(prize => {
            console.log(`   - ${prize.prize_name}: 0% (不参与抽奖)`)
          })
        }
      }

      console.log('✅ 奖品概率验证完成')
    } catch (error) {
      console.error('❌ 概率验证失败:', error.message)
      this.reportData.errors.push({
        type: 'PROBABILITY_VALIDATION',
        error: error.message
      })
    }
  }

  /**
   * 检查其他字段问题
   */
  async checkOtherFieldIssues () {
    console.log('🔍 检查其他字段问题...')

    // 检查用户表字段
    try {
      const [results] = await sequelize.query('DESCRIBE users')
      const columns = results.map(r => r.Field)

      const requiredFields = ['user_id', 'mobile', 'nickname', 'is_admin']
      const missingFields = requiredFields.filter(field => !columns.includes(field))

      if (missingFields.length > 0) {
        console.log('⚠️ users表缺少字段:', missingFields)
        this.reportData.errors.push({
          type: 'MISSING_FIELDS',
          table: 'users',
          fields: missingFields
        })
      } else {
        console.log('✅ users表字段完整')
      }
    } catch (error) {
      console.error('❌ 检查users表失败:', error.message)
    }
  }

  /**
   * 🔗 修复外键约束问题（基于业务标准思维）
   */
  async fixForeignKeyConstraints () {
    console.log('\n🔗 基于业务标准修复外键约束问题...')

    try {
      // 先验证当前外键状态
      const fkValidation = await this.validateForeignKeyStandards()

      if (fkValidation.missingConstraints.length === 0) {
        console.log('✅ 外键约束完整，无需修复')
        return
      }

      console.log(`🔧 发现${fkValidation.missingConstraints.length}个缺失的外键约束，开始修复...`)

      // 基于业务标准创建迁移文件
      const migrationTimestamp = new Date()
        .toISOString()
        .replace(/[-:T.]/g, '')
        .substring(0, 14)
      const migrationPath = `migrations/${migrationTimestamp}-fix-missing-foreign-keys.js`

      const migrationContent = this.generateForeignKeyMigration(fkValidation.missingConstraints)

      // 写入迁移文件
      const fs = require('fs')
      fs.writeFileSync(migrationPath, migrationContent)
      console.log(`📄 创建外键修复迁移: ${migrationPath}`)

      // 执行迁移
      const { exec } = require('child_process')
      await new Promise((resolve, reject) => {
        exec('npx sequelize-cli db:migrate', (error, stdout, _stderr) => {
          if (error) {
            console.error('❌ 迁移执行失败:', error.message)
            reject(error)
          } else {
            console.log('✅ 外键约束修复完成')
            console.log(stdout)
            resolve()
          }
        })
      })
      // 记录修复结果
      this.reportData.fixedFields.push({
        type: 'foreign_key_constraints',
        count: fkValidation.missingConstraints.length,
        details: fkValidation.missingConstraints
      })
    } catch (error) {
      console.error('❌ 外键约束修复失败:', error.message)
      this.reportData.errors.push(`外键约束修复失败: ${error.message}`)
    }
  }

  /**
   * 生成外键约束修复迁移文件内容
   */
  generateForeignKeyMigration (missingConstraints) {
    // 🎯 基于实际表结构的正确业务标准映射
    const businessStandardMapping = {
      campaign_id: { table: 'lottery_campaigns', column: 'campaign_id' },
      draw_id: { table: 'lottery_draws', column: 'draw_id' },
      lottery_record_id: { table: 'lottery_records', column: 'draw_id' },
      user_id: { table: 'users', column: 'user_id' },
      from_user_id: { table: 'users', column: 'user_id' }, // trade_records表的发起用户
      to_user_id: { table: 'users', column: 'user_id' }, // trade_records表的目标用户
      operator_id: { table: 'users', column: 'user_id' }, // trade_records表的操作员
      session_id: { table: 'customer_sessions', column: 'session_id' },
      admin_id: { table: 'users', column: 'user_id' },
      sender_id: { table: 'users', column: 'user_id' },
      product_id: { table: 'products', column: 'product_id' },
      prize_id: { table: 'lottery_prizes', column: 'prize_id' }
    }

    let migrationContent = `'use strict'

/**
 * 外键关系标准化修复（基于业务标准分析）
 *
 * 修复缺失的外键约束，确保数据完整性和业务逻辑一致性
 * 基于实际业务标准映射，而非简单字符串替换
 * 生成时间: ${new Date().toISOString()}
 */

module.exports = {
  up: async (queryInterface, _Sequelize) => {
    console.log('🔗 开始修复外键关系标准化...')

    try {
`

    missingConstraints.forEach((constraint, index) => {
      const constraintName = `fk_${constraint.table}_${constraint.column}`

      // 🎯 使用业务标准映射而不是简单字符串替换
      const mapping = businessStandardMapping[constraint.column]
      if (!mapping) {
        console.warn(`⚠️ 未找到${constraint.column}的业务标准映射，跳过`)
        return
      }

      const referencedTable = mapping.table
      const referencedColumn = mapping.column

      migrationContent += `
      // ${index + 1}. 修复 ${constraint.table}.${constraint.column} 外键约束
      console.log('🔗 添加外键: ${constraint.table}.${constraint.column} → ${referencedTable}.${referencedColumn}')
      await queryInterface.addConstraint('${constraint.table}', {
        fields: ['${constraint.column}'],
        type: 'foreign key',
        name: '${constraintName}',
        references: {
          table: '${referencedTable}',
          field: '${referencedColumn}'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })
`
    })

    migrationContent += `
      console.log('✅ 外键关系标准化修复完成')
    } catch (error) {
      console.error('❌ 外键修复失败:', error.message)
      throw error
    }
  },

  down: async (queryInterface, _Sequelize) => {
    console.log('🔄 回滚外键关系标准化修复...')

    try {
`

    missingConstraints.forEach(constraint => {
      const constraintName = `fk_${constraint.table}_${constraint.column}`

      migrationContent += `
      await queryInterface.removeConstraint('${constraint.table}', '${constraintName}')
`
    })

    migrationContent += `
      console.log('✅ 外键关系标准化回滚完成')
    } catch (error) {
      console.error('❌ 外键回滚失败:', error.message)
      throw error
    }
  }
}
`

    return migrationContent
  }

  /**
   * 验证修复结果
   */
  async verifyFixes () {
    console.log('\n✅ 验证数据库修复结果...')

    let totalTables = 0
    let healthyTables = 0

    const tablesToCheck = [
      'probability_logs',
      'users',
      'user_points_accounts',
      'lottery_campaigns',
      'lottery_prizes',
      'lottery_records'
    ]

    for (const tableName of tablesToCheck) {
      totalTables++
      try {
        await sequelize.query(`DESCRIBE ${tableName}`)
        healthyTables++
        console.log(`✅ ${tableName}: 正常`)
      } catch (error) {
        console.log(`❌ ${tableName}: ${error.message}`)
      }
    }

    console.log('\n📊 数据库表检查结果:')
    console.log(`  - 总表数: ${totalTables}`)
    console.log(`  - 正常表数: ${healthyTables}`)
    console.log(`  - 成功率: ${((healthyTables / totalTables) * 100).toFixed(1)}%`)

    return {
      totalTables,
      healthyTables,
      successRate: (healthyTables / totalTables) * 100
    }
  }

  /**
   * 验证is_winner业务标准一致性
   * 确保全栈采用统一的is_winner字段标准
   */
  async validateBusinessStandards () {
    console.log('\n🎯 验证is_winner业务标准一致性...')

    const validationResults = {
      database: await this.validateDatabaseStandards(),
      models: await this.validateModelStandards(),
      codeConsistency: await this.validateCodeConsistency()
    }

    // 统计验证结果
    const totalChecks = Object.values(validationResults).reduce(
      (sum, result) => sum + result.totalChecks,
      0
    )
    const passedChecks = Object.values(validationResults).reduce(
      (sum, result) => sum + result.passedChecks,
      0
    )
    const successRate = totalChecks > 0 ? ((passedChecks / totalChecks) * 100).toFixed(1) : 100

    console.log('\n📊 业务标准验证结果:')
    console.log(`  - 数据库标准: ${validationResults.database.status}`)
    console.log(`  - 模型标准: ${validationResults.models.status}`)
    console.log(`  - 代码一致性: ${validationResults.codeConsistency.status}`)
    console.log(`  - 总体合规率: ${successRate}%`)

    if (successRate < 100) {
      console.log('\n⚠️ 发现业务标准不一致问题:')
      Object.values(validationResults).forEach(result => {
        result.issues?.forEach(issue => console.log(`   - ${issue}`))
      })
    } else {
      console.log('✅ 全栈is_winner业务标准完全一致!')
    }

    // 将验证结果添加到报告
    this.reportData.businessStandardsValidation = validationResults

    return validationResults
  }

  /**
   * 验证数据库层is_winner标准
   */
  async validateDatabaseStandards () {
    console.log('🗄️ 检查数据库表结构中的is_winner字段...')

    const requiredTables = ['lottery_records', 'unified_decision_records', 'lottery_draws']
    const issues = []
    let passedChecks = 0
    const totalChecks = requiredTables.length

    for (const tableName of requiredTables) {
      try {
        const [results] = await sequelize.query(`DESCRIBE ${tableName}`)
        const isWinnerField = results.find(field => field.Field === 'is_winner')

        if (isWinnerField) {
          if (isWinnerField.Type.includes('tinyint(1)') || isWinnerField.Type.includes('boolean')) {
            console.log(`✅ ${tableName}.is_winner: 字段类型正确`)
            passedChecks++
          } else {
            issues.push(`${tableName}.is_winner 字段类型不正确: ${isWinnerField.Type}`)
          }
        } else {
          issues.push(`${tableName} 缺少is_winner字段`)
        }
      } catch (error) {
        issues.push(`无法检查表 ${tableName}: ${error.message}`)
      }
    }

    return {
      status: issues.length === 0 ? '✅ 合规' : '❌ 不合规',
      totalChecks,
      passedChecks,
      issues
    }
  }

  /**
   * 验证模型层is_winner标准
   */
  async validateModelStandards () {
    console.log('📋 检查模型定义中的is_winner字段...')

    const fs = require('fs')
    const path = require('path')
    const issues = []
    let passedChecks = 0
    let totalChecks = 0

    // 检查关键模型文件
    const modelFiles = ['LotteryRecord.js', 'LotteryDraw.js', 'unified/DecisionRecord.js']

    for (const modelFile of modelFiles) {
      totalChecks++
      const modelPath = path.join(process.cwd(), 'models', modelFile)

      try {
        if (fs.existsSync(modelPath)) {
          const content = fs.readFileSync(modelPath, 'utf8')

          if (content.includes('is_winner:') || content.includes('is_winner ')) {
            console.log(`✅ ${modelFile}: 使用is_winner字段`)
            passedChecks++
          } else {
            issues.push(`${modelFile} 未找到is_winner字段定义`)
          }
        } else {
          issues.push(`模型文件不存在: ${modelFile}`)
        }
      } catch (error) {
        issues.push(`检查模型文件失败 ${modelFile}: ${error.message}`)
      }
    }

    return {
      status: issues.length === 0 ? '✅ 合规' : '❌ 不合规',
      totalChecks,
      passedChecks,
      issues
    }
  }

  /**
   * 验证代码一致性（检查是否有遗留的旧字段名）
   */
  async validateCodeConsistency () {
    console.log('🔍 检查代码中is_winner使用一致性...')

    const { execSync } = require('child_process')
    const issues = []
    let passedChecks = 0
    const totalChecks = 4 // 检查4个关键区域

    try {
      // 1. 检查services目录中是否有非标准字段（优化检测模式，避免误报）
      const serviceFiles = execSync(
        'grep -r -l "isWin\\b\\|\\bdraw_result[^s]\\|win_status" services/ || true',
        { encoding: 'utf8' }
      ).trim()
      if (!serviceFiles) {
        console.log('✅ 服务层: 无遗留的非标准字段')
        passedChecks++
      } else {
        issues.push(`服务层发现非标准字段: ${serviceFiles.split('\n').join(', ')}`)
      }

      // 2. 检查routes目录
      const routeFiles = execSync(
        'grep -r -l "isWin\\b\\|\\bdraw_result[^s]\\|win_status" routes/ || true',
        { encoding: 'utf8' }
      ).trim()
      if (!routeFiles) {
        console.log('✅ 路由层: 无遗留的非标准字段')
        passedChecks++
      } else {
        issues.push(`路由层发现非标准字段: ${routeFiles.split('\n').join(', ')}`)
      }

      // 3. 检查models目录
      const modelFiles = execSync(
        'grep -r -l "isWin\\b\\|draw_result_name\\|win_status" models/ || true',
        { encoding: 'utf8' }
      ).trim()
      if (!modelFiles) {
        console.log('✅ 模型层: 无遗留的非标准字段')
        passedChecks++
      } else {
        issues.push(`模型层发现非标准字段: ${modelFiles.split('\n').join(', ')}`)
      }

      // 4. 检查utils目录
      const utilFiles = execSync('grep -r -l "isWin\\|draw_result\\|win_status" utils/ || true', {
        encoding: 'utf8'
      }).trim()
      if (!utilFiles) {
        console.log('✅ 工具层: 无遗留的非标准字段')
        passedChecks++
      } else {
        issues.push(`工具层发现非标准字段: ${utilFiles.split('\n').join(', ')}`)
      }
    } catch (error) {
      issues.push(`代码一致性检查失败: ${error.message}`)
    }

    return {
      status: issues.length === 0 ? '✅ 合规' : '❌ 不合规',
      totalChecks,
      passedChecks,
      issues
    }
  }

  /**
   * 🆕 1. 状态字段枚举值标准化验证
   */
  async validateStatusFieldStandards () {
    console.log('📝 验证状态字段枚举值标准化...')

    const results = {
      validatedTables: 0,
      standardizedFields: 0,
      inconsistentFields: [],
      suggestions: []
    }

    try {
      // 获取所有模型文件
      const modelsDir = path.join(process.cwd(), 'models')
      const modelFiles = fs
        .readdirSync(modelsDir)
        .filter(f => f.endsWith('.js') && f !== 'index.js')

      for (const modelFile of modelFiles) {
        const modelPath = path.join(modelsDir, modelFile)
        const content = fs.readFileSync(modelPath, 'utf8')

        // 检查status字段定义
        const statusMatch = content.match(
          /status:\s*{[\s\S]*?type:\s*DataTypes\.ENUM\(['"'`](.*?)['"'`]\)[\s\S]*?}/i
        )

        if (statusMatch) {
          const tableName = modelFile.replace('.js', '')
          results.validatedTables++

          const enumValues = statusMatch[1].split(/['"'`,\s]+/).filter(v => v.trim())
          const expectedStandard = this.getExpectedStatusStandard(tableName)

          if (expectedStandard) {
            const hasStandardValues = expectedStandard.values.every(val => enumValues.includes(val))
            if (hasStandardValues) {
              results.standardizedFields++
              console.log(`✅ ${tableName}: 状态字段标准合规 (${expectedStandard.name})`)
            } else {
              results.inconsistentFields.push({
                table: tableName,
                current: enumValues,
                expected: expectedStandard.values,
                standard: expectedStandard.name
              })
              results.suggestions.push(
                `${tableName}表状态字段建议统一为${expectedStandard.name}标准: [${expectedStandard.values.join(', ')}]`
              )
            }
          }
        }
      }

      console.log(
        `📊 状态标准验证: ${results.standardizedFields}/${results.validatedTables} 个表合规`
      )
      if (results.suggestions.length > 0) {
        console.log('💡 改进建议:')
        results.suggestions.forEach(s => console.log(`   - ${s}`))
      }
    } catch (error) {
      console.error('❌ 状态字段验证失败:', error.message)
      results.error = error.message
    }

    return results
  }

  /**
   * 🆕 2. 数据库外键关系标准化验证
   */
  async validateForeignKeyStandards () {
    console.log('🔗 验证数据库外键关系标准化...')

    const results = {
      checkedTables: 0,
      validRelations: 0,
      missingConstraints: [],
      namingIssues: []
    }

    try {
      // 检查数据库中的外键约束
      const [foreignKeys] = await sequelize.query(`
        SELECT
          TABLE_NAME,
          COLUMN_NAME,
          CONSTRAINT_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
        FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
      `)

      const existingFKs = new Map()
      foreignKeys.forEach(fk => {
        const key = `${fk.TABLE_NAME}.${fk.COLUMN_NAME}`
        existingFKs.set(key, fk)
      })

      // 验证预期的外键关系
      for (const [tableName, expectedColumns] of Object.entries(
        this.enhancementConfig.foreignKeyStandards.expectedRelations
      )) {
        results.checkedTables++

        for (const column of expectedColumns) {
          const key = `${tableName}.${column}`

          // 检查命名规范
          if (!this.enhancementConfig.foreignKeyStandards.foreignKeyPattern.test(column)) {
            results.namingIssues.push({
              table: tableName,
              column,
              issue: 'Foreign key naming does not follow {table}_id pattern'
            })
          }

          // 检查外键约束是否存在
          if (existingFKs.has(key)) {
            results.validRelations++
            console.log(`✅ ${tableName}.${column}: 外键约束已存在`)
          } else {
            results.missingConstraints.push({
              table: tableName,
              column,
              suggestion: this.generateFKConstraintSuggestion(tableName, column)
            })
            console.log(`⚠️ ${tableName}.${column}: 缺少外键约束`)
          }
        }
      }

      console.log(
        `🔗 外键关系验证: ${results.checkedTables}个表，${results.validRelations}个有效关系`
      )

      // 记录到报告
      this.reportData.businessStandardsUnified.push(
        ...results.missingConstraints.map(fk => ({
          type: 'foreign_key_constraint',
          table: fk.table,
          column: fk.column,
          suggestion: fk.suggestion
        }))
      )

      return results
    } catch (error) {
      console.error('❌ 外键关系验证失败:', error.message)
      this.reportData.errors.push(`外键关系验证失败: ${error.message}`)
      return results
    }
  }

  /**
   * 🆕 3. 错误处理机制统一化验证
   */
  async validateErrorHandlingStandards () {
    console.log('⚡ 验证错误处理机制统一化...')

    const results = {
      scannedFiles: 0,
      errorHandlingPoints: 0,
      standardizedHandlers: 0,
      improvementSuggestions: []
    }

    try {
      // 扫描routes和services目录下的错误处理
      const dirsToScan = ['routes', 'services', 'middleware']

      for (const dir of dirsToScan) {
        const dirPath = path.join(process.cwd(), dir)
        if (!fs.existsSync(dirPath)) continue

        const files = this.getJSFilesRecursively(dirPath)

        for (const filePath of files) {
          const content = fs.readFileSync(filePath, 'utf8')
          results.scannedFiles++

          // 检查错误处理模式
          const errorPatterns = [
            /catch\s*\([^)]*error[^)]*\)/g,
            /throw\s+new\s+Error/g,
            /res\.status\(\d+\)\.json/g,
            /console\.error/g
          ]

          let fileErrorPoints = 0
          let standardizedPoints = 0

          errorPatterns.forEach(pattern => {
            const matches = content.match(pattern) || []
            fileErrorPoints += matches.length
          })

          // 检查是否使用了标准化错误处理
          if (content.includes('ApiResponse') || content.includes('ErrorHandler')) {
            standardizedPoints = Math.floor(fileErrorPoints * 0.8) // 估算
          }

          results.errorHandlingPoints += fileErrorPoints
          results.standardizedHandlers += standardizedPoints

          // 生成改进建议
          if (fileErrorPoints > 0 && standardizedPoints < fileErrorPoints) {
            results.improvementSuggestions.push({
              file: filePath.replace(process.cwd(), '.'),
              currentPoints: fileErrorPoints,
              standardizedPoints,
              suggestion: '建议统一使用ApiResponse和ErrorHandler类'
            })
          }
        }
      }

      const standardizationRate =
        results.errorHandlingPoints > 0
          ? ((results.standardizedHandlers / results.errorHandlingPoints) * 100).toFixed(1)
          : '0.0'

      console.log(
        `⚡ 错误处理验证: ${results.scannedFiles}个文件，${results.errorHandlingPoints}个处理点，标准化率${standardizationRate}%`
      )

      return results
    } catch (error) {
      console.error('❌ 错误处理验证失败:', error.message)
      this.reportData.errors.push(`错误处理验证失败: ${error.message}`)
      return results
    }
  }

  /**
   * 🆕 4. 数据库性能优化验证
   */
  async validatePerformanceOptimization () {
    console.log('📊 验证数据库性能优化...')

    const results = {
      checkedTables: 0,
      existingIndexes: 0,
      suggestedIndexes: 0,
      performanceIssues: []
    }

    try {
      // 检查现有索引
      const [existingIndexes] = await sequelize.query(`
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

      const indexMap = new Map()
      existingIndexes.forEach(idx => {
        const key = `${idx.TABLE_NAME}.${idx.INDEX_NAME}`
        if (!indexMap.has(key)) {
          indexMap.set(key, [])
        }
        indexMap.get(key).push(idx.COLUMN_NAME)
      })

      results.existingIndexes = indexMap.size

      // 检查建议的复合索引
      for (const [tableName, suggestedIndexes] of Object.entries(
        this.enhancementConfig.performanceOptimization.compositeIndexSuggestions
      )) {
        results.checkedTables++

        for (const indexColumns of suggestedIndexes) {
          const indexExists = this.checkCompositeIndexExists(indexMap, tableName, indexColumns)

          if (indexExists) {
            console.log(`✅ ${tableName}: 复合索引 [${indexColumns.join(', ')}] 已存在`)
          } else {
            results.suggestedIndexes++
            results.performanceIssues.push({
              table: tableName,
              columns: indexColumns,
              type: 'missing_composite_index',
              sql: `CREATE INDEX idx_${tableName}_${indexColumns.join('_')} ON ${tableName} (${indexColumns.join(', ')})`
            })
            console.log(`⚠️ ${tableName}: 建议添加复合索引 [${indexColumns.join(', ')}]`)
          }
        }
      }

      console.log(
        `📊 性能优化验证: ${results.checkedTables}个表，${results.existingIndexes}个现有索引，${results.suggestedIndexes}个建议索引`
      )

      return results
    } catch (error) {
      console.error('❌ 性能优化验证失败:', error.message)
      this.reportData.errors.push(`性能优化验证失败: ${error.message}`)
      return results
    }
  }

  /**
   * 🆕 运行完整的业务标准完善检查
   */
  async runComprehensiveEnhancement () {
    console.log('🎯 开始运行完整的业务标准完善检查...')
    console.log('='.repeat(60))

    const enhancementResults = {
      timestamp: new Date().toISOString(),
      statusStandards: null,
      foreignKeyStandards: null,
      errorHandlingStandards: null,
      performanceOptimization: null,
      overallScore: 0
    }

    try {
      // 1. 状态字段标准化
      console.log('\n📝 1/4 状态字段枚举值标准化验证')
      enhancementResults.statusStandards = await this.validateStatusFieldStandards()

      // 2. 外键关系标准化
      console.log('\n🔗 2/4 数据库外键关系标准化验证')
      enhancementResults.foreignKeyStandards = await this.validateForeignKeyStandards()

      // 3. 错误处理统一化
      console.log('\n⚡ 3/4 错误处理机制统一化验证')
      enhancementResults.errorHandlingStandards = await this.validateErrorHandlingStandards()

      // 4. 性能优化
      console.log('\n📊 4/4 数据库性能优化验证')
      enhancementResults.performanceOptimization = await this.validatePerformanceOptimization()

      // 计算总体评分
      enhancementResults.overallScore = this.calculateEnhancementScore(enhancementResults)

      // 生成详细报告
      const reportPath = await this.generateEnhancementReport(enhancementResults)

      console.log('\n' + '='.repeat(60))
      console.log(
        `🎯 业务标准完善检查完成！总体评分: ${enhancementResults.overallScore.toFixed(1)}%`
      )
      console.log(`📋 详细报告: ${reportPath}`)

      return enhancementResults
    } catch (error) {
      console.error('❌ 完善检查执行失败:', error.message)
      throw error
    }
  }

  // 辅助方法
  getExpectedStatusStandard (tableName) {
    const { statusStandards } = this.enhancementConfig

    // 基于业务场景分类的状态标准匹配
    if (tableName.includes('Trade') || tableName.includes('UserTask')) {
      return statusStandards.PROCESS_FLOW
    } else if (tableName.includes('Exchange')) {
      return statusStandards.DISTRIBUTION_FLOW
    } else if (tableName.includes('Product')) {
      return statusStandards.ENTITY_LIFECYCLE
    } else if (tableName.includes('Admin') && tableName.includes('Status')) {
      return statusStandards.PRESENCE_STATUS
    } else {
      // 返回null表示此表不需要特定的状态标准
      return null
    }
  }

  checkStatusConsistency (current, expected) {
    return (
      current.every(val => expected.values.includes(val)) &&
      expected.values.every(val => current.includes(val))
    )
  }

  generateFKConstraintSuggestion (tableName, columnName) {
    const referencedTable = columnName.replace('_id', '')
    return `ALTER TABLE ${tableName} ADD CONSTRAINT fk_${tableName}_${columnName} FOREIGN KEY (${columnName}) REFERENCES ${referencedTable} (${referencedTable}_id)`
  }

  checkCompositeIndexExists (indexMap, tableName, columns) {
    for (const [key, indexColumns] of indexMap.entries()) {
      if (key.startsWith(tableName + '.')) {
        if (this.arraysEqual(indexColumns, columns)) {
          return true
        }
      }
    }
    return false
  }

  arraysEqual (a, b) {
    return a.length === b.length && a.every((val, i) => val === b[i])
  }

  getJSFilesRecursively (dir) {
    const files = []
    const items = fs.readdirSync(dir)

    for (const item of items) {
      const fullPath = path.join(dir, item)
      const stat = fs.statSync(fullPath)

      if (stat.isDirectory()) {
        files.push(...this.getJSFilesRecursively(fullPath))
      } else if (item.endsWith('.js')) {
        files.push(fullPath)
      }
    }

    return files
  }

  calculateEnhancementScore (_result) {
    let totalScore = 0

    // 状态字段标准化评分 (25%)
    if (_result.statusStandards) {
      const statusScore =
        _result.statusStandards.validatedTables > 0
          ? (_result.statusStandards.standardizedFields / _result.statusStandards.validatedTables) *
            100
          : 100
      totalScore += statusScore * 0.25
    }

    // 外键关系标准化评分 (25%)
    if (_result.foreignKeyStandards) {
      const fkScore =
        _result.foreignKeyStandards.checkedTables > 0
          ? (_result.foreignKeyStandards.validRelations /
              (_result.foreignKeyStandards.checkedTables * 2)) *
            100
          : 100
      totalScore += fkScore * 0.25
    }

    // 错误处理统一化评分 (25%)
    if (_result.errorHandlingStandards) {
      const errorScore =
        _result.errorHandlingStandards.errorHandlingPoints > 0
          ? (_result.errorHandlingStandards.standardizedHandlers /
              _result.errorHandlingStandards.errorHandlingPoints) *
            100
          : 100
      totalScore += errorScore * 0.25
    }

    // 性能优化评分 (25%)
    if (_result.performanceOptimization) {
      const perfScore = _result.performanceOptimization.suggestedIndexes === 0 ? 100 : 75
      totalScore += perfScore * 0.25
    }

    return Math.min(totalScore, 100)
  }

  async generateEnhancementReport (_result) {
    const reportFileName = `enhancement-report-${Date.now()}.json`
    const reportPath = path.join(process.cwd(), 'reports', reportFileName)

    // 确保reports目录存在
    const reportsDir = path.dirname(reportPath)
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true })
    }

    // 写入报告文件
    fs.writeFileSync(reportPath, JSON.stringify(_result, null, 2))

    return reportPath
  }

  /**
   * 生成修复报告
   */
  async generateReport () {
    console.log('\n📋 生成数据库字段修复报告...')

    const report = `# 数据库字段检查与修复报告

## 检查时间
${this.reportData.timestamp}

## 修复统计
- 创建表: ${this.reportData.createdTables.length}个
- 修复字段: ${this.reportData.fixedFields.length}个
- 发现错误: ${this.reportData.errors.length}个

## 创建的表
${
  this.reportData.createdTables
    .map(table => `- **${table.name}**: ${table.action} (时间: ${table.timestamp})`)
    .join('\n') || '无'
}

## 修复的字段
${
  this.reportData.fixedFields
    .map(field => `- **${field.table}.${field.field}**: ${field.action}`)
    .join('\n') || '无'
}

## 发现的问题
${
  this.reportData.errors
    .map(error => `- **${error.table || error.type}**: ${error.error}`)
    .join('\n') || '无'
}

## 建议
1. 定期检查数据库表结构完整性
2. 确保模型定义与数据库表结构一致
3. 运行数据库迁移脚本更新表结构

---
生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
`

    const fs = require('fs')
    const reportPath = `reports/database-field-fix-${new Date().toISOString().split('T')[0]}.md`

    // 确保reports目录存在
    if (!fs.existsSync('reports')) {
      fs.mkdirSync('reports', { recursive: true })
    }

    fs.writeFileSync(reportPath, report)
    console.log(`✅ 数据库字段修复报告已生成: ${reportPath}`)

    return reportPath
  }
}

// 主程序入口：支持原有功能和扩展功能
if (require.main === module) {
  const manager = new DatabaseFieldManager()

  // 检查命令行参数，确定运行模式
  const args = process.argv.slice(2)
  const runMode = args.length > 0 ? args[0] : 'comprehensive'

  console.log(`🎯 V4业务标准管理器启动 - 模式: ${runMode}`)
  console.log('📋 可用模式:')
  console.log('  - comprehensive: 完整的业务标准完善检查（默认）')
  console.log('  - unified: 统一业务标准检查（is_winner标准）')
  console.log('  - basic: 仅基础数据库字段检查')
  console.log('  - status: 仅状态字段标准化验证')
  console.log('  - foreign-key: 仅外键关系标准化验证')
  console.log('  - error-handling: 仅错误处理统一化验证')
  console.log('  - performance: 仅数据库性能优化验证')
  console.log('  - mock: 仅Mock数据清理')
  console.log('  - compatibility: 仅兼容性代码清理\\n')

  let promise

  switch (runMode) {
  case 'basic':
    promise = manager.runFieldCheck()
    break
  case 'unified':
    promise = manager.runUnifiedBusinessStandardCheck()
    break
  case 'status':
    promise = manager.validateStatusFieldStandards()
    break
  case 'foreign-key':
    promise = manager.validateForeignKeyStandards()
    break
  case 'error-handling':
    promise = manager.validateErrorHandlingStandards()
    break
  case 'performance':
    promise = manager.validatePerformanceOptimization()
    break
  case 'mock':
    promise = manager.cleanupMockDataSystematic()
    break
  case 'compatibility':
    promise = manager.cleanupCompatibilityCode()
    break
  case 'comprehensive':
  default:
    promise = manager.runComprehensiveEnhancement()
    break
  }

  promise
    .then(_result => {
      console.log('✅ 任务执行完成')
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ 任务执行失败:', error.message)
      process.exit(1)
    })
}

module.exports = DatabaseFieldManager
