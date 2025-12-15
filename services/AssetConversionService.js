/**
 * 餐厅积分抽奖系统 V4.5.0材料系统架构 - 资产转换服务（AssetConversionService）
 *
 * 业务场景：提供材料资产的显式转换功能，如碎红水晶分解为钻石
 *
 * 核心功能：
 * 1. 材料转钻石转换（碎红水晶 → 钻石，比例1:20）
 * 2. 完整的事务保护（扣减材料 + 增加钻石在同一事务中完成）
 * 3. 幂等性控制（防止重复转换）
 * 4. 规则验证（转换规则存在性、启用状态、数量限制）
 * 5. 完整的流水记录（材料扣减流水 + 钻石入账流水）
 *
 * 业务流程：
 *
 * 1. **显式转换流程**（用户主动发起）
 *    - 用户选择碎红水晶数量 → convertMaterial()
 *    - 验证转换规则 → 验证材料余额
 *    - 扣减材料 → 增加钻石（同一事务）
 *    - 写入双流水记录 → 转换完成
 *
 * 2. **幂等性保护**
 *    - 客户端必须传入business_id（幂等键）
 *    - 同一business_id只能转换一次
 *    - 重复请求返回原结果，不重复扣减/入账
 *
 * 3. **错误处理**
 *    - 转换规则不存在/已禁用 → 拒绝转换
 *    - 材料余额不足 → 拒绝转换
 *    - 转换数量不符合限制 → 拒绝转换
 *    - 任何异常自动回滚事务
 *
 * 设计原则：
 * - **高层封装**：组合MaterialService和DiamondService，提供完整转换能力
 * - **事务原子性**：扣减和入账在同一事务中完成，要么全成功要么全失败
 * - **幂等性保证**：通过business_id防止重复转换
 * - **规则配置化**：转换规则来自配置文件，便于维护
 * - **完整审计**：每次转换都有完整的流水记录
 * - **不隐式触发**：只提供显式API，不在兑换等流程中自动转换
 *
 * 关键方法列表：
 * - convertMaterial() - 材料转换（核心方法，组合MaterialService和DiamondService）
 * - convertRedShardToDiamond() - 碎红水晶转钻石（便捷方法）
 *
 * 数据模型关联：
 * - UserMaterialBalance：用户材料余额表（扣减碎红水晶）
 * - MaterialTransaction：材料交易记录表（记录材料扣减流水）
 * - UserDiamondAccount：用户钻石账户表（增加钻石）
 * - DiamondTransaction：钻石交易记录表（记录钻石入账流水）
 *
 * 幂等性保证：
 * - 通过business_id（业务唯一标识）防止重复转换
 * - 同一business_id的转换操作只会执行一次
 * - 重复请求返回原结果（is_duplicate=true）
 *
 * 事务支持：
 * - 所有转换操作都在事务中完成
 * - 扣减材料和增加钻石必须在同一事务中
 * - 任何异常都会自动回滚事务，确保数据一致性
 *
 * 使用示例：
 * ```javascript
 * // 示例1：碎红水晶转钻石（显式转换）
 * const AssetConversionService = require('./services/AssetConversionService')
 * const result = await AssetConversionService.convertRedShardToDiamond(
 *   1, // user_id
 *   50, // red_shard_amount（50个碎红水晶）
 *   {
 *     business_id: `convert_to_diamond_${Date.now()}` // 幂等键
 *   }
 * )
 * // 结果：扣减50个碎红水晶，增加1000个钻石（50 * 20 = 1000）
 *
 * // 示例2：通用材料转换
 * const result = await AssetConversionService.convertMaterial(
 *   1, // user_id
 *   'red_shard', // from_asset_code
 *   'DIAMOND', // to_asset_code
 *   20, // from_amount
 *   {
 *     business_id: `material_convert_${Date.now()}`
 *   }
 * )
 * // 结果：扣减20个碎红水晶，增加400个钻石（20 * 20 = 400）
 * ```
 *
 * 创建时间：2025-12-15
 * 最后更新：2025-12-15
 * 使用模型：Claude Sonnet 4.5
 */

'use strict'

const { sequelize } = require('../config/database')
const MaterialService = require('./MaterialService')
const DiamondService = require('./DiamondService')
const {
  getConversionRule,
  validateConversionRule,
  calculateConvertedAmount
} = require('../config/material_conversion_rules')
const logger = require('../utils/logger')

/**
 * 资产转换服务类
 * 职责：提供材料资产的显式转换功能，组合MaterialService和DiamondService
 * 设计模式：服务层模式 + 事务管理模式 + 组合模式
 */
class AssetConversionService {
  /**
   * 材料转换（核心方法）
   *
   * 业务规则：
   * - 根据转换规则配置进行材料转换
   * - 扣减源材料 + 增加目标资产在同一事务中完成
   * - 支持幂等性控制，防止重复转换
   * - 验证转换规则、材料余额、数量限制
   *
   * @param {number} user_id - 用户ID（User ID）
   * @param {string} from_asset_code - 源材料资产代码（Source Asset Code）如：red_shard
   * @param {string} to_asset_code - 目标资产代码（Target Asset Code）如：DIAMOND
   * @param {number} from_amount - 源材料数量（Source Material Amount）必须大于0
   * @param {Object} options - 选项参数（Options）
   * @param {string} options.business_id - 业务唯一ID（Business ID）必填，用于幂等性控制
   * @param {string} options.title - 转换标题（Title）可选，默认为"材料转换"
   * @param {Object} options.meta - 元数据（Meta）可选，额外的业务信息
   * @returns {Promise<Object>} 转换结果（Conversion Result）
   * @throws {Error} 转换失败时抛出异常（Throws error on conversion failure）
   *
   * 返回对象结构：
   * {
   *   success: true,
   *   from_asset_code: 'red_shard',
   *   to_asset_code: 'DIAMOND',
   *   from_amount: 50,
   *   to_amount: 1000,
   *   from_tx_id: 123,  // 材料扣减流水ID
   *   to_tx_id: 456,    // 钻石入账流水ID
   *   from_balance: 100, // 转换后的材料余额
   *   to_balance: 5000,  // 转换后的钻石余额
   *   is_duplicate: false // 是否为重复请求
   * }
   */
  static async convertMaterial (
    user_id,
    from_asset_code,
    to_asset_code,
    from_amount,
    options = {}
  ) {
    // 参数验证（Parameter validation）
    if (!user_id || user_id <= 0) {
      throw new Error('用户ID无效')
    }

    if (!from_asset_code) {
      throw new Error('源材料资产代码不能为空')
    }

    if (!to_asset_code) {
      throw new Error('目标资产代码不能为空')
    }

    if (!from_amount || from_amount <= 0) {
      throw new Error('转换数量必须大于0')
    }

    if (!options.business_id) {
      throw new Error('business_id不能为空（幂等性控制必需）')
    }

    // 获取并验证转换规则（Get and validate conversion rule）
    const rule = getConversionRule(from_asset_code, to_asset_code)
    if (!rule) {
      throw new Error(
        `不支持的材料转换：${from_asset_code} → ${to_asset_code}`
      )
    }

    // 验证转换规则（最小/最大数量、启用状态）
    validateConversionRule(from_asset_code, to_asset_code, from_amount)

    // 计算转换后的目标资产数量（Calculate converted amount）
    const to_amount = calculateConvertedAmount(
      from_asset_code,
      to_asset_code,
      from_amount
    )

    const business_id = options.business_id
    const title = options.title || `材料转换：${from_asset_code} → ${to_asset_code}`
    const meta = {
      ...options.meta,
      from_asset_code,
      to_asset_code,
      from_amount,
      to_amount,
      conversion_rate: rule.conversion_rate,
      rule_description: rule.description
    }

    // 🔥 在事务中执行转换操作（Execute conversion in transaction）
    const transaction = await sequelize.transaction()

    try {
      // 步骤1：扣减源材料（Step 1: Deduct source material）
      const from_result = await MaterialService.consume(
        user_id,
        from_asset_code,
        from_amount,
        {
          transaction,
          business_id: `${business_id}_from`,
          business_type: 'material_convert',
          title: `${title}（扣减${from_asset_code}）`,
          meta
        }
      )

      // 如果是重复请求，查询对应的钻石入账记录并返回（If duplicate request, query and return corresponding diamond record）
      if (from_result.is_duplicate) {
        logger.info('⚠️ 幂等性检查：材料转换已存在，返回原结果', {
          user_id,
          from_asset_code,
          to_asset_code,
          from_amount,
          to_amount,
          business_id
        })

        // 查询对应的目标资产入账记录（Query corresponding target asset record）
        const to_tx_business_id = `${business_id}_to`

        // 根据目标资产类型选择对应的服务（Select corresponding service based on target asset type）
        let to_balance = 0
        let to_tx_id = null

        if (to_asset_code === 'DIAMOND') {
          // 查询钻石账户（Query diamond account）
          const diamondAccount = await DiamondService.getUserAccount(user_id, {
            transaction
          })
          to_balance = diamondAccount ? diamondAccount.balance : 0

          // 查询钻石流水（Query diamond transaction）
          const { transactions } = await DiamondService.getUserTransactions(
            user_id,
            {
              business_type: 'material_convert',
              limit: 1
            }
          )

          if (transactions && transactions.length > 0) {
            const matchedTx = transactions.find(
              tx => tx.business_id === to_tx_business_id
            )
            if (matchedTx) {
              to_tx_id = matchedTx.tx_id
            }
          }
        }

        await transaction.commit()

        return {
          success: true,
          from_asset_code,
          to_asset_code,
          from_amount,
          to_amount,
          from_tx_id: from_result.tx_id,
          to_tx_id,
          from_balance: from_result.new_balance,
          to_balance,
          is_duplicate: true
        }
      }

      // 步骤2：增加目标资产（Step 2: Add target asset）
      let to_result

      if (to_asset_code === 'DIAMOND') {
        // 增加钻石（Add diamond）
        to_result = await DiamondService.add(user_id, to_amount, {
          transaction,
          business_id: `${business_id}_to`,
          business_type: 'material_convert',
          title: `${title}（获得${to_asset_code}）`,
          meta
        })
      } else {
        // 增加其他材料（Add other material）
        to_result = await MaterialService.add(user_id, to_asset_code, to_amount, {
          transaction,
          business_id: `${business_id}_to`,
          business_type: 'material_convert',
          title: `${title}（获得${to_asset_code}）`,
          meta
        })
      }

      // 提交事务（Commit transaction）
      await transaction.commit()

      logger.info('✅ 材料转换成功', {
        user_id,
        from_asset_code,
        to_asset_code,
        from_amount,
        to_amount,
        from_tx_id: from_result.tx_id,
        to_tx_id: to_result.tx_id,
        business_id
      })

      return {
        success: true,
        from_asset_code,
        to_asset_code,
        from_amount,
        to_amount,
        from_tx_id: from_result.tx_id,
        to_tx_id: to_result.tx_id,
        from_balance: from_result.new_balance,
        to_balance: to_result.new_balance,
        is_duplicate: false
      }
    } catch (error) {
      // 回滚事务（Rollback transaction）
      await transaction.rollback()

      logger.error('❌ 材料转换失败', {
        user_id,
        from_asset_code,
        to_asset_code,
        from_amount,
        to_amount,
        business_id,
        error: error.message
      })

      throw error
    }
  }

  /**
   * 碎红水晶转钻石（便捷方法）
   *
   * 业务规则：
   * - 1个碎红水晶（red_shard）= 20个钻石（DIAMOND）
   * - 这是convertMaterial()的便捷封装
   * - 固定转换类型：red_shard → DIAMOND
   *
   * @param {number} user_id - 用户ID（User ID）
   * @param {number} red_shard_amount - 碎红水晶数量（Red Shard Amount）必须大于0
   * @param {Object} options - 选项参数（Options）
   * @param {string} options.business_id - 业务唯一ID（Business ID）必填，用于幂等性控制
   * @returns {Promise<Object>} 转换结果（Conversion Result）
   *
   * 使用示例：
   * ```javascript
   * // 将50个碎红水晶转换为1000个钻石
   * const result = await AssetConversionService.convertRedShardToDiamond(
   *   1, // user_id
   *   50, // red_shard_amount
   *   {
   *     business_id: `convert_${Date.now()}`
   *   }
   * )
   * ```
   */
  static async convertRedShardToDiamond (user_id, red_shard_amount, options = {}) {
    if (!options.business_id) {
      throw new Error('business_id不能为空（幂等性控制必需）')
    }

    return await this.convertMaterial(
      user_id,
      'red_shard', // 固定源材料：碎红水晶
      'DIAMOND', // 固定目标资产：钻石
      red_shard_amount,
      {
        ...options,
        title: options.title || '碎红水晶分解为钻石'
      }
    )
  }
}

module.exports = AssetConversionService
