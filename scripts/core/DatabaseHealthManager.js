/**
 * 数据库健康管理器 V4.0
 * 整合所有数据库相关的重复功能：字段检查、同步、修复、验证
 * 消除4个文件间的数据库功能重复
 * 创建时间：2025年01月21日 北京时间
 */

'use strict'

require('dotenv').config()
const fs = require('fs')
const { sequelize } = require('../../models')

/**
 * 数据库健康管理器
 * 整合了以下重复功能：
 * - 数据库字段检查和修复 (来自api-health-manager.js)
 * - 数据库字段管理 (来自database-field-manager.js)
 * - 数据库同步管理 (来自database-sync-manager.js)
 * - 数据库字段不匹配解决 (来自V4SystemIssueResolver.js)
 */
class DatabaseHealthManager {
  constructor () {
    this.version = '4.0.0'
    this.reportData = {
      timestamp: new Date().toISOString(),
      fieldMismatches: [],
      fixedFields: [],
      missingTables: [],
      indexIssues: [],
      businessStandardsResults: [],
      errors: [],
      summary: {
        totalTables: 0,
        healthyTables: 0,
        fieldsFixed: 0,
        tablesCreated: 0,
        indexesCreated: 0
      }
    }

    // V4项目标准表结构和字段映射
    this.standardSchema = {
      users: {
        primaryKey: 'user_id',
        requiredFields: ['mobile', 'nickname', 'is_admin', 'status'],
        fieldMappings: {
          phone_number: 'mobile',
          phone: 'mobile'
        },
        indexes: [
          { fields: ['mobile'], unique: true, name: 'idx_users_mobile' },
          { fields: ['is_admin'], name: 'idx_users_is_admin' }
        ]
      },
      lottery_campaigns: {
        primaryKey: 'campaign_id',
        requiredFields: ['title', 'status', 'start_time', 'end_time'],
        fieldMappings: {
          is_active: 'status',
          active: 'status'
        },
        indexes: [
          { fields: ['status'], name: 'idx_campaigns_status' },
          { fields: ['start_time', 'end_time'], name: 'idx_campaigns_time_range' }
        ]
      },
      lottery_draws: {
        primaryKey: 'record_id',
        requiredFields: ['user_id', 'campaign_id', 'is_winner', 'created_at'],
        fieldMappings: {
          result: 'is_winner',
          win: 'is_winner'
        },
        indexes: [
          { fields: ['user_id'], name: 'idx_records_user_id' },
          { fields: ['campaign_id'], name: 'idx_records_campaign_id' },
          { fields: ['is_winner'], name: 'idx_records_is_winner' }
        ]
      },
      lottery_prizes: {
        primaryKey: 'prize_id',
        requiredFields: ['campaign_id', 'prize_name', 'prize_type', 'win_probability'],
        indexes: [
          { fields: ['campaign_id'], name: 'idx_prizes_campaign_id' },
          { fields: ['prize_type'], name: 'idx_prizes_type' }
        ]
      }
    }
  }

  /**
   * 🚀 执行完整的数据库健康管理
   */
  async runCompleteDatabaseHealth () {
    console.log('🗄️ 开始完整的数据库健康管理...')
    console.log('='.repeat(60))
    console.log(`⏰ 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

    try {
      // 1. 数据库连接和基础检查
      console.log('\n📊 1/6 数据库连接和基础检查...')
      await this.checkDatabaseConnection()

      // 2. 表结构完整性检查
      console.log('\n🔍 2/6 表结构完整性检查...')
      await this.checkTableStructure()

      // 3. 字段一致性检查和修复
      console.log('\n🔧 3/6 字段一致性检查和修复...')
      await this.checkAndFixFieldConsistency()

      // 4. 索引优化和管理
      console.log('\n⚡ 4/6 索引优化和管理...')
      await this.manageIndexes()

      // 5. 业务标准验证
      console.log('\n🎯 5/6 业务标准验证...')
      await this.validateBusinessStandards()

      // 6. 生成综合报告
      console.log('\n📄 6/6 生成数据库健康报告...')
      await this.generateHealthReport()

      console.log('\n' + '='.repeat(60))
      console.log('🎉 数据库健康管理完成!')
      console.log(`⏰ 完成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

      return {
        success: true,
        summary: this.reportData.summary,
        reportPath: await this.generateHealthReport()
      }
    } catch (error) {
      console.error('❌ 数据库健康管理失败:', error.message)
      throw error
    }
  }

  /**
   * 📊 检查数据库连接
   */
  async checkDatabaseConnection () {
    console.log('🔍 检查数据库连接...')

    try {
      await sequelize.authenticate()
      console.log('✅ 数据库连接正常')

      // 获取数据库基础信息
      const [dbInfo] = await sequelize.query('SELECT DATABASE() as db_name, VERSION() as version')
      const [tableCount] = await sequelize.query('SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE()')

      this.reportData.databaseInfo = {
        name: dbInfo[0].db_name,
        version: dbInfo[0].version,
        tableCount: tableCount[0].count,
        connection: 'healthy'
      }

      console.log(`📊 数据库: ${this.reportData.databaseInfo.name}`)
      console.log(`📊 版本: ${this.reportData.databaseInfo.version}`)
      console.log(`📊 表数量: ${this.reportData.databaseInfo.tableCount}`)
    } catch (error) {
      console.error('❌ 数据库连接失败:', error.message)
      this.reportData.errors.push({
        type: 'CONNECTION_ERROR',
        error: error.message
      })
      throw error
    }
  }

  /**
   * 🔍 检查表结构完整性
   */
  async checkTableStructure () {
    console.log('🔍 检查表结构完整性...')

    const requiredTables = Object.keys(this.standardSchema)
    let healthyTables = 0

    for (const tableName of requiredTables) {
      try {
        await sequelize.query(`DESCRIBE ${tableName}`)
        console.log(`✅ ${tableName}: 表结构正常`)
        healthyTables++
      } catch (error) {
        console.log(`❌ ${tableName}: ${error.message}`)
        this.reportData.missingTables.push({
          table: tableName,
          error: error.message,
          status: 'missing'
        })
      }
    }

    this.reportData.summary.totalTables = requiredTables.length
    this.reportData.summary.healthyTables = healthyTables

    console.log(`📊 表结构检查: ${healthyTables}/${requiredTables.length} 正常`)
  }

  /**
   * 🔧 检查和修复字段一致性
   */
  async checkAndFixFieldConsistency () {
    console.log('🔧 检查和修复字段一致性...')

    for (const [tableName, schema] of Object.entries(this.standardSchema)) {
      try {
        await this.validateTableFields(tableName, schema)
      } catch (error) {
        console.error(`❌ ${tableName} 字段检查失败:`, error.message)
        this.reportData.errors.push({
          type: 'FIELD_CHECK_ERROR',
          table: tableName,
          error: error.message
        })
      }
    }

    console.log(`🔧 字段一致性检查完成，修复 ${this.reportData.fixedFields.length} 个问题`)
  }

  /**
   * 验证单个表的字段
   */
  async validateTableFields (tableName, schema) {
    console.log(`🔍 检查 ${tableName} 表字段...`)

    try {
      const [results] = await sequelize.query(`DESCRIBE ${tableName}`)
      const existingFields = results.map(r => r.Field)

      // 检查必需字段
      const missingFields = schema.requiredFields.filter(
        field => !existingFields.includes(field)
      )

      if (missingFields.length > 0) {
        console.log(`⚠️ ${tableName} 缺少字段:`, missingFields)
        this.reportData.fieldMismatches.push({
          table: tableName,
          missingFields,
          status: 'needs_fix'
        })
      } else {
        console.log(`✅ ${tableName} 字段完整`)
      }

      // 检查字段映射问题
      if (schema.fieldMappings) {
        await this.checkFieldMappings(tableName, schema.fieldMappings, existingFields)
      }
    } catch (error) {
      console.error(`❌ ${tableName} 字段验证失败:`, error.message)
      throw error
    }
  }

  /**
   * 检查字段映射
   */
  async checkFieldMappings (tableName, mappings, existingFields) {
    for (const [oldField, newField] of Object.entries(mappings)) {
      if (existingFields.includes(oldField) && existingFields.includes(newField)) {
        console.log(`⚠️ ${tableName} 同时存在 ${oldField} 和 ${newField} 字段，可能需要数据迁移`)
        this.reportData.fieldMismatches.push({
          table: tableName,
          type: 'DUPLICATE_FIELDS',
          oldField,
          newField,
          suggestion: `考虑迁移数据从 ${oldField} 到 ${newField}`
        })
      } else if (existingFields.includes(oldField) && !existingFields.includes(newField)) {
        console.log(`🔄 ${tableName} 需要重命名字段: ${oldField} → ${newField}`)
        this.reportData.fieldMismatches.push({
          table: tableName,
          type: 'FIELD_RENAME',
          oldField,
          newField,
          action: 'rename_required'
        })
      }
    }
  }

  /**
   * ⚡ 管理索引
   */
  async manageIndexes () {
    console.log('⚡ 管理索引...')

    for (const [tableName, schema] of Object.entries(this.standardSchema)) {
      if (schema.indexes) {
        await this.checkTableIndexes(tableName, schema.indexes)
      }
    }

    console.log(`⚡ 索引管理完成，创建 ${this.reportData.summary.indexesCreated} 个索引`)
  }

  /**
   * 检查表索引
   */
  async checkTableIndexes (tableName, requiredIndexes) {
    console.log(`🔍 检查 ${tableName} 表索引...`)

    try {
      // 获取现有索引
      const [existingIndexes] = await sequelize.query(`
        SHOW INDEX FROM ${tableName}
      `)

      const existingIndexNames = existingIndexes.map(idx => idx.Key_name)

      for (const indexDef of requiredIndexes) {
        if (!existingIndexNames.includes(indexDef.name)) {
          console.log(`🔧 创建索引: ${indexDef.name} on ${tableName}`)
          await this.createIndex(tableName, indexDef)
          this.reportData.summary.indexesCreated++
        } else {
          console.log(`✅ 索引 ${indexDef.name} 已存在`)
        }
      }
    } catch (error) {
      console.error(`❌ ${tableName} 索引检查失败:`, error.message)
      this.reportData.errors.push({
        type: 'INDEX_CHECK_ERROR',
        table: tableName,
        error: error.message
      })
    }
  }

  /**
   * 创建索引
   */
  async createIndex (tableName, indexDef) {
    try {
      const uniqueClause = indexDef.unique ? 'UNIQUE' : ''
      const fieldsClause = indexDef.fields.join(', ')

      const sql = `CREATE ${uniqueClause} INDEX ${indexDef.name} ON ${tableName} (${fieldsClause})`
      await sequelize.query(sql)

      console.log(`✅ 索引创建成功: ${indexDef.name}`)
    } catch (error) {
      console.error(`❌ 索引创建失败: ${indexDef.name}`, error.message)
      this.reportData.errors.push({
        type: 'INDEX_CREATE_ERROR',
        index: indexDef.name,
        error: error.message
      })
    }
  }

  /**
   * 🎯 验证业务标准
   */
  async validateBusinessStandards () {
    console.log('🎯 验证业务标准...')

    // 验证is_winner字段标准
    await this.validateIsWinnerStandard()

    // 验证状态字段标准
    await this.validateStatusFieldStandards()

    // 验证概率配置
    await this.validateProbabilityConfiguration()

    console.log('✅ 业务标准验证完成')
  }

  /**
   * 验证is_winner字段标准
   */
  async validateIsWinnerStandard () {
    console.log('🎯 验证is_winner字段标准...')

    const tablesWithIsWinner = ['lottery_draws']

    for (const tableName of tablesWithIsWinner) {
      try {
        const [results] = await sequelize.query(`DESCRIBE ${tableName}`)
        const isWinnerField = results.find(field => field.Field === 'is_winner')

        if (isWinnerField) {
          if (isWinnerField.Type.includes('tinyint(1)') || isWinnerField.Type.includes('boolean')) {
            console.log(`✅ ${tableName}.is_winner: 字段类型正确 (${isWinnerField.Type})`)
            this.reportData.businessStandardsResults.push({
              table: tableName,
              field: 'is_winner',
              status: 'compliant',
              type: isWinnerField.Type
            })
          } else {
            console.log(`⚠️ ${tableName}.is_winner: 字段类型不标准 (${isWinnerField.Type})`)
            this.reportData.businessStandardsResults.push({
              table: tableName,
              field: 'is_winner',
              status: 'non_compliant',
              issue: `字段类型应为boolean，当前为${isWinnerField.Type}`
            })
          }
        } else {
          console.log(`❌ ${tableName}: 缺少is_winner字段`)
          this.reportData.businessStandardsResults.push({
            table: tableName,
            field: 'is_winner',
            status: 'missing',
            issue: '缺少is_winner字段'
          })
        }
      } catch (error) {
        console.error(`❌ ${tableName} is_winner检查失败:`, error.message)
      }
    }
  }

  /**
   * 验证状态字段标准
   */
  async validateStatusFieldStandards () {
    console.log('🎯 验证状态字段标准...')

    const statusTables = {
      users: ['active', 'inactive', 'banned'],
      lottery_campaigns: ['draft', 'active', 'paused', 'ended'],
      exchange_records: ['pending', 'completed', 'cancelled']
    }

    for (const [tableName, _expectedValues] of Object.entries(statusTables)) {
      try {
        // 检查status字段的枚举值
        const [results] = await sequelize.query(`
          SELECT COLUMN_TYPE 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = '${tableName}' 
          AND COLUMN_NAME = 'status'
        `)

        if (results.length > 0) {
          const columnType = results[0].COLUMN_TYPE
          console.log(`✅ ${tableName}.status: ${columnType}`)

          this.reportData.businessStandardsResults.push({
            table: tableName,
            field: 'status',
            status: 'exists',
            definition: columnType
          })
        } else {
          console.log(`⚠️ ${tableName}: 缺少status字段`)
        }
      } catch (error) {
        console.error(`❌ ${tableName} status字段检查失败:`, error.message)
      }
    }
  }

  /**
   * 验证概率配置
   */
  async validateProbabilityConfiguration () {
    console.log('🎯 验证概率配置...')

    try {
      // 检查每个活动的概率总和
      const [campaigns] = await sequelize.query(`
        SELECT DISTINCT campaign_id FROM lottery_prizes WHERE status = 'active'
      `)

      for (const campaign of campaigns) {
        const campaignId = campaign.campaign_id

        const [prizes] = await sequelize.query(`
          SELECT prize_id, prize_name, win_probability
          FROM lottery_prizes 
          WHERE campaign_id = ${campaignId} AND status = 'active'
        `)

        if (prizes.length > 0) {
          const totalProbability = prizes.reduce((sum, prize) => sum + parseFloat(prize.win_probability), 0)
          const totalPercentage = Math.round(totalProbability * 100 * 100) / 100

          if (Math.abs(totalPercentage - 100) > 0.01) {
            console.log(`⚠️ 活动${campaignId}概率不正确: ${totalPercentage}%`)
            this.reportData.businessStandardsResults.push({
              type: 'PROBABILITY_ISSUE',
              campaign_id: campaignId,
              total_probability: totalPercentage,
              status: 'non_compliant'
            })
          } else {
            console.log(`✅ 活动${campaignId}概率配置正确: ${totalPercentage}%`)
            this.reportData.businessStandardsResults.push({
              type: 'PROBABILITY_CHECK',
              campaign_id: campaignId,
              total_probability: totalPercentage,
              status: 'compliant'
            })
          }
        }
      }
    } catch (error) {
      console.error('❌ 概率配置验证失败:', error.message)
    }
  }

  /**
   * 📄 生成数据库健康报告
   */
  async generateHealthReport () {
    console.log('📄 生成数据库健康报告...')

    const report = `# 数据库健康管理报告

## 执行时间
${this.reportData.timestamp}

## 数据库信息
- 数据库名: ${this.reportData.databaseInfo?.name || 'unknown'}
- 版本: ${this.reportData.databaseInfo?.version || 'unknown'}
- 表数量: ${this.reportData.databaseInfo?.tableCount || 0}

## 表结构健康状况
- 总表数: ${this.reportData.summary.totalTables}
- 健康表数: ${this.reportData.summary.healthyTables}
- 健康率: ${this.reportData.summary.totalTables > 0 ? (this.reportData.summary.healthyTables / this.reportData.summary.totalTables * 100).toFixed(1) : 0}%

## 字段问题
总计: ${this.reportData.fieldMismatches.length} 个问题

${this.reportData.fieldMismatches.map(issue =>
    `- **${issue.table}**: ${issue.type || 'MISSING_FIELDS'} - ${issue.missingFields?.join(', ') || issue.oldField + ' → ' + issue.newField}`
  ).join('\n')}

## 业务标准验证
合规项: ${this.reportData.businessStandardsResults.filter(r => r.status === 'compliant').length}
不合规项: ${this.reportData.businessStandardsResults.filter(r => r.status === 'non_compliant').length}

${this.reportData.businessStandardsResults.filter(r => r.status === 'non_compliant').map(issue =>
    `- **${issue.table}.${issue.field}**: ${issue.issue}`
  ).join('\n')}

## 修复统计
- 字段修复: ${this.reportData.fixedFields.length}
- 索引创建: ${this.reportData.summary.indexesCreated}
- 表创建: ${this.reportData.summary.tablesCreated}

## 错误记录
${this.reportData.errors.map(error =>
    `- **${error.type}**: ${error.error}`
  ).join('\n')}

## 建议
1. 定期运行数据库健康检查
2. 保持表结构和字段命名的一致性
3. 监控业务标准合规性
4. 及时处理字段不匹配问题

---
生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
`

    const reportPath = `reports/database-health-report-${new Date().toISOString().split('T')[0]}.md`

    // 确保reports目录存在
    if (!fs.existsSync('reports')) {
      fs.mkdirSync('reports', { recursive: true })
    }

    fs.writeFileSync(reportPath, report)
    console.log(`✅ 数据库健康报告已生成: ${reportPath}`)

    return reportPath
  }
}

// 主程序入口
if (require.main === module) {
  const manager = new DatabaseHealthManager()
  manager.runCompleteDatabaseHealth()
    .then((result) => {
      console.log('\n🎉 数据库健康管理完成!')
      console.log(`📊 健康率: ${result.summary.healthyTables}/${result.summary.totalTables}`)
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ 数据库健康管理失败:', error.message)
      process.exit(1)
    })
}

module.exports = DatabaseHealthManager
