/**
 * 手续费规则配置文件
 * 文件路径：config/fee_rules.js
 *
 * 业务场景：
 * - 统一管理所有交易类型的手续费规则
 * - 支持按商品价值分档计费
 * - 便于运营调整费率而无需修改代码
 *
 * 使用方式：
 * const FEE_RULES = require('./config/fee_rules');
 * const fee = FeeCalculator.calculateItemFee(itemValue, quantity);
 */

const FEE_RULES = {
  /**
   * 配置默认 5% 手续费
   *
   * 硬约束（来自文档）：
   * - 默认统一费率：5%
   * - 最小手续费：1 DIAMOND
   * - 手续费策略：monetize（平台收入）
   * - 计算公式：gross_amount = fee_amount + net_amount
   *
   * 注：分档策略已简化为统一 5%，如需恢复分档可修改此配置
   */

  /*
   * 手续费档位配置（按商品价值）
   * 🔴 简化为统一 5% 费率
   */
  tiers: [
    {
      max_value: Infinity, // 统一费率，不分档
      rate: 0.05, // 手续费率5%（统一）
      label: '统一费率档', // 档位名称（用于日志和前端展示）
      description: '所有商品统一5%手续费' // 适用商品说明
    }
  ],

  // 收费对象（Charge Target - 手续费由谁承担）
  charge_target: 'seller', // 只向卖家收取（买家支付selling_points全额）

  // 最小手续费（Minimum Fee - 防止极小额订单手续费为0）
  min_fee: 1, // 最少收1积分（即使计算结果<1也收1积分）

  // 手续费处理策略（Fee Handling Strategy - 手续费的去向）
  fee_strategy: 'monetize', // monetize-平台收入（推荐）| destroy-销毁积分 | recycle-回流奖池

  // 是否启用手续费（Enable Fee - 全局开关）
  enabled: true, // true-启用手续费 | false-禁用手续费（所有交易免费）

  /**
   * 交易类型手续费配置（Trade Type Fee Config - 不同交易类型的费率）
   * inventory_transfer: 物品转让手续费配置
   * point_transfer: 积分转账手续费配置
   * market_purchase: 市场购买手续费配置（交易市场DIAMOND结算）
   */
  trade_type_fees: {
    inventory_transfer: {
      enabled: true, // 是否启用物品转让手续费
      use_tiers: false, // 不使用分档计费
      fixed_rate: 0.05 // 固定5%手续费
    },
    point_transfer: {
      enabled: true, // 积分转账手续费
      use_tiers: false,
      fixed_rate: 0.02 // 固定2%手续费
    },
    market_purchase: {
      enabled: true, // 是否启用市场购买手续费（交易市场DIAMOND结算）
      use_tiers: false, // 🔴 修复：不使用分档计费，改为固定费率
      fixed_rate: 0.05, // 🔴 修复：固定 5% 手续费
      description: '交易市场DIAMOND结算手续费，统一5%从selling_amount中扣除，平台收入'
    }
  }
}

module.exports = FEE_RULES
