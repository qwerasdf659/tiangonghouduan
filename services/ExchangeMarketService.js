/**
 * 餐厅积分抽奖系统 V4.0 - 兑换市场服务（ExchangeMarketService）
 *
 * 业务场景：双账户+商城双玩法方案中的兑换市场功能
 * 用户使用虚拟奖品价值或积分兑换实物商品
 *
 * 核心功能：
 * 1. 商品列表查询（支持分类、排序、分页）
 * 2. 商品兑换（虚拟奖品价值/积分/混合支付）
 * 3. 订单管理（查询订单、订单详情）
 * 4. 价格计算（根据支付方式计算实际支付金额）
 *
 * 业务流程：
 *
 * 1. **用户查看商品列表**
 *    - 调用getMarketItems() → 返回可兑换商品列表
 *    - 前端展示商品信息（名称、价格、库存、支付方式）
 *
 * 2. **用户兑换商品流程**
 *    - 用户选择商品和数量
 *    - 调用exchangeItem() → 检查库存 → 检查支付能力
 *    - 扣除虚拟奖品价值/积分 → 创建订单 → 扣减库存
 *    - 返回订单信息
 *
 * 3. **支付方式处理**
 *    - 虚拟奖品支付：从user_inventory扣除虚拟奖品价值
 *    - 积分支付：从available_points扣除积分
 *    - 混合支付：同时扣除虚拟奖品价值和积分
 *
 * 4. **订单查询流程**
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
 * - ExchangeItem：兑换市场商品表（price_type, virtual_value_price, points_price）
 * - ExchangeMarketRecord：兑换订单表（payment_type, virtual_value_paid, points_paid）
 * - UserInventory：用户库存表（虚拟奖品存储，virtual_value_points）
 * - UserPointsAccount：积分账户表（available_points）
 *
 * 业务规则：
 * - 虚拟奖品价值从背包扣除，不扣除预算积分（抽奖时已扣除）
 * - 积分支付扣除available_points，不扣除预算积分
 * - 兑换时使用事务确保原子性（扣除+创建订单+扣减库存）
 * - 商品库存不足时拒绝兑换
 * - 订单号格式：EM{timestamp}{random}（EM = Exchange Market）
 *
 * 创建时间：2025年12月06日
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
const PointsService = require('./PointsService')

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
   * @returns {Promise<Object>} 兑换结果和订单信息
   */
  static async exchangeItem (user_id, item_id, quantity = 1) {
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

      // 4. 检查支付能力并执行扣除
      let virtualValuePaid = 0
      let pointsPaid = 0

      switch (item.price_type) {
      case 'virtual': {
        // 虚拟奖品价值支付
        const userVirtualValue = await this._getUserTotalVirtualValue(user_id, transaction)

        if (userVirtualValue < totalVirtualValue) {
          await transaction.rollback()
          throw new Error(
            `虚拟奖品价值不足，需要${totalVirtualValue}，当前${userVirtualValue}`
          )
        }

        // 扣除虚拟奖品价值
        await this._deductVirtualValue(user_id, totalVirtualValue, transaction)
        virtualValuePaid = totalVirtualValue
        break
      }

      case 'points': {
        // 积分支付
        if (userAccount.available_points < totalPoints) {
          await transaction.rollback()
          throw new Error(
            `积分不足，需要${totalPoints}，当前${userAccount.available_points}`
          )
        }

        // 生成唯一的业务ID
        const business_id = `exchange_market_${BeijingTimeHelper.generateIdTimestamp()}_${user_id}`

        // 扣除积分（使用PointsService确保一致性）
        await PointsService.consumePoints(user_id, totalPoints, {
          transaction,
          business_id,
          business_type: 'exchange_market',
          source_type: 'system',
          title: `兑换商品：${item.item_name}`,
          description: `兑换${quantity}个${item.item_name}，消耗${totalPoints}积分`
        })
        pointsPaid = totalPoints
        break
      }

      case 'mixed': {
        // 混合支付
        const userVirtualValue = await this._getUserTotalVirtualValue(user_id, transaction)

        if (userVirtualValue < totalVirtualValue) {
          await transaction.rollback()
          throw new Error(
            `虚拟奖品价值不足，需要${totalVirtualValue}，当前${userVirtualValue}`
          )
        }

        if (userAccount.available_points < totalPoints) {
          await transaction.rollback()
          throw new Error(
            `积分不足，需要${totalPoints}，当前${userAccount.available_points}`
          )
        }

        // 扣除虚拟奖品价值
        await this._deductVirtualValue(user_id, totalVirtualValue, transaction)
        virtualValuePaid = totalVirtualValue

        // 生成唯一的业务ID
        const business_id = `exchange_market_${BeijingTimeHelper.generateIdTimestamp()}_${user_id}`

        // 扣除积分
        await PointsService.consumePoints(user_id, totalPoints, {
          transaction,
          business_id,
          business_type: 'exchange_market',
          source_type: 'system',
          title: `兑换商品：${item.item_name}（混合支付）`,
          description: `兑换${quantity}个${item.item_name}，消耗${totalVirtualValue}虚拟奖品价值+${totalPoints}积分`
        })
        pointsPaid = totalPoints
        break
      }

      default:
        await transaction.rollback()
        throw new Error(`不支持的支付方式：${item.price_type}`)
      }

      // 5. 生成订单号
      const order_no = this._generateOrderNo()

      // 6. 创建兑换订单
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
          payment_type: item.price_type,
          virtual_value_paid: virtualValuePaid,
          points_paid: pointsPaid,
          total_cost: (item.cost_price || 0) * quantity,
          status: 'pending',
          exchange_time: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      // 7. 扣减商品库存
      await item.update(
        {
          stock: item.stock - quantity,
          total_exchange_count: (item.total_exchange_count || 0) + quantity
        },
        { transaction }
      )

      // 8. 更新用户统计字段
      await userAccount.update(
        {
          total_redeem_count: (userAccount.total_redeem_count || 0) + 1,
          last_redeem_at: BeijingTimeHelper.createDatabaseTime()
        },
        { transaction }
      )

      // 9. 提交事务
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
}

module.exports = ExchangeMarketService
