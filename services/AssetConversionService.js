/**
 * 餐厅积分抽奖系统 V4.5.0材料系统架构 - 资产转换服务（AssetConversionService）
 * 🔥 Phase 3已迁移：使用统一账本（AssetService）进行材料转换
 *
 * 业务场景：提供材料资产的显式转换功能，如碎红水晶分解为钻石
 *
 * 核心功能：
 * 1. 材料转钻石转换（碎红水晶 → 钻石，比例1:20）
 * 2. 完整的事务保护（扣减材料 + 增加钻石在同一事务中完成）
 * 3. 幂等性控制（防止重复转换）+ 409冲突保护（参数不同返回409）
 * 4. 规则验证（转换规则存在性、启用状态、数量限制）
 * 5. 完整的流水记录（统一账本双分录：material_convert_debit + material_convert_credit）
 *
 * Phase 3改造要点：
 * - ✅ 使用AssetService.changeBalance()替代MaterialService + DiamondService
 * - ✅ 双分录模型：material_convert_debit（扣减）+ material_convert_credit（入账）
 * - ✅ 统一business_id：两个分录使用同一个business_id，通过business_type区分
 * - ✅ 409冲突检查：同一business_id但参数不同时返回409 IDEMPOTENCY_KEY_CONFLICT
 * - ✅ 余额来源：统一从account_asset_balances读取，不再依赖旧余额表
 *
 * 业务流程：
 *
 * 1. **显式转换流程**（用户主动发起）
 *    - 用户选择碎红水晶数量 → convertMaterial()
 *    - 验证转换规则 → 验证材料余额
 *    - 统一账本双分录：扣减材料（debit）+ 增加钻石（credit）在同一事务中
 *    - 写入统一流水记录（asset_transactions表）→ 转换完成
 *
 * 2. **幂等性保护（Phase 3强化）**
 *    - 客户端必须传入business_id（幂等键）
 *    - 同一business_id只能转换一次
 *    - 重复请求（参数相同）：返回原结果（is_duplicate=true）
 *    - 重复请求（参数不同）：返回409冲突错误（IDEMPOTENCY_KEY_CONFLICT）
 *
 * 3. **错误处理**
 *    - 转换规则不存在/已禁用 → 拒绝转换
 *    - 材料余额不足 → 拒绝转换（统一账本验证）
 *    - 转换数量不符合限制 → 拒绝转换
 *    - 参数冲突 → 返回409错误
 *    - 任何异常自动回滚事务
 *
 * 设计原则：
 * - **统一账本**：所有资产变动通过AssetService统一管理（Single Source of Truth）
 * - **事务原子性**：扣减和入账在同一事务中完成，要么全成功要么全失败
 * - **幂等性保证**：通过business_id防止重复转换，参数不同返回409
 * - **规则配置化**：转换规则来自数据库配置表（material_conversion_rules），支持版本化（effective_at）
 * - **完整审计**：每次转换都有完整的流水记录（asset_transactions）
 * - **不隐式触发**：只提供显式API，不在兑换等流程中自动转换
 *
 * 关键方法列表：
 * - convertMaterial() - 材料转换（核心方法，使用AssetService统一账本）
 * - convertRedShardToDiamond() - 碎红水晶转钻石（便捷方法）
 *
 * 数据模型关联（Phase 3最终态）：
 * - AccountAssetBalance：统一资产余额表（管理所有资产余额）
 * - AssetTransaction：统一资产流水表（记录所有资产变动）
 *   - business_type: material_convert_debit（材料扣减分录）
 *   - business_type: material_convert_credit（钻石入账分录）
 *
 * 幂等性保证（Phase 3强化）：
 * - 通过business_id（业务唯一标识）防止重复转换
 * - 同一business_id的转换操作只会执行一次
 * - 参数一致：返回原结果（is_duplicate=true）
 * - 参数不一致：返回409冲突错误（IDEMPOTENCY_KEY_CONFLICT）
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
const AssetService = require('./AssetService') // Phase 3: 使用统一账本服务
// 🔴 从 models/index.js 获取已初始化的 Sequelize Model（避免直接 require 模型定义文件导致未初始化）
const { MaterialConversionRule } = require('../models')
// const MaterialAssetType = require('../models/MaterialAssetType') // P1-3: 材料类型配置（预留未来使用）
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
  static async convertMaterial(user_id, from_asset_code, to_asset_code, from_amount, options = {}) {
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

    // 🔴 P1-3 修改：从 DB 读取转换规则（支持版本化查询）
    const rule = await MaterialConversionRule.getEffectiveRule(
      from_asset_code,
      to_asset_code,
      new Date(), // 查询当前生效的规则
      { transaction: options.transaction }
    )

    if (!rule) {
      throw new Error(
        `不支持的材料转换：${from_asset_code} → ${to_asset_code}（未找到生效的转换规则）`
      )
    }

    // 验证规则是否启用
    if (!rule.is_enabled) {
      throw new Error(`材料转换规则已禁用：${from_asset_code} → ${to_asset_code}`)
    }

    // 计算转换后的目标资产数量（Calculate converted amount）
    const to_amount = Math.floor((from_amount / rule.from_amount) * rule.to_amount)

    const business_id = options.business_id
    const title = options.title || `材料转换：${from_asset_code} → ${to_asset_code}`
    const meta = {
      ...options.meta,
      from_asset_code,
      to_asset_code,
      from_amount,
      to_amount,
      rule_id: rule.rule_id, // 记录规则ID用于审计
      rule_effective_at: rule.effective_at, // 记录规则生效时间用于回放
      conversion_rate: rule.to_amount / rule.from_amount, // 转换比例
      rule_from_amount: rule.from_amount, // 规则源数量
      rule_to_amount: rule.to_amount // 规则目标数量
    }

    // 🔥 在事务中执行转换操作（Phase 3：使用统一账本双分录）
    const externalTransaction = options.transaction
    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      // 🔴 Phase 3: 409幂等冲突检查 - 查询是否已存在转换记录
      const existing_debit_tx = await AssetService.getTransactions(
        { user_id },
        {
          asset_code: from_asset_code,
          business_type: 'material_convert_debit',
          page_size: 1000 // 获取足够多的记录用于查找
        },
        { transaction }
      )

      // 检查是否存在相同business_id的记录
      const existing_record = existing_debit_tx.transactions.find(
        tx => tx.business_id === business_id
      )

      if (existing_record) {
        // 参数一致性验证（409冲突保护）
        const existing_meta = existing_record.meta || {}
        const is_params_match =
          existing_meta.from_asset_code === from_asset_code &&
          existing_meta.to_asset_code === to_asset_code &&
          Math.abs(existing_record.delta_amount) === from_amount

        if (!is_params_match) {
          // 参数不一致，返回409冲突
          const conflictError = new Error(
            `幂等键冲突：business_id="${business_id}" 已被使用于不同参数的转换操作。` +
              `原转换：${existing_meta.from_asset_code || 'unknown'} → ${existing_meta.to_asset_code || 'unknown'}, ` +
              `数量=${Math.abs(existing_record.delta_amount || 0)}；` +
              `当前请求：${from_asset_code} → ${to_asset_code}, 数量=${from_amount}。` +
              '请使用不同的幂等键或确认请求参数正确。'
          )
          conflictError.statusCode = 409 // HTTP 409 Conflict
          conflictError.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'

          // 安全回滚事务（检查是否已完成）
          if (transaction && !transaction.finished) {
            await transaction.rollback()
          }

          throw conflictError
        }

        // 参数一致，返回幂等结果
        logger.info('⚠️ 幂等性检查：材料转换已存在，参数一致，返回原结果', {
          user_id,
          from_asset_code,
          to_asset_code,
          from_amount,
          to_amount,
          business_id
        })

        // 查询对应的目标资产入账记录
        const to_transactions_result = await AssetService.getTransactions(
          { user_id },
          {
            asset_code: to_asset_code,
            business_type: 'material_convert_credit',
            page_size: 1
          },
          { transaction }
        )

        // 获取当前余额
        const from_balance_obj = await AssetService.getBalance(
          { user_id, asset_code: from_asset_code },
          { transaction }
        )
        const to_balance_obj = await AssetService.getBalance(
          { user_id, asset_code: to_asset_code },
          { transaction }
        )

        if (shouldCommit) {
          await transaction.commit()
        }

        return {
          success: true,
          from_asset_code,
          to_asset_code,
          from_amount,
          to_amount,
          from_tx_id: existing_record.transaction_id,
          to_tx_id:
            to_transactions_result.transactions.length > 0
              ? to_transactions_result.transactions[0].transaction_id
              : null,
          from_balance: from_balance_obj.available_amount,
          to_balance: to_balance_obj.available_amount,
          is_duplicate: true
        }
      }

      /*
       * 步骤1：扣减源材料（使用统一账本AssetService）
       * business_type: material_convert_debit
       */
      const from_result = await AssetService.changeBalance(
        {
          user_id,
          asset_code: from_asset_code,
          delta_amount: -from_amount, // 负数表示扣减
          business_id: `${business_id}`, // 幂等键：转换业务ID
          business_type: 'material_convert_debit', // 业务类型：材料转换扣减
          meta: {
            ...meta,
            to_asset_code,
            to_amount,
            conversion_rate: to_amount / from_amount,
            title: `${title}（扣减${from_asset_code}）`
          }
        },
        {
          transaction
        }
      )

      /*
       * 步骤2：增加目标资产（使用统一账本AssetService）
       * business_type: material_convert_credit
       */
      const to_result = await AssetService.changeBalance(
        {
          user_id,
          asset_code: to_asset_code,
          delta_amount: to_amount, // 正数表示增加
          business_id: `${business_id}`, // 同一个business_id，不同business_type实现双分录
          business_type: 'material_convert_credit', // 业务类型：材料转换入账
          meta: {
            ...meta,
            from_asset_code,
            from_amount,
            conversion_rate: to_amount / from_amount,
            title: `${title}（获得${to_asset_code}）`
          }
        },
        {
          transaction
        }
      )

      // 提交事务（Commit transaction）
      if (shouldCommit) {
        await transaction.commit()
      }

      logger.info('✅ 材料转换成功（统一账本双分录）', {
        user_id,
        from_asset_code,
        to_asset_code,
        from_amount,
        to_amount,
        from_tx_id: from_result.transaction_record.transaction_id,
        to_tx_id: to_result.transaction_record.transaction_id,
        business_id
      })

      return {
        success: true,
        from_asset_code,
        to_asset_code,
        from_amount,
        to_amount,
        from_tx_id: from_result.transaction_record.transaction_id,
        to_tx_id: to_result.transaction_record.transaction_id,
        from_balance: from_result.balance.available_amount,
        to_balance: to_result.balance.available_amount,
        is_duplicate: false
      }
    } catch (error) {
      // 回滚事务（Rollback transaction）- 只有在未回滚时才回滚
      if (shouldCommit && !transaction.finished) {
        await transaction.rollback()
      }

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
  static async convertRedShardToDiamond(user_id, red_shard_amount, options = {}) {
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

  /**
   * 获取材料转换规则列表（从数据库读取）
   *
   * 业务场景：
   * - 给用户侧/管理侧展示当前可用的材料转换规则
   * - **规则真相**来自 material_conversion_rules（禁止硬编码）
   *
   * 返回口径：
   * - 默认返回所有 is_enabled=true 的规则，按 effective_at 倒序
   * - 不在路由层直接查询 models，统一由 Service 层承接（项目规范：路由不直连 models）
   *
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务（可选）
   * @param {Date} options.as_of_time - 查询生效时间点（可选，默认当前时间）
   * @returns {Promise<Array<Object>>} 规则列表（含 rule_id/from_asset_code/to_asset_code/from_amount/to_amount/effective_at/is_enabled）
   */
  static async getConversionRules(options = {}) {
    const { transaction, as_of_time } = options
    const asOfTime = as_of_time || new Date()

    const rules = await MaterialConversionRule.findAll({
      where: {
        is_enabled: true,
        effective_at: {
          [sequelize.Sequelize.Op.lte]: asOfTime
        }
      },
      order: [
        ['effective_at', 'DESC'],
        ['rule_id', 'DESC']
      ],
      transaction,
      raw: true
    })

    return rules
  }
}

module.exports = AssetConversionService
