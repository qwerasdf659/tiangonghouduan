/**
 * 餐厅积分抽奖系统 V4.5.0 - 兑换市场服务（ExchangeMarketService）
 * 🔥 Phase 3已迁移：使用统一账本（AssetService）扣减材料资产
 *
 * 业务场景：用户使用材料资产兑换实物商品
 *
 * 核心功能：
 * 1. 商品列表查询（支持分类、排序、分页）
 * 2. 商品兑换（使用材料资产支付：cost_asset_code + cost_amount）
 * 3. 订单管理（查询订单、订单详情）
 *
 * Phase 3改造要点：
 * - ✅ 使用AssetService.changeBalance()替代MaterialService.consume()
 * - ✅ 业务类型：exchange_debit（兑换市场材料扣减）
 * - ✅ 统一business_id：订单级幂等键，不再使用_material_deduct后缀
 * - ✅ 余额来源：统一从account_asset_balances读取，不再依赖旧余额表
 * - ✅ 409冲突检查：已在ExchangeMarketService层实现，参数不同返回409
 *
 * 支付方式（V4.5.0）：
 * - ✅ 材料资产支付：从统一账本扣除材料资产（cost_asset_code + cost_amount）
 * - ❌ 积分支付：已废弃，不再支持
 * - ❌ 混合支付：已废弃，不再支持
 * - ❌ 虚拟奖品支付：已废弃，统一为材料资产支付
 *
 * 业务规则（强制）：
 * - ✅ 兑换只能使用材料资产（必须配置cost_asset_code和cost_amount）
 * - ❌ 禁止扣除 available_points（显示积分）
 * - ❌ 禁止检查/扣除 remaining_budget_points（预算积分）
 * - ✅ points_paid 必须强制为 0
 * - ✅ payment_type 必须为 'material'（材料资产支付）
 *
 * 业务流程：
 *
 * 1. **用户查看商品列表**
 *    - 调用getMarketItems() → 返回可兑换商品列表
 *    - 前端展示商品信息（名称、价格、库存）
 *
 * 2. **用户兑换商品流程**
 *    - 用户选择商品和数量
 *    - 调用exchangeItem() → 检查库存 → 检查虚拟奖品价值
 *    - 扣除虚拟奖品价值 → 创建订单 → 扣减库存
 *    - 返回订单信息
 *
 * 3. **订单查询流程**
 *    - 调用getUserOrders() → 返回用户订单列表
 *    - 支持状态筛选（pending/completed/shipped/cancelled）
 *
 * 职责定位（与其他服务的区别）：
 * - **应用层服务**：专注新兑换市场业务（ExchangeItem + ExchangeMarketRecord）
 * - **与ExchangeOperationService的区别**：
 *   - （已删除）ExchangeOperationService：处理旧兑换系统（ExchangeRecords）的运营管理
 *   - ExchangeMarketService：处理新兑换市场（ExchangeItem）的用户兑换业务
 *
 * 数据模型关联：
 * - ExchangeItem：兑换市场商品表（price_type='virtual', virtual_value_price, points_price仅展示）
 * - ExchangeMarketRecord：兑换订单表（payment_type='virtual', virtual_value_paid, points_paid=0）
 * - UserInventory：用户库存表（虚拟奖品存储，virtual_value_points）
 * - UserPointsAccount：积分账户表（available_points - 兑换时不扣除）
 *
 * 业务规则：
 * - 虚拟奖品价值从背包扣除（抽奖时已扣除预算积分）
 * - 兑换时使用事务确保原子性（扣除+创建订单+扣减库存）
 * - 商品库存不足时拒绝兑换
 * - 订单号格式：EM{timestamp}{random}（EM = Exchange Market）
 *
 * 创建时间：2025年12月06日
 * 最后修改：2025年12月08日 - 删除points/mixed支付方式，统一为virtual
 * 使用模型：Claude Sonnet 4.5
 */

const { ExchangeItem, ExchangeMarketRecord, UserInventory, sequelize } = require('../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

/**
 * 🎯 统一数据输出视图常量（Data Output View Constants）
 *
 * 业务场景（Business Scenario）：
 * - 统一管理兑换市场领域的数据输出字段，避免字段选择分散在各方法
 * - 符合架构规范：与积分领域的 POINTS_ATTRIBUTES、库存领域的 INVENTORY_ATTRIBUTES 模式保持一致
 * - 根据权限级别（用户/管理员）和业务场景返回不同的数据字段，保护敏感信息
 *
 * 设计原则（Design Principles）：
 * - marketItemView：市场商品列表视图 - 用户浏览商品列表时返回的字段
 * - marketItemDetailView：商品详情视图 - 用户查看商品详情时返回的字段
 * - adminMarketItemView：管理员商品视图 - 管理员查看商品时返回的字段（包含敏感信息）
 * - marketOrderView：用户订单视图 - 用户查看自己的订单时返回的字段
 * - adminMarketOrderView：管理员订单视图 - 管理员查看订单时返回的字段（包含所有字段）
 *
 * 使用示例（Usage Example）：
 * ```javascript
 * // 用户浏览商品列表
 * const items = await ExchangeItem.findAll({
 *   where: { status: 'active' },
 *   attributes: EXCHANGE_MARKET_ATTRIBUTES.marketItemView
 * });
 *
 * // 管理员查看商品（包含成本价等敏感信息）
 * const items = await ExchangeItem.findAll({
 *   attributes: EXCHANGE_MARKET_ATTRIBUTES.adminMarketItemView
 * });
 *
 * // 用户查看自己的订单
 * const orders = await ExchangeMarketRecord.findAll({
 *   where: { user_id: userId },
 *   attributes: EXCHANGE_MARKET_ATTRIBUTES.marketOrderView
 * });
 * ```
 */
const EXCHANGE_MARKET_ATTRIBUTES = {
  /**
   * 市场商品列表视图（Market Item List View）
   * 用户浏览商品列表时返回的字段
   * 不包含敏感字段：cost_price（成本价）、total_exchange_count（总兑换次数）
   */
  marketItemView: [
    'item_id', // 商品ID（Item ID）
    'item_name', // 商品名称（Item Name）
    'item_description', // 商品描述（Item Description）
    'price_type', // 支付方式：virtual/points/mixed（Price Type）
    'virtual_value_price', // 虚拟价值价格（Virtual Value Price）
    'points_price', // 积分价格（Points Price）
    'stock', // 库存（Stock）
    'sort_order', // 排序（Sort Order）
    'status', // 状态：active/inactive（Status）
    'created_at' // 创建时间（Created At）
  ],

  /**
   * 商品详情视图（Market Item Detail View）
   * 用户查看商品详情时返回的字段
   * 包含商品的完整信息（除敏感字段外）
   */
  marketItemDetailView: [
    'item_id', // 商品ID（Item ID）
    'item_name', // 商品名称（Item Name）
    'item_description', // 商品描述（Item Description）
    'price_type', // 支付方式（Price Type）
    'virtual_value_price', // 虚拟价值价格（Virtual Value Price）
    'points_price', // 积分价格（Points Price）
    'stock', // 库存（Stock）
    'total_exchange_count', // 总兑换次数（Total Exchange Count - 展示商品热度）
    'sort_order', // 排序（Sort Order）
    'status', // 状态（Status）
    'created_at', // 创建时间（Created At）
    'updated_at' // 更新时间（Updated At）
  ],

  /**
   * 管理员商品视图（Admin Market Item View）
   * 管理员查看商品时返回的字段
   * 包含所有字段，用于后台管理和数据分析
   */
  adminMarketItemView: [
    'item_id', // 商品ID（Item ID）
    'item_name', // 商品名称（Item Name）
    'item_description', // 商品描述（Item Description）
    'price_type', // 支付方式（Price Type）
    'virtual_value_price', // 虚拟价值价格（Virtual Value Price）
    'points_price', // 积分价格（Points Price）
    'cost_price', // 成本价（Cost Price - 敏感信息，仅管理员可见）
    'stock', // 库存（Stock）
    'total_exchange_count', // 总兑换次数（Total Exchange Count）
    'sort_order', // 排序（Sort Order）
    'status', // 状态（Status）
    'created_at', // 创建时间（Created At）
    'updated_at' // 更新时间（Updated At）
  ],

  /**
   * 用户订单视图（Market Order View）
   * 用户查看自己的订单时返回的字段
   * 不包含管理员备注等管理信息
   */
  marketOrderView: [
    'record_id', // 订单记录ID（Record ID）
    'order_no', // 订单号（Order Number）
    'user_id', // 用户ID（User ID）
    'item_id', // 商品ID（Item ID）
    'item_snapshot', // 商品快照（Item Snapshot）
    'quantity', // 数量（Quantity）
    'payment_type', // 支付方式：virtual/points/mixed（Payment Type）
    'virtual_value_paid', // 虚拟价值支付（Virtual Value Paid）
    'points_paid', // 积分支付（Points Paid）
    'status', // 状态：pending/completed/shipped/cancelled（Status）
    'exchange_time', // 兑换时间（Exchange Time）
    'shipped_at', // 发货时间（Shipped At）
    'created_at', // 创建时间（Created At）
    'updated_at' // 更新时间（Updated At）
  ],

  /**
   * 管理员订单视图（Admin Market Order View）
   * 管理员查看订单时返回的字段
   * 包含所有字段，用于后台管理和数据分析
   */
  adminMarketOrderView: [
    'record_id', // 订单记录ID（Record ID）
    'order_no', // 订单号（Order Number）
    'user_id', // 用户ID（User ID）
    'item_id', // 商品ID（Item ID）
    'item_snapshot', // 商品快照（Item Snapshot）
    'quantity', // 数量（Quantity）
    'payment_type', // 支付方式（Payment Type）
    'virtual_value_paid', // 虚拟价值支付（Virtual Value Paid）
    'points_paid', // 积分支付（Points Paid）
    'total_cost', // 总成本（Total Cost - 敏感信息，仅管理员可见）
    'status', // 状态（Status）
    'admin_remark', // 管理员备注（Admin Remark - 敏感信息，仅管理员可见）
    'exchange_time', // 兑换时间（Exchange Time）
    'shipped_at', // 发货时间（Shipped At）
    'created_at', // 创建时间（Created At）
    'updated_at' // 更新时间（Updated At）
  ]
}

/**
 * 兑换市场服务类
 *
 * 职责：提供兑换市场商品查询、兑换、订单管理等功能
 * 设计模式：静态方法服务类（无状态设计）
 *
 * @class ExchangeMarketService
 */
class ExchangeMarketService {
  /**
   * 获取兑换市场商品列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.status='active'] - 商品状态（active/inactive）
   * @param {string} [options.price_type] - 支付方式（virtual/points/mixed）
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='sort_order'] - 排序字段
   * @param {string} [options.sort_order='ASC'] - 排序方向
   * @returns {Promise<Object>} 商品列表和分页信息
   */
  static async getMarketItems(options = {}) {
    const {
      status = 'active',
      price_type = null,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC'
    } = options

    try {
      console.log('[兑换市场] 查询商品列表', { status, price_type, page, page_size })

      // 构建查询条件
      const where = { status }
      if (price_type) {
        where.price_type = price_type
      }

      // 分页参数
      const offset = (page - 1) * page_size
      const limit = page_size

      // 查询商品列表
      const { count, rows } = await ExchangeItem.findAndCountAll({
        where,
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketItemView, // ✅ 使用统一视图常量
        limit,
        offset,
        order: [[sort_by, sort_order]]
      })

      console.log(`[兑换市场] 找到${count}个商品，返回第${page}页（${rows.length}个）`)

      return {
        success: true,
        items: rows,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        },
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      console.error('[兑换市场] 查询商品列表失败:', error.message)
      throw new Error(`查询商品列表失败: ${error.message}`)
    }
  }

  /**
   * 获取单个商品详情
   *
   * @param {number} item_id - 商品ID
   * @returns {Promise<Object>} 商品详情
   */
  static async getItemDetail(item_id) {
    try {
      const item = await ExchangeItem.findOne({
        where: { item_id },
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketItemDetailView // ✅ 使用统一视图常量
      })

      if (!item) {
        throw new Error('商品不存在')
      }

      return {
        success: true,
        item,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      console.error(`[兑换市场] 查询商品详情失败(item_id:${item_id}):`, error.message)
      throw error
    }
  }

  /**
   * 兑换商品（核心业务逻辑）
   * V4.5.0 材料资产支付版本（2025-12-15）
   *
   * 支付方式改造：
   * - 旧版：从UserInventory扣除虚拟奖品价值（virtual_value_price）
   * - 新版：使用AssetService扣减材料资产（cost_asset_code + cost_amount）
   *
   * @param {number} user_id - 用户ID
   * @param {number} item_id - 商品ID
   * @param {number} quantity - 兑换数量
   * @param {Object} options - 选项
   * @param {string} options.business_id - 业务唯一ID（必填，用于幂等性）
   * @param {Transaction} options.transaction - 外部事务对象（可选）
   * @returns {Promise<Object>} 兑换结果和订单信息
   */
  static async exchangeItem(user_id, item_id, quantity = 1, options = {}) {
    const { business_id, transaction: externalTransaction } = options

    // 🔥 必填参数校验
    if (!business_id) {
      throw new Error('business_id 参数不能为空，用于幂等性控制')
    }

    // 🔥 支持外部传入的事务（与PointsService对齐）
    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction // 只有自己创建的事务才提交/回滚

    try {
      /*
       * ✅ 幂等性检查：以 business_id 为唯一键（与PointsService对齐）
       * 🔴 P1-1-5: 不使用悲观锁，依赖数据库唯一约束防止并发创建重复订单
       * 原因：多个事务同时使用 FOR UPDATE 竞争同一行会导致死锁
       * 解决方案：利用唯一索引约束，并发插入时自动捕获冲突
       */
      const existingOrder = await ExchangeMarketRecord.findOne({
        where: {
          business_id
        },
        // 移除悲观锁，避免死锁
        transaction
      })

      if (existingOrder) {
        console.log('[兑换市场] ⚠️ 幂等性检查：business_id已存在，验证参数一致性', {
          business_id,
          order_no: existingOrder.order_no,
          existing_item_id: existingOrder.item_id,
          existing_quantity: existingOrder.quantity,
          request_item_id: item_id,
          request_quantity: quantity
        })

        // 🔴 P1-1冲突保护：验证请求参数是否一致（确保类型一致）
        if (
          Number(existingOrder.item_id) !== Number(item_id) ||
          Number(existingOrder.quantity) !== Number(quantity)
        ) {
          const conflictError = new Error(
            `幂等键冲突：business_id="${business_id}" 已被使用于不同参数的订单。` +
              `原订单：商品ID=${existingOrder.item_id}, 数量=${existingOrder.quantity}；` +
              `当前请求：商品ID=${item_id}, 数量=${quantity}。` +
              '请使用不同的幂等键或确认请求参数正确。'
          )
          conflictError.statusCode = 409 // HTTP 409 Conflict
          conflictError.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'
          throw conflictError
        }

        console.log('[兑换市场] ✅ 参数一致性验证通过，返回原结果（幂等）', {
          business_id,
          order_no: existingOrder.order_no
        })

        /*
         * 🔴 幂等回放：补齐指纹字段（pay_asset_code/pay_amount）并修复 AssetService.getBalance 参数签名
         * 文档要求：兑换市场幂等指纹 = item_id + quantity + pay_asset_code + pay_amount
         */
        const AssetService = require('./AssetService')
        const currentItem = await ExchangeItem.findOne({
          where: { item_id },
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
            `幂等键冲突：business_id="${business_id}" 已被使用于不同支付参数的订单。` +
              `原订单：pay_asset_code=${existingOrder.pay_asset_code}, pay_amount=${existingOrder.pay_amount}；` +
              `当前请求：pay_asset_code=${expectedPayAssetCode}, pay_amount=${expectedPayAmount}。`
          )
          conflictError.statusCode = 409
          conflictError.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'
          throw conflictError
        }

        let materialBalance = 0
        if (existingOrder.pay_asset_code) {
          const balanceResult = await AssetService.getBalance(
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
            record_id: existingOrder.record_id,
            item_name: existingOrder.item_snapshot?.item_name || '未知商品',
            quantity: existingOrder.quantity,
            pay_asset_code: existingOrder.pay_asset_code,
            pay_amount: existingOrder.pay_amount,
            // 保留旧字段用于兼容
            payment_type: existingOrder.payment_type,
            virtual_value_paid: existingOrder.virtual_value_paid,
            points_paid: existingOrder.points_paid,
            status: existingOrder.status
          },
          remaining: {
            material_balance: materialBalance
          },
          is_duplicate: true, // ✅ 标记为重复请求
          timestamp: BeijingTimeHelper.now()
        }
      }

      console.log(
        `[兑换市场] 用户${user_id}兑换商品${item_id}，数量${quantity}，business_id=${business_id}`
      )

      // 1. 获取商品信息（加锁防止超卖）
      const item = await ExchangeItem.findOne({
        where: { item_id },
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

      console.log('[兑换市场] 材料资产支付计算', {
        cost_asset_code: item.cost_asset_code,
        cost_amount: item.cost_amount,
        quantity,
        totalPayAmount
      })

      // 3. 使用AssetService统一账本扣减材料资产（Phase 3迁移）
      const AssetService = require('./AssetService')

      console.log('[兑换市场] 开始扣减材料资产（统一账本）', {
        user_id,
        asset_code: item.cost_asset_code,
        amount: totalPayAmount,
        business_id: `${business_id}`
      })

      /*
       * 扣减材料资产（使用统一账本AssetService）
       * business_type: exchange_debit（兑换市场材料扣减）
       */
      const materialResult = await AssetService.changeBalance(
        {
          user_id,
          asset_code: item.cost_asset_code,
          delta_amount: -totalPayAmount, // 负数表示扣减
          business_id: `${business_id}`, // 幂等键：使用订单级business_id
          business_type: 'exchange_debit', // 业务类型：兑换市场扣减
          meta: {
            item_id,
            item_name: item.name,
            quantity,
            cost_amount: item.cost_amount,
            total_pay_amount: totalPayAmount
          }
        },
        {
          transaction
        }
      )

      // 如果是重复扣减，说明之前已经创建过订单但事务未提交，需要查询订单
      if (materialResult.is_duplicate) {
        console.log('[兑换市场] ⚠️ 材料扣减幂等返回，查询已存在订单', {
          business_id
        })

        const existingRecord = await ExchangeMarketRecord.findOne({
          where: { business_id },
          transaction
        })

        if (existingRecord) {
          if (shouldCommit) {
            await transaction.commit()
          }

          // 获取当前材料余额
          const currentBalance = await AssetService.getBalance(
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

      console.log(
        `[兑换市场] 材料扣减成功：${totalPayAmount}个${item.cost_asset_code}，剩余余额通过统一账本管理`
      )

      // 4. 生成订单号
      const order_no = this._generateOrderNo()

      /*
       * 5. 创建兑换订单（✅ 包含 business_id 和材料支付字段）
       * 🔴 P1-1-5: 捕获唯一约束冲突（并发场景）
       */
      let record
      try {
        record = await ExchangeMarketRecord.create(
          {
            order_no,
            business_id, // ✅ 记录 business_id 用于幂等性
            user_id,
            item_id,
            item_snapshot: {
              item_id: item.item_id,
              item_name: item.name,
              item_description: item.description,
              cost_asset_code: item.cost_asset_code,
              cost_amount: item.cost_amount,
              // 保留旧字段用于兼容
              price_type: item.price_type,
              virtual_value_price: item.virtual_value_price,
              points_price: item.points_price
            },
            quantity,
            // V4.5.0 新字段：材料资产支付
            pay_asset_code: item.cost_asset_code,
            pay_amount: totalPayAmount,
            // 旧字段保留但设为默认值（用于回滚兼容）
            payment_type: 'virtual',
            virtual_value_paid: 0,
            points_paid: 0,
            total_cost: (item.cost_price || 0) * quantity,
            status: 'pending',
            exchange_time: BeijingTimeHelper.createDatabaseTime()
          },
          { transaction }
        )
      } catch (createError) {
        // 🔴 捕获唯一约束冲突（并发场景下，多个事务同时插入相同 business_id）
        if (
          createError.name === 'SequelizeUniqueConstraintError' ||
          createError.message?.includes('Duplicate entry') ||
          createError.message?.includes('idx_business_id_unique')
        ) {
          console.log('[兑换市场] ⚠️ 并发冲突：business_id已存在，重试查询', { business_id })

          // 回滚当前事务的本地更改，重新查询已存在的订单
          if (shouldCommit) {
            await transaction.rollback()
          }

          // 重新查询已经创建的订单
          const concurrentOrder = await ExchangeMarketRecord.findOne({
            where: { business_id }
          })

          if (concurrentOrder) {
            // 验证参数一致性
            if (
              Number(concurrentOrder.item_id) !== Number(item_id) ||
              Number(concurrentOrder.quantity) !== Number(quantity)
            ) {
              const conflictError = new Error(
                `幂等键冲突：business_id="${business_id}" 已被使用于不同参数的订单。` +
                  `原订单：商品ID=${concurrentOrder.item_id}, 数量=${concurrentOrder.quantity}；` +
                  `当前请求：商品ID=${item_id}, 数量=${quantity}。` +
                  '请使用不同的幂等键或确认请求参数正确。'
              )
              conflictError.statusCode = 409
              conflictError.errorCode = 'IDEMPOTENCY_KEY_CONFLICT'
              throw conflictError
            }

            // 🔴 P0-5 修复：使用 AssetService.getBalance() 替代已删除的 MaterialService
            const AssetService = require('./AssetService')
            let materialBalance = 0
            if (concurrentOrder.pay_asset_code) {
              const balanceResult = await AssetService.getBalance(
                user_id,
                concurrentOrder.pay_asset_code
              )
              materialBalance = balanceResult.available_amount || 0
            }

            return {
              success: true,
              order: concurrentOrder.toJSON(),
              remaining: {
                material_balance: materialBalance
              },
              is_duplicate: true,
              message: '兑换成功（并发幂等返回）'
            }
          }
        }
        // 非唯一约束错误，直接抛出
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

      // 7. 提交事务（只有自己创建的事务才提交）
      if (shouldCommit) {
        await transaction.commit()
      }

      console.log(`[兑换市场] 兑换成功，订单号：${order_no}`)

      return {
        success: true,
        message: '兑换成功',
        order: {
          order_no,
          record_id: record.record_id,
          item_name: item.name,
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
    } catch (error) {
      // 回滚事务（只有自己创建的事务才回滚）
      if (shouldCommit && transaction && !transaction.finished) {
        await transaction.rollback()
      }

      console.error(`[兑换市场] 兑换失败(user_id:${user_id}, item_id:${item_id}):`, error.message)
      throw error
    }
  }

  /**
   * 获取用户订单列表
   *
   * @param {number} user_id - 用户ID
   * @param {Object} options - 查询选项
   * @param {string} [options.status] - 订单状态筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @returns {Promise<Object>} 订单列表和分页信息
   */
  static async getUserOrders(user_id, options = {}) {
    const { status = null, page = 1, page_size = 20 } = options

    try {
      console.log(`[兑换市场] 查询用户${user_id}订单列表`, { status, page, page_size })

      // 构建查询条件
      const where = { user_id }
      if (status) {
        where.status = status
      }

      // 分页参数
      const offset = (page - 1) * page_size
      const limit = page_size

      // 查询订单列表
      const { count, rows } = await ExchangeMarketRecord.findAndCountAll({
        where,
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketOrderView, // ✅ 使用统一视图常量
        limit,
        offset,
        order: [['exchange_time', 'DESC']]
      })

      console.log(`[兑换市场] 找到${count}个订单，返回第${page}页（${rows.length}个）`)

      return {
        success: true,
        orders: rows,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        },
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      console.error(`[兑换市场] 查询用户订单列表失败(user_id:${user_id}):`, error.message)
      throw new Error(`查询订单列表失败: ${error.message}`)
    }
  }

  /**
   * 获取订单详情
   *
   * @param {number} user_id - 用户ID
   * @param {string} order_no - 订单号
   * @returns {Promise<Object>} 订单详情
   */
  static async getOrderDetail(user_id, order_no) {
    try {
      const order = await ExchangeMarketRecord.findOne({
        where: { user_id, order_no },
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketOrderView // ✅ 使用统一视图常量
      })

      if (!order) {
        throw new Error('订单不存在或无权访问')
      }

      return {
        success: true,
        order,
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      console.error(`[兑换市场] 查询订单详情失败(order_no:${order_no}):`, error.message)
      throw error
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
   * @param {Transaction} options.transaction - 外部事务对象（可选）
   * @returns {Promise<Object>} 更新结果
   */
  static async updateOrderStatus(order_no, new_status, operator_id, remark = '', options = {}) {
    const { transaction: externalTransaction } = options

    // 🔥 支持外部传入的事务（与PointsService对齐）
    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction // 只有自己创建的事务才提交/回滚

    try {
      console.log(`[兑换市场] 更新订单状态：${order_no} -> ${new_status}`)

      const order = await ExchangeMarketRecord.findOne({
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

      // 提交事务（只有自己创建的事务才提交）
      if (shouldCommit) {
        await transaction.commit()
      }

      console.log(`[兑换市场] 订单状态更新成功：${order_no} -> ${new_status}`)

      return {
        success: true,
        message: '订单状态更新成功',
        order: {
          order_no,
          status: new_status
        },
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      // 回滚事务（只有自己创建的事务才回滚）
      if (shouldCommit && transaction && !transaction.finished) {
        await transaction.rollback()
      }

      console.error(`[兑换市场] 更新订单状态失败(order_no:${order_no}):`, error.message)
      throw error
    }
  }

  /**
   * 获取用户虚拟奖品总价值（私有方法）
   * @deprecated V4.5.0: 已废弃，兑换市场改为使用材料资产系统（AssetService）
   * 保留此方法仅用于数据回滚和向后兼容，不建议在新代码中使用
   *
   * @param {number} user_id - 用户ID
   * @param {Transaction} [transaction] - 事务对象
   * @returns {Promise<number>} 虚拟奖品总价值
   * @private
   */
  static async _getUserTotalVirtualValue(user_id, transaction = null) {
    console.warn(
      '[兑换市场] ⚠️ 警告：_getUserTotalVirtualValue已废弃（V4.5.0），请使用AssetService.getBalance代替'
    )

    const result = await UserInventory.sum('value', {
      where: {
        user_id,
        source_type: 'lottery', // 抽奖获得的虚拟奖品
        status: 'available',
        value: { [Op.gt]: 0 } // 只统计有价值的虚拟奖品
      },
      transaction
    })

    return result || 0
  }

  /**
   * 扣除用户虚拟奖品价值（私有方法）
   * @deprecated V4.5.0: 已废弃，兑换市场改为使用材料资产系统（AssetService）
   * 保留此方法仅用于数据回滚和向后兼容，不建议在新代码中使用
   *
   * @param {number} user_id - 用户ID
   * @param {number} value_to_deduct - 要扣除的价值
   * @param {Transaction} transaction - 事务对象
   * @returns {Promise<void>} 无返回值，在事务中扣除库存中的虚拟价值
   * @private
   */
  static async _deductVirtualValue(user_id, value_to_deduct, transaction) {
    console.warn(
      '[兑换市场] ⚠️ 警告：_deductVirtualValue已废弃（V4.5.0），请使用AssetService.changeBalance代替'
    )

    // 获取用户所有可用的虚拟奖品（按价值升序，优先消耗小额）
    const virtualPrizes = await UserInventory.findAll({
      where: {
        user_id,
        source_type: 'lottery', // 抽奖获得的虚拟奖品
        status: 'available',
        value: { [Op.gt]: 0 }
      },
      order: [['value', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    console.log(
      `[兑换市场] 查询到 ${virtualPrizes.length} 个可用虚拟奖品，总价值: ${virtualPrizes.reduce((sum, p) => sum + (p.value || 0), 0)}`
    )

    let remaining = value_to_deduct

    for (const prize of virtualPrizes) {
      if (remaining <= 0) break

      const prizeValue = prize.value || 0

      if (prizeValue <= remaining) {
        // 完全消耗这个奖品
        // eslint-disable-next-line no-await-in-loop -- Sequential processing required for transaction consistency
        await prize.update(
          {
            status: 'used',
            used_at: BeijingTimeHelper.createDatabaseTime()
          },
          { transaction }
        )
        remaining -= prizeValue
        console.log(
          `[兑换市场] 消耗虚拟奖品 inventory_id=${prize.inventory_id}, value=${prizeValue}, 剩余需求=${remaining}`
        )
      } else {
        /*
         * 部分消耗（如果虚拟奖品支持部分使用）
         * 注意：当前设计中虚拟奖品不支持部分使用，如果需要支持需要调整逻辑
         */
        console.warn(
          `[兑换市场] 虚拟奖品${prize.inventory_id}价值${prizeValue}大于剩余需求${remaining}，但当前不支持部分使用`
        )
      }
    }

    if (remaining > 0) {
      throw new Error(`虚拟奖品价值不足，还需要${remaining}`)
    }

    console.log(`[兑换市场] 扣除虚拟奖品价值成功：${value_to_deduct}`)
  }

  /**
   * 生成订单号（私有方法）
   *
   * @returns {string} 订单号
   * @private
   */
  static _generateOrderNo() {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 6).toUpperCase()
    return `EM${timestamp}${random}`
  }

  /**
   * 获取兑换市场统计数据（管理员使用）
   *
   * @returns {Promise<Object>} 统计数据
   */
  static async getMarketStatistics() {
    try {
      console.log('[兑换市场] 查询统计数据')

      // 查询各状态订单数量
      const [totalOrders, pendingOrders, completedOrders, shippedOrders, cancelledOrders] =
        await Promise.all([
          ExchangeMarketRecord.count(),
          ExchangeMarketRecord.count({ where: { status: 'pending' } }),
          ExchangeMarketRecord.count({ where: { status: 'completed' } }),
          ExchangeMarketRecord.count({ where: { status: 'shipped' } }),
          ExchangeMarketRecord.count({ where: { status: 'cancelled' } })
        ])

      // 查询总兑换额
      const [totalVirtualValue, totalPoints] = await Promise.all([
        ExchangeMarketRecord.sum('virtual_value_paid'),
        ExchangeMarketRecord.sum('points_paid')
      ])

      // 查询商品库存统计
      const itemStats = await ExchangeItem.findAll({
        attributes: [
          'status',
          [sequelize.fn('COUNT', sequelize.col('item_id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('stock')), 'total_stock']
        ],
        group: ['status']
      })

      return {
        success: true,
        statistics: {
          orders: {
            total: totalOrders,
            pending: pendingOrders,
            completed: completedOrders,
            shipped: shippedOrders,
            cancelled: cancelledOrders
          },
          revenue: {
            total_virtual_value: totalVirtualValue || 0,
            total_points: totalPoints || 0
          },
          items: itemStats
        },
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      console.error('[兑换市场] 查询统计数据失败:', error.message)
      throw new Error(`查询统计数据失败: ${error.message}`)
    }
  }

  /**
   * 创建兑换商品（管理员操作）
   *
   * @param {Object} itemData - 商品数据
   * @param {string} itemData.item_name - 商品名称
   * @param {string} [itemData.item_description] - 商品描述
   * @param {string} itemData.price_type - 支付方式（virtual）
   * @param {number} itemData.virtual_value_price - 虚拟价值价格
   * @param {number} [itemData.points_price] - 积分价格（仅展示）
   * @param {number} itemData.cost_price - 成本价
   * @param {number} itemData.stock - 初始库存
   * @param {number} [itemData.sort_order=100] - 排序号
   * @param {string} [itemData.status='active'] - 商品状态
   * @param {number} created_by - 创建者ID
   * @returns {Promise<Object>} 创建结果
   */
  static async createExchangeItem(itemData, created_by) {
    try {
      console.log('[兑换市场] 管理员创建商品', {
        item_name: itemData.item_name,
        created_by
      })

      // 参数验证
      if (!itemData.item_name || itemData.item_name.trim().length === 0) {
        throw new Error('商品名称不能为空')
      }

      if (itemData.item_name.length > 100) {
        throw new Error('商品名称最长100字符')
      }

      if (itemData.item_description && itemData.item_description.length > 500) {
        throw new Error('商品描述最长500字符')
      }

      if (itemData.price_type !== 'virtual') {
        throw new Error('无效的price_type参数，当前只支持 virtual（虚拟奖品价值支付）')
      }

      if (!itemData.virtual_value_price || itemData.virtual_value_price <= 0) {
        throw new Error('虚拟价值价格必须大于0')
      }

      if (itemData.cost_price === undefined || itemData.cost_price < 0) {
        throw new Error('成本价必须大于等于0')
      }

      if (itemData.stock === undefined || itemData.stock < 0) {
        throw new Error('库存必须大于等于0')
      }

      const validStatuses = ['active', 'inactive']
      if (itemData.status && !validStatuses.includes(itemData.status)) {
        throw new Error(`无效的status参数，允许值：${validStatuses.join(', ')}`)
      }

      // 创建商品
      const item = await ExchangeItem.create({
        item_name: itemData.item_name.trim(),
        item_description: itemData.item_description ? itemData.item_description.trim() : '',
        price_type: itemData.price_type,
        virtual_value_price: parseFloat(itemData.virtual_value_price) || 0,
        points_price: parseInt(itemData.points_price) || 0,
        cost_price: parseFloat(itemData.cost_price),
        stock: parseInt(itemData.stock),
        sort_order: parseInt(itemData.sort_order) || 100,
        status: itemData.status || 'active',
        created_at: BeijingTimeHelper.createDatabaseTime(),
        updated_at: BeijingTimeHelper.createDatabaseTime()
      })

      console.log(`[兑换市场] 商品创建成功，item_id: ${item.item_id}`)

      return {
        success: true,
        item: item.toJSON(),
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      console.error('[兑换市场] 创建商品失败:', error.message)
      throw error
    }
  }

  /**
   * 更新兑换商品（管理员操作）
   *
   * @param {number} item_id - 商品ID
   * @param {Object} updateData - 更新数据
   * @returns {Promise<Object>} 更新结果
   */
  static async updateExchangeItem(item_id, updateData) {
    try {
      console.log('[兑换市场] 管理员更新商品', { item_id })

      // 查询商品
      const item = await ExchangeItem.findByPk(item_id)
      if (!item) {
        throw new Error('商品不存在')
      }

      // 构建更新数据
      const finalUpdateData = { updated_at: BeijingTimeHelper.createDatabaseTime() }

      if (updateData.item_name !== undefined) {
        if (updateData.item_name.trim().length === 0) {
          throw new Error('商品名称不能为空')
        }
        if (updateData.item_name.length > 100) {
          throw new Error('商品名称最长100字符')
        }
        finalUpdateData.item_name = updateData.item_name.trim()
      }

      if (updateData.item_description !== undefined) {
        if (updateData.item_description.length > 500) {
          throw new Error('商品描述最长500字符')
        }
        finalUpdateData.item_description = updateData.item_description.trim()
      }

      if (updateData.price_type !== undefined) {
        if (updateData.price_type !== 'virtual') {
          throw new Error('无效的price_type参数，当前只支持 virtual（虚拟奖品价值支付）')
        }
        finalUpdateData.price_type = updateData.price_type
      }

      if (updateData.virtual_value_price !== undefined) {
        if (updateData.virtual_value_price < 0) {
          throw new Error('虚拟价值价格必须大于等于0')
        }
        finalUpdateData.virtual_value_price = parseFloat(updateData.virtual_value_price)
      }

      if (updateData.points_price !== undefined) {
        if (updateData.points_price < 0) {
          throw new Error('积分价格必须大于等于0')
        }
        finalUpdateData.points_price = parseInt(updateData.points_price)
      }

      if (updateData.cost_price !== undefined) {
        if (updateData.cost_price < 0) {
          throw new Error('成本价必须大于等于0')
        }
        finalUpdateData.cost_price = parseFloat(updateData.cost_price)
      }

      if (updateData.stock !== undefined) {
        if (updateData.stock < 0) {
          throw new Error('库存必须大于等于0')
        }
        finalUpdateData.stock = parseInt(updateData.stock)
      }

      if (updateData.sort_order !== undefined) {
        finalUpdateData.sort_order = parseInt(updateData.sort_order)
      }

      if (updateData.status !== undefined) {
        const validStatuses = ['active', 'inactive']
        if (!validStatuses.includes(updateData.status)) {
          throw new Error(`无效的status参数，允许值：${validStatuses.join(', ')}`)
        }
        finalUpdateData.status = updateData.status
      }

      // 更新商品
      await item.update(finalUpdateData)

      console.log(`[兑换市场] 商品更新成功，item_id: ${item_id}`)

      return {
        success: true,
        item: item.toJSON(),
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      console.error(`[兑换市场] 更新商品失败(item_id:${item_id}):`, error.message)
      throw error
    }
  }

  /**
   * 删除兑换商品（管理员操作）
   *
   * @param {number} item_id - 商品ID
   * @param {Object} options - 选项
   * @param {Transaction} options.transaction - 外部事务对象（可选）
   * @returns {Promise<Object>} 删除结果
   */
  static async deleteExchangeItem(item_id, options = {}) {
    const { transaction: externalTransaction } = options

    // 🔥 支持外部传入的事务（与PointsService对齐）
    const transaction = externalTransaction || (await sequelize.transaction())
    const shouldCommit = !externalTransaction // 只有自己创建的事务才提交/回滚

    try {
      console.log('[兑换市场] 管理员删除商品', { item_id })

      // 查询商品
      const item = await ExchangeItem.findByPk(item_id, { transaction })
      if (!item) {
        throw new Error('商品不存在')
      }

      // 检查是否有相关订单
      const orderCount = await ExchangeMarketRecord.count({
        where: { item_id },
        transaction
      })

      if (orderCount > 0) {
        // 如果有订单，只能下架不能删除
        await item.update(
          {
            status: 'inactive',
            updated_at: BeijingTimeHelper.createDatabaseTime()
          },
          { transaction }
        )

        // 提交事务（只有自己创建的事务才提交）
        if (shouldCommit) {
          await transaction.commit()
        }

        console.log(`[兑换市场] 商品有${orderCount}个关联订单，已下架而非删除`)

        return {
          success: true,
          action: 'deactivated',
          message: `该商品有${orderCount}个关联订单，已自动下架而非删除`,
          item: item.toJSON(),
          timestamp: BeijingTimeHelper.now()
        }
      }

      // 删除商品
      await item.destroy({ transaction })

      // 提交事务（只有自己创建的事务才提交）
      if (shouldCommit) {
        await transaction.commit()
      }

      console.log(`[兑换市场] 商品删除成功，item_id: ${item_id}`)

      return {
        success: true,
        action: 'deleted',
        message: '商品删除成功',
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      // 回滚事务（只有自己创建的事务才回滚）
      if (shouldCommit && transaction && !transaction.finished) {
        await transaction.rollback()
      }

      console.error(`[兑换市场] 删除商品失败(item_id:${item_id}):`, error.message)
      throw error
    }
  }

  /**
   * 获取用户上架统计（管理员专用）
   *
   * @description
   * 整合InventoryService的getUserListingStats方法，为管理员提供用户上架状态统计。
   * 支持分页、筛选（全部/接近上限/达到上限），返回用户详情和统计信息。
   *
   * 🎯 P2-C架构重构：从AdminMarketplaceService合并到ExchangeMarketService
   *
   * 业务场景：
   * - 管理员查看所有用户的上架情况
   * - 识别接近上限的用户，提前干预
   * - 统计市场整体上架状态
   *
   * @param {Object} options - 查询选项
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.limit=20] - 每页数量
   * @param {string} [options.filter='all'] - 筛选条件：all/near_limit/at_limit
   * @param {number} options.max_listings - 最大上架数量限制
   * @returns {Promise<Object>} 用户上架统计结果
   * @returns {Array} result.stats - 用户上架统计列表
   * @returns {Object} result.pagination - 分页信息
   * @returns {Object} result.summary - 总体统计摘要
   *
   * @throws {Error} 当查询失败时抛出错误
   *
   * @example
   * const stats = await ExchangeMarketService.getUserListingStats({
   *   page: 1,
   *   limit: 20,
   *   filter: 'at_limit',
   *   max_listings: 3
   * });
   */
  static async getUserListingStats(options) {
    try {
      console.log('[兑换市场] 管理员获取用户上架统计', {
        page: options.page,
        limit: options.limit,
        filter: options.filter
      })

      // 🎯 调用InventoryService的方法（避免重复实现）
      const InventoryService = require('./InventoryService')
      const result = await InventoryService.getUserListingStats(options)

      console.log('[兑换市场] 用户上架统计查询成功', {
        total_users: result.summary.total_users_with_listings,
        filtered_count: result.pagination.total
      })

      return result
    } catch (error) {
      console.error('[兑换市场] 获取用户上架统计失败:', {
        error: error.message,
        stack: error.stack,
        options
      })
      throw error
    }
  }
}

module.exports = ExchangeMarketService
