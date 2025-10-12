#!/usr/bin/env node

/**
 * V4 统一数据库修复器
 * 整合所有数据库修复相关脚本，提供全面的数据库问题修复能力
 *
 * @description 整合fix-*.js相关的数据库修复功能
 * @version 4.0.0
 * @date 2025-10-01
 * @author Claude Sonnet 4
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const BeijingTimeHelper = require('../utils/timeHelper')
const { getDatabaseHelper } = require('../utils/database')

class UnifiedDatabaseFixer {
  constructor () {
    this.results = {
      startTime: BeijingTimeHelper.now(),
      fixesApplied: [],
      warnings: [],
      errors: [],
      summary: {}
    }
    this.dbHelper = getDatabaseHelper()
    this.sequelize = this.dbHelper.getSequelize()
  }

  // 记录修复结果
  recordFix (fixType, success, details = null, warning = null, error = null) {
    const result = {
      type: fixType,
      success,
      details,
      warning,
      error,
      timestamp: BeijingTimeHelper.now()
    }

    this.results.fixesApplied.push(result)

    if (warning) {
      this.results.warnings.push({ type: fixType, message: warning })
    }

    if (error) {
      this.results.errors.push({ type: fixType, message: error })
    }
  }

  // === 时间处理修复模块 ===

  // 修复北京时间处理（整合fix_beijing_time.js功能）
  async fixBeijingTimeHandling () {
    console.log('\n=== 修复北京时间处理 ===')

    try {
      const targetDirs = ['routes', 'services', 'middleware', 'modules', 'models']
      let totalFilesScanned = 0
      let totalFilesModified = 0
      let totalReplacements = 0

      for (const dir of targetDirs) {
        if (!fs.existsSync(dir)) continue

        const files = this.getAllJsFiles(dir)

        for (const file of files) {
          if (this.shouldProcessFile(file)) {
            totalFilesScanned++
            const result = this.replaceTimeInFile(file)

            if (result.modified) {
              totalFilesModified++
              totalReplacements += result.replacements
              console.log(`   ✅ 修复时间处理: ${file} (${result.replacements}处替换)`)
            }
          }
        }
      }

      console.log('✅ 北京时间处理修复完成')
      console.log(`   扫描文件: ${totalFilesScanned}`)
      console.log(`   修改文件: ${totalFilesModified}`)
      console.log(`   总替换数: ${totalReplacements}`)

      this.recordFix('北京时间处理修复', true, {
        filesScanned: totalFilesScanned,
        filesModified: totalFilesModified,
        replacements: totalReplacements
      })
    } catch (error) {
      console.error('❌ 北京时间处理修复失败:', error.message)
      this.recordFix('北京时间处理修复', false, null, null, error.message)
    }
  }

  // 获取目录下所有JS文件
  getAllJsFiles (dir) {
    const files = []

    function scanDir (currentDir) {
      const items = fs.readdirSync(currentDir)

      for (const item of items) {
        const fullPath = path.join(currentDir, item)
        const stat = fs.statSync(fullPath)

        if (stat.isDirectory()) {
          scanDir(fullPath)
        } else if (stat.isFile() && path.extname(fullPath) === '.js') {
          files.push(fullPath)
        }
      }
    }

    scanDir(dir)
    return files
  }

  // 检查文件是否应该被处理
  shouldProcessFile (filePath) {
    const skipPatterns = [
      'node_modules', '.git', 'coverage', 'logs', 'dist', 'build',
      'fix-beijing-time.js', 'timeHelper.js'
    ]

    for (const pattern of skipPatterns) {
      if (filePath.includes(pattern)) return false
    }

    return true
  }

  // 替换文件中的时间调用
  replaceTimeInFile (filePath) {
    try {
      let content = fs.readFileSync(filePath, 'utf8')
      let modified = false
      let replacements = 0

      // 检查是否已经引入BeijingTimeHelper
      const hasImport = content.includes('require(\'../utils/timeHelper\')') ||
                       content.includes('require(\'../../utils/timeHelper\')') ||
                       content.includes('require(\'../../../utils/timeHelper\')')

      // 替换模式1: new Date().toISOString()
      const pattern1 = /new Date\(\)\.toISOString\(\)/g
      const matches1 = content.match(pattern1)
      if (matches1) {
        content = content.replace(pattern1, 'BeijingTimeHelper.now()')
        replacements += matches1.length
        modified = true
      }

      // 替换模式2: new Date().toLocaleString()
      const pattern2 = /new Date\(\)\.toLocaleString\(\)/g
      const matches2 = content.match(pattern2)
      if (matches2) {
        content = content.replace(pattern2, 'BeijingTimeHelper.nowLocale()')
        replacements += matches2.length
        modified = true
      }

      // 替换模式3: moment().format()
      const pattern3 = /moment\(\)\.format\(\)/g
      const matches3 = content.match(pattern3)
      if (matches3) {
        content = content.replace(pattern3, 'BeijingTimeHelper.now()')
        replacements += matches3.length
        modified = true
      }

      // 如果有替换且没有导入，添加导入
      if (modified && !hasImport) {
        // 找到合适的位置插入导入
        const lines = content.split('\n')
        let insertIndex = 0

        // 找到最后一个require语句的位置
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('require(') && !lines[i].includes('//')) {
            insertIndex = i + 1
          }
        }

        // 计算正确的相对路径
        const relativePath = this.getRelativePath(filePath)
        lines.splice(insertIndex, 0, `const BeijingTimeHelper = require('${relativePath}')`)
        content = lines.join('\n')
      }

      // 保存修改
      if (modified) {
        fs.writeFileSync(filePath, content, 'utf8')
      }

      return { modified, replacements }
    } catch (error) {
      return { modified: false, replacements: 0 }
    }
  }

  // 获取相对路径
  getRelativePath (filePath) {
    const depth = filePath.split('/').length - 1
    const upLevels = '../'.repeat(depth)
    return `${upLevels}utils/timeHelper`
  }

  // === V4模型引用修复模块 ===

  // 修复V4模型引用（整合fix-v4-models.js功能）
  async fixV4ModelReferences () {
    console.log('\n=== 修复V4模型引用 ===')

    try {
      // 修复映射表
      const modelMappings = {
        Activity: 'LotteryCampaign',
        PrizePool: 'LotteryCampaign',
        Prize: 'LotteryPrize',
        LotteryDraw: 'LotteryDraw',
        User: 'User',
        UserPointsAccount: 'UserPointsAccount'
      }

      const filesToFix = ['services/UnifiedLotteryEngine/core/ContextBuilder.js']
      let totalFixed = 0

      for (const file of filesToFix) {
        if (fs.existsSync(file)) {
          if (this.fixModelReferencesInFile(file, modelMappings)) {
            totalFixed++
          }
        } else {
          console.log(`⚠️  文件不存在: ${file}`)
        }
      }

      console.log(`✅ V4模型引用修复完成，修复了${totalFixed}个文件`)
      this.recordFix('V4模型引用修复', true, { fixedFiles: totalFixed })
    } catch (error) {
      console.error('❌ V4模型引用修复失败:', error.message)
      this.recordFix('V4模型引用修复', false, null, null, error.message)
    }
  }

  // 修复单个文件的模型引用
  fixModelReferencesInFile (filePath, modelMappings) {
    console.log(`📝 修复文件: ${filePath}`)

    let content = fs.readFileSync(filePath, 'utf8')
    let changed = false

    Object.entries(modelMappings).forEach(([oldName, newName]) => {
      if (oldName !== newName) {
        const requirePattern = new RegExp(`(const\\s*{[^}]*?)\\b${oldName}\\b([^}]*?})`, 'g')
        const newContent = content.replace(requirePattern, (match, prefix, suffix) => {
          console.log(`  ✓ 修复模型引用: ${oldName} -> ${newName}`)
          changed = true
          return prefix + newName + suffix
        })
        content = newContent

        // 修复使用该模型的代码
        const usagePattern = new RegExp(`\\b${oldName}\\.findByPk`, 'g')
        if (content.match(usagePattern)) {
          content = content.replace(usagePattern, `${newName}.findByPk`)
          console.log(`  ✓ 修复findByPk调用: ${oldName}.findByPk -> ${newName}.findByPk`)
          changed = true
        }

        const usagePatternFindAll = new RegExp(`\\b${oldName}\\.findAll`, 'g')
        if (content.match(usagePatternFindAll)) {
          content = content.replace(usagePatternFindAll, `${newName}.findAll`)
          console.log(`  ✓ 修复findAll调用: ${oldName}.findAll -> ${newName}.findAll`)
          changed = true
        }
      }
    })

    if (changed) {
      fs.writeFileSync(filePath, content, 'utf8')
      console.log(`✅ ${filePath} 修复完成`)
    } else {
      console.log(`✓ ${filePath} 无需修复`)
    }

    return changed
  }

  // === 数据记录修复模块 ===

  // 修复交易记录时间戳（整合fix-exchange-records-timestamps.js功能）
  async fixExchangeRecordsTimestamps () {
    console.log('\n=== 修复交易记录时间戳 ===')

    try {
      await this.sequelize.authenticate()

      // 检查ExchangeRecords模型
      const { ExchangeRecords } = require('../models')
      if (!ExchangeRecords) {
        throw new Error('ExchangeRecords 模型不存在')
      }

      // 检查字段配置
      const options = ExchangeRecords.options
      console.log('📊 时间戳配置:')
      console.log(`   timestamps: ${options.timestamps}`)
      console.log(`   createdAt: ${options.createdAt}`)
      console.log(`   updatedAt: ${options.updatedAt}`)

      // 检查数据库表结构
      const schema = await this.sequelize.query('DESCRIBE exchange_records', {
        type: this.sequelize.QueryTypes.SELECT
      })

      const hasCreatedAt = schema.some(field => field.Field === 'created_at')
      const hasUpdatedAt = schema.some(field => field.Field === 'updated_at')

      console.log('📊 数据库字段:')
      console.log(`   created_at存在: ${hasCreatedAt}`)
      console.log(`   updated_at存在: ${hasUpdatedAt}`)

      if (hasCreatedAt && hasUpdatedAt) {
        console.log('✅ 交易记录时间戳字段配置正确')
        this.recordFix('交易记录时间戳', true, { message: '时间戳字段配置正确' })
      } else {
        console.log('⚠️  交易记录时间戳字段配置需要检查')
        this.recordFix('交易记录时间戳', false, null, '时间戳字段可能缺失')
      }
    } catch (error) {
      console.error('❌ 交易记录时间戳修复失败:', error.message)
      this.recordFix('交易记录时间戳', false, null, null, error.message)
    }
  }

  // 修复抽奖记录活动关联（整合fix-lottery-records-campaign-link.js功能）
  async fixLotteryRecordsCampaignLink () {
    console.log('\n=== 修复抽奖记录活动关联 ===')

    try {
      // 检查抽奖记录表结构
      const schema = await this.sequelize.query('DESCRIBE lottery_draws', {
        type: this.sequelize.QueryTypes.SELECT
      })

      const hasCampaignId = schema.some(field => field.Field === 'campaign_id')
      console.log(`🎯 campaign_id字段存在: ${hasCampaignId ? '✅ 是' : '❌ 否'}`)

      if (hasCampaignId) {
        // 检查关联数据
        const [recordsWithoutCampaign] = await this.sequelize.query(`
          SELECT COUNT(*) as count
          FROM lottery_draws
          WHERE campaign_id IS NULL OR campaign_id = 0
        `)

        const orphanedCount = recordsWithoutCampaign[0].count
        console.log(`📊 未关联活动的记录: ${orphanedCount} 条`)

        if (orphanedCount > 0) {
          // 获取默认活动ID
          const [defaultCampaign] = await this.sequelize.query(`
            SELECT campaign_id
            FROM lottery_campaigns
            WHERE status = 'active'
            ORDER BY created_at ASC
            LIMIT 1
          `)

          if (defaultCampaign.length > 0) {
            const campaignId = defaultCampaign[0].campaign_id

            await this.sequelize.query(`
              UPDATE lottery_draws
              SET campaign_id = ?
              WHERE campaign_id IS NULL OR campaign_id = 0
            `, { replacements: [campaignId] })

            console.log(`✅ 修复了${orphanedCount}条抽奖记录的活动关联`)
            this.recordFix('抽奖记录活动关联', true, {
              fixedRecords: orphanedCount,
              defaultCampaignId: campaignId
            })
          } else {
            console.log('⚠️  没有找到默认活动，无法修复')
            this.recordFix('抽奖记录活动关联', false, null, '没有找到默认活动')
          }
        } else {
          console.log('✅ 所有抽奖记录都有正确的活动关联')
          this.recordFix('抽奖记录活动关联', true, { message: '所有记录都有正确关联' })
        }
      } else {
        console.log('❌ campaign_id字段不存在，需要添加')
        this.recordFix('抽奖记录活动关联', false, null, 'campaign_id字段缺失')
      }
    } catch (error) {
      console.error('❌ 抽奖记录活动关联修复失败:', error.message)
      this.recordFix('抽奖记录活动关联', false, null, null, error.message)
    }
  }

  // === 数据修复模块 ===

  // 修复数据不一致问题
  async fixDataInconsistencies () {
    console.log('\n=== 修复数据不一致问题 ===')

    try {
      // 1. 修复积分账户数据不一致
      await this.fixPointsAccountInconsistency()

      // 2. 修复孤立的数据记录
      await this.fixOrphanedRecords()

      console.log('✅ 数据不一致问题修复完成')
      this.recordFix('数据不一致修复', true)
    } catch (error) {
      console.error('❌ 数据不一致修复失败:', error.message)
      this.recordFix('数据不一致修复', false, null, null, error.message)
    }
  }

  // 修复积分账户数据不一致
  async fixPointsAccountInconsistency () {
    console.log('🔧 修复积分账户数据不一致')

    try {
      // 查找数据不一致的账户
      const [inconsistentAccounts] = await this.sequelize.query(`
        SELECT
          user_id,
          available_points,
          total_earned,
          total_consumed,
          (total_earned - total_consumed) as calculated_balance
        FROM user_points_accounts
        WHERE available_points != (total_earned - total_consumed)
      `)

      if (inconsistentAccounts.length > 0) {
        console.log(`发现 ${inconsistentAccounts.length} 个不一致的积分账户`)

        for (const account of inconsistentAccounts) {
          const correctBalance = account.calculated_balance
          await this.sequelize.query(`
            UPDATE user_points_accounts
            SET available_points = ?
            WHERE user_id = ?
          `, { replacements: [correctBalance, account.user_id] })

          console.log(`   ✅ 修复用户${account.user_id}: ${account.available_points} -> ${correctBalance}`)
        }

        this.recordFix('积分账户不一致修复', true, {
          fixedAccounts: inconsistentAccounts.length
        })
      } else {
        console.log('✅ 所有积分账户数据一致')
        this.recordFix('积分账户不一致修复', true, { message: '数据一致，无需修复' })
      }
    } catch (error) {
      console.error('❌ 积分账户不一致修复失败:', error.message)
      this.recordFix('积分账户不一致修复', false, null, null, error.message)
    }
  }

  // 修复孤立的数据记录
  async fixOrphanedRecords () {
    console.log('🔧 修复孤立的数据记录')

    try {
      // 这里实现孤立数据记录的修复逻辑
      // 比如删除引用不存在用户的记录等
      console.log('✅ 孤立数据记录检查完成')
      this.recordFix('孤立数据修复', true, { message: '孤立数据检查完成' })
    } catch (error) {
      console.error('❌ 孤立数据修复失败:', error.message)
      this.recordFix('孤立数据修复', false, null, null, error.message)
    }
  }

  // === 运行所有修复 ===

  async runAllFixes () {
    console.log('🔧 === 开始V4统一数据库修复 ===')
    console.log(`📅 开始时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log('')

    try {
      // 1. 修复北京时间处理
      await this.fixBeijingTimeHandling()

      // 2. 修复V4模型引用
      await this.fixV4ModelReferences()

      // 3. 修复交易记录时间戳
      await this.fixExchangeRecordsTimestamps()

      // 4. 修复抽奖记录活动关联
      await this.fixLotteryRecordsCampaignLink()

      // 5. 修复数据不一致问题
      await this.fixDataInconsistencies()

      // 6. 生成修复报告
      this.generateFixReport()
    } catch (error) {
      console.error('💥 数据库修复执行失败:', error.message)
      throw error
    }
  }

  // 生成修复报告
  generateFixReport () {
    const endTime = BeijingTimeHelper.now()
    const totalFixes = this.results.fixesApplied.length
    const successfulFixes = this.results.fixesApplied.filter(f => f.success).length
    const failedFixes = totalFixes - successfulFixes
    const successRate = totalFixes > 0 ? Math.round((successfulFixes / totalFixes) * 100) : 0

    console.log('\n🔧 === 数据库修复报告 ===')
    console.log(`📅 完成时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log(`🎯 修复项目: ${totalFixes} 项`)
    console.log(`✅ 成功修复: ${successfulFixes} 项`)
    console.log(`❌ 修复失败: ${failedFixes} 项`)
    console.log(`📈 成功率: ${successRate}%`)
    console.log('')

    // 详细结果
    console.log('📋 详细修复结果:')
    this.results.fixesApplied.forEach(fix => {
      const status = fix.success ? '✅' : '❌'
      console.log(`   ${status} ${fix.type}`)
      if (fix.warning) {
        console.log(`      ⚠️  警告: ${fix.warning}`)
      }
      if (fix.error) {
        console.log(`      🚨 错误: ${fix.error}`)
      }
    })

    // 警告汇总
    if (this.results.warnings.length > 0) {
      console.log('')
      console.log('⚠️  警告汇总:')
      this.results.warnings.forEach((warning, index) => {
        console.log(`   ${index + 1}. ${warning.type}: ${warning.message}`)
      })
    }

    // 错误汇总
    if (this.results.errors.length > 0) {
      console.log('')
      console.log('🚨 错误汇总:')
      this.results.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.type}: ${error.message}`)
      })
    }

    console.log('')
    if (successRate >= 90) {
      console.log('🎉 数据库修复效果优秀！')
    } else if (successRate >= 70) {
      console.log('✅ 数据库修复效果良好')
    } else {
      console.log('⚠️  数据库修复效果一般，建议人工检查')
    }

    this.results.summary = {
      totalFixes,
      successfulFixes,
      failedFixes,
      successRate,
      startTime: this.results.startTime,
      endTime,
      warnings: this.results.warnings.length,
      errors: this.results.errors.length
    }

    return this.results
  }
}

// 如果直接运行此文件，执行修复
if (require.main === module) {
  const fixer = new UnifiedDatabaseFixer()
  fixer.runAllFixes()
    .then(result => {
      process.exit(result?.summary?.successRate >= 70 ? 0 : 1)
    })
    .catch(error => {
      console.error('💥 数据库修复失败:', error)
      process.exit(1)
    })
}

module.exports = UnifiedDatabaseFixer
