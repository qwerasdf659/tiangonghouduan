/**
 * 餐厅积分抽奖系统 V4.0 - 兑换市场服务（ExchangeMarketService）
 *
 * 业务场景：用户使用虚拟奖品价值兑换实物商品（唯一支付方式）
 *
 * 核心功能：
 * 1. 商品列表查询（支持分类、排序、分页）
 * 2. 商品兑换（仅支持虚拟奖品价值支付）
 * 3. 订单管理（查询订单、订单详情）
 *
 * 支付方式（简化后）：
 * - ✅ 虚拟奖品支付：从 user_inventory 扣除虚拟奖品价值（唯一方式）
 * - ❌ 积分支付：已废弃，不再支持
 * - ❌ 混合支付：已废弃，不再支持
 *
 * 业务规则（强制）：
 * - ✅ 兑换只能使用虚拟奖品价值
 * - ❌ 禁止扣除 available_points（显示积分）
 * - ❌ 禁止检查/扣除 remaining_budget_points（预算积分）
 * - ✅ points_paid 必须强制为 0
 * - ✅ payment_type 必须为 'virtual'
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
 *   - ExchangeOperationService：处理旧兑换系统（ExchangeRecords）的运营管理
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

const {
  ExchangeItem,
  ExchangeMarketRecord,
  UserInventory,
  UserPointsAccount,
  sequelize
} = require('../models')
const { Op } = require('sequelize')
const BeijingTimeHelper = require('../utils/timeHelper')

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
  static async getMarketItems (options = {}) {
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
  static async getItemDetail (item_id) {
    try {
      const item = await ExchangeItem.findOne({
        where: { item_id }
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
   *
   * @param {number} user_id - 用户ID
   * @param {number} item_id - 商品ID
   * @param {number} quantity - 兑换数量
   * @param {Object} options - 选项
   * @param {string} options.business_id - 业务唯一ID（可选，用于幂等性）
   * @returns {Promise<Object>} 兑换结果和订单信息
   */
  static async exchangeItem (user_id, item_id, quantity = 1, options = {}) {
    const { business_id } = options

    // ✅ 幂等性检查（解决任务4.1：为高风险操作添加强制幂等检查）
    if (business_id) {
      const existingOrder = await ExchangeMarketRecord.findOne({
        where: {
          user_id,
          item_id,
          status: { [Op.in]: ['pending', 'completed', 'shipped'] } // 排除已取消的订单
        },
        order: [['exchange_time', 'DESC']],
        limit: 1
      })

      if (existingOrder) {
        console.log('[兑换市场] ⚠️ 幂等性检查：兑换订单已存在，返回原结果', {
          business_id,
          order_no: existingOrder.order_no,
          user_id,
          item_id,
          status: existingOrder.status
        })

        // 获取当前虚拟价值余额
        const userAccount = await UserPointsAccount.findOne({
          where: { user_id }
        })

        return {
          success: true,
          message: '兑换订单已存在',
          order: {
            order_no: existingOrder.order_no,
            record_id: existingOrder.record_id,
            item_name: existingOrder.item_snapshot?.item_name || '未知商品',
            quantity: existingOrder.quantity,
            payment_type: existingOrder.payment_type,
            virtual_value_paid: existingOrder.virtual_value_paid,
            points_paid: existingOrder.points_paid,
            status: existingOrder.status
          },
          remaining: {
            virtual_value: await this._getUserTotalVirtualValue(user_id),
            available_points: userAccount?.available_points || 0
          },
          is_duplicate: true, // ✅ 标记为重复请求
          timestamp: BeijingTimeHelper.now()
        }
      }
    }

    const transaction = await sequelize.transaction()

    try {
      console.log(`[兑换市场] 用户${user_id}兑换商品${item_id}，数量${quantity}`)

      // 1. 获取商品信息（加锁防止超卖）
      const item = await ExchangeItem.findOne({
        where: { item_id },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!item) {
        await transaction.rollback()
        throw new Error('商品不存在')
      }

      if (item.status !== 'active') {
        await transaction.rollback()
        throw new Error('商品已下架')
      }

      if (item.stock < quantity) {
        await transaction.rollback()
        throw new Error(`库存不足，当前库存：${item.stock}`)
      }

      // 2. 获取用户积分账户
      const userAccount = await UserPointsAccount.findOne({
        where: { user_id },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!userAccount) {
        await transaction.rollback()
        throw new Error('用户积分账户不存在')
      }

      // 3. 计算总价
      const totalVirtualValue = (item.virtual_value_price || 0) * quantity
      const totalPoints = (item.points_price || 0) * quantity

      console.log('[兑换市场] 价格计算', {
        price_type: item.price_type,
        virtual_value_price: item.virtual_value_price,
        points_price: item.points_price,
        quantity,
        totalVirtualValue,
        totalPoints
      })

      // 4. 强制校验：只允许 virtual 类型（业务规则强制）
      if (item.price_type !== 'virtual') {
        await transaction.rollback()
        throw new Error(
          `不支持的支付方式：${item.price_type}。` +
            '当前仅支持虚拟奖品支付（price_type=\'virtual\'），请联系管理员更新商品配置。'
        )
      }

      // 5. 使用虚拟奖品价值支付（唯一支付方式）
      console.log('[兑换市场] 使用虚拟奖品价值支付')

      // 检查虚拟价值是否足够
      const userVirtualValue = await this._getUserTotalVirtualValue(user_id, transaction)

      if (userVirtualValue < totalVirtualValue) {
        await transaction.rollback()
        throw new Error(
          `虚拟奖品不足，需要${totalVirtualValue}虚拟价值，当前${userVirtualValue}。` +
            '请先参与抽奖获取虚拟奖品。'
        )
      }

      // 扣除虚拟奖品价值
      await this._deductVirtualValue(user_id, totalVirtualValue, transaction)
      const virtualValuePaid = totalVirtualValue
      const pointsPaid = 0 // 强制为 0，不扣除显示积分

      console.log(`[兑换市场] 扣除虚拟价值成功：${totalVirtualValue}`)

      // 6. 生成订单号
      const order_no = this._generateOrderNo()

      // 7. 创建兑换订单
      const record = await ExchangeMarketRecord.create(
        {
          order_no,
          user_id,
          item_id,
          item_snapshot: {
            item_id: item.item_id,
            item_name: item.item_name,
            item_description: item.item_description,
            price_type: item.price_type,
            virtual_value_price: item.virtual_value_price,
            points_price: item.points_price
          },
          quantity,
          payment_type: 'virtual', // 强制为 virtual
          virtual_value_paid: virtualValuePaid,
          points_paid: pointsPaid, // 强制为 0
          total_cost: (item.cost_price || 0) * quantity,
          status: 'pending',
          exchange_time: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      // 8. 扣减商品库存
      await item.update(
        {
          stock: item.stock - quantity,
          total_exchange_count: (item.total_exchange_count || 0) + quantity
        },
        { transaction }
      )

      // 9. 更新用户统计字段
      await userAccount.update(
        {
          total_redeem_count: (userAccount.total_redeem_count || 0) + 1,
          last_redeem_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      // 10. 提交事务
      await transaction.commit()

      console.log(`[兑换市场] 兑换成功，订单号：${order_no}`)

      return {
        success: true,
        message: '兑换成功',
        order: {
          order_no,
          record_id: record.record_id,
          item_name: item.item_name,
          quantity,
          payment_type: item.price_type,
          virtual_value_paid: virtualValuePaid,
          points_paid: pointsPaid,
          status: 'pending'
        },
        remaining: {
          virtual_value: await this._getUserTotalVirtualValue(user_id),
          available_points: userAccount.available_points - pointsPaid
        },
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      // 回滚事务
      if (transaction && !transaction.finished) {
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
  static async getUserOrders (user_id, options = {}) {
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
  static async getOrderDetail (user_id, order_no) {
    try {
      const order = await ExchangeMarketRecord.findOne({
        where: { user_id, order_no }
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
   * @returns {Promise<Object>} 更新结果
   */
  static async updateOrderStatus (order_no, new_status, operator_id, remark = '') {
    const transaction = await sequelize.transaction()

    try {
      console.log(`[兑换市场] 更新订单状态：${order_no} -> ${new_status}`)

      const order = await ExchangeMarketRecord.findOne({
        where: { order_no },
        lock: transaction.LOCK.UPDATE,
        transaction
      })

      if (!order) {
        await transaction.rollback()
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

      await transaction.commit()

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
      if (transaction && !transaction.finished) {
        await transaction.rollback()
      }

      console.error(`[兑换市场] 更新订单状态失败(order_no:${order_no}):`, error.message)
      throw error
    }
  }

  /**
   * 获取用户虚拟奖品总价值（私有方法）
   *
   * @param {number} user_id - 用户ID
   * @param {Transaction} [transaction] - 事务对象
   * @returns {Promise<number>} 虚拟奖品总价值
   * @private
   */
  static async _getUserTotalVirtualValue (user_id, transaction = null) {
    const result = await UserInventory.sum('virtual_value_points', {
      where: {
        user_id,
        item_type: 'prize',
        status: 'available',
        virtual_value_points: { [Op.gt]: 0 } // 只统计有价值的虚拟奖品
      },
      transaction
    })

    return result || 0
  }

  /**
   * 扣除用户虚拟奖品价值（私有方法）
   *
   * @param {number} user_id - 用户ID
   * @param {number} value_to_deduct - 要扣除的价值
   * @param {Transaction} transaction - 事务对象
   * @returns {Promise<void>} 无返回值，在事务中扣除库存中的虚拟价值
   * @private
   */
  static async _deductVirtualValue (user_id, value_to_deduct, transaction) {
    // 获取用户所有可用的虚拟奖品（按价值升序，优先消耗小额）
    const virtualPrizes = await UserInventory.findAll({
      where: {
        user_id,
        item_type: 'prize',
        status: 'available',
        virtual_value_points: { [Op.gt]: 0 }
      },
      order: [['virtual_value_points', 'ASC']],
      lock: transaction.LOCK.UPDATE,
      transaction
    })

    let remaining = value_to_deduct

    for (const prize of virtualPrizes) {
      if (remaining <= 0) break

      const prizeValue = prize.virtual_value_points || 0

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
  static _generateOrderNo () {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substr(2, 6).toUpperCase()
    return `EM${timestamp}${random}`
  }

  /**
   * 获取兑换市场统计数据（管理员使用）
   *
   * @returns {Promise<Object>} 统计数据
   */
  static async getMarketStatistics () {
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
  static async createExchangeItem (itemData, created_by) {
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
  static async updateExchangeItem (item_id, updateData) {
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
   * @returns {Promise<Object>} 删除结果
   */
  static async deleteExchangeItem (item_id) {
    const transaction = await sequelize.transaction()

    try {
      console.log('[兑换市场] 管理员删除商品', { item_id })

      // 查询商品
      const item = await ExchangeItem.findByPk(item_id, { transaction })
      if (!item) {
        await transaction.rollback()
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

        await transaction.commit()

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
      await transaction.commit()

      console.log(`[兑换市场] 商品删除成功，item_id: ${item_id}`)

      return {
        success: true,
        action: 'deleted',
        message: '商品删除成功',
        timestamp: BeijingTimeHelper.now()
      }
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback()
      }

      console.error(`[兑换市场] 删除商品失败(item_id:${item_id}):`, error.message)
      throw error
    }
  }
}

module.exports = ExchangeMarketService
