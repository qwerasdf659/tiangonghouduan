#!/usr/bin/env node
'use strict'

/**
 * 上线前一次性「清行为」治理脚本（文档第二十三章 23.1 最终基线）
 *
 * 定位（拍板项5）：清行为 + 删测试用户 + 归零统计 收敛进一支带 dry_run 的原子脚本，
 * 关键金融步骤包在事务 + 清后对账里；运营 Web 手点仅保留给上线后日常配置清理。
 * 金融互锁组（asset_transactions/item_ledger/items/item_holds/account_asset_balances）
 * 不开放给手动类目，由本脚本调用受保护的 Service 方法整组单事务清理。
 *
 * 用法：
 *   node scripts/maintenance/pre_launch_behavior_wipe.js            # 默认 dry_run（仅预览，不删除）
 *   node scripts/maintenance/pre_launch_behavior_wipe.js --execute  # 真删（需已做 Sealos 快照）
 *
 * 保留账号：仅 user_id 32（超管）/ 11021（系统定时任务），其余测试用户连同行为数据清除。
 * 保留配置：活动/奖品/门店/商户/字典/全局配置等全部保留，仅清行为与归零统计。
 *
 * @module scripts/maintenance/pre_launch_behavior_wipe
 */

require('dotenv').config()

const DataManagementService = require('../../services/DataManagementService')
const models = require('../../models')
const { logger } = require('../../utils/logger')

/**
 * 系统操作员用户ID（无人工操作员时写审计用，须为真实存在的系统用户）
 * 与 DataManagementService.SYSTEM_DAILY_JOB_USER_ID 一致
 */
const OPERATOR_ID = 11021

/**
 * 脚本主入口
 * @returns {Promise<void>}
 */
async function main() {
  const execute = process.argv.includes('--execute')
  const dryRun = !execute

  logger.info('[清行为脚本] 启动', { mode: dryRun ? 'dry_run（仅预览）' : 'execute（真删）' })

  if (process.env.NODE_ENV === 'production') {
    logger.error('[清行为脚本] 生产环境禁止执行，已中止')
    process.exit(1)
  }

  const service = new DataManagementService(models)
  const result = await service.executePreLaunchBehaviorWipe(
    { dry_run: dryRun, reason: '上线前清测试数据（一次性治理任务）', confirmation_text: '确认删除' },
    OPERATOR_ID
  )

  /* eslint-disable no-console */
  console.log('\n========== 清行为结果（' + (dryRun ? 'DRY_RUN 预览' : '真实执行') + '） ==========')
  console.log(JSON.stringify(result, null, 2))
  console.log('==================================================\n')
  /* eslint-enable no-console */

  if (dryRun) {
    logger.info('[清行为脚本] dry_run 完成，未删除任何数据。确认无误后用 --execute 正式执行（先做 Sealos 快照）')
  } else {
    logger.info('[清行为脚本] 真实执行完成', {
      reconcile_after: result.reconcile_after,
      test_users: result.test_users,
      zeroed: result.zeroed
    })
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    logger.error('[清行为脚本] 执行失败', { error: error.message, stack: error.stack })
    process.exit(1)
  })
