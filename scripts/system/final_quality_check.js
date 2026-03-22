#!/usr/bin/env node
/**
 * 统一质量门禁入口（health:check / quality:check / system:check）
 *
 * 执行顺序：
 * 1. `npm run migration:verify` — 迁移规范与 verify-migrations 工具
 * 2. `pre_start_check` — 路由、环境变量、必需文件、可选 DB、Canonical Operation
 *
 * 可选环境变量：
 * - `CHECK_DATABASE=false` — 跳过数据库连接（无 .env 或 CI 仅结构检查时）
 * - `HEALTH_RUN_LINT=1` — 额外执行全仓 `npm run lint`（当前全仓仍有历史 JSDoc 债务，默认不跑以免误伤日常 health）
 *
 * @module scripts/system/final_quality_check
 */

'use strict'

const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '../..')

require('dotenv').config({ path: path.join(root, '.env') })

function runNpmScript(scriptName) {
  const cmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const r = spawnSync(cmd, ['run', scriptName], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: false
  })
  return r.status === 0
}

async function main() {
  console.log('\n========== final_quality_check（质量门禁）==========\n')

  if (!runNpmScript('migration:verify')) {
    console.error('\n❌ migration:verify 失败\n')
    process.exit(1)
  }

  const preStartCheck = require('../validation/pre_start_check')
  const ok = await preStartCheck()
  if (!ok) {
    console.error('\n❌ 启动前检查未通过\n')
    process.exit(1)
  }

  if (process.env.HEALTH_RUN_LINT === '1') {
    console.log('\n--- HEALTH_RUN_LINT=1：执行 npm run lint ---\n')
    if (!runNpmScript('lint')) {
      console.error('\n❌ ESLint 未通过\n')
      process.exit(1)
    }
  } else {
    console.log('\nℹ️  未执行全仓 ESLint（设 HEALTH_RUN_LINT=1 可启用；历史 JSDoc 见技术债务）\n')
  }

  console.log('✅ final_quality_check 全部阶段通过\n')
}

main().catch(err => {
  console.error('❌ final_quality_check 异常:', err)
  process.exit(1)
})
