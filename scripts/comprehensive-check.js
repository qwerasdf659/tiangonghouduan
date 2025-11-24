#!/usr/bin/env node
/**
 * DevBox全面系统排查脚本
 * 检查后端数据库和前端Web管理系统的潜在问题
 *
 * 使用方式：node scripts/comprehensive-check.js
 *
 * 创建时间：2025年11月23日
 */

// 加载环境变量
require('dotenv').config()

const fs = require('fs')
const path = require('path')

// 颜色输出辅助函数
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
}

function log (message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

/**
 * 1. 检查前端HTML文件中的不安全DOM操作
 */
function checkUnsafeDOMOperations () {
  log('\n📋 检查1: 前端不安全DOM操作', 'cyan')
  log('='.repeat(60), 'cyan')

  const publicDir = path.join(__dirname, '../public/admin')
  const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'))

  const unsafePatterns = [
    {
      pattern: /document\.getElementById\([^)]+\)\.addEventListener/g,
      description: '直接调用addEventListener，没有null检查',
      suggestion: '使用 DOMUtils.safeAddEventListener()'
    },
    {
      pattern: /document\.getElementById\([^)]+\)\.innerHTML\s*=/g,
      description: '直接设置innerHTML，没有null检查',
      suggestion: '使用 DOMUtils.safeSetHTML()'
    },
    {
      pattern: /document\.getElementById\([^)]+\)\.value/g,
      description: '直接访问value属性，可能为null',
      suggestion: '使用 DOMUtils.safeGetValue() 或先检查null'
    },
    {
      pattern: /document\.getElementById\([^)]+\)\.style\./g,
      description: '直接修改style，没有null检查',
      suggestion: '使用 DOMUtils.safeShow()/safeHide()'
    },
    {
      pattern: /document\.getElementById\([^)]+\)\.classList\./g,
      description: '直接操作classList，没有null检查',
      suggestion: '使用 DOMUtils.safeAddClass()/safeRemoveClass()'
    }
  ]

  let totalIssues = 0
  const issuesByFile = {}

  files.forEach(file => {
    const filePath = path.join(publicDir, file)
    const content = fs.readFileSync(filePath, 'utf8')

    const fileIssues = []

    unsafePatterns.forEach(({ pattern, description, suggestion }) => {
      const matches = content.match(pattern)
      if (matches && matches.length > 0) {
        fileIssues.push({
          type: description,
          count: matches.length,
          suggestion,
          examples: matches.slice(0, 3) // 只显示前3个示例
        })
        totalIssues += matches.length
      }
    })

    if (fileIssues.length > 0) {
      issuesByFile[file] = fileIssues
    }
  })

  // 输出结果
  if (totalIssues === 0) {
    log('✅ 未发现不安全的DOM操作', 'green')
  } else {
    log(`⚠️ 发现 ${totalIssues} 处潜在不安全的DOM操作`, 'yellow')

    Object.entries(issuesByFile).forEach(([file, issues]) => {
      log(`\n   📄 ${file}:`, 'yellow')
      issues.forEach(issue => {
        log(`      ❌ ${issue.type} (${issue.count}处)`, 'red')
        log(`         💡 建议: ${issue.suggestion}`, 'blue')
        if (issue.examples.length > 0) {
          log(`         示例: ${issue.examples[0].substring(0, 60)}...`, 'reset')
        }
      })
    })
  }

  return { totalIssues, issuesByFile }
}

/**
 * 2. 检查后端API路由的完整性
 */
function checkBackendAPICompleteness () {
  log('\n📋 检查2: 后端API路由完整性', 'cyan')
  log('='.repeat(60), 'cyan')

  const routesDir = path.join(__dirname, '../routes')
  const issues = []

  // 检查必需的API端点
  const requiredAPIs = [
    { path: 'v4/unified-engine/auth.js', endpoint: 'POST /login', description: '用户登录' },
    { path: 'v4/unified-engine/auth.js', endpoint: 'POST /logout', description: '用户登出' },
    { path: 'v4/unified-engine/lottery-preset.js', endpoint: 'GET /list', description: '获取预设列表' },
    { path: 'v4/unified-engine/lottery-preset.js', endpoint: 'POST /create', description: '创建预设' },
    { path: 'v4/unified-engine/admin.js', endpoint: 'GET /dashboard', description: '管理员仪表板' }
  ]

  requiredAPIs.forEach(api => {
    const filePath = path.join(routesDir, api.path)

    if (!fs.existsSync(filePath)) {
      issues.push({
        type: 'FILE_MISSING',
        file: api.path,
        description: '路由文件不存在'
      })
      return
    }

    const content = fs.readFileSync(filePath, 'utf8')
    const method = api.endpoint.split(' ')[0].toLowerCase()
    const route = api.endpoint.split(' ')[1]

    // 检查是否定义了该端点
    const routePattern = new RegExp(`router\\.${method}\\(['"](${route}|${route.replace(/\//g, '\\/')})['"\\s,]`)

    if (!routePattern.test(content)) {
      issues.push({
        type: 'ENDPOINT_MISSING',
        file: api.path,
        endpoint: api.endpoint,
        description: api.description
      })
    }
  })

  if (issues.length === 0) {
    log('✅ 所有必需的API端点已实现', 'green')
  } else {
    log(`❌ 发现 ${issues.length} 个API问题`, 'red')
    issues.forEach(issue => {
      if (issue.type === 'FILE_MISSING') {
        log(`   📄 ${issue.file}: 文件不存在`, 'red')
      } else {
        log(`   📄 ${issue.file}:`, 'yellow')
        log(`      ❌ 缺少端点: ${issue.endpoint} (${issue.description})`, 'red')
      }
    })
  }

  return { issues }
}

/**
 * 3. 检查数据库模型关联完整性
 */
function checkDatabaseModelAssociations () {
  log('\n📋 检查3: 数据库模型关联完整性', 'cyan')
  log('='.repeat(60), 'cyan')

  const modelsDir = path.join(__dirname, '../models')

  if (!fs.existsSync(modelsDir)) {
    log('❌ models目录不存在', 'red')
    return { issues: ['models目录不存在'] }
  }

  const modelFiles = fs.readdirSync(modelsDir).filter(f =>
    f.endsWith('.js') && f !== 'index.js'
  )

  const issues = []
  const modelAssociations = {}

  modelFiles.forEach(file => {
    const filePath = path.join(modelsDir, file)
    const content = fs.readFileSync(filePath, 'utf8')

    const modelName = file.replace('.js', '')

    // 检查是否有associate方法
    if (!content.includes('static associate')) {
      // 某些模型可能不需要关联，这不是错误
      return
    }

    // 提取关联定义
    const hasMany = content.match(/this\.hasMany\([^)]+\)/g) || []
    const belongsTo = content.match(/this\.belongsTo\([^)]+\)/g) || []
    const belongsToMany = content.match(/this\.belongsToMany\([^)]+\)/g) || []

    modelAssociations[modelName] = {
      hasMany: hasMany.length,
      belongsTo: belongsTo.length,
      belongsToMany: belongsToMany.length,
      total: hasMany.length + belongsTo.length + belongsToMany.length
    }

    // 检查外键字段是否存在对应的关联定义
    const foreignKeyPattern = /(\w+_id):/g
    let match
    while ((match = foreignKeyPattern.exec(content)) !== null) {
      const foreignKey = match[1]

      // 检查是否有对应的belongsTo关联
      const relatedModel = foreignKey.replace(/_id$/, '')
      const hasBelongsTo = content.includes(`belongsTo(models.${relatedModel}`) ||
                          content.includes(`belongsTo(models.${capitalize(relatedModel)}`)

      if (!hasBelongsTo && relatedModel !== 'created' && relatedModel !== 'updated') {
        issues.push({
          model: modelName,
          foreignKey,
          suggestion: '可能缺少 belongsTo 关联定义'
        })
      }
    }
  })

  if (issues.length === 0) {
    log('✅ 数据库模型关联检查通过', 'green')
    log(`   📊 检查了 ${modelFiles.length} 个模型文件`, 'blue')

    // 显示关联统计
    Object.entries(modelAssociations).forEach(([model, assoc]) => {
      if (assoc.total > 0) {
        log(`   📋 ${model}: ${assoc.hasMany} hasMany, ${assoc.belongsTo} belongsTo, ${assoc.belongsToMany} belongsToMany`, 'reset')
      }
    })
  } else {
    log(`⚠️ 发现 ${issues.length} 个潜在的关联问题`, 'yellow')
    issues.forEach(issue => {
      log(`   📄 ${issue.model}:`, 'yellow')
      log(`      ⚠️ ${issue.foreignKey} - ${issue.suggestion}`, 'yellow')
    })
  }

  return { issues, modelAssociations }
}

/**
 * 4. 检查API错误处理完整性
 */
function checkAPIErrorHandling () {
  log('\n📋 检查4: API错误处理完整性', 'cyan')
  log('='.repeat(60), 'cyan')

  const routesDir = path.join(__dirname, '../routes')
  const issues = []

  function scanRoutes (dir) {
    const files = fs.readdirSync(dir)

    files.forEach(file => {
      const filePath = path.join(dir, file)
      const stat = fs.statSync(filePath)

      if (stat.isDirectory()) {
        scanRoutes(filePath)
      } else if (file.endsWith('.js')) {
        const content = fs.readFileSync(filePath, 'utf8')

        // 检查是否有路由定义
        const hasRoutes = /router\.(get|post|put|delete|patch)/.test(content)
        if (!hasRoutes) return

        // 检查是否有try-catch
        const hasTryCatch = /try\s*{/.test(content)

        // 检查是否有错误处理
        const hasErrorHandling = /catch\s*\([^)]*error[^)]*\)/.test(content)

        // 检查是否有res.apiError或res.apiInternalError
        const hasApiError = /res\.apiError|res\.apiInternalError/.test(content)

        if (hasRoutes && !hasTryCatch) {
          issues.push({
            file: path.relative(routesDir, filePath),
            type: 'NO_TRY_CATCH',
            description: '路由中缺少try-catch错误处理'
          })
        } else if (hasRoutes && hasTryCatch && !hasApiError) {
          issues.push({
            file: path.relative(routesDir, filePath),
            type: 'NO_API_ERROR',
            description: '有try-catch但未使用res.apiError/res.apiInternalError'
          })
        }
      }
    })
  }

  scanRoutes(routesDir)

  if (issues.length === 0) {
    log('✅ API错误处理检查通过', 'green')
  } else {
    log(`⚠️ 发现 ${issues.length} 个错误处理问题`, 'yellow')
    issues.slice(0, 10).forEach(issue => {
      log(`   📄 ${issue.file}:`, 'yellow')
      log(`      ⚠️ ${issue.description}`, 'yellow')
    })

    if (issues.length > 10) {
      log(`   ... 还有 ${issues.length - 10} 个类似问题`, 'yellow')
    }
  }

  return { issues }
}

/**
 * 5. 检查环境变量完整性
 */
function checkEnvironmentVariables () {
  log('\n📋 检查5: 环境变量完整性', 'cyan')
  log('='.repeat(60), 'cyan')

  const requiredEnvVars = [
    // 数据库配置
    'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD',
    // 服务配置
    'PORT', 'NODE_ENV', 'JWT_SECRET',
    // Redis配置
    'REDIS_URL',
    // Sealos对象存储
    'SEALOS_ACCESS_KEY', 'SEALOS_SECRET_KEY'
  ]

  const missing = []
  const present = []

  requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
      missing.push(varName)
    } else {
      present.push(varName)
    }
  })

  if (missing.length === 0) {
    log('✅ 所有必需的环境变量已配置', 'green')
    log(`   📊 检查了 ${requiredEnvVars.length} 个环境变量`, 'blue')
  } else {
    log(`❌ 发现 ${missing.length} 个缺失的环境变量`, 'red')
    missing.forEach(varName => {
      log(`   ❌ ${varName}`, 'red')
    })

    log(`\n   ✅ 已配置 ${present.length} 个环境变量:`, 'green')
    present.forEach(varName => {
      log(`      ✓ ${varName}`, 'green')
    })
  }

  return { missing, present }
}

/**
 * 辅助函数：首字母大写
 */
function capitalize (str) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * 生成完整的排查报告
 */
function generateReport (results) {
  log('\n' + '='.repeat(60), 'cyan')
  log('📊 DevBox全面系统排查报告', 'cyan')
  log('='.repeat(60), 'cyan')

  const sections = [
    { name: '前端DOM操作', result: results.dom, key: 'totalIssues' },
    { name: '后端API路由', result: results.api, key: 'issues' },
    { name: '数据库模型关联', result: results.models, key: 'issues' },
    { name: 'API错误处理', result: results.errorHandling, key: 'issues' },
    { name: '环境变量', result: results.env, key: 'missing' }
  ]

  let totalIssues = 0
  let criticalIssues = 0

  sections.forEach(section => {
    const issueCount = Array.isArray(section.result[section.key])
      ? section.result[section.key].length
      : section.result[section.key] || 0

    totalIssues += issueCount

    if (issueCount === 0) {
      log(`✅ ${section.name}: 无问题`, 'green')
    } else {
      const severity = issueCount > 10 ? 'red' : 'yellow'
      log(`⚠️ ${section.name}: ${issueCount}个问题`, severity)

      if (section.name === '环境变量' || section.name === '后端API路由') {
        criticalIssues += issueCount
      }
    }
  })

  log('\n' + '='.repeat(60), 'cyan')
  log(`📈 总计: ${totalIssues}个问题`, totalIssues === 0 ? 'green' : 'yellow')

  if (criticalIssues > 0) {
    log(`🔴 其中 ${criticalIssues} 个为关键问题，需要立即修复`, 'red')
  }

  log('='.repeat(60), 'cyan')

  // 生成修复优先级建议
  log('\n💡 修复优先级建议:', 'blue')

  if (results.env.missing.length > 0) {
    log('   🔴 P0（立即）: 配置缺失的环境变量', 'red')
  }

  if (results.api.issues.length > 0) {
    log('   🔴 P0（立即）: 实现缺失的API端点', 'red')
  }

  if (results.dom.totalIssues > 0) {
    log('   🟡 P1（本周）: 修复不安全的DOM操作', 'yellow')
  }

  if (results.errorHandling.issues.length > 0) {
    log('   🟡 P1（本周）: 完善API错误处理', 'yellow')
  }

  if (results.models.issues.length > 0) {
    log('   🟢 P2（优化）: 检查数据库模型关联', 'green')
  }

  if (totalIssues === 0) {
    log('\n🎉 恭喜！DevBox系统检查全部通过！', 'green')
  }
}

/**
 * 主函数
 */
function main () {
  log('\n🚀 开始DevBox全面系统排查...', 'cyan')
  log('检查范围: 后端数据库 + Web端后台管理前端', 'blue')
  log('开始时间: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }), 'blue')

  const results = {
    dom: checkUnsafeDOMOperations(),
    api: checkBackendAPICompleteness(),
    models: checkDatabaseModelAssociations(),
    errorHandling: checkAPIErrorHandling(),
    env: checkEnvironmentVariables()
  }

  generateReport(results)

  log('\n完成时间: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }), 'blue')

  // 根据结果决定退出码
  const hasCriticalIssues = results.env.missing.length > 0 || results.api.issues.length > 0

  if (hasCriticalIssues) {
    process.exit(1)
  }

  process.exit(0)
}

// 执行检查
if (require.main === module) {
  main()
}

module.exports = {
  checkUnsafeDOMOperations,
  checkBackendAPICompleteness,
  checkDatabaseModelAssociations,
  checkAPIErrorHandling,
  checkEnvironmentVariables
}
