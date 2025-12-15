/**
 * 餐厅积分抽奖系统 V4.5.0材料系统架构 - 钻石服务（DiamondService）
 *
 * 业务场景：管理用户钻石的完整生命周期，包括钻石获取、消费、管理员调整等所有钻石相关业务
 *
 * 核心功能：
 * 1. 钻石账户管理（自动创建、获取、查询）
 * 2. 钻石获取业务（材料分解、活动赠送、管理员调整）
 * 3. 钻石消费业务（交易市场消耗、特殊功能解锁）
 * 4. 交易记录审计（完整的交易历史、支持幂等性控制、防重复提交）
 * 5. 钻石统计查询（余额查询、交易明细）
 *
 * 业务流程：
 *
 * 1. **材料分解获得钻石流程**（跨Service事务保护）
 *    - 用户将碎红水晶分解为钻石 → MaterialService扣减材料
 *    - DiamondService增加钻石 → 同一事务完成
 *    - 比例：1碎红水晶 = 20钻石
 *
 * 2. **交易市场消费流程**（事务保护）
 *    - 用户在交易市场购买商品 → consume()扣除钻石（原子操作）
 *    - 创建交易订单 → 钻石扣减完成
 *
 * 3. **管理员调整流程**（带审计）
 *    - 管理员调整用户钻石余额 → adminAdjust()
 *    - 记录操作员ID和原因 → 写入审计日志
 *
 * 设计原则：
 * - **数据模型统一**：只使用V4.5.0钻石系统（UserDiamondAccount + DiamondTransaction）
 * - **事务安全保障**：所有钻石操作支持外部事务传入，确保原子性
 * - **幂等性控制**：通过business_id防止重复提交，保证业务幂等性
 * - **审计完整性**：每笔交易都有完整记录（before/after余额、业务关联、操作时间）
 * - **与材料系统协作**：支持跨Service事务，确保材料分解钻石的强一致性
 *
 * 关键方法列表：
 * - getOrCreateAccount() - 获取/创建钻石账户（自动创建不存在的账户）
 * - getUserAccount() - 获取用户钻石账户（不自动创建）
 * - add() - 增加钻石（支持事务、幂等性）
 * - consume() - 消费钻石（支持事务、幂等性、余额验证）
 * - adminAdjust() - 管理员调整钻石余额（支持正负调整）
 * - getUserTransactions() - 查询用户交易历史（支持分页、筛选）
 *
 * 数据模型关联：
 * - UserDiamondAccount：用户钻石账户表（核心数据：balance）
 * - DiamondTransaction：钻石交易记录表（审计日志：每笔交易的before/after余额）
 *
 * 幂等性保证：
 * - 通过business_id（业务唯一标识）防止重复提交
 * - 同一business_id的操作只会执行一次，重复请求返回原结果
 * - 适用场景：材料分解、交易消费、管理员调整等
 *
 * 事务支持：
 * - 所有方法支持外部事务传入（options.transaction参数）
 * - 事务内使用悲观锁（FOR UPDATE）防止并发问题
 * - 典型场景：材料分解钻石、交易市场消费等需要多表操作的业务
 *
 * 使用示例：
 * ```javascript
 * // 示例1：材料分解获得钻石（与MaterialService协作）
 * const DiamondService = require('./services/DiamondService')
 * const MaterialService = require('./services/MaterialService')
 * const transaction = await sequelize.transaction()
 * try {
 *   // 扣减碎红水晶
 *   await MaterialService.consume(1, 'red_shard', 10, {
 *     transaction,
 *     business_id: `convert_to_diamond_${Date.now()}`,
 *     business_type: 'material_convert',
 *     title: '碎红水晶分解为钻石'
 *   })
 *   // 增加钻石（1碎红水晶 = 20钻石）
 *   await DiamondService.add(1, 200, {
 *     transaction,
 *     business_id: `convert_to_diamond_${Date.now()}_diamond`,
 *     business_type: 'material_convert',
 *     title: '碎红水晶分解为钻石'
 *   })
 *   await transaction.commit()
 * } catch (error) {
 *   await transaction.rollback()
 * }
 *
 * // 示例2：交易市场消费钻石
 * const result = await DiamondService.consume(1, 5000, {
 *   business_id: `trade_market_${order_id}`,
 *   business_type: 'trade_market',
 *   title: '交易市场购买商品',
 *   transaction
 * })
 *
 * // 示例3：管理员调整钻石余额
 * const result = await DiamondService.adminAdjust(1, 1000, {
 *   business_id: `admin_adjust_${Date.now()}`,
 *   title: '活动补偿',
 *   operator_id: 2
 * })
 * ```
 *
 * 创建时间：2025年12月15日
 * 最后更新：2025年12月15日
 * 使用模型：Claude Sonnet 4.5
 */

const { UserDiamondAccount, DiamondTransaction, User } = require('../models')

/**
 * 🎯 统一数据输出视图常量（Data Output View Constants）
 *
 * 业务场景（Business Scenario）：
 * - 统一管理钻石领域的数据输出字段，避免字段选择分散在各方法
 * - 符合架构规范：与积分领域的 POINTS_ATTRIBUTES 模式保持一致
 * - 根据权限级别（用户/管理员）返回不同的数据字段，保护敏感信息
 *
 * 设计原则（Design Principles）：
 * - userView：用户视图 - 用户查询自己的钻石账户时返回的字段
 * - adminView：管理员视图 - 管理员查询用户钻石账户时返回的字段（包含所有字段）
 * - transactionView：交易视图 - 查询钻石交易记录时返回的字段（标准交易信息）
 *
 * 使用示例（Usage Example）：
 * ```javascript
 * // 用户查询自己的钻石账户
 * const account = await UserDiamondAccount.findOne({
 *   where: { user_id: userId },
 *   attributes: DIAMOND_ATTRIBUTES.userView
 * })
 *
 * // 管理员查询用户钻石账户
 * const account = await UserDiamondAccount.findOne({
 *   where: { user_id: userId },
 *   attributes: DIAMOND_ATTRIBUTES.adminView
 * })
 *
 * // 查询交易记录
 * const transactions = await DiamondTransaction.findAll({
 *   where: { user_id: userId },
 *   attributes: DIAMOND_ATTRIBUTES.transactionView
 * })
 * ```
 */
const DIAMOND_ATTRIBUTES = {
  /**
   * 用户视图（User View）
   * 用户查询自己的钻石账户时返回的字段
   */
  userView: [
    'account_id', // 账户ID（Account ID）
    'user_id', // 用户ID（User ID）
    'balance', // 钻石余额（Balance）
    'created_at' // 创建时间（Created At）
  ],

  /**
   * 管理员视图（Admin View）
   * 管理员查询用户钻石账户时返回的字段
   * 包含所有字段，用于后台管理和数据分析
   */
  adminView: [
    'account_id', // 账户ID（Account ID）
    'user_id', // 用户ID（User ID）
    'balance', // 钻石余额（Balance）
    'created_at', // 创建时间（Created At）
    'updated_at' // 更新时间（Updated At）
  ],

  /**
   * 交易视图（Transaction View）
   * 查询钻石交易记录时返回的字段
   * 包含交易核心信息，用于历史记录展示和数据分析
   */
  transactionView: [
    'tx_id', // 交易ID（Transaction ID）
    'user_id', // 用户ID（User ID）
    'tx_type', // 交易类型：earn/consume/admin_adjust（Transaction Type）
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
 * 钻石服务类
 * 职责：管理用户钻石的增减、查询等核心业务逻辑
 * 设计模式：服务层模式 + 事务管理模式
 */
class DiamondService {
  /**
   * 获取或创建用户钻石账户
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项参数
   * @param {Transaction} options.transaction - 事务对象（可选，用于在事务中查询最新数据）
   * @returns {Object} 钻石账户信息
   */
  static async getOrCreateAccount (user_id, options = {}) {
    const transaction = options.transaction || null

    // 查询账户（如果在事务中，使用悲观锁）
    let account = await UserDiamondAccount.findOne({
      where: { user_id },
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined
    })

    // 如果账户不存在，自动创建
    if (!account) {
      // 验证用户是否存在
      const user = await User.findByPk(user_id, { transaction })
      if (!user) {
        throw new Error(`用户不存在：user_id=${user_id}`)
      }

      // 创建钻石账户
      account = await UserDiamondAccount.create(
        {
          user_id,
          balance: 0
        },
        { transaction }
      )

      console.log(`✅ 自动创建钻石账户: user_id=${user_id}, balance=0`)
    }

    return account
  }

  /**
   * 获取用户钻石账户（不自动创建）
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项参数
   * @param {Transaction} options.transaction - 事务对象（可选）
   * @returns {Object|null} 钻石账户信息，不存在返回null
   */
  static async getUserAccount (user_id, options = {}) {
    const transaction = options.transaction || null

    const account = await UserDiamondAccount.findOne({
      where: { user_id },
      transaction
    })

    return account
  }

  /**
   * 增加钻石
   * @param {number} user_id - 用户ID
   * @param {number} amount - 增加数量（必须大于0）
   * @param {Object} options - 交易选项
   * @param {Transaction} options.transaction - 外部事务对象（可选）
   * @param {string} options.business_id - 业务唯一ID（必填，用于幂等性控制）
   * @param {string} options.business_type - 业务类型（必填）
   * @param {string} options.title - 交易标题（可选）
   * @param {Object} options.meta - 元数据（可选）
   * @returns {Object} 交易结果
   */
  static async add (user_id, amount, options = {}) {
    if (amount <= 0) {
      throw new Error('钻石数量必须大于0')
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
    const existingTransaction = await DiamondTransaction.findOne({
      where: {
        user_id,
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

    // 在事务中查询账户，确保读取到最新数据
    const account = await this.getOrCreateAccount(user_id, { transaction })
    const oldBalance = parseFloat(account.balance)
    const newBalance = oldBalance + amount

    // 更新余额（支持事务）
    await account.update(
      {
        balance: newBalance
      },
      { transaction }
    )

    // 创建交易记录
    const diamondTransaction = await DiamondTransaction.create(
      {
        user_id,
        tx_type: 'earn',
        amount,
        balance_before: oldBalance,
        balance_after: newBalance,
        business_type: options.business_type,
        business_id: options.business_id,
        title: options.title || '增加钻石',
        meta: options.meta || null
      },
      { transaction }
    )

    console.log(
      `✅ 增加钻石: user_id=${user_id}, amount=${amount}, old_balance=${oldBalance}, new_balance=${newBalance}`
    )

    return {
      success: true,
      tx_id: diamondTransaction.tx_id,
      transaction: diamondTransaction,
      old_balance: oldBalance,
      new_balance: newBalance,
      amount_added: amount,
      is_duplicate: false
    }
  }

  /**
   * 消费钻石
   * @param {number} user_id - 用户ID
   * @param {number} amount - 消费数量（必须大于0）
   * @param {Object} options - 交易选项
   * @param {Transaction} options.transaction - 外部事务对象（可选）
   * @param {string} options.business_id - 业务唯一ID（必填，用于幂等性控制）
   * @param {string} options.business_type - 业务类型（必填）
   * @param {string} options.title - 交易标题（可选）
   * @param {Object} options.meta - 元数据（可选）
   * @returns {Object} 交易结果
   */
  static async consume (user_id, amount, options = {}) {
    if (amount <= 0) {
      throw new Error('钻石数量必须大于0')
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
    const existingTransaction = await DiamondTransaction.findOne({
      where: {
        user_id,
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

    // 在事务中查询账户，确保读取到最新数据（使用悲观锁）
    const account = await this.getOrCreateAccount(user_id, { transaction })
    const oldBalance = parseFloat(account.balance)

    // 验证余额是否充足
    if (oldBalance < amount) {
      throw new Error(
        `钻石余额不足: required=${amount}, available=${oldBalance}`
      )
    }

    const newBalance = oldBalance - amount

    // 更新余额（支持事务）
    await account.update(
      {
        balance: newBalance
      },
      { transaction }
    )

    // 创建交易记录
    const diamondTransaction = await DiamondTransaction.create(
      {
        user_id,
        tx_type: 'consume',
        amount,
        balance_before: oldBalance,
        balance_after: newBalance,
        business_type: options.business_type,
        business_id: options.business_id,
        title: options.title || '消费钻石',
        meta: options.meta || null
      },
      { transaction }
    )

    console.log(
      `✅ 消费钻石: user_id=${user_id}, amount=${amount}, old_balance=${oldBalance}, new_balance=${newBalance}`
    )

    return {
      success: true,
      tx_id: diamondTransaction.tx_id,
      transaction: diamondTransaction,
      old_balance: oldBalance,
      new_balance: newBalance,
      amount_consumed: amount,
      is_duplicate: false
    }
  }

  /**
   * 管理员调整钻石余额
   * @param {number} user_id - 用户ID
   * @param {number} delta - 调整数量（可正可负）
   * @param {Object} options - 交易选项
   * @param {string} options.business_id - 业务唯一ID（必填）
   * @param {string} options.title - 交易标题（必填）
   * @param {Object} options.meta - 元数据（可选）
   * @param {number} options.operator_id - 操作员ID（可选）
   * @param {Transaction} options.transaction - 外部事务对象（可选）
   * @returns {Object} 调整结果
   */
  static async adminAdjust (user_id, delta, options = {}) {
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
      const result = await this.add(user_id, delta, {
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

      // 更新交易类型为admin_adjust
      await DiamondTransaction.update(
        { tx_type: 'admin_adjust' },
        {
          where: { tx_id: result.tx_id },
          transaction
        }
      )

      return result
    } else {
      const result = await this.consume(user_id, Math.abs(delta), {
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

      // 更新交易类型为admin_adjust
      await DiamondTransaction.update(
        { tx_type: 'admin_adjust' },
        {
          where: { tx_id: result.tx_id },
          transaction
        }
      )

      return result
    }
  }

  /**
   * 获取用户钻石流水
   * @param {number} user_id - 用户ID
   * @param {Object} options - 选项参数
   * @param {string} options.tx_type - 交易类型（可选）
   * @param {string} options.business_type - 业务类型（可选）
   * @param {number} options.limit - 查询数量限制（默认100）
   * @param {number} options.offset - 查询偏移量（默认0）
   * @returns {Object} 包含流水列表和总数的对象
   */
  static async getUserTransactions (user_id, options = {}) {
    const whereClause = { user_id }

    if (options.tx_type) {
      whereClause.tx_type = options.tx_type
    }

    if (options.business_type) {
      whereClause.business_type = options.business_type
    }

    const limit = options.limit || 100
    const offset = options.offset || 0

    const { count, rows } = await DiamondTransaction.findAndCountAll({
      where: whereClause,
      attributes: DIAMOND_ATTRIBUTES.transactionView,
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
   * 查询钻石流水（管理员，支持多维度筛选）
   * @param {Object} filters - 筛选条件
   * @param {number} filters.user_id - 可选，用户ID
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
    const { Op } = require('sequelize')
    const whereClause = {}

    if (filters.user_id) {
      whereClause.user_id = filters.user_id
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

    const { count, rows } = await DiamondTransaction.findAndCountAll({
      where: whereClause,
      attributes: DIAMOND_ATTRIBUTES.transactionView,
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
}

module.exports = DiamondService
