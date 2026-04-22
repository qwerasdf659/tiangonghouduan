/**
 * 后端 API 响应字段合约扫描
 *
 * 扫描 routes/v4/ 下所有路由文件，确保响应体中不出现 12.1 黑名单字段
 * 防止已废弃的短字段名在路由层被重新引入
 *
 * 对应文档：阶段 7.1
 *
 * @module scripts/validation/check_api_field_contract
 */

'use strict'

const fs = require('fs')
const path = require('path')
const glob = require('glob')

const PROJECT_ROOT = path.resolve(__dirname, '../..')

/**
 * 12.1 黑名单字段（在非广告域中禁止使用的短字段名）
 * 这些字段已被长命名替代，不应在路由响应中出现
 */
const BLACKLIST_FIELDS = [
  { field: 'campaign_id', replacement: 'lottery_campaign_id 或 ad_campaign_id', exemptDirs: ['ad/', 'ad-campaigns'] },
  { field: 'draw_id', replacement: 'lottery_draw_id', exemptDirs: [] },
  { field: 'record_id', replacement: 'lottery_draw_id 或 exchange_record_id', exemptDirs: ['business-records/', 'consumption/', 'merchant/', 'risk/'] },
  { field: 'preset_id', replacement: 'lottery_preset_id', exemptDirs: ['ad/'] }
]

/**
 * 检测模式：赋值给响应对象的短字段名
 * 例如：result.campaign_id = ... 或 { campaign_id: ... }
 */
function buildPattern(field) {
  return new RegExp(`['"]${field}['"]\\s*:|\\b${field}\\s*:(?!\\s*['"])`, 'g')
}

function scan() {
  let violations = 0
  const routesDir = path.join(PROJECT_ROOT, 'routes/v4')

  if (!fs.existsSync(routesDir)) {
    console.error('❌ routes/v4 目录不存在')
    return 1
  }

  const files = glob.sync('**/*.js', { cwd: routesDir, ignore: ['node_modules/**'] })

  for (const file of files) {
    const filePath = path.join(routesDir, file)
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split('\n')

    for (const rule of BLACKLIST_FIELDS) {
      const isExempt = rule.exemptDirs.some(dir => file.includes(dir))
      if (isExempt) continue

      const pattern = buildPattern(rule.field)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue
        if (line.includes('logger.') || line.includes('console.')) continue
        if (pattern.test(line)) {
          // 排除注释和字符串比较
          if (line.includes('where:') || line.includes('findOne') || line.includes('findAll')) continue
          console.error(`❌ [${rule.field}] routes/v4/${file}:${i + 1}`)
          console.error(`   ${line.trim()}`)
          console.error(`   → 应使用 ${rule.replacement}`)
          violations++
        }
        pattern.lastIndex = 0
      }
    }
  }

  if (violations === 0) {
    console.log('✅ 后端 API 字段合约扫描通过')
  } else {
    console.error(`\n❌ 发现 ${violations} 处违规`)
  }

  return violations
}

const count = scan()
process.exit(count > 0 ? 1 : 0)
