/**
 * 数据库同步管理模块
 * 系统性解决数据库字段不匹配、表结构不同步、索引缺失等问题
 * 基于现有database-field-manager.js扩展
 * 创建时间：2025年01月21日 北京时间
 */

'use strict'

require('dotenv').config()
const { sequelize } = require('../../models')
const fs = require('fs')
const path = require('path')

/**
 * 数据库同步管理器
 */
class DatabaseSyncManager {
  constructor () {
    this.syncReport = {
      timestamp: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
      databaseInfo: {},
      fieldMismatches: [],
      missingTables: [],
      indexIssues: [],
      fixedIssues: [],
      errors: [],
      summary: {
        totalTables: 0,
        fieldsFixed: 0,
        tablesCreated: 0,
        indexesCreated: 0
      }
    }

    // V4项目的标准表结构定义
    this.standardTables = {
      users: {
        primaryKey: 'user_id',
        requiredFields: ['mobile', 'nickname', 'is_admin', 'status'],
        fieldMappings: {
          phone_number: 'mobile', // 统一使用mobile字段
          phone: 'mobile'
        }
      },
      lottery_campaigns: {
        primaryKey: 'campaign_id',
        requiredFields: ['title', 'status', 'start_time', 'end_time'],
        fieldMappings: {
          is_active: 'status', // 统一使用status字段
          active: 'status'
        }
      },
      lottery_records: {
        primaryKey: 'record_id',
        requiredFields: ['user_id', 'campaign_id', 'is_winner', 'created_at'],
        fieldMappings: {
          result: 'is_winner', // 统一使用is_winner字段
          win: 'is_winner'
        }
      },
      lottery_prizes: {
        primaryKey: 'prize_id',
        requiredFields: ['campaign_id', 'prize_name', 'prize_type', 'quantity']
      }
    }

    // 必需的索引定义
    this.requiredIndexes = {
      users: [
        { fields: ['mobile'], unique: true, name: 'idx_users_mobile' },
        { fields: ['is_admin'], name: 'idx_users_is_admin' },
        { fields: ['status'], name: 'idx_users_status' }
      ],
      lottery_campaigns: [
        { fields: ['status'], name: 'idx_campaigns_status' },
        { fields: ['start_time', 'end_time'], name: 'idx_campaigns_time_range' }
      ],
      lottery_records: [
        { fields: ['user_id'], name: 'idx_records_user_id' },
        { fields: ['campaign_id'], name: 'idx_records_campaign_id' },
        { fields: ['is_winner'], name: 'idx_records_is_winner' },
        { fields: ['created_at'], name: 'idx_records_created_at' }
      ]
    }
  }

  /**
   * 执行完整的数据库同步
   */
  async runDatabaseSync () {
    console.log('🗄️ 开始数据库同步管理...')
    console.log(`⏰ 同步时间: ${this.syncReport.timestamp}`)
    console.log('🎯 目标数据库: restaurant_points_dev (统一数据库)')

    try {
      // 1. 检查数据库连接和基础信息
      await this.checkDatabaseConnection()

      // 2. 检查表结构和字段匹配
      await this.checkTableStructures()

      // 3. 修复字段不匹配问题
      await this.fixFieldMismatches()

      // 4. 创建缺失的表和字段
      await this.createMissingStructures()

      // 5. 检查和创建必需的索引
      await this.checkAndCreateIndexes()

      // 6. 验证同步结果
      await this.verifySyncResults()

      // 7. 生成同步报告
      await this.generateSyncReport()

      console.log('\n🎉 数据库同步管理完成!')
      return this.syncReport
    } catch (error) {
      console.error('❌ 数据库同步失败:', error.message)
      this.syncReport.errors.push({
        stage: 'general',
        error: error.message,
        timestamp: new Date().toISOString()
      })
      throw error
    }
  }

  /**
   * 检查数据库连接和基础信息
   */
  async checkDatabaseConnection () {
    console.log('\n📡 检查数据库连接和基础信息...')

    try {
      // 测试连接
      await sequelize.authenticate()
      console.log('✅ 数据库连接成功')

      // 获取数据库信息
      const [dbInfo] = await sequelize.query('SELECT DATABASE() as db_name, VERSION() as version')
      const [tableCount] = await sequelize.query('SHOW TABLES')

      this.syncReport.databaseInfo = {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: dbInfo[0].db_name,
        version: dbInfo[0].version,
        tableCount: tableCount.length,
        connectionStatus: 'connected'
      }

      console.log(`📊 数据库: ${this.syncReport.databaseInfo.database}`)
      console.log(
        `🖥️ 服务器: ${this.syncReport.databaseInfo.host}:${this.syncReport.databaseInfo.port}`
      )
      console.log(`📈 版本: ${this.syncReport.databaseInfo.version}`)
      console.log(`📋 表数量: ${this.syncReport.databaseInfo.tableCount}`)

      this.syncReport.summary.totalTables = tableCount.length
    } catch (error) {
      console.error('❌ 数据库连接检查失败:', error.message)
      this.syncReport.databaseInfo.connectionStatus = 'failed'
      throw error
    }
  }

  /**
   * 检查表结构和字段匹配
   */
  async checkTableStructures () {
    console.log('\n🔍 检查表结构和字段匹配...')

    for (const [tableName, tableConfig] of Object.entries(this.standardTables)) {
      try {
        console.log(`\n📋 检查表: ${tableName}`)

        // 检查表是否存在
        const [tableExists] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`)

        if (tableExists.length === 0) {
          console.log(`⚠️ 表 ${tableName} 不存在`)
          this.syncReport.missingTables.push({
            tableName,
            config: tableConfig
          })
          continue
        }

        // 检查字段结构
        const [fields] = await sequelize.query(`DESCRIBE ${tableName}`)
        const fieldNames = fields.map(field => field.Field)

        console.log(
          `📊 ${tableName} 当前字段: ${fieldNames.slice(0, 5).join(', ')}${fieldNames.length > 5 ? '...' : ''}`
        )

        // 检查必需字段
        for (const requiredField of tableConfig.requiredFields) {
          if (!fieldNames.includes(requiredField)) {
            console.log(`❌ 缺失字段: ${tableName}.${requiredField}`)
            this.syncReport.fieldMismatches.push({
              table: tableName,
              missingField: requiredField,
              type: 'missing_required_field'
            })
          }
        }

        // 检查字段映射问题
        if (tableConfig.fieldMappings) {
          for (const [wrongField, correctField] of Object.entries(tableConfig.fieldMappings)) {
            if (fieldNames.includes(wrongField) && !fieldNames.includes(correctField)) {
              console.log(`🔄 字段映射问题: ${tableName}.${wrongField} → ${correctField}`)
              this.syncReport.fieldMismatches.push({
                table: tableName,
                wrongField,
                correctField,
                type: 'field_mapping_issue'
              })
            }
          }
        }

        console.log(`✅ ${tableName} 结构检查完成`)
      } catch (error) {
        console.error(`❌ 检查表 ${tableName} 失败:`, error.message)
        this.syncReport.errors.push({
          stage: 'structure_check',
          table: tableName,
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
    }
  }

  /**
   * 修复字段不匹配问题
   */
  async fixFieldMismatches () {
    console.log('\n🔧 修复字段不匹配问题...')

    if (this.syncReport.fieldMismatches.length === 0) {
      console.log('✅ 未发现字段不匹配问题')
      return
    }

    for (const mismatch of this.syncReport.fieldMismatches) {
      try {
        console.log(`\n🔨 修复: ${mismatch.table} - ${mismatch.type}`)

        if (mismatch.type === 'missing_required_field') {
          // 添加缺失的必需字段
          await this.addMissingField(mismatch.table, mismatch.missingField)
        } else if (mismatch.type === 'field_mapping_issue') {
          // 修复字段映射问题
          await this.fixFieldMapping(mismatch.table, mismatch.wrongField, mismatch.correctField)
        }

        this.syncReport.fixedIssues.push({
          type: 'field_mismatch',
          details: mismatch,
          timestamp: new Date().toISOString()
        })

        this.syncReport.summary.fieldsFixed++
        console.log(`✅ 修复完成: ${mismatch.table}`)
      } catch (error) {
        console.error(`❌ 修复失败: ${mismatch.table}`, error.message)
        this.syncReport.errors.push({
          stage: 'field_fix',
          mismatch,
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
    }
  }

  /**
   * 添加缺失字段
   */
  async addMissingField (tableName, fieldName) {
    const fieldDefinitions = {
      mobile: 'VARCHAR(20) NOT NULL COMMENT "手机号码"',
      is_admin: 'BOOLEAN DEFAULT FALSE COMMENT "是否管理员"',
      status: 'VARCHAR(20) DEFAULT "active" COMMENT "状态"',
      is_winner: 'BOOLEAN DEFAULT FALSE COMMENT "是否中奖"',
      nickname: 'VARCHAR(50) DEFAULT "" COMMENT "昵称"'
    }

    const fieldDef = fieldDefinitions[fieldName] || 'TEXT COMMENT "自动添加字段"'
    const sql = `ALTER TABLE ${tableName} ADD COLUMN ${fieldName} ${fieldDef}`

    console.log(`📝 执行SQL: ${sql}`)
    await sequelize.query(sql)
    console.log(`✅ 已添加字段: ${tableName}.${fieldName}`)
  }

  /**
   * 修复字段映射问题
   */
  async fixFieldMapping (tableName, wrongField, correctField) {
    // 检查正确字段是否已存在
    const [fields] = await sequelize.query(`DESCRIBE ${tableName}`)
    const fieldNames = fields.map(field => field.Field)

    if (!fieldNames.includes(correctField)) {
      // 重命名字段
      const wrongFieldInfo = fields.find(f => f.Field === wrongField)
      const sql = `ALTER TABLE ${tableName} CHANGE ${wrongField} ${correctField} ${wrongFieldInfo.Type} ${wrongFieldInfo.Null === 'YES' ? 'NULL' : 'NOT NULL'}`

      console.log(`📝 执行字段重命名: ${sql}`)
      await sequelize.query(sql)
      console.log(`✅ 字段重命名: ${tableName}.${wrongField} → ${correctField}`)
    } else {
      // 复制数据然后删除错误字段
      const sql1 = `UPDATE ${tableName} SET ${correctField} = ${wrongField} WHERE ${correctField} IS NULL OR ${correctField} = ''`
      const sql2 = `ALTER TABLE ${tableName} DROP COLUMN ${wrongField}`

      console.log(`📝 执行数据复制: ${sql1}`)
      await sequelize.query(sql1)

      console.log(`📝 执行字段删除: ${sql2}`)
      await sequelize.query(sql2)

      console.log(`✅ 字段映射修复: ${tableName}.${wrongField} → ${correctField}`)
    }
  }

  /**
   * 创建缺失的表和结构
   */
  async createMissingStructures () {
    console.log('\n🏗️ 创建缺失的表和结构...')

    if (this.syncReport.missingTables.length === 0) {
      console.log('✅ 所有必需表都已存在')
      return
    }

    for (const missingTable of this.syncReport.missingTables) {
      try {
        console.log(`\n📋 创建表: ${missingTable.tableName}`)
        await this.createTable(missingTable.tableName, missingTable.config)

        this.syncReport.fixedIssues.push({
          type: 'table_creation',
          tableName: missingTable.tableName,
          timestamp: new Date().toISOString()
        })

        this.syncReport.summary.tablesCreated++
        console.log(`✅ 表创建完成: ${missingTable.tableName}`)
      } catch (error) {
        console.error(`❌ 创建表失败: ${missingTable.tableName}`, error.message)
        this.syncReport.errors.push({
          stage: 'table_creation',
          tableName: missingTable.tableName,
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
    }
  }

  /**
   * 创建表
   */
  async createTable (tableName, _config) {
    const tableDefinitions = {
      users: `
        CREATE TABLE users (
          user_id INT PRIMARY KEY AUTO_INCREMENT,
          mobile VARCHAR(20) UNIQUE NOT NULL COMMENT '手机号码',
          nickname VARCHAR(50) DEFAULT '' COMMENT '昵称',
          is_admin BOOLEAN DEFAULT FALSE COMMENT '是否管理员',
          status VARCHAR(20) DEFAULT 'active' COMMENT '状态',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户表'
      `,
      lottery_campaigns: `
        CREATE TABLE lottery_campaigns (
          campaign_id INT PRIMARY KEY AUTO_INCREMENT,
          title VARCHAR(100) NOT NULL COMMENT '活动标题',
          description TEXT COMMENT '活动描述',
          status VARCHAR(20) DEFAULT 'active' COMMENT '状态',
          start_time TIMESTAMP NULL COMMENT '开始时间',
          end_time TIMESTAMP NULL COMMENT '结束时间',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='抽奖活动表'
      `
    }

    const sql = tableDefinitions[tableName]
    if (!sql) {
      throw new Error(`未定义的表结构: ${tableName}`)
    }

    console.log(`📝 执行表创建SQL: ${tableName}`)
    await sequelize.query(sql)
  }

  /**
   * 检查和创建必需的索引
   */
  async checkAndCreateIndexes () {
    console.log('\n📑 检查和创建必需的索引...')

    for (const [tableName, indexes] of Object.entries(this.requiredIndexes)) {
      try {
        // 检查表是否存在
        const [tableExists] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`)
        if (tableExists.length === 0) {
          console.log(`⚠️ 跳过索引检查，表不存在: ${tableName}`)
          continue
        }

        console.log(`\n📑 检查表 ${tableName} 的索引...`)

        // 获取现有索引
        const [existingIndexes] = await sequelize.query(`SHOW INDEX FROM ${tableName}`)
        const existingIndexNames = existingIndexes.map(idx => idx.Key_name)

        for (const indexConfig of indexes) {
          if (!existingIndexNames.includes(indexConfig.name)) {
            console.log(`📝 创建索引: ${indexConfig.name}`)
            await this.createIndex(tableName, indexConfig)

            this.syncReport.summary.indexesCreated++
            this.syncReport.fixedIssues.push({
              type: 'index_creation',
              tableName,
              indexName: indexConfig.name,
              timestamp: new Date().toISOString()
            })
          } else {
            console.log(`✅ 索引已存在: ${indexConfig.name}`)
          }
        }
      } catch (error) {
        console.error(`❌ 处理表 ${tableName} 索引失败:`, error.message)
        this.syncReport.errors.push({
          stage: 'index_check',
          tableName,
          error: error.message,
          timestamp: new Date().toISOString()
        })
      }
    }
  }

  /**
   * 创建索引
   */
  async createIndex (tableName, indexConfig) {
    const fields = indexConfig.fields.join(', ')
    const uniqueStr = indexConfig.unique ? 'UNIQUE' : ''
    const sql = `CREATE ${uniqueStr} INDEX ${indexConfig.name} ON ${tableName} (${fields})`

    console.log(`📝 执行索引创建: ${sql}`)
    await sequelize.query(sql)
    console.log(`✅ 索引创建完成: ${indexConfig.name}`)
  }

  /**
   * 验证同步结果
   */
  async verifySyncResults () {
    console.log('\n✅ 验证同步结果...')

    // 验证关键表和字段
    const verificationChecks = [
      { table: 'users', field: 'mobile', description: '用户表mobile字段' },
      { table: 'lottery_campaigns', field: 'status', description: '活动表status字段' },
      { table: 'lottery_records', field: 'is_winner', description: '记录表is_winner字段' }
    ]

    for (const check of verificationChecks) {
      try {
        const [result] = await sequelize.query(
          `SELECT COUNT(*) as count FROM information_schema.columns WHERE table_schema = '${this.syncReport.databaseInfo.database}' AND table_name = '${check.table}' AND column_name = '${check.field}'`
        )

        if (result[0].count > 0) {
          console.log(`✅ ${check.description}: 验证通过`)
        } else {
          console.log(`⚠️ ${check.description}: 验证失败`)
        }
      } catch (error) {
        console.warn(`⚠️ 验证失败: ${check.description}`, error.message)
      }
    }

    console.log('✅ 同步结果验证完成')
  }

  /**
   * 生成同步报告
   */
  async generateSyncReport () {
    const reportPath = `reports/database-sync-${new Date().toISOString().split('T')[0]}.json`

    // 确保reports目录存在
    const reportsDir = path.dirname(reportPath)
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true })
    }

    // 写入报告
    fs.writeFileSync(reportPath, JSON.stringify(this.syncReport, null, 2), 'utf8')

    console.log(`\n📊 同步报告已生成: ${reportPath}`)
    console.log('\n📋 === 数据库同步摘要 ===')
    console.log(`⏰ 同步时间: ${this.syncReport.timestamp}`)
    console.log(`🗄️ 数据库: ${this.syncReport.databaseInfo.database}`)
    console.log(`📋 总表数: ${this.syncReport.summary.totalTables}`)
    console.log(`🔧 修复字段: ${this.syncReport.summary.fieldsFixed}`)
    console.log(`🏗️ 创建表: ${this.syncReport.summary.tablesCreated}`)
    console.log(`📑 创建索引: ${this.syncReport.summary.indexesCreated}`)
    console.log(`❌ 错误数量: ${this.syncReport.errors.length}`)

    if (this.syncReport.fixedIssues.length > 0) {
      console.log('\n✅ 修复的问题:')
      this.syncReport.fixedIssues.forEach(issue => {
        console.log(`  - ${issue.type}: ${issue.tableName || issue.details?.table || 'N/A'}`)
      })
    }
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  const syncManager = new DatabaseSyncManager()

  syncManager
    .runDatabaseSync()
    .then(() => {
      console.log('\n🎉 数据库同步任务完成!')
      console.log('💡 请检查reports/目录中的同步报告')
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ 数据库同步任务失败:', error.message)
      process.exit(1)
    })
}

module.exports = DatabaseSyncManager
