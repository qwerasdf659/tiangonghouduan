/**
 * 验证器完整性检查脚本
 *
 * 功能：扫描所有API路由中使用的验证器，确保都已实现
 * 用途：防止运行时出现"validators.xxx is not a function"错误
 *
 * 创建时间：2025年11月23日
 */

const fs = require('fs')
const glob = require('glob')
const path = require('path')

/**
 * 验证器完整性检查器
 */
class ValidatorChecker {
  constructor() {
    this.usedValidators = new Set()
    this.implementedValidators = new Set()
  }

  /**
   * 扫描路由文件中使用的验证器
   */
  scanUsedValidators() {
    console.log('🔍 扫描路由文件中使用的验证器...\n')

    const routeFiles = glob.sync('routes/**/*.js')

    routeFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8')

      // 匹配 validators.validateXxx()
      const matches = content.matchAll(/validators\.(\w+)\(/g)
      for (const match of matches) {
        this.usedValidators.add(match[1])
      }
    })

    console.log(`📊 发现使用的验证器: ${this.usedValidators.size}个`)
    Array.from(this.usedValidators).forEach(name => {
      console.log(`   - ${name}`)
    })
  }

  /**
   * 扫描已实现的验证器
   */
  scanImplementedValidators() {
    console.log('\n🔍 扫描已实现的验证器...\n')

    const middlewareFile = 'routes/v4/console/shared/middleware.js'
    const content = fs.readFileSync(middlewareFile, 'utf8')

    // 匹配 validateXxx: function 或 validateXxx: () =>
    const matches = content.matchAll(/(\w+):\s*(?:function|\(|\w+\s*=>)/g)
    for (const match of matches) {
      if (match[1].startsWith('validate')) {
        this.implementedValidators.add(match[1])
      }
    }

    console.log(`📊 已实现的验证器: ${this.implementedValidators.size}个`)
    Array.from(this.implementedValidators).forEach(name => {
      console.log(`   - ${name}`)
    })
  }

  /**
   * 检查缺失的验证器
   */
  checkMissing() {
    console.log('\n🔍 检查缺失的验证器...\n')

    const missing = []
    this.usedValidators.forEach(validator => {
      if (!this.implementedValidators.has(validator)) {
        missing.push(validator)
      }
    })

    if (missing.length > 0) {
      console.log('❌ 发现缺失的验证器:\n')
      missing.forEach(name => {
        console.log(`   - ${name}`)
      })

      console.log('\n💡 解决方案:')
      console.log('   1. 在 routes/v4/console/shared/middleware.js 中添加')
      console.log('   2. 参考 validateUserId 的实现方式')
      console.log('   3. 添加完整的JSDoc注释\n')

      return { missing, count: missing.length }
    } else {
      console.log('✅ 所有验证器都已实现\n')
      return { missing: [], count: 0 }
    }
  }

  /**
   * 执行完整检查
   */
  run() {
    this.scanUsedValidators()
    this.scanImplementedValidators()
    return this.checkMissing()
  }
}

// 执行检查
try {
  const checker = new ValidatorChecker()
  const result = checker.run()

  // 如果有缺失，退出码1
  process.exit(result.count > 0 ? 1 : 0)
} catch (error) {
  console.error('执行失败:', error.message)
  process.exit(1)
}
