/**
 * 餐厅积分抽奖系统 V4.7.0 - 兑换市场核心服务
 * Exchange Core Service（大文件拆分方案 Phase 4）
 *
 * 职责范围：核心兑换操作
 * - exchangeItem(): 商品兑换核心逻辑（材料资产扣减、订单创建、库存扣减）
 * - updateOrderStatus(): 更新订单状态（管理员操作）
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
          name: existingOrder.item_snapshot?.name || '未知商品',
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

    // 1. 获取商品信息（加锁防止超卖）
    const item = await this.ExchangeItem.findOne({
      where: { exchange_item_id },
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

    // eslint-disable-next-line no-restricted-syntax
    const materialResult = await BalanceService.changeBalance(
      {
        user_id,
        asset_code: item.cost_asset_code,
        delta_amount: -totalPayAmount,
        idempotency_key: `exchange_debit_${idempotency_key}`,
        business_type: 'exchange_debit',
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
            cost_amount: item.cost_amount
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

    // 更新订单状态
    await order.update(
      {
        status: new_status,
        admin_remark: remark,
        updated_at: BeijingTimeHelper.createDatabaseTime()
      },
      { transaction }
    )

    // 如果是发货，记录发货时间
    if (new_status === 'shipped') {
      await order.update(
        {
          shipped_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )
    }

    logger.info(`[兑换市场] 订单状态更新成功：${order_no} -> ${new_status}`)

    return {
      success: true,
      message: '订单状态更新成功',
      order: {
        order_no,
        status: new_status
      },
      timestamp: BeijingTimeHelper.now()
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
