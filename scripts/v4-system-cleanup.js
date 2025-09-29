#!/usr/bin/env node

/**
 * V4系统综合清理脚本
 * 解决：抽奖策略配置、mock数据清理、测试代码修复
 * 创建时间：2025年01月21日
 * 使用 Claude Sonnet 4 模型
 */

'use strict'

const fs = require('fs')
const path = require('path')

class V4SystemCleanup {
  constructor () {
    this.cleanupResults = {
      timestamp: new Date().toISOString(),
      strategyFixes: [],
      mockDataCleaned: [],
      testsFixed: [],
      errors: []
    }
  }

  /**
   * 执行完整系统清理
   */
  async runCompleteCleanup () {
    console.log('🧹 === V4系统综合清理开始 ===')
    console.log(`📅 开始时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)

    try {
      // 1. 修复抽奖策略配置问题
      console.log('\n🎯 阶段1: 修复抽奖策略配置')
      await this.fixLotteryStrategyConfiguration()

      // 2. 清理真正的mock数据（保留测试用户）
      console.log('\n🧹 阶段2: 清理Mock数据')
      await this.cleanupMockData()

      // 3. 修复测试代码
      console.log('\n🔧 阶段3: 修复测试代码')
      await this.fixTestCodes()

      // 4. 更新配置文件
      console.log('\n⚙️ 阶段4: 更新配置文件')
      await this.updateConfigurations()

      // 5. 生成清理报告
      console.log('\n📋 阶段5: 生成清理报告')
      this.generateCleanupReport()
    } catch (error) {
      console.error('❌ 系统清理失败:', error.message)
      this.cleanupResults.errors.push({
        stage: 'main',
        error: error.message,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * 修复抽奖策略配置问题
   */
  async fixLotteryStrategyConfiguration () {
    try {
      console.log('🔍 检查抽奖策略配置...')

      // 实际策略架构: BasicGuaranteeStrategy + ManagementStrategy
      const _actualStrategies = ['basic_guarantee', 'management']

      // 1. 更新configure-lottery-strategies.js
      const configPath = 'scripts/configure-lottery-strategies.js'
      if (fs.existsSync(configPath)) {
        let content = fs.readFileSync(configPath, 'utf8')

        // 更新启用的策略列表
        content = content.replace(
          /enabledStrategies = \[([\s\S]*?)\]/,
          `enabledStrategies = [
      'basic_guarantee', // 基础+保底组合策略 - V4架构优化
      'management' // 管理抽奖策略 - 管理员预设奖品功能
    ]`
        )

        fs.writeFileSync(configPath, content, 'utf8')
        this.cleanupResults.strategyFixes.push('更新configure-lottery-strategies.js')
        console.log('  ✅ 更新抽奖策略配置文件')
      }

      // 2. 更新UnifiedLotteryEngine中的期待策略
      const enginePath = 'services/UnifiedLotteryEngine/UnifiedLotteryEngine.js'
      if (fs.existsSync(enginePath)) {
        const content = fs.readFileSync(enginePath, 'utf8')

        // 确保注册了正确的策略
        if (!content.includes('basic_guarantee') || !content.includes('management')) {
          console.log('  ⚠️ UnifiedLotteryEngine策略注册可能需要检查')
        } else {
          console.log('  ✅ UnifiedLotteryEngine策略注册正确')
        }
      }

      console.log('✅ 抽奖策略配置修复完成')
    } catch (error) {
      console.error('❌ 抽奖策略配置修复失败:', error.message)
      this.cleanupResults.errors.push({
        stage: 'strategy_config',
        error: error.message
      })
    }
  }

  /**
   * 清理Mock数据（保留测试用户13612227930）
   */
  async cleanupMockData () {
    try {
      console.log('🔍 识别需要清理的Mock数据...')

      const mockPatterns = [
        /fake.*user|dummy.*user/gi,
        /mock.*data/gi,
        /test.*phone.*(?!13612227930)/gi, // 排除13612227930
        /模拟.*用户/gi,
        /假.*数据/gi,
        /测试.*用户.*(?!13612227930)/gi
      ]

      const filesToClean = []

      // 扫描需要清理的文件
      const scanDirectory = dir => {
        const items = fs.readdirSync(dir)

        for (const item of items) {
          if (item === 'node_modules' || item === '.git' || item.startsWith('.')) continue

          const fullPath = path.join(dir, item)
          const stat = fs.statSync(fullPath)

          if (stat.isDirectory()) {
            scanDirectory(fullPath)
          } else if (item.endsWith('.js') && !item.includes('test') && !item.includes('spec')) {
            try {
              const content = fs.readFileSync(fullPath, 'utf8')

              // 检查是否包含需要清理的mock数据
              const hasMockData = mockPatterns.some(pattern => {
                const matches = content.match(pattern)
                if (matches) {
                  // 排除13612227930（这是真实测试用户）
                  return !matches.some(_match => content.includes('13612227930'))
                }
                return false
              })

              if (hasMockData) {
                filesToClean.push(fullPath)
              }
            } catch (error) {
              // 忽略读取错误
            }
          }
        }
      }

      scanDirectory(process.cwd())

      console.log(`📋 发现${filesToClean.length}个文件可能包含Mock数据`)

      // 标记但不自动删除，需要手动审查
      if (filesToClean.length > 0) {
        console.log('⚠️ 需要手动审查的文件:')
        filesToClean.forEach(file => {
          console.log(`   📄 ${file}`)
        })
        console.log('🎯 建议：手动检查这些文件，清理非必要的mock数据')
      }

      this.cleanupResults.mockDataCleaned = filesToClean

      console.log('✅ Mock数据扫描完成（保留测试用户13612227930）')
    } catch (error) {
      console.error('❌ Mock数据清理失败:', error.message)
      this.cleanupResults.errors.push({
        stage: 'mock_cleanup',
        error: error.message
      })
    }
  }

  /**
   * 修复测试代码
   */
  async fixTestCodes () {
    try {
      console.log('🔍 修复测试代码中的策略期待...')

      // 需要修复的测试文件
      const testFiles = [
        'tests/services/UnifiedLotteryEngine/UnifiedLotteryEngine.test.js',
        'tests/api/v4.unified-engine.lottery.test.js',
        'tests/services/UnifiedLotteryEngine/strategies/StrategyTestSuite.test.js'
      ]

      for (const testFile of testFiles) {
        if (fs.existsSync(testFile)) {
          try {
            let content = fs.readFileSync(testFile, 'utf8')
            let modified = false

            // 修复期待的策略列表
            if (content.includes('\'basic\'') && content.includes('\'guarantee\'')) {
              // 替换分开的basic和guarantee为组合的basic_guarantee
              content = content.replace(
                /expect\(strategyNames\)\.toContain\('basic'\)/g,
                'expect(strategyNames).toContain(\'basic_guarantee\')'
              )
              content = content.replace(
                /expect\(strategyNames\)\.toContain\('guarantee'\)/g,
                '// guarantee策略已合并到basic_guarantee中'
              )
              modified = true
            }

            // 修复策略期待数组
            content = content.replace(
              /\['basic', 'guarantee', 'management'\]/g,
              '[\'basic_guarantee\', \'management\']'
            )

            // 修复策略属性检查
            content = content.replace(
              /toHaveProperty\('basic'\)/g,
              'toHaveProperty(\'basic_guarantee\')'
            )
            content = content.replace(
              /toHaveProperty\('guarantee'\)/g,
              'toHaveProperty(\'basic_guarantee\') // guarantee合并到basic_guarantee'
            )

            if (modified || content.includes('basic_guarantee')) {
              fs.writeFileSync(testFile, content, 'utf8')
              this.cleanupResults.testsFixed.push(testFile)
              console.log(`  ✅ 修复测试文件: ${testFile}`)
            }
          } catch (error) {
            console.warn(`  ⚠️ 无法修复测试文件 ${testFile}: ${error.message}`)
          }
        }
      }

      console.log('✅ 测试代码修复完成')
    } catch (error) {
      console.error('❌ 测试代码修复失败:', error.message)
      this.cleanupResults.errors.push({
        stage: 'test_fixes',
        error: error.message
      })
    }
  }

  /**
   * 更新配置文件
   */
  async updateConfigurations () {
    try {
      console.log('🔍 更新配置文件...')

      // 1. 确保package.json脚本正确
      const packagePath = 'package.json'
      if (fs.existsSync(packagePath)) {
        const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

        // 检查是否有正确的启动脚本
        if (!packageData.scripts['pm:start:pm2']) {
          console.log('  ⚠️ 缺少pm:start:pm2脚本，请添加')
        } else {
          console.log('  ✅ PM2启动脚本配置正确')
        }
      }

      // 2. 检查.env配置
      if (fs.existsSync('.env')) {
        const envContent = fs.readFileSync('.env', 'utf8')

        if (!envContent.includes('restaurant_points_dev')) {
          console.log('  ⚠️ 数据库配置可能需要检查')
        } else {
          console.log('  ✅ 数据库配置正确')
        }
      }

      console.log('✅ 配置文件检查完成')
    } catch (error) {
      console.error('❌ 配置文件更新失败:', error.message)
      this.cleanupResults.errors.push({
        stage: 'config_update',
        error: error.message
      })
    }
  }

  /**
   * 生成清理报告
   */
  generateCleanupReport () {
    console.log('\n📊 === V4系统清理报告 ===')
    console.log(`📅 完成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
    console.log('')

    console.log('🎯 抽奖策略修复:')
    if (this.cleanupResults.strategyFixes.length > 0) {
      this.cleanupResults.strategyFixes.forEach(fix => {
        console.log(`  ✅ ${fix}`)
      })
    } else {
      console.log('  ℹ️ 无需修复')
    }

    console.log('\n🧹 Mock数据清理:')
    if (this.cleanupResults.mockDataCleaned.length > 0) {
      console.log(`  📋 识别到${this.cleanupResults.mockDataCleaned.length}个文件需要手动审查`)
    } else {
      console.log('  ✅ 未发现需要清理的Mock数据')
    }

    console.log('\n🔧 测试代码修复:')
    if (this.cleanupResults.testsFixed.length > 0) {
      this.cleanupResults.testsFixed.forEach(test => {
        console.log(`  ✅ ${test}`)
      })
    } else {
      console.log('  ℹ️ 无需修复')
    }

    if (this.cleanupResults.errors.length > 0) {
      console.log('\n❌ 错误记录:')
      this.cleanupResults.errors.forEach(error => {
        console.log(`  🔴 ${error.stage}: ${error.error}`)
      })
    }

    console.log('\n✅ V4系统清理完成!')
  }
}

// 运行清理脚本
if (require.main === module) {
  const cleanup = new V4SystemCleanup()
  cleanup
    .runCompleteCleanup()
    .then(() => {
      console.log('\n🎉 V4系统清理脚本执行完成!')
      process.exit(0)
    })
    .catch(error => {
      console.error('\n💥 V4系统清理脚本执行失败:', error.message)
      process.exit(1)
    })
}

module.exports = V4SystemCleanup
