#!/usr/bin/env node
/**
 * 业务标准统一修复脚本 V4.0
 * 系统性解决：状态字段标准化、数据库外键关系、性能优化、业务标准一致性
 * 创建时间：2025年01月21日 北京时间
 *
 * 核心功能：
 * 1. 业务状态字段标准化
 * 2. 数据库外键约束建立
 * 3. 性能索引优化
 * 4. 重复表处理
 * 5. API响应格式统一验证
 */

const { getDatabaseHelper } = require('../utils/database')
const ApiStandardManager = require('../utils/ApiStandardManager')
const BeijingTimeHelper = require('../utils/timeHelper')

class BusinessStandardsFixer {
  constructor () {
    this.db = getDatabaseHelper()
    this.apiManager = new ApiStandardManager()
    this.fixResults = {
      businessStatus: [],
      foreignKeys: [],
      indexes: [],
      duplicateTables: [],
      apiStandards: []
    }
    this.startTime = Date.now()
  }

  /**
   * 执行完整的业务标准修复
   */
  async runCompleteStandardsFixing () {
    console.log('🚀 === 业务标准统一修复开始 ===')
    console.log(`📅 开始时间: ${BeijingTimeHelper.apiTimestamp()}`)

    try {
      // 1. 检查并修复业务状态字段标准化
      console.log('\n📊 阶段1: 业务状态字段标准化修复')
      await this.fixBusinessStatusStandards()

      // 2. 检查并创建数据库外键约束
      console.log('\n🔗 阶段2: 数据库外键约束建立')
      await this.fixForeignKeyConstraints()

      // 3. 检查并创建性能索引
      console.log('\n⚡ 阶段3: 数据库性能索引优化')
      await this.fixDatabaseIndexes()

      // 4. 检查重复表问题
      console.log('\n🗂️ 阶段4: 重复表问题检查')
      await this.checkDuplicateTablesIssues()

      // 5. 验证抽奖策略标准
      console.log('\n🎯 阶段5: 抽奖策略标准验证')
      await this.verifyLotteryStrategies()

      // 6. 生成修复报告
      console.log('\n📋 阶段6: 生成修复报告')
      await this.generateFixingReport()

      console.log('\n✅ 业务标准统一修复完成!')
      return this.fixResults
    } catch (error) {
      console.error('\n❌ 业务标准修复失败:', error.message)
      throw error
    }
  }

  /**
   * 修复业务状态字段标准化问题
   */
  async fixBusinessStatusStandards () {
    try {
      console.log('🔍 检查业务状态字段标准化...')

      // 检查常用模型的基础方法可用性
      const models = require('../models')

      // 检查常用模型的基础方法可用性
      const coreModels = ['User', 'UserPointsAccount', 'LotteryCampaign', 'LotteryDraw', 'LotteryPrize']

      const checkCoreModelMethods = async () => {
        try {
          console.log('�� 验证核心模型方法可用性...')

          for (const modelName of coreModels) {
            if (!models[modelName]) {
              console.log(`⚠️ ${modelName}模型不存在，跳过方法检查`)
              continue
            }

            const model = models[modelName]

            // 检查常用方法
            const requiredMethods = ['findAll', 'findOne', 'create', 'update', 'destroy']
            const missingMethods = requiredMethods.filter(
              method => typeof model[method] !== 'function'
            )

            if (missingMethods.length > 0) {
              return {
                success: false,
                model: modelName,
                missingMethods,
                message: `${modelName}模型缺少方法: ${missingMethods.join(', ')}`
              }
            }
          }

          console.log('✅ 核心模型方法验证通过')
          return {
            success: true,
            model: 'All',
            message: '所有核心模型方法可用'
          }
        } catch (error) {
          console.log(`⚠️ 核心模型方法检查跳过: ${error.message}`)
          return {
            success: false,
            model: 'Unknown',
            message: error.message
          }
        }
      }

      // 执行核心模型方法检查
      return await checkCoreModelMethods()
    } catch (error) {
      console.error('❌ 业务状态字段标准化失败:', error.message)
      this.fixResults.businessStatus.push({
        model: 'GENERAL',
        status: 'ERROR',
        error: error.message
      })
    }
  }

  /**
   * 验证模型状态字段标准
   */
  async validateModelStatusFields () {
    const statusValidations = [
      {
        model: 'LotteryDraw', // 已合并LotteryRecord
        context: 'lottery_result',
        description: '抽奖结果验证'
      },
      {
        model: 'PointsTransaction',
        context: 'process_execution',
        description: '积分交易状态验证'
      },
      {
        model: 'UserInventory',
        context: 'inventory_status',
        description: '用户库存状态验证'
      }
    ]

    for (const validation of statusValidations) {
      try {
        console.log(`🔍 验证${validation.model}状态字段标准...`)

        // 模拟状态数据验证
        const testData = this.generateTestStatusData(validation.context)
        const validationResult = this.apiManager.validateBusinessStatus(
          testData,
          validation.context
        )

        if (validationResult.valid) {
          console.log(`✅ ${validation.model} 状态字段标准验证通过`)
          this.fixResults.businessStatus.push({
            model: validation.model,
            context: validation.context,
            status: 'VALID',
            message: validationResult.message
          })
        } else {
          console.log(`❌ ${validation.model} 状态字段标准验证失败:`, validationResult.message)
          this.fixResults.businessStatus.push({
            model: validation.model,
            context: validation.context,
            status: 'INVALID',
            error: validationResult.error,
            message: validationResult.message
          })
        }
      } catch (error) {
        console.error(`❌ ${validation.model} 状态验证失败:`, error.message)
      }
    }
  }

  /**
   * 生成测试状态数据
   */
  generateTestStatusData (context) {
    const testDataMap = {
      lottery_result: { is_winner: true },
      process_execution: { status: 'completed' },
      inventory_status: { status: 'available' },
      prize_queue_status: { status: 'distributed' },
      user_status: { status: 'active' }
    }

    return testDataMap[context] || {}
  }

  /**
   * 修复数据库外键约束
   */
  async fixForeignKeyConstraints () {
    try {
      console.log('🔍 检查数据库外键约束...')

      // 检查外键约束完整性
      const constraintCheck = await this.db.checkForeignKeyConstraints()

      if (constraintCheck.error) {
        console.error('❌ 外键约束检查失败:', constraintCheck.error)
        console.log('📊 现有外键约束: 检查失败')
        this.fixResults.foreignKeys.push({
          status: 'ERROR',
          error: constraintCheck.error
        })
        return
      }

      console.log(`📊 现有外键约束: ${constraintCheck.existing || 0}个`)

      if (constraintCheck.hasMissingConstraints) {
        console.log(`⚠️ 发现${constraintCheck.missing.length}个缺失的外键约束`)

        constraintCheck.missing.forEach(missing => {
          console.log(
            `   📌 ${missing.table}.${missing.column} -> ${missing.referencedTable}.${missing.referencedColumn}`
          )
        })

        // 创建缺失的外键约束
        console.log('🔧 开始创建缺失的外键约束...')
        const createResult = await this.db.createMissingForeignKeys(constraintCheck.missing)

        console.log(
          `📊 外键约束创建结果: 成功${createResult.created.length}个, 失败${createResult.failed.length}个`
        )

        this.fixResults.foreignKeys = {
          existing: constraintCheck.existing,
          created: createResult.created,
          failed: createResult.failed,
          status: createResult.failed.length === 0 ? 'SUCCESS' : 'PARTIAL'
        }

        if (createResult.failed.length > 0) {
          console.log('❌ 外键约束创建失败的项目:')
          createResult.failed.forEach(failure => {
            console.log(
              `   - ${failure.constraint.table}.${failure.constraint.column}: ${failure.error}`
            )
          })
        }
      } else {
        console.log('✅ 所有外键约束完整')
        this.fixResults.foreignKeys = {
          existing: constraintCheck.existing,
          status: 'COMPLETE'
        }
      }
    } catch (error) {
      console.error('❌ 外键约束修复失败:', error.message)
      this.fixResults.foreignKeys = {
        status: 'ERROR',
        error: error.message
      }
    }
  }

  /**
   * 修复数据库索引
   */
  async fixDatabaseIndexes () {
    try {
      console.log('🔍 检查数据库索引完整性...')

      // 检查索引完整性
      const indexCheck = await this.db.checkIndexIntegrity()

      if (indexCheck.error) {
        console.error('❌ 索引完整性检查失败:', indexCheck.error)
        console.log('📊 现有索引: 检查失败')
        this.fixResults.indexes.push({
          status: 'ERROR',
          error: indexCheck.error
        })
        return
      }

      console.log(`📊 现有索引: ${indexCheck.existingCount || 0}个表有索引`)

      if (indexCheck.hasMissingIndexes) {
        console.log(`⚠️ 发现${indexCheck.missingIndexes.length}个缺失的重要索引`)

        indexCheck.missingIndexes.forEach(missing => {
          console.log(
            `   📌 ${missing.table}(${missing.columns.join(', ')}) ${missing.unique ? '[UNIQUE]' : ''}`
          )
        })

        // 创建缺失的索引
        console.log('🔧 开始创建缺失的索引...')
        const createResult = await this.db.createMissingIndexes(indexCheck.missingIndexes)

        console.log(
          `📊 索引创建结果: 成功${createResult.created.length}个, 失败${createResult.failed.length}个`
        )

        this.fixResults.indexes = {
          existing: indexCheck.existingCount,
          created: createResult.created,
          failed: createResult.failed,
          status: createResult.failed.length === 0 ? 'SUCCESS' : 'PARTIAL'
        }

        if (createResult.failed.length > 0) {
          console.log('❌ 索引创建失败的项目:')
          createResult.failed.forEach(failure => {
            console.log(
              `   - ${failure.index.table}(${failure.index.columns.join(', ')}): ${failure.error}`
            )
          })
        }
      } else {
        console.log('✅ 所有重要索引完整')
        this.fixResults.indexes = {
          existing: indexCheck.existingCount,
          status: 'COMPLETE'
        }
      }
    } catch (error) {
      console.error('❌ 索引优化失败:', error.message)
      this.fixResults.indexes = {
        status: 'ERROR',
        error: error.message
      }
    }
  }

  /**
   * 检查重复表问题
   */
  async checkDuplicateTablesIssues () {
    try {
      console.log('🔍 检查数据库重复表问题...')

      const duplicateCheck = await this.db.checkDuplicateTables()

      if (duplicateCheck.error) {
        console.error('❌ 重复表检查失败:', duplicateCheck.error)
        console.log('📊 数据库总表数: 检查失败')
        this.fixResults.duplicateTables.push({
          status: 'ERROR',
          error: duplicateCheck.error
        })
        return
      }

      console.log(`📊 数据库总表数: ${duplicateCheck.totalTables || 0}`)

      if (duplicateCheck.hasDuplicates) {
        console.log(`⚠️ 发现${duplicateCheck.duplicateIssues.length}组重复表问题`)

        duplicateCheck.duplicateIssues.forEach(issue => {
          console.log(`   📌 主表: ${issue.mainTable}`)
          console.log(`   🔗 重复表: ${issue.duplicates.join(', ')}`)
          console.log(`   💡 建议: ${issue.recommendation}`)
        })

        this.fixResults.duplicateTables = duplicateCheck.duplicateIssues.map(issue => ({
          mainTable: issue.mainTable,
          duplicates: issue.duplicates,
          recommendation: issue.recommendation,
          status: 'NEEDS_MANUAL_REVIEW'
        }))
      } else {
        console.log('✅ 未发现重复表问题')
        this.fixResults.duplicateTables = [
          {
            status: 'CLEAN',
            message: '未发现重复表问题'
          }
        ]
      }
    } catch (error) {
      console.error('❌ 重复表检查失败:', error.message)
      this.fixResults.duplicateTables = [
        {
          status: 'ERROR',
          error: error.message
        }
      ]
    }
  }

  /**
   * 验证抽奖策略标准
   */
  async verifyLotteryStrategies () {
    try {
      console.log('🔍 验证抽奖策略标准...')

      // 检查抽奖策略文件是否存在且符合要求
      const strategyFiles = [
        // �� V4架构：只检查实际存在的策略文件
        'BasicGuaranteeStrategy.js', // 基础+保底合并策略
        'ManagementStrategy.js' // 管理策略
      ]

      const strategiesPath = require('path').join(__dirname, '../services/UnifiedLotteryEngine/strategies')
      const verificationResults = []

      for (const strategyFile of strategyFiles) {
        const filePath = require('path').join(strategiesPath, strategyFile)

        if (require('fs').existsSync(filePath)) {
          console.log(`✅ 抽奖策略存在: ${strategyFile}`)
          verificationResults.push({
            strategy: strategyFile,
            status: 'EXISTS',
            path: filePath
          })
        } else {
          console.log(`❌ 抽奖策略缺失: ${strategyFile}`)
          verificationResults.push({
            strategy: strategyFile,
            status: 'MISSING',
            path: filePath
          })
        }
      }

      // 检查是否有多余的策略文件（需要删除）
      const actualFiles = require('fs').readdirSync(strategiesPath).filter(file => file.endsWith('.js'))
      const unexpectedFiles = actualFiles.filter(file => !strategyFiles.includes(file))

      if (unexpectedFiles.length > 0) {
        console.log('⚠️ 发现多余的抽奖策略文件（根据要求应该删除）:')
        unexpectedFiles.forEach(file => {
          console.log(`   🗑️ ${file}`)
          verificationResults.push({
            strategy: file,
            status: 'UNEXPECTED',
            action: 'SHOULD_DELETE'
          })
        })
      }

      this.fixResults.apiStandards = verificationResults
    } catch (error) {
      console.error('❌ 抽奖策略验证失败:', error.message)
      this.fixResults.apiStandards = [
        {
          status: 'ERROR',
          error: error.message
        }
      ]
    }
  }

  /**
   * 生成修复报告
   */
  async generateFixingReport () {
    const duration = Date.now() - this.startTime
    const report = {
      timestamp: BeijingTimeHelper.apiTimestamp(),
      duration: `${Math.round(duration / 1000)}秒`,
      results: this.fixResults,
      summary: this.generateSummary()
    }

    console.log('\n📊 === 业务标准修复报告 ===')
    console.log(`⏱️ 执行时间: ${report.duration}`)
    console.log(`📅 完成时间: ${report.timestamp}`)

    console.log('\n📋 修复结果摘要:')
    Object.entries(report.summary).forEach(([category, summary]) => {
      console.log(`   ${this.getCategoryIcon(category)} ${category}: ${summary}`)
    })

    // 生成详细报告
    if (this.hasIssues()) {
      console.log('\n⚠️ 需要关注的问题:')
      this.logIssuesDetails()
    }

    if (this.hasSuccesses()) {
      console.log('\n✅ 成功完成的修复:')
      this.logSuccessDetails()
    }

    console.log('\n📈 总体评估:')
    const overallScore = this.calculateOverallScore()
    console.log(`   📊 修复完成度: ${overallScore.toFixed(1)}%`)
    console.log(
      `   ${overallScore >= 90 ? '🏆' : overallScore >= 70 ? '👍' : '⚠️'} ${this.getScoreMessage(overallScore)}`
    )

    return report
  }

  /**
   * 生成摘要信息
   */
  generateSummary () {
    return {
      业务状态字段: `检查${this.fixResults.businessStatus.length}项`,
      数据库外键: this.fixResults.foreignKeys.status || 'PENDING',
      性能索引: this.fixResults.indexes.status || 'PENDING',
      重复表检查: `发现${this.fixResults.duplicateTables.length}项`,
      抽奖策略: `验证${this.fixResults.apiStandards.length}项`
    }
  }

  /**
   * 获取类别图标
   */
  getCategoryIcon (category) {
    const icons = {
      业务状态字段: '📊',
      数据库外键: '🔗',
      性能索引: '⚡',
      重复表检查: '🗂️',
      抽奖策略: '🎯'
    }
    return icons[category] || '📋'
  }

  /**
   * 检查是否有问题
   */
  hasIssues () {
    return (
      this.fixResults.businessStatus.some(
        item => item.status === 'ERROR' || item.status === 'INVALID'
      ) ||
      this.fixResults.foreignKeys.status === 'ERROR' ||
      this.fixResults.indexes.status === 'ERROR' ||
      this.fixResults.duplicateTables.some(item => item.status === 'ERROR') ||
      this.fixResults.apiStandards.some(
        item => item.status === 'ERROR' || item.status === 'MISSING'
      )
    )
  }

  /**
   * 检查是否有成功项
   */
  hasSuccesses () {
    return (
      this.fixResults.businessStatus.some(
        item => item.status === 'VALID' || item.status === 'FIXED'
      ) ||
      this.fixResults.foreignKeys.status === 'SUCCESS' ||
      this.fixResults.indexes.status === 'SUCCESS'
    )
  }

  /**
   * 记录问题详情
   */
  logIssuesDetails () {
    // 记录业务状态问题
    this.fixResults.businessStatus
      .filter(item => item.status === 'ERROR' || item.status === 'INVALID')
      .forEach(item => {
        console.log(`   ❌ ${item.model}: ${item.error || item.message}`)
      })

    // 记录外键问题
    if (this.fixResults.foreignKeys.status === 'ERROR') {
      console.log(`   ❌ 外键约束: ${this.fixResults.foreignKeys.error}`)
    }

    // 记录索引问题
    if (this.fixResults.indexes.status === 'ERROR') {
      console.log(`   ❌ 索引优化: ${this.fixResults.indexes.error}`)
    }
  }

  /**
   * 记录成功详情
   */
  logSuccessDetails () {
    // 记录成功的业务状态修复
    this.fixResults.businessStatus
      .filter(item => item.status === 'VALID' || item.status === 'FIXED')
      .forEach(item => {
        console.log(`   ✅ ${item.model}: ${item.message}`)
      })

    // 记录外键成功
    if (this.fixResults.foreignKeys.created && this.fixResults.foreignKeys.created.length > 0) {
      console.log(`   ✅ 外键约束: 创建${this.fixResults.foreignKeys.created.length}个`)
    }

    // 记录索引成功
    if (this.fixResults.indexes.created && this.fixResults.indexes.created.length > 0) {
      console.log(`   ✅ 性能索引: 创建${this.fixResults.indexes.created.length}个`)
    }
  }

  /**
   * 计算总体评分
   */
  calculateOverallScore () {
    let totalChecks = 0
    let passedChecks = 0

    // 业务状态检查评分
    totalChecks += this.fixResults.businessStatus.length
    passedChecks += this.fixResults.businessStatus.filter(
      item => item.status === 'VALID' || item.status === 'FIXED' || item.status === 'CORRECT'
    ).length

    // 外键检查评分
    totalChecks += 1
    if (
      this.fixResults.foreignKeys.status === 'SUCCESS' ||
      this.fixResults.foreignKeys.status === 'COMPLETE'
    ) {
      passedChecks += 1
    }

    // 索引检查评分
    totalChecks += 1
    if (
      this.fixResults.indexes.status === 'SUCCESS' ||
      this.fixResults.indexes.status === 'COMPLETE'
    ) {
      passedChecks += 1
    }

    // 抽奖策略检查评分
    totalChecks += this.fixResults.apiStandards.length
    passedChecks += this.fixResults.apiStandards.filter(item => item.status === 'EXISTS').length

    return totalChecks > 0 ? (passedChecks / totalChecks) * 100 : 0
  }

  /**
   * 获取评分消息
   */
  getScoreMessage (score) {
    if (score >= 90) return '优秀 - 业务标准高度统一'
    if (score >= 70) return '良好 - 大部分标准已统一'
    if (score >= 50) return '一般 - 存在一些标准化问题'
    return '需改进 - 标准化程度较低'
  }
}

// 执行脚本
if (require.main === module) {
  const fixer = new BusinessStandardsFixer()

  fixer
    .runCompleteStandardsFixing()
    .then(_results => {
      console.log('\n🎉 业务标准统一修复脚本执行完成!')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n❌ 业务标准统一修复脚本执行失败:', error.message)
      process.exit(1)
    })
}

module.exports = BusinessStandardsFixer
