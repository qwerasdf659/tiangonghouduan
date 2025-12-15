/**
 * 餐厅积分抽奖系统 V4.5.0材料系统架构 - 材料服务（MaterialService）
 *
 * 业务场景：管理用户材料的完整生命周期，包括材料获取、消费、转换等所有材料相关业务
 *
 * 核心功能：
 * 1. 材料余额管理（自动创建、获取、增加、消费）
 * 2. 材料获取业务（抽奖获得、活动赠送、管理员调整）
 * 3. 材料消费业务（兑换市场消耗、合成消耗）
 * 4. 材料转换机制（合成、分解、逐级转换，规则可配置、可版本化）
 * 5. 交易记录审计（完整的交易历史、支持幂等性控制、防重复提交）
 * 6. 材料统计查询（余额查询、交易明细）
 *
 * 业务流程：
 *
 * 1. **抽奖获得流程**（事务保护）
 *    - 抽奖中奖 → add()增加材料（原子操作，带幂等键）
 *    - 写入流水记录 → 材料到账
 *
 * 2. **兑换消费流程**（事务保护）
 *    - 用户选择商品兑换 → consume()扣除材料（原子操作）
 *    - 材料不足直接失败 → 不自动转换
 *
 * 3. **材料转换流程**（事务保护）
 *    - 用户选择转换规则 → convertByRule()按规则转换
 *    - 同时扣源材料、加目标材料 → 写入双流水（convert_out + convert_in）
 *    - 幂等性保护 → 同一business_id只执行一次
 *
 * 4. **分解钻石流程**（跨Service事务保护）
 *    - 用户将碎红水晶分解为钻石 → convertToDiamond()
 *    - 扣减材料 + 增加钻石 → 同一事务完成（与DiamondService协作）
 *    - 只允许碎红水晶分解，不允许越级
 *
 * 设计原则：
 * - **数据模型统一**：只使用V4.5.0材料系统（UserMaterialBalance + MaterialTransaction）
 * - **事务安全保障**：所有材料操作支持外部事务传入，确保原子性
 * - **幂等性控制**：通过business_id防止重复提交，保证业务幂等性
 * - **审计完整性**：每笔交易都有完整记录（before/after余额、业务关联、操作时间）
 * - **规则可配置**：转换规则存储在数据库，支持动态新增、版本化、历史追溯
 * - **防套利机制**：循环检测、负环检测，防止无限套利
 *
 * 关键方法列表：
 * - getOrCreateBalance() - 获取/创建材料余额（自动创建不存在的余额）
 * - getUserBalances() - 获取用户所有材料余额（列表或map）
 * - add() - 增加材料（支持事务、幂等性）
 * - consume() - 消费材料（支持事务、幂等性、余额验证）
 * - convertByRule() - 按规则转换材料（支持事务、幂等性、规则验证）
 * - convertToDiamond() - 碎红水晶分解为钻石（跨Service事务保护）
 * - getConversionRules() - 获取转换规则列表（支持筛选、有效性验证）
 * - getUserTransactions() - 查询用户交易历史（支持分页、筛选）
 *
 * 数据模型关联：
 * - UserMaterialBalance：用户材料余额表（核心数据：balance）
 * - MaterialTransaction：材料交易记录表（审计日志：每笔交易的before/after余额）
 * - MaterialAssetType：材料资产类型表（配置数据：display_name、group_code、tier等）
 * - MaterialConversionRule：材料转换规则表（配置数据：from/to、比例、生效时间）
 *
 * 幂等性保证：
 * - 通过business_id（业务唯一标识）防止重复提交
 * - 同一business_id的操作只会执行一次，重复请求返回原结果
 * - 适用场景：抽奖发放、兑换扣减、材料转换、管理员调整等
 *
 * 事务支持：
 * - 所有方法支持外部事务传入（options.transaction参数）
 * - 事务内使用悲观锁（FOR UPDATE）防止并发问题
 * - 典型场景：兑换、转换、分解钻石等需要多表操作的业务
 *
 * 使用示例：
 * ```javascript
 * // 示例1：抽奖发放材料（带幂等保护）
 * const MaterialService = require('./services/MaterialService')
 * const result = await MaterialService.add(
 *   1, // user_id
 *   'red_shard', // asset_code
 *   10, // amount
 *   {
 *     business_id: `lottery_draw_${draw_id}_red_shard`,
 *     business_type: 'lottery_reward',
 *     title: '抽奖获得碎红水晶',
 *     transaction
 *   }
 * )
 *
 * // 示例2：兑换商品扣除材料（带事务保护）
 * const transaction = await sequelize.transaction()
 * try {
 *   // 扣除材料
 *   await MaterialService.consume(1, 'red_crystal', 5, {
 *     transaction,
 *     business_id: `exchange_market_${order_id}`,
 *     business_type: 'exchange_market',
 *     title: '兑换商品消耗完整红水晶'
 *   })
 *   // 创建兑换订单...
 *   await transaction.commit()
 * } catch (error) {
 *   await transaction.rollback()
 * }
 *
 * // 示例3：材料转换（按规则转换）
 * const result = await MaterialService.convertByRule(1, rule_id, 10, {
 *   business_id: `material_convert_${Date.now()}`,
 *   business_type: 'material_convert',
 *   title: '材料合成',
 *   transaction
 * })
 *
 * // 示例4：碎红水晶分解为钻石
 * const result = await MaterialService.convertToDiamond(1, 50, {
 *   business_id: `convert_to_diamond_${Date.now()}`,
 *   transaction
 * })
 * ```
 *
 * 创建时间：2025年12月15日
 * 最后更新：2025年12月15日
 * 使用模型：Claude Sonnet 4.5
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const {
  UserMaterialBalance,
  MaterialTransaction,
  MaterialAssetType,
  MaterialConversionRule
} = require('../models')
const { Op } = require('sequelize')

/**
 * 🎯 统一数据输出视图常量（Data Output View Constants）
 *
 * 业务场景（Business Scenario）：
 * - 统一管理材料领域的数据输出字段，避免字段选择分散在各方法
 * - 符合架构规范：与积分领域的 POINTS_ATTRIBUTES 模式保持一致
 * - 根据权限级别（用户/管理员）返回不同的数据字段，保护敏感信息
 *
 * 设计原则（Design Principles）：
 * - userView：用户视图 - 用户查询自己的材料余额时返回的字段
 * - adminView：管理员视图 - 管理员查询用户材料余额时返回的字段（包含所有字段）
 * - transactionView：交易视图 - 查询材料交易记录时返回的字段（标准交易信息）
 *
 * 使用示例（Usage Example）：
 * ```javascript
 * // 用户查询自己的材料余额
 * const balance = await UserMaterialBalance.findOne({
 *   where: { user_id: userId, asset_code: 'red_shard' },
 *   attributes: MATERIAL_ATTRIBUTES.userView
 * })
 *
 * // 管理员查询用户材料余额
 * const balance = await UserMaterialBalance.findOne({
 *   where: { user_id: userId, asset_code: 'red_shard' },
 *   attributes: MATERIAL_ATTRIBUTES.adminView
 * })
 *
 * // 查询交易记录
 * const transactions = await MaterialTransaction.findAll({
 *   where: { user_id: userId },
 *   attributes: MATERIAL_ATTRIBUTES.transactionView
 * })
 * ```
 */
const MATERIAL_ATTRIBUTES = {
  /**
   * 用户视图（User View）
   * 用户查询自己的材料余额时返回的字段
   */
  userView: [
    'balance_id', // 余额ID（Balance ID）
    'user_id', // 用户ID（User ID）
    'asset_code', // 资产代码（Asset Code）
    'balance', // 余额（Balance）
    'created_at' // 创建时间（Created At）
  ],

  /**
   * 管理员视图（Admin View）
   * 管理员查询用户材料余额时返回的字段
   * 包含所有字段，用于后台管理和数据分析
   */
  adminView: [
    'balance_id', // 余额ID（Balance ID）
    'user_id', // 用户ID（User ID）
    'asset_code', // 资产代码（Asset Code）
    'balance', // 余额（Balance）
    'created_at', // 创建时间（Created At）
    'updated_at' // 更新时间（Updated At）
  ],

  /**
   * 交易视图（Transaction View）
   * 查询材料交易记录时返回的字段
   * 包含交易核心信息，用于历史记录展示和数据分析
   */
  transactionView: [
    'tx_id', // 交易ID（Transaction ID）
    'user_id', // 用户ID（User ID）
    'asset_code', // 资产代码（Asset Code）
    'tx_type', // 交易类型：earn/consume/convert_in/convert_out/admin_adjust（Transaction Type）
    'amount', // 金额（Amount）
    'balance_before', // 变更前余额（Balance Before）
    'balance_after', // 变更后余额（Balance After）
    'business_type', // 业务类型（Business Type）
    'business_id', // 业务ID（Business ID）
    'title', // 标题（Title）
    'meta', // 元数据（Meta）
    'created_at' // 创建时间（Created At）
  ]
}

/**
 * 材料服务类
 * 职责：管理用户材料的增减、查询、转换等核心业务逻辑
 * 设计模式：服务层模式 + 事务管理模式
 */
class MaterialService {
  /**
   * 获取或创建用户材料余额
   * @param {number} user_id - 用户ID
   * @param {string} asset_code - 资产代码（如：red_shard、red_crystal）
   * @param {Object} options - 选项参数
   * @param {Transaction} options.transaction - 事务对象（可选，用于在事务中查询最新数据）
   * @returns {Object} 材料余额信息
   */
  static async getOrCreateBalance (user_id, asset_code, options = {}) {
    const transaction = options.transaction || null

    // 查询余额（如果在事务中，使用悲观锁）
    let balance = await UserMaterialBalance.findOne({
      where: { user_id, asset_code },
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined
    })

    // 如果余额不存在，自动创建
    if (!balance) {
      // 验证资产类型是否存在且启用
      const assetType = await MaterialAssetType.findOne({
        where: { asset_code, is_enabled: true },
        transaction
      })

      if (!assetType) {
        throw new Error(`资产类型不存在或已禁用：${asset_code}`)
      }

      // 创建余额记录
      balance = await UserMaterialBalance.create(
        {
          user_id,
          asset_code,
          balance: 0
        },
        { transaction }
      )

      console.log(
        `✅ 自动创建材料余额: user_id=${user_id}, asset_code=${asset_code}, balance=0`
      )
    }

    return balance
  }

  /**
   * 获取用户所有材料余额
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项参数
   * @param {Transaction} options.transaction - 事务对象（可选）
   * @param {boolean} options.includeAssetType - 是否包含资产类型信息（默认true）
   * @param {boolean} options.includeZeroBalance - 是否包含零余额记录（默认false）
   * @returns {Array} 材料余额列表
   */
  static async getUserBalances (user_id, options = {}) {
    const transaction = options.transaction || null
    const includeAssetType = options.includeAssetType !== false
    const includeZeroBalance = options.includeZeroBalance === true

    const whereClause = { user_id }
    if (!includeZeroBalance) {
      whereClause.balance = { [Op.gt]: 0 }
    }

    const queryOptions = {
      where: whereClause,
      transaction,
      order: [['asset_code', 'ASC']]
    }

    // 如果需要包含资产类型信息
    if (includeAssetType) {
      queryOptions.include = [
        {
          model: MaterialAssetType,
          as: 'asset_type',
          attributes: [
            'asset_code',
            'display_name',
            'group_code',
            'form',
            'tier',
            'visible_value_points',
            'sort_order'
          ]
        }
      ]
    }

    const balances = await UserMaterialBalance.findAll(queryOptions)

    return balances
  }

  /**
   * 增加材料
   * @param {number} user_id - 用户ID
   * @param {string} asset_code - 资产代码
   * @param {number} amount - 增加数量（必须大于0）
   * @param {Object} options - 交易选项
   * @param {Transaction} options.transaction - 外部事务对象（可选）
   * @param {string} options.business_id - 业务唯一ID（必填，用于幂等性控制）
   * @param {string} options.business_type - 业务类型（必填）
   * @param {string} options.title - 交易标题（可选）
   * @param {Object} options.meta - 元数据（可选）
   * @returns {Object} 交易结果
   */
  static async add (user_id, asset_code, amount, options = {}) {
    if (amount <= 0) {
      throw new Error('材料数量必须大于0')
    }

    if (!options.business_id) {
      throw new Error('business_id不能为空')
    }

    if (!options.business_type) {
      throw new Error('business_type不能为空')
    }

    // 支持外部传入的事务
    const transaction = options.transaction || null

    // 幂等性检查 - 如果提供了business_id
    const existingTransaction = await MaterialTransaction.findOne({
      where: {
        user_id,
        asset_code,
        business_id: options.business_id
      }
    })

    if (existingTransaction) {
      console.log(
        `⚠️ 幂等性检查: business_id=${options.business_id}已处理，返回原结果`
      )
      return {
        success: true,
        tx_id: existingTransaction.tx_id,
        transaction: existingTransaction,
        old_balance: existingTransaction.balance_before,
        new_balance: existingTransaction.balance_after,
        amount_added: amount,
        is_duplicate: true // 标记为重复请求
      }
    }

    // 在事务中查询余额，确保读取到最新数据
    const balance = await this.getOrCreateBalance(user_id, asset_code, {
      transaction
    })
    const oldBalance = parseFloat(balance.balance)
    const newBalance = oldBalance + amount

    // 更新余额（支持事务）
    await balance.update(
      {
        balance: newBalance
      },
      { transaction }
    )

    // 创建交易记录
    const materialTransaction = await MaterialTransaction.create(
      {
        user_id,
        asset_code,
        tx_type: 'earn',
        amount,
        balance_before: oldBalance,
        balance_after: newBalance,
        business_type: options.business_type,
        business_id: options.business_id,
        title: options.title || '增加材料',
        meta: options.meta || null
      },
      { transaction }
    )

    console.log(
      `✅ 增加材料: user_id=${user_id}, asset_code=${asset_code}, amount=${amount}, old_balance=${oldBalance}, new_balance=${newBalance}`
    )

    return {
      success: true,
      tx_id: materialTransaction.tx_id,
      transaction: materialTransaction,
      old_balance: oldBalance,
      new_balance: newBalance,
      amount_added: amount,
      is_duplicate: false
    }
  }

  /**
   * 消费材料
   * @param {number} user_id - 用户ID
   * @param {string} asset_code - 资产代码
   * @param {number} amount - 消费数量（必须大于0）
   * @param {Object} options - 交易选项
   * @param {Transaction} options.transaction - 外部事务对象（可选）
   * @param {string} options.business_id - 业务唯一ID（必填，用于幂等性控制）
   * @param {string} options.business_type - 业务类型（必填）
   * @param {string} options.title - 交易标题（可选）
   * @param {Object} options.meta - 元数据（可选）
   * @returns {Object} 交易结果
   */
  static async consume (user_id, asset_code, amount, options = {}) {
    if (amount <= 0) {
      throw new Error('材料数量必须大于0')
    }

    if (!options.business_id) {
      throw new Error('business_id不能为空')
    }

    if (!options.business_type) {
      throw new Error('business_type不能为空')
    }

    // 支持外部传入的事务
    const transaction = options.transaction || null

    // 幂等性检查 - 如果提供了business_id
    const existingTransaction = await MaterialTransaction.findOne({
      where: {
        user_id,
        asset_code,
        business_id: options.business_id
      }
    })

    if (existingTransaction) {
      console.log(
        `⚠️ 幂等性检查: business_id=${options.business_id}已处理，返回原结果`
      )
      return {
        success: true,
        tx_id: existingTransaction.tx_id,
        transaction: existingTransaction,
        old_balance: existingTransaction.balance_before,
        new_balance: existingTransaction.balance_after,
        amount_consumed: amount,
        is_duplicate: true // 标记为重复请求
      }
    }

    // 在事务中查询余额，确保读取到最新数据（使用悲观锁）
    const balance = await this.getOrCreateBalance(user_id, asset_code, {
      transaction
    })
    const oldBalance = parseFloat(balance.balance)

    // 验证余额是否充足
    if (oldBalance < amount) {
      throw new Error(
        `材料余额不足: asset_code=${asset_code}, required=${amount}, available=${oldBalance}`
      )
    }

    const newBalance = oldBalance - amount

    // 更新余额（支持事务）
    await balance.update(
      {
        balance: newBalance
      },
      { transaction }
    )

    // 创建交易记录
    const materialTransaction = await MaterialTransaction.create(
      {
        user_id,
        asset_code,
        tx_type: 'consume',
        amount,
        balance_before: oldBalance,
        balance_after: newBalance,
        business_type: options.business_type,
        business_id: options.business_id,
        title: options.title || '消费材料',
        meta: options.meta || null
      },
      { transaction }
    )

    console.log(
      `✅ 消费材料: user_id=${user_id}, asset_code=${asset_code}, amount=${amount}, old_balance=${oldBalance}, new_balance=${newBalance}`
    )

    return {
      success: true,
      tx_id: materialTransaction.tx_id,
      transaction: materialTransaction,
      old_balance: oldBalance,
      new_balance: newBalance,
      amount_consumed: amount,
      is_duplicate: false
    }
  }

  /**
   * 按规则转换材料
   * @param {number} user_id - 用户ID
   * @param {number} rule_id - 转换规则ID
   * @param {number} times - 转换次数（默认1次）
   * @param {Object} options - 交易选项
   * @param {Transaction} options.transaction - 外部事务对象（可选）
   * @param {string} options.business_id - 业务唯一ID（必填，用于幂等性控制）
   * @param {string} options.business_type - 业务类型（默认'material_convert'）
   * @param {string} options.title - 交易标题（可选）
   * @returns {Object} 转换结果
   */
  static async convertByRule (user_id, rule_id, times = 1, options = {}) {
    if (times <= 0) {
      throw new Error('转换次数必须大于0')
    }

    if (!options.business_id) {
      throw new Error('business_id不能为空')
    }

    const transaction = options.transaction || null

    // 幂等性检查 - 检查是否已经转换过
    const existingOut = await MaterialTransaction.findOne({
      where: {
        user_id,
        business_id: options.business_id,
        tx_type: 'convert_out'
      }
    })

    if (existingOut) {
      // 查询对应的convert_in记录
      const existingIn = await MaterialTransaction.findOne({
        where: {
          user_id,
          business_id: options.business_id,
          tx_type: 'convert_in'
        }
      })

      console.log(
        `⚠️ 幂等性检查: business_id=${options.business_id}已处理，返回原结果`
      )
      return {
        success: true,
        from_tx_id: existingOut.tx_id,
        to_tx_id: existingIn ? existingIn.tx_id : null,
        from_asset_code: existingOut.asset_code,
        to_asset_code: existingIn ? existingIn.asset_code : null,
        from_amount: existingOut.amount,
        to_amount: existingIn ? existingIn.amount : 0,
        is_duplicate: true
      }
    }

    // 查询转换规则（加锁）
    const rule = await MaterialConversionRule.findByPk(rule_id, {
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined
    })

    if (!rule) {
      throw new Error(`转换规则不存在：rule_id=${rule_id}`)
    }

    if (!rule.is_enabled) {
      throw new Error(`转换规则已禁用：rule_id=${rule_id}`)
    }

    // 验证规则是否生效（effective_at <= now）
    const now = BeijingTimeHelper.createBeijingTime()
    if (rule.effective_at > now) {
      throw new Error(
        `转换规则尚未生效：rule_id=${rule_id}, effective_at=${rule.effective_at}`
      )
    }

    // 计算转换数量
    const fromAmount = rule.from_amount * times
    const toAmount = rule.to_amount * times

    // 扣减源材料
    const fromResult = await this.consume(
      user_id,
      rule.from_asset_code,
      fromAmount,
      {
        transaction,
        business_id: options.business_id,
        business_type: 'material_convert',
        title: options.title || `材料转换扣减：${rule.from_asset_code}`,
        meta: {
          rule_id: rule.rule_id,
          from_amount: rule.from_amount,
          to_amount: rule.to_amount,
          times,
          effective_at: rule.effective_at
        }
      }
    )

    // 更新交易类型为convert_out
    await MaterialTransaction.update(
      { tx_type: 'convert_out' },
      {
        where: { tx_id: fromResult.tx_id },
        transaction
      }
    )

    // 增加目标材料（使用不同的business_id）
    const toBusinessId = `${options.business_id}_in`
    const toResult = await this.add(
      user_id,
      rule.to_asset_code,
      toAmount,
      {
        transaction,
        business_id: toBusinessId,
        business_type: 'material_convert',
        title: options.title || `材料转换收入：${rule.to_asset_code}`,
        meta: {
          rule_id: rule.rule_id,
          from_amount: rule.from_amount,
          to_amount: rule.to_amount,
          times,
          effective_at: rule.effective_at
        }
      }
    )

    // 更新交易类型为convert_in
    await MaterialTransaction.update(
      { tx_type: 'convert_in' },
      {
        where: { tx_id: toResult.tx_id },
        transaction
      }
    )

    console.log(
      `✅ 材料转换: user_id=${user_id}, rule_id=${rule_id}, ${rule.from_asset_code}(${fromAmount}) -> ${rule.to_asset_code}(${toAmount})`
    )

    return {
      success: true,
      from_tx_id: fromResult.tx_id,
      to_tx_id: toResult.tx_id,
      from_asset_code: rule.from_asset_code,
      to_asset_code: rule.to_asset_code,
      from_amount: fromAmount,
      to_amount: toAmount,
      from_balance: fromResult.new_balance,
      to_balance: toResult.new_balance,
      is_duplicate: false
    }
  }

  /**
   * 碎红水晶分解为钻石
   * 注意：这个方法只负责扣减材料部分，增加钻石部分由DiamondService完成
   * @param {number} user_id - 用户ID
   * @param {number} red_shard_amount - 碎红水晶数量
   * @param {Object} options - 交易选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @param {string} options.business_id - 业务唯一ID（必填）
   * @returns {Object} 扣减结果
   */
  static async convertToDiamond (user_id, red_shard_amount, options = {}) {
    if (red_shard_amount <= 0) {
      throw new Error('碎红水晶数量必须大于0')
    }

    if (!options.transaction) {
      throw new Error('必须在事务中调用convertToDiamond')
    }

    if (!options.business_id) {
      throw new Error('business_id不能为空')
    }

    const transaction = options.transaction

    // 只允许碎红水晶分解为钻石
    const assetCode = 'red_shard'

    // 扣减碎红水晶
    const result = await this.consume(user_id, assetCode, red_shard_amount, {
      transaction,
      business_id: options.business_id,
      business_type: 'material_convert',
      title: '碎红水晶分解为钻石',
      meta: {
        red_shard_amount,
        diamond_amount: red_shard_amount * 20 // 1碎红水晶 = 20钻石
      }
    })

    console.log(
      `✅ 碎红水晶分解为钻石: user_id=${user_id}, red_shard_amount=${red_shard_amount}, diamond_amount=${red_shard_amount * 20}`
    )

    return result
  }

  /**
   * 获取转换规则列表
   * @param {Object} filters - 筛选条件
   * @param {string} filters.from_asset_code - 源资产代码（可选）
   * @param {string} filters.to_asset_code - 目标资产代码（可选）
   * @param {boolean} filters.is_enabled - 是否启用（默认true）
   * @returns {Array} 转换规则列表
   */
  static async getConversionRules (filters = {}) {
    const whereClause = {}

    if (filters.from_asset_code) {
      whereClause.from_asset_code = filters.from_asset_code
    }

    if (filters.to_asset_code) {
      whereClause.to_asset_code = filters.to_asset_code
    }

    if (filters.is_enabled !== false) {
      whereClause.is_enabled = true
    }

    // 只返回已生效的规则
    whereClause.effective_at = { [Op.lte]: BeijingTimeHelper.createBeijingTime() }

    const rules = await MaterialConversionRule.findAll({
      where: whereClause,
      include: [
        {
          model: MaterialAssetType,
          as: 'from_asset',
          attributes: ['asset_code', 'display_name', 'group_code', 'tier']
        },
        {
          model: MaterialAssetType,
          as: 'to_asset',
          attributes: ['asset_code', 'display_name', 'group_code', 'tier']
        }
      ],
      order: [['effective_at', 'DESC']]
    })

    return rules
  }

  /**
   * 获取用户材料流水
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项参数
   * @param {string} options.asset_code - 资产代码（可选）
   * @param {string} options.tx_type - 交易类型（可选）
   * @param {string} options.business_type - 业务类型（可选）
   * @param {number} options.limit - 查询数量限制（默认100）
   * @param {number} options.offset - 查询偏移量（默认0）
   * @returns {Object} 包含流水列表和总数的对象
   */
  static async getUserTransactions (user_id, options = {}) {
    const whereClause = { user_id }

    if (options.asset_code) {
      whereClause.asset_code = options.asset_code
    }

    if (options.tx_type) {
      whereClause.tx_type = options.tx_type
    }

    if (options.business_type) {
      whereClause.business_type = options.business_type
    }

    const limit = options.limit || 100
    const offset = options.offset || 0

    const { count, rows } = await MaterialTransaction.findAndCountAll({
      where: whereClause,
      attributes: MATERIAL_ATTRIBUTES.transactionView,
      include: [
        {
          model: MaterialAssetType,
          as: 'asset_type',
          attributes: ['asset_code', 'display_name', 'group_code']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    })

    return {
      total: count,
      transactions: rows,
      limit,
      offset
    }
  }

  /**
   * 管理员调整材料余额
   * @param {number} user_id - 用户ID
   * @param {string} asset_code - 资产代码
   * @param {number} delta - 调整数量（可正可负）
   * @param {Object} options - 交易选项
   * @param {string} options.business_id - 业务唯一ID（必填）
   * @param {string} options.title - 交易标题（必填）
   * @param {Object} options.meta - 元数据（可选）
   * @param {number} options.operator_id - 操作员ID（可选）
   * @param {Transaction} options.transaction - 外部事务对象（可选）
   * @returns {Object} 调整结果
   */
  static async adminAdjust (user_id, asset_code, delta, options = {}) {
    if (delta === 0) {
      throw new Error('调整数量不能为0')
    }

    if (!options.business_id) {
      throw new Error('business_id不能为空')
    }

    if (!options.title) {
      throw new Error('title不能为空')
    }

    const transaction = options.transaction || null

    // 如果是正数，调用add；如果是负数，调用consume
    if (delta > 0) {
      return await this.add(user_id, asset_code, delta, {
        transaction,
        business_id: options.business_id,
        business_type: 'admin_adjust',
        title: options.title,
        meta: {
          ...options.meta,
          operator_id: options.operator_id,
          adjust_type: 'increase'
        }
      })
    } else {
      return await this.consume(user_id, asset_code, Math.abs(delta), {
        transaction,
        business_id: options.business_id,
        business_type: 'admin_adjust',
        title: options.title,
        meta: {
          ...options.meta,
          operator_id: options.operator_id,
          adjust_type: 'decrease'
        }
      })
    }
  }

  /**
   * 查询材料资产类型列表（管理员）
   * @param {Object} filters - 筛选条件
   * @param {number} filters.is_enabled - 可选，是否启用（1=启用，0=禁用，不传=全部）
   * @param {string} filters.group_code - 可选，材料组代码（如：red、orange、purple）
   * @returns {Array} 资产类型列表
   */
  static async getAssetTypes (filters = {}) {
    const whereClause = {}

    // 如果明确指定is_enabled，则按条件筛选
    if (filters.is_enabled !== undefined) {
      whereClause.is_enabled = filters.is_enabled
    }

    if (filters.group_code) {
      whereClause.group_code = filters.group_code
    }

    const assetTypes = await MaterialAssetType.findAll({
      where: whereClause,
      order: [
        ['tier', 'ASC'],
        ['sort_order', 'ASC'],
        ['asset_code', 'ASC']
      ]
    })

    return assetTypes
  }

  /**
   * 创建材料资产类型（管理员）
   * @param {Object} data - 资产类型数据
   * @param {string} data.asset_code - 资产代码（如：purple_shard）
   * @param {string} data.display_name - 展示名称（如：紫碎片）
   * @param {string} data.group_code - 材料组代码（如：purple）
   * @param {string} data.form - 形态（shard/crystal）
   * @param {number} data.tier - 层级（红=1、橙=2、紫=3等）
   * @param {number} data.visible_value_points - 可见价值
   * @param {number} data.budget_value_points - 预算价值
   * @param {number} data.sort_order - 排序顺序（默认0）
   * @param {number} data.created_by - 创建人ID
   * @returns {Object} 创建的资产类型
   */
  static async createAssetType (data) {
    // 验证asset_code唯一性
    const existing = await MaterialAssetType.findOne({
      where: { asset_code: data.asset_code }
    })

    if (existing) {
      throw new Error(`资产代码已存在：${data.asset_code}`)
    }

    // 创建资产类型
    const assetType = await MaterialAssetType.create({
      asset_code: data.asset_code,
      display_name: data.display_name,
      group_code: data.group_code,
      form: data.form,
      tier: data.tier,
      visible_value_points: data.visible_value_points,
      budget_value_points: data.budget_value_points,
      sort_order: data.sort_order || 0,
      is_enabled: 1 // 默认启用
    })

    console.log(
      `✅ 创建材料资产类型: asset_code=${data.asset_code}, display_name=${data.display_name}, tier=${data.tier}`
    )

    return assetType
  }

  /**
   * 更新材料资产类型（管理员）
   * @param {string} asset_code - 资产代码
   * @param {Object} updates - 更新数据
   * @param {string} updates.display_name - 可选，展示名称
   * @param {number} updates.visible_value_points - 可选，可见价值
   * @param {number} updates.budget_value_points - 可选，预算价值
   * @param {number} updates.sort_order - 可选，排序顺序
   * @param {number} updates.is_enabled - 可选，是否启用（0/1）
   * @param {number} admin_id - 操作员ID
   * @returns {Object} 更新后的资产类型
   */
  static async updateAssetType (asset_code, updates, admin_id) {
    // 查询资产类型
    const assetType = await MaterialAssetType.findOne({
      where: { asset_code }
    })

    if (!assetType) {
      throw new Error(`资产类型不存在：${asset_code}`)
    }

    // 只允许更新特定字段
    const allowedFields = [
      'display_name',
      'visible_value_points',
      'budget_value_points',
      'sort_order',
      'is_enabled'
    ]

    const updateData = {}
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('没有可更新的字段')
    }

    // 更新资产类型
    await assetType.update(updateData)

    console.log(
      `✅ 更新材料资产类型: asset_code=${asset_code}, admin_id=${admin_id}, fields=${Object.keys(updateData).join(', ')}`
    )

    return assetType
  }

  /**
   * 创建材料转换规则（管理员，含风控校验）
   * @param {Object} data - 规则数据
   * @param {string} data.from_asset_code - 源资产代码
   * @param {string} data.to_asset_code - 目标资产代码
   * @param {number} data.from_amount - 源材料数量
   * @param {number} data.to_amount - 目标材料数量
   * @param {Date} data.effective_at - 生效时间
   * @param {string} data.description - 规则描述（可选）
   * @param {number} data.created_by - 创建人ID
   * @returns {Object} 创建结果（包含规则和风控校验结果）
   */
  static async createConversionRule (data) {
    // 验证源和目标资产是否存在
    const fromAsset = await MaterialAssetType.findOne({
      where: { asset_code: data.from_asset_code, is_enabled: true }
    })

    if (!fromAsset) {
      throw new Error(`源资产不存在或已禁用：${data.from_asset_code}`)
    }

    const toAsset = await MaterialAssetType.findOne({
      where: { asset_code: data.to_asset_code, is_enabled: true }
    })

    if (!toAsset) {
      throw new Error(`目标资产不存在或已禁用：${data.to_asset_code}`)
    }

    // 防止自己转换自己
    if (data.from_asset_code === data.to_asset_code) {
      throw new Error('不允许创建自己转换自己的规则')
    }

    // 创建规则前执行风控校验
    const validationResult = await this._validateConversionRuleForArbitrage(
      data.from_asset_code,
      data.to_asset_code,
      data.from_amount,
      data.to_amount
    )

    if (!validationResult.is_safe) {
      throw new Error(
        `风控校验失败：${validationResult.reason}。检测到的套利路径：${validationResult.cycle_path || '无'}`
      )
    }

    // 创建转换规则
    const rule = await MaterialConversionRule.create({
      from_asset_code: data.from_asset_code,
      to_asset_code: data.to_asset_code,
      from_amount: data.from_amount,
      to_amount: data.to_amount,
      effective_at: data.effective_at,
      description: data.description || '',
      is_enabled: 1 // 默认启用
    })

    console.log(
      `✅ 创建材料转换规则: rule_id=${rule.rule_id}, ${data.from_asset_code}(${data.from_amount}) -> ${data.to_asset_code}(${data.to_amount})`
    )

    return {
      rule,
      validation: validationResult
    }
  }

  /**
   * 更新材料转换规则（管理员）
   * @param {number} rule_id - 规则ID
   * @param {Object} updates - 更新数据
   * @param {string} updates.description - 可选，规则描述
   * @param {number} updates.is_enabled - 可选，是否启用（0/1）
   * @param {number} admin_id - 操作员ID
   * @returns {Object} 更新后的规则
   */
  static async updateConversionRule (rule_id, updates, admin_id) {
    // 查询规则
    const rule = await MaterialConversionRule.findByPk(rule_id)

    if (!rule) {
      throw new Error(`转换规则不存在：rule_id=${rule_id}`)
    }

    // 只允许更新特定字段
    const allowedFields = ['description', 'is_enabled']

    const updateData = {}
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('没有可更新的字段')
    }

    // 如果要启用规则，执行风控校验
    if (updateData.is_enabled === 1 && rule.is_enabled === 0) {
      const validationResult = await this._validateConversionRuleForArbitrage(
        rule.from_asset_code,
        rule.to_asset_code,
        rule.from_amount,
        rule.to_amount
      )

      if (!validationResult.is_safe) {
        throw new Error(
          `风控校验失败：${validationResult.reason}。检测到的套利路径：${validationResult.cycle_path || '无'}`
        )
      }
    }

    // 更新规则
    await rule.update(updateData)

    console.log(
      `✅ 更新材料转换规则: rule_id=${rule_id}, admin_id=${admin_id}, fields=${Object.keys(updateData).join(', ')}`
    )

    return rule
  }

  /**
   * 查询材料流水（管理员，支持多维度筛选）
   * @param {Object} filters - 筛选条件
   * @param {number} filters.user_id - 可选，用户ID
   * @param {string} filters.asset_code - 可选，资产代码
   * @param {string} filters.tx_type - 可选，交易类型
   * @param {string} filters.business_type - 可选，业务类型
   * @param {string} filters.business_id - 可选，业务ID（精确匹配）
   * @param {string} filters.start_date - 可选，开始日期（YYYY-MM-DD）
   * @param {string} filters.end_date - 可选，结束日期（YYYY-MM-DD）
   * @param {number} filters.page - 页码（默认1）
   * @param {number} filters.page_size - 每页数量（默认20，最大100）
   * @returns {Object} 包含流水列表和分页信息
   */
  static async getTransactions (filters = {}) {
    const whereClause = {}

    if (filters.user_id) {
      whereClause.user_id = filters.user_id
    }

    if (filters.asset_code) {
      whereClause.asset_code = filters.asset_code
    }

    if (filters.tx_type) {
      whereClause.tx_type = filters.tx_type
    }

    if (filters.business_type) {
      whereClause.business_type = filters.business_type
    }

    if (filters.business_id) {
      whereClause.business_id = filters.business_id
    }

    // 日期范围筛选
    if (filters.start_date || filters.end_date) {
      whereClause.created_at = {}
      if (filters.start_date) {
        whereClause.created_at[Op.gte] = new Date(`${filters.start_date} 00:00:00`)
      }
      if (filters.end_date) {
        whereClause.created_at[Op.lte] = new Date(`${filters.end_date} 23:59:59`)
      }
    }

    const page = Math.max(parseInt(filters.page) || 1, 1)
    const page_size = Math.min(Math.max(parseInt(filters.page_size) || 20, 1), 100)
    const offset = (page - 1) * page_size

    const { count, rows } = await MaterialTransaction.findAndCountAll({
      where: whereClause,
      attributes: MATERIAL_ATTRIBUTES.transactionView,
      include: [
        {
          model: MaterialAssetType,
          as: 'asset_type',
          attributes: ['asset_code', 'display_name', 'group_code']
        }
      ],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset
    })

    return {
      transactions: rows,
      pagination: {
        total: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }
  }

  /**
   * 风控校验：检测转换规则是否会导致套利（使用Bellman-Ford算法检测负环）
   * @private
   * @param {string} from_asset_code - 源资产代码
   * @param {string} to_asset_code - 目标资产代码
   * @param {number} from_amount - 源材料数量
   * @param {number} to_amount - 目标材料数量
   * @returns {Object} 校验结果
   */
  static async _validateConversionRuleForArbitrage (
    from_asset_code,
    to_asset_code,
    from_amount,
    to_amount
  ) {
    // 获取所有已启用的转换规则
    const allRules = await MaterialConversionRule.findAll({
      where: { is_enabled: true }
    })

    // 构建图（加入当前要创建的规则）
    const graph = {}
    const allAssets = new Set()

    // 添加现有规则到图
    for (const rule of allRules) {
      if (!graph[rule.from_asset_code]) {
        graph[rule.from_asset_code] = []
      }
      /*
       * 转换率 = to_amount / from_amount
       * 使用负对数来检测负环：-log(rate)
       */
      const rate = rule.to_amount / rule.from_amount
      const weight = -Math.log(rate)
      graph[rule.from_asset_code].push({
        to: rule.to_asset_code,
        weight,
        rate
      })
      allAssets.add(rule.from_asset_code)
      allAssets.add(rule.to_asset_code)
    }

    // 添加待创建的规则到图
    if (!graph[from_asset_code]) {
      graph[from_asset_code] = []
    }
    const newRate = to_amount / from_amount
    const newWeight = -Math.log(newRate)
    graph[from_asset_code].push({
      to: to_asset_code,
      weight: newWeight,
      rate: newRate
    })
    allAssets.add(from_asset_code)
    allAssets.add(to_asset_code)

    // 使用Bellman-Ford算法检测负环
    const assets = Array.from(allAssets)
    const distances = {}
    const predecessors = {}

    // 初始化距离
    for (const asset of assets) {
      distances[asset] = Infinity
      predecessors[asset] = null
    }
    distances[from_asset_code] = 0

    // 松弛所有边 |V|-1 次
    for (let i = 0; i < assets.length - 1; i++) {
      for (const fromAsset of assets) {
        if (graph[fromAsset]) {
          for (const edge of graph[fromAsset]) {
            const newDist = distances[fromAsset] + edge.weight
            if (newDist < distances[edge.to]) {
              distances[edge.to] = newDist
              predecessors[edge.to] = fromAsset
            }
          }
        }
      }
    }

    // 检测负环
    for (const fromAsset of assets) {
      if (graph[fromAsset]) {
        for (const edge of graph[fromAsset]) {
          if (distances[fromAsset] + edge.weight < distances[edge.to]) {
            // 发现负环，找出环路径
            const cycle = this._findCyclePath(predecessors, edge.to, fromAsset)
            return {
              is_safe: false,
              reason: '检测到套利环路（负环）',
              cycle_path: cycle.join(' -> ')
            }
          }
        }
      }
    }

    return {
      is_safe: true,
      reason: '风控校验通过，无套利风险'
    }
  }

  /**
   * 查找环路径
   * @private
   * @param {Object} predecessors - 前驱节点映射
   * @param {string} start - 起始节点
   * @param {string} current - 当前节点
   * @returns {Array} 环路径
   */
  static _findCyclePath (predecessors, start, current) {
    const path = [current]
    const visited = new Set([current])

    let node = predecessors[current]
    while (node && !visited.has(node)) {
      path.unshift(node)
      visited.add(node)
      node = predecessors[node]
    }

    if (node) {
      path.unshift(node)
    }

    return path
  }
}

module.exports = MaterialService
