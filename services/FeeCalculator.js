const _logger = require('../utils/logger').logger

/**
 * 手续费计算服务
 * 文件路径：services/FeeCalculator.js
 *
 * 业务场景：
 * - 计算物品转让的手续费（基于 ItemInstance.meta.value 字段）
 * - 支持按商品价值分档计费
 * - 集成到TradeRecord交易记录系统
 *
 * 数据库关联：
 * - ItemInstance.meta.value（商品价值）- 用于计费分档
 * - MarketListing.price_amount（用户定价）- 买家支付金额
 * - TradeRecord.fee_points_amount（手续费）- 平台收取
 * - TradeRecord.net_points_amount（卖家实收）- price_amount - fee
 *
 * 使用示例：
 * const feeInfo = FeeCalculator.calculateItemFee(item.meta.value, listing.price_amount);
 * // 返回：{ fee: 30, rate: 0.05, netAmount: 570, tier: '中价值档' }
 *
 * 更新时间：2025-12-21 - 暴力重构移除 UserInventory 引用
 */

const FEE_RULES = require('../config/fee_rules')
const BeijingTimeHelper = require('../utils/timeHelper') // 北京时间工具类

/**
 * 手续费计算器服务类
 * 负责计算物品转让、积分转账等业务的手续费
 */
class FeeCalculator {
  /**
   * 根据商品价值计算单个商品的手续费（核心方法）
   *
   * 业务规则：
   * - 按 ItemInstance.meta.value 字段分档计费（不是 price_amount）
   * - 手续费从 price_amount 中扣除，卖家实收 = price_amount - fee
   * - 向上取整，最小收1积分
   *
   * @param {number} itemValue - 商品价值（ItemInstance.meta.value 字段）
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
   * - 当前系统：每次交易只涉及一个物品（ItemInstance 单条记录）
   * - 未来扩展：支持批量购买多个物品
   *
   * @param {Array} orderItems - 订单商品列表
   *   [{ item_instance_id, item_value, selling_price }, ...]
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
   * @param {number} itemValue - 商品价值（ItemInstance.meta.value）
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
   * @param {number} itemValue - 商品价值（ItemInstance.meta.value）
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
   * 集成到TradeRecord创建流程（Integration with TradeRecord）
   *
   * 业务场景：
   * - 物品转让时创建交易记录
   * - 自动计算手续费并记录到数据库
   *
   * @param {Object} item - ItemInstance物品对象
   * @param {number} buyerId - 买家用户ID
   * @param {number} sellerId - 卖家用户ID
   * @param {Object} transaction - Sequelize事务对象
   * @returns {Promise<Object>} TradeRecord创建结果
   *
   * @example
   * const tradeRecord = await FeeCalculator.createTradeRecord(item, buyerId, sellerId, transaction);
   */
  static async createTradeRecord(item, buyerId, sellerId, transaction) {
    const { TradeRecord } = require('../models')

    // 计算手续费（Calculate Fee - 基于商品价值和售价）
    const feeInfo = this.calculateItemFee(item.value, item.selling_points)

    // 创建交易记录（Create Trade Record）
    const tradeRecord = await TradeRecord.create(
      {
        trade_code: `tf_${BeijingTimeHelper.generateIdTimestamp()}_${Math.random().toString(36).substr(2, 8)}`,
        trade_type: 'inventory_transfer', // 交易类型：物品转让
        from_user_id: sellerId, // 卖家用户ID
        to_user_id: buyerId, // 买家用户ID
        points_amount: item.selling_points, // 交易金额（买家支付）
        fee_points_amount: feeInfo.fee, // 手续费（平台收取）
        net_points_amount: feeInfo.net_amount, // 卖家实收（售价-手续费）
        status: 'completed', // 交易状态：已完成
        item_id: item.inventory_id, // 物品ID
        name: item.name, // 物品名称
        transfer_note: `市场购买，手续费${feeInfo.fee}积分（${feeInfo.tier}）`,
        trade_reason: `物品转让 - ${item.name}`,
        trade_time: BeijingTimeHelper.createBeijingTime(),
        processed_time: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )

    return {
      trade_record: tradeRecord,
      fee_info: feeInfo
    }
  }
}

module.exports = FeeCalculator
