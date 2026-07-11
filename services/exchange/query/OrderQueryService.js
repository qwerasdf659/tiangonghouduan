/**
 * 天工商户营销平台 V4.7.0 - 兑换市场订单查询子服务
 * Exchange Order Query Service（技术债务方案 7.4-2：QueryService 拆分）
 *
 * 职责范围：订单/兑换记录查询（用户端 + 管理员端）
 * - getUserOrders(): 获取用户订单列表
 * - getOrderDetail(): 获取订单详情（用户端）
 * - getAdminOrders(): 获取全量订单列表（管理员）
 * - getAdminOrderDetail(): 获取订单详情（管理员）
 * - getOrderContact(): 获取本人订单完整收货联系方式（按需明文）
 * - getOrderByShippingNo(): 按快递单号定位订单（物流 webhook）
 * - scanShippingTimeouts(): 扫描物流超时订单（定时任务）
 *
 * 设计原则：
 * - 查询操作不需要事务
 * - 不独立注册服务键，经 QueryService Facade 持有（防单例状态分裂）
 *
 * 全部方法纯搬移自原 services/exchange/QueryService.js（2026-01-31 版），逻辑不变。
 *
 * @module services/exchange/query/OrderQueryService
 * @created 2026-07-11（技术债务方案 7.4-2 拆分）
 */

const BusinessError = require('../../../utils/BusinessError')
const logger = require('../../../utils/logger').logger
const displayNameHelper = require('../../../utils/displayNameHelper')
const BeijingTimeHelper = require('../../../utils/timeHelper')
const { Op } = require('sequelize')
const { resolveMaterialIconUrls } = require('../../../utils/mediaAttachmentGallery')
const { ORDER_SORT_WHITELIST, sanitizeMarketSort } = require('./marketSort')

/**
 * 🎯 统一数据输出视图常量（Data Output View Constants，订单侧）
 */
const EXCHANGE_MARKET_ATTRIBUTES = {
  /**
   * 用户订单视图
   */
  marketOrderView: [
    'exchange_record_id',
    'order_no',
    'user_id',
    'exchange_item_id',
    'item_snapshot',
    'quantity',
    'pay_asset_code',
    'pay_amount',
    'status',
    'exchange_time',
    'shipped_at',
    'received_at',
    'rated_at',
    'rejected_at',
    'refunded_at',
    'approved_at',
    'auto_confirmed',
    'rating',
    'source',
    'shipping_company',
    'shipping_company_name',
    'shipping_no',
    'address_snapshot',
    'created_at',
    'updated_at'
  ],

  /**
   * 管理员订单视图（包含敏感字段）
   */
  adminMarketOrderView: [
    'exchange_record_id',
    'order_no',
    'user_id',
    'exchange_item_id',
    'item_snapshot',
    'quantity',
    'pay_asset_code',
    'pay_amount',
    'total_cost',
    'status',
    'admin_remark',
    'exchange_time',
    'shipped_at',
    'received_at',
    'rated_at',
    'rejected_at',
    'refunded_at',
    'approved_at',
    'auto_confirmed',
    'rating',
    'source',
    'shipping_company',
    'shipping_company_name',
    'shipping_no',
    'address_snapshot',
    'created_at',
    'updated_at'
  ]
}

/**
 * 兑换市场订单查询子服务类
 *
 * @class OrderQueryService
 */
class OrderQueryService {
  /**
   * 构造函数
   *
   * @param {Object} models - Sequelize 模型对象
   */
  constructor(models) {
    this.models = models
    this.ExchangeItem = models.ExchangeItem
    this.ExchangeRecord = models.ExchangeRecord
    this.ExchangeOrderEvent = models.ExchangeOrderEvent
    this.ExchangeItemSku = models.ExchangeItemSku
    this.ExchangeChannelPrice = models.ExchangeChannelPrice
    this.Category = models.Category
    this.sequelize = models.sequelize
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
  async getUserOrders(user_id, options = {}) {
    const { status = null, page = 1, page_size = 20 } = options

    try {
      logger.info(`[兑换市场] 查询用户${user_id}订单列表`, { status, page, page_size })

      const where = { user_id }
      if (status) {
        where.status = status
      }

      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.ExchangeRecord.findAndCountAll({
        where,
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketOrderView,
        limit,
        offset,
        order: [['exchange_time', 'DESC']]
      })

      logger.info(`[兑换市场] 找到${count}个订单，返回第${page}页（${rows.length}个）`)

      // 添加中文显示名称
      const ordersWithDisplayNames = await displayNameHelper.attachDisplayNames(
        rows.map(order => order.toJSON()),
        [{ field: 'status', dictType: 'exchange_status' }]
      )

      // 附加 pay_asset_name（资产中文名称）
      await this._attachPayAssetNames(ordersWithDisplayNames)

      // 附加能力位派生字段：is_prop + refundable（BE-1）
      await this._attachOrderCapabilities(ordersWithDisplayNames)

      return {
        orders: ordersWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error(`[兑换市场] 查询用户订单列表失败(user_id:${user_id}):`, error.message)
      throw new BusinessError(`查询订单列表失败: ${error.message}`, 'EXCHANGE_QUERY_FAILED', 500)
    }
  }

  /**
   * 获取订单详情
   *
   * @param {number} user_id - 用户ID
   * @param {string} order_no - 订单号
   * @returns {Promise<Object>} 订单详情
   */
  async getOrderDetail(user_id, order_no) {
    try {
      const order = await this.ExchangeRecord.findOne({
        where: { user_id, order_no },
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketOrderView
      })

      if (!order) {
        const notFoundError = new Error('订单不存在或无权访问')
        notFoundError.statusCode = 404
        notFoundError.errorCode = 'ORDER_NOT_FOUND'
        throw notFoundError
      }

      // 添加中文显示名称
      const orderWithDisplayNames = await displayNameHelper.attachDisplayNames(order.toJSON(), [
        { field: 'status', dictType: 'exchange_status' }
      ])

      // 附加 pay_asset_name（资产中文名称）
      await this._attachPayAssetNames([orderWithDisplayNames])

      // 附加能力位派生字段：is_prop + refundable（BE-1）
      await this._attachOrderCapabilities([orderWithDisplayNames])

      return {
        order: orderWithDisplayNames
      }
    } catch (error) {
      logger.error(`[兑换市场] 查询订单详情失败(order_no:${order_no}):`, error.message)
      throw error
    }
  }

  /**
   * 扫描物流超时订单（超时未揽收/未签收预警，物流方案一·拍板③）
   *
   * 业务定义（基于真实状态机与轨迹表）：
   * - 未揽收预警：订单 status='shipped' 且 shipped_at 超过 pickupHours 小时，
   *   但 shipping_tracks 中无任何 picked_up 及之后的轨迹（说明快递可能没揽到件）。
   * - 未签收预警：订单 status='shipped' 且 shipped_at 超过 deliverDays 天仍未出现 delivered 轨迹。
   * 复杂只读扫描收口到 QueryService（不散落在路由/任务里），任务层只调用本方法。
   *
   * @param {Object} options - 阈值配置
   * @param {number} [options.pickupHours=48] - 未揽收预警阈值（小时）
   * @param {number} [options.deliverDays=7] - 未签收预警阈值（天）
   * @returns {Promise<Object>} { not_picked_up: [...], not_delivered: [...], scanned_at }
   */
  async scanShippingTimeouts(options = {}) {
    const { pickupHours = 48, deliverDays = 7 } = options
    const { ShippingTrack } = this.models
    const now = Date.now()
    const pickupBefore = new Date(now - pickupHours * 60 * 60 * 1000)
    const deliverBefore = new Date(now - deliverDays * 24 * 60 * 60 * 1000)

    // 所有 shipped 且已填单号的订单
    const shippedOrders = await this.ExchangeRecord.findAll({
      where: { status: 'shipped', shipping_no: { [Op.ne]: null } },
      attributes: ['exchange_record_id', 'order_no', 'shipping_no', 'shipped_at']
    })
    if (shippedOrders.length === 0) {
      return { not_picked_up: [], not_delivered: [], scanned_at: BeijingTimeHelper.now() }
    }

    const recordIds = shippedOrders.map(o => o.exchange_record_id)
    // 批量取这批订单的轨迹状态（避免 N+1）
    const tracks = await ShippingTrack.findAll({
      where: { exchange_record_id: { [Op.in]: recordIds } },
      attributes: ['exchange_record_id', 'track_status']
    })
    const statusByRecord = new Map()
    tracks.forEach(t => {
      if (!statusByRecord.has(t.exchange_record_id)) {
        statusByRecord.set(t.exchange_record_id, new Set())
      }
      statusByRecord.get(t.exchange_record_id).add(t.track_status)
    })

    const notPickedUp = []
    const notDelivered = []
    for (const o of shippedOrders) {
      const shippedAt = o.shipped_at ? new Date(o.shipped_at) : null
      if (!shippedAt) continue
      const statuses = statusByRecord.get(o.exchange_record_id) || new Set()
      const hasPickup =
        statuses.has('picked_up') ||
        statuses.has('in_transit') ||
        statuses.has('delivering') ||
        statuses.has('delivered')
      const hasDelivered = statuses.has('delivered')

      if (!hasPickup && shippedAt < pickupBefore) {
        notPickedUp.push({
          order_no: o.order_no,
          shipping_no: o.shipping_no,
          shipped_at: o.shipped_at
        })
      }
      if (!hasDelivered && shippedAt < deliverBefore) {
        notDelivered.push({
          order_no: o.order_no,
          shipping_no: o.shipping_no,
          shipped_at: o.shipped_at
        })
      }
    }

    return {
      not_picked_up: notPickedUp,
      not_delivered: notDelivered,
      scanned_at: BeijingTimeHelper.now()
    }
  }

  /**
   * 按快递单号定位订单（物流 webhook 回调用，物流方案一）
   *
   * @param {string} shipping_no - 快递单号
   * @returns {Promise<Object|null>} 订单基础信息 { exchange_record_id, order_no, status, shipping_company }；不存在返回 null
   */
  async getOrderByShippingNo(shipping_no) {
    if (!shipping_no) return null
    const order = await this.ExchangeRecord.findOne({
      where: { shipping_no },
      attributes: ['exchange_record_id', 'order_no', 'status', 'shipping_company', 'shipping_no']
    })
    return order ? order.toJSON() : null
  }

  /**
   * 获取本人订单的完整收货联系方式（按需明文，拍板⑤）
   *
   * 业务场景：小程序订单详情页用户主动点击「显示完整」时调用，返回完整收件人姓名/手机号/地址
   * 供本人核对发货信息。默认订单详情下发的是掩码地址，本接口是唯一返回完整手机号的入口。
   *
   * 安全约束：
   * - 仅返回归属当前用户的订单（where 带 user_id），防止越权查看他人地址。
   * - 仅返回 address_snapshot 中的联系方式字段，不下发成本/内部字段。
   * - 调用方（路由层）需记录审计日志。
   *
   * @param {number} user_id - 当前登录用户 ID
   * @param {string} order_no - 订单号
   * @returns {Promise<Object|null>} 完整联系方式 { receiver_name, receiver_phone, province, city, district, detail_address }；无地址返回 null
   * @throws {Error} statusCode=404 订单不存在或无权访问
   */
  async getOrderContact(user_id, order_no) {
    const order = await this.ExchangeRecord.findOne({
      where: { user_id, order_no },
      attributes: ['exchange_record_id', 'order_no', 'address_snapshot']
    })

    if (!order) {
      const notFoundError = new Error('订单不存在或无权访问')
      notFoundError.statusCode = 404
      notFoundError.errorCode = 'ORDER_NOT_FOUND'
      throw notFoundError
    }

    const snapshot = order.address_snapshot
    if (!snapshot || typeof snapshot !== 'object') {
      return null
    }

    // 仅返回联系方式字段（完整明文），不下发其它内部字段
    return {
      receiver_name: snapshot.receiver_name || null,
      receiver_phone: snapshot.receiver_phone || null,
      province: snapshot.province || null,
      city: snapshot.city || null,
      district: snapshot.district || null,
      detail_address: snapshot.detail_address || null
    }
  }

  /**
   * 附加 pay_asset_name（资产中文显示名称）+ pay_asset_icon_url（资产图标 URL）
   * 通过 material_asset_types 表映射 display_name，并复用 resolveMaterialIconUrls 补图标
   *
   * @param {Array|Object} orders - 订单对象或数组
   * @returns {Promise<void>} 直接修改传入对象
   */
  async _attachPayAssetNames(orders) {
    const list = Array.isArray(orders) ? orders : [orders]
    const assetCodes = [...new Set(list.map(o => o.pay_asset_code).filter(Boolean))]
    if (assetCodes.length === 0) return

    const MaterialAssetType = this.models.MaterialAssetType
    const assets = await MaterialAssetType.findAll({
      where: { asset_code: assetCodes },
      attributes: ['asset_code', 'display_name'],
      raw: true
    })

    const nameMap = {}
    assets.forEach(a => {
      nameMap[a.asset_code] = a.display_name
    })

    // 图标 URL（复用 material_asset_types → media_attachments(icon) → media_files 单一真相源，与兑换市场列表/详情 cost_asset_icon_url 同源）
    const iconMap = await resolveMaterialIconUrls(this.models, assetCodes)

    list.forEach(order => {
      if (order.pay_asset_code) {
        if (nameMap[order.pay_asset_code]) {
          order.pay_asset_name = nameMap[order.pay_asset_code]
        }
        order.pay_asset_icon_url = iconMap.get(order.pay_asset_code) || null
      }
    })
  }

  /**
   * 为订单批量附加能力位派生字段（BE-1）：is_prop + refundable
   *
   * 业务场景（拍板点①，能力位心智，沿用 backpack allowed_actions 模式）：
   * - 虚拟道具（item_type='prop'）单买入即消耗、即时完成、禁止退款（PROP_NO_REFUND）。
   * - C 端需要据此决定是否显示"取消/退款"按钮，但不应在前端用 item_type 散落判断。
   *
   * 派生口径（后端权威，前端只读 refundable）：
   * - is_prop：该订单商品是否为虚拟道具（由 exchange_item → item_template.item_type 推导）。
   * - refundable：prop 单恒 false；非 prop 单按后端退款规则（status ∈ ['approved','shipped']）。
   *
   * 性能：批量查询 item_type，避免 N+1（先收集 exchange_item_id，一次性查模板类型）。
   *
   * @param {Array|Object} orders - 订单对象或数组（已 toJSON）
   * @returns {Promise<void>} 直接修改传入对象
   */
  async _attachOrderCapabilities(orders) {
    const list = Array.isArray(orders) ? orders : [orders]
    if (list.length === 0) return

    // 后端退款规则唯一真相源（与 CoreService.refundOrder 的 refundableStatuses 对齐）
    const REFUNDABLE_STATUSES = ['approved', 'shipped']

    // 批量取 exchange_item → item_template.item_type，判定是否 prop
    const exchangeItemIds = [...new Set(list.map(o => o.exchange_item_id).filter(Boolean))]
    const propItemIdSet = new Set()
    if (exchangeItemIds.length > 0) {
      const exchangeItems = await this.ExchangeItem.findAll({
        where: { exchange_item_id: exchangeItemIds },
        attributes: ['exchange_item_id'],
        include: [
          {
            model: this.models.ItemTemplate,
            as: 'itemTemplate',
            attributes: ['item_type'],
            required: false
          }
        ]
      })
      exchangeItems.forEach(ei => {
        if (ei.itemTemplate?.item_type === 'prop') {
          propItemIdSet.add(ei.exchange_item_id)
        }
      })
    }

    list.forEach(order => {
      const isProp = propItemIdSet.has(order.exchange_item_id)
      // 以物易物单不可退款/取消（旧物已核销销毁、pay_amount=0 无货币可退，见 OrderValidator.assertNotBarterOrder）
      const isBarter = order.source === 'barter'
      order.is_prop = isProp
      order.refundable = isProp || isBarter ? false : REFUNDABLE_STATUSES.includes(order.status)
    })
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
      item_type = null,
      page = 1,
      page_size = 20,
      sort_by = 'created_at',
      sort_order = 'DESC'
    } = options

    // 排序参数白名单化（防 SQL 注入：管理员订单查询排序仅允许订单列）
    const { sort_by: safeSortBy, sort_order: safeSortOrder } = sanitizeMarketSort(
      sort_by,
      sort_order,
      ORDER_SORT_WHITELIST,
      'created_at'
    )

    try {
      logger.info('[兑换市场] 管理员查询全量订单列表', {
        status,
        user_id,
        exchange_item_id,
        order_no,
        source,
        item_type,
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

      /*
       * 频道筛选（道具商城订单/星石轨）：exchange_records 无 item_type 列，
       * 频道语义在订单关联商品的模板 item_templates.item_type。
       * 传 item_type 时，通过 exchangeItem → itemTemplate 关联 required:true 做 INNER JOIN 精确筛选；
       * 不传则不约束（兑换市场看全部订单）。复用现有模型关联，零新表、零冗余列。
       */
      const include = []

      /*
       * 关联用户信息（web 后台订单列表「用户」列展示手机号/昵称，而非裸 user_id）。
       * mobile 是 User 的 VIRTUAL 字段（读时自动解密 mobile_encrypted），故 attributes 取 mobile_encrypted；
       * required:false 不影响订单主集（用户被删时订单仍展示）。web 管理后台允许下发手机号明文（非小程序端）。
       */
      include.push({
        model: this.models.User,
        as: 'user',
        attributes: ['user_id', 'nickname', 'mobile_encrypted'],
        required: false
      })

      if (item_type) {
        include.push({
          model: this.models.ExchangeItem,
          as: 'exchangeItem',
          required: true,
          attributes: [],
          include: [
            {
              model: this.models.ItemTemplate,
              as: 'itemTemplate',
              required: true,
              attributes: [],
              where: { item_type }
            }
          ]
        })
      }

      const { count, rows } = await this.ExchangeRecord.findAndCountAll({
        where,
        attributes: EXCHANGE_MARKET_ATTRIBUTES.adminMarketOrderView,
        include,
        distinct: true,
        limit,
        offset,
        order: [[safeSortBy, safeSortOrder]]
      })

      logger.info(
        `[兑换市场] 管理员查询订单成功：找到${count}个订单，返回第${page}页（${rows.length}个）`
      )

      // 添加中文显示名称
      const ordersWithDisplayNames = await displayNameHelper.attachDisplayNames(
        rows.map(order => {
          const plain = order.toJSON()
          /*
           * 用户信息上提为顶层 user_nickname / user_mobile（前端零映射直读），并移除嵌套 user 对象。
           * order.user.mobile 走 User 模型 mobile 虚拟字段 getter 自动解密；取不到则回退 null。
           */
          plain.user_nickname = order.user?.nickname || null
          plain.user_mobile = order.user?.mobile || null
          delete plain.user
          return plain
        }),
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
          order_no,
          item_type
        }
      }
    } catch (error) {
      logger.error('[兑换市场] 管理员查询订单列表失败:', error.message)
      throw new BusinessError(`查询订单列表失败: ${error.message}`, 'EXCHANGE_QUERY_FAILED', 500)
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
        attributes: EXCHANGE_MARKET_ATTRIBUTES.adminMarketOrderView,
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

module.exports = OrderQueryService
