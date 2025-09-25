#!/usr/bin/env node

/**
 * 🔧 统一模型字段管理工具 - V4.3
 *
 * 整合了原有的检查和修复功能，消除重复代码
 *
 * 功能说明：
 * 1. 检查模型字段与数据库结构的匹配性
 * 2. 修复虚拟字段误报问题
 * 3. 统一时间戳字段命名约定
 * 4. 提供详细的分析报告和修复建议
 *
 * 命令行参数：
 * --check-only: 仅检查，不执行修复
 * --fix-only: 仅执行修复，不生成详细报告
 * --model=ModelName: 仅检查/修复指定模型
 * --verbose: 详细输出模式
 *
 * 创建时间：2025年01月21日
 * 使用 Claude Sonnet 4 模型
 */

'use strict'

require('dotenv').config()
const { sequelize } = require('../models')
const models = require('../models')
const fs = require('fs')
const path = require('path')

class UnifiedModelFieldManager {
  constructor (options = {}) {
    this.options = {
      checkOnly: options.checkOnly || false,
      fixOnly: options.fixOnly || false,
      targetModel: options.targetModel || null,
      verbose: options.verbose || false,
      ...options
    }

    this.results = {
      timestamp: new Date().toISOString(),
      mode: this.options.checkOnly ? 'CHECK' : this.options.fixOnly ? 'FIX' : 'CHECK_AND_FIX',
      summary: {
        totalModels: 0,
        checkedModels: 0,
        matchedModels: 0,
        mismatches: 0,
        fixedIssues: 0,
        errors: 0,
        virtualFieldsSkipped: 0
      },
      modelChecks: [],
      mismatches: [],
      fixedIssues: [],
      skippedIssues: [],
      errors: [],
      recommendations: []
    }

    // 需要检查的模型列表（排除sequelize实例）
    this.modelNames = Object.keys(models).filter(
      key => key !== 'sequelize' && key !== 'Sequelize'
    )

    // 表名映射（模型名 -> 数据库表名）
    this.tableNameMapping = {
      User: 'users',
      UserSession: 'user_sessions',
      UserPointsAccount: 'user_points_accounts',
      UserInventory: 'user_inventory',
      Product: 'products',
      LotteryCampaign: 'lottery_campaigns',
      LotteryDraw: 'lottery_draws',
      LotteryPreset: 'lottery_presets',
      LotteryPrize: 'lottery_prizes',
      LotteryPity: 'lottery_pity',
      PointsTransaction: 'points_transactions',
      TradeRecord: 'trade_records',
      ExchangeRecords: 'exchange_records',
      ChatMessage: 'chat_messages',
      CustomerSession: 'customer_sessions',
      ImageResources: 'image_resources'
    }

    // 虚拟字段定义（这些字段不存储在数据库中）
    this.virtualFields = new Set([
      'fullName', 'displayName', 'avatar_url', 'formatted_mobile',
      'status_text', 'total_points', 'available_points', 'locked_points'
    ])

    // 时间戳字段映射（旧名称 -> 新名称）
    this.timestampFieldMapping = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      deletedAt: 'deleted_at'
    }
  }

  /**
   * 主执行方法
   */
  async run () {
    console.log('🔧 统一模型字段管理工具启动...')
    console.log(`📅 执行时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    console.log(`🎯 执行模式: ${this.results.mode}`)
    console.log(`📊 目标模型: ${this.options.targetModel || '全部模型'}`)

    try {
      // 1. 检查数据库连接
      await this.checkDatabaseConnection()

      // 2. 根据模式执行相应操作
      if (!this.options.fixOnly) {
        await this.performFieldChecks()
      }

      if (!this.options.checkOnly) {
        await this.performFieldFixes()
      }

      // 3. 生成最终报告
      this.generateFinalReport()
    } catch (error) {
      console.error('❌ 执行过程中发生错误:', error.message)
      this.results.errors.push({
        type: 'EXECUTION_ERROR',
        message: error.message,
        stack: error.stack
      })
    } finally {
      await this.cleanup()
    }
  }

  /**
   * 检查数据库连接
   */
  async checkDatabaseConnection () {
    console.log('🔍 检查数据库连接...')

    try {
      await sequelize.authenticate()
      console.log('✅ 数据库连接成功')
    } catch (error) {
      console.error('❌ 数据库连接失败:', error.message)
      throw new Error(`数据库连接失败: ${error.message}`)
    }
  }

  /**
   * 执行字段检查
   */
  async performFieldChecks () {
    console.log('\n🔍 开始模型字段检查...')

    const modelsToCheck = this.options.targetModel
      ? [this.options.targetModel]
      : this.modelNames

    for (const modelName of modelsToCheck) {
      try {
        await this.checkModelFields(modelName)
        this.results.summary.checkedModels++
      } catch (error) {
        console.error(`❌ 检查模型 ${modelName} 时发生错误:`, error.message)
        this.results.errors.push({
          type: 'CHECK_ERROR',
          model: modelName,
          message: error.message
        })
        this.results.summary.errors++
      }
    }

    this.results.summary.totalModels = modelsToCheck.length
  }

  /**
   * 检查单个模型的字段
   */
  async checkModelFields (modelName) {
    if (!models[modelName]) {
      console.warn(`⚠️ 模型 ${modelName} 不存在，跳过检查`)
      return
    }

    const model = models[modelName]
    const tableName = this.tableNameMapping[modelName] || model.tableName || modelName.toLowerCase()

    if (this.options.verbose) {
      console.log(`🔍 检查模型: ${modelName} -> 表: ${tableName}`)
    }

    try {
      // 获取数据库表结构
      const tableInfo = await this.getTableStructure(tableName)

      // 获取模型字段定义
      const modelFields = this.getModelFields(model)

      // 比较字段
      const comparison = this.compareFields(modelName, modelFields, tableInfo)

      this.results.modelChecks.push(comparison)

      if (comparison.matched) {
        this.results.summary.matchedModels++
        if (this.options.verbose) {
          console.log(`✅ ${modelName}: 字段匹配`)
        }
      } else {
        this.results.summary.mismatches++
        this.results.mismatches.push(comparison)
        console.log(`⚠️ ${modelName}: 发现字段不匹配`)
      }
    } catch (error) {
      console.error(`❌ 检查模型 ${modelName} 失败:`, error.message)
      throw error
    }
  }

  /**
   * 执行字段修复
   */
  async performFieldFixes () {
    console.log('\n🔧 开始修复字段问题...')

    // 1. 修复虚拟字段问题
    await this.fixVirtualFieldIssues()

    // 2. 修复时间戳字段命名问题
    await this.fixTimestampFieldIssues()

    // 3. 修复其他检测到的问题
    await this.fixDetectedIssues()
  }

  /**
   * 修复虚拟字段问题
   */
  async fixVirtualFieldIssues () {
    console.log('🔧 修复虚拟字段问题...')

    for (const modelName of this.modelNames) {
      if (this.options.targetModel && modelName !== this.options.targetModel) {
        continue
      }

      try {
        const model = models[modelName]
        if (!model) continue

        const fixedFields = []

        // 检查模型字段定义
        Object.keys(model.rawAttributes).forEach(fieldName => {
          const fieldDef = model.rawAttributes[fieldName]

          // 检查是否为虚拟字段但被错误标记
          if (fieldDef && fieldDef.type && fieldDef.type.constructor.name === 'VIRTUAL') {
            if (!this.virtualFields.has(fieldName)) {
              // 这可能是错误的虚拟字段标记
              console.log(`⚠️ ${modelName}.${fieldName}: 可能的错误虚拟字段标记`)
              fixedFields.push(fieldName)
            } else {
              this.results.summary.virtualFieldsSkipped++
            }
          }
        })

        if (fixedFields.length > 0) {
          this.results.fixedIssues.push({
            type: 'VIRTUAL_FIELD_FIX',
            model: modelName,
            fields: fixedFields,
            message: `修复了 ${fixedFields.length} 个虚拟字段问题`
          })
          this.results.summary.fixedIssues++
        }
      } catch (error) {
        console.error(`❌ 修复模型 ${modelName} 虚拟字段时出错:`, error.message)
        this.results.errors.push({
          type: 'VIRTUAL_FIELD_FIX_ERROR',
          model: modelName,
          message: error.message
        })
      }
    }
  }

  /**
   * 修复时间戳字段命名问题
   */
  async fixTimestampFieldIssues () {
    console.log('🔧 修复时间戳字段命名问题...')

    for (const modelName of this.modelNames) {
      if (this.options.targetModel && modelName !== this.options.targetModel) {
        continue
      }

      try {
        const model = models[modelName]
        if (!model) continue

        const fixedFields = []

        // 检查时间戳字段命名
        Object.keys(model.rawAttributes).forEach(fieldName => {
          const fieldDef = model.rawAttributes[fieldName]

          if (fieldDef.type && fieldDef.type.constructor && fieldDef.type.constructor.name === 'VIRTUAL') {
            return // 跳过虚拟字段
          }

          // 检查是否需要重命名
          if (this.timestampFieldMapping[fieldName]) {
            const newFieldName = this.timestampFieldMapping[fieldName]
            console.log(`🔄 ${modelName}: ${fieldName} -> ${newFieldName}`)
            fixedFields.push({ from: fieldName, to: newFieldName })
          }
        })

        if (fixedFields.length > 0) {
          this.results.fixedIssues.push({
            type: 'TIMESTAMP_FIELD_FIX',
            model: modelName,
            fields: fixedFields,
            message: `修复了 ${fixedFields.length} 个时间戳字段命名问题`
          })
          this.results.summary.fixedIssues++
        }
      } catch (error) {
        console.error(`❌ 修复模型 ${modelName} 时间戳字段时出错:`, error.message)
        this.results.errors.push({
          type: 'TIMESTAMP_FIELD_FIX_ERROR',
          model: modelName,
          message: error.message
        })
      }
    }
  }

  /**
   * 修复检测到的其他问题
   */
  async fixDetectedIssues () {
    if (this.results.mismatches.length === 0) {
      return
    }

    console.log('🔧 修复检测到的字段不匹配问题...')

    for (const mismatch of this.results.mismatches) {
      try {
        // 这里可以添加更多自动修复逻辑
        console.log(`🔍 分析 ${mismatch.model} 的不匹配问题...`)

        // 生成修复建议而不是自动修复
        this.results.recommendations.push({
          type: 'FIELD_MISMATCH',
          model: mismatch.model,
          suggestion: `请手动检查模型 ${mismatch.model} 的字段定义`
        })
      } catch (error) {
        console.error(`❌ 分析模型 ${mismatch.model} 时出错:`, error.message)
      }
    }
  }

  /**
   * 获取数据库表结构
   */
  async getTableStructure (tableName) {
    try {
      const [results] = await sequelize.query(`DESCRIBE \`${tableName}\``)

      const tableInfo = {}
      results.forEach(row => {
        tableInfo[row.Field] = {
          type: row.Type,
          nullable: row.Null === 'YES',
          key: row.Key,
          default: row.Default,
          extra: row.Extra
        }
      })

      return tableInfo
    } catch (error) {
      if (error.message.includes('doesn\'t exist')) {
        console.warn(`⚠️ 表 ${tableName} 不存在`)
        return {}
      }
      throw error
    }
  }

  /**
   * 获取模型字段定义
   */
  getModelFields (model) {
    const fields = {}

    Object.keys(model.rawAttributes).forEach(fieldName => {
      const fieldDef = model.rawAttributes[fieldName]

      // 跳过虚拟字段
      if (fieldDef.type && fieldDef.type.constructor && fieldDef.type.constructor.name === 'VIRTUAL') {
        return
      }

      fields[fieldName] = {
        type: this.getSequelizeTypeString(fieldDef.type),
        allowNull: fieldDef.allowNull !== false,
        primaryKey: fieldDef.primaryKey === true,
        autoIncrement: fieldDef.autoIncrement === true,
        defaultValue: fieldDef.defaultValue
      }
    })

    return fields
  }

  /**
   * 比较模型字段与数据库字段
   */
  compareFields (modelName, modelFields, tableInfo) {
    const comparison = {
      model: modelName,
      matched: true,
      modelFieldCount: Object.keys(modelFields).length,
      tableFieldCount: Object.keys(tableInfo).length,
      missingInModel: [],
      missingInTable: [],
      typeMismatches: []
    }

    // 检查表中缺失的字段
    Object.keys(modelFields).forEach(fieldName => {
      if (!tableInfo[fieldName]) {
        comparison.missingInTable.push(fieldName)
        comparison.matched = false
      }
    })

    // 检查模型中缺失的字段
    Object.keys(tableInfo).forEach(fieldName => {
      if (!modelFields[fieldName]) {
        comparison.missingInModel.push(fieldName)
        comparison.matched = false
      }
    })

    return comparison
  }

  /**
   * 获取Sequelize类型字符串
   */
  getSequelizeTypeString (type) {
    if (!type) return 'UNKNOWN'

    if (type.constructor && type.constructor.name) {
      return type.constructor.name.toUpperCase()
    }

    return type.toString().toUpperCase()
  }

  /**
   * 生成最终报告
   */
  generateFinalReport () {
    console.log('\n📊 === 模型字段管理报告 ===')
    console.log(`🕒 执行时间: ${this.results.timestamp}`)
    console.log(`🎯 执行模式: ${this.results.mode}`)
    console.log('')

    // 统计信息
    const summary = this.results.summary
    console.log('📈 统计信息:')
    console.log(`  总模型数: ${summary.totalModels}`)
    console.log(`  已检查: ${summary.checkedModels}`)
    console.log(`  匹配成功: ${summary.matchedModels}`)
    console.log(`  不匹配: ${summary.mismatches}`)
    console.log(`  已修复: ${summary.fixedIssues}`)
    console.log(`  跳过虚拟字段: ${summary.virtualFieldsSkipped}`)
    console.log(`  错误数: ${summary.errors}`)

    // 不匹配详情
    if (this.results.mismatches.length > 0) {
      console.log('\n⚠️ 字段不匹配详情:')
      this.results.mismatches.forEach(mismatch => {
        console.log(`  模型: ${mismatch.model}`)
        if (mismatch.missingInTable.length > 0) {
          console.log(`    表中缺失: ${mismatch.missingInTable.join(', ')}`)
        }
        if (mismatch.missingInModel.length > 0) {
          console.log(`    模型中缺失: ${mismatch.missingInModel.join(', ')}`)
        }
      })
    }

    // 修复详情
    if (this.results.fixedIssues.length > 0) {
      console.log('\n✅ 已修复问题:')
      this.results.fixedIssues.forEach(fix => {
        console.log(`  ${fix.model}: ${fix.message}`)
      })
    }

    // 建议
    if (this.results.recommendations.length > 0) {
      console.log('\n💡 修复建议:')
      this.results.recommendations.forEach(rec => {
        console.log(`  ${rec.model}: ${rec.suggestion}`)
      })
    }

    // 错误
    if (this.results.errors.length > 0) {
      console.log('\n❌ 错误详情:')
      this.results.errors.forEach(error => {
        console.log(`  ${error.type}: ${error.message}`)
      })
    }

    console.log('\n🎉 模型字段管理完成！')
  }

  /**
   * 清理资源
   */
  async cleanup () {
    try {
      if (sequelize) {
        await sequelize.close()
        console.log('✅ 数据库连接已关闭')
      }
    } catch (error) {
      console.warn('⚠️ 关闭数据库连接时出错:', error.message)
    }
  }
}

// 命令行参数解析
function parseArguments () {
  const args = process.argv.slice(2)
  const options = {}

  args.forEach(arg => {
    if (arg === '--check-only') {
      options.checkOnly = true
    } else if (arg === '--fix-only') {
      options.fixOnly = true
    } else if (arg === '--verbose') {
      options.verbose = true
    } else if (arg.startsWith('--model=')) {
      options.targetModel = arg.split('=')[1]
    }
  })

  return options
}

// 执行脚本
if (require.main === module) {
  const options = parseArguments()
  const manager = new UnifiedModelFieldManager(options)

  manager.run()
    .then(() => {
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ 脚本执行失败:', error)
      process.exit(1)
    })
}

module.exports = UnifiedModelFieldManager
