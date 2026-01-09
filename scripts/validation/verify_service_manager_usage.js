#!/usr/bin/env node
/**
 * P1-9 ServiceManager 服务获取方式统一验证脚本
 *
 * 验证规则：
 * 1. 路由文件不应直接 require services/XXXService
 * 2. 路由应通过 req.app.locals.services.getService() 获取服务
 * 3. 服务获取 key 必须是 snake_case 格式
 *
 * 执行方式：
 *   node scripts/validation/verify-service-manager-usage.js [--strict]
 *
 * --strict 模式：发现违规立即退出（用于 CI/CD 阻塞）
 *
 * @since 2026-01-09
 * @see docs/P1-9-服务获取方式统一-ServiceManager-独立迭代计划.md
 */

'use strict'

const fs = require('fs')
const path = require('path')
const glob = require('glob')

/* ========================================
 * 配置定义
 * ======================================== */

/** 需要检查的路由目录 */
const ROUTES_DIRS = ['routes/v4']

/** 允许直接 require 的服务（白名单） */
const ALLOWED_DIRECT_REQUIRES = [
  /* 基础设施服务，不经过 ServiceManager */
  'ApiResponse',
  'logger',
  'BeijingTimeHelper'
]

/** 允许包含降级方案的文件（白名单） */
const WHITELIST_FILES = [
  /* 共享中间件文件包含降级方案，需要在 ServiceManager 不可用时直接 require */
  'routes/v4/console/shared/middleware.js'
]

/** snake_case 验证正则 */
const SNAKE_CASE_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

/** 已注册的 snake_case service keys（从 ServiceManager 中提取） */
const REGISTERED_SERVICE_KEYS = [
  /* 抽奖引擎服务 */
  'unified_lottery_engine',
  'lottery_container',
  'lottery_preset',
  'lottery_management',
  'lottery_quota',
  /* 交易与市场服务 */
  'exchange_market',
  'market_listing',
  'trade_order',
  'redemption_order',
  /* 用户与权限服务 */
  'user',
  'user_role',
  'hierarchy_management',
  /* 客服系统服务 */
  'customer_service_session',
  'admin_customer_service',
  'chat_web_socket',
  'chat_rate_limit',
  /* 资产与积分服务 */
  'asset',
  'asset_conversion',
  'merchant_points',
  'consumption',
  'backpack',
  /* 管理后台服务 */
  'admin_system',
  'admin_lottery',
  'material_management',
  'orphan_frozen_cleanup',
  /* 活动与奖品服务 */
  'activity',
  'prize_pool',
  'premium',
  /* 系统功能服务 */
  'announcement',
  'notification',
  'feedback',
  'popup_banner',
  'image',
  'reporting',
  /* 审计与日志服务 */
  'audit_log',
  'content_audit',
  /* 工具服务 */
  'idempotency',
  'data_sanitizer',
  'performance_monitor'
]

/* ========================================
 * 检查规则定义
 * ======================================== */

const RULES = [
  {
    id: 'NO_DIRECT_SERVICE_REQUIRE',
    name: '禁止路由直接 require 服务',
    /** 匹配 require('../services/XXX') 或 require('../../services/XXX') */
    pattern: /require\s*\(\s*['"]\.\.\/.*services\/[^'"]+['"]\s*\)/g,
    severity: 'error',
    message: '路由不应直接 require 服务文件，请通过 ServiceManager 获取',
    suggestion: "使用 req.app.locals.services.getService('service_key')",
    /** 需要跳过注释中的 require */
    skipIfCommented: true
  },
  {
    id: 'CAMEL_CASE_KEY_DETECTED',
    name: '检测到 camelCase 服务键',
    /** 匹配 getService('camelCaseKey') */
    pattern: /getService\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    severity: 'error',
    message: '服务键应使用 snake_case 格式',
    /** 自定义验证器：检查 key 是否为 camelCase */
    validator: (match, content, line) => {
      const keyMatch = match.match(/getService\s*\(\s*['"]([^'"]+)['"]/)
      if (!keyMatch) return false
      const key = keyMatch[1]
      /* 如果包含大写字母且不是 snake_case，则违规 */
      return /[A-Z]/.test(key) && !SNAKE_CASE_PATTERN.test(key)
    }
  },
  {
    id: 'UNREGISTERED_SERVICE_KEY',
    name: '检测到未注册的服务键',
    pattern: /getService\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    severity: 'warning',
    message: '服务键未在 ServiceManager 中注册',
    validator: (match, content, line) => {
      const keyMatch = match.match(/getService\s*\(\s*['"]([^'"]+)['"]/)
      if (!keyMatch) return false
      const key = keyMatch[1]
      return !REGISTERED_SERVICE_KEYS.includes(key)
    }
  }
]

/* ========================================
 * 核心检查逻辑
 * ======================================== */

/**
 * 检查匹配是否在注释行中
 * @param {string} content - 文件内容
 * @param {number} matchIndex - 匹配位置
 * @returns {boolean} 是否在注释行中
 */
function isLineCommented(content, matchIndex) {
  const beforeMatch = content.substring(0, matchIndex)
  const lines = beforeMatch.split('\n')
  const currentLineStart = beforeMatch.lastIndexOf('\n') + 1
  const currentLineContent = content.substring(currentLineStart, matchIndex)

  /* 检查当前行是否以 // 开头（单行注释） */
  if (currentLineContent.trim().startsWith('//')) {
    return true
  }

  /* 检查是否在多行注释块中 */
  const lastBlockCommentStart = beforeMatch.lastIndexOf('/*')
  const lastBlockCommentEnd = beforeMatch.lastIndexOf('*/')
  if (lastBlockCommentStart > lastBlockCommentEnd) {
    return true
  }

  return false
}

/**
 * 扫描单个文件
 * @param {string} filePath - 文件路径
 * @returns {Array} 违规列表
 */
function scanFile(filePath) {
  const violations = []
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')

  for (const rule of RULES) {
    let match
    while ((match = rule.pattern.exec(content)) !== null) {
      /* 计算行号 */
      const beforeMatch = content.substring(0, match.index)
      const lineNumber = beforeMatch.split('\n').length

      /* 跳过注释中的匹配 */
      if (rule.skipIfCommented && isLineCommented(content, match.index)) {
        continue
      }

      /* 如果有自定义验证器，执行额外检查 */
      if (rule.validator) {
        if (!rule.validator(match[0], content, lineNumber)) {
          continue /* 验证器返回 false，跳过此匹配 */
        }
      }

      /* 检查白名单 */
      if (rule.id === 'NO_DIRECT_SERVICE_REQUIRE') {
        const isWhitelisted = ALLOWED_DIRECT_REQUIRES.some(allowed => match[0].includes(allowed))
        if (isWhitelisted) continue
      }

      violations.push({
        file: filePath,
        line: lineNumber,
        rule: rule.id,
        severity: rule.severity,
        message: rule.message,
        suggestion: rule.suggestion,
        match: match[0].trim()
      })
    }
    /* 重置正则状态 */
    rule.pattern.lastIndex = 0
  }

  return violations
}

/**
 * 扫描所有路由文件
 * @returns {Array} 所有违规列表
 */
function scanAllRoutes() {
  const allViolations = []

  for (const dir of ROUTES_DIRS) {
    const fullDir = path.join(process.cwd(), dir)
    if (!fs.existsSync(fullDir)) {
      console.warn(`⚠️ 目录不存在: ${dir}`)
      continue
    }

    const files = glob.sync(`${fullDir}/**/*.js`)
    for (const file of files) {
      /* 跳过白名单文件 */
      const relativePath = path.relative(process.cwd(), file)
      if (WHITELIST_FILES.some(wf => relativePath.endsWith(wf) || relativePath.includes(wf))) {
        continue
      }

      const violations = scanFile(file)
      allViolations.push(...violations)
    }
  }

  return allViolations
}

/**
 * 生成检查报告
 * @param {Array} violations - 违规列表
 * @param {boolean} strict - 是否严格模式
 */
function generateReport(violations, strict) {
  console.log('\n' + '='.repeat(60))
  console.log('📋 P1-9 ServiceManager 服务获取方式验证报告')
  console.log('='.repeat(60))

  if (violations.length === 0) {
    console.log('\n✅ 检查通过！所有路由文件均符合 ServiceManager 统一访问规范\n')
    return
  }

  /* 按严重程度分组 */
  const errors = violations.filter(v => v.severity === 'error')
  const warnings = violations.filter(v => v.severity === 'warning')

  console.log(`\n📊 检查结果: ${errors.length} 个错误, ${warnings.length} 个警告\n`)

  /* 按文件分组显示 */
  const byFile = {}
  for (const v of violations) {
    const relativePath = path.relative(process.cwd(), v.file)
    if (!byFile[relativePath]) byFile[relativePath] = []
    byFile[relativePath].push(v)
  }

  for (const [file, fileViolations] of Object.entries(byFile)) {
    console.log(`\n📁 ${file}`)
    for (const v of fileViolations) {
      const icon = v.severity === 'error' ? '❌' : '⚠️'
      console.log(`  ${icon} 行 ${v.line}: ${v.message}`)
      console.log(`     规则: ${v.rule}`)
      console.log(`     匹配: ${v.match}`)
      if (v.suggestion) {
        console.log(`     建议: ${v.suggestion}`)
      }
    }
  }

  console.log('\n' + '-'.repeat(60))

  if (errors.length > 0) {
    console.log(`\n🔴 发现 ${errors.length} 个错误，需要修复后才能通过检查`)
    if (strict) {
      console.log('❌ [STRICT MODE] 检查失败，阻塞提交\n')
      process.exit(1)
    }
  } else {
    console.log(`\n🟡 仅发现 ${warnings.length} 个警告，建议修复但不阻塞\n`)
  }
}

/* ========================================
 * 主函数
 * ======================================== */

function main() {
  const args = process.argv.slice(2)
  const strictMode = args.includes('--strict')

  console.log('\n🔍 P1-9 ServiceManager 服务获取方式统一验证')
  console.log(`   模式: ${strictMode ? '严格模式（阻塞）' : '检查模式（报告）'}`)
  console.log(`   扫描目录: ${ROUTES_DIRS.join(', ')}`)

  const violations = scanAllRoutes()
  generateReport(violations, strictMode)

  /* 非严格模式下，有错误也返回 0（仅报告） */
  const hasErrors = violations.some(v => v.severity === 'error')
  if (!strictMode && hasErrors) {
    console.log('💡 提示: 使用 --strict 参数可在 CI/CD 中阻塞有错误的提交')
  }

  process.exit(0)
}

main()
