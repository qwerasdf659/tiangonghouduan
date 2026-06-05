/**
 * 字段黑名单扫描 — 防止已废弃的映射字段名回归
 *
 * 业务背景（2026-06-04 方案C 奖品 key 统一）：
 * - 内部全系统统一使用 lottery_campaign_prizes 主键真名 lottery_campaign_prize_id
 * - 历史假名 lottery_prize_id（对应已删除的 lottery_prizes 表）已全量淘汰
 * - 仅 DataSanitizer 对小程序输出时把 lottery_campaign_prize_id 映射为通用 id（防抓包暴露内部表名）
 * - 本脚本在 CI/pre-commit 中运行，防止旧假名 lottery_prize_id 被重新引入后端代码
 *
 * 扫描规则：
 * - 在后端代码中（routes/、services/），禁止出现旧假名 lottery_prize_id（lottery_draws/preset_inventory_debt 列已改名）
 * - 在前端代码中（admin/src/），禁止出现旧短字段名 prize_id 作为数据字段主键
 *
 * @module scripts/validation/check_field_blacklist
 */

'use strict'

const fs = require('fs')
const path = require('path')
const glob = require('glob')

const PROJECT_ROOT = path.resolve(__dirname, '../..')

/** 黑名单规则：正则 + 说明 + 扫描范围 */
const BLACKLIST_RULES = [
  {
    name: '后端 prize_id 映射赋值',
    pattern: /sanitized\.prize_id\s*=\s*sanitized\.lottery_campaign_prize_id/,
    dirs: ['services/'],
    description: 'DataSanitizer 应映射为通用 id，而非 prize_id'
  },
  {
    name: '后端 listing_id 映射赋值',
    pattern: /sanitized\.listing_id\s*=\s*sanitized\.market_listing_id/,
    dirs: ['services/'],
    description: 'DataSanitizer 不应再做 market_listing_id → listing_id 映射'
  },
  {
    name: '后端残留旧假名 lottery_prize_id',
    pattern: /lottery_prize_id/,
    dirs: ['services/', 'routes/'],
    description: '方案C：奖品标识统一为 lottery_campaign_prize_id，旧假名 lottery_prize_id 已淘汰'
  },
  {
    name: '后端 delete market_listing_id',
    pattern: /delete\s+sanitized\.market_listing_id/,
    dirs: ['services/'],
    description: '不应删除 market_listing_id 字段（它是真实主键）'
  },
  {
    name: '前端 prize_id 数据字段（非请求参数）',
    pattern: /key:\s*['"]prize_id['"]|primaryKey:\s*['"]prize_id['"]/,
    dirs: ['admin/src/modules/'],
    description: '前端表格/主键应使用 lottery_campaign_prize_id，不是 prize_id'
  }
]

function scan() {
  let violations = 0

  for (const rule of BLACKLIST_RULES) {
    for (const dir of rule.dirs) {
      const fullDir = path.join(PROJECT_ROOT, dir)
      if (!fs.existsSync(fullDir)) continue

      const files = glob.sync('**/*.js', { cwd: fullDir, ignore: ['node_modules/**'] })

      for (const file of files) {
        const filePath = path.join(fullDir, file)
        const content = fs.readFileSync(filePath, 'utf8')
        const lines = content.split('\n')

        for (let i = 0; i < lines.length; i++) {
          if (rule.pattern.test(lines[i]) && !lines[i].trim().startsWith('//') && !lines[i].trim().startsWith('*')) {
            console.error(`❌ [${rule.name}] ${dir}${file}:${i + 1}`)
            console.error(`   ${lines[i].trim()}`)
            console.error(`   → ${rule.description}`)
            violations++
          }
        }
      }
    }
  }

  if (violations === 0) {
    console.log('✅ 字段黑名单扫描通过：未发现已废弃的映射字段名')
  } else {
    console.error(`\n❌ 发现 ${violations} 处违规，请修复后重新提交`)
  }

  return violations
}

const count = scan()
process.exit(count > 0 ? 1 : 0)
