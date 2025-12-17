/**
 * 餐厅积分抽奖系统 V4.2 - 每日资产对账任务
 *
 * 职责：
 * - 每日对比 account_asset_balances 和 asset_transactions 的一致性
 * - 检测余额异常并生成报告
 * - 发送告警通知
 *
 * 执行策略：
 * - 定时执行：每天凌晨2点
 * - 对账范围：所有非零余额账户
 * - 差异阈值：0.01（精度容忍范围）
 * - 告警渠道：日志 + 可扩展企业微信/钉钉
 *
 * 创建时间：2025-12-17
 * 使用模型：Claude Sonnet 4.5
 */

const { AccountAssetBalance, AssetTransaction, Account, Op } = require('../models')
const Logger = require('../services/UnifiedLotteryEngine/utils/Logger')

const logger = new Logger('DailyAssetReconciliation')

/**
 * 每日资产对账任务类
 *
 * @class DailyAssetReconciliation
 * @description 核对账本余额与流水聚合的一致性
 */
class DailyAssetReconciliation {
  /**
   * 执行对账任务
   *
   * @returns {Promise<Object>} 对账报告
   * @returns {Object} report - 对账报告
   * @returns {number} report.total_checked - 检查账户数
   * @returns {number} report.discrepancy_count - 差异账户数
   * @returns {Array<Object>} report.discrepancies - 差异详情
   * @returns {string} report.status - 状态: OK/WARNING/ERROR
   */
  static async execute() {
    const start_time = Date.now()
    logger.info('开始每日资产对账')

    try {
      // 查询所有非零余额账户
      const balances = await AccountAssetBalance.findAll({
        where: {
          [Op.or]: [{ available_amount: { [Op.gt]: 0 } }, { frozen_amount: { [Op.gt]: 0 } }]
        },
        include: [
          {
            model: Account,
            as: 'account',
            attributes: ['account_id', 'user_id', 'system_code']
          }
        ],
        order: [
          ['account_id', 'ASC'],
          ['asset_code', 'ASC']
        ]
      })

      logger.info(`待对账账户资产数: ${balances.length}`)

      // 对账差异记录
      const discrepancies = []

      // 逐个余额对账
      for (const balance of balances) {
        // eslint-disable-next-line no-await-in-loop
        const discrepancy = await this._reconcileBalance(balance)
        if (discrepancy) {
          discrepancies.push(discrepancy)
        }
      }

      // 生成报告
      const duration_ms = Date.now() - start_time
      const report = {
        timestamp: new Date().toISOString(),
        duration_ms,
        total_checked: balances.length,
        discrepancy_count: discrepancies.length,
        discrepancies,
        status: this._determineStatus(discrepancies.length, balances.length)
      }

      // 输出报告
      this._outputReport(report)

      // 发送告警（如果有差异）
      if (discrepancies.length > 0) {
        await this._sendAlert(report)
      }

      logger.info('每日资产对账完成', {
        total_checked: report.total_checked,
        discrepancy_count: report.discrepancy_count,
        duration_ms: report.duration_ms
      })

      return report
    } catch (error) {
      logger.error('每日资产对账失败', {
        error_message: error.message,
        error_stack: error.stack
      })
      throw error
    }
  }

  /**
   * 对账单个余额
   *
   * @param {Object} balance - 余额记录
   * @returns {Promise<Object|null>} 差异详情或null（无差异）
   * @private
   */
  static async _reconcileBalance(balance) {
    const { account_id, asset_code, available_amount, frozen_amount } = balance

    try {
      // 查询该账户该资产的所有流水
      const transactions = await AssetTransaction.findAll({
        where: {
          account_id,
          asset_code
        },
        attributes: ['delta_amount', 'frozen_amount_change', 'business_type', 'created_at'],
        order: [['created_at', 'ASC']]
      })

      // 计算流水聚合余额
      let calculated_available = 0
      let calculated_frozen = 0

      for (const tx of transactions) {
        // 可用余额变动
        if (tx.delta_amount !== null) {
          calculated_available += Number(tx.delta_amount)
        }

        // 冻结余额变动
        if (tx.frozen_amount_change !== null) {
          calculated_frozen += Number(tx.frozen_amount_change)
        }
      }

      // 对比余额
      const actual_available = Number(available_amount)
      const actual_frozen = Number(frozen_amount)
      const available_diff = Math.abs(calculated_available - actual_available)
      const frozen_diff = Math.abs(calculated_frozen - actual_frozen)

      // 差异阈值：0.01（精度容忍）
      const THRESHOLD = 0.01

      if (available_diff > THRESHOLD || frozen_diff > THRESHOLD) {
        // 获取账户信息
        const account = balance.account || (await balance.getAccount())

        return {
          account_id,
          user_id: account.user_id,
          system_code: account.system_code,
          asset_code,
          balance: {
            available: {
              expected: calculated_available,
              actual: actual_available,
              diff: available_diff
            },
            frozen: {
              expected: calculated_frozen,
              actual: actual_frozen,
              diff: frozen_diff
            }
          },
          transaction_count: transactions.length,
          last_transaction_at:
            transactions.length > 0 ? transactions[transactions.length - 1].created_at : null
        }
      }

      return null // 无差异
    } catch (error) {
      logger.error('单个余额对账失败', {
        account_id,
        asset_code,
        error_message: error.message
      })

      return {
        account_id,
        asset_code,
        error: error.message
      }
    }
  }

  /**
   * 判断对账状态
   *
   * @param {number} discrepancy_count - 差异数量
   * @param {number} total_count - 总检查数量
   * @returns {string} 状态: OK/WARNING/ERROR
   * @private
   */
  static _determineStatus(discrepancy_count, total_count) {
    if (discrepancy_count === 0) {
      return 'OK'
    }

    const discrepancy_rate = discrepancy_count / total_count

    // 差异率 > 5% 为严重错误
    if (discrepancy_rate > 0.05) {
      return 'ERROR'
    }

    // 差异率 > 1% 为警告
    if (discrepancy_rate > 0.01) {
      return 'WARNING'
    }

    return 'WARNING'
  }

  /**
   * 输出对账报告
   *
   * @param {Object} report - 对账报告
   * @returns {void}
   * @private
   */
  static _outputReport(report) {
    console.log('\n' + '='.repeat(80))
    console.log('📊 每日资产对账报告')
    console.log('='.repeat(80))
    console.log(`时间: ${report.timestamp}`)
    console.log(`耗时: ${report.duration_ms}ms`)
    console.log(`检查账户资产数: ${report.total_checked}`)
    console.log(`发现差异数: ${report.discrepancy_count}`)
    console.log(`状态: ${this._getStatusEmoji(report.status)} ${report.status}`)

    if (report.discrepancies.length > 0) {
      console.log('\n🔍 差异详情:')
      report.discrepancies.forEach((disc, index) => {
        console.log(`\n${index + 1}. 账户 ${disc.account_id} - 资产 ${disc.asset_code}`)

        if (disc.user_id) {
          console.log(`   用户ID: ${disc.user_id}`)
        }
        if (disc.system_code) {
          console.log(`   系统账户: ${disc.system_code}`)
        }

        if (disc.balance) {
          console.log('   可用余额差异:')
          console.log(
            `     预期: ${disc.balance.available.expected}, 实际: ${disc.balance.available.actual}, 差异: ${disc.balance.available.diff}`
          )
          console.log('   冻结余额差异:')
          console.log(
            `     预期: ${disc.balance.frozen.expected}, 实际: ${disc.balance.frozen.actual}, 差异: ${disc.balance.frozen.diff}`
          )
          console.log(`   流水记录数: ${disc.transaction_count}`)
          console.log(`   最后流水时间: ${disc.last_transaction_at || 'N/A'}`)
        }

        if (disc.error) {
          console.log(`   错误: ${disc.error}`)
        }
      })
    }

    console.log('\n' + '='.repeat(80))
  }

  /**
   * 获取状态Emoji
   *
   * @param {string} status - 状态
   * @returns {string} Emoji
   * @private
   */
  static _getStatusEmoji(status) {
    const emojiMap = {
      OK: '✅',
      WARNING: '⚠️',
      ERROR: '❌'
    }
    return emojiMap[status] || '❓'
  }

  /**
   * 发送告警通知
   *
   * @param {Object} report - 对账报告
   * @returns {Promise<void>} - 返回 Promise，无返回值
   * @private
   */
  static async _sendAlert(report) {
    /*
     * TODO: 接入企业微信/钉钉告警
     * 当前仅记录日志
     */

    logger.error('发现资产余额差异', {
      discrepancy_count: report.discrepancy_count,
      status: report.status,
      summary: report.discrepancies.map(d => ({
        account_id: d.account_id,
        asset_code: d.asset_code,
        available_diff: d.balance?.available?.diff,
        frozen_diff: d.balance?.frozen?.diff
      }))
    })

    // 示例：企业微信告警（需配置Webhook）
    /*
     *const webhook_url = process.env.WECHAT_WEBHOOK_URL
     *if (webhook_url) {
     *  const axios = require('axios')
     *  await axios.post(webhook_url, {
     *    msgtype: 'text',
     *    text: {
     *      content: `【资产对账告警】\n发现${report.discrepancy_count}笔余额差异\n状态: ${report.status}\n时间: ${report.timestamp}`
     *    }
     *  })
     *}
     */
  }
}

// 直接执行对账（供定时任务调用）
if (require.main === module) {
  ;(async () => {
    try {
      const report = await DailyAssetReconciliation.execute()
      process.exit(report.status === 'OK' ? 0 : 1)
    } catch (error) {
      console.error('对账任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DailyAssetReconciliation
