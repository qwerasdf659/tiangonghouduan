/**
 * Web 管理后台前端字段映射黑名单扫描
 *
 * 扫描 admin/src/ 下所有 JS 和 HTML 文件
 * 确保不使用已废弃的短字段名作为数据字段
 *
 * 对应文档：阶段 5.5 + 7.11
 *
 * 黑名单字段（12.1 表格中的废弃名）：
 * - listing_id（非广告域）→ 应使用 market_listing_id
 * - record_id（非广告域）→ 应使用 lottery_draw_id 或 exchange_record_id
 * - prize_id（非广告域）→ 应使用 lottery_prize_id
 * - preset_id（非广告域）→ 应使用 lottery_preset_id
 * - draw_id → 应使用 lottery_draw_id
 * - session_id（非客服域）→ 应使用 authentication_session_id
 *
 * 豁免：
 * - 广告域 ad_campaign_id（以 ad_ 前缀识别）
 * - B 类短命名（address_id、notification_id、media_id 等）
 *
 * @module admin/scripts/check-frontend-mappings
 */

'use strict'

const fs = require('fs')
const path = require('path')
const glob = require('glob')

const ADMIN_SRC = path.resolve(__dirname, '../src')
const ADMIN_HTML = path.resolve(__dirname, '..')

/**
 * 黑名单规则
 * pattern: 匹配模式（正则）
 * exemptPatterns: 豁免模式（如果行内包含这些字符串则跳过）
 */
const BLACKLIST_RULES = [
  {
    name: 'listing_id（非广告域）',
    pattern: /\blisting_id\b/,
    exemptPatterns: ['market_listing_id', 'auction_listing_id', 'ad_'],
    replacement: 'market_listing_id 或 auction_listing_id'
  },
  {
    name: 'prize_id（非广告域）',
    pattern: /\bprize_id\b/,
    exemptPatterns: ['lottery_prize_id', 'ad_'],
    replacement: 'lottery_prize_id'
  },
  {
    name: 'draw_id',
    pattern: /\bdraw_id\b/,
    exemptPatterns: ['lottery_draw_id'],
    replacement: 'lottery_draw_id'
  },
  {
    name: 'preset_id（非广告域）',
    pattern: /\bpreset_id\b/,
    exemptPatterns: ['lottery_preset_id', 'ad_'],
    replacement: 'lottery_preset_id'
  }
]

function scanFiles(dir, extensions) {
  let violations = 0
  if (!fs.existsSync(dir)) return 0

  const pattern = extensions.map(ext => `**/*${ext}`).join(',')
  const files = glob.sync(`{${pattern}}`, { cwd: dir, ignore: ['node_modules/**', 'dist/**'] })

  for (const file of files) {
    const filePath = path.join(dir, file)
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')

    for (const rule of BLACKLIST_RULES) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.trim().startsWith('//') || line.trim().startsWith('*') || line.trim().startsWith('<!--')) continue

        if (rule.pattern.test(line)) {
          const isExempt = rule.exemptPatterns.some(ep => line.includes(ep))
          if (isExempt) continue

          const relPath = path.relative(path.resolve(__dirname, '../..'), filePath)
          console.error(`❌ [${rule.name}] ${relPath}:${i + 1}`)
          console.error(`   ${line.trim().substring(0, 120)}`)
          console.error(`   → 应使用 ${rule.replacement}`)
          violations++
        }
      }
    }
  }

  return violations
}

function main() {
  console.log('🔍 扫描 admin 前端字段映射黑名单...\n')

  let total = 0
  total += scanFiles(ADMIN_SRC, ['.js'])
  total += scanFiles(ADMIN_HTML, ['.html'])

  if (total === 0) {
    console.log('\n✅ 前端字段映射黑名单扫描通过：未发现已废弃的短字段名')
  } else {
    console.error(`\n❌ 发现 ${total} 处违规，请修复后重新提交`)
  }

  process.exit(total > 0 ? 1 : 0)
}

main()
