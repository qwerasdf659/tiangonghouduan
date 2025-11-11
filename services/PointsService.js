/**
 * 餐厅积分抽奖系统 V4.0统一引擎架构 - 积分服务（PointsService）
 *
 * 业务场景：管理用户积分的完整生命周期，包括积分获取、消费、冻结、退回等所有积分相关业务
 *
 * 核心功能：
 * 1. 积分账户管理（自动创建、获取、冻结、激活）
 * 2. 积分增加业务（消费奖励、活动赠送、管理员调整、系统补偿）
 * 3. 积分消费业务（商品兑换、抽奖消费、特权解锁）
 * 4. 积分审核机制（pending状态积分冻结、审核通过发放、审核拒绝退回）
 * 5. 交易记录审计（完整的交易历史、支持幂等性控制、防重复提交）
 * 6. 积分统计查询（余额查询、历史统计、交易明细）
 *
 * 业务流程：
 *
 * 1. **消费奖励流程**（带审核机制）
 *    - 商家提交消费记录 → createPendingPointsForConsumption()创建pending积分（冻结状态）
 *    - 管理员审核通过 → approveConsumption()更新账户余额，积分到账
 *    - 管理员审核拒绝 → rejectConsumption()取消交易，积分不发放
 *
 * 2. **兑换消费流程**（事务保护）
 *    - 用户选择商品兑换 → consumePoints()扣除积分（原子操作）
 *    - 审核通过创建库存 → 兑换完成
 *    - 审核拒绝退回积分 → refundPoints()退还积分（幂等保护）
 *
 * 3. **抽奖消费流程**（事务保护）
 *    - 用户参与抽奖 → consumePoints()扣除积分（统一事务）
 *    - 抽奖结果确定 → 中奖或未中奖（积分已消费不退回）
 *
 * 设计原则：
 * - **数据模型统一**：只使用V4新积分系统（UserPointsAccount + PointsTransaction），彻底废弃旧系统
 * - **事务安全保障**：所有积分操作支持外部事务传入，确保原子性
 * - **幂等性控制**：通过business_id防止重复提交，保证业务幂等性
 * - **审计完整性**：每笔交易都有完整记录（before/after余额、业务关联、操作时间）
 * - **状态管理严格**：pending（冻结）→ completed（完成）→ cancelled/refunded（取消/退回）状态流转清晰
 * - **历史兼容性**：同步更新User.history_total_points字段，用于臻选空间解锁判断
 *
 * 关键方法列表：
 * - getUserPointsAccount() - 获取/创建积分账户（自动创建不存在的账户）
 * - addPoints() - 增加积分（支持事务、幂等性）
 * - consumePoints() - 消费积分（支持事务、幂等性、余额验证）
 * - refundPoints() - 退回积分（用于订单取消、审核拒绝）
 * - createPendingPointsForConsumption() - 创建pending积分（消费奖励审核前冻结）
 * - approveConsumption() - 审核通过发放积分（pending → completed）
 * - rejectConsumption() - 审核拒绝取消积分（pending → cancelled）
 * - getUserTransactions() - 查询用户交易历史（支持分页、筛选）
 * - getUserStatistics() - 获取用户积分统计（总获得、总消费、余额）
 *
 * 数据模型关联：
 * - UserPointsAccount：用户积分账户表（核心数据：available_points、total_earned、total_consumed）
 * - PointsTransaction：积分交易记录表（审计日志：每笔交易的before/after余额）
 * - User.history_total_points：历史总积分（用于臻选空间解锁判断）
 *
 * 幂等性保证：
 * - 通过business_id（业务唯一标识）防止重复提交
 * - 同一business_id的操作只会执行一次，重复请求返回原结果
 * - 适用场景：消费奖励、兑换扣分、退款操作等
 *
 * 事务支持：
 * - 所有方法支持外部事务传入（options.transaction参数）
 * - 事务内使用悲观锁（FOR UPDATE）防止并发问题
 * - 典型场景：兑换、抽奖等需要多表操作的业务
 *
 * 使用示例：
 * ```javascript
 * // 示例1：消费奖励流程（带审核）
 * // 步骤1：商家提交消费记录，创建pending积分
 * const pendingTx = await PointsService.createPendingPointsForConsumption({
 *   user_id: 1,
 *   points: 100,
 *   reference_type: 'consumption',
 *   reference_id: 12345,
 *   business_type: 'consumption_reward',
 *   transaction_title: '消费奖励100分（待审核）'
 * });
 *
 * // 步骤2：管理员审核通过，积分到账
 * const approveResult = await PointsService.approveConsumption(
 *   12345, // consumption_record_id
 *   2     // auditor_id
 * );
 *
 * // 示例2：兑换商品扣除积分（带事务保护）
 * const transaction = await sequelize.transaction();
 * try {
 *   // 扣除积分
 *   const consumeResult = await PointsService.consumePoints(1, 500, {
 *     transaction,
 *     business_id: `exchange_${exchangeId}`,
 *     business_type: 'exchange',
 *     title: '兑换商品消耗500分'
 *   });
 *
 *   // 创建兑换订单...
 *   await transaction.commit();
 * } catch (error) {
 *   await transaction.rollback();
 * }
 *
 * // 示例3：审核拒绝退回积分（幂等保护）
 * const refundResult = await PointsService.refundPoints(1, 500, {
 *   business_id: `refund_exchange_${exchangeId}`,
 *   business_type: 'exchange_refund',
 *   title: '兑换审核拒绝退回500分'
 * });
 * ```
 *
 * 创建时间：2025年09月28日
 * 最后更新：2025年10月30日
 * 使用模型：Claude Sonnet 4.5
 */

const BeijingTimeHelper = require('../utils/timeHelper')
const { UserPointsAccount, PointsTransaction, User } = require('../models')
const { Sequelize, Transaction, Op } = require('sequelize')

/**
 * 积分服务类
 * 职责：管理用户积分的增减、查询、冻结解冻等核心业务逻辑
 * 设计模式：服务层模式 + 事务管理模式
 */
class PointsService {
  /**
   * 获取用户积分账户
   * @param {number} user_id - 用户ID
   * @param {Object} transaction - 事务对象（可选，用于在事务中查询最新数据）
   * @returns {Object} 积分账户信息
   */
  static async getUserPointsAccount (user_id, transaction = null) {
    let account = await UserPointsAccount.findOne({
      where: { user_id, is_active: true },
      transaction, // ✅ 修复Bug：支持事务查询，确保读取事务中的最新数据
      lock: transaction ? transaction.LOCK.UPDATE : undefined // ✅ 在事务中使用悲观锁，防止并发问题
    })

    // 如果账户不存在，自动创建
    if (!account) {
      account = await this.createPointsAccount(user_id, transaction)
    }

    return account
  }

  /**
   * 创建积分账户
   * @param {number} user_id - 用户ID
   * @param {Object} _transaction - 事务对象（可选）
   * @returns {Object} 新创建的积分账户
   */
  static async createPointsAccount (user_id, _transaction = null) {
    // 获取用户的历史积分作为初始值
    const user = await User.findByPk(user_id, { transaction: _transaction })
    if (!user) {
      throw new Error('用户不存在')
    }

    const initialPoints = user.history_total_points || 0

    const account = await UserPointsAccount.create(
      {
        user_id,
        available_points: initialPoints,
        total_earned: initialPoints,
        total_consumed: 0,
        is_active: true
      },
      { transaction: _transaction }
    )

    // 如果有初始积分，创建迁移记录
    if (initialPoints > 0) {
      await PointsTransaction.create(
        {
          user_id,
          account_id: account.account_id,
          transaction_type: 'earn',
          points_amount: initialPoints,
          points_balance_before: 0,
          points_balance_after: initialPoints,
          business_type: 'system_migration',
          source_type: 'system',
          transaction_title: '积分系统迁移',
          transaction_description: '从旧积分系统迁移历史积分',
          transaction_time: BeijingTimeHelper.createBeijingTime(),
          status: 'completed'
        },
        { transaction: _transaction }
      )
    }

    return account
  }

  /**
   * 增加积分
   * @param {number} user_id - 用户ID
   * @param {number} points - 积分数量
   * @param {Object} options - 交易选项
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @param {string} options.business_id - 业务唯一ID（可选，用于幂等性控制）
   * @param {string} options.business_type - 业务类型
   * @param {string} options.source_type - 来源类型
   * @param {string} options.reference_type - 关联业务类型（如consumption、lottery_draw，可选）
   * @param {number} options.reference_id - 关联业务ID（如consumption_records.record_id，可选）
   * @param {string} options.title - 交易标题
   * @param {string} options.description - 交易描述
   * @param {number} options.operator_id - 操作员ID
   * @returns {Object} 交易结果
   */
  static async addPoints (user_id, points, options = {}) {
    if (points <= 0) {
      throw new Error('积分数量必须大于0')
    }

    // 🔥 支持外部传入的事务
    const transaction = options.transaction || null

    // ✅ 幂等性检查（解决问题7）- 如果提供了business_id
    if (options.business_id) {
      const existingTransaction = await PointsTransaction.findOne({
        where: {
          user_id,
          business_type: options.business_type,
          business_id: options.business_id,
          status: 'completed'
        }
      })

      if (existingTransaction) {
        console.log(`⚠️ 幂等性检查: business_id=${options.business_id}已处理，返回原结果`)
        return {
          success: true,
          transaction_id: existingTransaction.transaction_id,
          transaction: existingTransaction,
          old_balance: existingTransaction.points_balance_before,
          new_balance: existingTransaction.points_balance_after,
          points_added: points,
          total_earned: existingTransaction.points_balance_after,
          is_duplicate: true // ✅ 标记为重复请求
        }
      }
    }

    // ✅ 修复Bug：在事务中查询账户，确保读取到最新数据（已扣除积分后的余额）
    const account = await this.getUserPointsAccount(user_id, transaction)
    const oldBalance = parseFloat(account.available_points)
    const newBalance = oldBalance + points
    const newTotalEarned = account.total_earned + points

    // 更新积分账户（支持事务）
    await account.update(
      {
        available_points: newBalance,
        total_earned: newTotalEarned,
        last_earn_time: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )

    // 同步更新用户表的history_total_points（支持事务）
    await User.update({ history_total_points: newTotalEarned }, { where: { user_id }, transaction })

    // 创建交易记录（支持事务）
    const pointsTransaction = await PointsTransaction.create(
      {
        user_id,
        account_id: account.account_id,
        transaction_type: 'earn',
        points_amount: points,
        points_balance_before: oldBalance,
        points_balance_after: newBalance,
        business_type: options.business_type || 'manual',
        source_type: options.source_type || 'system',
        business_id: options.business_id || null, // ✅ 保存业务ID
        reference_type: options.reference_type || null, // ✅ 关联业务类型（支持消费记录关联）
        reference_id: options.reference_id || null, // ✅ 关联业务ID（支持消费记录关联）
        transaction_title: options.title || '积分获得',
        transaction_description: options.description || '',
        operator_id: options.operator_id || null,
        transaction_time: BeijingTimeHelper.createBeijingTime(),
        status: 'completed'
      },
      { transaction }
    )

    return {
      success: true,
      transaction_id: pointsTransaction.transaction_id,
      transaction: pointsTransaction,
      old_balance: oldBalance,
      new_balance: newBalance,
      points_added: points,
      total_earned: newTotalEarned,
      is_duplicate: false
    }
  }

  /**
   * 为消费记录创建pending状态的积分交易记录（积分冻结）
   *
   * 💡 核心逻辑：商家提交消费记录时，创建pending状态的积分交易记录
   * 重要特性：
   * 1. 不更新用户积分账户余额（积分冻结中）
   * 2. points_balance_before = points_balance_after（余额不变）
   * 3. status='pending'（等待审核）
   * 4. 审核通过后，由approveConsumption方法更新为completed并发放积分
   *
   * @param {Object} data - 积分交易数据
   * @param {number} data.user_id - 用户ID
   * @param {number} data.points - 冻结积分数量
   * @param {string} data.reference_type - 关联类型（'consumption'）
   * @param {number} data.reference_id - 关联消费记录ID
   * @param {string} data.business_type - 业务类型（'consumption_reward'）
   * @param {string} data.transaction_title - 交易标题
   * @param {string} data.transaction_description - 交易描述
   * @returns {Object} 创建的积分交易记录
   */
  /**
   * 创建pending积分交易（消费奖励审核前冻结）
   *
   * 业务场景（Business Scenario）：
   * - 商家扫码录入消费记录时，创建pending状态的积分交易记录
   * - 用户可以看到"冻结积分"，但不计入可用余额
   * - 审核通过后，由ConsumptionService.approveConsumption()方法激活积分
   *
   * 技术特点（Technical Features）：
   * - 不更新用户积分账户余额（points_balance_before = points_balance_after）
   * - status='pending'（冻结状态，等待审核）
   * - 支持事务传递（transaction参数，确保数据一致性）
   *
   * @param {Object} data - 交易数据
   * @param {number} data.user_id - 用户ID（必填，User ID - Required）
   * @param {number} data.points - 积分数量（必填，大于0，Points Amount - Required, Must > 0）
   * @param {number} data.reference_id - 关联记录ID，如consumption_record_id（必填，Reference ID - Required）
   * @param {string} data.reference_type - 关联类型，如'consumption'（可选，默认'consumption'，Reference Type - Optional）
   * @param {string} data.business_type - 业务类型，如'consumption_reward'（可选，Business Type - Optional）
   * @param {string} data.transaction_title - 交易标题（可选，Transaction Title - Optional）
   * @param {string} data.transaction_description - 交易描述（可选，Transaction Description - Optional）
   * @param {Object} transaction - Sequelize事务对象（必填，用于事务保护，Sequelize Transaction Object - Required for Transaction Protection）
   * @returns {Object} pending积分交易记录（Pending Points Transaction Record）
   */
  static async createPendingPointsForConsumption (data, transaction) {
    try {
      // 1. 验证必填参数
      if (!data.user_id || !data.points || !data.reference_id) {
        throw new Error('用户ID、积分数量和关联记录ID不能为空')
      }

      if (data.points <= 0) {
        throw new Error('积分数量必须大于0')
      }

      // 2. 获取用户积分账户（读取当前余额）- 在事务中查询
      const account = await this.getUserPointsAccount(data.user_id, transaction)
      const currentBalance = parseFloat(account.available_points)

      /*
       * 3. 创建pending状态的积分交易记录（在事务中创建）
       * ⭐ 关键：余额before和after相同（不更新余额），status='pending'（冻结状态）
       */
      const pointsTransaction = await PointsTransaction.create(
        {
          user_id: data.user_id,
          account_id: account.account_id,
          transaction_type: 'earn', // 收入类型（但pending状态，暂不到账）
          points_amount: data.points,
          points_balance_before: currentBalance, // 当前余额
          points_balance_after: currentBalance, // 余额不变（积分冻结中）
          business_type: data.business_type || 'consumption_reward',
          source_type: 'merchant_submit',
          reference_type: data.reference_type || 'consumption',
          reference_id: data.reference_id,
          transaction_title: data.transaction_title || '消费奖励（待审核）',
          transaction_description: data.transaction_description || '',
          operator_id: null, // 无操作员（系统自动创建）
          transaction_time: BeijingTimeHelper.createBeijingTime(),
          status: 'pending' // ⭐ 核心状态：pending=积分冻结中
        },
        { transaction }
      ) // ✅ 在事务中创建

      console.log(
        `✅ 创建pending积分交易: transaction_id=${pointsTransaction.transaction_id}, user_id=${data.user_id}, points=${data.points}分, status=pending`
      )

      return pointsTransaction
    } catch (error) {
      console.error('❌ 创建pending积分交易失败:', error.message)
      throw error
    }
  }

  /**
   * 激活pending状态的积分交易（审核通过时调用）
   * 业务场景：消费记录审核通过时，将pending状态的冻结积分激活为completed
   *
   * @param {number} transaction_id - pending积分交易ID
   * @param {Object} options - 选项参数
   * @param {Transaction} options.transaction - Sequelize事务对象（必需）
   * @param {number} options.operator_id - 操作员ID（审核员）
   * @param {string} options.activation_notes - 激活备注（可选）
   * @returns {Object} 激活结果
   */
  static async activatePendingPoints (transaction_id, options = {}) {
    const { transaction, operator_id, activation_notes } = options

    if (!transaction) {
      throw new Error('必须在事务中调用activatePendingPoints')
    }

    try {
      // Step 1: 查询pending交易（加锁防止并发）
      const pendingTx = await PointsTransaction.findByPk(transaction_id, {
        transaction,
        lock: transaction.LOCK.UPDATE
      })

      if (!pendingTx) {
        throw new Error(`积分交易不存在（ID: ${transaction_id}）`)
      }

      // Step 2: 验证状态
      if (pendingTx.status !== 'pending') {
        throw new Error(`积分交易状态不是pending（当前: ${pendingTx.status}）`)
      }

      if (pendingTx.transaction_type !== 'earn') {
        throw new Error(`只能激活earn类型的pending交易（当前: ${pendingTx.transaction_type}）`)
      }

      // Step 3: 更新交易状态为completed
      await pendingTx.update(
        {
          status: 'completed',
          transaction_time: BeijingTimeHelper.createDatabaseTime(), // 更新为实际到账时间
          operator_id,
          transaction_description: activation_notes || pendingTx.transaction_description,
          updated_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      // Step 4: 更新用户积分账户余额
      const pointsAmount = parseFloat(pendingTx.points_amount)

      // 4.1 查询并锁定积分账户
      const account = await UserPointsAccount.findOne({
        where: { user_id: pendingTx.user_id },
        transaction,
        lock: transaction.LOCK.UPDATE
      })

      if (!account) {
        throw new Error(`用户积分账户不存在（user_id: ${pendingTx.user_id}）`)
      }

      // 4.2 更新积分账户余额
      const newAvailablePoints = parseFloat(account.available_points) + pointsAmount
      const newTotalEarned = parseFloat(account.total_earned) + pointsAmount

      await account.update(
        {
          available_points: newAvailablePoints,
          total_earned: newTotalEarned,
          updated_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      // 4.3 更新积分交易记录的余额after字段（补充实际到账后的余额）
      await pendingTx.update(
        {
          points_balance_after: newAvailablePoints
        },
        { transaction }
      )

      // Step 5: 同步更新User.history_total_points字段（用于臻选空间解锁判断）
      const User = require('../models').User
      await User.increment(
        { history_total_points: pointsAmount },
        {
          where: { user_id: pendingTx.user_id },
          transaction
        }
      )

      console.log(
        `✅ Pending积分已激活: transaction_id=${transaction_id}, user_id=${pendingTx.user_id}, points=${pointsAmount}`
      )

      return {
        transaction: pendingTx,
        new_balance: newAvailablePoints,
        points_activated: pointsAmount
      }
    } catch (error) {
      console.error(`❌ 激活pending积分失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 消费积分
   * @param {number} user_id - 用户ID
   * @param {number} points - 积分数量
   * @param {Object} options - 交易选项
   * @param {Object} options.transaction - 外部事务对象（可选）
   * @param {string} options.business_id - 业务唯一ID（强烈建议，用于幂等性控制）
   * @param {string} options.business_type - 业务类型
   * @param {string} options.source_type - 来源类型
   * @param {string} options.title - 交易标题
   * @param {string} options.description - 交易描述
   * @param {number} options.operator_id - 操作员ID
   * @returns {Object} 交易结果
   */
  static async consumePoints (user_id, points, options = {}) {
    if (points <= 0) {
      throw new Error('积分数量必须大于0')
    }

    // 🔥 支持外部传入的事务
    const transaction = options.transaction || null

    // ✅ 幂等性检查（解决问题7）- 如果提供了business_id
    if (options.business_id) {
      const existingTransaction = await PointsTransaction.findOne({
        where: {
          user_id,
          business_type: options.business_type,
          business_id: options.business_id,
          status: 'completed'
        }
      })

      if (existingTransaction) {
        console.log(`⚠️ 幂等性检查: business_id=${options.business_id}已处理，跳过重复消费`)
        return {
          success: true,
          transaction_id: existingTransaction.transaction_id,
          old_balance: existingTransaction.points_balance_before,
          new_balance: existingTransaction.points_balance_after,
          points_consumed: points,
          total_consumed: existingTransaction.points_balance_after,
          is_duplicate: true // ✅ 标记为重复请求
        }
      }
    }

    // 🔥 在事务中查询账户，确保获取最新数据（FOR UPDATE锁）
    const account = await UserPointsAccount.findOne({
      where: { user_id, is_active: true },
      transaction, // ✅ 传入事务参数，确保在事务中读取最新数据
      lock: transaction ? Transaction.LOCK.UPDATE : undefined // 🔒 行级锁，防止并发更新
    })

    if (!account) {
      throw new Error('用户积分账户不存在或已冻结')
    }

    const oldBalance = parseFloat(account.available_points)

    if (oldBalance < points) {
      throw new Error('积分余额不足')
    }

    const newBalance = oldBalance - points
    const newTotalConsumed = account.total_consumed + points

    // 更新积分账户（支持事务）
    await account.update(
      {
        available_points: newBalance,
        total_consumed: newTotalConsumed,
        last_consume_time: BeijingTimeHelper.createBeijingTime()
      },
      { transaction }
    )

    // 创建交易记录（支持事务）
    const pointsTransaction = await PointsTransaction.create(
      {
        user_id,
        account_id: account.account_id,
        transaction_type: 'consume',
        points_amount: points, // ✅ 统一存储正数，由transaction_type区分类型
        points_balance_before: oldBalance,
        points_balance_after: newBalance,
        business_type: options.business_type || 'manual',
        source_type: options.source_type || 'system',
        business_id: options.business_id || null, // ✅ 保存业务ID
        reference_type: options.reference_type || null, // ✅ 关联类型（如market_product）
        reference_id: options.reference_id || null, // ✅ 关联ID（如product_id）
        transaction_title: options.title || '积分消费',
        transaction_description: options.description || '',
        operator_id: options.operator_id || null,
        transaction_time: BeijingTimeHelper.createBeijingTime(),
        status: 'completed'
      },
      { transaction }
    )

    return {
      success: true,
      transaction_id: pointsTransaction.transaction_id,
      old_balance: oldBalance,
      new_balance: newBalance,
      points_consumed: points,
      total_consumed: newTotalConsumed,
      is_duplicate: false
    }
  }

  /**
   * 获取积分余额
   * @param {number} user_id - 用户ID
   * @returns {Object} 积分余额信息
   */
  static async getPointsBalance (user_id) {
    const account = await this.getUserPointsAccount(user_id)

    return {
      user_id,
      available_points: parseFloat(account.available_points),
      total_earned: parseFloat(account.total_earned),
      total_consumed: parseFloat(account.total_consumed),
      account_status: account.is_active ? 'active' : 'inactive',
      last_earn_time: account.last_earn_time,
      last_consume_time: account.last_consume_time,
      created_at: account.created_at // 统一使用snake_case命名
    }
  }

  /**
   * 获取积分交易历史
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 交易历史
   */
  static async getPointsHistory (user_id, options = {}) {
    const {
      page = 1,
      limit = 20,
      transaction_type = null,
      start_date = null,
      end_date = null
    } = options

    const whereClause = { user_id }

    if (transaction_type) {
      whereClause.transaction_type = transaction_type
    }

    if (start_date && end_date) {
      whereClause.transaction_time = {
        [Sequelize.Op.between]: [start_date, end_date]
      }
    }

    const offset = (page - 1) * limit

    const { count, rows: transactions } = await PointsTransaction.findAndCountAll({
      where: whereClause,
      order: [['transaction_time', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    })

    return {
      transactions: transactions.map(t => ({
        transaction_id: t.transaction_id,
        transaction_type: t.transaction_type,
        points_amount: parseFloat(t.points_amount),
        points_balance_before: parseFloat(t.points_balance_before),
        points_balance_after: parseFloat(t.points_balance_after),
        business_type: t.business_type,
        source_type: t.source_type,
        transaction_title: t.transaction_title,
        transaction_description: t.transaction_description,
        transaction_time: t.transaction_time,
        status: t.status
      })),
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / limit)
      }
    }
  }

  /**
   * 积分统计
   * @param {number} user_id - 用户ID
   * @returns {Object} 积分统计信息
   */
  static async getPointsStatistics (user_id) {
    const account = await this.getUserPointsAccount(user_id)

    // 获取最近30天的交易统计
    const thirtyDaysAgo = BeijingTimeHelper.createBeijingTime()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentEarned =
      (await PointsTransaction.sum('points_amount', {
        where: {
          user_id,
          transaction_type: 'earn',
          transaction_time: {
            [Sequelize.Op.gte]: thirtyDaysAgo
          }
        }
      })) || 0

    const recentConsumed =
      (await PointsTransaction.sum('points_amount', {
        where: {
          user_id,
          transaction_type: 'consume',
          transaction_time: {
            [Sequelize.Op.gte]: thirtyDaysAgo
          }
        }
      })) || 0

    return {
      current_balance: parseFloat(account.available_points),
      total_earned: parseFloat(account.total_earned),
      total_consumed: parseFloat(account.total_consumed),
      recent_30_days: {
        earned: parseFloat(recentEarned),
        consumed: parseFloat(recentConsumed),
        net_change: parseFloat(recentEarned) - parseFloat(recentConsumed)
      },
      account_age_days: Math.floor(
        BeijingTimeHelper.timeDiff(account.created_at) / (1000 * 60 * 60 * 24)
      )
    }
  }

  /**
   * 检查用户是否有足够积分
   * @param {number} user_id - 用户ID
   * @param {number} requiredPoints - 需要的积分数量
   * @returns {boolean} 是否有足够积分
   */
  static async hasEnoughPoints (user_id, requiredPoints) {
    const account = await this.getUserPointsAccount(user_id)
    return parseFloat(account.available_points) >= requiredPoints
  }

  /**
   * 批量积分操作（事务安全）
   * @param {Array} operations - 操作列表
   * @returns {Object} 批量操作结果
   */
  static async batchPointsOperation (operations) {
    const { sequelize } = require('../models')
    const transaction = await sequelize.transaction()

    try {
      const results = []

      // eslint-disable-next-line no-await-in-loop
      for (const operation of operations) {
        // 统一使用snake_case命名规范
        const { type, user_id, points, options } = operation

        if (!user_id) {
          throw new Error('操作缺少用户ID参数(user_id)')
        }

        let result
        if (type === 'add') {
          // eslint-disable-next-line no-await-in-loop
          result = await this.addPoints(user_id, points, { ...options, transaction })
        } else if (type === 'consume') {
          // eslint-disable-next-line no-await-in-loop
          result = await this.consumePoints(user_id, points, { ...options, transaction })
        } else {
          throw new Error(`未知的操作类型: ${type}`)
        }

        results.push({
          operation,
          result,
          success: true
        })
      }

      await transaction.commit()

      return {
        success: true,
        results,
        total_operations: operations.length,
        successful_operations: results.length
      }
    } catch (error) {
      await transaction.rollback()
      throw new Error(`批量积分操作失败: ${error.message}`)
    }
  }

  /**
   * 兑换商品 - 新增前端需求功能
   * @param {number} user_id - 用户ID
   * @param {number} productId - 商品ID
   * @param {number} quantity - 兑换数量
   * @param {string} space - 空间类型（如：lucky）
   * @returns {Object} 兑换结果
   */
  static async exchangeProduct (user_id, productId, quantity = 1, space = 'lucky') {
    const { Product, ExchangeRecords } = require('../models') // ✅ UserInventory在审核通过后才需要
    const { sequelize, Sequelize } = require('../models')
    const transaction = await sequelize.transaction()

    try {
      // 1. ✅ 获取商品信息并加悲观锁（解决问题5：防止并发超卖）
      const product = await Product.findByPk(productId, {
        lock: transaction.LOCK.UPDATE, // ✅ 悲观锁：锁定该行直到事务结束
        transaction
      })

      if (!product) {
        throw new Error('商品不存在')
      }

      // 🆕 2. 获取对应空间的商品信息（方案2）
      const space_info = product.getSpaceInfo ? product.getSpaceInfo(space) : null
      if (!space_info) {
        throw new Error(`该商品在${space}空间不可用`)
      }

      if (!product.isAvailable()) {
        throw new Error('商品暂不可兑换')
      }

      // 🆕 3. 检查对应空间的库存（方案2）
      let current_stock
      if (space === 'premium' && product.space === 'both') {
        // 臻选空间：使用premium_stock（如果有独立库存）
        current_stock = product.premium_stock !== null ? product.premium_stock : product.stock
      } else {
        // 幸运空间或单一空间商品：使用stock
        current_stock = product.stock
      }

      if (current_stock < quantity) {
        throw new Error(`商品库存不足（当前库存：${current_stock}）`)
      }

      // 🆕 4. 计算所需积分（使用对应空间的积分）
      const totalPoints = space_info.exchange_points * quantity

      // 5. 消费积分
      await this.consumePoints(user_id, totalPoints, {
        business_type: 'exchange',
        source_type: 'product_exchange',
        title: `兑换商品：${product.name}（${space}空间）`,
        description: `兑换${quantity}个${product.name}（${space}空间）`,
        transaction
      })

      // 🆕 6. 原子性减少对应空间的库存（方案2）
      let update_fields
      let where_condition

      if (space === 'premium' && product.space === 'both' && product.premium_stock !== null) {
        // 臻选空间有独立库存：扣减premium_stock
        update_fields = {
          premium_stock: sequelize.literal(`premium_stock - ${quantity}`)
        }
        where_condition = {
          product_id: productId,
          premium_stock: { [Sequelize.Op.gte]: quantity }
        }
      } else {
        // 幸运空间或共享库存：扣减stock
        update_fields = {
          stock: sequelize.literal(`stock - ${quantity}`)
        }
        where_condition = {
          product_id: productId,
          stock: { [Sequelize.Op.gte]: quantity }
        }
      }

      const [affectedRows] = await Product.update(update_fields, {
        where: where_condition,
        transaction
      })

      // 7. ✅ 检查更新结果（如果受影响行数为0，说明库存不足或并发冲突）
      if (affectedRows === 0) {
        throw new Error('商品库存不足（并发冲突或库存已售罄）')
      }

      // 8. 生成兑换码
      const exchangeCode = this.generateExchangeCode()

      /*
       * 9. 创建兑换记录（✅ 严格人工审核模式：所有兑换都需要审核）
       * exchange_id 现在是INT AUTO_INCREMENT主键，不再手动赋值
       */
      const exchangeRecord = await ExchangeRecords.create(
        {
          user_id,
          product_id: productId,
          product_snapshot: {
            name: product.name,
            description: product.description,
            category: product.category,
            exchange_points: space_info.exchange_points, // 🆕 使用对应空间的积分
            space, // 🆕 记录兑换空间
            requires_audit: true // ✅ 所有商品都需要审核
          },
          quantity,
          total_points: totalPoints,
          exchange_code: exchangeCode,
          status: 'pending', // 等待审核
          space, // 🆕 记录兑换空间
          delivery_method: product.category === '优惠券' ? 'virtual' : 'physical',
          exchange_time: BeijingTimeHelper.createBeijingTime(),
          // ✅ 审核相关字段：所有兑换都需要人工审核
          requires_audit: true,
          audit_status: 'pending'
        },
        { transaction }
      )

      // 9.1 提交审核（不调用needsAudit，强制审核）
      console.log(`[兑换] 订单${exchangeRecord.exchange_id}已提交审核，等待管理员处理`)
      await transaction.commit()

      // 9.2 发送通知
      try {
        const NotificationService = require('../services/NotificationService')

        // 通知用户：申请已提交
        await NotificationService.notifyExchangePending(user_id, {
          exchange_id: exchangeRecord.exchange_id,
          product_name: product.name,
          quantity,
          total_points: totalPoints
        })

        // 通知管理员：有新订单待审核
        await NotificationService.notifyNewExchangeAudit({
          exchange_id: exchangeRecord.exchange_id,
          user_id,
          product_name: product.name,
          quantity,
          total_points: totalPoints,
          product_category: product.category
        })
      } catch (notifyError) {
        // 通知失败不影响兑换流程
        console.error('[兑换] 发送通知失败:', notifyError.message)
      }

      // 9.3 返回：需要审核，不立即发放库存
      return {
        success: true,
        needs_audit: true, // ✅ 标记需要审核
        exchange_id: exchangeRecord.exchange_id,
        exchange_code: exchangeCode,
        product_name: product.name,
        quantity,
        total_points: totalPoints,
        audit_status: 'pending',
        message: '兑换申请已提交，积分已扣除，请等待管理员审核',
        exchange_time: exchangeRecord.exchange_time
      }
    } catch (error) {
      await transaction.rollback()
      throw new Error(`商品兑换失败: ${error.message}`)
    }
  }

  /**
   * 获取用户兑换记录
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 兑换记录列表
   */
  static async getExchangeRecords (user_id, options = {}) {
    const { ExchangeRecords, Product } = require('../models')
    const { page = 1, limit = 20, status = null, space = null } = options

    /*
     * 构建查询条件
     * 注意：is_deleted: 0 过滤已由ExchangeRecords模型的defaultScope自动处理
     */
    const whereClause = {
      user_id
    }
    if (status) whereClause.status = status
    if (space) whereClause.space = space

    const offset = (page - 1) * limit

    const { count, rows } = await ExchangeRecords.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['product_id', 'name', 'category', 'image']
        }
      ],
      order: [['exchange_time', 'DESC']],
      limit: parseInt(limit),
      offset
    })

    return {
      records: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        total_pages: Math.ceil(count / limit)
      }
    }
  }

  /**
   * 获取用户积分信息（API响应格式）
   * @param {number} user_id - 用户ID
   * @returns {Object} 积分信息
   */
  static async getUserPoints (user_id) {
    const account = await this.getUserPointsAccount(user_id)
    return {
      available_points: parseFloat(account.available_points),
      total_earned: parseFloat(account.total_earned),
      total_consumed: parseFloat(account.total_consumed)
    }
  }

  /**
   * 获取用户积分交易记录
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @returns {Object} 交易记录列表
   */
  static async getUserTransactions (user_id, options = {}) {
    const { page = 1, limit = 20, type = null } = options
    // 🎯 服务层二次保护：最大100条记录（防止内部调用风险）
    const finalLimit = Math.min(parseInt(limit), 100)
    const offset = (page - 1) * finalLimit

    /*
     * 构建查询条件
     * 注意：is_deleted: 0 过滤已由PointsTransaction模型的defaultScope自动处理
     */
    const whereClause = {
      user_id
    }
    // 🛡️ 修复Bug：type为'all'时不应该作为筛选条件
    if (type && type !== 'all') {
      whereClause.transaction_type = type
    }

    const { count, rows } = await PointsTransaction.findAndCountAll({
      where: whereClause,
      order: [['transaction_time', 'DESC']],
      limit: finalLimit,
      offset
    })

    return {
      data: rows,
      total: count
    }
  }

  /**
   * 生成兑换码
   * @returns {string} 兑换码
   */
  static generateExchangeCode () {
    const timestamp = BeijingTimeHelper.timestamp().toString(36)
    const random = Math.random().toString(36).substr(2, 8)
    return `EXC${timestamp}${random}`.toUpperCase()
  }

  /**
   * 生成核销码
   * @returns {string} 核销码
   */
  static generateVerificationCode () {
    return Math.random().toString(36).substr(2, 8).toUpperCase()
  }

  /**
   * 获取用户积分概览（包含冻结积分）
   *
   * @param {number} user_id - 用户ID
   * @returns {Object} 积分概览信息
   *   - available_points: 可用积分（可正常使用）
   *   - frozen_points: 冻结积分（审核中，不可使用）
   *   - total_earned: 累计获得积分
   *   - total_consumed: 累计消耗积分
   *   - frozen_transactions: 冻结积分明细列表
   *
   * 业务说明：
   * 用户原有的可用积分不受冻结影响，仍可正常使用（抽奖、兑换等）
   * 新获得但尚未审核通过的积分处于"冻结"状态，暂时不可用
   * 审核通过后，冻结积分自动加入可用积分
   */
  static async getUserPointsOverview (user_id) {
    try {
      // 1. 获取用户积分账户（可用积分）
      const account = await this.getUserPointsAccount(user_id)

      /*
       * 2. 查询冻结中的积分交易记录（status='pending'）
       * 2. 查询冻结中的积分交易（只查询7天内的记录）
       * Query frozen points transactions (only records within 7 days)
       */

      // 🔧 计算7天前的时间（冻结积分过期时间：7天）
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const frozenTransactions = await PointsTransaction.findAll({
        where: {
          user_id,
          status: 'pending', // 只查询冻结状态
          business_type: 'consumption_reward', // 只查询消费奖励类型
          created_at: {
            [Op.gte]: sevenDaysAgo // ✅ 只查询7天内的记录（Only query records within 7 days）
          }
        },
        attributes: [
          'transaction_id',
          'points_amount',
          'reference_type',
          'reference_id',
          'created_at',
          'status'
        ],
        order: [['created_at', 'DESC']],
        limit: 20, // 最多显示20条冻结记录
        raw: true // 使用raw查询提高性能
      })

      // 3. 获取关联的消费记录ID列表
      const consumptionRecordIds = frozenTransactions
        .filter(t => t.reference_type === 'consumption' && t.reference_id)
        .map(t => t.reference_id)

      // 4. 批量查询消费记录详情
      const ConsumptionRecord = require('../models').ConsumptionRecord
      let consumptionRecordsMap = {}
      if (consumptionRecordIds.length > 0) {
        const consumptionRecords = await ConsumptionRecord.findAll({
          where: {
            record_id: consumptionRecordIds
          },
          attributes: ['record_id', 'consumption_amount', 'merchant_notes', 'created_at', 'status'],
          raw: true
        })
        // 建立Map以便快速查找
        consumptionRecordsMap = consumptionRecords.reduce((map, record) => {
          map[record.record_id] = record
          return map
        }, {})
      }

      // 5. 计算冻结积分总数
      const totalFrozen = frozenTransactions.reduce(
        (sum, t) => sum + parseFloat(t.points_amount),
        0
      )

      // 6. 返回完整的积分概览数据
      return {
        // === 核心数据 ===
        available_points: parseFloat(account.available_points), // 可用积分（可正常使用）
        frozen_points: totalFrozen, // 冻结积分（不可使用）

        // === 统计数据 ===
        total_earned: parseFloat(account.total_earned), // 累计获得积分
        total_consumed: parseFloat(account.total_consumed), // 累计消耗积分

        // === 冻结积分明细 ===
        frozen_transactions: frozenTransactions.map(t => {
          const consumptionRecord = consumptionRecordsMap[t.reference_id] || null

          // 🔧 动态计算预计到账时间（基于创建时间）- Dynamic ETA Calculation
          const hoursSinceCreation = Math.floor(
            (Date.now() - new Date(t.created_at).getTime()) / (1000 * 60 * 60)
          )
          let estimated_arrival
          if (hoursSinceCreation < 1) {
            estimated_arrival = '预计23小时内到账' // 刚提交不久（Just submitted）
          } else if (hoursSinceCreation < 24) {
            estimated_arrival = `预计${24 - hoursSinceCreation}小时内到账` // 24小时内（Within 24 hours）
          } else if (hoursSinceCreation < 48) {
            estimated_arrival = '审核中，请耐心等待' // 超过24小时但未超过48小时（Over 24h but under 48h）
          } else {
            estimated_arrival = '审核超时，建议联系管理员' // 超过48小时（Over 48 hours）
          }

          return {
            transaction_id: t.transaction_id,
            points_amount: parseFloat(t.points_amount), // 冻结积分数
            consumption_amount: consumptionRecord?.consumption_amount || 0, // 消费金额
            merchant_notes: consumptionRecord?.merchant_notes || '', // 商家备注
            created_at: BeijingTimeHelper.formatForAPI(t.created_at), // 创建时间
            status_text: '审核中', // 状态文本（前端显示）
            estimated_arrival // 🔧 动态预计到账时间（Dynamic ETA）
          }
        }),

        // === 提示信息 ===
        message:
          totalFrozen > 0
            ? `您有${totalFrozen}积分正在审核中，审核通过后将自动到账`
            : '当前无冻结积分'
      }
    } catch (error) {
      console.error('❌ 获取用户积分概览失败:', error.message)
      throw new Error(`获取用户积分概览失败: ${error.message}`)
    }
  }

  /**
   * 获取用户冻结积分明细
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @param {number} options.page - 页码（默认1）
   * @param {number} options.page_size - 每页数量（默认20）
   * @returns {Object} 冻结积分明细列表
   */
  static async getUserFrozenPoints (user_id, options = {}) {
    try {
      const page = Math.max(parseInt(options.page) || 1, 1)
      const pageSize = Math.min(parseInt(options.page_size) || 20, 50)
      const offset = (page - 1) * pageSize

      /**
       * ✅ 计算7天前的时间（冻结积分过期时间：7天）
       * Calculate 7 days ago (frozen points expiry time: 7 days)
       */
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      /**
       * 1. 查询冻结中的积分交易记录（只查询7天内的记录）
       * Query frozen points transactions (only records within 7 days)
       */
      const { count, rows: frozenTransactions } = await PointsTransaction.findAndCountAll({
        where: {
          user_id,
          status: 'pending',
          business_type: 'consumption_reward',
          created_at: {
            [Op.gte]: sevenDaysAgo // ✅ 只查询7天内的记录（Only query records within 7 days）
          }
        },
        attributes: [
          'transaction_id',
          'points_amount',
          'reference_type',
          'reference_id',
          'created_at', // 原始Date对象（用于时间计算）
          'status'
        ],
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset,
        raw: true // 返回普通对象（performance optimization）
      })

      // 2. 获取关联的消费记录ID列表
      const consumptionRecordIds = frozenTransactions
        .filter(t => t.reference_type === 'consumption' && t.reference_id)
        .map(t => t.reference_id)

      // 3. 批量查询消费记录详情
      const ConsumptionRecord = require('../models').ConsumptionRecord
      let consumptionRecordsMap = {}
      if (consumptionRecordIds.length > 0) {
        const consumptionRecords = await ConsumptionRecord.findAll({
          where: {
            record_id: consumptionRecordIds
          },
          attributes: [
            'record_id',
            'consumption_amount',
            'merchant_notes',
            'created_at',
            'status',
            'merchant_id'
          ],
          raw: true
        })
        // 建立Map以便快速查找
        consumptionRecordsMap = consumptionRecords.reduce((map, record) => {
          map[record.record_id] = record
          return map
        }, {})
      }

      // 4. 计算冻结积分总数
      const totalFrozen = frozenTransactions.reduce(
        (sum, t) => sum + parseFloat(t.points_amount),
        0
      )

      // 5. 返回分页数据和冻结积分明细
      return {
        // === 分页信息 ===
        total_count: count,
        current_page: page,
        page_size: pageSize,
        total_pages: Math.ceil(count / pageSize),

        // === 冻结积分总数 ===
        total_frozen_points: totalFrozen,

        // === 冻结积分明细列表 ===
        frozen_transactions: frozenTransactions.map(t => {
          const consumptionRecord = consumptionRecordsMap[t.reference_id] || null

          /*
           * 🔧 动态计算预计到账时间（基于创建时间）- Dynamic ETA Calculation
           * 注意：t.created_at是从数据库查询出来的原始Date对象或字符串（需在formatForAPI之前使用）
           */
          const createdTime =
            t.created_at instanceof Date ? t.created_at.getTime() : new Date(t.created_at).getTime()
          const hoursSinceCreation = Math.floor((Date.now() - createdTime) / (1000 * 60 * 60))

          let estimatedArrival
          if (hoursSinceCreation < 1) {
            estimatedArrival = '预计23小时内到账' // 刚提交不久（Just submitted）
          } else if (hoursSinceCreation < 24) {
            estimatedArrival = `预计${24 - hoursSinceCreation}小时内到账` // 24小时内（Within 24 hours）
          } else if (hoursSinceCreation < 48) {
            estimatedArrival = '审核中，请耐心等待' // 超过24小时但未超过48小时（Over 24h but under 48h）
          } else {
            estimatedArrival = '审核超时，建议联系管理员' // 超过48小时（Over 48 hours）
          }

          return {
            transaction_id: t.transaction_id,
            record_id: consumptionRecord?.record_id || null,
            points_amount: parseFloat(t.points_amount),
            consumption_amount: consumptionRecord?.consumption_amount || 0,
            merchant_notes: consumptionRecord?.merchant_notes || '',
            merchant_id: consumptionRecord?.merchant_id || null,
            status: t.status,
            status_text: '审核中',
            created_at: BeijingTimeHelper.formatForAPI(t.created_at), // 创建时间（格式化为API对象）
            estimated_arrival: estimatedArrival // 🔧 动态预计到账时间（Dynamic ETA）
          }
        })
      }
    } catch (error) {
      // 🔧 增强错误日志：记录完整错误堆栈和请求参数（Enhanced Error Logging）
      console.error('❌ 获取用户冻结积分明细失败:', {
        error_message: error.message,
        error_stack: error.stack, // 错误堆栈（Error Stack Trace）
        user_id,
        page: options.page,
        page_size: options.page_size,
        timestamp: new Date().toISOString()
      })
      throw new Error(`获取用户冻结积分明细失败: ${error.message}`)
    }
  }
}

module.exports = PointsService
