/**
 * 项目全面审计脚本
 *
 * 功能：系统性排查后端和前端的潜在问题
 * 用途：定期运行，发现隐藏问题
 *
 * 创建时间：2025年11月23日
 */

const fs = require('fs')
const glob = require('glob')
const path = require('path')

class ProjectAuditor {
  constructor() {
    this.issues = []
  }

  /**
   * 1. 检查前端API调用与后端实现的一致性
   */
  async checkFrontendBackendSync() {
    console.log('\n=== 🔍 检查1：前后端API同步性 ===\n')

    const htmlFiles = glob.sync('public/admin/*.html')
    const apiCalls = new Set()
    const apiDetails = []

    // 扫描前端API调用
    htmlFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8')
      const filename = path.basename(file)

      // 匹配 apiRequest('/api/v4/...')
      const matches = content.matchAll(
        /apiRequest\(['"]([^'"]+)['"],?\s*\{[^}]*method:\s*['"](\w+)['"]/g
      )
      for (const match of matches) {
        const api = `${match[2]} ${match[1]}`
        apiCalls.add(api)
        apiDetails.push({ file: filename, method: match[2], path: match[1] })
      }

      // 匹配 apiRequest('/api/v4/...') 默认GET
      const getMatches = content.matchAll(/apiRequest\(['"]([^'"]+)['"]\)/g)
      for (const match of matches) {
        if (!match[1].includes('{')) {
          const api = `GET ${match[1]}`
          apiCalls.add(api)
          apiDetails.push({ file: filename, method: 'GET', path: match[1] })
        }
      }
    })

    console.log(`📊 前端API调用统计: ${apiCalls.size}个不同API\n`)

    // 按文件分组显示
    const byFile = {}
    apiDetails.forEach(detail => {
      if (!byFile[detail.file]) byFile[detail.file] = []
      byFile[detail.file].push(`${detail.method} ${detail.path}`)
    })

    Object.entries(byFile).forEach(([file, apis]) => {
      console.log(`  ${file}: ${apis.length}个API`)
      // 显示前3个
      apis.slice(0, 3).forEach(api => console.log(`    - ${api}`))
      if (apis.length > 3) console.log(`    ... 还有${apis.length - 3}个`)
    })

    return { apiCalls: Array.from(apiCalls), count: apiCalls.size }
  }

  /**
   * 2. 检查可能的Sequelize对象展开问题
   */
  checkSequelizeSpread() {
    console.log('\n=== 🔍 检查2：Sequelize对象展开问题 ===\n')

    const jsFiles = glob.sync('{routes,services}/**/*.js')
    const suspiciousCode = []

    jsFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8')
      const lines = content.split('\n')

      lines.forEach((line, index) => {
        // 检测可疑的展开操作
        if (
          line.includes('...') &&
          line.includes('map') &&
          !line.includes('toJSON') &&
          !line.includes('dataValues')
        ) {
          // 排除注释行
          if (!line.trim().startsWith('//') && !line.trim().startsWith('*')) {
            suspiciousCode.push({
              file: path.relative(process.cwd(), file),
              line: index + 1,
              code: line.trim().substring(0, 80)
            })
          }
        }
      })
    })

    if (suspiciousCode.length > 0) {
      console.log(`⚠️ 发现${suspiciousCode.length}处可疑的对象展开操作:\n`)
      suspiciousCode.slice(0, 10).forEach(item => {
        console.log(`  ${item.file}:${item.line}`)
        console.log(`    ${item.code}`)
      })

      if (suspiciousCode.length > 10) {
        console.log(`\n  ... 还有${suspiciousCode.length - 10}处\n`)
      }

      console.log('\n💡 建议检查是否为Sequelize对象，如果是请使用ModelConverter\n')

      this.issues.push({
        type: 'SEQUELIZE_SPREAD',
        count: suspiciousCode.length,
        items: suspiciousCode
      })
    } else {
      console.log('✅ 未发现明显的Sequelize展开问题\n')
    }

    return suspiciousCode
  }

  /**
   * 3. 检查配置在数据库和代码中的重复定义
   */
  async checkConfigDuplication() {
    console.log('=== 🔍 检查3：配置重复定义 ===\n')

    try {
      const models = require('../models')

      // 获取数据库配置
      const dbSettings = await models.SystemSettings.findAll()
      const dbKeys = dbSettings.map(s => s.setting_key)

      // 获取代码配置关键字
      const businessConfig = require('../config/business.config')
      const codeConfigContent = JSON.stringify(businessConfig).toLowerCase()

      const duplicates = []
      dbKeys.forEach(key => {
        const keyLower = key.toLowerCase().replace(/_/g, '')
        if (codeConfigContent.includes(keyLower)) {
          duplicates.push({
            db_key: key,
            category: dbSettings.find(s => s.setting_key === key).category
          })
        }
      })

      if (duplicates.length > 0) {
        console.log(`⚠️ 发现${duplicates.length}个可能重复的配置:\n`)
        duplicates.forEach(dup => {
          console.log(`  - ${dup.db_key} (${dup.category})`)
        })
        console.log('\n💡 建议检查是否真的冲突，参考配置分层架构文档\n')

        this.issues.push({
          type: 'CONFIG_DUPLICATION',
          count: duplicates.length,
          items: duplicates
        })
      } else {
        console.log('✅ 未发现配置重复定义\n')
      }

      await models.sequelize.close()
      return duplicates
    } catch (error) {
      console.error('配置检查失败:', error.message)
      return []
    }
  }

  /**
   * 4. 检查前端页面中的过时提示和警告
   */
  checkFrontendWarnings() {
    console.log('=== 🔍 检查4：前端过时警告 ===\n')

    const htmlFiles = glob.sync('public/admin/*.html')
    const warnings = []

    const warningPatterns = [
      '功能暂未实现',
      '暂未实现',
      'API不存在',
      '后端暂未实现',
      '需要后端开发',
      '需要后端实现',
      '请联系后端开发团队'
    ]

    htmlFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8')
      const filename = path.basename(file)

      warningPatterns.forEach(pattern => {
        const regex = new RegExp(pattern, 'g')
        const matches = content.match(regex)
        if (matches) {
          warnings.push({
            file: filename,
            pattern,
            count: matches.length
          })
        }
      })
    })

    if (warnings.length > 0) {
      console.log(`⚠️ 发现${warnings.length}处过时警告:\n`)
      warnings.forEach(warn => {
        console.log(`  ${warn.file}: "${warn.pattern}" x${warn.count}`)
      })
      console.log('\n💡 建议更新前端页面，移除过时的警告提示\n')

      this.issues.push({
        type: 'FRONTEND_WARNINGS',
        count: warnings.length,
        items: warnings
      })
    } else {
      console.log('✅ 前端页面无过时警告\n')
    }

    return warnings
  }

  /**
   * 5. 检查路由中使用但未实现的验证器
   */
  checkValidators() {
    console.log('=== 🔍 检查5：验证器完整性 ===\n')

    const routeFiles = glob.sync('routes/**/*.js')
    const usedValidators = new Set()

    routeFiles.forEach(file => {
      const content = fs.readFileSync(file, 'utf8')
      const matches = content.matchAll(/validators\.(\w+)\(/g)
      for (const match of matches) {
        usedValidators.add(match[1])
      }
    })

    // 检查已实现的验证器
    const middlewareFile = 'routes/v4/unified-engine/admin/shared/middleware.js'
    if (!fs.existsSync(middlewareFile)) {
      console.log('⚠️ 验证器文件不存在\n')
      return []
    }

    const middlewareContent = fs.readFileSync(middlewareFile, 'utf8')
    const implementedValidators = new Set()

    const implMatches = middlewareContent.matchAll(/(\w+):\s*(?:function|\(|\w+\s*=>)/g)
    for (const match of implMatches) {
      if (match[1].startsWith('validate')) {
        implementedValidators.add(match[1])
      }
    }

    const missing = []
    usedValidators.forEach(validator => {
      if (!implementedValidators.has(validator)) {
        missing.push(validator)
      }
    })

    console.log(`📊 使用的验证器: ${usedValidators.size}个`)
    console.log(`📊 已实现的验证器: ${implementedValidators.size}个\n`)

    if (missing.length > 0) {
      console.log(`❌ 发现${missing.length}个缺失的验证器:\n`)
      missing.forEach(name => console.log(`  - ${name}`))
      console.log('\n💡 建议在shared/middleware.js中添加\n')

      this.issues.push({
        type: 'MISSING_VALIDATORS',
        count: missing.length,
        items: missing
      })
    } else {
      console.log('✅ 所有验证器都已实现\n')
    }

    return missing
  }

  /**
   * 6. 检查数据库模型注册完整性
   */
  async checkModelRegistration() {
    console.log('=== 🔍 检查6：数据库模型注册 ===\n')

    try {
      const modelFiles = glob.sync('models/*.js').filter(f => !f.includes('index.js'))
      const modelIndexContent = fs.readFileSync('models/index.js', 'utf8')

      const unregistered = []
      modelFiles.forEach(file => {
        const modelName = path.basename(file, '.js')
        if (!modelIndexContent.includes(`models.${modelName}`)) {
          unregistered.push(modelName)
        }
      })

      console.log(`📊 模型文件: ${modelFiles.length}个`)

      if (unregistered.length > 0) {
        console.log(`\n⚠️ 发现${unregistered.length}个未注册的模型:\n`)
        unregistered.forEach(name => console.log(`  - ${name}`))
        console.log('\n💡 建议在models/index.js中注册\n')

        this.issues.push({
          type: 'UNREGISTERED_MODELS',
          count: unregistered.length,
          items: unregistered
        })
      } else {
        console.log('✅ 所有模型都已注册\n')
      }

      return unregistered
    } catch (error) {
      console.error('模型检查失败:', error.message)
      return []
    }
  }

  /**
   * 生成审计报告
   */
  generateReport() {
    console.log('\n' + '='.repeat(60))
    console.log('📋 项目审计报告')
    console.log('='.repeat(60) + '\n')

    if (this.issues.length === 0) {
      console.log('🎉 未发现问题！项目健康状态良好。\n')
      return { status: 'HEALTHY', issues: [] }
    }

    console.log(`⚠️ 发现 ${this.issues.length} 类问题:\n`)

    this.issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.type}: ${issue.count}个`)
    })

    console.log('\n💡 建议:')
    console.log('  1. 优先修复高优先级问题（配置冲突、验证器缺失）')
    console.log('  2. 参考 docs/系统性问题预防方案-配置管理和个性化功能.md')
    console.log('  3. 使用提供的自动化工具辅助修复\n')

    return { status: 'HAS_ISSUES', issues: this.issues }
  }

  /**
   * 执行完整审计
   */
  async run() {
    console.log('🔍 开始项目全面审计...')
    console.log('时间:', new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))

    await this.checkFrontendBackendSync()
    this.checkSequelizeSpread()
    await this.checkConfigDuplication()
    this.checkFrontendWarnings()
    this.checkValidators()
    await this.checkModelRegistration()

    return this.generateReport()
  }
}

// 执行审计
;(async () => {
  try {
    const auditor = new ProjectAuditor()
    const report = await auditor.run()

    // 如果有严重问题，退出码1
    const hasCritical = report.issues.some(i =>
      ['CONFIG_DUPLICATION', 'MISSING_VALIDATORS', 'UNREGISTERED_MODELS'].includes(i.type)
    )

    process.exit(hasCritical ? 1 : 0)
  } catch (error) {
    console.error('审计失败:', error.message)
    process.exit(1)
  }
})()
