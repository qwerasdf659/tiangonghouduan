#!/usr/bin/env node
'use strict'

/**
 * 开账流水补录脚本（Opening Balance Transaction Script）
 *
 * 业务背景：
 * - 现有 account_asset_balances 表中存在 DIAMOND/POINTS/材料余额
 * - 但对应的 asset_transactions 中缺少开账流水
 * - 导致无法通过 SUM(delta) = balance 进行对账验证
 *
 * 解决方案：
 * - 为每个 (account_id, asset_code) 组合补一条 opening_balance 流水
 * - delta_amount = 当前可用余额（available_amount）
 * - balance_before = 0, balance_after = available_amount
 * - idempotency_key = 'opening_{account_id}_{asset_code}'
 * - 使用事务保护，确保原子性
 *
 * 执行方式：
 * - 干跑模式（预览）: node scripts/migration/add-opening-balance.js --dry-run
 * - 正式执行: node scripts/migration/add-opening-balance.js --execute
 *
 * 决策时间：2026-01-08
 * 风险等级：🟡 中等（只读操作 + 插入新记录，不修改现有数据）
 *
 * @author 后端开发团队
 * @since 2026-01-08
 */

require('dotenv').config()

const { sequelize } = require('../../config/database')
const { Op, QueryTypes } = require('sequelize')

// 北京时间助手（timeHelper 模块导出为 BeijingTimeHelper）
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 开账流水补录执行器
 */
class OpeningBalanceExecutor {
  constructor(options = {}) {
    this.dryRun = options.dryRun || false
    this.executionTime = BeijingTimeHelper.createBeijingTime()
    this.stats = {
      totalBalances: 0,
      existingOpeningBalances: 0,
      needsCreation: 0,
      created: 0,
      skipped: 0,
      errors: []
    }
  }

  /**
   * 获取所有需要补录的账户余额
   *
   * 技术标准要求（交易流水收敛方案）：
   * - 所有 (account_id, asset_code) 组合都必须有开账流水
   * - 包括余额为0的账户（建立完整对账链）
   *
   * @returns {Promise<Array>} 账户余额列表
   */
  async getBalancesToProcess() {
    // 查询所有账户资产余额，不限制余额大小（包括0余额）
    const query = `
      SELECT 
        aab.balance_id,
        aab.account_id,
        aab.asset_code,
        aab.available_amount,
        aab.frozen_amount,
        a.user_id,
        a.account_type,
        a.system_code
      FROM account_asset_balances aab
      INNER JOIN accounts a ON aab.account_id = a.account_id
      ORDER BY aab.account_id, aab.asset_code
    `

    // sequelize.query 返回 [results, metadata]，使用 raw: true 直接返回结果数组
    const [balances] = await sequelize.query(query, { raw: true })
    return balances
  }

  /**
   * 检查是否已存在开账流水
   *
   * @param {number} accountId - 账户ID
   * @param {string} assetCode - 资产代码
   * @returns {Promise<boolean>} 是否存在
   */
  async hasOpeningBalance(accountId, assetCode) {
    const idempotencyKey = `opening_${accountId}_${assetCode}`
    const [result] = await sequelize.query(
      `SELECT 1 FROM asset_transactions WHERE idempotency_key = ? LIMIT 1`,
      {
        replacements: [idempotencyKey],
        type: QueryTypes.SELECT
      }
    )
    return result !== undefined
  }

  /**
   * 创建开账流水记录
   *
   * @param {Object} balance - 余额对象
   * @param {Object} transaction - Sequelize事务对象
   * @returns {Promise<Object>} 创建结果
   */
  async createOpeningBalanceTransaction(balance, transaction) {
    const idempotencyKey = `opening_${balance.account_id}_${balance.asset_code}`

    // 开账金额 = 可用余额（冻结余额单独处理，在 frozen_amount_change 字段迁移后）
    const deltaAmount = parseInt(balance.available_amount, 10)

    const insertQuery = `
      INSERT INTO asset_transactions (
        account_id,
        asset_code,
        delta_amount,
        balance_before,
        balance_after,
        business_type,
        lottery_session_id,
        idempotency_key,
        meta,
        created_at
      ) VALUES (
        ?,
        ?,
        ?,
        0,
        ?,
        'opening_balance',
        NULL,
        ?,
        ?,
        ?
      )
    `

    const meta = JSON.stringify({
      description: '历史余额开账补录',
      execution_time: this.executionTime,
      original_available: balance.available_amount,
      original_frozen: balance.frozen_amount,
      user_id: balance.user_id,
      account_type: balance.account_type,
      system_code: balance.system_code || null,
      source: 'add-opening-balance.js'
    })

    await sequelize.query(insertQuery, {
      replacements: [
        balance.account_id,
        balance.asset_code,
        deltaAmount,
        deltaAmount,
        idempotencyKey,
        meta,
        this.executionTime
      ],
      transaction,
      type: QueryTypes.INSERT
    })

    return {
      account_id: balance.account_id,
      asset_code: balance.asset_code,
      delta_amount: deltaAmount,
      idempotency_key: idempotencyKey
    }
  }

  /**
   * 执行开账流水补录
   */
  async execute() {
    console.log('═'.repeat(60))
    console.log('🏦 开账流水补录脚本（Opening Balance Transaction Script）')
    console.log('═'.repeat(60))
    console.log(`📅 执行时间: ${this.executionTime}`)
    console.log(`🔧 执行模式: ${this.dryRun ? '🔍 DRY RUN（预览模式）' : '⚡ EXECUTE（正式执行）'}`)
    console.log('')

    try {
      // 1. 获取所有需要处理的余额记录
      console.log('📊 步骤1: 获取账户余额数据...')
      const balances = await this.getBalancesToProcess()
      this.stats.totalBalances = balances.length
      console.log(`   找到 ${balances.length} 条账户余额记录`)

      if (balances.length === 0) {
        console.log('   ⚠️ 没有找到需要处理的余额记录，脚本结束')
        return this.stats
      }

      // 2. 检查已存在的开账流水
      console.log('')
      console.log('📊 步骤2: 检查已存在的开账流水...')
      const toProcess = []

      for (const balance of balances) {
        const exists = await this.hasOpeningBalance(balance.account_id, balance.asset_code)
        if (exists) {
          this.stats.existingOpeningBalances++
          console.log(`   ⏭️ 已存在: 账户${balance.account_id} - ${balance.asset_code} (跳过)`)
        } else {
          toProcess.push(balance)
        }
      }

      this.stats.needsCreation = toProcess.length
      console.log(`   需要创建: ${toProcess.length} 条`)
      console.log(`   已存在: ${this.stats.existingOpeningBalances} 条`)

      if (toProcess.length === 0) {
        console.log('   ⚠️ 所有开账流水已存在，无需补录')
        return this.stats
      }

      // 3. 展示待处理数据
      console.log('')
      console.log('📋 步骤3: 待补录数据预览:')
      console.log('   ┌─────────┬─────────────┬───────────────┬───────────────┐')
      console.log('   │ 账户ID  │ 资产代码     │ 开账金额      │ 幂等键         │')
      console.log('   ├─────────┼─────────────┼───────────────┼───────────────┤')

      for (const balance of toProcess) {
        const idempotencyKey = `opening_${balance.account_id}_${balance.asset_code}`
        console.log(
          `   │ ${String(balance.account_id).padEnd(7)} │ ${String(balance.asset_code).padEnd(11)} │ ${String(balance.available_amount).padEnd(13)} │ ${idempotencyKey.padEnd(13)} │`
        )
      }
      console.log('   └─────────┴─────────────┴───────────────┴───────────────┘')

      // 4. 执行补录（如果不是 dry run）
      if (this.dryRun) {
        console.log('')
        console.log('🔍 DRY RUN 模式 - 不执行实际写入操作')
        console.log(
          '   若要正式执行，请使用: node scripts/migration/add-opening-balance.js --execute'
        )
      } else {
        console.log('')
        console.log('⚡ 步骤4: 执行开账流水补录...')

        const transaction = await sequelize.transaction()

        try {
          for (const balance of toProcess) {
            const result = await this.createOpeningBalanceTransaction(balance, transaction)
            this.stats.created++
            console.log(
              `   ✅ 创建: 账户${result.account_id} - ${result.asset_code} = ${result.delta_amount}`
            )
          }

          await transaction.commit()
          console.log('')
          console.log('   🎉 事务提交成功')
        } catch (error) {
          await transaction.rollback()
          console.error('')
          console.error(`   ❌ 事务回滚: ${error.message}`)
          this.stats.errors.push(error.message)
          throw error
        }
      }

      // 5. 输出统计报告
      this.printSummary()

      return this.stats
    } catch (error) {
      console.error('')
      console.error(`❌ 脚本执行失败: ${error.message}`)
      console.error(error.stack)
      throw error
    }
  }

  /**
   * 打印统计报告
   */
  printSummary() {
    console.log('')
    console.log('═'.repeat(60))
    console.log('📊 执行统计报告')
    console.log('═'.repeat(60))
    console.log(`   总余额记录:        ${this.stats.totalBalances}`)
    console.log(`   已存在开账流水:    ${this.stats.existingOpeningBalances}`)
    console.log(`   需要创建:          ${this.stats.needsCreation}`)
    console.log(`   成功创建:          ${this.stats.created}`)
    console.log(`   跳过:              ${this.stats.skipped}`)
    console.log(`   错误:              ${this.stats.errors.length}`)
    console.log('═'.repeat(60))

    if (this.stats.errors.length > 0) {
      console.log('')
      console.log('❌ 错误详情:')
      this.stats.errors.forEach((err, i) => {
        console.log(`   ${i + 1}. ${err}`)
      })
    }
  }
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run') || !args.includes('--execute')

  if (!args.includes('--dry-run') && !args.includes('--execute')) {
    console.log('⚠️ 未指定执行模式，默认使用 --dry-run（预览模式）')
    console.log('   使用方法:')
    console.log('   - 预览模式: node scripts/migration/add-opening-balance.js --dry-run')
    console.log('   - 正式执行: node scripts/migration/add-opening-balance.js --execute')
    console.log('')
  }

  const executor = new OpeningBalanceExecutor({ dryRun: isDryRun })

  try {
    await executor.execute()
    process.exit(0)
  } catch (error) {
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 执行主函数
main()
