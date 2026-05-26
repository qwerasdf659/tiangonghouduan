/**
 * 模型关联管理器
 * 系统性管理和验证模型关联关系，防止关联缺失问题
 * 创建时间：2025年01月21日 北京时间
 * 使用模型：Claude Sonnet 4
 */

const BeijingTimeHelper = require('../../utils/timeHelper')
const fs = require('fs').promises
const path = require('path')
const winston = require('winston')

// 配置专用日志器
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''
      return `[${timestamp}] ${level.toUpperCase()}: ${message} ${metaStr}`
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: 'logs/model-association-manager.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
})

/**
 * 模型关联管理器类
 * 负责检测、验证和修复模型关联关系
 */
class ModelAssociationManager {
  constructor() {
    this.initialized = false
    this.models = null
    this.associationMap = new Map()
    this.expectedAssociations = this.defineExpectedAssociations()
    this.missingAssociations = []
    this.brokenAssociations = []

    logger.info('ModelAssociationManager 初始化开始')
  }

  /**
   * 定义预期的模型关联关系
   */
  defineExpectedAssociations() {
    return {
      User: {
        hasMany: [
          { model: 'LotteryDraw', foreignKey: 'user_id', as: 'lotteryDraws' },
          { model: 'PrizeDistribution', foreignKey: 'user_id', as: 'prizeDistributions' },
          { model: 'Item', foreignKey: 'owner_account_id', as: 'itemInstances' }
        ],
        hasOne: [],
        belongsTo: []
      },
      LotteryDraw: {
        hasMany: [
          {
            model: 'PrizeDistribution',
            foreignKey: 'lottery_draw_id',
            sourceKey: 'lottery_draw_id',
            as: 'prizeDistributions'
          }
        ],
        hasOne: [],
        belongsTo: [
          { model: 'User', foreignKey: 'user_id', as: 'user' },
          { model: 'LotteryCampaignPrize', foreignKey: 'lottery_campaign_prize_id', as: 'prize' },
          {
            model: 'LotteryCampaign',
            foreignKey: 'lottery_id',
            targetKey: 'lottery_campaign_id',
            as: 'campaign'
          }
        ]
      },
      LotteryCampaignPrize: {
        hasMany: [
          { model: 'LotteryDraw', foreignKey: 'lottery_campaign_prize_id', as: 'lotteryDraws' },
          {
            model: 'PrizeDistribution',
            foreignKey: 'lottery_campaign_prize_id',
            as: 'distributions'
          }
        ],
        hasOne: [],
        belongsTo: [{ model: 'LotteryCampaign', foreignKey: 'lottery_campaign_id', as: 'campaign' }]
      },
      LotteryCampaign: {
        hasMany: [
          { model: 'LotteryCampaignPrize', foreignKey: 'lottery_campaign_id', as: 'prizes' },
          {
            model: 'LotteryDraw',
            foreignKey: 'lottery_id',
            sourceKey: 'lottery_campaign_id',
            as: 'lotteryDraws'
          }
        ],
        hasOne: [],
        belongsTo: []
      },
      PrizeDistribution: {
        hasMany: [],
        hasOne: [],
        belongsTo: [
          { model: 'User', foreignKey: 'user_id', as: 'user' },
          {
            model: 'LotteryDraw',
            foreignKey: 'lottery_draw_id',
            targetKey: 'lottery_draw_id',
            as: 'lotteryDraw'
          },
          { model: 'LotteryCampaignPrize', foreignKey: 'lottery_campaign_prize_id', as: 'prize' }
        ]
      }
    }
  }

  /**
   * 🔍 运行完整的关联检查
   */
  async runCompleteAssociationCheck() {
    logger.info('🔍 开始运行完整的模型关联检查...')
    const startTime = Date.now()

    try {
      // 1. 加载和分析模型
      await this.loadAndAnalyzeModels()

      // 2. 检查缺失的关联
      await this.checkMissingAssociations()

      // 3. 检查错误的关联
      await this.checkBrokenAssociations()

      // 4. 生成修复建议
      const fixSuggestions = await this.generateFixSuggestions()

      // 5. 生成关联报告
      const associationReport = await this.generateAssociationReport()

      const duration = Date.now() - startTime
      logger.info(`✅ 模型关联检查完成，耗时: ${duration}ms`)

      return {
        success: true,
        duration,
        missingAssociations: this.missingAssociations,
        brokenAssociations: this.brokenAssociations,
        fixSuggestions,
        report: associationReport,
        stats: {
          totalModels: Object.keys(this.associationMap).length,
          missingCount: this.missingAssociations.length,
          brokenCount: this.brokenAssociations.length,
          healthScore: this.calculateHealthScore()
        }
      }
    } catch (error) {
      logger.error('❌ 模型关联检查失败:', error)
      return {
        success: false,
        error: error.message,
        missingAssociations: this.missingAssociations,
        brokenAssociations: this.brokenAssociations
      }
    }
  }

  /**
   * 📂 加载和分析模型
   */
  async loadAndAnalyzeModels() {
    logger.info('📂 加载和分析模型结构...')

    try {
      // 加载模型
      this.models = require('../../models')

      // 分析每个模型的关联关系
      for (const [modelName, model] of Object.entries(this.models)) {
        if (model && typeof model.associate === 'function') {
          this.associationMap.set(modelName, {
            hasAssociateFunction: true,
            associations: this.extractModelAssociations(model),
            file: await this.findModelFile(modelName)
          })
        } else {
          this.associationMap.set(modelName, {
            hasAssociateFunction: false,
            associations: [],
            file: await this.findModelFile(modelName)
          })
        }
      }

      logger.info(`已分析 ${this.associationMap.size} 个模型`)
    } catch (error) {
      logger.error('加载模型失败:', error)
      throw new Error(`模型加载失败: ${error.message}`)
    }
  }

  /**
   * 🔍 提取模型关联关系
   */
  extractModelAssociations(model) {
    const associations = []

    // 通过检查模型的associations属性来提取关联
    if (model.associations) {
      for (const [aliasName, association] of Object.entries(model.associations)) {
        associations.push({
          type: association.associationType,
          target: association.target.name,
          alias: aliasName,
          foreignKey: association.foreignKey,
          sourceKey: association.sourceKey,
          targetKey: association.targetKey
        })
      }
    }

    return associations
  }

  /**
   * 📁 查找模型文件
   */
  async findModelFile(modelName) {
    const possiblePaths = [
      `models/${modelName}.js`,
      `models/${modelName.toLowerCase()}.js`,
      `models/${modelName.charAt(0).toLowerCase() + modelName.slice(1)}.js`
    ]

    // 🚀 性能优化：并发执行替代循环中await
    const validPaths = await Promise.all(
      possiblePaths.map(async filePath => {
        try {
          await fs.access(filePath)
          return filePath
        } catch {
          // 继续查找下一个路径
          return null
        }
      })
    )

    return validPaths.find(path => path !== null) || null
  }

  /**
   * ❌ 检查缺失的关联
   */
  async checkMissingAssociations() {
    logger.info('❌ 检查缺失的关联关系...')

    for (const [modelName, expectedAssoc] of Object.entries(this.expectedAssociations)) {
      const actualModel = this.associationMap.get(modelName)

      if (!actualModel) {
        this.missingAssociations.push({
          type: 'missing_model',
          modelName,
          issue: '模型不存在或未正确加载'
        })
        continue
      }

      if (!actualModel.hasAssociateFunction) {
        this.missingAssociations.push({
          type: 'missing_associate_function',
          modelName,
          issue: '缺少associate函数'
        })
        continue
      }

      // 检查各种类型的关联
      this.checkAssociationType(
        modelName,
        'hasMany',
        expectedAssoc.hasMany,
        actualModel.associations
      )
      this.checkAssociationType(modelName, 'hasOne', expectedAssoc.hasOne, actualModel.associations)
      this.checkAssociationType(
        modelName,
        'belongsTo',
        expectedAssoc.belongsTo,
        actualModel.associations
      )
    }

    logger.info(`发现 ${this.missingAssociations.length} 个缺失的关联`)
  }

  /**
   * 🔍 检查特定类型的关联
   */
  checkAssociationType(modelName, associationType, expectedAssocs, actualAssocs) {
    for (const expected of expectedAssocs) {
      const found = actualAssocs.find(
        actual =>
          actual.type === associationType &&
          actual.target === expected.model &&
          actual.alias === expected.as
      )

      if (!found) {
        this.missingAssociations.push({
          type: 'missing_association',
          modelName,
          associationType,
          targetModel: expected.model,
          alias: expected.as,
          expectedConfig: expected
        })
      }
    }
  }

  /**
   * 💥 检查错误的关联
   */
  async checkBrokenAssociations() {
    logger.info('💥 检查错误的关联关系...')

    for (const [modelName, modelInfo] of this.associationMap) {
      for (const association of modelInfo.associations) {
        // 检查目标模型是否存在
        if (!this.models[association.target]) {
          this.brokenAssociations.push({
            type: 'invalid_target',
            modelName,
            association,
            issue: `目标模型 ${association.target} 不存在`
          })
        }

        // 检查外键配置
        if (association.type === 'BelongsTo' && !association.foreignKey) {
          this.brokenAssociations.push({
            type: 'missing_foreign_key',
            modelName,
            association,
            issue: 'BelongsTo关联缺少foreignKey配置'
          })
        }
      }
    }

    logger.info(`发现 ${this.brokenAssociations.length} 个错误的关联`)
  }

  /**
   * 🛠 生成修复建议
   */
  async generateFixSuggestions() {
    const suggestions = []

    // 为缺失的关联生成修复建议
    for (const missing of this.missingAssociations) {
      if (missing.type === 'missing_association') {
        const suggestion = this.generateAssociationCode(missing)
        suggestions.push({
          id: `fix-${missing.modelName}-${missing.alias}`,
          priority: 'high',
          type: 'add_association',
          title: `添加 ${missing.modelName} -> ${missing.targetModel} 关联`,
          file: this.associationMap.get(missing.modelName)?.file,
          code: suggestion,
          description: `在${missing.modelName}模型中添加${missing.associationType}关联到${missing.targetModel}`
        })
      }
    }

    // 为错误的关联生成修复建议
    for (const broken of this.brokenAssociations) {
      suggestions.push({
        id: `fix-broken-${broken.modelName}-${broken.association.alias}`,
        priority: 'high',
        type: 'fix_association',
        title: `修复 ${broken.modelName} 中的错误关联`,
        file: this.associationMap.get(broken.modelName)?.file,
        issue: broken.issue,
        description: `修复${broken.modelName}模型中的${broken.association.alias}关联`
      })
    }

    return suggestions
  }

  /**
   * 🔧 生成关联代码
   */
  generateAssociationCode(missingAssoc) {
    const { modelName, associationType, targetModel, expectedConfig } = missingAssoc

    let code = `    // 🔥 关联到${targetModel}\n`

    switch (associationType) {
      case 'hasMany':
        code += `    ${modelName}.${associationType}(models.${targetModel}, {\n`
        code += `      foreignKey: '${expectedConfig.foreignKey}',\n`
        if (expectedConfig.sourceKey) {
          code += `      sourceKey: '${expectedConfig.sourceKey}',\n`
        }
        code += `      as: '${expectedConfig.as}',\n`
        code += `      comment: '${targetModel}关联关系'\n`
        code += '    })\n'
        break

      case 'hasOne':
        code += `    ${modelName}.${associationType}(models.${targetModel}, {\n`
        code += `      foreignKey: '${expectedConfig.foreignKey}',\n`
        code += `      as: '${expectedConfig.as}',\n`
        code += `      comment: '${targetModel}关联关系'\n`
        code += '    })\n'
        break

      case 'belongsTo':
        code += `    ${modelName}.${associationType}(models.${targetModel}, {\n`
        code += `      foreignKey: '${expectedConfig.foreignKey}',\n`
        if (expectedConfig.targetKey) {
          code += `      targetKey: '${expectedConfig.targetKey}',\n`
        }
        code += `      as: '${expectedConfig.as}',\n`
        code += `      comment: '${targetModel}关联关系'\n`
        code += '    })\n'
        break
    }

    return code
  }

  /**
   * 📊 生成关联报告
   */
  async generateAssociationReport() {
    const report = {
      timestamp: BeijingTimeHelper.now(),
      summary: {
        totalModels: this.associationMap.size,
        healthyModels: 0,
        modelsWithIssues: 0,
        totalAssociations: 0,
        missingAssociations: this.missingAssociations.length,
        brokenAssociations: this.brokenAssociations.length,
        overallHealthScore: this.calculateHealthScore()
      },
      modelDetails: {},
      issues: {
        missing: this.missingAssociations,
        broken: this.brokenAssociations
      },
      recommendations: []
    }

    // 分析每个模型的详细情况
    for (const [modelName, modelInfo] of this.associationMap) {
      const modelIssues = [
        ...this.missingAssociations.filter(m => m.modelName === modelName),
        ...this.brokenAssociations.filter(b => b.modelName === modelName)
      ]

      report.modelDetails[modelName] = {
        hasAssociateFunction: modelInfo.hasAssociateFunction,
        associationCount: modelInfo.associations.length,
        issues: modelIssues.length,
        healthScore: modelIssues.length === 0 ? 100 : Math.max(0, 100 - modelIssues.length * 10),
        file: modelInfo.file
      }

      report.summary.totalAssociations += modelInfo.associations.length

      if (modelIssues.length === 0) {
        report.summary.healthyModels++
      } else {
        report.summary.modelsWithIssues++
      }
    }

    // 保存报告
    const reportPath = path.join('logs', `association-report-${Date.now()}.json`)
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2))
    logger.info(`关联关系报告已保存: ${reportPath}`)

    return report
  }

  /**
   * 📊 计算健康评分
   */
  calculateHealthScore() {
    const totalExpectedAssociations = Object.values(this.expectedAssociations).reduce(
      (sum, model) => sum + model.hasMany.length + model.hasOne.length + model.belongsTo.length,
      0
    )

    const totalIssues = this.missingAssociations.length + this.brokenAssociations.length

    if (totalExpectedAssociations === 0) return 100

    const healthScore = Math.max(0, 100 - (totalIssues / totalExpectedAssociations) * 100)
    return Math.round(healthScore)
  }

  /**
   * 🔧 自动修复关联关系
   */
  async autoFixAssociations(suggestions) {
    logger.info('🔧 开始自动修复关联关系...')
    let fixedCount = 0

    // 🚀 性能优化：并发执行替代循环中await
    await Promise.all(
      suggestions.map(async suggestion => {
        if (suggestion.type === 'add_association' && suggestion.file && suggestion.code) {
          try {
            await this.addAssociationToFile(suggestion.file, suggestion.code)
            logger.info(`已修复关联: ${suggestion.title}`)
            fixedCount++
          } catch (error) {
            logger.error(`修复关联失败: ${suggestion.title}`, error)
          }
        }
      })
    )

    logger.info(`关联关系修复完成，共修复 ${fixedCount} 个问题`)
    return fixedCount
  }

  /**
   * 📝 添加关联到文件
   */
  async addAssociationToFile(filePath, code) {
    try {
      const content = await fs.readFile(filePath, 'utf8')

      // 查找associate函数的结束位置
      const associateEndIndex = content.lastIndexOf('}', content.lastIndexOf('User.associate'))

      if (associateEndIndex > -1) {
        const beforeEnd = content.substring(0, associateEndIndex)
        const afterEnd = content.substring(associateEndIndex)

        const newContent = beforeEnd + '\n' + code + afterEnd

        await fs.writeFile(filePath, newContent)
        logger.info(`已向 ${filePath} 添加关联代码`)
      } else {
        logger.warn(`无法找到 ${filePath} 中的associate函数结束位置`)
      }
    } catch (error) {
      throw new Error(`添加关联代码失败: ${error.message}`)
    }
  }

  /**
   * 🧹 清理和优化
   */
  async cleanup() {
    logger.info('🧹 执行模型关联管理器清理...')

    // 清理内存中的数据
    this.associationMap.clear()
    this.missingAssociations = []
    this.brokenAssociations = []

    logger.info('ModelAssociationManager 清理完成')
  }

  /**
   * 📊 获取关联统计
   */
  getAssociationStats() {
    return {
      totalModels: this.associationMap.size,
      missingAssociations: this.missingAssociations.length,
      brokenAssociations: this.brokenAssociations.length,
      healthScore: this.calculateHealthScore()
    }
  }
}

module.exports = ModelAssociationManager
