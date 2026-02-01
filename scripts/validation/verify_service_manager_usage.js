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

/**
 * 已注册的 snake_case service keys（从 ServiceManager 中提取）
 *
 * @description 与 services/index.js 中 _initializeServices() 注册的服务保持一致
 * @lastUpdated 2026-02-02
 */
const REGISTERED_SERVICE_KEYS = [
  /* ==================== 抽奖引擎服务 ==================== */
  'unified_lottery_engine', // 统一抽奖引擎（需实例化）
  'lottery_container', // 抽奖服务容器
  'lottery_preset', // 预设抽奖配置服务
  'lottery_quota', // 抽奖配额服务
  'draw_orchestrator', // 抽奖编排器
  'management_strategy', // 管理策略服务

  /* ==================== 抽奖管理服务（V4.7.0 AdminLotteryService 拆分） ==================== */
  'admin_lottery_core', // 核心干预操作（静态类）
  'admin_lottery_campaign', // 活动管理操作（静态类）
  'admin_lottery_query', // 干预规则查询（静态类）
  'lottery_campaign_crud', // 活动 CRUD 操作（静态类）

  /* ==================== 抽奖配置管理服务 ==================== */
  'lottery_campaign_pricing_config', // 活动定价配置管理服务
  'lottery_pricing', // 抽奖定价服务
  'lottery_config', // 抽奖配置管理服务
  'lottery_tier_rule', // 抽奖档位规则管理服务

  /* ==================== 抽奖分析服务 ==================== */
  'lottery_analytics_realtime', // 实时监控服务
  'lottery_analytics_statistics', // 统计趋势服务
  'lottery_analytics_report', // 报表生成服务
  'lottery_analytics_user', // 用户维度分析服务
  'lottery_analytics_campaign', // 活动维度分析服务
  'lottery_analytics_query', // 抽奖统计分析查询服务（Phase 3 复杂查询收口）
  'lottery_alert', // 抽奖告警服务
  'lottery_health', // 抽奖健康度计算服务
  'lottery_query', // 抽奖查询服务（读操作收口）

  /* ==================== 交易与市场服务 ==================== */
  'exchange_core', // 核心兑换操作（需实例化）
  'exchange_query', // 查询服务（需实例化）
  'exchange_admin', // 管理后台操作（需实例化）
  'trade_order', // 交易订单服务
  'redemption_order', // 兑换订单服务
  'redemption', // 兑换服务（核心兑换业务逻辑）

  /* ==================== 市场挂牌服务 ==================== */
  'market_listing_core', // 核心挂牌操作（静态类）
  'market_listing_query', // 查询/搜索/筛选（静态类）
  'market_listing_admin', // 管理控制/止损（静态类）
  'market_query', // 市场热点读查询服务（静态类）

  /* ==================== 用户与权限服务 ==================== */
  'user', // 用户服务
  'user_role', // 用户角色服务
  'hierarchy_management', // 层级管理服务
  'user_segment', // 用户分层服务
  'user_risk_profile', // 用户风控配置管理服务
  'user_behavior_track', // 用户行为轨迹服务

  /* ==================== 客服系统服务 ==================== */
  'customer_service_session', // 客服会话服务
  'admin_customer_service', // 管理后台客服服务
  'chat_web_socket', // WebSocket 聊天服务
  'chat_rate_limit', // 聊天限流服务
  'session_management', // 会话管理服务（静态类）

  /* ==================== 资产服务（AssetService 拆分三件套） ==================== */
  'asset_balance', // 资产余额服务（8个方法，静态类）
  'asset_item', // 资产物品服务（9个方法，静态类）
  'asset_query', // 资产查询服务（7个方法，静态类）
  'asset_conversion', // 资产转换服务
  'asset_portfolio_query', // 资产组合分析查询服务（静态类）
  'backpack', // 背包服务
  'merchant_points', // 商家积分服务

  /* ==================== 消费服务（ConsumptionService 拆分三件套） ==================== */
  'consumption_core', // 核心操作（静态类）
  'consumption_query', // 查询服务（静态类）
  'consumption_merchant', // 商家侧服务（静态类）
  'consumption_batch', // 消费记录批量审核服务（静态类）
  'consumption_anomaly', // 消费异常检测服务

  /* ==================== 管理后台服务 ==================== */
  'admin_system', // 管理系统服务
  'material_management', // 物料管理服务
  'orphan_frozen_cleanup', // 孤儿冻结清理服务

  /* ==================== 管理后台查询服务（Phase 3 读操作收口） ==================== */
  'console_system_data_query', // 管理后台系统数据查询服务（静态类）
  'console_session_query', // 管理后台会话查询服务（静态类）
  'console_business_record_query', // 管理后台业务记录查询服务（静态类）
  'console_dashboard_query', // 管理后台仪表盘查询服务（静态类）

  /* ==================== 活动与奖品服务 ==================== */
  'activity', // 活动服务
  'prize_pool', // 奖品池服务
  'premium', // 付费会员服务

  /* ==================== 系统功能服务 ==================== */
  'announcement', // 公告服务
  'notification', // 通知服务
  'feedback', // 反馈服务
  'popup_banner', // 弹窗/Banner 服务
  'image', // 图片服务

  /* ==================== 报表服务（ReportingService 拆分） ==================== */
  'reporting_analytics', // 决策分析/趋势分析（静态类）
  'reporting_charts', // 图表数据生成（静态类）
  'reporting_stats', // 统计/概览/画像（静态类）
  'multi_dimension_stats', // 多维度组合统计

  /* ==================== 审计与日志服务 ==================== */
  'audit_log', // 审计日志服务
  'content_audit', // 内容审核引擎
  'audit_rollback', // 审计回滚服务

  /* ==================== 商家管理服务 ==================== */
  'staff_management', // 员工管理服务
  'store', // 门店管理服务
  'region', // 行政区划服务（省市区级联选择）
  'merchant_operation_log', // 商家操作审计日志服务
  'merchant_risk_control', // 商家风控服务
  'debt_management', // 欠账管理服务

  /* ==================== 字典配置管理服务 ==================== */
  'dictionary', // 字典表管理服务（category_defs, rarity_defs, asset_group_defs）
  'item_template', // 物品模板管理服务（item_templates）

  /* ==================== 系统基础服务 ==================== */
  'system_config', // 系统配置服务（动态限流配置）
  'batch_operation', // 批量操作服务（幂等性+状态管理）
  'display_name', // 显示名称翻译服务
  'feature_flag', // 功能开关服务
  'sealos_storage', // Sealos 对象存储服务

  /* ==================== 待处理中心服务 ==================== */
  'pending_summary', // 仪表盘待处理汇总服务（静态类）
  'pending_center', // 待处理中心服务（静态类）
  'nav_badge', // 导航栏徽标计数服务（静态类）

  /* ==================== 智能分析服务 ==================== */
  'reminder_engine', // 智能提醒规则引擎服务
  'custom_report', // 自定义报表服务

  /* ==================== 工具服务 ==================== */
  'idempotency', // 幂等性服务
  'data_sanitizer', // 数据脱敏服务
  'performance_monitor' // 性能监控服务
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
