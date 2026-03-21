#!/usr/bin/env node
/**
 * 路由层规范合规性检查脚本
 *
 * 检查规则（基于架构设计-读写操作分层策略.md）：
 * 1. 路由不得直接 require models.*（写操作应收口到 Service）
 * 2. 路由不得直接调用 Model.create/update/destroy（写操作应通过 Service）
 *
 * ⚠️ 注意：路由层使用 sequelize.transaction() 是**正确的架构模式**
 *    见决策6：路由管理事务边界 + Service执行业务逻辑
 *
 * 执行方式：
 *   node scripts/validation/check-route-layer-compliance.js [--fix-report]
 *
 * Git Hooks集成：
 *   在 .husky/pre-commit 中添加：node scripts/validation/check-route-layer-compliance.js --staged
 *
 * @since 2026-01-09
 * @updated 2026-02-02 删除 NO_ROUTE_TRANSACTION 规则（与决策6冲突）
 */

'use strict'

const fs = require('fs')
const path = require('path')
const glob = require('glob')

/* 检查规则定义 */
const COMPLIANCE_RULES = [
  {
    id: 'NO_DIRECT_MODEL_REQUIRE',
    name: '禁止路由直接require models',
    pattern: /require\s*\(\s*['"]\.\.\/.*models['"]\s*\)/g,
    severity: 'error',
    message: '路由不应直接require models，请通过Service层访问数据库',
    suggestion: '使用 ServiceManager.get("XXXService") 获取服务实例'
  },
  /* 
   * ❌ 已删除 NO_ROUTE_TRANSACTION 规则（2026-02-02）
   * 
   * 原因：路由层使用 sequelize.transaction() 是项目采用的标准事务管理模式
   * 见决策6：路由管理事务边界 + Service执行业务逻辑
   * 
   * 代码模式（✅ 正确）：
   *   const transaction = await sequelize.transaction()
   *   try {
   *     await SomeService.doSomething({ transaction })
   *     await transaction.commit()
   *   } catch (error) {
   *     await transaction.rollback()
   *     throw error
   *   }
   */
  {
    id: 'NO_DIRECT_MODEL_CREATE',
    name: '禁止路由直接Model.create',
    pattern: /\b(\w+)\.(create|bulkCreate)\s*\(/g,
    severity: 'warning',
    message: '路由不应直接调用Model.create，写操作应通过Service',
    suggestion: '将创建逻辑迁移到对应Service方法中',
    /* 需要二次验证是否为Model调用 */
    validator: (match, content, line) => {
      const modelName = match.match(/\b(\w+)\.(create|bulkCreate)/)?.[1]
      /* 排除已知的非Model对象 */
      const allowedObjects = [
        'ApiResponse',
        'logger',
        'console',
        'Promise',
        'Object',
        'Array',
        'Date',
        'JSON',
        'Math',
        'Number',
        'String',
        'Buffer',
        'process'
      ]
      /* 排除 Service 对象（以 Service 结尾的变量名） */
      if (modelName && modelName.endsWith('Service')) {
        return false
      }
      return modelName && !allowedObjects.includes(modelName)
    }
  },
  {
    id: 'NO_DIRECT_MODEL_UPDATE',
    name: '禁止路由直接Model.update',
    pattern: /\b(\w+)\.update\s*\(\s*\{/g,
    severity: 'warning',
    message: '路由不应直接调用Model.update，写操作应通过Service',
    suggestion: '将更新逻辑迁移到对应Service方法中',
    validator: (match, content, line) => {
      const objectName = match.match(/\b(\w+)\.update/)?.[1]
      const allowedObjects = ['ApiResponse', 'logger', 'res', 'req', 'app']
      return objectName && !allowedObjects.includes(objectName)
    }
  },
  {
    id: 'NO_DIRECT_MODEL_DESTROY',
    name: '禁止路由直接Model.destroy',
    pattern: /\b(\w+)\.destroy\s*\(/g,
    severity: 'error',
    message: '路由不应直接调用Model.destroy，删除操作必须通过Service',
    suggestion: '将删除逻辑迁移到对应Service方法中'
  }
]

/* 白名单文件（允许跳过检查） */
const WHITELIST_FILES = [
  /* 管理后台路由可能有历史遗留，暂时白名单 */
  // 'routes/v4/console/some-legacy-file.js'
]

/**
 * 检查单个文件的合规性
 *
 * @param {string} filePath - 文件路径
 * @returns {Array<Object>} 违规项列表
 */
function checkFileCompliance(filePath) {
  const violations = []

  /* 检查是否在白名单 */
  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/')
  if (WHITELIST_FILES.includes(relativePath)) {
    return violations
  }

  let content
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch (error) {
    console.error(`无法读取文件 ${filePath}: ${error.message}`)
    return violations
  }

  const lines = content.split('\n')

  COMPLIANCE_RULES.forEach(rule => {
    let match
    while ((match = rule.pattern.exec(content)) !== null) {
      /* 计算行号 */
      const lineNumber = content.substring(0, match.index).split('\n').length
      const lineContent = lines[lineNumber - 1]?.trim() || ''

      /* 如果有自定义验证器，进行二次验证 */
      if (rule.validator && !rule.validator(match[0], content, lineContent)) {
        continue
      }

      violations.push({
        file: relativePath,
        line: lineNumber,
        rule_id: rule.id,
        rule_name: rule.name,
        severity: rule.severity,
        message: rule.message,
        suggestion: rule.suggestion,
        match: match[0],
        line_content: lineContent.substring(0, 80)
      })
    }

    /* 重置正则表达式游标 */
    rule.pattern.lastIndex = 0
  })

  return violations
}

/**
 * 检查所有路由文件
 *
 * @param {Object} options - 选项
 * @returns {Object} 检查结果
 */
function checkAllRoutes(options = {}) {
  const { stagedOnly = false } = options

  let files

  if (stagedOnly) {
    /* Git暂存区文件检查 */
    const { execSync } = require('child_process')
    try {
      const stagedFiles = execSync('git diff --cached --name-only --diff-filter=ACM', {
        encoding: 'utf8'
      })
      files = stagedFiles
        .split('\n')
        .filter(f => f.startsWith('routes/') && f.endsWith('.js'))
        .map(f => path.join(process.cwd(), f))
    } catch (error) {
      console.error('获取Git暂存区文件失败:', error.message)
      files = []
    }
  } else {
    /* 全量检查 */
    files = glob
      .sync('routes/v4/**/*.js', { cwd: process.cwd() })
      .map(f => path.join(process.cwd(), f))
  }

  console.log(`🔍 检查 ${files.length} 个路由文件的合规性...`)

  const allViolations = []
  let checkedFiles = 0

  files.forEach(file => {
    const violations = checkFileCompliance(file)
    if (violations.length > 0) {
      allViolations.push(...violations)
    }
    checkedFiles++
  })

  return {
    files_checked: checkedFiles,
    violations: allViolations,
    error_count: allViolations.filter(v => v.severity === 'error').length,
    warning_count: allViolations.filter(v => v.severity === 'warning').length
  }
}

/**
 * 打印检查结果
 *
 * @param {Object} result - 检查结果
 */
function printResult(result) {
  console.log('')
  console.log('='.repeat(60))
  console.log('📋 路由层规范合规性检查报告')
  console.log('='.repeat(60))
  console.log(`  检查文件: ${result.files_checked} 个`)
  console.log(`  错误: ${result.error_count} 个`)
  console.log(`  警告: ${result.warning_count} 个`)
  console.log('')

  if (result.violations.length === 0) {
    console.log('✅ 所有路由文件符合规范！')
    return
  }

  /* 按文件分组显示违规 */
  const byFile = new Map()
  result.violations.forEach(v => {
    if (!byFile.has(v.file)) {
      byFile.set(v.file, [])
    }
    byFile.get(v.file).push(v)
  })

  byFile.forEach((violations, file) => {
    console.log(`\n📄 ${file}`)
    violations.forEach(v => {
      const icon = v.severity === 'error' ? '❌' : '⚠️'
      console.log(`  ${icon} 行${v.line}: [${v.rule_id}] ${v.message}`)
      console.log(`     代码: ${v.line_content}`)
      console.log(`     建议: ${v.suggestion}`)
    })
  })

  console.log('')
  console.log('='.repeat(60))

  if (result.error_count > 0) {
    console.log('❌ 存在错误级别违规，请修复后再提交')
  } else if (result.warning_count > 0) {
    console.log('⚠️ 存在警告级别违规，建议后续迭代中修复')
  }
}

/* 主程序 */
function main() {
  const args = process.argv.slice(2)
  const stagedOnly = args.includes('--staged')
  const strictMode = args.includes('--strict')

  console.log('🔧 路由层规范合规性检查')
  console.log(`  模式: ${stagedOnly ? '仅暂存区文件' : '全量检查'}`)
  console.log(`  严格模式: ${strictMode ? '是' : '否'}`)

  const result = checkAllRoutes({ stagedOnly })

  printResult(result)

  /* 退出码：错误时返回1（阻止提交），警告时返回0（允许提交） */
  if (result.error_count > 0) {
    process.exit(1)
  }

  /* 严格模式下警告也阻止提交 */
  if (strictMode && result.warning_count > 0) {
    process.exit(1)
  }

  process.exit(0)
}

main()

