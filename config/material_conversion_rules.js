/**
 * 材料转换规则配置（Material Conversion Rules Configuration）
 *
 * 业务场景（Business Scenario）：
 * - 定义材料资产之间的转换规则，包括转换比例、启用状态等
 * - 用于材料转换功能，如：碎红水晶分解为钻石
 * - 支持后续扩展更多材料转换规则
 *
 * 设计原则（Design Principles）：
 * - 集中管理转换规则，便于维护和调整
 * - 支持启用/禁用控制，便于运营管理
 * - 配置化转换比例，避免硬编码
 * - 提供清晰的规则描述，便于理解业务逻辑
 *
 * 使用示例（Usage Example）：
 * ```javascript
 * const { MATERIAL_CONVERSION_RULES } = require('./config/material_conversion_rules')
 *
 * // 获取碎红水晶转钻石的规则
 * const rule = MATERIAL_CONVERSION_RULES.red_shard_to_diamond
 *
 * // 检查规则是否启用
 * if (!rule.enabled) {
 *   throw new Error('材料转换功能已禁用')
 * }
 *
 * // 计算转换后的钻石数量
 * const diamond_amount = red_shard_amount * rule.conversion_rate
 * ```
 *
 * 创建时间：2025-12-15
 * 最后更新：2025-12-15
 * 使用模型：Claude Sonnet 4.5
 */

'use strict'

/**
 * 材料转换规则常量（Material Conversion Rules）
 *
 * 规则说明：
 * - from_asset_code: 源材料资产代码（Source Asset Code）
 * - to_asset_code: 目标资产代码（Target Asset Code）
 * - conversion_rate: 转换比例（Conversion Rate）- 1个源材料可转换为多少目标资产
 * - enabled: 是否启用（Enabled）- true=启用，false=禁用
 * - description: 规则描述（Description）- 用于展示和说明
 * - min_amount: 最小转换数量（Minimum Amount）- 单次转换的最小源材料数量
 * - max_amount: 最大转换数量（Maximum Amount）- 单次转换的最大源材料数量，null表示不限制
 */
const MATERIAL_CONVERSION_RULES = {
  /**
   * 碎红水晶转钻石规则（Red Shard to Diamond Rule）
   *
   * 业务规则：
   * - 1个碎红水晶（red_shard）= 20个钻石（DIAMOND）
   * - 这是本期唯一支持的材料转换规则
   * - 单向转换，不支持钻石转回碎红水晶
   * - 最小转换数量：1个碎红水晶
   * - 最大转换数量：不限制
   *
   * 使用场景：
   * - 用户通过抽奖获得碎红水晶材料
   * - 用户可以主动将碎红水晶分解为钻石
   * - 钻石可用于交易市场购买商品
   *
   * 注意事项：
   * - 转换操作不可逆，一旦转换无法撤销
   * - 转换过程中会扣减碎红水晶，增加钻石
   * - 转换需要在事务中完成，确保原子性
   * - 支持幂等性控制，防止重复转换
   */
  red_shard_to_diamond: {
    from_asset_code: 'red_shard', // 源材料：碎红水晶（Red Shard）
    to_asset_code: 'DIAMOND', // 目标资产：钻石（Diamond）
    conversion_rate: 20, // 转换比例：1碎红水晶 = 20钻石（1 Red Shard = 20 Diamonds）
    enabled: true, // 启用状态：true=启用，false=禁用（Enabled Status）
    description: '碎红水晶分解为钻石', // 规则描述（Rule Description）
    min_amount: 1, // 最小转换数量：1个碎红水晶（Minimum Conversion Amount）
    max_amount: null, // 最大转换数量：不限制（Maximum Conversion Amount: null = unlimited）

    // 显示配置（Display Configuration）
    display_config: {
      from_name: '碎红水晶', // 源材料显示名称（Source Material Display Name）
      to_name: '钻石', // 目标资产显示名称（Target Asset Display Name）
      rate_description: '1碎红水晶 = 20钻石', // 比例描述（Rate Description）
      icon: '💎' // 图标（Icon）
    },

    // 业务配置（Business Configuration）
    business_config: {
      require_idempotency_key: true, // 是否要求幂等键（Require Idempotency Key）
      transaction_required: true, // 是否要求在事务中执行（Transaction Required）
      audit_log_enabled: true, // 是否启用审计日志（Audit Log Enabled）
      rate_limit_per_day: null // 每日转换次数限制（Daily Rate Limit: null = unlimited）
    }
  }

  /**
   * 预留：未来可添加更多材料转换规则
   * Reserved: More conversion rules can be added in the future
   * 例如：完整红水晶转钻石、其他材料组合转换等
   * Example: Full red crystal to diamond, other material combination conversions, etc.
   */
}

/**
 * 获取材料转换规则（Get Material Conversion Rule）
 *
 * @param {string} from_asset_code - 源材料资产代码（Source Asset Code）
 * @param {string} to_asset_code - 目标资产代码（Target Asset Code）
 * @returns {Object|null} 转换规则对象，不存在返回null（Conversion Rule Object, returns null if not found）
 *
 * 使用示例（Usage Example）：
 * ```javascript
 * const rule = getConversionRule('red_shard', 'DIAMOND')
 * if (!rule) {
 *   throw new Error('不支持的材料转换')
 * }
 * if (!rule.enabled) {
 *   throw new Error('该材料转换规则已禁用')
 * }
 * ```
 */
function getConversionRule (from_asset_code, to_asset_code) {
  // 查找匹配的转换规则（Find matching conversion rule）
  const rule = Object.values(MATERIAL_CONVERSION_RULES).find(
    r => r.from_asset_code === from_asset_code && r.to_asset_code === to_asset_code
  )

  return rule || null
}

/**
 * 验证转换规则是否有效（Validate Conversion Rule）
 *
 * @param {string} from_asset_code - 源材料资产代码（Source Asset Code）
 * @param {string} to_asset_code - 目标资产代码（Target Asset Code）
 * @param {number} amount - 转换数量（Conversion Amount）
 * @returns {boolean} 验证成功返回true（Returns true if validation passes）
 * @throws {Error} 规则无效时抛出异常（Throws error if rule is invalid）
 *
 * 验证内容（Validation Content）：
 * - 规则是否存在（Rule exists）
 * - 规则是否启用（Rule is enabled）
 * - 转换数量是否符合最小/最大限制（Amount meets min/max limits）
 */
function validateConversionRule (from_asset_code, to_asset_code, amount) {
  // 获取转换规则（Get conversion rule）
  const rule = getConversionRule(from_asset_code, to_asset_code)

  if (!rule) {
    throw new Error(
      `不支持的材料转换：${from_asset_code} → ${to_asset_code}`
    )
  }

  if (!rule.enabled) {
    throw new Error(
      `材料转换规则已禁用：${from_asset_code} → ${to_asset_code}`
    )
  }

  // 验证最小转换数量（Validate minimum amount）
  if (rule.min_amount && amount < rule.min_amount) {
    throw new Error(
      `转换数量不足：最少需要${rule.min_amount}个${from_asset_code}，当前${amount}个`
    )
  }

  // 验证最大转换数量（Validate maximum amount）
  if (rule.max_amount && amount > rule.max_amount) {
    throw new Error(
      `转换数量超限：最多可转换${rule.max_amount}个${from_asset_code}，当前${amount}个`
    )
  }

  return true
}

/**
 * 计算转换后数量（Calculate Converted Amount）
 *
 * @param {string} from_asset_code - 源材料资产代码（Source Asset Code）
 * @param {string} to_asset_code - 目标资产代码（Target Asset Code）
 * @param {number} from_amount - 源材料数量（Source Material Amount）
 * @returns {number} 转换后的目标资产数量（Converted Target Asset Amount）
 *
 * 使用示例（Usage Example）：
 * ```javascript
 * // 计算10个碎红水晶可转换为多少钻石
 * const diamond_amount = calculateConvertedAmount('red_shard', 'DIAMOND', 10)
 * // 结果：200钻石（10 * 20 = 200）
 * ```
 */
function calculateConvertedAmount (from_asset_code, to_asset_code, from_amount) {
  const rule = getConversionRule(from_asset_code, to_asset_code)

  if (!rule) {
    throw new Error(
      `不支持的材料转换：${from_asset_code} → ${to_asset_code}`
    )
  }

  // 计算转换后数量（Calculate converted amount）
  const converted_amount = from_amount * rule.conversion_rate

  return converted_amount
}

// 导出配置和工具函数（Export configuration and utility functions）
module.exports = {
  MATERIAL_CONVERSION_RULES, // 材料转换规则常量（Material Conversion Rules）
  getConversionRule, // 获取转换规则（Get Conversion Rule）
  validateConversionRule, // 验证转换规则（Validate Conversion Rule）
  calculateConvertedAmount // 计算转换后数量（Calculate Converted Amount）
}
