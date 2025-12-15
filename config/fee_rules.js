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
  // 手续费档位配置（按商品价值 - 对应UserInventory.value字段）
  tiers: [
    {
      max_value: 300, // 价值区间上限（不包含）- 对应UserInventory.value < 300
      rate: 0.03, // 手续费率3% - 低价值商品友好
      label: '低价值档', // 档位名称（用于日志和前端展示）
      description: '普通优惠券、小额商品' // 适用商品说明
    },
    {
      max_value: 600, // 价值区间上限（不包含）- 对应300 <= UserInventory.value < 600
      rate: 0.05, // 手续费率5% - 中等价值商品
      label: '中价值档', // 档位名称
      description: '中档优惠券、一般实物商品' // 适用商品说明
    },
    {
      max_value: Infinity, // 无上限 - 对应UserInventory.value >= 600
      rate: 0.10, // 手续费率10% - 高价值商品
      label: '高价值档', // 档位名称
      description: '高档商品、稀有奖品' // 适用商品说明
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

  // 交易类型手续费配置（Trade Type Fee Config - 不同交易类型的费率）
  trade_type_fees: {
    inventory_transfer: {
      enabled: true, // 是否启用物品转让手续费
      use_tiers: true, // 是否使用分档计费（true-使用tiers配置 | false-使用固定费率）
      fixed_rate: null // 固定费率（当use_tiers=false时使用）
    },
    point_transfer: {
      enabled: true, // 积分转账手续费
      use_tiers: false,
      fixed_rate: 0.02 // 固定2%手续费
    },
    market_purchase: {
      enabled: true, // 是否启用市场购买手续费（交易市场DIAMOND结算）
      use_tiers: true, // 使用分档计费（按UserInventory.value分档，手续费基于selling_amount计算）
      fixed_rate: null, // 固定费率（当use_tiers=false时使用）
      description: '交易市场DIAMOND结算手续费，按商品价值分档，手续费从selling_amount中扣除，平台收入'
    }
  }
}

module.exports = FEE_RULES
