/**
 * 天工商户营销平台 V4.2 - 兑换订单服务（RedemptionService）
 *
 * 职责：
 * - 核销码域（Redemption Code Domain）核心服务
 * - 统一管理核销订单的创建、核销、取消、过期
 * - 协调物品状态变更（调用 Item 三表模型）
 * - 提供强幂等性保证（code_hash 唯一）
 *
 * 业务流程：
 * 1. 创建订单（createOrder）：
 *    - 验证物品实例状态（available）
 *    - 生成12位Base32核销码
 *    - 计算SHA-256哈希
 *    - 创建订单记录（status = pending, expires_at = now + 配置天数）
 *    - 返回明文码（仅一次）
 * 2. 核销订单（fulfillOrder）：
 *    - 验证核销码格式
 *    - 计算哈希查找订单
 *    - 检查订单状态和过期时间
 *    - 更新订单状态（status = fulfilled）
 *    - 标记物品已使用（Item → SYSTEM_BURN 双录）
 * 3. 取消订单（cancelOrder）：
 *    - 更新订单状态（status = cancelled）
 * 4. 过期清理（expireOrders）：
 *    - 批量更新过期订单（status = expired）
 *
 * 事务边界治理（2026-02-02 更新）：
 * - 采用"外部传入事务"模式：路由层通过 TransactionManager.execute() 创建事务
 * - 所有写操作方法强制要求 options.transaction 参数
 * - Service 层通过 assertAndGetTransaction() 验证事务存在性
 *
 * 最后更新：2026年01月05日（事务边界治理改造）
 */

const BusinessError = require('../utils/BusinessError')
const crypto = require('crypto')
const {
  sequelize,
  RedemptionOrder,
  Item,
  Account,
  User,
  Store,
  StoreStaff,
  ExchangeRecord,
  ExchangeItem
} = require('../models')
const RedemptionCodeGenerator = require('../utils/RedemptionCodeGenerator')
const OrderNoGenerator = require('../utils/OrderNoGenerator')
const { assertAndGetTransaction } = require('../utils/transactionHelpers')
const ItemService = require('./asset/ItemService')

const logger = require('../utils/logger').logger
const { getUserRoles } = require('../middleware/auth')
const AdminSystemService = require('./AdminSystemService')

/**
 * 兑换订单服务类
 *
 * @class RedemptionService
 * @description 核销码域核心服务，负责核销订单的全生命周期管理
 */
class RedemptionService {
  /**
   * 创建兑换订单（生成核销码）
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * 业务流程：
   * 1. 验证物品存在且可用
   * 2. 🔐 验证所有权或管理员权限（服务层兜底）
   * 3. 生成唯一的12位Base32核销码
   * 4. 计算SHA-256哈希
   * 5. 创建订单记录（30天有效期）
   * 6. 返回明文码（仅此一次，不再存储）
   *
   * @param {number} item_id - 物品ID
   * @param {Object} options - 事务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} [options.creator_user_id] - 创建者用户ID（用于权限兜底校验）
   * @param {number[]|null} [options.scoped_store_id_list] - 门店专属券允许核销门店集合（specified_stores 时由兑换链固化传入；通用券/merchant_all 传 NULL）
   * @returns {Promise<Object>} {order, code} - 订单对象和明文码
   * @throws {Error} 物品不存在、物品不可用、权限不足、核销码生成失败等
   *
   * @example
   * const result = await RedemptionService.createOrder(123, { transaction, creator_user_id: 456 })
   * logger.info('核销码:', result.code) // '3K7J-2MQP-WXYZ'
   * logger.info('订单ID:', result.order.redemption_order_id)
   * logger.info('过期时间:', result.order.expires_at)
   */
  static async createOrder(item_id, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'RedemptionService.createOrder')
    const { creator_user_id } = options
    /*
     * 门店专属券：允许核销门店集合（specified_stores 时固化；通用券/merchant_all 为 NULL）
     * 优先用调用方显式传入；未传则在下方按物品的兑换商品来源（exchange_items.applicable_scope）解析固化
     */
    let scopedStoreIdList = Array.isArray(options.scoped_store_id_list)
      ? options.scoped_store_id_list
      : null

    logger.info('开始创建兑换订单', { item_id, creator_user_id })

    // 1. 验证物品存在且可用（使用行锁防止并发冲突）
    const item = await Item.findByPk(item_id, {
      lock: transaction.LOCK.UPDATE, // 添加行锁（SELECT ... FOR UPDATE）
      transaction
    })

    if (!item) {
      throw new BusinessError(`物品不存在: ${item_id}`, 'REDEMPTION_NOT_FOUND', 404)
    }

    if (item.status !== 'available') {
      throw new BusinessError(
        `物品实例不可用: status=${item.status}`,
        'REDEMPTION_NOT_ALLOWED',
        400
      )
    }

    /*
     * 1.2 门店专属券范围解析（调用方未显式传入时）：
     *     物品来自兑换商城（source='exchange'）时，按 source_ref_id→exchange_records→exchange_items
     *     回溯到兑换商品 SPU，依据其 applicable_scope 固化允许核销门店集合到本核销单。
     *     - specified_stores：固化 scoped_store_ids
     *     - all / merchant_all：scoped_store_id_list 保持 NULL（merchant_all 走物品商家一致性校验）
     */
    if (scopedStoreIdList === null && item.source === 'exchange' && item.source_ref_id) {
      scopedStoreIdList = await RedemptionService._resolveScopedStoresFromExchange(
        item.source_ref_id,
        transaction
      )
    }

    // 1.5 幂等性检查：防止同一物品并发创建多个pending订单
    const existingOrder = await RedemptionOrder.findOne({
      where: {
        item_id,
        status: 'pending'
      },
      transaction
    })

    if (existingOrder) {
      logger.warn('物品已有pending核销订单，拒绝重复创建', {
        item_id,
        existing_order_id: existingOrder.redemption_order_id,
        creator_user_id
      })
      throw new BusinessError(
        '该物品已有待核销订单，请勿重复生成核销码',
        'REDEMPTION_ALREADY_EXISTS',
        409
      )
    }

    // 🔐 2. 服务层兜底：所有权或管理员权限校验（防越权）
    if (creator_user_id) {
      /* 通过 accounts 表将 creator_user_id 转为 account_id 做所有权比对 */
      const creatorAccount = await Account.findOne({
        where: { user_id: creator_user_id, account_type: 'user' },
        attributes: ['account_id'],
        transaction
      })
      const isOwner = creatorAccount && item.owner_account_id === creatorAccount.account_id

      if (!isOwner) {
        const userRoles = await getUserRoles(creator_user_id)

        if (userRoles.role_level < 100) {
          logger.error('服务层兜底：非所有者且非管理员尝试生成核销码', {
            creator_user_id,
            item_id,
            owner_account_id: item.owner_account_id,
            role_level: userRoles.role_level
          })
          throw new BusinessError(
            '权限不足：仅物品所有者或管理员可生成核销码',
            'REDEMPTION_INSUFFICIENT',
            400
          )
        }

        logger.info('服务层验证：管理员生成核销码', {
          admin_user_id: creator_user_id,
          item_id,
          owner_account_id: item.owner_account_id,
          role_level: userRoles.role_level
        })
      }
    } else {
      logger.warn('创建核销订单时未传入creator_user_id，无法执行权限兜底校验', {
        item_id
      })
    }

    // 2. 生成唯一核销码（最多重试3次）
    const code = await RedemptionCodeGenerator.generateUnique(
      async generatedCode => {
        const codeHash = RedemptionCodeGenerator.hash(generatedCode)
        const existing = await RedemptionOrder.findOne({
          where: { code_hash: codeHash },
          transaction
        })
        return !existing // 返回true表示唯一
      },
      3 // 最多重试3次
    )

    const codeHash = RedemptionCodeGenerator.hash(code)

    // 3. 计算过期时间（从 SystemSettings 读取可配置有效期，决策9/P8）
    const itemType = item.item_type || 'product'
    const settingKey =
      itemType === 'voucher' ? 'default_expiry_days_voucher' : 'default_expiry_days_product'
    const expiryDays = await AdminSystemService.getSettingValue(
      'redemption',
      settingKey,
      itemType === 'voucher' ? 30 : 7
    )

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + Number(expiryDays))

    // 4. 创建订单记录（order_no 先占位，插入后用 redemption_seq 生成 RD 统一单号）
    const placeholder_rd = `PH${crypto.randomBytes(12).toString('hex').toUpperCase()}`
    const order = await RedemptionOrder.create(
      {
        code_hash: codeHash,
        item_id,
        expires_at: expiresAt,
        status: 'pending',
        order_no: placeholder_rd,
        // 门店专属券：固化允许核销门店集合（通用券/merchant_all 为 NULL）
        scoped_store_id_list: scopedStoreIdList
      },
      { transaction }
    )
    await order.reload({ transaction })
    await order.update(
      {
        order_no: OrderNoGenerator.generate(
          'RD',
          order.redemption_seq,
          order.createdAt || order.created_at
        )
      },
      { transaction }
    )
    await order.reload({ transaction })

    /* 5. 通过 ItemService.holdItem 锁定物品（写入 item_holds 表） */
    await ItemService.holdItem(
      {
        item_id,
        hold_type: 'redemption',
        holder_ref: String(order.redemption_order_id),
        expires_at: expiresAt,
        reason: '兑换订单锁定'
      },
      { transaction }
    )

    logger.info('兑换订单创建成功（物品已通过 item_holds 锁定）', {
      item_id,
      order_id: order.redemption_order_id,
      hold_type: 'redemption',
      expires_at: expiresAt
    })

    // ⚠️ 明文码只返回一次，不再存储
    return { order, code }
  }

  /**
   * 核销订单
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * 业务流程：
   * 1. 验证核销码格式
   * 2. 计算哈希查找订单
   * 3. 检查订单状态和过期时间
   * 4. 更新订单状态（fulfilled）
   * 5. 标记物品已使用（used）
   *
   * @param {string} code - 12位Base32核销码（格式：XXXX-YYYY-ZZZZ）
   * @param {number} redeemer_user_id - 核销用户ID
   * @param {Object} options - 事务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} [options.store_id] - 核销门店ID（可选，不传则自动匹配 store_staff）
   * @param {number} [options.staff_id] - 核销员工ID（可选，不传则自动匹配 store_staff）
   * @returns {Promise<RedemptionOrder>} 核销后的订单对象
   * @throws {Error} 核销码格式错误、订单不存在、订单已使用、订单已过期等
   *
   * @example
   * const order = await RedemptionService.fulfillOrder('3K7J-2MQP-WXYZ', 123, { transaction })
   */
  static async fulfillOrder(code, redeemer_user_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'RedemptionService.fulfillOrder')

    logger.info('开始核销订单', {
      code_partial: code.slice(0, 4) + '****',
      redeemer_user_id
    })

    // 1. 验证核销码格式
    if (!RedemptionCodeGenerator.validate(code)) {
      throw new BusinessError('核销码格式错误', 'REDEMPTION_ERROR', 400)
    }

    // 2. 计算哈希查找订单
    const codeHash = RedemptionCodeGenerator.hash(code)

    const order = await RedemptionOrder.findOne({
      where: { code_hash: codeHash },
      include: [
        {
          model: Item,
          as: 'item'
        }
      ],
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      throw new BusinessError('核销码不存在', 'REDEMPTION_NOT_FOUND', 404)
    }

    // 3. 检查订单状态
    if (order.status === 'fulfilled') {
      throw new BusinessError('核销码已被使用', 'REDEMPTION_ERROR', 400)
    }

    if (order.status === 'cancelled') {
      throw new BusinessError('核销码已取消', 'REDEMPTION_ERROR', 400)
    }

    if (order.status === 'expired') {
      throw new BusinessError('核销码已过期', 'REDEMPTION_ERROR', 400)
    }

    // 4. 检查是否超过有效期
    if (order.isExpired()) {
      await order.update({ status: 'expired' }, { transaction })
      throw new BusinessError('核销码已超过有效期', 'REDEMPTION_EXCEEDED', 400)
    }

    // 5. 门店关联：自动查询核销人的 store_staff 绑定关系（决策8/P6）
    let fulfilledStoreId = options.store_id || null
    let fulfilledByStaffId = options.staff_id || null

    if (!fulfilledStoreId || !fulfilledByStaffId) {
      const staffRecord = await StoreStaff.findOne({
        where: {
          user_id: redeemer_user_id,
          status: 'active'
        },
        transaction
      })

      if (staffRecord) {
        fulfilledStoreId = fulfilledStoreId || staffRecord.store_id
        fulfilledByStaffId = fulfilledByStaffId || staffRecord.store_staff_id
        logger.info('自动匹配门店信息', {
          store_id: fulfilledStoreId,
          staff_id: fulfilledByStaffId,
          role_in_store: staffRecord.role_in_store
        })
      } else {
        logger.info('核销人无活跃 store_staff 记录，门店字段为空', {
          redeemer_user_id
        })
      }
    }

    // 5.5 商家一致性校验：物品 merchant_id 与核销门店 merchant_id 必须一致
    if (fulfilledStoreId && order.item?.merchant_id) {
      const store = await Store.findByPk(fulfilledStoreId, {
        attributes: ['store_id', 'merchant_id'],
        transaction
      })

      if (store && store.merchant_id !== order.item.merchant_id) {
        logger.error('商家一致性校验失败：物品商家与核销门店商家不匹配', {
          item_merchant_id: order.item.merchant_id,
          store_merchant_id: store.merchant_id,
          store_id: fulfilledStoreId,
          item_id: order.item_id
        })
        throw new BusinessError(
          `核销失败：物品归属商家(${order.item.merchant_id})与核销门店归属商家(${store.merchant_id})不匹配`,
          'REDEMPTION_FAILED',
          500
        )
      }
    }

    /*
     * 5.6 门店专属券范围校验：核销门店必须在固化的允许门店集合内（specified_stores）
     *     通用券/merchant_all 的 scoped_store_id_list 为 NULL，跳过此校验
     */
    if (Array.isArray(order.scoped_store_id_list) && order.scoped_store_id_list.length > 0) {
      if (!fulfilledStoreId || !order.scoped_store_id_list.includes(fulfilledStoreId)) {
        logger.warn('门店专属券范围校验失败：核销门店不在允许集合内', {
          fulfilled_store_id: fulfilledStoreId,
          scoped_store_id_list: order.scoped_store_id_list,
          order_id: order.redemption_order_id
        })
        throw new BusinessError('此券限指定门店核销', 'REDEMPTION_STORE_NOT_ALLOWED', 400)
      }
    }

    // 6. 更新订单状态
    await order.update(
      {
        status: 'fulfilled',
        redeemer_user_id,
        fulfilled_at: new Date(),
        fulfilled_store_id: fulfilledStoreId,
        fulfilled_by_staff_id: fulfilledByStaffId
      },
      { transaction }
    )

    // 7. 消耗物品（双录记账：用户→SYSTEM_BURN）
    if (order.item_id) {
      await ItemService.consumeItem(
        {
          item_id: order.item_id,
          operator_user_id: redeemer_user_id,
          business_type: 'redemption_use',
          idempotency_key: order.redemption_order_id,
          meta: {
            order_id: order.redemption_order_id,
            redeemer_user_id,
            store_id: fulfilledStoreId,
            staff_id: fulfilledByStaffId
          }
        },
        { transaction }
      )
    }

    logger.info('核销成功', {
      order_id: order.redemption_order_id,
      redeemer_user_id,
      store_id: fulfilledStoreId,
      staff_id: fulfilledByStaffId
    })

    return order
  }

  /**
   * 取消兑换订单
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {string} order_id - 订单ID（UUID）
   * @param {Object} options - 事务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<RedemptionOrder>} 取消后的订单对象
   * @throws {Error} 订单不存在、订单已核销等
   */
  static async cancelOrder(order_id, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'RedemptionService.cancelOrder')

    logger.info('开始取消订单', { order_id })

    const order = await RedemptionOrder.findByPk(order_id, {
      lock: transaction.LOCK.UPDATE,
      transaction,
      include: [
        {
          model: Item,
          as: 'item'
        }
      ]
    })

    if (!order) {
      throw new BusinessError('订单不存在', 'REDEMPTION_NOT_FOUND', 404)
    }

    if (order.status === 'fulfilled') {
      throw new BusinessError('订单已核销，不能取消', 'REDEMPTION_NOT_ALLOWED', 400)
    }

    if (order.status === 'cancelled') {
      // 幂等：已取消的订单再次取消，直接返回
      logger.info('订单已取消，幂等返回', { order_id })
      return order
    }

    // 更新订单状态为cancelled
    await order.update({ status: 'cancelled' }, { transaction })

    /*
     * 释放物品锁定（如果物品被该订单锁定）
     * 方案B升级：使用多级锁定机制，通过 lock_id 精确匹配
     */
    if (order.item) {
      // 通过 ItemService 释放锁定
      await ItemService.releaseHold(
        {
          item_id: order.item_id,
          hold_type: 'redemption',
          holder_ref: String(order.redemption_order_id)
        },
        { transaction }
      )
      logger.info('物品锁定已释放', {
        item_id: order.item_id,
        order_id,
        hold_type: 'redemption'
      })
    }

    logger.info('订单取消成功', { order_id, item_unlocked: true })

    return order
  }

  /**
   * 定时任务：清理过期订单
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * 业务规则：
   * - 批量更新 status = pending 且 expires_at < now 的订单
   * - 更新为 status = expired
   *
   * @param {Object} options - 事务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @returns {Promise<number>} 过期订单数量
   */
  static async expireOrders(options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'RedemptionService.expireOrders')

    logger.info('开始清理过期兑换订单')

    // 1. 查找所有过期的pending订单（需要关联物品实例以便解锁）
    const expiredOrders = await RedemptionOrder.findAll({
      where: {
        status: 'pending',
        expires_at: {
          [sequelize.Sequelize.Op.lt]: new Date()
        }
      },
      include: [
        {
          model: Item,
          as: 'item',
          required: false // LEFT JOIN，避免物品不存在时订单无法过期
        }
      ],
      transaction
    })

    if (expiredOrders.length === 0) {
      logger.info('无过期订单需要清理')
      return 0
    }

    // 2. 批量更新订单状态为expired
    const orderIds = expiredOrders.map(order => order.redemption_order_id)
    await RedemptionOrder.update(
      { status: 'expired' },
      {
        where: {
          redemption_order_id: orderIds
        },
        transaction
      }
    )

    /*
     * 3. 释放被这些订单锁定的物品
     * 方案B升级：使用多级锁定机制，通过 lock_id 精确匹配
     */
    let unlockedCount = 0
    for (const order of expiredOrders) {
      if (order.item) {
        // eslint-disable-next-line no-await-in-loop -- 批量解锁需要在事务内串行执行
        await ItemService.releaseHold(
          {
            item_id: order.item_id,
            hold_type: 'redemption',
            holder_ref: String(order.redemption_order_id)
          },
          { transaction }
        )
        unlockedCount++
      }
    }

    logger.info('过期订单清理完成', {
      expired_count: expiredOrders.length,
      unlocked_items: unlockedCount
    })

    return expiredOrders.length
  }

  /**
   * 查询订单详情
   *
   * @param {string} order_id - 订单ID（UUID）
   * @param {Object} [options] - 选项
   * @param {boolean} [options.include_item] - 是否包含物品实例信息
   * @param {boolean} [options.include_redeemer] - 是否包含核销人信息
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<RedemptionOrder>} 订单对象
   */
  static async getOrderDetail(order_id, options = {}) {
    const {
      include_item = false,
      include_redeemer = false,
      transaction = null,
      lock = null
    } = options

    const include = []

    if (include_item) {
      include.push({
        model: Item,
        as: 'item'
      })
    }

    if (include_redeemer) {
      include.push({
        model: User,
        as: 'redeemer',
        attributes: ['user_id', 'mobile', 'nickname']
      })
    }

    const queryOptions = { include, transaction }
    if (lock && transaction) {
      queryOptions.lock = lock
    }

    const order = await RedemptionOrder.findByPk(order_id, queryOptions)

    if (!order) {
      throw new BusinessError('订单不存在', 'REDEMPTION_NOT_FOUND', 404)
    }

    return order
  }

  /**
   * 查询物品的兑换订单
   *
   * @param {number} item_id - 物品ID
   * @param {Object} [options] - 选项
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<RedemptionOrder|null>} 订单对象或null
   */
  static async getOrderByItem(item_id, options = {}) {
    const { transaction = null } = options

    const order = await RedemptionOrder.findOne({
      where: { item_id },
      order: [['created_at', 'DESC']], // 获取最新的订单
      transaction
    })

    return order
  }

  /**
   * 管理员直接核销订单（通过 order_id，无需核销码）
   *
   * 业务场景：
   * - 管理员在后台直接核销用户的兑换订单
   * - 无需用户提供核销码，通过订单ID直接操作
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {string|number} order_id - 订单ID（UUID 或数字）
   * @param {Object} options - 事务和业务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.admin_user_id - 管理员用户ID（必填）
   * @param {number} [options.store_id] - 核销门店ID（可选）
   * @param {string} [options.remark] - 备注（可选）
   * @returns {Promise<RedemptionOrder>} 核销后的订单对象
   * @throws {Error} 订单不存在、订单已核销/已取消/已过期等
   *
   * @example
   * const order = await RedemptionService.adminFulfillOrderById(123, {
   *   transaction,
   *   admin_user_id: 456,
   *   store_id: 1,
   *   remark: '管理员手动核销'
   * })
   */
  static async adminFulfillOrderById(order_id, options = {}) {
    const transaction = assertAndGetTransaction(options, 'RedemptionService.adminFulfillOrderById')
    const { admin_user_id, store_id, staff_id, remark } = options

    if (!admin_user_id) {
      throw new BusinessError('admin_user_id 是必填参数', 'REDEMPTION_REQUIRED', 400)
    }

    logger.info('管理员开始核销订单', {
      order_id,
      admin_user_id,
      store_id,
      remark
    })

    // 1. 查找订单并锁定（防止并发操作）
    const order = await RedemptionOrder.findByPk(order_id, {
      include: [
        {
          model: Item,
          as: 'item'
        }
      ],
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      throw new BusinessError('订单不存在', 'REDEMPTION_NOT_FOUND', 404)
    }

    // 2. 检查订单状态
    if (order.status === 'fulfilled') {
      throw new BusinessError('订单已核销', 'REDEMPTION_ERROR', 400)
    }

    if (order.status === 'cancelled') {
      throw new BusinessError('订单已取消', 'REDEMPTION_ERROR', 400)
    }

    if (order.status === 'expired') {
      throw new BusinessError('订单已过期', 'REDEMPTION_ERROR', 400)
    }

    // 3. 检查是否超过有效期
    if (order.isExpired()) {
      await order.update({ status: 'expired' }, { transaction })
      throw new BusinessError('订单已超过有效期', 'REDEMPTION_EXCEEDED', 400)
    }

    // 4. 门店关联：自动查询核销人的 store_staff 绑定关系
    let fulfilledStoreId = store_id || null
    let fulfilledByStaffId = staff_id || null

    if (!fulfilledStoreId || !fulfilledByStaffId) {
      const staffRecord = await StoreStaff.findOne({
        where: {
          user_id: admin_user_id,
          status: 'active'
        },
        transaction
      })

      if (staffRecord) {
        fulfilledStoreId = fulfilledStoreId || staffRecord.store_id
        fulfilledByStaffId = fulfilledByStaffId || staffRecord.store_staff_id
      }
    }

    // 4.5 商家一致性校验：物品 merchant_id 与核销门店 merchant_id 必须一致
    if (fulfilledStoreId && order.item?.merchant_id) {
      const checkStore = await Store.findByPk(fulfilledStoreId, {
        attributes: ['store_id', 'merchant_id'],
        transaction
      })

      if (checkStore && checkStore.merchant_id !== order.item.merchant_id) {
        logger.error('管理员核销 - 商家一致性校验失败', {
          item_merchant_id: order.item.merchant_id,
          store_merchant_id: checkStore.merchant_id,
          store_id: fulfilledStoreId,
          item_id: order.item_id,
          admin_user_id
        })
        throw new BusinessError(
          `核销失败：物品归属商家(${order.item.merchant_id})与核销门店归属商家(${checkStore.merchant_id})不匹配`,
          'REDEMPTION_FAILED',
          500
        )
      }
    }

    // 4.6 门店专属券范围校验：核销门店必须在固化的允许门店集合内（specified_stores）
    if (Array.isArray(order.scoped_store_id_list) && order.scoped_store_id_list.length > 0) {
      if (!fulfilledStoreId || !order.scoped_store_id_list.includes(fulfilledStoreId)) {
        logger.warn('管理员核销 - 门店专属券范围校验失败：核销门店不在允许集合内', {
          fulfilled_store_id: fulfilledStoreId,
          scoped_store_id_list: order.scoped_store_id_list,
          order_id: order.redemption_order_id,
          admin_user_id
        })
        throw new BusinessError('此券限指定门店核销', 'REDEMPTION_STORE_NOT_ALLOWED', 400)
      }
    }

    // 5. 执行核销
    await order.update(
      {
        status: 'fulfilled',
        redeemer_user_id: admin_user_id,
        fulfilled_at: new Date(),
        fulfilled_store_id: fulfilledStoreId,
        fulfilled_by_staff_id: fulfilledByStaffId
      },
      { transaction }
    )

    // 6. 消耗物品（双录记账：用户→SYSTEM_BURN）
    if (order.item_id) {
      await ItemService.consumeItem(
        {
          item_id: order.item_id,
          operator_user_id: admin_user_id,
          business_type: 'admin_redemption_fulfill',
          idempotency_key: `admin_fulfill_${order.redemption_order_id}`,
          meta: {
            order_id: order.redemption_order_id,
            admin_user_id,
            store_id: fulfilledStoreId,
            staff_id: fulfilledByStaffId,
            remark
          }
        },
        { transaction }
      )
    }

    logger.info('管理员核销订单成功', {
      order_id: order.redemption_order_id,
      admin_user_id,
      store_id: fulfilledStoreId,
      staff_id: fulfilledByStaffId,
      remark
    })

    return order
  }

  /**
   * 管理员取消订单（通过 order_id）
   *
   * 业务场景：
   * - 管理员在后台取消用户的兑换订单
   * - 释放关联的物品锁定，恢复物品可用状态
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {string|number} order_id - 订单ID（UUID 或数字）
   * @param {Object} options - 事务和业务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.admin_user_id - 管理员用户ID（必填）
   * @param {string} [options.reason] - 取消原因（可选）
   * @returns {Promise<RedemptionOrder>} 取消后的订单对象
   * @throws {Error} 订单不存在、订单已核销等
   *
   * @example
   * const order = await RedemptionService.adminCancelOrderById(123, {
   *   transaction,
   *   admin_user_id: 456,
   *   reason: '用户申请取消'
   * })
   */
  static async adminCancelOrderById(order_id, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'RedemptionService.adminCancelOrderById')
    const { admin_user_id, reason } = options

    if (!admin_user_id) {
      throw new BusinessError('admin_user_id 是必填参数', 'REDEMPTION_REQUIRED', 400)
    }

    logger.info('管理员开始取消订单', { order_id, admin_user_id, reason })

    // 1. 查找订单并锁定
    const order = await RedemptionOrder.findByPk(order_id, {
      include: [
        {
          model: Item,
          as: 'item'
        }
      ],
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    if (!order) {
      throw new BusinessError('订单不存在', 'REDEMPTION_NOT_FOUND', 404)
    }

    // 2. 检查订单状态
    if (order.status === 'fulfilled') {
      throw new BusinessError('订单已核销，不能取消', 'REDEMPTION_NOT_ALLOWED', 400)
    }

    if (order.status === 'cancelled') {
      // 幂等：已取消的订单再次取消，直接返回
      logger.info('订单已取消，幂等返回', { order_id, admin_user_id })
      return order
    }

    // 3. 更新订单状态为 cancelled
    await order.update({ status: 'cancelled' }, { transaction })

    // 4. 释放物品锁定（如果物品被该订单锁定）
    if (order.item) {
      await ItemService.releaseHold(
        {
          item_id: order.item_id,
          hold_type: 'redemption',
          holder_ref: String(order.redemption_order_id)
        },
        { transaction }
      )
      logger.info('物品锁定已释放', {
        item_id: order.item_id,
        order_id,
        hold_type: 'redemption',
        admin_user_id
      })
    }

    logger.info('管理员取消订单成功', {
      order_id: order.redemption_order_id,
      admin_user_id,
      reason,
      item_unlocked: true
    })

    return order
  }

  /**
   * 批量过期核销订单（管理员操作）
   *
   * 业务场景：
   * - 管理员主动将指定的 pending 状态订单批量设为过期
   * - 释放关联的物品锁定
   *
   * 事务边界治理（2026-01-05 决策）：
   * - 强制要求外部事务传入（options.transaction）
   * - 未提供事务时直接报错，由入口层统一管理事务
   *
   * @param {Array<string|number>} order_ids - 订单ID数组
   * @param {Object} options - 事务和业务选项
   * @param {Object} options.transaction - Sequelize事务对象（必填）
   * @param {number} options.admin_user_id - 管理员用户ID（必填）
   * @param {string} [options.reason] - 过期原因（可选）
   * @returns {Promise<Object>} 操作结果 { expired_count, unlocked_count, failed_orders }
   *
   * @example
   * const result = await RedemptionService.adminBatchExpireOrders([1, 2, 3], {
   *   transaction,
   *   admin_user_id: 456,
   *   reason: '管理员手动过期'
   * })
   */

  /**
   * 管理员批量核销订单
   *
   * 业务规则：
   * - 仅处理 pending 状态的订单
   * - 已过期的订单自动标记为 expired，不执行核销
   * - 逐单调用 adminFulfillOrderById 保证数据完整性
   *
   * @param {Array<number|string>} order_ids - 待核销的订单ID数组
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.admin_user_id - 管理员用户ID（必填）
   * @param {number} [options.store_id] - 核销门店ID（可选）
   * @param {string} [options.remark] - 备注（可选）
   * @returns {Promise<Object>} 操作结果 { fulfilled_count, failed_orders }
   */
  static async adminBatchFulfillOrders(order_ids, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'RedemptionService.adminBatchFulfillOrders'
    )
    const { admin_user_id, store_id, remark } = options

    if (!admin_user_id) {
      throw new BusinessError('admin_user_id 是必填参数', 'REDEMPTION_REQUIRED', 400)
    }

    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      throw new BusinessError('order_ids 必须是非空数组', 'REDEMPTION_REQUIRED', 400)
    }

    logger.info('管理员开始批量核销订单', {
      order_count: order_ids.length,
      admin_user_id,
      store_id
    })

    let fulfilledCount = 0
    const failedOrders = []

    for (const order_id of order_ids) {
      try {
        // eslint-disable-next-line no-await-in-loop -- 逐单核销保证数据完整性
        await RedemptionService.adminFulfillOrderById(order_id, {
          transaction,
          admin_user_id,
          store_id,
          remark: remark || '批量核销'
        })
        fulfilledCount++
      } catch (error) {
        logger.warn('批量核销中单个订单失败', {
          order_id,
          reason: error.message
        })
        failedOrders.push({
          order_id,
          reason: error.message
        })
      }
    }

    logger.info('管理员批量核销订单完成', {
      fulfilled_count: fulfilledCount,
      failed_count: failedOrders.length,
      admin_user_id
    })

    return {
      fulfilled_count: fulfilledCount,
      failed_orders: failedOrders
    }
  }

  /**
   * 管理员批量过期订单
   *
   * @param {Array<number|string>} order_ids - 待过期的订单ID数组
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.admin_user_id - 管理员用户ID（必填）
   * @param {string} [options.reason] - 过期原因（可选）
   * @returns {Promise<Object>} 操作结果 { expired_count, unlocked_count, failed_orders }
   */
  static async adminBatchExpireOrders(order_ids, options = {}) {
    // 强制要求事务边界 - 2026-01-05 治理决策
    const transaction = assertAndGetTransaction(options, 'RedemptionService.adminBatchExpireOrders')
    const { admin_user_id, reason } = options

    if (!admin_user_id) {
      throw new BusinessError('admin_user_id 是必填参数', 'REDEMPTION_REQUIRED', 400)
    }

    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      throw new BusinessError('order_ids 必须是非空数组', 'REDEMPTION_REQUIRED', 400)
    }

    logger.info('管理员开始批量过期订单', {
      order_count: order_ids.length,
      admin_user_id,
      reason
    })

    // 1. 查找所有符合条件的 pending 订单
    const orders = await RedemptionOrder.findAll({
      where: {
        redemption_order_id: order_ids,
        status: 'pending'
      },
      include: [
        {
          model: Item,
          as: 'item',
          required: false
        }
      ],
      transaction
    })

    if (orders.length === 0) {
      logger.info('无符合条件的订单需要过期', { order_ids, admin_user_id })
      return { expired_count: 0, unlocked_count: 0, failed_orders: [] }
    }

    // 2. 批量更新订单状态为 expired
    const validOrderIds = orders.map(order => order.redemption_order_id)
    await RedemptionOrder.update(
      { status: 'expired' },
      {
        where: { redemption_order_id: validOrderIds },
        transaction
      }
    )

    // 3. 释放被这些订单锁定的物品
    let unlockedCount = 0
    for (const order of orders) {
      if (order.item) {
        // eslint-disable-next-line no-await-in-loop -- 批量解锁需要在事务内串行执行
        await ItemService.releaseHold(
          {
            item_id: order.item_id,
            hold_type: 'redemption',
            holder_ref: String(order.redemption_order_id)
          },
          { transaction }
        )
        unlockedCount++
      }
    }

    // 4. 计算失败的订单（在 order_ids 中但不在 validOrderIds 中）
    const failedOrders = order_ids.filter(id => !validOrderIds.includes(id))

    logger.info('管理员批量过期订单完成', {
      expired_count: orders.length,
      unlocked_count: unlockedCount,
      failed_count: failedOrders.length,
      admin_user_id,
      reason
    })

    return {
      expired_count: orders.length,
      unlocked_count: unlockedCount,
      failed_orders: failedOrders
    }
  }

  /**
   * 管理员批量取消订单
   *
   * 业务场景：
   * - 管理员在后台一次性取消多个 pending 状态的兑换订单
   * - 释放所有关联的物品锁定，恢复物品可用状态
   * - 逐单调用 adminCancelOrderById 保证物品锁释放完整性
   *
   * @param {Array<number|string>} order_ids - 待取消的订单ID数组
   * @param {Object} options - 操作选项
   * @param {Object} options.transaction - 事务对象（必填）
   * @param {number} options.admin_user_id - 管理员用户ID（必填）
   * @param {string} [options.reason] - 取消原因（可选）
   * @returns {Promise<Object>} 操作结果 { cancelled_count, failed_orders }
   */
  static async adminBatchCancelOrders(order_ids, options = {}) {
    const transaction = assertAndGetTransaction(options, 'RedemptionService.adminBatchCancelOrders')
    const { admin_user_id, reason } = options

    if (!admin_user_id) {
      throw new BusinessError('admin_user_id 是必填参数', 'REDEMPTION_REQUIRED', 400)
    }

    if (!Array.isArray(order_ids) || order_ids.length === 0) {
      throw new BusinessError('order_ids 必须是非空数组', 'REDEMPTION_REQUIRED', 400)
    }

    logger.info('管理员开始批量取消订单', {
      order_count: order_ids.length,
      admin_user_id,
      reason
    })

    let cancelledCount = 0
    const failedOrders = []

    for (const order_id of order_ids) {
      try {
        // eslint-disable-next-line no-await-in-loop -- 逐单取消保证物品锁释放完整性
        await RedemptionService.adminCancelOrderById(order_id, {
          transaction,
          admin_user_id,
          reason: reason || '批量取消'
        })
        cancelledCount++
      } catch (error) {
        logger.warn('批量取消中单个订单失败', {
          order_id,
          reason: error.message
        })
        failedOrders.push({
          order_id,
          reason: error.message
        })
      }
    }

    logger.info('管理员批量取消订单完成', {
      cancelled_count: cancelledCount,
      failed_count: failedOrders.length,
      admin_user_id
    })

    return {
      cancelled_count: cancelledCount,
      failed_orders: failedOrders
    }
  }

  /**
   * 按兑换记录回溯兑换商品 SPU，解析门店专属券允许核销门店集合（固化用）
   *
   * 链路：items.source_ref_id（= exchange_records.exchange_record_id）
   *   → exchange_records.exchange_item_id → exchange_items.applicable_scope / scoped_store_ids
   *
   * @param {string} sourceRefId - 物品来源关联ID（兑换来源即 exchange_record_id 的字符串）
   * @param {Object} transaction - Sequelize 事务对象
   * @returns {Promise<number[]|null>} specified_stores 时返回门店ID数组；其它（all/merchant_all/无法回溯）返回 null
   */
  static async _resolveScopedStoresFromExchange(sourceRefId, transaction) {
    const recordId = parseInt(sourceRefId, 10)
    if (!Number.isInteger(recordId)) return null

    const record = await ExchangeRecord.findByPk(recordId, {
      attributes: ['exchange_record_id', 'exchange_item_id'],
      transaction
    })
    if (!record || !record.exchange_item_id) return null

    const spu = await ExchangeItem.findByPk(record.exchange_item_id, {
      attributes: ['exchange_item_id', 'applicable_scope', 'scoped_store_ids'],
      transaction
    })
    if (!spu) return null

    // 仅 specified_stores 固化门店集合；all/merchant_all 返回 NULL（merchant_all 走物品商家一致性校验）
    if (spu.applicable_scope === 'specified_stores' && Array.isArray(spu.scoped_store_ids)) {
      const ids = spu.scoped_store_ids.map(n => parseInt(n, 10)).filter(Number.isInteger)
      return ids.length > 0 ? ids : null
    }
    return null
  }

  /**
   * 本店核销概况（小程序看板，接口1）
   *
   * 口径（全部落在 redemption_orders 单表，按登录身份门店隔离、不下发用户 PII）：
   * - fulfilled_count：status='fulfilled' AND fulfilled_store_id=store_id（本店已核销）
   * - pending_count：status='pending' AND JSON_CONTAINS(scoped_store_id_list, store_id)（仅门店专属券计入）
   *
   * @param {number} storeId - 门店ID
   * @returns {Promise<{store_id:number, pending_count:number, fulfilled_count:number}>} 本店核销概况数字
   */
  static async getStoreRedemptionStats(storeId) {
    const sid = parseInt(storeId, 10)
    if (!Number.isInteger(sid)) {
      throw new BusinessError('store_id 必须是整数', 'REDEMPTION_INVALID_PARAM', 400)
    }

    const fulfilledCount = await RedemptionOrder.count({
      where: { status: 'fulfilled', fulfilled_store_id: sid }
    })

    // 门店专属券「本店待核销」：pending 且 scoped_store_id_list 包含本店（JSON_CONTAINS）
    const [pendingRows] = await sequelize.query(
      `SELECT COUNT(*) AS cnt FROM redemption_orders
       WHERE status = 'pending'
         AND scoped_store_id_list IS NOT NULL
         AND JSON_CONTAINS(scoped_store_id_list, CAST(:sid AS JSON))`,
      { replacements: { sid } }
    )
    const pendingCount = Number(pendingRows?.[0]?.cnt || 0)

    return { store_id: sid, pending_count: pendingCount, fulfilled_count: fulfilledCount }
  }

  /**
   * 设置店员「查看本店核销概况」授权（接口2）
   *
   * 权限：操作人须为该 store_staff.store_id 的 active manager，或平台管理员（role_level>=100）。
   * 仅能对本店 role_in_store='staff' 的记录授权；manager 恒可看不允许改此标志。
   *
   * @param {number} storeStaffId - 目标员工 store_staff 记录ID
   * @param {boolean} canView - 是否授权查看
   * @param {Object} options - { transaction, operator_user_id, operator_role_level }
   * @returns {Promise<{store_staff_id:number, can_view_redemption_stats:boolean}>} 更新后的授权结果
   */
  static async setStaffRedemptionStatsPermission(storeStaffId, canView, options = {}) {
    const transaction = assertAndGetTransaction(
      options,
      'RedemptionService.setStaffRedemptionStatsPermission'
    )
    const { operator_user_id, operator_role_level = 0 } = options

    const target = await StoreStaff.findByPk(storeStaffId, {
      lock: transaction.LOCK.UPDATE,
      transaction
    })
    if (!target) {
      throw new BusinessError('员工记录不存在', 'REDEMPTION_NOT_FOUND', 404)
    }
    if (target.role_in_store !== 'staff') {
      throw new BusinessError(
        '仅可对店员(staff)授权，店长默认可查看',
        'REDEMPTION_NOT_ALLOWED',
        400
      )
    }

    // 平台管理员直接放行；否则操作人须为该门店 active manager
    const isPlatformAdmin = operator_role_level >= 100
    if (!isPlatformAdmin) {
      const operatorManager = await StoreStaff.findOne({
        where: {
          user_id: operator_user_id,
          store_id: target.store_id,
          role_in_store: 'manager',
          status: 'active'
        },
        transaction
      })
      if (!operatorManager) {
        throw new BusinessError(
          '无权限：仅本店店长或平台管理员可授权',
          'REDEMPTION_STATS_FORBIDDEN',
          403
        )
      }
    }

    await target.update({ can_view_redemption_stats: !!canView }, { transaction })

    return {
      store_staff_id: Number(target.store_staff_id),
      can_view_redemption_stats: !!target.can_view_redemption_stats
    }
  }

  /**
   * 校验某用户是否可查看指定门店核销概况（接口1鉴权用）
   *
   * 口径：manager 恒可看；staff 仅当 can_view_redemption_stats=1；平台管理员放行。
   *
   * @param {number} userId - 登录用户ID
   * @param {number} storeId - 门店ID
   * @param {number} [roleLevel=0] - 登录用户平台角色等级（>=100 视为平台管理员）
   * @returns {Promise<boolean>} 是否有权查看
   */
  static async canUserViewStoreStats(userId, storeId, roleLevel = 0) {
    if (roleLevel >= 100) return true
    const staff = await StoreStaff.findOne({
      where: { user_id: userId, store_id: storeId, status: 'active' }
    })
    if (!staff) return false
    if (staff.role_in_store === 'manager') return true
    return !!staff.can_view_redemption_stats
  }

  /**
   * 运营级门店核销看板（接口4，console）
   *
   * @param {Object} filters - { store_id?, applicable_scope?, start_date?, end_date? }
   * @returns {Promise<Object>} { summary, by_store[], general_voucher }
   */
  static async getStoreRedemptionOverview(filters = {}) {
    const { Op } = require('sequelize')
    const expiringDays = Number(process.env.REDEMPTION_EXPIRING_SOON_DAYS) || 3

    // 时间范围过滤（按 created_at，北京时间由 DB 存储 UTC、查询用 Date 比较）
    const timeWhere = {}
    if (filters.start_date) timeWhere[Op.gte] = new Date(filters.start_date)
    if (filters.end_date) timeWhere[Op.lte] = new Date(filters.end_date)
    const hasTime = Object.getOwnPropertySymbols(timeWhere).length > 0

    // 已核销：按 fulfilled_store_id 分组
    const fulfilledWhere = { status: 'fulfilled', fulfilled_store_id: { [Op.ne]: null } }
    if (hasTime) fulfilledWhere.created_at = timeWhere
    if (filters.store_id) fulfilledWhere.fulfilled_store_id = parseInt(filters.store_id, 10)

    const fulfilledRows = await RedemptionOrder.findAll({
      attributes: [
        'fulfilled_store_id',
        [sequelize.fn('COUNT', sequelize.col('redemption_order_id')), 'cnt']
      ],
      where: fulfilledWhere,
      group: ['fulfilled_store_id'],
      raw: true
    })

    // 门店专属券待核销：pending 且 scoped_store_id_list 非空，按门店展开统计
    const pendingRows = await RedemptionOrder.findAll({
      attributes: ['scoped_store_id_list'],
      where: { status: 'pending', scoped_store_id_list: { [Op.ne]: null } },
      raw: true
    })

    // 门店名映射
    const stores = await Store.findAll({ attributes: ['store_id', 'store_name'], raw: true })
    const storeNameMap = new Map(stores.map(s => [s.store_id, s.store_name]))

    // 聚合 by_store
    const byStoreMap = new Map()
    const ensure = sid => {
      if (!byStoreMap.has(sid)) {
        byStoreMap.set(sid, {
          store_id: sid,
          store_name: storeNameMap.get(sid) || null,
          pending_count: 0,
          fulfilled_count: 0,
          fulfill_rate: 0
        })
      }
      return byStoreMap.get(sid)
    }
    fulfilledRows.forEach(r => {
      ensure(r.fulfilled_store_id).fulfilled_count = Number(r.cnt)
    })
    pendingRows.forEach(r => {
      const list = Array.isArray(r.scoped_store_id_list) ? r.scoped_store_id_list : []
      list.forEach(sid => {
        const id = parseInt(sid, 10)
        if (!filters.store_id || id === parseInt(filters.store_id, 10)) {
          ensure(id).pending_count += 1
        }
      })
    })

    const byStore = [...byStoreMap.values()].map(row => {
      const total = row.pending_count + row.fulfilled_count
      row.fulfill_rate = total > 0 ? Math.round((row.fulfilled_count / total) * 10000) / 100 : 0
      return row
    })

    // 汇总卡 + 临期未核销（pending 门店专属券且 expires_at 在 expiringDays 天内）
    const summaryPending = byStore.reduce((s, r) => s + r.pending_count, 0)
    const summaryFulfilled = byStore.reduce((s, r) => s + r.fulfilled_count, 0)
    const summaryTotal = summaryPending + summaryFulfilled
    const expiringSoonCount = await RedemptionOrder.count({
      where: {
        status: 'pending',
        scoped_store_id_list: { [Op.ne]: null },
        expires_at: {
          [Op.gte]: new Date(),
          [Op.lte]: new Date(Date.now() + expiringDays * 24 * 60 * 60 * 1000)
        }
      }
    })

    // 通用券（scoped_store_id_list IS NULL）已核销按落地门店分布
    const generalRows = await RedemptionOrder.findAll({
      attributes: [
        'fulfilled_store_id',
        [sequelize.fn('COUNT', sequelize.col('redemption_order_id')), 'cnt']
      ],
      where: {
        status: 'fulfilled',
        scoped_store_id_list: { [Op.is]: null },
        fulfilled_store_id: { [Op.ne]: null }
      },
      group: ['fulfilled_store_id'],
      raw: true
    })
    const generalFulfilled = generalRows.reduce((s, r) => s + Number(r.cnt), 0)

    return {
      summary: {
        pending_count: summaryPending,
        fulfilled_count: summaryFulfilled,
        fulfill_rate:
          summaryTotal > 0 ? Math.round((summaryFulfilled / summaryTotal) * 10000) / 100 : 0,
        expiring_soon_count: expiringSoonCount
      },
      by_store: byStore,
      general_voucher: {
        fulfilled_count: generalFulfilled,
        by_store_distribution: generalRows.map(r => ({
          store_id: r.fulfilled_store_id,
          store_name: storeNameMap.get(r.fulfilled_store_id) || null,
          fulfilled_count: Number(r.cnt)
        }))
      }
    }
  }

  /**
   * 获取用户的兑换/核销订单列表
   *
   * 复用入口：客服工作台（按用户查全部订单）与小程序「我的核销订单」（按 status 过滤 + 分页）共用。
   *
   * @param {number} userId - 核销用户ID（redeemer_user_id）
   * @param {Object} [options={}] - 查询选项
   * @param {string} [options.status] - 订单状态过滤（pending/fulfilled/cancelled/expired），不传则全部
   * @param {number} [options.page=1] - 页码（1-based）
   * @param {number} [options.page_size=20] - 每页数量（上限 50）
   * @returns {Promise<{count: number, rows: RedemptionOrder[]}>} 分页结果（rows 含关联 item 摘要）
   */
  static async getUserOrders(userId, options = {}) {
    const { status, page = 1, page_size = 20 } = options
    const where = { redeemer_user_id: parseInt(userId) }
    // 状态过滤：小程序「可申诉的已核销订单」传 status='fulfilled'
    if (status) {
      where.status = status
    }
    const limit = Math.min(parseInt(page_size, 10) || 20, 50)
    const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit
    return await RedemptionOrder.findAndCountAll({
      where,
      // fulfilled_at：已核销时间，小程序「我的核销订单」展示与售后入口判断用
      attributes: [
        'redemption_order_id',
        'order_no',
        'status',
        'fulfilled_at',
        'created_at',
        'item_id'
      ],
      // item 摘要：真实库 items 表字段为 item_name（无 display_name），前端零映射直读
      include: [{ model: Item, as: 'item', attributes: ['item_id', 'item_name'] }],
      order: [['created_at', 'DESC']],
      limit,
      offset
    })
  }
}

module.exports = RedemptionService
