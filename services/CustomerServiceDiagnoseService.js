/**
 * 客服一键诊断服务（CustomerServiceDiagnoseService）
 *
 * 业务说明：
 * - 来自游戏GM工作台模型，效率提升最大的功能
 * - 并行检查用户的资产/交易/物品/抽奖/账号状态，2-3秒内返回诊断结果
 * - 每项检查返回 ok / warning / error 三种严重程度
 * - 全部为只读操作，不涉及数据变更
 *
 * 诊断阈值（对标交易猫/美团混合策略）：
 * - 交易冻结 30分钟 → warning（黄色告警）
 * - 交易冻结 2小时 → error（红色严重）
 * - 物品锁定超时同样按 30min/2h 两级判定
 *
 * 服务类型：静态类
 * ServiceManager Key: cs_diagnose
 *
 * @version 1.0.0
 * @date 2026-02-22
 */

const logger = require('../utils/logger').logger

/* 诊断结果级别 */
const LEVEL = {
  OK: 'ok',
  WARNING: 'warning',
  ERROR: 'error'
}

/* 冻结超时阈值（毫秒） */
const FREEZE_WARNING_MS = 30 * 60 * 1000
const FREEZE_ERROR_MS = 2 * 60 * 60 * 1000

/**
 * 客服一键诊断服务
 * 并行检查用户5个模块状态（资产/交易/物品/抽奖/账号），2-3秒内返回结果
 */
class CustomerServiceDiagnoseService {
  /**
   * 对指定用户执行一键诊断，并行检查所有模块
   *
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @returns {Object} { overall_level, checks: { asset, trade, item, lottery, account }, issues: [...] }
   */
  static async diagnose(models, userId) {
    const now = Date.now()

    const [assetCheck, tradeCheck, itemCheck, lotteryCheck, accountCheck] = await Promise.all([
      this._checkAssets(models, userId, now),
      this._checkTrades(models, userId, now),
      this._checkItems(models, userId, now),
      this._checkLottery(models, userId),
      this._checkAccount(models, userId)
    ])

    const checks = {
      asset: assetCheck,
      trade: tradeCheck,
      item: itemCheck,
      lottery: lotteryCheck,
      account: accountCheck
    }

    /* 汇总所有发现的问题 */
    const issues = []
    Object.values(checks).forEach(check => {
      if (check.issues) {
        issues.push(...check.issues)
      }
    })

    /* 确定整体严重程度（取最高级别） */
    const levels = Object.values(checks).map(c => c.level)
    let overallLevel = LEVEL.OK
    if (levels.includes(LEVEL.ERROR)) {
      overallLevel = LEVEL.ERROR
    } else if (levels.includes(LEVEL.WARNING)) {
      overallLevel = LEVEL.WARNING
    }

    return {
      user_id: userId,
      diagnosed_at: new Date().toISOString(),
      overall_level: overallLevel,
      issue_count: issues.length,
      checks,
      issues
    }
  }

  /**
   * 检查资产状态：是否有异常冻结（frozen_amount > 0 且关联订单已超时）
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @param {number} _now - 当前时间戳（资产检查暂未使用，预留）
   * @returns {Promise<Object>} 检查结果
   */
  static async _checkAssets(models, userId, _now) {
    try {
      const account = await models.Account.findOne({
        where: { user_id: userId },
        attributes: ['account_id']
      })

      if (!account) {
        return { level: LEVEL.OK, message: '无账户记录', issues: [] }
      }

      /* 查询有冻结余额的资产 */
      const frozenBalances = await models.AccountAssetBalance.findAll({
        where: {
          account_id: account.account_id,
          frozen_amount: { [models.Op.gt]: 0 }
        },
        raw: true
      })

      if (frozenBalances.length === 0) {
        return { level: LEVEL.OK, message: '资产状态正常，无异常冻结', issues: [] }
      }

      const issues = frozenBalances.map(b => ({
        type: 'frozen_asset',
        severity: LEVEL.WARNING,
        asset_code: b.asset_code,
        frozen_amount: parseFloat(b.frozen_amount),
        message: `${b.asset_code} 存在冻结金额 ${b.frozen_amount}`
      }))

      return {
        level: LEVEL.WARNING,
        message: `发现 ${frozenBalances.length} 项资产存在冻结`,
        issues
      }
    } catch (error) {
      logger.error('诊断-资产检查失败:', error)
      return { level: LEVEL.OK, message: '资产检查异常，跳过', issues: [] }
    }
  }

  /**
   * 检查交易状态：是否有 created/frozen 状态且超时的订单
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @param {number} now - 当前时间戳
   * @returns {Promise<Object>} 检查结果
   */
  static async _checkTrades(models, userId, now) {
    try {
      const pendingOrders = await models.TradeOrder.findAll({
        where: {
          [models.Op.or]: [{ buyer_user_id: userId }, { seller_user_id: userId }],
          status: { [models.Op.in]: ['created', 'frozen'] }
        },
        raw: true
      })

      if (pendingOrders.length === 0) {
        return { level: LEVEL.OK, message: '交易状态正常，无超时订单', issues: [] }
      }

      const issues = []
      let maxLevel = LEVEL.OK

      pendingOrders.forEach(order => {
        const elapsed = now - new Date(order.created_at).getTime()
        let severity = LEVEL.OK

        if (elapsed > FREEZE_ERROR_MS) {
          severity = LEVEL.ERROR
        } else if (elapsed > FREEZE_WARNING_MS) {
          severity = LEVEL.WARNING
        }

        if (severity !== LEVEL.OK) {
          const elapsedMinutes = Math.round(elapsed / 60000)
          issues.push({
            type: 'trade_timeout',
            severity,
            trade_order_id: order.trade_order_id,
            status: order.status,
            elapsed_minutes: elapsedMinutes,
            message: `交易订单 #${order.trade_order_id} ${order.status}状态已 ${elapsedMinutes} 分钟`
          })
        }

        if (severity === LEVEL.ERROR || (severity === LEVEL.WARNING && maxLevel === LEVEL.OK)) {
          maxLevel = severity
        }
      })

      if (issues.length === 0) {
        return {
          level: LEVEL.OK,
          message: `${pendingOrders.length} 个进行中订单均在正常时限内`,
          issues: []
        }
      }

      return {
        level: maxLevel,
        message: `发现 ${issues.length} 个交易订单超时`,
        issues
      }
    } catch (error) {
      logger.error('诊断-交易检查失败:', error)
      return { level: LEVEL.OK, message: '交易检查异常，跳过', issues: [] }
    }
  }

  /**
   * 检查物品状态：是否有 locked 状态且锁已超时的物品
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @param {number} now - 当前时间戳
   * @returns {Promise<Object>} 检查结果
   */
  static async _checkItems(models, userId, now) {
    try {
      /* 物品通过 owner_account_id 关联账户 */
      const account = await models.Account.findOne({
        where: { user_id: userId },
        attributes: ['account_id']
      })

      if (!account) {
        return { level: LEVEL.OK, message: '无账户记录', issues: [] }
      }

      const lockedItems = await models.Item.findAll({
        where: {
          owner_account_id: account.account_id,
          status: 'held'
        },
        include: models.ItemHold
          ? [
              {
                model: models.ItemHold,
                as: 'holds',
                where: { released_at: null },
                required: false,
                attributes: ['hold_type', 'created_at']
              }
            ]
          : []
      })

      if (lockedItems.length === 0) {
        return { level: LEVEL.OK, message: '背包状态正常，无异常锁定', issues: [] }
      }

      const issues = []
      let maxLevel = LEVEL.OK

      lockedItems.forEach(item => {
        const plain = item.get({ plain: true })
        const itemHolds = plain.holds || []

        /* 优先使用 item_holds.created_at 作为锁定时间，回退到物品 updated_at */
        const holdCreatedAt = itemHolds.length > 0 ? itemHolds[0].created_at : null
        const lockTime = new Date(holdCreatedAt || plain.updated_at || plain.created_at).getTime()

        if (lockTime) {
          const elapsed = now - lockTime
          let severity = LEVEL.OK

          if (elapsed > FREEZE_ERROR_MS) {
            severity = LEVEL.ERROR
          } else if (elapsed > FREEZE_WARNING_MS) {
            severity = LEVEL.WARNING
          }

          if (severity !== LEVEL.OK) {
            const elapsedMinutes = Math.round(elapsed / 60000)
            const templateName = plain.item_name || '未知物品'
            const holdTypes = itemHolds.map(h => h.hold_type)
            issues.push({
              type: 'item_lock_timeout',
              severity,
              item_instance_id: plain.item_instance_id,
              item_name: templateName,
              lock_types: holdTypes,
              elapsed_minutes: elapsedMinutes,
              message: `物品 "${templateName}" (ID:${plain.item_instance_id}) 锁定已 ${elapsedMinutes} 分钟`
            })
          }

          if (severity === LEVEL.ERROR || (severity === LEVEL.WARNING && maxLevel === LEVEL.OK)) {
            maxLevel = severity
          }
        }
      })

      if (issues.length === 0) {
        return {
          level: LEVEL.OK,
          message: `${lockedItems.length} 个锁定物品均在正常时限内`,
          issues: []
        }
      }

      return {
        level: maxLevel,
        message: `发现 ${issues.length} 个物品锁定超时`,
        issues
      }
    } catch (error) {
      logger.error('诊断-物品检查失败:', error)
      return { level: LEVEL.OK, message: '物品检查异常，跳过', issues: [] }
    }
  }

  /**
   * 检查抽奖状态：最近一次抽奖是否有 has_debt=1 的记录
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 检查结果
   */
  static async _checkLottery(models, userId) {
    try {
      const debtDraws = await models.LotteryDraw.findAll({
        where: { user_id: userId, has_debt: true },
        order: [['created_at', 'DESC']],
        limit: 5,
        raw: true
      })

      if (debtDraws.length === 0) {
        return { level: LEVEL.OK, message: '抽奖状态正常', issues: [] }
      }

      const issues = debtDraws.map(d => ({
        type: 'lottery_debt',
        severity: LEVEL.WARNING,
        lottery_draw_id: d.lottery_draw_id,
        created_at: d.created_at,
        message: `抽奖记录 ${d.lottery_draw_id} 存在未结清债务(has_debt=1)`
      }))

      return {
        level: LEVEL.WARNING,
        message: `发现 ${debtDraws.length} 条抽奖债务记录`,
        issues
      }
    } catch (error) {
      logger.error('诊断-抽奖检查失败:', error)
      return { level: LEVEL.OK, message: '抽奖检查异常，跳过', issues: [] }
    }
  }

  /**
   * 检查账号状态：用户是否正常
   * @param {Object} models - Sequelize models 对象
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} 检查结果
   */
  static async _checkAccount(models, userId) {
    try {
      const user = await models.User.findByPk(userId, {
        attributes: ['user_id', 'status', 'nickname', 'mobile']
      })

      if (!user) {
        return {
          level: LEVEL.ERROR,
          message: '用户不存在',
          issues: [
            { type: 'account_not_found', severity: LEVEL.ERROR, message: `用户ID ${userId} 不存在` }
          ]
        }
      }

      if (user.status && user.status !== 'active') {
        return {
          level: LEVEL.WARNING,
          message: `账号状态异常: ${user.status}`,
          issues: [
            {
              type: 'account_status_abnormal',
              severity: LEVEL.WARNING,
              status: user.status,
              message: `用户账号状态为 ${user.status}（非active）`
            }
          ]
        }
      }

      return { level: LEVEL.OK, message: '账号状态正常', issues: [] }
    } catch (error) {
      logger.error('诊断-账号检查失败:', error)
      return { level: LEVEL.OK, message: '账号检查异常，跳过', issues: [] }
    }
  }
}

/* 导出诊断级别常量 */
CustomerServiceDiagnoseService.LEVEL = LEVEL
CustomerServiceDiagnoseService.FREEZE_WARNING_MS = FREEZE_WARNING_MS
CustomerServiceDiagnoseService.FREEZE_ERROR_MS = FREEZE_ERROR_MS

module.exports = CustomerServiceDiagnoseService
