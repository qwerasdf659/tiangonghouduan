'use strict'

/**
 * MaterialPrizeHandler - 实物/材料类奖品发放处理器
 *
 * 职责（从 SettleStage 拆分，2026-07-11 技术债务方案 7.4-5）：
 * - coupon/item 类奖品发放：写入 items + item_ledger 双录（三表模型，ItemService.mintItem）
 * - material 类奖品发放：可叠加材料资产（星石/红源晶碎片等）走 BalanceService 双录入账，
 *   支持水晶倍率数量放大（material_amount_override）
 * - 星石奖品的星石配额扣减（STAR_STONE_QUOTA，双池隔离第二轨道）
 *
 * 设计说明：
 * - 本模块不独立注册服务键，由 SettleStage 持有并在结算编排中调用
 * - 事务对象由 SettleStage 统一传入（外部传入事务方案），本模块不创建/提交事务
 * - 日志统一走 SettleStage 的 log（保持 Stage 日志上下文一致）
 * - 纯搬移拆分：所有发放逻辑与拆分前 SettleStage._distributePrize 对应分支完全一致
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/settle/MaterialPrizeHandler
 * @since 2026-07-11
 */

// V4.7.0 AssetService 拆分：使用子服务替代原 AssetService
const BalanceService = require('../../../../asset/BalanceService')
const ItemService = require('../../../../asset/ItemService')
const { AssetCode } = require('../../../../../constants/AssetCode')

/**
 * 实物/材料类奖品发放处理器类
 * @class MaterialPrizeHandler
 */
class MaterialPrizeHandler {
  /**
   * 构造函数
   * @param {Object} stage - SettleStage 实例（提供 log 日志上下文）
   */
  constructor(stage) {
    this.stage = stage
  }

  /**
   * 发放 coupon/item 类奖品（优惠券/实物物品）
   *
   * 优惠券/实物物品：写入 items + item_ledger 双录（三表模型）。
   * 词表统一（P1）：prize_definitions.prize_type 词表为 material/item/coupon/points，
   * 此处覆盖 coupon(券→voucher) 与 item(实物→product)；不再保留已废弃的 'physical' 值。
   *
   * @param {number} user_id - 用户ID
   * @param {Object} prize - 奖品对象（扁平化结构）
   * @param {Object} options - 发放选项
   * @param {string} options.idempotency_key - 派生幂等键（:reward_N）
   * @param {string} options.lottery_session_id - 抽奖会话ID
   * @param {string} options.lottery_draw_id - 抽奖记录ID
   * @param {Object} options.transaction - 事务对象（SettleStage 统一传入）
   * @returns {Promise<void>} 无返回值
   */
  async distributeItemPrize(user_id, prize, options) {
    const { idempotency_key, lottery_session_id, lottery_draw_id, transaction } = options

    await ItemService.mintItem(
      {
        user_id,
        item_type: prize.prize_type === 'coupon' ? 'voucher' : 'product',
        source: 'lottery',
        source_ref_id: lottery_draw_id ? String(lottery_draw_id) : null,
        item_name: prize.prize_name,
        item_description: prize.prize_description || `抽奖获得：${prize.prize_name}`,
        item_value: Math.round(parseFloat(prize.prize_value) || 0),
        prize_definition_id: prize.prize_definition_id,
        /*
         * 物品模板关联（拍板⑤修复，2026-07-10）：抽奖发奖曾是全库唯一漏写
         * item_template_id 的铸造链路（兑换/换物/竞价均已正确写入）。
         * 模板ID 由 LoadCampaignStage 从 prize_definitions.item_template_id 加载，
         * 缺配置时为 null（不阻断发奖，由运营在奖品定义补挂模板）。
         */
        item_template_id: prize.item_template_id || null,
        rarity_code: prize.rarity_code || 'common',
        business_type: 'lottery_mint',
        idempotency_key: `${idempotency_key}:item`,
        meta: {
          lottery_draw_id,
          lottery_session_id,
          prize_type: prize.prize_type,
          acquisition_method: 'lottery'
        }
      },
      { transaction }
    )
  }

  /**
   * 发放 material 类奖品（可叠加材料资产）
   *
   * material：可叠加材料资产奖品（星石/红源晶碎片等），走 BalanceService 双录入账。
   * 词表统一（P1）：material 是当前唯一真相词（prize_definitions.prize_type 即为 material）；
   * 历史 virtual 已通过迁移统一为 material，此处只保留 material 单一分支，不再兼容 virtual。
   *
   * @param {number} user_id - 用户ID
   * @param {Object} prize - 奖品对象（含 material_asset_code/material_amount）
   * @param {Object} options - 发放选项
   * @param {string} options.idempotency_key - 派生幂等键（:reward_N）
   * @param {number} options.mint_account_id - 系统铸造账户ID（SYSTEM_MINT）
   * @param {number|null} options.material_amount_override - 水晶倍率生效时的最终发放数量（未翻倍为 null）
   * @param {Object|null} options.crystal_multiplier - 水晶倍率快照（追溯用）
   * @param {Object} options.transaction - 事务对象（SettleStage 统一传入）
   * @returns {Promise<void>} 无返回值
   */
  async distributeMaterialPrize(user_id, prize, options) {
    const {
      idempotency_key,
      mint_account_id,
      material_amount_override = null,
      crystal_multiplier = null,
      transaction
    } = options

    if (prize.material_asset_code && prize.material_amount) {
      /*
       * 水晶倍率：命中翻倍时按最终数量入账（material_amount_override），
       * 非水晶/未翻倍时 override 为 null，沿用原 material_amount，行为零变化。
       * 星石为 currency 形态、天然非水晶，override 恒为 null，配额扣减仍按原量。
       */
      const distribute_amount =
        material_amount_override !== null ? material_amount_override : prize.material_amount

      // 命中翻倍时在资产流水 meta 追加倍率摘要（资产侧可对账追溯，§3.3）
      const material_meta = {
        lottery_campaign_prize_id: prize.lottery_campaign_prize_id,
        prize_name: prize.prize_name
      }
      if (crystal_multiplier && crystal_multiplier.applied_multiplier > 1) {
        material_meta.crystal_multiplier = {
          base_quantity: crystal_multiplier.base_quantity,
          applied_multiplier: crystal_multiplier.applied_multiplier,
          final_quantity: crystal_multiplier.final_quantity,
          multiplier_campaign_id: crystal_multiplier.multiplier_campaign_id,
          reason: crystal_multiplier.reason
        }
      }

      // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
      await BalanceService.changeBalance(
        {
          user_id,
          asset_code: prize.material_asset_code,
          delta_amount: distribute_amount,
          idempotency_key: `${idempotency_key}:material`,
          business_type: 'lottery_reward_material',
          counterpart_account_id: mint_account_id,
          meta: material_meta
        },
        { transaction }
      )

      /* 星石奖品扣减星石配额（双池隔离第二轨道） */
      if (prize.material_asset_code === AssetCode.STAR_STONE) {
        await this._deductStarStoneQuota(user_id, distribute_amount, {
          idempotency_key: `${idempotency_key}:quota_deduct`,
          lottery_campaign_prize_id: prize.lottery_campaign_prize_id,
          transaction
        })
      }
    }
  }

  /**
   * 扣减星石配额（抽中星石奖品时）
   *
   * 双池隔离第二轨道：预算积分管实物/券/水晶，星石配额管星石。
   * 扣减失败不阻断结算（配额可能未启用或余额不足），仅记录日志。
   *
   * @param {number} user_id - 用户ID
   * @param {number} star_stone_amount - 发放的星石数量
   * @param {Object} options - 扣减选项
   * @param {string} options.idempotency_key - 幂等键
   * @param {number} options.lottery_campaign_prize_id - 活动奖品ID
   * @param {Object} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _deductStarStoneQuota(user_id, star_stone_amount, options) {
    const { idempotency_key, lottery_campaign_prize_id, transaction } = options

    try {
      const burnAccount = await BalanceService.getOrCreateAccount(
        { system_code: 'SYSTEM_BURN' },
        { transaction }
      )

      // eslint-disable-next-line no-restricted-syntax -- transaction 已正确传递
      await BalanceService.changeBalance(
        {
          user_id,
          asset_code: AssetCode.STAR_STONE_QUOTA,
          delta_amount: -star_stone_amount,
          idempotency_key,
          business_type: 'lottery_quota_deduct',
          counterpart_account_id: burnAccount.account_id,
          meta: {
            lottery_campaign_prize_id,
            star_stone_amount,
            description: `抽奖扣减星石配额 ${star_stone_amount}`
          }
        },
        { transaction }
      )

      this.stage.log('info', '星石配额扣减成功', {
        user_id,
        star_stone_amount,
        lottery_campaign_prize_id
      })
    } catch (error) {
      this.stage.log('warn', '星石配额扣减失败（非致命，配额可能未初始化）', {
        user_id,
        star_stone_amount,
        lottery_campaign_prize_id,
        error: error.message
      })
    }
  }
}

module.exports = MaterialPrizeHandler
