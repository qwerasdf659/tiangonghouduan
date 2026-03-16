/**
 * 餐厅积分抽奖系统 V4.7.0 - 兑换市场核心服务
 * Exchange Core Service（大文件拆分方案 Phase 4）
 *
 * 职责范围：核心兑换操作
 * - exchangeItem(): 商品兑换核心逻辑（材料资产扣减、订单创建、库存扣减）
 * - updateOrderStatus(): 更新订单状态（管理员操作，含状态机校验）
 * - _generateOrderNo(): 生成订单号（私有方法）
 *
 * 设计原则：
 * - 所有写操作必须在事务内执行（assertAndGetTransaction）
 * - 幂等性控制通过 idempotency_key 实现
 * - 材料资产扣减通过 BalanceService.changeBalance() 执行
 *
 * @module services/exchange/CoreService
 * @created 2026-01-31（大文件拆分方案 Phase 4）
 */

const logger = require('../../utils/logger').logger
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const BeijingTimeHelper = require('../../utils/timeHelper')
const { assertAndGetTransaction } = require('../../utils/transactionHelpers')

/**
 * 兑换订单状态机白名单
 *
 * 业务流程：
 *   pending → approved（管理员审批通过）
 *   pending → rejected（管理员拒绝，退还材料）
 *   pending → cancelled（用户自行取消，退还材料）
 *   approved → shipped（管理员标记发货）
 *   shipped → received（用户确认收货 / 7天自动确认）
 *   received → rated（用户评分）
 *   received → completed（管理员标记完成）
 *   shipped → completed（管理员直接标记完成）
 *   rated → completed（管理员标记完成）
 *   approved → refunded（管理员退款）
 *   shipped → refunded（管理员退款-已发货阶段）
 *
 * @type {Object<string, string[]>}
 */
const ORDER_STATUS_TRANSITIONS = {
  pending: ['approved', 'rejected', 'cancelled'],
  approved: ['shipped', 'refunded'],
  shipped: ['received', 'completed', 'refunded'],
  received: ['rated', 'completed'],
  rated: ['completed'],
  rejected: [],
  refunded: [],
  cancelled: [],
  completed: []
}

/**
 * 兑换市场核心服务类
 *
 * @class CoreService
 */
class CoreService {
  /**
   * 构造函数
   *
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this.ExchangeItem = models.ExchangeItem
    this.ExchangeRecord = models.ExchangeRecord
  }

  /**
   * 兑换商品（核心业务逻辑）
   * V4.5.0 材料资产支付版本（2025-12-15）
   *
   * 支付方式：使用BalanceService扣减材料资产（cost_asset_code + cost_amount）
   *
   * @param {number} user_id - 用户ID
   * @param {number} exchange_item_id - 兑换商品ID（主键命名规范化）
   * @param {number} quantity - 兑换数量
   * @param {Object} options - 选项
   * @param {string} options.idempotency_key - 幂等键（必填，用于幂等性）
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 兑换结果和订单信息
   */
  async exchangeItem(user_id, exchange_item_id, quantity = 1, options = {}) {
    const { idempotency_key } = options

    // 🔥 必填参数校验
    if (!idempotency_key) {
      throw new Error('idempotency_key 参数不能为空，用于幂等性控制')
    }

    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'CoreService.exchangeItem')

    /*
     * ✅ 幂等性检查：以 idempotency_key 为唯一键（统一幂等架构）
     * 🔴 P1-1-5: 不使用悲观锁，依赖数据库唯一约束防止并发创建重复订单
     */
    const existingOrder = await this.ExchangeRecord.findOne({
      where: { idempotency_key },
      transaction
    })

    if (existingOrder) {
      logger.info('[兑换市场] ⚠️ 幂等性检查：idempotency_key已存在，验证参数一致性', {
        idempotency_key,
        order_no: existingOrder.order_no,
        existing_exchange_item_id: existingOrder.exchange_item_id,
        existing_quantity: existingOrder.quantity,
        request_exchange_item_id: exchange_item_id,
        request_quantity: quantity
      })

      // 🔴 P1-1冲突保护：验证请求参数是否一致（确保类型一致）
      if (
        Number(existingOrder.exchange_item_id) !== Number(exchange_item_id) ||
        Number(existingOrder.quantity) !== Number(quantity)
      ) {
        const conflictError = new Error(
          `幂等键冲突：idempotency_key="${idempotency_key}" 已被使用于不同参数的订单。` +
            `原订单：商品ID=${existingOrder.exchange_item_id}, 数量=${existingOrder.quantity}；` +
            `当前请求：商品ID=${exchange_item_id}, 数量=${quantity}。` +
            '请使用不同的幂等键或确认请求参数正确。'
        )
        conflictError.statusCode = 409
        conflictError.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'
        throw conflictError
      }

      logger.info('[兑换市场] ✅ 参数一致性验证通过，返回原结果（幂等）', {
        idempotency_key,
        order_no: existingOrder.order_no
      })

      /*
       * 🔴 幂等回放：补齐指纹字段（pay_asset_code/pay_amount）
       */
      const BalanceService = require('../asset/BalanceService')
      const currentItem = await this.ExchangeItem.findOne({
        where: { exchange_item_id },
        transaction
      })
      if (!currentItem) {
        throw new Error('商品不存在')
      }
      if (!currentItem.cost_asset_code || !currentItem.cost_amount) {
        throw new Error('商品未配置材料资产支付方式（cost_asset_code/cost_amount缺失）')
      }
      const expectedPayAssetCode = currentItem.cost_asset_code
      const expectedPayAmount = currentItem.cost_amount * quantity

      if (
        existingOrder.pay_asset_code !== expectedPayAssetCode ||
        Number(existingOrder.pay_amount) !== Number(expectedPayAmount)
      ) {
        const conflictError = new Error(
          `幂等键冲突：idempotency_key="${idempotency_key}" 已被使用于不同支付参数的订单。` +
            `原订单：pay_asset_code=${existingOrder.pay_asset_code}, pay_amount=${existingOrder.pay_amount}；` +
            `当前请求：pay_asset_code=${expectedPayAssetCode}, pay_amount=${expectedPayAmount}。`
        )
        conflictError.statusCode = 409
        conflictError.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'
        throw conflictError
      }

      let materialBalance = 0
      if (existingOrder.pay_asset_code) {
        const balanceResult = await BalanceService.getBalance(
          { user_id, asset_code: existingOrder.pay_asset_code },
          { transaction }
        )
        materialBalance = balanceResult.available_amount || 0
      }

      return {
        success: true,
        message: '兑换订单已存在',
        order: {
          order_no: existingOrder.order_no,
          record_id: existingOrder.exchange_record_id,
          name: existingOrder.item_snapshot?.item_name || '未知商品',
          quantity: existingOrder.quantity,
          pay_asset_code: existingOrder.pay_asset_code,
          pay_amount: existingOrder.pay_amount,
          status: existingOrder.status
        },
        remaining: {
          material_balance: materialBalance
        },
        is_duplicate: true,
        timestamp: BeijingTimeHelper.now()
      }
    }

    logger.info(
      `[兑换市场] 用户${user_id}兑换商品${exchange_item_id}，数量${quantity}，idempotency_key=${idempotency_key}`
    )

    // 1. 获取商品信息（加锁防止超卖，含主图片用于快照）
    const item = await this.ExchangeItem.findOne({
      where: { exchange_item_id },
      include: [
        {
          model: this.models.ImageResources,
          as: 'primaryImage',
          attributes: ['file_path'],
          required: false
        }
      ],
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!item) {
      throw new Error('商品不存在')
    }

    if (item.status !== 'active') {
      throw new Error('商品已下架')
    }

    if (item.stock < quantity) {
      throw new Error(`库存不足，当前库存：${item.stock}`)
    }

    // V4.5.0: 验证商品是否配置了材料资产支付
    if (!item.cost_asset_code || !item.cost_amount) {
      throw new Error(
        '商品未配置材料资产支付方式（cost_asset_code/cost_amount缺失）。' +
          '请联系管理员更新商品配置。'
      )
    }

    // 2. 计算总支付金额
    const totalPayAmount = item.cost_amount * quantity

    logger.info('[兑换市场] 材料资产支付计算', {
      cost_asset_code: item.cost_asset_code,
      cost_amount: item.cost_amount,
      quantity,
      totalPayAmount
    })

    // 3. 使用BalanceService统一账本扣减材料资产
    const BalanceService = require('../asset/BalanceService')

    logger.info('[兑换市场] 开始扣减材料资产（统一账本）', {
      user_id,
      asset_code: item.cost_asset_code,
      amount: totalPayAmount,
      idempotency_key: `exchange_debit_${idempotency_key}`
    })

    const burnAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_BURN' },
      { transaction }
    )
    // eslint-disable-next-line no-restricted-syntax
    const materialResult = await BalanceService.changeBalance(
      {
        user_id,
        asset_code: item.cost_asset_code,
        delta_amount: -totalPayAmount,
        idempotency_key: `exchange_debit_${idempotency_key}`,
        business_type: 'exchange_debit',
        counterpart_account_id: burnAccount.account_id,
        meta: {
          idempotency_key,
          exchange_item_id,
          item_name: item.item_name,
          quantity,
          cost_amount: item.cost_amount,
          total_pay_amount: totalPayAmount
        }
      },
      { transaction }
    )

    // 如果是重复扣减，说明之前已经创建过订单但事务未提交
    if (materialResult.is_duplicate) {
      logger.info('[兑换市场] ⚠️ 材料扣减幂等返回，查询已存在订单', {
        idempotency_key
      })

      const existingRecord = await this.ExchangeRecord.findOne({
        where: { idempotency_key },
        transaction
      })

      if (existingRecord) {
        const currentBalance = await BalanceService.getBalance(
          { user_id, asset_code: item.cost_asset_code },
          { transaction }
        )

        return {
          success: true,
          message: '兑换订单已存在（材料扣减幂等）',
          order: existingRecord.toJSON(),
          remaining: {
            material_balance: currentBalance.available_amount
          },
          is_duplicate: true,
          timestamp: BeijingTimeHelper.now()
        }
      }
    }

    logger.info(
      `[兑换市场] 材料扣减成功：${totalPayAmount}个${item.cost_asset_code}，剩余余额通过统一账本管理`
    )

    /*
     * 🔴 P0治理：提取扣减流水ID用于对账（2026-01-09）
     */
    const debit_transaction_id = materialResult.transaction_record?.transaction_id || null

    // 4. 生成订单号
    const order_no = this._generateOrderNo()

    /*
     * 5. 创建兑换订单（✅ 包含 idempotency_key、材料支付字段、debit_transaction_id）
     */
    let record
    try {
      const business_id = `exchange_${user_id}_${exchange_item_id}_${Date.now()}`

      record = await this.ExchangeRecord.create(
        {
          order_no,
          idempotency_key,
          business_id,
          debit_transaction_id,
          user_id,
          exchange_item_id,
          item_snapshot: {
            exchange_item_id: item.exchange_item_id,
            item_name: item.item_name,
            description: item.description,
            cost_asset_code: item.cost_asset_code,
            cost_amount: item.cost_amount,
            image_url: item.primaryImage?.file_path || null
          },
          quantity,
          pay_asset_code: item.cost_asset_code,
          pay_amount: totalPayAmount,
          total_cost: (item.cost_price || 0) * quantity,
          status: 'pending',
          exchange_time: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )
    } catch (createError) {
      // 🔴 捕获唯一约束冲突（并发场景）
      if (
        createError.name === 'SequelizeUniqueConstraintError' ||
        createError.message?.includes('Duplicate entry') ||
        createError.message?.includes('idx_idempotency_key_unique')
      ) {
        logger.info('[兑换市场] ⚠️ 并发冲突：idempotency_key已存在，抛出错误让调用方处理', {
          idempotency_key
        })

        const conflictError = new Error(
          `并发冲突：idempotency_key="${idempotency_key}" 已被其他请求使用。请重试。`
        )
        conflictError.statusCode = 409
        conflictError.errorCode = 'CONCURRENT_CONFLICT'
        conflictError.originalError = createError
        throw conflictError
      }
      throw createError
    }

    // 6. 扣减商品库存
    await item.update(
      {
        stock: item.stock - quantity,
        sold_count: (item.sold_count || 0) + quantity
      },
      { transaction }
    )

    // 缓存失效
    await BusinessCacheHelper.invalidateExchangeItems('exchange_success')

    // 写入创建事件
    await this._recordEvent(
      {
        order_no,
        old_status: null,
        new_status: 'pending',
        operator_id: user_id,
        operator_type: 'user',
        reason: '用户兑换商品',
        metadata: { exchange_item_id, quantity, pay_amount: totalPayAmount }
      },
      { transaction }
    )

    logger.info(`[兑换市场] 兑换成功，订单号：${order_no}`)

    return {
      success: true,
      message: '兑换成功',
      order: {
        order_no,
        record_id: record.exchange_record_id,
        item_name: item.item_name,
        quantity,
        pay_asset_code: item.cost_asset_code,
        pay_amount: totalPayAmount,
        status: 'pending'
      },
      remaining: {
        material_balance: materialResult.new_balance
      },
      timestamp: BeijingTimeHelper.now()
    }
  }

  /**
   * 更新订单状态（管理员操作）
   *
   * @param {string} order_no - 订单号
   * @param {string} new_status - 新状态（completed/shipped/cancelled）
   * @param {number} operator_id - 操作员ID
   * @param {string} remark - 备注
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 更新结果
   */
  async updateOrderStatus(order_no, new_status, operator_id, remark = '', options = {}) {
    // 强制要求事务边界
    const transaction = assertAndGetTransaction(options, 'CoreService.updateOrderStatus')

    logger.info(`[兑换市场] 更新订单状态：${order_no} -> ${new_status}`)

    const order = await this.ExchangeRecord.findOne({
      where: { order_no },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      throw new Error('订单不存在')
    }

    const old_status = order.status

    // 状态机校验：只允许白名单中定义的合法状态转换
    const allowedTransitions = ORDER_STATUS_TRANSITIONS[old_status]
    if (!allowedTransitions) {
      const error = new Error(`当前订单状态 "${old_status}" 无法执行任何状态变更`)
      error.statusCode = 400
      error.code = 'INVALID_STATUS_TRANSITION'
      error.data = { current_status: old_status, requested_status: new_status }
      throw error
    }
    if (!allowedTransitions.includes(new_status)) {
      const error = new Error(
        `不允许的状态转换：${old_status} → ${new_status}，` +
          `当前状态仅可转换为：${allowedTransitions.length > 0 ? allowedTransitions.join(', ') : '（终态，不可变更）'}`
      )
      error.statusCode = 400
      error.code = 'INVALID_STATUS_TRANSITION'
      error.data = {
        current_status: old_status,
        requested_status: new_status,
        allowed_transitions: allowedTransitions
      }
      throw error
    }

    // 更新订单状态
    await order.update(
      {
        status: new_status,
        admin_remark: remark,
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 根据状态类型记录对应时间戳
    const timestampMap = {
      approved: { approved_at: BeijingTimeHelper.createDatabaseTime() },
      shipped: { shipped_at: BeijingTimeHelper.createDatabaseTime() },
      received: { received_at: BeijingTimeHelper.createDatabaseTime() },
      rejected: { rejected_at: BeijingTimeHelper.createDatabaseTime() },
      refunded: { refunded_at: BeijingTimeHelper.createDatabaseTime() }
    }

    if (timestampMap[new_status]) {
      await order.update(timestampMap[new_status], { transaction })
    }

    // 写入状态变更事件
    await this._recordEvent(
      {
        order_no,
        old_status,
        new_status,
        operator_id,
        operator_type: 'admin',
        reason: remark || `管理员变更状态为 ${new_status}`,
        metadata: null
      },
      { transaction }
    )

    logger.info(`[兑换市场] 订单状态更新成功：${order_no} -> ${new_status}`)

    return {
      message: '订单状态更新成功',
      order: {
        order_no,
        status: new_status
      },
      timestamp: BeijingTimeHelper.now()
    }
  }

  /**
   * 用户对兑换订单评分（需求6：兑换商品统计字段）
   *
   * 业务规则：
   * - 只能对自己的订单评分
   * - 订单状态必须为 completed 或 shipped（已完成/已发货才能评分）
   * - 每笔订单只能评分一次（rating 非空则不可重复评分）
   * - 评分范围：1-5分
   * - 评分后清除该商品的缓存（触发 avg_rating 重新计算）
   *
   * @param {number} user_id - 用户ID
   * @param {string} order_no - 订单号
   * @param {number} rating - 评分（1-5分）
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 评分结果
   */
  async rateOrder(user_id, order_no, rating, options = {}) {
    const transaction = assertAndGetTransaction(options, 'rateOrder')

    // 评分范围校验
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      const error = new Error('评分必须为1-5的整数')
      error.statusCode = 400
      error.code = 'INVALID_RATING'
      throw error
    }

    // 查找订单
    const order = await this.ExchangeRecord.findOne({
      where: { order_no, user_id },
      transaction
    })

    if (!order) {
      const error = new Error('订单不存在或无权操作')
      error.statusCode = 404
      error.code = 'ORDER_NOT_FOUND'
      throw error
    }

    // 订单状态校验：已收货/已完成/已发货的订单才能评分
    if (!['received', 'completed', 'shipped'].includes(order.status)) {
      const error = new Error('只有已收货、已完成或已发货的订单才能评分')
      error.statusCode = 400
      error.code = 'ORDER_STATUS_INVALID'
      throw error
    }

    // 重复评分校验
    if (order.rating !== null) {
      const error = new Error('该订单已评分，不可重复评分')
      error.statusCode = 409
      error.code = 'ALREADY_RATED'
      error.data = { existing_rating: order.rating }
      throw error
    }

    const previousStatus = order.status

    await order.update(
      {
        status: 'rated',
        rating,
        rated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 写入事件记录
    await this._recordEvent(
      {
        order_no,
        old_status: previousStatus,
        new_status: 'rated',
        operator_id: user_id,
        operator_type: 'user',
        reason: `用户评分 ${rating} 分`,
        metadata: { rating }
      },
      { transaction }
    )

    // 清除该商品的列表缓存（触发 avg_rating 重新计算）
    await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
      logger.warn('[兑换市场] 评分后清除缓存失败（非致命）:', err.message)
    })

    logger.info('[兑换市场] 用户评分成功', {
      user_id,
      order_no,
      exchange_item_id: order.exchange_item_id,
      rating
    })

    return {
      message: '评分成功',
      order_no,
      rating,
      rated_at: BeijingTimeHelper.now()
    }
  }

  /**
   * 用户确认收货（决策4/Phase 3：发货后7天未操作自动确认）
   *
   * 业务规则：
   * - 只能对自己的订单确认收货
   * - 订单状态必须为 shipped（已发货才能确认收货）
   * - 确认收货后状态变为 received
   * - 管理员可通过 auto_confirmed=true 标记自动确认
   *
   * @param {number} user_id - 用户ID
   * @param {string} order_no - 订单号
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @param {boolean} [options.auto_confirmed=false] - 是否为系统自动确认
   * @returns {Promise<Object>} 确认收货结果
   */
  async confirmReceipt(user_id, order_no, options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.confirmReceipt')
    const { auto_confirmed = false } = options

    const whereClause = { order_no }
    if (!auto_confirmed) {
      whereClause.user_id = user_id
    }

    const order = await this.ExchangeRecord.findOne({
      where: whereClause,
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      const error = new Error('订单不存在或无权操作')
      error.statusCode = 404
      error.code = 'ORDER_NOT_FOUND'
      throw error
    }

    if (order.status !== 'shipped') {
      const error = new Error('只有已发货的订单才能确认收货')
      error.statusCode = 400
      error.code = 'ORDER_STATUS_INVALID'
      error.data = { current_status: order.status }
      throw error
    }

    await order.update(
      {
        status: 'received',
        received_at: BeijingTimeHelper.createDatabaseTime(),
        auto_confirmed
      },
      { transaction }
    )

    // 写入事件记录
    await this._recordEvent(
      {
        order_no,
        old_status: 'shipped',
        new_status: 'received',
        operator_id: auto_confirmed ? 11021 : user_id,
        operator_type: auto_confirmed ? 'system' : 'user',
        reason: auto_confirmed ? '发货7天后系统自动确认收货' : '用户手动确认收货',
        metadata: { auto_confirmed }
      },
      { transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
      logger.warn('[兑换市场] 确认收货后清除缓存失败（非致命）:', err.message)
    })

    logger.info('[兑换市场] 确认收货成功', {
      user_id,
      order_no,
      auto_confirmed
    })

    return {
      message: auto_confirmed ? '系统自动确认收货成功' : '确认收货成功',
      order_no,
      status: 'received',
      received_at: BeijingTimeHelper.now(),
      auto_confirmed
    }
  }

  /**
   * 批量自动确认收货（定时任务调用：发货7天后自动确认）
   *
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<number>} 自动确认的订单数量
   */
  async autoConfirmShippedOrders(options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.autoConfirmShippedOrders')
    const { Op } = require('sequelize')

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const whereClause = {
      status: 'shipped',
      shipped_at: { [Op.lt]: sevenDaysAgo }
    }

    // 先查出即将被自动确认的订单号（用于事件记录）
    const pendingOrders = await this.ExchangeRecord.findAll({
      where: whereClause,
      attributes: ['order_no'],
      transaction
    })

    if (pendingOrders.length === 0) {
      return 0
    }

    const [affectedCount] = await this.ExchangeRecord.update(
      {
        status: 'received',
        received_at: BeijingTimeHelper.createDatabaseTime(),
        auto_confirmed: true
      },
      { where: whereClause, transaction }
    )

    if (affectedCount > 0) {
      // 批量写入事件记录（SYSTEM_DAILY_JOB_USER_ID = 11021）
      for (const row of pendingOrders) {
        await this._recordEvent(
          {
            order_no: row.order_no,
            old_status: 'shipped',
            new_status: 'received',
            operator_id: 11021,
            operator_type: 'system',
            reason: '发货7天后系统自动确认收货',
            metadata: { auto_confirmed: true }
          },
          { transaction }
        )
      }

      logger.info(`[兑换市场] 自动确认收货完成，共 ${affectedCount} 笔订单`)
      await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
        logger.warn('[兑换市场] 批量确认收货后清除缓存失败（非致命）:', err.message)
      })
    }

    return affectedCount
  }

  /**
   * 用户取消订单（仅 pending 状态可取消，退还材料资产）
   *
   * 业务规则：
   * - 只能取消自己的订单
   * - 订单状态必须为 pending（待审核阶段才可取消）
   * - 退还 pay_amount 到用户账户（通过 BalanceService，幂等键防重）
   * - 记录状态变更事件
   *
   * @param {number} user_id - 用户ID
   * @param {string} order_no - 订单号
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 取消结果
   */
  async cancelOrder(user_id, order_no, options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.cancelOrder')

    const order = await this.ExchangeRecord.findOne({
      where: { order_no, user_id },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      const error = new Error('订单不存在或无权操作')
      error.statusCode = 404
      error.code = 'ORDER_NOT_FOUND'
      throw error
    }

    if (order.status !== 'pending') {
      const error = new Error('只有待审核的订单才能取消')
      error.statusCode = 400
      error.code = 'ORDER_STATUS_INVALID'
      error.data = { current_status: order.status }
      throw error
    }

    // 退还材料资产（与 exchangeItem 扣减完全对称）
    const BalanceService = require('../asset/BalanceService')
    const burnAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_BURN' },
      { transaction }
    )
    // eslint-disable-next-line no-restricted-syntax
    await BalanceService.changeBalance(
      {
        user_id: order.user_id,
        asset_code: order.pay_asset_code,
        delta_amount: +order.pay_amount,
        idempotency_key: `exchange_refund_${order.order_no}`,
        business_type: 'exchange_cancel_refund',
        counterpart_account_id: burnAccount.account_id,
        meta: {
          order_no: order.order_no,
          reason: 'user_cancel',
          original_pay_amount: order.pay_amount
        }
      },
      { transaction }
    )

    await order.update(
      {
        status: 'cancelled',
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 写入事件记录
    await this._recordEvent(
      {
        order_no,
        old_status: 'pending',
        new_status: 'cancelled',
        operator_id: user_id,
        operator_type: 'user',
        reason: '用户主动取消订单',
        metadata: { refund_amount: order.pay_amount, refund_asset_code: order.pay_asset_code }
      },
      { transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
      logger.warn('[兑换市场] 取消订单后清除缓存失败（非致命）:', err.message)
    })

    logger.info('[兑换市场] 用户取消订单成功', {
      user_id,
      order_no,
      refund_amount: order.pay_amount,
      refund_asset_code: order.pay_asset_code
    })

    return {
      message: '订单取消成功，材料资产已退还',
      order_no,
      status: 'cancelled',
      refund: {
        asset_code: order.pay_asset_code,
        amount: order.pay_amount
      }
    }
  }

  /**
   * 管理员拒绝订单（仅 pending 状态可拒绝，退还材料资产）
   *
   * 业务规则：
   * - 管理员操作，不校验 user_id
   * - 订单状态必须为 pending（待审核阶段才可拒绝）
   * - 退还 pay_amount 到用户账户
   * - 记录 admin_remark 和 rejected_at
   * - 记录状态变更事件
   *
   * @param {string} order_no - 订单号
   * @param {number} operator_id - 管理员ID
   * @param {string} remark - 拒绝原因
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 拒绝结果
   */
  async rejectOrder(order_no, operator_id, remark, options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.rejectOrder')

    const order = await this.ExchangeRecord.findOne({
      where: { order_no },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      const error = new Error('订单不存在')
      error.statusCode = 404
      error.code = 'ORDER_NOT_FOUND'
      throw error
    }

    if (order.status !== 'pending') {
      const error = new Error('只有待审核的订单才能拒绝')
      error.statusCode = 400
      error.code = 'ORDER_STATUS_INVALID'
      error.data = { current_status: order.status }
      throw error
    }

    // 退还材料资产
    const BalanceService = require('../asset/BalanceService')
    const burnAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_BURN' },
      { transaction }
    )
    // eslint-disable-next-line no-restricted-syntax
    await BalanceService.changeBalance(
      {
        user_id: order.user_id,
        asset_code: order.pay_asset_code,
        delta_amount: +order.pay_amount,
        idempotency_key: `exchange_refund_${order.order_no}`,
        business_type: 'exchange_reject_refund',
        counterpart_account_id: burnAccount.account_id,
        meta: {
          order_no: order.order_no,
          reason: 'admin_reject',
          operator_id,
          remark,
          original_pay_amount: order.pay_amount
        }
      },
      { transaction }
    )

    await order.update(
      {
        status: 'rejected',
        admin_remark: remark,
        rejected_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 写入事件记录
    await this._recordEvent(
      {
        order_no,
        old_status: 'pending',
        new_status: 'rejected',
        operator_id,
        operator_type: 'admin',
        reason: remark || '管理员拒绝审批',
        metadata: { refund_amount: order.pay_amount, refund_asset_code: order.pay_asset_code }
      },
      { transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
      logger.warn('[兑换市场] 拒绝订单后清除缓存失败（非致命）:', err.message)
    })

    logger.info('[兑换市场] 管理员拒绝订单成功', {
      operator_id,
      order_no,
      remark,
      refund_amount: order.pay_amount
    })

    return {
      message: '订单已拒绝，材料资产已退还用户',
      order: {
        order_no,
        status: 'rejected'
      }
    }
  }

  /**
   * 管理员退款（审核通过或已发货的订单可退款）
   *
   * 业务规则：
   * - 管理员操作，不校验 user_id
   * - 订单状态必须为 approved 或 shipped（审核通过/已发货阶段可退款）
   * - 退还 pay_amount 到用户账户（通过 BalanceService.changeBalance）
   * - 记录 admin_remark 和 refunded_at
   * - 记录状态变更事件
   * - 如果已发货，退款后需要恢复商品库存
   *
   * @param {string} order_no - 订单号
   * @param {number} operator_id - 管理员ID
   * @param {string} remark - 退款原因
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（必填）
   * @returns {Promise<Object>} 退款结果
   */
  async refundOrder(order_no, operator_id, remark, options = {}) {
    const transaction = assertAndGetTransaction(options, 'CoreService.refundOrder')

    const order = await this.ExchangeRecord.findOne({
      where: { order_no },
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      const error = new Error('订单不存在')
      error.statusCode = 404
      error.code = 'ORDER_NOT_FOUND'
      throw error
    }

    const refundableStatuses = ['approved', 'shipped']
    if (!refundableStatuses.includes(order.status)) {
      const error = new Error(`只有审核通过或已发货的订单才能退款，当前状态：${order.status}`)
      error.statusCode = 400
      error.code = 'ORDER_STATUS_INVALID'
      error.data = { current_status: order.status, allowed_statuses: refundableStatuses }
      throw error
    }

    const old_status = order.status

    // 退还材料资产到用户账户
    const BalanceService = require('../asset/BalanceService')
    const burnAccount = await BalanceService.getOrCreateAccount(
      { system_code: 'SYSTEM_BURN' },
      { transaction }
    )
    // eslint-disable-next-line no-restricted-syntax
    await BalanceService.changeBalance(
      {
        user_id: order.user_id,
        asset_code: order.pay_asset_code,
        delta_amount: +order.pay_amount,
        idempotency_key: `exchange_admin_refund_${order.order_no}`,
        business_type: 'exchange_admin_refund',
        counterpart_account_id: burnAccount.account_id,
        meta: {
          order_no: order.order_no,
          reason: 'admin_refund',
          operator_id,
          remark,
          original_pay_amount: order.pay_amount,
          refund_from_status: old_status
        }
      },
      { transaction }
    )

    // 恢复商品库存（兑换时已扣减，退款应归还）
    if (order.exchange_item_id) {
      const ExchangeItem = this.models.ExchangeItem
      const item = await ExchangeItem.findByPk(order.exchange_item_id, { transaction })
      if (item) {
        const quantity = order.quantity || 1
        await item.update(
          {
            stock: item.stock + quantity,
            sold_count: Math.max(0, item.sold_count - quantity)
          },
          { transaction }
        )
      }
    }

    await order.update(
      {
        status: 'refunded',
        admin_remark: remark,
        refunded_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    await this._recordEvent(
      {
        order_no,
        old_status,
        new_status: 'refunded',
        operator_id,
        operator_type: 'admin',
        reason: remark || '管理员退款',
        metadata: {
          refund_amount: order.pay_amount,
          refund_asset_code: order.pay_asset_code,
          refund_from_status: old_status
        }
      },
      { transaction }
    )

    await BusinessCacheHelper.invalidateExchangeItems().catch(err => {
      logger.warn('[兑换市场] 退款后清除缓存失败（非致命）:', err.message)
    })

    logger.info('[兑换市场] 管理员退款成功', {
      operator_id,
      order_no,
      remark,
      refund_amount: order.pay_amount,
      refund_from_status: old_status
    })

    return {
      message: '订单已退款，材料资产已退还用户',
      order: {
        order_no,
        status: 'refunded',
        refund_amount: order.pay_amount,
        refund_asset_code: order.pay_asset_code
      }
    }
  }

  /**
   * 写入订单状态变更事件（私有方法，事务内同步写入）
   *
   * @param {Object} eventData - 事件数据
   * @param {string} eventData.order_no - 订单号
   * @param {string|null} eventData.old_status - 变更前状态
   * @param {string} eventData.new_status - 变更后状态
   * @param {number} eventData.operator_id - 操作人ID
   * @param {string} eventData.operator_type - 操作人类型（user/admin/system）
   * @param {string} [eventData.reason] - 变更原因
   * @param {Object} [eventData.metadata] - 额外元数据
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 事务对象
   * @returns {Promise<void>} 无返回值
   * @private
   */
  async _recordEvent(eventData, options = {}) {
    try {
      const ExchangeOrderEvent = this.models.ExchangeOrderEvent
      if (!ExchangeOrderEvent) {
        logger.warn('[兑换市场] ExchangeOrderEvent 模型未注册，跳过事件记录')
        return
      }

      const idempotency_key = ExchangeOrderEvent.generateIdempotencyKey(
        eventData.order_no,
        eventData.new_status,
        eventData.operator_id
      )

      await ExchangeOrderEvent.create(
        { ...eventData, idempotency_key },
        { transaction: options.transaction }
      )
    } catch (err) {
      // 幂等冲突不抛出（防止重复写入）
      if (err.name === 'SequelizeUniqueConstraintError') {
        logger.info('[兑换市场] 事件记录幂等命中，跳过', { order_no: eventData.order_no })
        return
      }
      logger.error('[兑换市场] 写入事件记录失败（非致命）:', err.message)
    }
  }

  /**
   * 生成订单号（私有方法）
   *
   * @returns {string} 订单号
   * @private
   */
  _generateOrderNo() {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 6).toUpperCase()
    return `EM${timestamp}${random}`
  }
}

module.exports = CoreService
module.exports.ORDER_STATUS_TRANSITIONS = ORDER_STATUS_TRANSITIONS
