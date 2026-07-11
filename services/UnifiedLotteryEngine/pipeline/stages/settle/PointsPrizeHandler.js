'use strict'

/**
 * PointsPrizeHandler - 积分类奖品发放处理器
 *
 * 职责（从 SettleStage 拆分，2026-07-11 技术债务方案 7.4-5）：
 * - points 类奖品发放：通过 BalanceService 双录入账（SYSTEM_MINT 对手方），
 *   使用派生幂等键（:reward_N:points）防止重复发放
 *
 * 设计说明：
 * - 本模块不独立注册服务键，由 SettleStage 持有并在结算编排中调用
 * - 事务对象由 SettleStage 统一传入（外部传入事务方案），本模块不创建/提交事务
 * - 纯搬移拆分：发放逻辑与拆分前 SettleStage._distributePrize 的 points 分支完全一致
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/settle/PointsPrizeHandler
 * @since 2026-07-11
 */

// V4.7.0 AssetService 拆分：使用子服务替代原 AssetService
const BalanceService = require('../../../../asset/BalanceService')
const { AssetCode } = require('../../../../../constants/AssetCode')

/**
 * 积分类奖品发放处理器类
 * @class PointsPrizeHandler
 */
class PointsPrizeHandler {
  /**
   * 构造函数
   * @param {Object} stage - SettleStage 实例（提供 log 日志上下文）
   */
  constructor(stage) {
    this.stage = stage
  }

  /**
   * 发放 points 类奖品（积分入账）
   *
   * @param {number} user_id - 用户ID
   * @param {Object} prize - 奖品对象（prize_value 为发放积分数）
   * @param {Object} options - 发放选项
   * @param {string} options.idempotency_key - 派生幂等键（:reward_N）
   * @param {string} options.lottery_session_id - 抽奖会话ID
   * @param {number} options.mint_account_id - 系统铸造账户ID（SYSTEM_MINT）
   * @param {Object} options.transaction - 事务对象（SettleStage 统一传入）
   * @returns {Promise<void>} 无返回值
   */
  async distributePointsPrize(user_id, prize, options) {
    const { idempotency_key, lottery_session_id, mint_account_id, transaction } = options

    // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
    await BalanceService.changeBalance(
      {
        user_id,
        asset_code: AssetCode.POINTS,
        delta_amount: parseInt(prize.prize_value),
        idempotency_key: `${idempotency_key}:points`,
        lottery_session_id,
        business_type: 'lottery_reward',
        counterpart_account_id: mint_account_id,
        meta: {
          source_type: 'system',
          title: `回馈奖励：${prize.prize_name}`,
          description: `获得${prize.prize_value}积分奖励`
        }
      },
      { transaction }
    )
  }
}

module.exports = PointsPrizeHandler
