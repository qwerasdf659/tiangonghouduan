#!/usr/bin/env node
/**
 * P1-9 服务键 snake_case 迁移验证脚本
 *
 * 验证规则：
 * 1. ServiceManager 中所有服务键必须是 snake_case 格式
 * 2. 全仓库中 getService() 调用必须使用 snake_case 键
 * 3. 不存在 camelCase 遗留键
 *
 * 执行方式：
 *   node scripts/validation/verify-all-keys-migrated.js [--strict]
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

/** 扫描目录 */
const SCAN_DIRS = ['routes', 'services', 'scripts', 'tests']

/** snake_case 验证正则 */
const SNAKE_CASE_PATTERN = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

/**
 * 已知的 camelCase 遗留键映射（用于迁移建议）
 *
 * V4.7.0 大文件拆分说明（2026-01-31）：
 * - AdminLotteryService 已拆分为 admin_lottery_core/campaign/query/crud
 * - 旧的 admin_lottery 键已废弃，请使用拆分后的子服务键
 */
const LEGACY_KEY_MAPPING = {
  tradeOrder: 'trade_order',
  exchangeMarket: 'exchange_market',
  marketListing: 'market_listing',
  merchantPoints: 'merchant_points',
  adminSystem: 'admin_system',
  /* V4.7.0 拆分：adminLotteryService 建议迁移到 admin_lottery_core（核心操作） */
  adminLotteryService: 'admin_lottery_core',
  prizePool: 'prize_pool',
  assetConversion: 'asset_conversion',
  chatWebSocket: 'chat_websocket',
  contentAuditEngine: 'content_audit_engine',
  auditLog: 'audit_log',
  hierarchyManagement: 'hierarchy_management',
  transactionRecord: 'transaction_record',
  systemConfig: 'system_config',
  dataSanitizer: 'data_sanitizer',
  lotteryQuota: 'lottery_quota',
  materialManagement: 'material_management',
  userRole: 'user_role',
  performanceMonitor: 'performance_monitor',
  unifiedLotteryEngine: 'unified_lottery_engine',
  orphanFrozenCleanup: 'orphan_frozen_cleanup',
  lotteryContainer: 'lottery_container'
}

/* ========================================
 * 核心检查逻辑
 * ======================================== */

/**
 * 从 ServiceManager 中提取所有注册的服务键
 * @returns {Object} { keys: [], isValid: boolean, invalidKeys: [] }
 */
function extractServiceManagerKeys() {
  const serviceManagerPath = path.join(process.cwd(), 'services/index.js')
  if (!fs.existsSync(serviceManagerPath)) {
    console.error('❌ 找不到 ServiceManager 文件: services/index.js')
    return { keys: [], isValid: false, invalidKeys: [] }
  }

  const content = fs.readFileSync(serviceManagerPath, 'utf8')

  /* 匹配 this._services.set('key', ...) */
  const setPattern = /this\._services\.set\s*\(\s*['"]([^'"]+)['"]/g
  const keys = []
  const invalidKeys = []

  let match
  while ((match = setPattern.exec(content)) !== null) {
    const key = match[1]
    keys.push(key)
    if (!SNAKE_CASE_PATTERN.test(key)) {
      invalidKeys.push(key)
    }
  }

  return {
    keys,
    isValid: invalidKeys.length === 0,
    invalidKeys
  }
}

/**
 * 检查行是否在注释块中
 * @param {string} content - 文件内容
 * @param {number} matchIndex - 匹配位置
 * @returns {boolean} 是否在注释中
 */
function isInComment(content, matchIndex) {
  const beforeMatch = content.substring(0, matchIndex)
  const lines = beforeMatch.split('\n')
  const currentLine = lines[lines.length - 1]

  /* 检查是否在单行注释中 */
  if (currentLine.includes('//') || currentLine.includes('*')) {
    return true
  }

  /* 检查是否在多行注释块中 (JSDoc) */
  const lastBlockCommentStart = beforeMatch.lastIndexOf('/**')
  const lastBlockCommentEnd = beforeMatch.lastIndexOf('*/')

  if (lastBlockCommentStart > lastBlockCommentEnd) {
    return true
  }

  return false
}

/**
 * 扫描全仓库中的 getService() 调用
 * @returns {Array} 违规列表
 */
function scanGetServiceCalls() {
  const violations = []

  for (const dir of SCAN_DIRS) {
    const fullDir = path.join(process.cwd(), dir)
    if (!fs.existsSync(fullDir)) continue

    const files = glob.sync(`${fullDir}/**/*.js`)
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8')

      /* 匹配 getService('key') 或 getService("key") */
      const pattern = /getService\s*\(\s*['"]([^'"]+)['"]\s*\)/g
      let match

      while ((match = pattern.exec(content)) !== null) {
        const key = match[1]

        /* 跳过模板字符串变量（${xxx}）*/
        if (key.startsWith('${') || key.includes('${')) {
          continue
        }

        /* 跳过注释中的示例代码 */
        if (isInComment(content, match.index)) {
          continue
        }

        /* 检查是否为 camelCase（包含大写字母且不符合 snake_case） */
        if (/[A-Z]/.test(key)) {
          const beforeMatch = content.substring(0, match.index)
          const lineNumber = beforeMatch.split('\n').length

          const suggestedKey = LEGACY_KEY_MAPPING[key] || camelToSnake(key)

          violations.push({
            file: path.relative(process.cwd(), file),
            line: lineNumber,
            key,
            suggestedKey,
            match: match[0]
          })
        }
      }
    }
  }

  return violations
}

/**
 * camelCase 转 snake_case
 * @param {string} str - camelCase 字符串
 * @returns {string} snake_case 字符串
 */
function camelToSnake(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase()
}

/**
 * 生成检查报告
 * @param {Object} serviceManagerResult - ServiceManager 检查结果
 * @param {Array} callViolations - getService 调用违规列表
 * @param {boolean} strict - 是否严格模式
 */
function generateReport(serviceManagerResult, callViolations, strict) {
  console.log('\n' + '='.repeat(60))
  console.log('📋 P1-9 服务键 snake_case 迁移验证报告')
  console.log('='.repeat(60))

  let hasErrors = false

  /* 1. ServiceManager 注册键检查 */
  console.log('\n📦 ServiceManager 注册键检查:')
  console.log(`   总注册数: ${serviceManagerResult.keys.length}`)

  if (serviceManagerResult.invalidKeys.length > 0) {
    hasErrors = true
    console.log(`   ❌ 发现 ${serviceManagerResult.invalidKeys.length} 个非 snake_case 键:`)
    for (const key of serviceManagerResult.invalidKeys) {
      const suggested = LEGACY_KEY_MAPPING[key] || camelToSnake(key)
      console.log(`      - "${key}" → 建议改为 "${suggested}"`)
    }
  } else {
    console.log('   ✅ 所有注册键均为 snake_case 格式')
  }

  /* 2. 全仓库 getService 调用检查 */
  console.log('\n🔍 全仓库 getService() 调用检查:')

  if (callViolations.length > 0) {
    hasErrors = true
    console.log(`   ❌ 发现 ${callViolations.length} 处 camelCase 键调用:\n`)

    /* 按文件分组 */
    const byFile = {}
    for (const v of callViolations) {
      if (!byFile[v.file]) byFile[v.file] = []
      byFile[v.file].push(v)
    }

    for (const [file, fileViolations] of Object.entries(byFile)) {
      console.log(`   📁 ${file}`)
      for (const v of fileViolations) {
        console.log(`      行 ${v.line}: "${v.key}" → 应改为 "${v.suggestedKey}"`)
      }
    }
  } else {
    console.log('   ✅ 所有 getService() 调用均使用 snake_case 键')
  }

  /* 3. 总结 */
  console.log('\n' + '-'.repeat(60))

  const totalIssues = serviceManagerResult.invalidKeys.length + callViolations.length

  if (totalIssues === 0) {
    console.log('\n✅ P1-9 snake_case 迁移验证通过！\n')
    console.log('   所有服务键已统一为 snake_case 格式')
    console.log('   ServiceManager 注册键规范')
    console.log('   全仓库调用点规范\n')
    return
  }

  console.log(`\n🔴 发现 ${totalIssues} 处需要修复的问题\n`)

  if (strict) {
    console.log('❌ [STRICT MODE] 检查失败，阻塞提交\n')
    process.exit(1)
  }

  console.log('💡 修复建议:')
  console.log('   1. 更新 ServiceManager 中的服务注册键为 snake_case')
  console.log('   2. 更新所有 getService() 调用使用 snake_case 键')
  console.log('   3. 运行 --strict 模式确认修复完成\n')
}

/* ========================================
 * 主函数
 * ======================================== */

function main() {
  const args = process.argv.slice(2)
  const strictMode = args.includes('--strict')

  console.log('\n🔍 P1-9 服务键 snake_case 迁移验证')
  console.log(`   模式: ${strictMode ? '严格模式（阻塞）' : '检查模式（报告）'}`)
  console.log(`   扫描目录: ${SCAN_DIRS.join(', ')}`)

  /* 1. 检查 ServiceManager 注册键 */
  const serviceManagerResult = extractServiceManagerKeys()

  /* 2. 扫描全仓库 getService 调用 */
  const callViolations = scanGetServiceCalls()

  /* 3. 生成报告 */
  generateReport(serviceManagerResult, callViolations, strictMode)

  process.exit(0)
}

main()
