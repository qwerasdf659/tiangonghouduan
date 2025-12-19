const logger = require('../utils/logger').logger

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
const AuditLogService = require('./AuditLogService')

/**
 * 🎯 统一数据输出视图常量（Data Output View Constants）
 *
 * 业务场景（Business Scenario）：
 * - 统一管理积分领域的数据输出字段，避免字段选择分散在各方法
 * - 符合架构规范：与库存领域的 INVENTORY_ATTRIBUTES 模式保持一致
 * - 根据权限级别（用户/管理员）返回不同的数据字段，保护敏感信息
 *
 * 设计原则（Design Principles）：
 * - userView：用户视图 - 用户查询自己的积分账户时返回的字段（不包含敏感字段）
 * - adminView：管理员视图 - 管理员查询用户积分账户时返回的字段（包含所有字段）
 * - transactionView：交易视图 - 查询积分交易记录时返回的字段（标准交易信息）
 *
 * 使用示例（Usage Example）：
 * ```javascript
 * // 用户查询自己的积分账户
 * const account = await UserPointsAccount.findOne({
 *   where: { user_id: userId },
 *   attributes: POINTS_ATTRIBUTES.userView
 * });
 *
 * // 管理员查询用户积分账户
 * const account = await UserPointsAccount.findOne({
 *   where: { user_id: userId },
 *   attributes: POINTS_ATTRIBUTES.adminView
 * });
 *
 * // 查询交易记录
 * const transactions = await PointsTransaction.findAll({
 *   where: { user_id: userId },
 *   attributes: POINTS_ATTRIBUTES.transactionView
 * });
 * ```
 */
const POINTS_ATTRIBUTES = {
  /**
   * 用户视图（User View）
   * 用户查询自己的积分账户时返回的字段
   * 不包含敏感字段：frozen_points, budget_points, remaining_budget_points
   */
  userView: [
    'account_id', // 账户ID（Account ID）
    'user_id', // 用户ID（User ID）
    'available_points', // 可用积分（Available Points）
    'total_earned', // 累计获得积分（Total Earned Points）
    'total_consumed', // 累计消耗积分（Total Consumed Points）
    'freeze_reason', // 冻结原因（Freeze Reason - 用户有权知道账户被冻结的原因）
    'last_earn_time', // 最后获得时间（Last Earn Time）
    'last_consume_time', // 最后消费时间（Last Consume Time）
    'is_active', // 账户状态（Account Status）
    'created_at' // 创建时间（Created At）
  ],

  /**
   * 管理员视图（Admin View）
   * 管理员查询用户积分账户时返回的字段
   * 包含所有字段，用于后台管理和数据分析
   */
  adminView: [
    'account_id', // 账户ID（Account ID）
    'user_id', // 用户ID（User ID）
    'available_points', // 可用积分（Available Points）
    'total_earned', // 累计获得积分（Total Earned Points）
    'total_consumed', // 累计消耗积分（Total Consumed Points）
    'frozen_points', // 冻结积分（Frozen Points）
    'budget_points', // 预算积分（Budget Points）
    'remaining_budget_points', // 剩余预算积分（Remaining Budget Points）
    'freeze_reason', // 冻结原因（Freeze Reason）
    'last_earn_time', // 最后获得时间（Last Earn Time）
    'last_consume_time', // 最后消费时间（Last Consume Time）
    'is_active', // 账户状态（Account Status）
    'created_at', // 创建时间（Created At）
    'updated_at' // 更新时间（Updated At）
  ],

  /**
   * 交易视图（Transaction View）
   * 查询积分交易记录时返回的字段
   * 包含交易核心信息，用于历史记录展示和数据分析
   */
  transactionView: [
    'transaction_id', // 交易ID（Transaction ID）
    'transaction_type', // 交易类型：earn/consume（Transaction Type）
    'points_amount', // 积分数量（Points Amount）
    'points_balance_before', // 交易前余额（Balance Before Transaction）
    'points_balance_after', // 交易后余额（Balance After Transaction）
    'business_type', // 业务类型（Business Type）
    'transaction_title', // 交易标题（Transaction Title）
    'transaction_time', // 交易时间（Transaction Time）
    'status' // 状态：completed/pending/cancelled（Status）
  ]
}

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
  static async getUserPointsAccount(user_id, transaction = null) {
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
  static async createPointsAccount(user_id, _transaction = null) {
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
  static async addPoints(user_id, points, options = {}) {
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
        logger.info(`⚠️ 幂等性检查: business_id=${options.business_id}已处理，返回原结果`)
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

    // 📝 记录审计日志（异步，失败不影响业务）
    try {
      await AuditLogService.logPointsAdd({
        operator_id: options.operator_id || user_id,
        user_id,
        before_points: oldBalance,
        after_points: newBalance,
        points_amount: points,
        reason: options.title || options.description || '增加积分',
        business_id: options.business_id,
        transaction
      })
    } catch (auditError) {
      logger.error('[PointsService] 审计日志记录失败:', auditError.message)
    }

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
  static async createPendingPointsForConsumption(data, transaction) {
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

      logger.info(
        `✅ 创建pending积分交易: transaction_id=${pointsTransaction.transaction_id}, user_id=${data.user_id}, points=${data.points}分, status=pending`
      )

      return pointsTransaction
    } catch (error) {
      logger.error('❌ 创建pending积分交易失败:', error.message)
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
  static async activatePendingPoints(transaction_id, options = {}) {
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

      // 📝 记录审计日志（异步，失败不影响业务）
      try {
        await AuditLogService.logPointsActivate({
          operator_id: operator_id || pendingTx.user_id,
          user_id: pendingTx.user_id,
          transaction_id,
          points_amount: pointsAmount,
          reason: activation_notes || '激活pending积分',
          business_id: `activate_pending_${transaction_id}`,
          transaction
        })
      } catch (auditError) {
        logger.error('[PointsService] 审计日志记录失败:', auditError.message)
      }

      logger.info(
        `✅ Pending积分已激活: transaction_id=${transaction_id}, user_id=${pendingTx.user_id}, points=${pointsAmount}`
      )

      return {
        transaction: pendingTx,
        new_balance: newAvailablePoints,
        points_activated: pointsAmount
      }
    } catch (error) {
      logger.error(`❌ 激活pending积分失败: ${error.message}`)
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
  static async consumePoints(user_id, points, options = {}) {
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
        logger.info(`⚠️ 幂等性检查: business_id=${options.business_id}已处理，跳过重复消费`)
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

    // 📝 记录审计日志（异步，失败不影响业务）
    try {
      await AuditLogService.logPointsConsume({
        operator_id: options.operator_id || user_id,
        user_id,
        before_points: oldBalance,
        after_points: newBalance,
        points_amount: points,
        reason: options.title || options.description || '消费积分',
        business_id: options.business_id,
        transaction
      })
    } catch (auditError) {
      logger.error('[PointsService] 审计日志记录失败:', auditError.message)
    }

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
  static async getPointsBalance(user_id) {
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
  static async getPointsHistory(user_id, options = {}) {
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

    /*
     * ✅ 使用统一视图常量：transactionView（交易视图）
     * 统一管理查询字段，避免字段选择分散
     */
    const { count, rows: transactions } = await PointsTransaction.findAndCountAll({
      where: whereClause,
      attributes: POINTS_ATTRIBUTES.transactionView,
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
        transaction_title: t.transaction_title,
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
  static async getPointsStatistics(user_id) {
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
  static async hasEnoughPoints(user_id, requiredPoints) {
    const account = await this.getUserPointsAccount(user_id)
    return parseFloat(account.available_points) >= requiredPoints
  }

  /**
   * 批量积分操作（事务安全）
   * @param {Array} operations - 操作列表
   * @returns {Object} 批量操作结果
   */
  static async batchPointsOperation(operations) {
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
   * 获取用户积分信息（API响应格式）
   * @param {number} user_id - 用户ID
   * @returns {Object} 积分信息
   */
  static async getUserPoints(user_id) {
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
  static async getUserTransactions(user_id, options = {}) {
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

    /*
     * ✅ 使用统一视图常量：transactionView（交易视图）
     * 统一管理查询字段，避免字段选择分散
     */
    const { count, rows } = await PointsTransaction.findAndCountAll({
      where: whereClause,
      attributes: POINTS_ATTRIBUTES.transactionView,
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
  static generateExchangeCode() {
    const timestamp = BeijingTimeHelper.timestamp().toString(36)
    const random = Math.random().toString(36).substr(2, 8)
    return `EXC${timestamp}${random}`.toUpperCase()
  }

  /**
   * 生成核销码
   * @returns {string} 核销码
   */
  static generateVerificationCode() {
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
  static async getUserPointsOverview(user_id) {
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
      logger.error('❌ 获取用户积分概览失败:', error.message)
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
  static async getUserFrozenPoints(user_id, options = {}) {
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
      logger.error('❌ 获取用户冻结积分明细失败:', {
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

  /**
   * 软删除交易记录
   *
   * 业务场景：
   * - 用户删除待处理、失败或已取消的记录
   * - 管理员删除任意状态的记录（需要填写原因）
   *
   * @param {number} userId - 用户ID
   * @param {number} transactionId - 交易记录ID
   * @param {Object} context - 上下文信息
   * @param {boolean} context.isAdmin - 是否管理员
   * @param {string} context.deletion_reason - 删除原因（管理员必填）
   * @param {Object} context.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 删除结果
   */
  static async deleteTransaction(userId, transactionId, context = {}) {
    const { isAdmin = false, deletion_reason, transaction: externalTransaction } = context

    // 支持外部事务传入
    const transaction = externalTransaction || (await PointsTransaction.sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      // 查询记录（加行级锁）
      const record = await PointsTransaction.findOne({
        where: {
          transaction_id: transactionId,
          user_id: userId,
          is_deleted: 0
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!record) {
        throw new Error('交易记录不存在或已被删除')
      }

      // 业务规则验证
      if (!isAdmin) {
        const allowedStatuses = ['pending', 'failed', 'cancelled']
        if (!allowedStatuses.includes(record.status)) {
          throw new Error('只能删除待处理、失败或已取消的记录。已完成的交易记录请联系管理员处理。')
        }

        if (record.transaction_type === 'refund') {
          throw new Error('退款记录不允许删除，请联系管理员')
        }
      } else {
        if (!deletion_reason || deletion_reason.trim().length < 5) {
          throw new Error('管理员删除记录必须填写删除原因（至少5个字符）')
        }
      }

      // 执行软删除
      await record.update(
        {
          is_deleted: 1,
          deleted_at: BeijingTimeHelper.createDatabaseTime(),
          deletion_reason: isAdmin ? deletion_reason : `用户自主删除${record.status}状态记录`,
          deleted_by: userId
        },
        { transaction }
      )

      if (shouldCommit) {
        await transaction.commit()
      }

      return {
        transaction_id: transactionId,
        deleted_at: record.deleted_at,
        deletion_reason: record.deletion_reason
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      throw error
    }
  }

  /**
   * 恢复交易记录
   *
   * 业务场景：
   * - 管理员恢复误删的交易记录
   *
   * @param {number} adminId - 管理员ID
   * @param {number} transactionId - 交易记录ID
   * @param {Object} context - 上下文信息
   * @param {string} context.restore_reason - 恢复原因（必填）
   * @param {Object} context.transaction - 事务对象（可选）
   * @returns {Promise<Object>} 恢复结果
   */
  static async restoreTransaction(adminId, transactionId, context = {}) {
    const { restore_reason, transaction: externalTransaction } = context

    // 支持外部事务传入
    const transaction = externalTransaction || (await PointsTransaction.sequelize.transaction())
    const shouldCommit = !externalTransaction

    try {
      // 参数验证
      if (!restore_reason || restore_reason.trim().length < 5) {
        throw new Error('恢复原因必须至少5个字符')
      }

      // 查询已删除的记录
      const record = await PointsTransaction.scope('includeDeleted').findOne({
        where: {
          transaction_id: transactionId,
          is_deleted: 1
        },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!record) {
        throw new Error('交易记录不存在或未被删除')
      }

      // 业务规则验证
      if (record.restored_by !== null) {
        throw new Error('该记录已恢复过，无需重复操作')
      }

      // 执行恢复
      await record.update(
        {
          is_deleted: 0,
          deleted_at: null,
          restored_at: BeijingTimeHelper.createDatabaseTime(),
          restored_by: adminId,
          restore_reason
        },
        { transaction }
      )

      if (shouldCommit) {
        await transaction.commit()
      }

      return {
        transaction_id: transactionId,
        restored_at: record.restored_at,
        restore_reason
      }
    } catch (error) {
      if (shouldCommit) {
        await transaction.rollback()
      }
      throw error
    }
  }

  /**
   * 获取恢复审计记录
   *
   * 业务场景：
   * - 管理员查看交易记录恢复历史
   *
   * @param {Object} filters - 过滤条件
   * @param {number} filters.admin_id - 管理员ID（可选）
   * @param {string} filters.start_date - 开始日期（可选）
   * @param {string} filters.end_date - 结束日期（可选）
   * @param {number} filters.page - 页码（默认1）
   * @param {number} filters.limit - 每页数量（默认20）
   * @param {Object} options - 选项
   * @param {Object} options.transaction - 事务对象（可选）
   * @returns {Promise<Object>} {records, pagination}
   */
  static async getRestoreAudit(filters = {}, options = {}) {
    const { transaction = null } = options
    const { admin_id, start_date, end_date, page = 1, limit = 20 } = filters

    try {
      // 构建查询条件
      const where = {
        restored_by: { [Op.not]: null } // 仅查询已恢复的记录
      }

      if (admin_id) {
        where.restored_by = admin_id
      }

      if (start_date) {
        const startDateTime = BeijingTimeHelper.parseDate(start_date, '00:00:00')
        where.restored_at = { [Op.gte]: startDateTime }
      }

      if (end_date) {
        const endDateTime = BeijingTimeHelper.parseDate(end_date, '23:59:59')
        where.restored_at = where.restored_at || {}
        where.restored_at[Op.lte] = endDateTime
      }

      // 分页参数
      const finalLimit = Math.min(Math.max(parseInt(limit) || 20, 1), 100)
      const offset = (page - 1) * finalLimit

      // 查询数据
      const { count, rows } = await PointsTransaction.scope('includeDeleted').findAndCountAll({
        where,
        include: [
          {
            model: User,
            as: 'user',
            attributes: ['user_id', 'nickname', 'mobile']
          },
          {
            model: User,
            as: 'restoredByUser',
            attributes: ['user_id', 'nickname'],
            required: false
          }
        ],
        order: [['restored_at', 'DESC']],
        limit: finalLimit,
        offset,
        transaction
      })

      // 格式化数据
      const records = rows.map(r => ({
        transaction_id: r.transaction_id,
        user_id: r.user_id,
        user_nickname: r.user?.nickname || '未知用户',
        points_amount: parseFloat(r.points_amount),
        transaction_type: r.transaction_type,
        status: r.status,
        deleted_at: r.deleted_at,
        deletion_reason: r.deletion_reason,
        restored_at: r.restored_at,
        restored_by: r.restored_by,
        restored_by_nickname: r.restoredByUser?.nickname || '未知管理员',
        restore_reason: r.restore_reason
      }))

      return {
        records,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: finalLimit,
          total_pages: Math.ceil(count / finalLimit)
        }
      }
    } catch (error) {
      throw new Error(`获取恢复审计记录失败: ${error.message}`)
    }
  }

  /**
   * 🆕 架构重构 - 获取用户账户（封装用户存在性和账户查询）
   *
   * 业务场景（Business Scenario）：
   * - 路由层调用此方法验证用户存在性和账户有效性
   * - 替代路由层直接调用 User.findByPk 和 UserPointsAccount.findOne
   * - 符合架构规范：路由层不直连 models，统一通过 Service 层操作
   *
   * 与 getUserPointsAccount 的区别（Difference from getUserPointsAccount）：
   * - getUserPointsAccount: 自动创建不存在的账户（Auto-create if not exists）
   * - getUserAccount: 不自动创建，返回明确错误（No auto-create, throw explicit error）
   *
   * @param {number} userId - 用户ID（User ID - Required）
   * @returns {Promise<Object>} 用户和账户信息（User and Account Info）
   * @returns {Object} result.user - 用户对象（User Object）
   * @returns {Object} result.account - 积分账户对象（Points Account Object）
   * @throws {Error} 用户不存在（User not found）
   * @throws {Error} 积分账户不存在（Points account not found）
   * @throws {Error} 积分账户已冻结（Account frozen）
   */
  /**
   * 🆕 架构重构 - 获取用户账户（增强版 - 支持返回用户基本信息）
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} { user, account }
   * @throws {Error} 用户不存在
   */
  static async getUserAccount(userId) {
    // Step 1: 验证用户存在性（Validate user existence）
    const user = await User.findByPk(userId, {
      attributes: ['user_id', 'created_at', 'last_login', 'login_count']
    })
    if (!user) {
      throw new Error('用户不存在')
    }

    /*
     * Step 2: 查询积分账户（Query points account）
     * ✅ 使用统一视图常量：userView（用户视图，不包含敏感字段）
     */
    const account = await UserPointsAccount.findOne({
      where: { user_id: userId },
      attributes: POINTS_ATTRIBUTES.userView
    })
    if (!account) {
      throw new Error('积分账户不存在')
    }

    // Step 3: 检查账户状态（Check account status）
    if (!account.is_active) {
      throw new Error(`积分账户已被冻结，原因：${account.freeze_reason || '未说明原因'}`)
    }

    // Step 4: 返回用户和账户信息（Return user and account info）
    return { user, account }
  }

  /**
   * 🆕 架构重构 - 获取用户基本信息（用于账户不存在场景）
   *
   * @param {number} userId - 用户ID
   * @returns {Promise<Object>} { user, hasAccount }
   * @throws {Error} 用户不存在
   */
  static async getUserBasicInfo(userId) {
    const user = await User.findByPk(userId, {
      attributes: ['user_id', 'created_at', 'last_login', 'login_count']
    })
    if (!user) {
      throw new Error('用户不存在')
    }

    // 检查是否有积分账户
    const account = await UserPointsAccount.findOne({
      where: { user_id: userId }
    })

    return {
      user,
      hasAccount: !!account,
      defaultPoints: {
        available_points: 0,
        total_earned: 0,
        total_consumed: 0
      }
    }
  }

  /**
   * 🆕 P2-B优化 - 获取用户积分余额响应数据（架构重构完成）
   *
   * 业务场景（Business Scenario）：
   * - 将路由层的数据组装逻辑下沉到Service层
   * - 符合架构规范TR-005：路由层只保留"参数校验 + 权限校验 + 调用Service + 统一响应"
   *
   * 功能说明（Function Description）：
   * - 封装GET /api/v4/points/balance接口的完整响应数据
   * - 包含用户积分账户信息、积分概览、时间戳等完整数据
   *
   * @param {number} user_id - 用户ID（User ID - Required）
   * @returns {Promise<Object>} 积分余额响应数据（Balance Response Data）
   * @returns {number} result.user_id - 用户ID（User ID）
   * @returns {number} result.available_points - 可用积分（Available Points）
   * @returns {number} result.total_earned - 累计获得积分（Total Earned Points）
   * @returns {number} result.total_consumed - 累计消耗积分（Total Consumed Points）
   * @returns {number} result.frozen_points - 冻结积分（Frozen Points）
   * @returns {string} result.last_earn_time - 最后获得积分时间（Last Earn Time）
   * @returns {string} result.last_consume_time - 最后消耗积分时间（Last Consume Time）
   * @returns {boolean} result.is_active - 账户激活状态（Account Active Status）
   * @returns {string} result.timestamp - API时间戳（API Timestamp）
   * @throws {Error} 用户不存在、账户不存在、账户已冻结
   */
  static async getBalanceResponse(user_id) {
    // Step 1: 获取用户账户信息（验证用户存在性和账户状态）
    const { account } = await this.getUserAccount(user_id)

    // Step 2: 获取完整的积分概览（包括冻结积分）
    const points_overview = await this.getUserPointsOverview(user_id)

    // Step 3: 组装响应数据（封装路由层的数据组装逻辑）
    return {
      user_id,
      // 核心积分数据
      available_points: points_overview.available_points,
      total_earned: points_overview.total_earned,
      total_consumed: points_overview.total_consumed,
      // 扩展数据
      frozen_points: points_overview.frozen_points || 0, // 冻结积分（待审核的消费奖励积分）
      last_earn_time: account.last_earn_time, // 最后获得积分时间
      last_consume_time: account.last_consume_time, // 最后消耗积分时间
      is_active: account.is_active, // 账户激活状态
      // 元数据
      timestamp: BeijingTimeHelper.apiTimestamp() // 北京时间API时间戳
    }
  }

  /**
   * 🆕 架构重构 - 计算用户成就（业务逻辑收口到Service层）
   *
   * @param {Object} stats - 统计数据
   * @param {Object} stats.lottery - 抽奖统计
   * @param {Object} stats.exchange - 兑换统计
   * @param {Object} stats.consumption - 消费统计
   * @param {number} stats.totalEarned - 总获得积分
   * @returns {Array} 成就列表
   */
  static calculateAchievements(stats) {
    const achievements = []

    // 抽奖相关成就
    if (stats.lottery.total_count >= 1) {
      achievements.push({
        id: 'first_lottery',
        name: '初试身手',
        description: '完成第一次抽奖',
        unlocked: true,
        category: 'lottery'
      })
    }

    if (stats.lottery.total_count >= 10) {
      achievements.push({
        id: 'lottery_enthusiast',
        name: '抽奖达人',
        description: '完成10次抽奖',
        unlocked: true,
        category: 'lottery'
      })
    }

    // 兑换相关成就
    if (stats.exchange.total_count >= 1) {
      achievements.push({
        id: 'first_exchange',
        name: '首次兑换',
        description: '完成第一次商品兑换',
        unlocked: true,
        category: 'exchange'
      })
    }

    // 积分相关成就
    if (stats.totalEarned >= 1000) {
      achievements.push({
        id: 'points_collector',
        name: '积分收集者',
        description: '累计获得1000积分',
        unlocked: true,
        category: 'points'
      })
    }

    return achievements
  }

  /**
   * 🆕 架构重构 - 获取管理员积分统计（封装复杂聚合查询）
   *
   * 业务场景（Business Scenario）：
   * - 管理员查看积分系统全局统计数据
   * - 封装原路由层 L760-920 的复杂聚合查询逻辑
   * - 符合架构规范：复杂查询逻辑收口到 Service 层
   *
   * 统计指标（Statistics Metrics）：
   * - 账户统计：总账户数、活跃账户数、总积分余额
   * - 交易统计：总交易数、30天内交易数、今日交易数
   * - 积分流向：累计发放、累计消耗、冻结积分、净流入
   * - 今日数据：今日发放、今日消耗
   * - 异常监控：失败交易数、7天内大额交易数
   *
   * @returns {Promise<Object>} 管理员统计数据（Admin Statistics）
   * @returns {Object} result.accountStats - 账户统计（Account Statistics）
   * @returns {Object} result.transactionStats - 交易统计（Transaction Statistics）
   * @returns {Object} result.abnormalStats - 异常统计（Abnormal Statistics）
   */
  static async getAdminStatistics() {
    const sequelize = UserPointsAccount.sequelize

    // 🚀 并行执行3次聚合查询（优化性能）
    const [accountStats, transactionStats, abnormalStats] = await Promise.all([
      /**
       * 【查询1】账户统计 - 1次查询完成5个统计指标
       * Account Statistics - 5 metrics in 1 query
       */
      UserPointsAccount.findOne({
        attributes: [
          // total_accounts: 总账户数（Total Accounts Count）
          [sequelize.fn('COUNT', sequelize.col('account_id')), 'total_accounts'],

          // active_accounts: 活跃账户数（Active Accounts Count）
          [
            sequelize.fn('COUNT', sequelize.literal('CASE WHEN is_active = true THEN 1 END')),
            'active_accounts'
          ],

          // total_balance: 所有用户可用积分总额（Total Available Points Balance）
          [sequelize.fn('SUM', sequelize.col('available_points')), 'total_balance'],

          // total_system_earned: 系统累计发放积分（Total System Earned Points）
          [sequelize.fn('SUM', sequelize.col('total_earned')), 'total_system_earned'],

          // total_system_consumed: 系统累计消耗积分（Total System Consumed Points）
          [sequelize.fn('SUM', sequelize.col('total_consumed')), 'total_system_consumed']
        ],
        raw: true // 返回纯JSON对象，性能更好（Return plain JSON for better performance）
      }),

      /**
       * 【查询2】交易统计 - 1次查询完成9个统计指标
       * Transaction Statistics - 9 metrics in 1 query
       */
      PointsTransaction.findOne({
        attributes: [
          // total_transactions: 总交易数（Total Transactions Count）
          [sequelize.fn('COUNT', sequelize.col('transaction_id')), 'total_transactions'],

          // recent_transactions: 30天内交易数（Recent 30-day Transactions Count）
          [
            sequelize.fn(
              'COUNT',
              sequelize.literal('CASE WHEN transaction_time >= NOW() - INTERVAL 30 DAY THEN 1 END')
            ),
            'recent_transactions'
          ],

          // today_transactions: 今日交易数（Today Transactions Count）
          [
            sequelize.fn(
              'COUNT',
              sequelize.literal('CASE WHEN DATE(transaction_time) = CURDATE() THEN 1 END')
            ),
            'today_transactions'
          ],

          // total_earned_points: 累计发放积分（Total Earned Points）
          [
            sequelize.fn(
              'SUM',
              sequelize.literal(
                "CASE WHEN transaction_type = 'earn' AND status = 'completed' THEN points_amount ELSE 0 END"
              )
            ),
            'total_earned_points'
          ],

          // total_consumed_points: 累计消耗积分（Total Consumed Points）
          [
            sequelize.fn(
              'SUM',
              sequelize.literal(
                "CASE WHEN transaction_type = 'consume' AND status = 'completed' THEN points_amount ELSE 0 END"
              )
            ),
            'total_consumed_points'
          ],

          // pending_earn_points: 冻结积分总额（Frozen/Pending Earn Points）
          [
            sequelize.fn(
              'SUM',
              sequelize.literal(
                "CASE WHEN status = 'pending' AND transaction_type = 'earn' THEN points_amount ELSE 0 END"
              )
            ),
            'pending_earn_points'
          ],

          // today_earn_points: 今日发放积分（Today Earned Points）
          [
            sequelize.fn(
              'SUM',
              sequelize.literal(
                "CASE WHEN DATE(transaction_time) = CURDATE() AND transaction_type = 'earn' AND status = 'completed' THEN points_amount ELSE 0 END"
              )
            ),
            'today_earn_points'
          ],

          // today_consume_points: 今日消耗积分（Today Consumed Points）
          [
            sequelize.fn(
              'SUM',
              sequelize.literal(
                "CASE WHEN DATE(transaction_time) = CURDATE() AND transaction_type = 'consume' AND status = 'completed' THEN points_amount ELSE 0 END"
              )
            ),
            'today_consume_points'
          ],

          // failed_transactions: 失败交易数（Failed Transactions Count）
          [
            sequelize.fn('COUNT', sequelize.literal("CASE WHEN status = 'failed' THEN 1 END")),
            'failed_transactions'
          ]
        ],
        raw: true
      }),

      /**
       * 【查询3】异常统计 - 最近7天的安全监控数据
       * Abnormal Statistics - Recent 7 days security monitoring
       */
      PointsTransaction.findOne({
        attributes: [
          // large_transactions: 大额交易数（>10000积分）
          [
            sequelize.fn(
              'COUNT',
              sequelize.literal('CASE WHEN ABS(points_amount) > 10000 THEN 1 END')
            ),
            'large_transactions'
          ]
        ],
        where: {
          transaction_time: {
            [Op.gte]: sequelize.literal('NOW() - INTERVAL 7 DAY')
          }
        },
        raw: true
      })
    ])

    /*
     * 🔧 P2-B优化：将路由层的数据组装逻辑下沉到Service层
     * 组装完整的响应数据结构（所有数值字段使用parseInt/parseFloat确保类型正确，|| 0 确保null值转换为0）
     */
    const statistics = {
      // 基础统计
      total_accounts: parseInt(accountStats.total_accounts) || 0, // 总账户数
      active_accounts: parseInt(accountStats.active_accounts) || 0, // 活跃账户数
      total_balance: parseFloat(accountStats.total_balance) || 0, // 总积分余额（系统负债）
      total_system_earned: parseFloat(accountStats.total_system_earned) || 0, // 系统累计发放
      total_system_consumed: parseFloat(accountStats.total_system_consumed) || 0, // 系统累计消耗

      // 交易统计
      total_transactions: parseInt(transactionStats.total_transactions) || 0, // 总交易数
      recent_transactions: parseInt(transactionStats.recent_transactions) || 0, // 30天内交易数
      today_transactions: parseInt(transactionStats.today_transactions) || 0, // 今日交易数

      // 积分流向（从交易记录统计）
      total_earned_points: parseFloat(transactionStats.total_earned_points) || 0, // 累计发放积分
      total_consumed_points: parseFloat(transactionStats.total_consumed_points) || 0, // 累计消耗积分
      pending_earn_points: parseFloat(transactionStats.pending_earn_points) || 0, // 待审核积分
      net_flow: parseFloat(
        (transactionStats.total_earned_points || 0) - (transactionStats.total_consumed_points || 0)
      ), // 净流入

      // 今日数据
      today_earn_points: parseFloat(transactionStats.today_earn_points) || 0, // 今日发放积分
      today_consume_points: parseFloat(transactionStats.today_consume_points) || 0, // 今日消耗积分

      // 异常监控
      failed_transactions: parseInt(transactionStats.failed_transactions) || 0, // 失败交易数
      large_transactions_7d: parseInt(abnormalStats.large_transactions) || 0 // 7天内大额交易数
    }

    // 返回完整的格式化统计数据（Return formatted statistics）
    return { statistics }
  }

  /**
   * 🆕 架构重构 - 获取用户统计数据（封装用户维度统计）
   *
   * 业务场景（Business Scenario）：
   * - 管理员或用户本人查看个人积分统计
   * - 封装原路由层的用户统计查询逻辑
   * - 符合架构规范：统计查询收口到 Service 层
   *
   * 统计内容（Statistics Content）：
   * - 本月获得积分（Month Earned Points）
   * - 历史总积分统计（Historical Total Points）
   *
   * @param {number} userId - 用户ID（User ID - Required）
   * @returns {Promise<Object>} 用户统计数据（User Statistics）
   * @returns {number} result.month_earned - 本月获得积分（Month Earned Points）
   */
  static async getUserStatistics(userId) {
    // 计算本月开始时间（Calculate month start time）
    const monthStart = BeijingTimeHelper.createBeijingTime()
    monthStart.setDate(1)
    monthStart.setHours(0, 0, 0, 0)

    // 使用Sequelize聚合查询直接计算本月获得积分（Use Sequelize aggregation）
    const monthEarned =
      (await PointsTransaction.sum('points_amount', {
        where: {
          user_id: userId,
          transaction_type: 'earn', // 只统计"获得积分"类型的交易（Only count earn transactions）
          transaction_time: { [Op.gte]: monthStart }, // 交易时间 >= 本月1号（Transaction time >= 1st of current month）
          status: 'completed' // 只统计已完成的交易（Only count completed transactions）
        }
      })) || 0 // 如果返回null（无记录），默认为0（Default to 0 if null）

    return {
      month_earned: monthEarned
    }
  }

  /**
   * 🆕 架构重构 - 获取用户完整统计数据（封装多维度统计查询）
   *
   * 业务场景（Business Scenario）：
   * - 用户查看个人数据统计
   * - 封装原 points.js 路由层的 GET /user/statistics/:user_id 接口逻辑
   * - 符合架构规范：多表查询逻辑收口到 Service 层
   *
   * 统计维度（Statistics Dimensions）：
   * - 抽奖统计：总次数、本月次数、最后抽奖时间（Lottery Statistics）
   * - 兑换统计：总次数、总积分消耗、本月次数（Exchange Statistics）
   * - 消费统计：总消费次数、审核通过率、消费金额、奖励积分（Consumption Statistics）
   * - 库存统计：总物品数、可用数、已使用数、使用率（Inventory Statistics）
   *
   * @param {number} userId - 用户ID（User ID - Required）
   * @returns {Promise<Object>} 完整统计数据（Full Statistics）
   * @returns {Object} result.lottery - 抽奖统计（Lottery Statistics）
   * @returns {Object} result.exchange - 兑换统计（Exchange Statistics）
   * @returns {Object} result.consumption - 消费统计（Consumption Statistics）
   * @returns {Object} result.inventory - 库存统计（Inventory Statistics）
   */
  static async getUserFullStatistics(userId) {
    const { LotteryDraw, ConsumptionRecord, ItemInstance } = require('../models')
    const sequelize = UserPointsAccount.sequelize

    // 本月第一天0点(北京时间)
    const monthStart = new Date(
      BeijingTimeHelper.createDatabaseTime().getFullYear(),
      BeijingTimeHelper.createDatabaseTime().getMonth(),
      1
    )

    // 🚀 并行执行所有统计查询（Parallel execution for optimal performance）
    const [lotteryStats, consumptionStats, inventoryStats] = await Promise.all([
      // 1. 抽奖统计（Lottery Statistics）
      this._getLotteryStats(userId, LotteryDraw, monthStart),

      // 2. 消费统计（Consumption Statistics）
      this._getConsumptionStats(userId, ConsumptionRecord, monthStart, sequelize),

      // 3. 库存统计（Inventory Statistics - 使用新表 ItemInstance）
      this._getInventoryStats(userId, ItemInstance)
    ])

    return {
      lottery: lotteryStats,
      consumption: consumptionStats,
      inventory: inventoryStats
    }
  }

  /**
   * 🔒 私有方法 - 获取抽奖统计
   * @private
   * @param {number} userId - 用户ID
   * @param {Object} LotteryDraw - 抽奖记录模型
   * @param {Date} monthStart - 本月开始时间
   * @returns {Promise<Object>} 抽奖统计数据
   */
  static async _getLotteryStats(userId, LotteryDraw, monthStart) {
    const [totalCount, thisMonth, lastDraw] = await Promise.all([
      // 总抽奖次数（Total lottery count）
      LotteryDraw.count({ where: { user_id: userId } }),

      // 本月抽奖次数（This month count）
      LotteryDraw.count({
        where: {
          user_id: userId,
          created_at: { [Op.gte]: monthStart }
        }
      }),

      // 最后一次抽奖时间（Last draw time）
      LotteryDraw.findOne({
        where: { user_id: userId },
        order: [['created_at', 'DESC']],
        attributes: ['created_at']
      })
    ])

    return {
      total_count: totalCount,
      month_count: thisMonth,
      last_draw: lastDraw ? lastDraw.created_at : null
    }
  }

  /**
   * 🔒 私有方法 - 获取消费统计（商家扫码录入）
   * @private
   * @param {number} userId - 用户ID
   * @param {Object} ConsumptionRecord - 消费记录模型
   * @param {Date} monthStart - 本月开始时间
   * @param {Object} sequelize - Sequelize实例
   * @returns {Promise<Object>} 消费统计数据
   */
  static async _getConsumptionStats(userId, ConsumptionRecord, monthStart, sequelize) {
    // 如果ConsumptionRecord模型不存在,返回空数据(向后兼容)
    if (!ConsumptionRecord) {
      return {
        total_count: 0,
        approved_count: 0,
        pending_count: 0,
        approval_rate: 0,
        month_count: 0,
        total_consumption_amount: 0,
        total_points_awarded: 0
      }
    }

    const [totalCount, approvedCount, pendingCount, thisMonth, totalStats] = await Promise.all([
      // 总消费记录数（Total consumption count）
      ConsumptionRecord.count({ where: { user_id: userId } }),

      // 已通过审核的记录数（Approved count）
      ConsumptionRecord.count({
        where: { user_id: userId, status: 'approved' }
      }),

      // 待审核的记录数（Pending count）
      ConsumptionRecord.count({
        where: { user_id: userId, status: 'pending' }
      }),

      // 本月消费记录数（This month count）
      ConsumptionRecord.count({
        where: {
          user_id: userId,
          created_at: { [Op.gte]: monthStart }
        }
      }),

      // 总消费金额和总奖励积分（Total amount and points）
      ConsumptionRecord.findAll({
        where: {
          user_id: userId,
          status: 'approved',
          is_deleted: 0
        },
        attributes: [
          [sequelize.fn('SUM', sequelize.col('consumption_amount')), 'total_amount'],
          [sequelize.fn('SUM', sequelize.col('points_to_award')), 'total_points']
        ],
        raw: true
      })
    ])

    return {
      total_count: totalCount,
      approved_count: approvedCount,
      pending_count: pendingCount,
      approval_rate: totalCount > 0 ? ((approvedCount / totalCount) * 100).toFixed(1) : 0,
      month_count: thisMonth,
      total_consumption_amount: parseFloat(totalStats[0]?.total_amount || 0),
      total_points_awarded: parseInt(totalStats[0]?.total_points || 0)
    }
  }

  /**
   * 🔒 私有方法 - 获取库存统计（使用新表 ItemInstance）
   * @private
   * @param {number} userId - 用户ID
   * @param {Object} ItemInstance - 物品实例模型（新背包双轨架构）
   * @returns {Promise<Object>} 库存统计数据
   */
  static async _getInventoryStats(userId, ItemInstance) {
    const [totalCount, availableCount, usedCount] = await Promise.all([
      // 总物品数（Total items count）
      ItemInstance.count({ where: { owner_user_id: userId } }),

      // 可用物品数（Available items count）
      ItemInstance.count({ where: { owner_user_id: userId, status: 'available' } }),

      // 已使用物品数（Used items count）
      ItemInstance.count({ where: { owner_user_id: userId, status: 'used' } })
    ])

    return {
      total_count: totalCount,
      available_count: availableCount,
      used_count: usedCount,
      usage_rate: totalCount > 0 ? ((usedCount / totalCount) * 100).toFixed(1) : 0
    }
  }

  /**
   * 🆕 架构重构 - 检查账户健康状态（从 UserPointsAccount 模型迁移）
   *
   * 业务场景（Business Scenario）：
   * - 检查积分账户是否存在异常（冻结、余额异常等）
   * - 为管理员和用户提供账户健康度诊断
   * - 符合架构规范：业务逻辑收口到 Service 层，Model 层只负责数据结构
   *
   * @param {Object} account - 积分账户实例（UserPointsAccount Instance）
   * @returns {Object} 健康状态详情（Health Status Details）
   * @returns {boolean} result.is_healthy - 账户是否健康（Is Account Healthy）
   * @returns {Array<Object>} result.issues - 账户问题列表（Account Issues List）
   * @returns {Array<Object>} result.warnings - 账户警告列表（Account Warnings List）
   * @returns {number} result.health_score - 账户健康分数，范围0-100（Health Score, Range 0-100）
   *
   * @example
   * const account = await PointsService.getUserPointsAccount(userId)
   * const health = PointsService.getAccountHealth(account)
   * logger.info(health.is_healthy) // true/false
   * logger.info(health.health_score) // 100
   */
  static getAccountHealth(account) {
    const issues = []
    const warnings = []

    // 检查账户是否被冻结（Check if account is frozen）
    if (!account.is_active) {
      issues.push({
        type: 'account_frozen',
        message: '账户已被冻结',
        reason: account.freeze_reason
      })
    }

    // 返回健康状态详情（Return health status details）
    return {
      is_healthy: issues.length === 0,
      issues,
      warnings,
      health_score: Math.max(0, 100 - issues.length * 30 - warnings.length * 10)
    }
  }

  /**
   * 🆕 架构重构 - 生成个性化推荐数据（从 UserPointsAccount 模型迁移）
   *
   * 业务场景（Business Scenario）：
   * - 为用户提供积分使用建议和任务推荐
   * - 提升用户积分系统参与度
   * - 符合架构规范：业务逻辑收口到 Service 层
   *
   * @param {Object} _account - 积分账户实例（UserPointsAccount Instance）- 预留参数，用于未来基于账户状态的个性化推荐
   * @returns {Object} 推荐数据（Recommendation Data）
   * @returns {boolean} result.enabled - 推荐功能是否启用（Is Recommendation Enabled）
   * @returns {Array<Object>} result.recommendations - 推荐项列表（Recommendations List）
   * @returns {string} result.generated_at - 推荐数据生成时间（Generated Timestamp）
   *
   * @example
   * const account = await PointsService.getUserPointsAccount(userId)
   * const recommendations = PointsService.getAccountRecommendations(account)
   * logger.info(recommendations.recommendations) // [{ type: 'daily_tasks', ... }]
   */
  static getAccountRecommendations(_account) {
    const recommendations = []

    /*
     * 基础推荐：建议用户完成任务获得积分（Basic recommendation: complete daily tasks）
     * 未来可以基于 _account 参数实现个性化推荐（Future: personalized recommendations based on _account）
     */
    recommendations.push({
      type: 'daily_tasks',
      priority: 'medium',
      message: '完成每日任务获得积分奖励',
      action: 'complete_tasks'
    })

    return {
      enabled: true,
      recommendations,
      generated_at: BeijingTimeHelper.apiTimestamp() // 北京时间API时间戳（Beijing Time API Timestamp）
    }
  }

  /**
   * 🆕 架构重构 - 格式化账户摘要信息（从 UserPointsAccount 模型迁移）
   *
   * 业务场景（Business Scenario）：
   * - 为前端提供格式化的账户摘要数据（健康状态+推荐+余额）
   * - 统一账户数据输出格式，避免在路由层拼装数据
   * - 符合架构规范：数据组装逻辑收口到 Service 层
   *
   * @param {Object} account - 积分账户实例（UserPointsAccount Instance）
   * @returns {Object} 账户摘要（Account Summary）
   * @returns {number} result.account_id - 账户ID（Account ID）
   * @returns {number} result.user_id - 用户ID（User ID）
   * @returns {Object} result.balance - 积分余额信息（Balance Info）
   * @returns {number} result.balance.available - 可用积分（Available Points）
   * @returns {number} result.balance.total_earned - 累计获得积分（Total Earned Points）
   * @returns {number} result.balance.total_consumed - 累计消耗积分（Total Consumed Points）
   * @returns {Object} result.health - 账户健康状态（Account Health Status）
   * @returns {Array<Object>} result.recommendations - 推荐项列表（Recommendations List）
   * @returns {boolean} result.is_active - 账户是否激活（Is Account Active）
   * @returns {Date} result.created_at - 创建时间（Created At）
   * @returns {Date} result.updated_at - 更新时间（Updated At）
   *
   * @example
   * const account = await PointsService.getUserPointsAccount(userId)
   * const summary = PointsService.getAccountSummary(account)
   * return res.apiSuccess(summary, '账户摘要获取成功')
   */
  static getAccountSummary(account) {
    const health = this.getAccountHealth(account)
    const recommendations = this.getAccountRecommendations(account)

    return {
      account_id: account.account_id,
      user_id: account.user_id,
      balance: {
        available: parseFloat(account.available_points),
        total_earned: parseFloat(account.total_earned),
        total_consumed: parseFloat(account.total_consumed)
      },
      health,
      recommendations: recommendations.enabled ? recommendations.recommendations : [],
      is_active: account.is_active,
      created_at: account.created_at,
      updated_at: account.updated_at
    }
  }

  /**
   * 🆕 架构重构 - 获取用户积分趋势数据（封装趋势查询逻辑）
   *
   * 业务场景（Business Scenario）：
   * - 用户查看积分获得/消费趋势图表
   * - 封装原 points.js 路由层的 GET /trend 接口逻辑（L1447-1690）
   * - 符合架构规范：复杂查询和数据处理逻辑收口到 Service 层
   *
   * 功能说明（Feature Description）：
   * 1. 查询指定天数内的积分交易记录（Sequelize查询）
   * 2. 按日期分组统计（JavaScript Map数据结构）
   * 3. 生成完整日期序列并补全缺失日期（循环生成）
   * 4. 返回前端Chart.js可直接使用的数组格式（labels, earn_data, consume_data）
   *
   * @param {number} userId - 用户ID（User ID - Required）
   * @param {Object} options - 查询选项（Query Options）
   * @param {number} options.days - 查询天数，默认30天，范围7-90天（Days to query，default 30, range 7-90）
   * @param {string} options.end_date - 结束日期，默认今天，格式YYYY-MM-DD（End date，default today，format YYYY-MM-DD）
   * @returns {Promise<Object>} 趋势数据（Trend Data）
   * @returns {Array<string>} result.labels - 日期标签数组，格式['11-01', '11-02', ...]（Date labels for Chart.js X-axis）
   * @returns {Array<number>} result.earn_data - 每日获得积分数组（Daily earned points data）
   * @returns {Array<number>} result.consume_data - 每日消费积分数组（Daily consumed points data）
   * @returns {number} result.total_earn - 周期总获得积分（Total earned points in period）
   * @returns {number} result.total_consume - 周期总消费积分（Total consumed points in period）
   * @returns {number} result.net_change - 净变化（Net change = total_earn - total_consume）
   * @returns {string} result.period - 统计周期描述（Period description）
   * @returns {number} result.days - 实际统计天数（Actual days counted）
   * @returns {number} result.data_points - 数据点数量（Data points count）
   * @returns {string} result.timestamp - 查询时间戳（Query timestamp）
   */
  static async getUserPointsTrend(userId, options = {}) {
    let { days = 30, end_date } = options

    // 🔒 参数验证和安全清洗（Parameter validation and sanitization）
    days = Math.min(Math.max(parseInt(days) || 30, 7), 90)

    // 📅 处理结束日期（Handle end date）
    let end_date_obj
    if (end_date) {
      end_date_obj = new Date(end_date)
      if (isNaN(end_date_obj.getTime())) {
        throw new Error('无效的结束日期格式，请使用YYYY-MM-DD格式')
      }

      const today = BeijingTimeHelper.createBeijingTime()
      today.setHours(23, 59, 59, 999)

      if (end_date_obj > today) {
        throw new Error('结束日期不能超过今天')
      }
    } else {
      end_date_obj = BeijingTimeHelper.createBeijingTime()
    }

    // 📅 计算日期范围（Calculate date range）
    const start_date_obj = new Date(end_date_obj)
    start_date_obj.setDate(start_date_obj.getDate() - (days - 1))
    start_date_obj.setHours(0, 0, 0, 0)

    const end_date_copy = new Date(end_date_obj)
    end_date_copy.setHours(23, 59, 59, 999)

    // 📊 查询交易记录（Query transactions）
    const transactions = await PointsTransaction.findAll({
      where: {
        user_id: userId,
        transaction_time: {
          [Op.gte]: start_date_obj,
          [Op.lte]: end_date_copy
        },
        status: 'completed'
      },
      attributes: ['transaction_id', 'transaction_type', 'points_amount', 'transaction_time'],
      order: [['transaction_time', 'ASC']],
      raw: true
    })

    // 📊 按日期分组统计（Group by date）
    const daily_stats = new Map()

    transactions.forEach(tx => {
      const time_date =
        tx.transaction_time instanceof Date ? tx.transaction_time : new Date(tx.transaction_time)

      // 使用北京时区提取日期（Extract date in Beijing timezone）
      const date_key = time_date
        .toLocaleDateString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })
        .replace(/\//g, '-')

      if (!daily_stats.has(date_key)) {
        daily_stats.set(date_key, { earn_amount: 0, consume_amount: 0 })
      }

      const stats = daily_stats.get(date_key)
      const amount = Math.abs(parseFloat(tx.points_amount))

      if (tx.transaction_type === 'earn') {
        stats.earn_amount += amount
      } else if (tx.transaction_type === 'consume') {
        stats.consume_amount += amount
      }
    })

    // 🗓️ 生成完整日期序列并补全缺失日期（Generate complete date sequence）
    const labels = []
    const earn_data = []
    const consume_data = []
    let total_earn = 0
    let total_consume = 0

    const current_date = new Date(start_date_obj)
    const final_end_date = new Date(end_date_obj)
    // eslint-disable-next-line no-unmodified-loop-condition
    while (current_date <= final_end_date) {
      const date_key = current_date
        .toLocaleDateString('zh-CN', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        })
        .replace(/\//g, '-')
      const label = date_key.substring(5)
      labels.push(label)

      const stats = daily_stats.get(date_key) || { earn_amount: 0, consume_amount: 0 }

      earn_data.push(Math.round(stats.earn_amount))
      consume_data.push(Math.round(stats.consume_amount))

      total_earn += stats.earn_amount
      total_consume += stats.consume_amount

      current_date.setDate(current_date.getDate() + 1)
    }

    // 🎉 返回趋势数据（Return trend data）
    return {
      labels,
      earn_data,
      consume_data,
      total_earn: Math.round(total_earn),
      total_consume: Math.round(total_consume),
      net_change: Math.round(total_earn - total_consume),
      period: `${start_date_obj.toISOString().split('T')[0]} 至 ${end_date_obj.toISOString().split('T')[0]}`,
      days,
      data_points: labels.length,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }
  }

  /**
   * 管理员调整用户积分（Admin Adjust User Points）
   *
   * @description 管理员专用方法，用于调整用户积分（增加或扣除），封装完整的业务逻辑
   *
   * 业务场景（Business Scenario）：
   * - 活动补偿：管理员为用户补偿积分
   * - 错误修正：修正系统错误导致的积分异常
   * - 违规处罚：扣除违规用户的积分
   * - 人工调整：其他需要人工干预的积分调整
   *
   * 核心功能（Core Features）：
   * - ✅ 用户存在性验证（User Validation）
   * - ✅ 账户存在性验证（Account Validation）
   * - ✅ 余额充足性检查（Balance Validation）
   * - ✅ 幂等性控制（Idempotency Control）
   * - ✅ 审计日志记录（Audit Logging）
   *
   * @param {Object} params - 调整参数
   * @param {number} params.admin_id - 管理员ID（必填，Admin ID - Required）
   * @param {number} params.user_id - 目标用户ID（必填，User ID - Required）
   * @param {number} params.amount - 调整金额（必填，正数表示增加，负数表示扣除，Amount - Required）
   * @param {string} params.reason - 调整原因（必填，Reason - Required）
   * @param {string} params.type - 业务类型（可选，默认 'admin_adjust'，Business Type - Optional）
   * @param {string} params.request_id - 请求ID（可选，用于幂等性控制，Request ID - Optional for Idempotency）
   *
   * @returns {Object} 调整结果
   * @returns {number} result.user_id - 用户ID
   * @returns {Object} result.adjustment - 调整信息
   * @returns {Object} result.balance_change - 余额变化
   * @returns {Object} result.account_summary - 账户摘要
   *
   * @throws {Error} 用户不存在
   * @throws {Error} 账户不存在
   * @throws {Error} 余额不足
   *
   * 使用示例（Usage Example）：
   * ```javascript
   * const result = await PointsService.adminAdjustPoints({
   *   admin_id: 1,
   *   user_id: 123,
   *   amount: 500,
   *   reason: '活动补偿'
   * });
   * ```
   */
  static async adminAdjustPoints(params) {
    const { admin_id, user_id, amount, reason, type = 'admin_adjust', request_id } = params

    // 📝 Step 1: 参数验证
    if (!user_id || !amount || !reason) {
      throw new Error('用户ID、调整金额和原因不能为空')
    }

    if (typeof amount !== 'number' || amount === 0) {
      throw new Error('调整金额必须是非零数字')
    }

    // 📝 Step 2: 验证用户和账户存在性（getUserAccount 会验证用户和账户）
    try {
      await this.getUserAccount(user_id)
    } catch (verifyError) {
      // 用户不存在，返回友好错误
      if (verifyError.message.includes('用户不存在')) {
        throw new Error(`目标用户不存在，请检查user_id是否正确（user_id: ${user_id}）`)
      }
      // 账户不存在时，addPoints/consumePoints会自动创建（管理员操作合理）
    }

    // 📝 Step 3: 生成唯一business_id确保幂等性（防止网络重试导致重复调整）
    const business_id =
      request_id ||
      `admin_adjust_${admin_id}_${user_id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 📝 Step 4: 记录调整前余额
    let old_balance = 0
    try {
      const { account } = await this.getUserAccount(user_id)
      old_balance = parseFloat(account.available_points)
    } catch (e) {
      // 账户不存在，初始余额为0
      old_balance = 0
    }

    // 📝 Step 5: 执行积分调整
    let result
    if (amount > 0) {
      // 增加积分
      result = await this.addPoints(user_id, amount, {
        business_id,
        business_type: type,
        source_type: 'admin',
        title: `管理员调整积分(+${amount})`,
        description: reason,
        operator_id: admin_id
      })
    } else {
      // 扣除积分前先检查余额
      const required_amount = Math.abs(amount)

      if (old_balance < required_amount) {
        throw new Error(
          `积分余额不足：当前余额${old_balance}分，需要扣除${required_amount}分，差额${required_amount - old_balance}分`
        )
      }

      // 余额充足，执行扣除
      result = await this.consumePoints(user_id, required_amount, {
        business_id,
        business_type: type,
        source_type: 'admin',
        title: `管理员调整积分(-${required_amount})`,
        description: reason,
        operator_id: admin_id
      })
    }

    // 📝 Step 6: 获取调整后的余额
    const { account: updatedAccount } = await this.getUserAccount(user_id)
    const new_balance = parseFloat(updatedAccount.available_points)

    // 📝 Step 7: 记录操作日志（便于审计追踪）
    logger.info(
      `✅ 积分调整成功 - 管理员:${admin_id} 用户:${user_id} 金额:${amount} 原因:${reason} 余额:${old_balance}→${new_balance} 幂等标识:${business_id}`
    )

    // 📝 Step 8: 返回完整的调整结果
    return {
      user_id,
      adjustment: {
        amount,
        type,
        reason,
        admin_id,
        timestamp: BeijingTimeHelper.apiTimestamp(),
        is_duplicate: result?.is_duplicate || false // 标记是否为重复请求（幂等性检测）
      },
      balance_change: {
        old_balance,
        new_balance,
        change: amount
      },
      account_summary: {
        available_points: new_balance,
        total_earned: parseFloat(updatedAccount.total_earned),
        total_consumed: parseFloat(updatedAccount.total_consumed)
      }
    }
  }

  /**
   * 获取用户统计响应数据（User Statistics Response）
   *
   * @description 封装获取用户完整统计数据的逻辑，包括用户信息、积分、抽奖、兑换、消费、库存等
   *
   * 业务场景（Business Scenario）：
   * - 用户查看个人统计页面
   * - 管理员查看用户详细数据
   * - 数据分析和报表生成
   *
   * 核心功能（Core Features）：
   * - ✅ 用户信息获取（User Info）
   * - ✅ 积分账户数据（Points Account）
   * - ✅ 完整统计数据（Full Statistics）
   * - ✅ 成就计算（Achievements）
   * - ✅ 数据组装（Data Assembly）
   *
   * @param {number} userId - 用户ID（必填，User ID - Required）
   *
   * @returns {Object} 统计响应数据
   * @returns {number} result.user_id - 用户ID
   * @returns {string} result.account_created - 账户创建时间
   * @returns {string} result.last_activity - 最后活动时间
   * @returns {number} result.login_count - 登录次数
   * @returns {Object} result.points - 积分统计
   * @returns {Object} result.lottery - 抽奖统计
   * @returns {Object} result.exchange - 兑换统计
   * @returns {Object} result.consumption - 消费统计
   * @returns {Object} result.inventory - 库存统计
   * @returns {Object} result.achievements - 成就数据
   *
   * @throws {Error} 用户不存在
   *
   * 使用示例（Usage Example）：
   * ```javascript
   * const statistics = await PointsService.getUserStatisticsResponse(123);
   * ```
   */
  static async getUserStatisticsResponse(userId) {
    // 📝 Step 1: 获取用户信息和账户
    let userInfo, pointsInfo
    try {
      const { user, account } = await this.getUserAccount(userId)
      userInfo = user
      pointsInfo = {
        available_points: parseFloat(account.available_points),
        total_earned: parseFloat(account.total_earned),
        total_consumed: parseFloat(account.total_consumed)
      }
    } catch (error) {
      // 用户不存在，抛出错误
      if (error.message.includes('用户不存在')) {
        throw new Error('用户不存在')
      }
      // 账户不存在，获取用户基本信息和默认积分
      const userBasicInfo = await this.getUserBasicInfo(userId)
      userInfo = userBasicInfo.user
      pointsInfo = userBasicInfo.defaultPoints
    }

    // 📝 Step 2: 并行获取完整统计数据
    const [fullStats, monthStats] = await Promise.all([
      this.getUserFullStatistics(userId),
      this.getUserStatistics(userId)
    ])

    // 📝 Step 3: 组装统计数据
    const statistics = {
      user_id: parseInt(userId),
      account_created: userInfo.created_at,
      last_activity: userInfo.last_login,
      login_count: userInfo.login_count,

      // 积分统计
      points: {
        current_balance: pointsInfo.available_points,
        total_earned: pointsInfo.total_earned,
        total_consumed: pointsInfo.total_consumed,
        month_earned: parseFloat(monthStats.month_earned) || 0
      },

      // 抽奖统计
      lottery: fullStats.lottery,

      // 兑换统计
      exchange: fullStats.exchange,

      // 消费记录统计（新业务：商家扫码录入）
      consumption: fullStats.consumption,

      // 库存统计
      inventory: fullStats.inventory,

      // 成就数据（通过Service计算）
      achievements: this.calculateAchievements({
        lottery: fullStats.lottery,
        exchange: fullStats.exchange,
        consumption: fullStats.consumption,
        totalEarned: pointsInfo.total_earned
      })
    }

    return statistics
  }
}

module.exports = PointsService
