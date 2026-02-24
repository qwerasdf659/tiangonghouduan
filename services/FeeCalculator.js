const _logger = require('../utils/logger').logger

/**
 * 手续费计算服务
 * 文件路径：services/FeeCalculator.js
 *
 * 业务场景：
 * - 计算物品转让的手续费（基于 Item.meta.value 字段）
 * - 支持按商品价值分档计费（DIAMOND）
 * - 支持单一费率模式（red_shard 等非 DIAMOND 币种）
 * - 集成到TradeOrder交易订单系统（交易市场）
 *
 * 多币种扩展（2026-01-14）：
 * - DIAMOND：保持分档逻辑（基于 itemValue 分档 + ceil + 最低费 1）
 * - red_shard：单一费率 5%，最低手续费 1（从 system_settings 读取）
 * - 其他币种：根据 system_settings 配置的费率和最低费计算
 *
 * 数据库关联：
 * - Item.meta.value（商品价值）- 用于 DIAMOND 计费分档
 * - MarketListing.price_amount（用户定价）- 买家支付金额
 * - MarketListing.price_asset_code（结算币种）- 决定计费模式
 * - TradeOrder.fee_amount（手续费）- 平台收取
 * - TradeOrder.net_amount（卖家实收）- gross_amount - fee_amount
 * - system_settings（fee_rate_*, fee_min_*）- 多币种费率配置
 *
 * 使用示例：
 * // DIAMOND（分档模式）
 * const feeInfo = FeeCalculator.calculateItemFee(item.meta.value, listing.price_amount);
 * // 返回：{ fee: 30, rate: 0.05, net_amount: 570, tier: '中价值档' }
 *
 * // red_shard（单一费率模式）
 * const feeInfo = await FeeCalculator.calculateFeeByAsset('red_shard', null, 1000);
 * // 返回：{ fee: 50, rate: 0.05, net_amount: 950, calculation_mode: 'flat' }
 *
 */

const FEE_RULES = require('../config/fee_rules')
const AdminSystemService = require('./AdminSystemService')

/**
 * 手续费计算器服务类
 * 负责计算物品转让、积分转账等业务的手续费
 */
class FeeCalculator {
  /**
   * 根据商品价值计算单个商品的手续费（核心方法）
   *
   * 业务规则：
   * - 按 Item.meta.value 字段分档计费（不是 price_amount）
   * - 手续费从 price_amount 中扣除，卖家实收 = price_amount - fee
   * - 向上取整，最小收1积分
   *
   * @param {number} itemValue - 商品价值（Item.meta.value 字段）
   * @param {number} sellingPrice - 用户定价（MarketListing.price_amount 字段）
   * @returns {Object} 手续费计算结果
   *   - fee: 手续费积分（向上取整）
   *   - rate: 费率（如0.03表示3%）
   *   - net_amount: 卖家实收积分（selling_price - fee）
   *   - tier: 档位名称（如'低价值档'）
   *   - tier_description: 档位说明
   *
   * @example
   * // 示例1：低价值商品（value=200，售价250）
   * const result = FeeCalculator.calculateItemFee(200, 250);
   * // 返回：{ fee: 8, rate: 0.03, net_amount: 242, tier: '低价值档' }
   *
   * // 示例2：中价值商品（value=500，售价480）
   * const result = FeeCalculator.calculateItemFee(500, 480);
   * // 返回：{ fee: 24, rate: 0.05, net_amount: 456, tier: '中价值档' }
   */
  static calculateItemFee(itemValue, sellingPrice) {
    // 全局开关检查（Global Enable Check - 是否启用手续费）
    if (!FEE_RULES.enabled) {
      return {
        fee: 0,
        rate: 0,
        net_amount: sellingPrice,
        tier: '免费',
        tier_description: '手续费已禁用'
      }
    }

    // 找到对应档位（Find Matching Tier - 根据商品价值匹配费率档位）
    const tier = FEE_RULES.tiers.find(t => itemValue < t.max_value)

    if (!tier) {
      // 理论上不会发生（因为最后一档max_value=Infinity）
      throw new Error(`无法找到价值 ${itemValue} 对应的费率档位`)
    }

    /*
     * 计算手续费（Calculate Fee - 基于售价计算，而不是商品价值）
     * 注意：手续费基于selling_points计算，档位基于value判断
     */
    let fee = Math.ceil(sellingPrice * tier.rate)

    // 应用最小手续费（Apply Minimum Fee - 防止手续费为0）
    if (fee < FEE_RULES.min_fee) {
      fee = FEE_RULES.min_fee
    }

    // 计算卖家实收（Calculate Net Amount - 售价减去手续费）
    const netAmount = sellingPrice - fee

    return {
      fee, // 手续费积分
      rate: tier.rate, // 费率（如0.03）
      net_amount: netAmount, // 卖家实收积分
      tier: tier.label, // 档位名称
      tier_description: tier.description // 档位说明
    }
  }

  /**
   * 计算整个订单的手续费（支持混合商品 - 当前系统为单商品交易）
   *
   * 业务场景：
   * - 当前系统：每次交易只涉及一个物品（Item 单条记录）
   * - 未来扩展：支持批量购买多个物品
   *
   * @param {Array} orderItems - 订单商品列表
   *   [{ item_id, item_value, selling_price }, ...]
   * @returns {Object} 订单手续费汇总
   *   - total_fee: 总手续费
   *   - total_selling_price: 总售价
   *   - total_net_amount: 卖家总实收
   *   - breakdown: 明细数组
   *   - charge_target: 收费对象
   *
   * @example
   * const orderItems = [
   *   { inventory_id: 1, item_value: 200, selling_price: 250 },
   *   { inventory_id: 2, item_value: 500, selling_price: 480 }
   * ];
   * const result = FeeCalculator.calculateOrderFee(orderItems);
   * // 返回：{ total_fee: 32, total_selling_price: 730, total_net_amount: 698, breakdown: [...] }
   */
  static calculateOrderFee(orderItems) {
    const breakdown = []
    let totalFee = 0
    let totalSellingPrice = 0
    let totalNetAmount = 0

    for (const item of orderItems) {
      // 计算单个商品的手续费（Calculate Individual Item Fee）
      const feeInfo = this.calculateItemFee(item.item_value, item.selling_price)

      breakdown.push({
        inventory_id: item.inventory_id, // 库存物品ID
        item_value: item.item_value, // 商品价值（用于分档）
        selling_price: item.selling_price, // 用户定价
        fee: feeInfo.fee, // 手续费
        rate: feeInfo.rate, // 费率
        net_amount: feeInfo.net_amount, // 卖家实收
        tier: feeInfo.tier // 档位名称
      })

      totalFee += feeInfo.fee
      totalSellingPrice += item.selling_price
      totalNetAmount += feeInfo.net_amount
    }

    return {
      total_fee: totalFee, // 总手续费
      total_selling_price: totalSellingPrice, // 总售价（买家支付）
      total_net_amount: totalNetAmount, // 卖家总实收
      breakdown, // 明细数组
      charge_target: FEE_RULES.charge_target, // 收费对象（seller）
      fee_strategy: FEE_RULES.fee_strategy // 手续费处理策略
    }
  }

  /**
   * 获取指定价值对应的费率（用于前端展示）
   *
   * 业务场景：
   * - 商品详情页展示预估手续费
   * - 上架前提示用户手续费档位
   *
   * @param {number} itemValue - 商品价值（Item.meta.value）
   * @returns {number} 费率（如0.03表示3%）
   *
   * @example
   * const rate = FeeCalculator.getRate(450);
   * logger.info(`手续费率：${rate * 100}%`); // 输出：手续费率：5%
   */
  static getRate(itemValue) {
    const tier = FEE_RULES.tiers.find(t => itemValue < t.max_value)
    return tier ? tier.rate : 0
  }

  /**
   * 获取费率说明（用于前端展示/客服解释）
   *
   * 业务场景：
   * - 前端Tooltip提示
   * - 客服解释手续费规则
   * - 用户帮助文档
   *
   * @param {number} itemValue - 商品价值（Item.meta.value）
   * @returns {string} 费率说明（如"3%（低价值档）- 普通优惠券、小额商品"）
   *
   * @example
   * const description = FeeCalculator.getFeeDescription(200);
   * logger.info(description); // 输出：3%（低价值档）- 普通优惠券、小额商品
   */
  static getFeeDescription(itemValue) {
    const tier = FEE_RULES.tiers.find(t => itemValue < t.max_value)
    if (!tier) return '未知档位'

    return `${(tier.rate * 100).toFixed(0)}%（${tier.label}）- ${tier.description}`
  }

  /**
   * 根据结算币种计算手续费（多币种扩展版）
   *
   * 业务规则（2026-01-14 拍板）：
   * - DIAMOND：保持现状分档逻辑（基于 itemValue 分档 + ceil + 最低费 1）
   * - red_shard：单一费率 5%，最低手续费 1（从 system_settings 读取）
   * - 其他币种：根据 system_settings 中 fee_rate_{asset_code} 和 fee_min_{asset_code} 配置
   *
   * 配置项读取：
   * - fee_rate_{asset_code}：费率（如 0.05 = 5%）
   * - fee_min_{asset_code}：最低手续费（如 1）
   *
   * @param {string} asset_code - 结算币种代码（DIAMOND/red_shard 等）
   * @param {number|null} itemValue - 商品价值（仅 DIAMOND 分档模式使用，其他币种可传 null）
   * @param {number} sellingPrice - 用户定价（买家支付金额）
   * @returns {Promise<Object>} 手续费计算结果
   *   - fee: 手续费金额（已取整）
   *   - rate: 费率（如 0.05 表示 5%）
   *   - net_amount: 卖家实收金额（sellingPrice - fee）
   *   - calculation_mode: 计费模式（'tiered'-分档模式 / 'flat'-单一费率模式）
   *   - tier: 档位名称（仅分档模式有值）
   *   - tier_description: 档位说明（仅分档模式有值）
   *   - asset_code: 结算币种代码
   *
   * @example
   * // DIAMOND 分档模式（基于商品价值分档）
   * const fee = await FeeCalculator.calculateFeeByAsset('DIAMOND', 500, 600);
   * // 返回：{ fee: 30, rate: 0.05, net_amount: 570, calculation_mode: 'tiered', tier: '中价值档' }
   *
   * // red_shard 单一费率模式（5%，最低 1）
   * const fee = await FeeCalculator.calculateFeeByAsset('red_shard', null, 1000);
   * // 返回：{ fee: 50, rate: 0.05, net_amount: 950, calculation_mode: 'flat' }
   *
   * @throws {Error} 不支持的结算币种（未在白名单且未配置费率）
   *
   * @see docs/交易市场多币种扩展功能-待办清单-2026-01-14.md
   */
  static async calculateFeeByAsset(asset_code, itemValue, sellingPrice) {
    /*
     * DIAMOND 特殊处理：保持现状分档逻辑
     * 设计原因：DIAMOND 已有完善的分档费率体系，基于 itemValue 判断档位
     */
    if (asset_code === 'DIAMOND') {
      // 如果未传入 itemValue，使用 sellingPrice 作为价值参考
      const valueForTier = itemValue !== null && itemValue !== undefined ? itemValue : sellingPrice

      const tierResult = this.calculateItemFee(valueForTier, sellingPrice)

      return {
        fee: tierResult.fee,
        rate: tierResult.rate,
        net_amount: tierResult.net_amount,
        calculation_mode: 'tiered', // 分档模式
        tier: tierResult.tier,
        tier_description: tierResult.tier_description,
        asset_code: 'DIAMOND'
      }
    }

    /*
     * 非 DIAMOND 币种：使用单一费率模式
     * 从 system_settings 读取配置：
     * - fee_rate_{asset_code}：费率
     * - fee_min_{asset_code}：最低手续费
     */

    // 读取费率配置（默认 5%）
    const feeRate = await AdminSystemService.getSettingValue(
      'marketplace',
      `fee_rate_${asset_code}`,
      0.05 // 默认 5%
    )

    // 读取最低手续费配置（默认 1）
    const feeMin = await AdminSystemService.getSettingValue(
      'marketplace',
      `fee_min_${asset_code}`,
      1 // 默认最低 1
    )

    /*
     * 计算手续费（单一费率模式）
     * 公式：fee = floor(sellingPrice * feeRate)
     * 注意：使用 floor 向下取整（与 DIAMOND 的 ceil 不同，对用户更友好）
     * 保底：fee 不低于 feeMin
     */
    let fee = Math.floor(sellingPrice * feeRate)

    // 应用最低手续费
    if (fee < feeMin) {
      fee = feeMin
    }

    // 计算卖家实收
    const netAmount = sellingPrice - fee

    return {
      fee, // 手续费金额
      rate: feeRate, // 费率
      net_amount: netAmount, // 卖家实收
      calculation_mode: 'flat', // 单一费率模式
      tier: null, // 非分档模式无档位
      tier_description: `${(feeRate * 100).toFixed(0)}% 单一费率`, // 费率说明
      asset_code // 结算币种
    }
  }

  /**
   * 获取指定币种的费率信息（用于前端展示）
   *
   * @param {string} asset_code - 结算币种代码
   * @returns {Promise<Object>} 费率信息
   *   - rate: 费率（如 0.05）
   *   - min_fee: 最低手续费
   *   - calculation_mode: 计费模式
   *
   * @example
   * const rateInfo = await FeeCalculator.getFeeRateByAsset('red_shard');
   * // 返回：{ rate: 0.05, min_fee: 1, calculation_mode: 'flat' }
   */
  static async getFeeRateByAsset(asset_code) {
    if (asset_code === 'DIAMOND') {
      // DIAMOND 使用分档模式，返回基础费率区间
      return {
        rate: null, // 分档模式无单一费率
        rate_range: FEE_RULES.tiers.map(t => ({
          max_value: t.max_value,
          rate: t.rate,
          label: t.label
        })),
        min_fee: FEE_RULES.min_fee,
        calculation_mode: 'tiered'
      }
    }

    // 读取配置
    const rate = await AdminSystemService.getSettingValue(
      'marketplace',
      `fee_rate_${asset_code}`,
      0.05
    )
    const minFee = await AdminSystemService.getSettingValue(
      'marketplace',
      `fee_min_${asset_code}`,
      1
    )

    return {
      rate,
      rate_range: null,
      min_fee: minFee,
      calculation_mode: 'flat'
    }
  }
}

module.exports = FeeCalculator
