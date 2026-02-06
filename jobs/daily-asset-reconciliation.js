/**
 * 餐厅积分抽奖系统 V4.2 - 每日资产对账任务
 *
 * 职责：
 * - 每日对比 account_asset_balances 和 asset_transactions 的一致性
 * - 检测余额异常并生成报告
 * - 发送告警通知
 * - 【P1-3 事务边界治理】业务记录与资产流水关联对账
 *
 * 执行策略：
 * - 定时执行：每天凌晨2点
 * - 对账范围：所有非零余额账户 + 业务记录关联
 * - 差异阈值：0.01（精度容忍范围）
 * - 告警渠道：日志 + 可扩展企业微信/钉钉
 *
 * 事务边界治理扩展（2026-01-05）：
 * - 检查 lottery_draws.asset_transaction_id 关联
 * - 检查 consumption_records.reward_transaction_id 关联
 * - 检查 exchange_records.debit_transaction_id 关联
 *
 * 创建时间：2025-12-17
 * 最后更新：2026-01-05（事务边界治理 P1-3）
 */

const {
  AccountAssetBalance,
  AssetTransaction,
  Account,
  LotteryDraw,
  ConsumptionRecord,
  ExchangeRecord,
  Op
} = require('../models')

const logger = require('../utils/logger').logger
const NotificationService = require('../services/NotificationService')

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
    /**
     * 告警通知
     *
     * 实现方式：通过 NotificationService 发送给所有在线管理员
     * 2026-01-05 升级：从日志记录升级为真正的管理员通知
     */

    // 记录详细日志
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

    // 通过 NotificationService 发送管理员告警
    try {
      await NotificationService.sendToAdmins({
        type: 'asset_reconciliation_alert',
        title: '资产对账告警',
        content: `发现${report.discrepancy_count}笔余额差异（状态: ${report.status}），请及时检查处理`,
        data: {
          discrepancy_count: report.discrepancy_count,
          status: report.status,
          timestamp: report.timestamp,
          duration_ms: report.duration_ms,
          // 只发送摘要，避免数据过大
          summary: report.discrepancies.slice(0, 5).map(d => ({
            account_id: d.account_id,
            user_id: d.user_id,
            asset_code: d.asset_code,
            available_diff: d.balance?.available?.diff,
            frozen_diff: d.balance?.frozen?.diff
          }))
        }
      })
      logger.info('资产对账告警已发送给管理员')
    } catch (notifyError) {
      logger.error('发送资产对账告警失败', { error: notifyError.message })
    }
  }

  // ========== 事务边界治理 P1-3: 业务记录关联对账 ==========

  /**
   * 执行业务记录关联对账
   *
   * 检查业务记录与 asset_transactions 的关联完整性：
   * 1. lottery_draws.asset_transaction_id 是否有效
   * 2. consumption_records.reward_transaction_id 是否有效（已审核通过的）
   * 3. exchange_records.debit_transaction_id 是否有效
   *
   * @param {Date} cutoffDate - 分界线时间（只检查该时间之后的记录）
   * @returns {Promise<Object>} 业务关联对账报告
   */
  static async executeBusinessRecordReconciliation(cutoffDate = null) {
    const start_time = Date.now()
    const effectiveCutoff = cutoffDate || new Date('2026-01-02T20:24:20.000Z')

    logger.info('开始业务记录关联对账', { cutoff_date: effectiveCutoff.toISOString() })

    try {
      const results = {
        timestamp: new Date().toISOString(),
        cutoff_date: effectiveCutoff.toISOString(),
        lottery_draws: await this._reconcileLotteryDraws(effectiveCutoff),
        consumption_records: await this._reconcileConsumptionRecords(effectiveCutoff),
        exchange_records: await this._reconcileExchangeRecords(effectiveCutoff)
      }

      results.duration_ms = Date.now() - start_time
      results.total_issues =
        results.lottery_draws.missing_transaction_ids.length +
        results.lottery_draws.orphan_transaction_ids.length +
        results.consumption_records.missing_transaction_ids.length +
        results.consumption_records.orphan_transaction_ids.length +
        results.exchange_records.missing_transaction_ids.length +
        results.exchange_records.orphan_transaction_ids.length
      results.status = results.total_issues === 0 ? 'OK' : 'WARNING'

      this._outputBusinessRecordReport(results)

      if (results.total_issues > 0) {
        await this._sendBusinessRecordAlert(results)
      }

      logger.info('业务记录关联对账完成', {
        total_issues: results.total_issues,
        duration_ms: results.duration_ms
      })

      return results
    } catch (error) {
      logger.error('业务记录关联对账失败', {
        error_message: error.message,
        error_stack: error.stack
      })
      throw error
    }
  }

  /**
   * 对账抽奖记录与资产流水关联
   *
   * @param {Date} cutoffDate - 分界线时间
   * @returns {Promise<Object>} 对账结果
   * @private
   */
  static async _reconcileLotteryDraws(cutoffDate) {
    // 查询分界线后所有抽奖记录
    const draws = await LotteryDraw.findAll({
      where: {
        created_at: { [Op.gte]: cutoffDate }
      },
      attributes: [
        'lottery_draw_id',
        'user_id',
        'asset_transaction_id',
        'cost_points',
        'created_at'
      ]
    })

    const missing_transaction_ids = []
    const orphan_transaction_ids = []

    for (const draw of draws) {
      if (!draw.asset_transaction_id) {
        // 缺失关联：抽奖记录没有关联流水ID
        missing_transaction_ids.push({
          lottery_draw_id: draw.lottery_draw_id,
          user_id: draw.user_id,
          cost_points: draw.cost_points,
          created_at: draw.created_at
        })
      } else {
        // 验证关联的流水是否存在
        // eslint-disable-next-line no-await-in-loop
        const transaction = await AssetTransaction.findByPk(draw.asset_transaction_id)
        if (!transaction) {
          orphan_transaction_ids.push({
            lottery_draw_id: draw.lottery_draw_id,
            asset_transaction_id: draw.asset_transaction_id,
            user_id: draw.user_id,
            created_at: draw.created_at
          })
        }
      }
    }

    return {
      total_checked: draws.length,
      missing_transaction_ids,
      orphan_transaction_ids
    }
  }

  /**
   * 对账消费记录与资产流水关联
   * 只检查已审核通过的记录（approved 状态应有奖励流水）
   *
   * @param {Date} cutoffDate - 分界线时间
   * @returns {Promise<Object>} 对账结果
   * @private
   */
  static async _reconcileConsumptionRecords(cutoffDate) {
    // 查询分界线后所有已审核通过的消费记录
    const records = await ConsumptionRecord.unscoped().findAll({
      where: {
        created_at: { [Op.gte]: cutoffDate },
        status: 'approved',
        is_deleted: 0
      },
      attributes: [
        'consumption_record_id',
        'user_id',
        'reward_transaction_id',
        'points_to_award',
        'created_at'
      ]
    })

    const missing_transaction_ids = []
    const orphan_transaction_ids = []

    for (const record of records) {
      if (!record.reward_transaction_id) {
        // 缺失关联：已审核通过但没有奖励流水ID
        missing_transaction_ids.push({
          consumption_record_id: record.consumption_record_id,
          user_id: record.user_id,
          points_to_award: record.points_to_award,
          created_at: record.created_at
        })
      } else {
        // 验证关联的流水是否存在
        // eslint-disable-next-line no-await-in-loop
        const transaction = await AssetTransaction.findByPk(record.reward_transaction_id)
        if (!transaction) {
          orphan_transaction_ids.push({
            consumption_record_id: record.consumption_record_id,
            reward_transaction_id: record.reward_transaction_id,
            user_id: record.user_id,
            created_at: record.created_at
          })
        }
      }
    }

    return {
      total_checked: records.length,
      missing_transaction_ids,
      orphan_transaction_ids
    }
  }

  /**
   * 对账兑换记录与资产流水关联
   *
   * @param {Date} cutoffDate - 分界线时间
   * @returns {Promise<Object>} 对账结果
   * @private
   */
  static async _reconcileExchangeRecords(cutoffDate) {
    // 查询分界线后所有兑换记录
    const records = await ExchangeRecord.findAll({
      where: {
        created_at: { [Op.gte]: cutoffDate }
      },
      attributes: [
        'exchange_record_id',
        'user_id',
        'debit_transaction_id',
        'pay_amount',
        'created_at'
      ]
    })

    const missing_transaction_ids = []
    const orphan_transaction_ids = []

    for (const record of records) {
      if (!record.debit_transaction_id) {
        // 缺失关联：兑换记录没有关联扣减流水ID
        missing_transaction_ids.push({
          exchange_record_id: record.exchange_record_id,
          user_id: record.user_id,
          pay_amount: record.pay_amount,
          created_at: record.created_at
        })
      } else {
        // 验证关联的流水是否存在
        // eslint-disable-next-line no-await-in-loop
        const transaction = await AssetTransaction.findByPk(record.debit_transaction_id)
        if (!transaction) {
          orphan_transaction_ids.push({
            exchange_record_id: record.exchange_record_id,
            debit_transaction_id: record.debit_transaction_id,
            user_id: record.user_id,
            created_at: record.created_at
          })
        }
      }
    }

    return {
      total_checked: records.length,
      missing_transaction_ids,
      orphan_transaction_ids
    }
  }

  /**
   * 输出业务记录对账报告
   *
   * @param {Object} results - 对账结果
   * @returns {void}
   * @private
   */
  static _outputBusinessRecordReport(results) {
    console.log('\n' + '='.repeat(80))
    console.log('📊 业务记录关联对账报告（事务边界治理 P1-3）')
    console.log('='.repeat(80))
    console.log(`时间: ${results.timestamp}`)
    console.log(`分界线: ${results.cutoff_date}`)
    console.log(`耗时: ${results.duration_ms}ms`)
    console.log(`状态: ${this._getStatusEmoji(results.status)} ${results.status}`)
    console.log(`总问题数: ${results.total_issues}`)

    // 抽奖记录
    console.log('\n📍 lottery_draws 对账:')
    console.log(`   检查记录数: ${results.lottery_draws.total_checked}`)
    console.log(`   缺失关联: ${results.lottery_draws.missing_transaction_ids.length}`)
    console.log(`   孤立引用: ${results.lottery_draws.orphan_transaction_ids.length}`)

    if (results.lottery_draws.missing_transaction_ids.length > 0) {
      console.log('   缺失详情:')
      results.lottery_draws.missing_transaction_ids.slice(0, 5).forEach(d => {
        console.log(
          `     - lottery_draw_id=${d.lottery_draw_id}, user=${d.user_id}, cost=${d.cost_points}`
        )
      })
      if (results.lottery_draws.missing_transaction_ids.length > 5) {
        console.log(
          `     ... 等 ${results.lottery_draws.missing_transaction_ids.length - 5} 条更多`
        )
      }
    }

    // 消费记录
    console.log('\n📍 consumption_records 对账（已审核通过）:')
    console.log(`   检查记录数: ${results.consumption_records.total_checked}`)
    console.log(`   缺失关联: ${results.consumption_records.missing_transaction_ids.length}`)
    console.log(`   孤立引用: ${results.consumption_records.orphan_transaction_ids.length}`)

    if (results.consumption_records.missing_transaction_ids.length > 0) {
      console.log('   缺失详情:')
      results.consumption_records.missing_transaction_ids.slice(0, 5).forEach(r => {
        console.log(
          `     - consumption_record_id=${r.consumption_record_id}, user=${r.user_id}, points=${r.points_to_award}`
        )
      })
      if (results.consumption_records.missing_transaction_ids.length > 5) {
        console.log(
          `     ... 等 ${results.consumption_records.missing_transaction_ids.length - 5} 条更多`
        )
      }
    }

    // 兑换记录
    console.log('\n📍 exchange_records 对账:')
    console.log(`   检查记录数: ${results.exchange_records.total_checked}`)
    console.log(`   缺失关联: ${results.exchange_records.missing_transaction_ids.length}`)
    console.log(`   孤立引用: ${results.exchange_records.orphan_transaction_ids.length}`)

    if (results.exchange_records.missing_transaction_ids.length > 0) {
      console.log('   缺失详情:')
      results.exchange_records.missing_transaction_ids.slice(0, 5).forEach(r => {
        console.log(
          `     - exchange_record_id=${r.exchange_record_id}, user=${r.user_id}, amount=${r.pay_amount}`
        )
      })
      if (results.exchange_records.missing_transaction_ids.length > 5) {
        console.log(
          `     ... 等 ${results.exchange_records.missing_transaction_ids.length - 5} 条更多`
        )
      }
    }

    console.log('\n' + '='.repeat(80))
  }

  /**
   * 发送业务记录对账告警
   *
   * @param {Object} results - 对账结果
   * @returns {Promise<void>} 无返回值
   * @private
   */
  static async _sendBusinessRecordAlert(results) {
    // 记录详细日志
    logger.error('发现业务记录关联问题（事务边界治理）', {
      total_issues: results.total_issues,
      lottery_draws_missing: results.lottery_draws.missing_transaction_ids.length,
      lottery_draws_orphan: results.lottery_draws.orphan_transaction_ids.length,
      consumption_records_missing: results.consumption_records.missing_transaction_ids.length,
      consumption_records_orphan: results.consumption_records.orphan_transaction_ids.length,
      exchange_records_missing: results.exchange_records.missing_transaction_ids.length,
      exchange_records_orphan: results.exchange_records.orphan_transaction_ids.length
    })

    // 通过 NotificationService 发送管理员告警
    try {
      await NotificationService.sendToAdmins({
        type: 'business_record_reconciliation_alert',
        title: '业务记录关联对账告警',
        content: `发现${results.total_issues}个业务记录关联问题，可能存在事务边界问题，请及时检查处理`,
        data: {
          total_issues: results.total_issues,
          cutoff_date: results.cutoff_date,
          timestamp: results.timestamp,
          duration_ms: results.duration_ms,
          lottery_draws: {
            total_checked: results.lottery_draws.total_checked,
            missing_count: results.lottery_draws.missing_transaction_ids.length,
            orphan_count: results.lottery_draws.orphan_transaction_ids.length
          },
          consumption_records: {
            total_checked: results.consumption_records.total_checked,
            missing_count: results.consumption_records.missing_transaction_ids.length,
            orphan_count: results.consumption_records.orphan_transaction_ids.length
          },
          exchange_records: {
            total_checked: results.exchange_records.total_checked,
            missing_count: results.exchange_records.missing_transaction_ids.length,
            orphan_count: results.exchange_records.orphan_transaction_ids.length
          }
        }
      })
      logger.info('业务记录关联对账告警已发送给管理员')
    } catch (notifyError) {
      logger.error('发送业务记录关联对账告警失败', { error: notifyError.message })
    }
  }

  /**
   * 执行完整对账（余额 + 业务记录）
   *
   * @returns {Promise<Object>} 完整对账报告
   */
  static async executeFullReconciliation() {
    logger.info('开始完整对账（余额 + 业务记录）')

    const balanceReport = await this.execute()
    const businessReport = await this.executeBusinessRecordReconciliation()

    const fullReport = {
      timestamp: new Date().toISOString(),
      balance_reconciliation: balanceReport,
      business_record_reconciliation: businessReport,
      overall_status:
        balanceReport.status === 'OK' && businessReport.status === 'OK'
          ? 'OK'
          : balanceReport.status === 'ERROR' || businessReport.status === 'ERROR'
            ? 'ERROR'
            : 'WARNING'
    }

    logger.info('完整对账完成', {
      balance_status: balanceReport.status,
      business_status: businessReport.status,
      overall_status: fullReport.overall_status
    })

    return fullReport
  }
}

// 直接执行对账（供定时任务调用）
if (require.main === module) {
  ;(async () => {
    try {
      // 解析命令行参数
      const args = process.argv.slice(2)
      const mode = args[0] || 'balance' // 默认只运行余额对账

      let report

      switch (mode) {
        case 'balance':
          // 仅余额对账
          console.log('执行模式: 余额对账')
          report = await DailyAssetReconciliation.execute()
          break

        case 'business':
          // 仅业务记录关联对账
          console.log('执行模式: 业务记录关联对账')
          report = await DailyAssetReconciliation.executeBusinessRecordReconciliation()
          break

        case 'full':
          // 完整对账（余额 + 业务记录）
          console.log('执行模式: 完整对账（余额 + 业务记录）')
          report = await DailyAssetReconciliation.executeFullReconciliation()
          break

        default:
          console.log('用法: node jobs/daily-asset-reconciliation.js [mode]')
          console.log('  mode:')
          console.log('    balance  - 余额对账（默认）')
          console.log('    business - 业务记录关联对账')
          console.log('    full     - 完整对账（余额 + 业务记录）')
          process.exit(0)
      }

      const status = report.overall_status || report.status
      process.exit(status === 'OK' ? 0 : 1)
    } catch (error) {
      console.error('对账任务执行失败:', error)
      process.exit(1)
    }
  })()
}

module.exports = DailyAssetReconciliation
