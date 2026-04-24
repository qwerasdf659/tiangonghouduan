/**
 * 餐厅积分抽奖系统 V4.7.1 - 兑换订单管理端查询服务
 * Exchange Admin Order Query Service
 *
 * 职责范围：管理端兑换订单查询
 * - getAdminOrders(): 管理员查询全量订单列表
 * - getAdminOrderDetail(): 管理员查询订单详情
 *
 * 从 exchange/QueryService.js 拆分而来（原文件 1693 行 → 拆分后各 <800 行）
 *
 * @module services/exchange/admin/OrderQueryService
 * @created 2026-04-24（大文件拆分 Phase 5）
 */

const BusinessError = require('../../../utils/BusinessError')
const logger = require('../../../utils/logger').logger
const displayNameHelper = require('../../../utils/displayNameHelper')
const { Op } = require('sequelize')

/**
 * 管理员订单视图字段（包含敏感字段）
 */
const ADMIN_ORDER_VIEW = [
  'exchange_record_id', 'order_no', 'user_id',
  'exchange_item_id', 'item_snapshot', 'quantity',
  'pay_asset_code', 'pay_amount', 'total_cost',
  'status', 'admin_remark', 'exchange_time',
  'shipped_at', 'received_at', 'rated_at',
  'rejected_at', 'refunded_at', 'approved_at',
  'auto_confirmed', 'rating', 'source',
  'created_at', 'updated_at'
]

/**
 * 兑换订单管理端查询服务
 *
 * @class ExchangeAdminOrderQueryService
 */
class ExchangeAdminOrderQueryService {
  /**
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this.ExchangeRecord = models.ExchangeRecord
    this.ExchangeOrderEvent = models.ExchangeOrderEvent
    this.sequelize = models.sequelize
  }

  /**
   * 管理员获取全量订单列表（Admin Only）
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.status] - 订单状态筛选
   * @param {number} [options.user_id] - 用户ID筛选
   * @param {number} [options.exchange_item_id] - 商品ID筛选
   * @param {string} [options.order_no] - 订单号模糊搜索
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='created_at'] - 排序字段
   * @param {string} [options.sort_order='DESC'] - 排序方向
   * @returns {Promise<Object>} 订单列表和分页信息
   */
  async getAdminOrders(options = {}) {
    const {
      status = null,
      user_id = null,
      exchange_item_id = null,
      order_no = null,
      source = null,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options

    try {
      logger.info('[兑换市场] 管理员查询全量订单列表', {
        status,
        user_id,
        exchange_item_id,
        order_no,
        source,
        page,
        page_size
      })

      const where = {}
      if (status) where.status = status
      if (user_id) where.user_id = user_id
      if (exchange_item_id) where.exchange_item_id = exchange_item_id
      if (source) where.source = source
      if (order_no) {
        where.order_no = { [Op.like]: `%${order_no}%` }
      }

      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.ExchangeRecord.findAndCountAll({
        where,
        attributes: ADMIN_ORDER_VIEW,
        limit,
        offset,
        order: [[sort_by, sort_order]]
      })

      logger.info(
        `[兑换市场] 管理员查询订单成功：找到${count}个订单，返回第${page}页（${rows.length}个）`
      )

      // 添加中文显示名称
      const ordersWithDisplayNames = await displayNameHelper.attachDisplayNames(
        rows.map(order => order.toJSON()),
        [{ field: 'status', dictType: 'exchange_status' }]
      )

      return {
        orders: ordersWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        },
        filters: {
          status,
          user_id,
          exchange_item_id,
          order_no
        }
      }
    } catch (error) {
      logger.error('[兑换市场] 管理员查询订单列表失败:', error.message)
      throw new BusinessError(`查询订单列表失败: ${error.message}`, 'EXCHANGE_FAILED', 400)
    }
  }

  /**
   * 管理员获取订单详情（Admin Only）
   *
   * @param {string} order_no - 订单号
   * @returns {Promise<Object>} 订单详情
   */
  async getAdminOrderDetail(order_no) {
    try {
      logger.info('[兑换市场] 管理员查询订单详情', { order_no })

      const includeConfig = []
      const orderConfig = []
      if (this.ExchangeOrderEvent) {
        includeConfig.push({
          model: this.ExchangeOrderEvent,
          as: 'events',
          attributes: [
            'event_id',
            'old_status',
            'new_status',
            'operator_id',
            'operator_type',
            'reason',
            'created_at'
          ],
          required: false
        })
        orderConfig.push([{ model: this.ExchangeOrderEvent, as: 'events' }, 'created_at', 'ASC'])
      }

      const order = await this.ExchangeRecord.findOne({
        where: { order_no },
        attributes: ADMIN_ORDER_VIEW,
        include: includeConfig,
        order: orderConfig
      })

      if (!order) {
        const notFoundError = new Error('订单不存在')
        notFoundError.statusCode = 404
        notFoundError.errorCode = 'ORDER_NOT_FOUND'
        throw notFoundError
      }

      logger.info('[兑换市场] 管理员获取订单详情成功', {
        order_no,
        status: order.status
      })

      const orderData = order.toJSON()

      // 添加中文显示名称
      const orderWithDisplayNames = await displayNameHelper.attachDisplayNames(orderData, [
        { field: 'status', dictType: 'exchange_status' }
      ])

      return {
        order: orderWithDisplayNames
      }
    } catch (error) {
      logger.error(`[兑换市场] 管理员查询订单详情失败(order_no:${order_no}):`, error.message)
      throw error
    }
  }

}

module.exports = ExchangeAdminOrderQueryService
