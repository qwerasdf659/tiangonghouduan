/**
 * 天工商户营销平台 V4.7.0 - 兑换市场商城查询子服务
 * Exchange Mall Query Service（技术债务方案 7.4-2：QueryService 拆分）
 *
 * 职责范围：商城商品列表/详情查询（用户端浏览侧）
 * - getMarketItems(): 获取商品列表（用户端）
 * - getItemDetail(): 获取商品详情
 * - attachLevelRequirements(): 批量附加等级门槛脱敏摘要
 * - listExchangeItems(): 查询统一商品列表（ExchangeItem 版本）
 * - getExchangeItemDetail(): 获取单个商品详情（ExchangeItem 版本）
 *
 * 设计原则：
 * - 查询操作不需要事务
 * - 支持 Redis 缓存优化（BusinessCacheHelper）
 * - 使用统一视图常量控制返回字段
 * - 不独立注册服务键，经 QueryService Facade 持有（防单例状态分裂）
 *
 * 全部方法纯搬移自原 services/exchange/QueryService.js（2026-01-31 版），逻辑不变。
 *
 * @module services/exchange/query/MallQueryService
 * @created 2026-07-11（技术债务方案 7.4-2 拆分）
 */

const BusinessError = require('../../../utils/BusinessError')
const logger = require('../../../utils/logger').logger
const ProductCodeGenerator = require('../../../utils/ProductCodeGenerator')
const { BusinessCacheHelper } = require('../../../utils/BusinessCacheHelper')
const displayNameHelper = require('../../../utils/displayNameHelper')
const AdminSystemService = require('../../AdminSystemService')
const { Op } = require('sequelize')
const {
  fetchProductMediaGallery,
  fetchMediaGalleryByEntity,
  resolveMaterialIconUrls
} = require('../../../utils/mediaAttachmentGallery')
const { sanitizeMarketSort } = require('./marketSort')

/**
 * 🎯 统一商品视图常量（ExchangeItem 模型，统一商品中心）
 */
const PRODUCT_VIEW_ATTRIBUTES = {
  /**
   * 商品列表视图（用户浏览）
   */
  listView: [
    'exchange_item_id',
    'item_name',
    'description',
    'category_id',
    'primary_media_id',
    'rarity_code',
    'status',
    'sort_order',
    'space',
    'is_pinned',
    'pinned_at',
    'is_new',
    'is_hot',
    'is_limited',
    'is_recommended',
    'tags',
    'sell_point',
    'usage_rules',
    'publish_at',
    'unpublish_at',
    'created_at'
  ],

  /**
   * 商品详情视图
   */
  detailView: [
    'exchange_item_id',
    'item_name',
    'description',
    'category_id',
    'primary_media_id',
    'item_template_id',
    'mint_instance',
    'rarity_code',
    'status',
    'sort_order',
    'space',
    'is_pinned',
    'pinned_at',
    'is_new',
    'is_hot',
    'is_limited',
    'is_recommended',
    'tags',
    'sell_point',
    'usage_rules',
    'video_url',
    'stock_alert_threshold',
    'publish_at',
    'unpublish_at',
    'attributes_json',
    'created_at',
    'updated_at'
  ]
}

/**
 * 🎯 统一数据输出视图常量（Data Output View Constants，商城侧）
 */
const EXCHANGE_MARKET_ATTRIBUTES = {
  /**
   * 市场商品列表视图（ExchangeItem SPU 物化列；价格/库存只读 SPU 汇总列，不 JOIN SKU/渠道价）
   * 议题1（已拍板）：补齐 stock/sold_count/min_cost_amount/max_cost_amount/min_cost_asset_code 5 个 SPU 物化列，
   * 由 getMarketItems 映射为前端契约字段 cost_amount/cost_asset_code（前端零映射直接读）。
   */
  marketItemView: [
    'exchange_item_id',
    /*
     * item_code（商品编码体系 §3.5）：C 端「只进不出」——select 下发供搜索回显，
     * 小程序前端不渲染该字段为商品信息（约束落在前端展示层，不在后端删字段）。
     */
    'item_code',
    'item_name',
    'description',
    'sort_order',
    'status',
    'primary_media_id',
    'category_id',
    'space',
    'tags',
    'is_new',
    'is_hot',
    'is_limited',
    'is_recommended',
    'sell_point',
    'rarity_code',
    'usage_rules',
    'publish_at',
    'unpublish_at',
    'created_at',
    'stock',
    'sold_count',
    'min_cost_amount',
    'max_cost_amount',
    'min_cost_asset_code',
    'max_quantity_per_order',
    'fulfillment_type',
    'applicable_scope',
    'scoped_store_ids',
    'merchant_id'
  ],

  /**
   * 商品详情视图
   */
  marketItemDetailView: [
    'exchange_item_id',
    // item_code：与列表视图同口径下发（供搜索回显；小程序不渲染，详见 §3.5 编码只进不出）
    'item_code',
    'item_name',
    'description',
    'sort_order',
    'status',
    'primary_media_id',
    'category_id',
    'item_template_id',
    'mint_instance',
    'space',
    'tags',
    'is_new',
    'is_hot',
    'is_limited',
    'is_recommended',
    'sell_point',
    'usage_rules',
    'rarity_code',
    'video_url',
    'stock_alert_threshold',
    'publish_at',
    'unpublish_at',
    'attributes_json',
    'created_at',
    'updated_at',
    /*
     * SPU 物化价格列（与 marketItemView 列表视图对齐，议题1·拍板项②）：
     * 详情接口需与列表接口下发同一套展示价契约，避免"列表有聚合价、详情没有"的契约不一致。
     * 这些列在 getItemDetail 返回前会被映射为前端契约字段 cost_amount/cost_asset_code，
     * 内部列名随后由 DataSanitizer 出口统一删除（不向前端暴露 min_* 命名）。
     */
    'stock',
    'sold_count',
    'min_cost_amount',
    'max_cost_amount',
    'min_cost_asset_code',
    'max_quantity_per_order',
    'fulfillment_type',
    'applicable_scope',
    'scoped_store_ids',
    'merchant_id'
  ]
}

/**
 * 兑换市场商城查询子服务类
 *
 * @class MallQueryService
 */
class MallQueryService {
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
   * 获取兑换市场商品列表
   *
   * @param {Object} options - 查询选项
   * @param {string} [options.status='active'] - 商品状态
   * @param {string} [options.asset_code] - 材料资产代码筛选
   * @param {number} [options.page=1] - 页码
   * @param {number} [options.page_size=20] - 每页数量
   * @param {string} [options.sort_by='sort_order'] - 排序字段
   * @param {string} [options.sort_order='ASC'] - 排序方向
   * @param {boolean} [options.with_counts=false] - 是否返回各筛选维度的聚合计数（C+++ 条件联动）
   * @param {boolean} [options.refresh=false] - 强制刷新缓存
   * @returns {Promise<Object>} 商品列表和分页信息（with_counts=true 时额外包含 filters_count）
   */
  async getMarketItems(options = {}) {
    const {
      status = 'active',
      asset_code = null,
      space = null,
      item_type = null,
      keyword = null,
      category = null,
      exclude_id = null,
      min_cost = null,
      max_cost = null,
      stock_status = null,
      with_counts = false,
      page = 1,
      page_size = 20,
      sort_by = 'sort_order',
      sort_order = 'ASC',
      refresh = false,
      // 当前用户ID（可空）：仅用于 level_requirement.satisfied 实时计算，不参与缓存 key
      user_id = null
    } = options

    // 排序参数白名单化（防 SQL 注入：避免用户原始输入进入 ORDER BY）
    const { sort_by: safeSortBy, sort_order: safeSortOrder } = sanitizeMarketSort(
      sort_by,
      sort_order
    )

    try {
      // Redis 缓存读取（所有筛选参数都必须参与缓存 key，避免不同条件命中相同缓存）
      const cacheParams = {
        status,
        asset_code: asset_code || 'all',
        space: space || 'all',
        item_type: item_type || 'all',
        keyword: keyword || '',
        category: category || 'all',
        exclude_id: exclude_id || 0,
        min_cost: min_cost || 0,
        max_cost: max_cost || 0,
        stock_status: stock_status || 'all',
        with_counts: with_counts ? '1' : '0',
        page,
        page_size,
        sort_by: safeSortBy,
        sort_order: safeSortOrder
      }
      if (!refresh) {
        const cached = await BusinessCacheHelper.getExchangeItems(cacheParams)
        if (cached) {
          logger.debug('[兑换市场] 缓存命中', cacheParams)
          /*
           * 等级门槛摘要在缓存之外附加（拍板⑪扩展2）：satisfied 是"当前用户"的实时状态，
           * 不能进共享缓存；门槛表 1 次 IN 查询 + 等级表进程内缓存，附加成本极低。
           */
          await this.attachLevelRequirements(cached.items, user_id)
          return cached
        }
      }

      logger.info('[兑换市场] 查询商品列表', {
        status,
        asset_code,
        space,
        keyword,
        page,
        page_size
      })

      // 构建 ExchangeItem 表查询条件（price/stock 筛选在嵌套 include 中）
      const where = { status }

      // 空间筛选（lucky/premium）— 臻选空间/幸运空间核心逻辑
      if (space) {
        where.space = { [Op.in]: [space, 'both'] }
      }

      /*
       * 关键词搜索（编码 + 名称双入口，商品编码体系 §3.5/§15.7 步骤6）：
       * 1. 先归一化检测输入是否命中商品编码格式（SP/SK 前缀 + 12 位 Base32，容错大小写/横线/空格）；
       * 2. 命中 SP 码 → 按 exchange_items.item_code 精确匹配（用户照手册输码定位商品）；
       * 3. 命中 SK 码 → 反查该 SKU 所属 SPU，按 exchange_item_id 精确匹配；
       * 4. 未命中编码格式 → 维持 item_name 模糊匹配（原有行为不变）。
       */
      if (keyword) {
        const codeHit = ProductCodeGenerator.detect(keyword)
        if (codeHit.matched && codeHit.prefix === 'SP') {
          where.item_code = codeHit.normalized
        } else if (codeHit.matched && codeHit.prefix === 'SK') {
          const skuRow = await this.ExchangeItemSku.findOne({
            where: { sku_code: codeHit.normalized },
            attributes: ['exchange_item_id']
          })
          // SKU 码命中则定位其所属 SPU；未命中则给一个不可能的 ID，返回空列表（编码查询语义是精确查找）
          where.exchange_item_id = skuRow ? skuRow.exchange_item_id : -1
        } else {
          where.item_name = { [Op.like]: `%${keyword}%` }
        }
      }

      // 分类筛选（支持两级分类：选择一级分类时自动包含其下所有子分类商品）
      if (category) {
        const categoryDefId = await this._resolveCategoryId(category)
        if (categoryDefId !== null) {
          const { Category } = this.models
          const categoryIds = await Category.getIdsWithChildren(categoryDefId)
          where.category_id = { [Op.in]: categoryIds }
        }
      }

      // 排除指定商品（用于详情页"相关推荐"，排除当前商品自身）
      if (exclude_id && where.exchange_item_id === undefined) {
        // SK 编码精确命中时 where.exchange_item_id 已是精确值，排除逻辑不再叠加（编码查询优先）
        where.exchange_item_id = { [Op.ne]: parseInt(exclude_id, 10) }
      }

      // 价格范围筛选（基于 SPU 汇总列 min_cost_amount）
      if (min_cost !== null) {
        where.min_cost_amount = { ...where.min_cost_amount, [Op.gte]: parseInt(min_cost, 10) }
      }
      if (max_cost !== null) {
        where.max_cost_amount = { [Op.lte]: parseInt(max_cost, 10) }
      }

      // 库存状态筛选（基于 SPU 汇总列 stock）
      if (stock_status === 'in_stock') {
        where.stock = { [Op.gt]: 5 }
      } else if (stock_status === 'low_stock') {
        where.stock = { [Op.between]: [1, 5] }
      }

      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.ExchangeItem.findAndCountAll({
        where,
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketItemView,
        include: [
          {
            model: this.models.MediaFile,
            as: 'primary_media',
            attributes: [
              'media_id',
              'object_key',
              'mime_type',
              'thumbnail_keys',
              'width',
              'height'
            ],
            required: false
          },
          /*
           * value_tier 价值分层（BE-2）：value_tier 实际是 item_templates 表字段，
           * 经 exchange_items.item_template_id 关联取得，供 C 端对 high 档做"会员尊享"差异化展示。
           * 仅取 value_tier 单列，不暴露模板其它商业敏感字段。
           * item_type：双轨频道标识（prop=道具商城/星石轨，product/voucher=商品兑换/源晶轨）。
           * 传 item_type 时 required:true + where 实现服务端频道筛选；用于派生顶层 is_prop。
           */
          {
            model: this.models.ItemTemplate,
            as: 'itemTemplate',
            attributes: ['value_tier', 'item_type'],
            required: !!item_type,
            where: item_type ? { item_type } : undefined
          }
        ],
        subQuery: false,
        limit,
        offset,
        order: [
          ['is_pinned', 'DESC'],
          ['pinned_at', 'DESC'],
          ['is_recommended', 'DESC'],
          ['sort_order', 'ASC'],
          [safeSortBy, safeSortOrder]
        ]
      })

      logger.info(`[兑换市场] 找到${count}个商品，返回第${page}页（${rows.length}个）`)

      /*
       * default_sku_id 批量解析（议题1·拍板项②）：仅"单 active SKU"商品下发一个 sku_id，
       * 多 SKU 商品为 null（前端引导进详情选规格）。列表不下发完整 skus[]（守数据脱敏底线）。
       * 批量一次性查本页商品的 active SKU，按 SPU 分组，避免 N+1。
       */
      const pageItemIds = rows.map(r => r.exchange_item_id)
      const defaultSkuMap = await this._resolveDefaultSkuIds(pageItemIds)

      // 添加中文显示名称
      const itemsWithDisplayNames = await displayNameHelper.attachDisplayNames(
        rows.map(item => {
          const plain = item.toJSON()
          // value_tier 上提到顶层（BE-2），并移除嵌套的 itemTemplate，避免泄露模板其它字段
          plain.value_tier = plain.itemTemplate?.value_tier || 'low'
          // is_prop 派生位：双轨频道标识（item_type='prop'），供 C 端展示层判断，避免前端散落判断 item_type
          plain.is_prop = plain.itemTemplate?.item_type === 'prop'
          delete plain.itemTemplate
          /*
           * 议题1（已拍板）：把 SPU 物化列映射为前端契约字段，前端零映射直接读：
           * - cost_amount      ← min_cost_amount（展示价=最低单价）
           * - cost_asset_code  ← min_cost_asset_code（计价资产，决定积分轨/星石轨）
           * 列表只读 SPU 物化列，不 JOIN SKU/渠道价表（最快、最易缓存、最贴脱敏）。
           */
          plain.cost_amount = plain.min_cost_amount !== null ? plain.min_cost_amount : null
          plain.cost_asset_code = plain.min_cost_asset_code || null
          // 货架一键兑换：单 active SKU 商品给 sku_id，多 SKU 给 null
          plain.default_sku_id = defaultSkuMap.get(plain.exchange_item_id) || null
          return plain
        }),
        [{ field: 'status', dictType: 'product_status' }]
      )

      /*
       * 兑换所需资产「图标 + 中文名」补全（与抽奖图/余额图/背包图共用同一图标真相源）：
       * 复用 resolveMaterialIconUrls（material_asset_types → media_attachments(icon) → media_files），
       * 不新造图标拼装逻辑。前端零映射直接读 cost_asset_icon_url / cost_asset_name。
       */
      const listAssetCodes = itemsWithDisplayNames.map(i => i.cost_asset_code).filter(Boolean)
      const listIconMap = await resolveMaterialIconUrls(this.models, listAssetCodes)
      const listNameMap = await this._resolveAssetDisplayNames(listAssetCodes)
      itemsWithDisplayNames.forEach(i => {
        i.cost_asset_icon_url = i.cost_asset_code
          ? listIconMap.get(i.cost_asset_code) || null
          : null
        i.cost_asset_name = i.cost_asset_code
          ? listNameMap.get(i.cost_asset_code) || i.cost_asset_code
          : null
      })

      /**
       * 计算统计摘要（需求6 + 需求8）
       * - trending_count: 近7天销量（基于 exchange_records 近7天 COUNT）
       * - avg_discount: 平均折扣率（cost_amount / original_price，仅计算 original_price > 0 的商品）
       */
      const summary = await this._calculateListSummary(where)

      const result = {
        items: itemsWithDisplayNames,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        },
        summary
      }

      // C+++ 聚合计数：每个维度排除自身条件，保留其他维度条件（条件联动）
      if (with_counts) {
        result.filters_count = await this._buildFiltersCount({
          status,
          asset_code,
          space,
          keyword,
          category,
          min_cost,
          max_cost,
          stock_status
        })
      }

      // 写入 Redis 缓存（level_requirement 不入缓存——satisfied 为用户级实时数据）
      await BusinessCacheHelper.setExchangeItems(cacheParams, result)

      // 等级门槛摘要（拍板⑪扩展2"锁住但可见"，缓存后按当前用户附加）
      await this.attachLevelRequirements(result.items, user_id)

      return result
    } catch (error) {
      logger.error('[兑换市场] 查询商品列表失败:', error.message)
      throw new BusinessError(`查询商品列表失败: ${error.message}`, 'EXCHANGE_QUERY_FAILED', 500)
    }
  }

  /**
   * 获取单个商品详情
   *
   * @param {number} item_id - 商品ID
   * @param {Object} [options={}] - 选项
   * @param {number|null} [options.user_id] - 当前用户ID（用于 level_requirement.satisfied 实时计算）
   * @returns {Promise<Object>} 商品详情
   */
  async getItemDetail(item_id, options = {}) {
    try {
      const item = await this.ExchangeItem.findOne({
        where: { exchange_item_id: item_id },
        attributes: EXCHANGE_MARKET_ATTRIBUTES.marketItemDetailView,
        include: [
          {
            model: this.models.MediaFile,
            as: 'primary_media',
            attributes: [
              'media_id',
              'object_key',
              'mime_type',
              'thumbnail_keys',
              'width',
              'height'
            ],
            required: false
          },
          /*
           * value_tier 价值分层（BE-2）：来自 item_templates，经 item_template_id 关联，
           * 仅取 value_tier 单列供详情页"会员解锁"差异化展示。
           */
          {
            model: this.models.ItemTemplate,
            as: 'itemTemplate',
            attributes: ['value_tier'],
            required: false
          },
          {
            model: this.models.RarityDef,
            as: 'rarityDef',
            attributes: ['rarity_code', 'display_name', 'color_hex', 'tier'],
            required: false
          },
          {
            model: this.models.Category,
            as: 'category',
            attributes: ['category_id', 'category_code', 'category_name'],
            required: false
          },
          ...(this.models.ExchangeItemSku
            ? [
                {
                  model: this.models.ExchangeItemSku,
                  as: 'skus',
                  where: { status: 'active' },
                  required: false,
                  order: [['sort_order', 'ASC']],
                  include: [
                    {
                      model: this.models.ExchangeChannelPrice,
                      as: 'channelPrices',
                      required: false,
                      attributes: ['cost_asset_code', 'cost_amount', 'original_amount']
                    }
                  ],
                  attributes: [
                    'sku_id',
                    'sku_code',
                    'stock',
                    'sold_count',
                    'status',
                    'sort_order',
                    'image_id'
                  ]
                }
              ]
            : [])
        ]
      })

      if (!item) {
        throw new BusinessError('商品不存在', 'EXCHANGE_ITEM_NOT_FOUND', 404)
      }

      const { images, detail_images, showcase_images } = await fetchProductMediaGallery(
        this.models,
        item_id
      )

      // 添加中文显示名称
      const itemJSON = item.toJSON()
      // value_tier 上提到顶层（BE-2），移除嵌套 itemTemplate
      itemJSON.value_tier = itemJSON.itemTemplate?.value_tier || 'low'
      delete itemJSON.itemTemplate
      const itemWithDisplayNames = await displayNameHelper.attachDisplayNames(itemJSON, [
        { field: 'status', dictType: 'product_status' }
      ])

      // 挂载多图数据到返回结果
      itemWithDisplayNames.images = images
      itemWithDisplayNames.detail_images = detail_images
      itemWithDisplayNames.showcase_images = showcase_images

      /*
       * 事项B：为每个 SKU 组装多图轮播 images[]（attachable_type='exchange_item_sku'，role='gallery'）。
       * image_id 保留作首图兼容（封面快取）；多图走多态表。无多图时为空数组，前端回退到 SPU images[]。
       * 批量取，避免 N+1：本商品 SKU 数量有限，逐个查可接受（与下方 channelPrices 同层级处理）。
       */
      if (Array.isArray(itemWithDisplayNames.skus)) {
        for (const sku of itemWithDisplayNames.skus) {
          // eslint-disable-next-line no-await-in-loop
          const skuGallery = await fetchMediaGalleryByEntity(
            this.models,
            'exchange_item_sku',
            sku.sku_id
          )
          sku.images = skuGallery.images
        }
      }

      /*
       * 复合门槛只读出口（BE-3）：高价值实物的"会员解锁条件"提前下发，
       * 让 C 端在商品详情页就能渲染"解锁条件清单"，而非等到下单那一刻才被拒。
       * 仅下发门槛构成（最低成长等级 key、额外消耗资产、需消耗道具），
       * 不下发任何商业敏感数值；无门槛配置时为 null。
       */
      itemWithDisplayNames.redeem_requirement = await this._buildRedeemRequirementView(item_id)

      /*
       * 等级门槛脱敏摘要（拍板⑪扩展2）：与列表接口同款 level_requirement
       * { min_level_name, max_level_name, satisfied }，前端渲染专享角标 + 置灰按钮。
       */
      await this.attachLevelRequirements(itemWithDisplayNames, options.user_id || null)

      /*
       * SPU 计价契约对齐（议题1·拍板项②，2026-06-12 落地）：
       * 与列表接口 getMarketItems 同款映射，把 SPU 物化列映射为前端契约字段，前端零映射直接读：
       * - cost_amount      ← min_cost_amount（展示价=最低单价；物化列为空则为 null）
       * - cost_asset_code  ← min_cost_asset_code（计价资产码，决定积分轨/红源晶碎片轨等）
       * default_sku_id：仅"单 active SKU"商品下发该 sku_id（前端自动选中、提交带上）；
       *   多 active SKU 为 null（前端必须让用户选规格，后端 sku_id 必填不兜底）。
       */
      itemWithDisplayNames.cost_amount =
        itemWithDisplayNames.min_cost_amount != null ? itemWithDisplayNames.min_cost_amount : null
      itemWithDisplayNames.cost_asset_code = itemWithDisplayNames.min_cost_asset_code || null
      const activeSkus = Array.isArray(itemWithDisplayNames.skus)
        ? itemWithDisplayNames.skus.filter(sku => sku.status === 'active')
        : []
      itemWithDisplayNames.default_sku_id = activeSkus.length === 1 ? activeSkus[0].sku_id : null

      /*
       * 兑换所需资产「图标 + 中文名」补全（与列表接口同款，共用 resolveMaterialIconUrls 真相源）。
       * 详情页同时收集顶层 cost_asset_code 与各 SKU 渠道价的 cost_asset_code，统一补图标/名。
       */
      const detailAssetCodes = [itemWithDisplayNames.cost_asset_code]
      if (Array.isArray(itemWithDisplayNames.skus)) {
        itemWithDisplayNames.skus.forEach(sku => {
          if (Array.isArray(sku.channelPrices)) {
            sku.channelPrices.forEach(p => detailAssetCodes.push(p.cost_asset_code))
          }
        })
      }
      const detailIconMap = await resolveMaterialIconUrls(this.models, detailAssetCodes)
      const detailNameMap = await this._resolveAssetDisplayNames(detailAssetCodes)
      itemWithDisplayNames.cost_asset_icon_url = itemWithDisplayNames.cost_asset_code
        ? detailIconMap.get(itemWithDisplayNames.cost_asset_code) || null
        : null
      itemWithDisplayNames.cost_asset_name = itemWithDisplayNames.cost_asset_code
        ? detailNameMap.get(itemWithDisplayNames.cost_asset_code) ||
          itemWithDisplayNames.cost_asset_code
        : null
      if (Array.isArray(itemWithDisplayNames.skus)) {
        itemWithDisplayNames.skus.forEach(sku => {
          if (Array.isArray(sku.channelPrices)) {
            sku.channelPrices.forEach(p => {
              p.cost_asset_icon_url = p.cost_asset_code
                ? detailIconMap.get(p.cost_asset_code) || null
                : null
              p.cost_asset_name = p.cost_asset_code
                ? detailNameMap.get(p.cost_asset_code) || p.cost_asset_code
                : null
            })
          }
        })
      }

      /*
       * 事项C：下发全站轮播速度（exchange/gallery_autoplay_interval_ms，毫秒），
       * 小程序 swiper.interval 读取，读不到用前端默认兜底。复用 AdminSystemService 既有 settings 机制。
       */
      itemWithDisplayNames.gallery_autoplay_interval_ms = await AdminSystemService.getSettingValue(
        'exchange',
        'exchange/gallery_autoplay_interval_ms',
        3000
      )

      return {
        item: itemWithDisplayNames
      }
    } catch (error) {
      logger.error(`[兑换市场] 查询商品详情失败(item_id:${item_id}):`, error.message)
      throw error
    }
  }

  /**
   * 批量解析资产码 → 中文展示名（material_asset_types.display_name 真相源）
   *
   * 与抽奖/余额/背包共用同一资产名真相源，供兑换列表/详情补 cost_asset_name。
   * @param {string[]} assetCodes - 资产码数组（如 ['red_core_shard','star_stone']）
   * @returns {Promise<Map<string,string>>} asset_code → display_name
   */
  async _resolveAssetDisplayNames(assetCodes) {
    const map = new Map()
    const codes = [...new Set((assetCodes || []).filter(Boolean))]
    if (codes.length === 0) return map

    const MaterialAssetType = this.models.MaterialAssetType
    const rows = await MaterialAssetType.findAll({
      where: { asset_code: { [Op.in]: codes } },
      attributes: ['asset_code', 'display_name'],
      raw: true
    })
    rows.forEach(r => map.set(r.asset_code, r.display_name))
    return map
  }

  /**
   * 构造商品详情页"复合门槛"只读视图（BE-3）
   *
   * 业务场景：
   * - 高价值实物（value_tier='high'）通常配有"成长等级 + 多资产 + 消耗道具"复合门槛。
   * - C 端需在商品详情页提前展示"解锁条件清单"，而非等到下单被拒。
   *
   * 安全口径：
   * - 仅下发门槛构成（最低成长等级 key、额外消耗资产组合、需消耗道具及数量）。
   * - 不下发任何商业敏感数值（如概率、权重、库存、成本价）。
   * - 无生效门槛配置时返回 null（前端据此不渲染解锁条件区）。
   *
   * @param {number} exchange_item_id - 兑换商品ID
   * @returns {Promise<Object|null>} 门槛只读视图或 null
   */
  async _buildRedeemRequirementView(exchange_item_id) {
    const ExchangeRedeemRequirement = this.models.ExchangeRedeemRequirement
    if (!ExchangeRedeemRequirement) return null

    // 复用模型既有的"取生效门槛"方法（商品级，sku_id=null）
    const requirement = await ExchangeRedeemRequirement.getEffectiveRequirement(
      exchange_item_id,
      null
    )
    if (!requirement) return null

    return {
      min_growth_level_key: requirement.min_growth_level_key || null,
      max_growth_level_key: requirement.max_growth_level_key || null,
      extra_cost_assets: requirement.extra_cost_assets || [],
      required_consume_items: requirement.required_consume_items || []
    }
  }

  /**
   * 批量附加等级门槛脱敏摘要 level_requirement（拍板⑪扩展2"锁住但可见"，2026-07-10）
   *
   * 业务场景（橱窗效应）：
   * - 有等级门槛的商品在列表/详情下发 { min_level_name, max_level_name, satisfied }，
   *   前端渲染专享角标 + 置灰按钮——低等级用户看得见高等级专享商品，拉动消费升级。
   *
   * 安全口径：
   * - 只下发等级展示名 + satisfied 布尔（后端按当前用户实时计算）；
   *   倍数/权重/门槛积分数值一律不下发（守脱敏红线）。
   *
   * 性能（工程加固 §9-5 防 N+1）：
   * - 门槛表按 exchange_item_id IN (...) 一次查全；
   * - 用户等级只 resolve 一次复用于全列表；
   * - 等级表走模型 60s 进程内缓存。
   *
   * @param {Array<Object>} items - 商品列表（已 toJSON，含 exchange_item_id；原地附加 level_requirement）
   * @param {number|null} user_id - 当前用户ID（未登录为 null，存在门槛时 satisfied=false）
   * @returns {Promise<void>} 直接修改传入对象
   */
  async attachLevelRequirements(items, user_id = null) {
    const list = Array.isArray(items) ? items : [items]
    if (list.length === 0) return
    const ExchangeRedeemRequirement = this.models.ExchangeRedeemRequirement
    const UserGrowthLevel = this.models.UserGrowthLevel
    if (!ExchangeRedeemRequirement || !UserGrowthLevel) {
      list.forEach(item => {
        item.level_requirement = null
      })
      return
    }

    const itemIds = [...new Set(list.map(i => i.exchange_item_id).filter(Boolean))]
    if (itemIds.length === 0) return

    // 一次 IN 查询取全部生效中的商品级门槛（sku_id=NULL；SKU 级门槛不在列表层展示）
    const now = new Date()
    const rows = await ExchangeRedeemRequirement.findAll({
      where: {
        exchange_item_id: itemIds,
        sku_id: null,
        is_enabled: true,
        [Op.and]: [
          { [Op.or]: [{ publish_at: null }, { publish_at: { [Op.lte]: now } }] },
          { [Op.or]: [{ unpublish_at: null }, { unpublish_at: { [Op.gt]: now } }] }
        ]
      },
      attributes: ['exchange_item_id', 'min_growth_level_key', 'max_growth_level_key'],
      raw: true
    })
    const requirementByItemId = new Map(rows.map(r => [Number(r.exchange_item_id), r]))

    // 等级表（60s 进程内缓存）+ 用户等级只 resolve 一次
    const levels = await UserGrowthLevel.getActiveLevels()
    const levelByKey = new Map(levels.map(l => [l.level_key, l]))
    let userSortOrder = -1
    if (user_id) {
      const user = await this.models.User.findByPk(user_id, { attributes: ['user_id'] })
      // 累计积分账本派生（拍板 4：history_total_points 冗余列已删除）
      const AssetQueryService = require('../../asset/QueryService')
      const historyTotalPoints = user ? await AssetQueryService.getHistoryTotalPoints(user_id) : 0
      const userLevel = user ? await UserGrowthLevel.resolveLevel(historyTotalPoints) : null
      userSortOrder = userLevel ? Number(userLevel.sort_order) : -1
    }

    for (const item of list) {
      const req = requirementByItemId.get(Number(item.exchange_item_id))
      if (!req || (!req.min_growth_level_key && !req.max_growth_level_key)) {
        item.level_requirement = null
        continue
      }
      const minLevel = req.min_growth_level_key ? levelByKey.get(req.min_growth_level_key) : null
      const maxLevel = req.max_growth_level_key ? levelByKey.get(req.max_growth_level_key) : null
      // 未登录访客视为不满足（登录后按真实等级区间实时计算）
      const satisfied = user_id
        ? (!minLevel || userSortOrder >= Number(minLevel.sort_order)) &&
          (!maxLevel || userSortOrder <= Number(maxLevel.sort_order))
        : false
      item.level_requirement = {
        min_level_name: minLevel ? minLevel.level_name : null,
        max_level_name: maxLevel ? maxLevel.level_name : null,
        satisfied
      }
    }
  }

  /**
   * C+++ 聚合计数：各筛选维度交叉排除计数（条件联动）
   *
   * 每个维度的 COUNT 排除自身条件但保留其他维度条件，
   * 使前端能够展示"如果选了这个分类，有几个商品"的动态计数。
   *
   * @param {Object} filterValues - 当前所有筛选值
   * @returns {Promise<Object>} 各维度的聚合计数 { categories, cost_ranges, stock_statuses }
   * @private
   */
  async _buildFiltersCount(filterValues) {
    const {
      status,
      asset_code: _asset_code,
      space,
      keyword,
      category,
      min_cost: _min_cost,
      max_cost: _max_cost,
      stock_status: _stock_status
    } = filterValues

    try {
      const { sequelize } = this.ExchangeItem

      /**
       * 构建基础 WHERE（status + asset_code + space + keyword 不参与维度排除，始终保留）
       * 这些是"全局筛选"，不属于 facet 维度
       *
       * @returns {Object} SQL 片段和参数 { parts, replacements }
       */
      const buildBaseWhere = () => {
        const parts = ['p.status = :status']
        const replacements = { status }

        if (space) {
          parts.push('p.space IN (:space_values)')
          replacements.space_values = [space, 'both']
        }
        if (keyword) {
          /*
           * 与 getMarketItems 主查询同一套编码搜索语义（商品编码体系 §3.5）：
           * 命中 SP 编码格式 → item_code 精确匹配；否则 item_name 模糊匹配。
           * （SK 码属 SKU 层，聚合计数按 SPU 维度统计，此处按名称分支兜底即可）
           */
          const codeHit = ProductCodeGenerator.detect(keyword)
          if (codeHit.matched && codeHit.prefix === 'SP') {
            parts.push('p.item_code = :item_code_kw')
            replacements.item_code_kw = codeHit.normalized
          } else {
            parts.push('p.item_name LIKE :keyword')
            replacements.keyword = `%${keyword}%`
          }
        }
        return { parts, replacements }
      }

      const catBase = buildBaseWhere()

      const priceBase = buildBaseWhere()
      if (category) {
        const catDefId = await this._resolveCategoryId(category)
        if (catDefId !== null) {
          const { Category } = this.models
          const catIds = await Category.getIdsWithChildren(catDefId)
          priceBase.parts.push(`p.category_id IN (${catIds.join(',')})`)
        }
      }

      const stockBase = buildBaseWhere()
      if (category) {
        const catDefIdS = await this._resolveCategoryId(category)
        if (catDefIdS !== null) {
          const { Category } = this.models
          const catIdsS = await Category.getIdsWithChildren(catDefIdS)
          stockBase.parts.push(`p.category_id IN (${catIdsS.join(',')})`)
        }
      }

      const [categoryRows, priceRows, stockRows] = await Promise.all([
        sequelize.query(
          `SELECT COALESCE(c.category_code, '__null__') AS category_code, COUNT(*) AS cnt
           FROM exchange_items p
           LEFT JOIN categories c ON p.category_id = c.category_id
           WHERE ${catBase.parts.join(' AND ')}
           GROUP BY p.category_id, c.category_code`,
          { replacements: catBase.replacements, type: sequelize.constructor.QueryTypes.SELECT }
        ),
        sequelize.query(
          `SELECT
             SUM(CASE WHEN ecp.cost_amount <= 100 THEN 1 ELSE 0 END) AS range_0_100,
             SUM(CASE WHEN ecp.cost_amount > 100 AND ecp.cost_amount <= 500 THEN 1 ELSE 0 END) AS range_100_500,
             SUM(CASE WHEN ecp.cost_amount > 500 AND ecp.cost_amount <= 1000 THEN 1 ELSE 0 END) AS range_500_1000,
             SUM(CASE WHEN ecp.cost_amount > 1000 THEN 1 ELSE 0 END) AS range_1000_plus,
             COUNT(DISTINCT p.exchange_item_id) AS total
           FROM exchange_items p
           LEFT JOIN exchange_item_skus ps ON ps.exchange_item_id = p.exchange_item_id AND ps.status = 'active'
           LEFT JOIN exchange_channel_prices ecp ON ecp.sku_id = ps.sku_id
           WHERE ${priceBase.parts.join(' AND ')}`,
          { replacements: priceBase.replacements, type: sequelize.constructor.QueryTypes.SELECT }
        ),
        sequelize.query(
          `SELECT
             SUM(CASE WHEN ps.stock > 5 THEN 1 ELSE 0 END) AS in_stock,
             SUM(CASE WHEN ps.stock BETWEEN 1 AND 5 THEN 1 ELSE 0 END) AS low_stock,
             SUM(CASE WHEN ps.stock = 0 THEN 1 ELSE 0 END) AS out_of_stock,
             COUNT(*) AS total
           FROM exchange_items p
           LEFT JOIN exchange_item_skus ps ON ps.exchange_item_id = p.exchange_item_id AND ps.status = 'active'
           WHERE ${stockBase.parts.join(' AND ')}`,
          { replacements: stockBase.replacements, type: sequelize.constructor.QueryTypes.SELECT }
        )
      ])

      // 组装分类计数结果
      const categories = {}
      for (const row of categoryRows) {
        categories[row.category_code] = parseInt(row.cnt, 10)
      }

      // 组装价格区间计数结果
      const priceResult = priceRows[0] || {}
      const cost_ranges = {
        '0-100': parseInt(priceResult.range_0_100 || 0, 10),
        '100-500': parseInt(priceResult.range_100_500 || 0, 10),
        '500-1000': parseInt(priceResult.range_500_1000 || 0, 10),
        '1000+': parseInt(priceResult.range_1000_plus || 0, 10),
        total: parseInt(priceResult.total || 0, 10)
      }

      // 组装库存状态计数结果
      const stockResult = stockRows[0] || {}
      const stock_statuses = {
        in_stock: parseInt(stockResult.in_stock || 0, 10),
        low_stock: parseInt(stockResult.low_stock || 0, 10),
        out_of_stock: parseInt(stockResult.out_of_stock || 0, 10),
        total: parseInt(stockResult.total || 0, 10)
      }

      return { categories, cost_ranges, stock_statuses }
    } catch (error) {
      logger.warn('[兑换市场] 聚合计数计算失败（非致命）:', error.message)
      return { categories: {}, cost_ranges: {}, stock_statuses: {} }
    }
  }

  /**
   * 将 category_code 或 category_id 解析为 category_id（统一走 Category.resolveToId）
   *
   * @param {string|number} category - 分类代码或分类ID
   * @returns {Promise<number|null>} category_id，无法解析时返回 null
   * @private
   */
  async _resolveCategoryId(category) {
    const Category = this.models.Category
    if (!Category) return null
    return Category.resolveToId(category)
  }

  /**
   * 批量解析列表项的 default_sku_id（议题1·拍板项②）
   *
   * 业务规则：
   * - 仅"恰好 1 个 active SKU"的商品返回该 sku_id（货架一键兑换体验最顺）。
   * - 多 active SKU 商品返回 null（前端引导进详情选规格）。
   * - 无 active SKU 商品不在结果 Map 中（调用方取到 undefined → null）。
   *
   * 脱敏：列表只下发一个 default_sku_id，不下发完整 skus[]（不暴露 SKU 明细/定价结构给小程序）。
   * 性能：一次性查本页所有商品的 active SKU 并按 SPU 分组，避免 N+1。
   *
   * @param {number[]} exchangeItemIds - 本页商品 ID 列表
   * @returns {Promise<Map<number, number|null>>} exchange_item_id → default_sku_id（单SKU时为id，多SKU为null）
   * @private
   */
  async _resolveDefaultSkuIds(exchangeItemIds) {
    const result = new Map()
    if (!exchangeItemIds || exchangeItemIds.length === 0) return result
    if (!this.ExchangeItemSku) return result

    const skus = await this.ExchangeItemSku.findAll({
      where: { exchange_item_id: { [Op.in]: exchangeItemIds }, status: 'active' },
      attributes: ['sku_id', 'exchange_item_id'],
      order: [['sort_order', 'ASC']],
      raw: true
    })

    // 按 SPU 分组统计 active SKU
    const grouped = new Map()
    for (const sku of skus) {
      if (!grouped.has(sku.exchange_item_id)) grouped.set(sku.exchange_item_id, [])
      grouped.get(sku.exchange_item_id).push(sku.sku_id)
    }

    for (const [itemId, skuIds] of grouped) {
      // 仅单 active SKU 商品给 default_sku_id，多 SKU 给 null
      result.set(itemId, skuIds.length === 1 ? skuIds[0] : null)
    }

    return result
  }

  /**
   * 计算商品列表统计摘要（需求6 趋势销量 + 需求8 折扣率）
   *
   * 统计字段：
   * - trending_count: 近7天总销量（基于当前筛选条件的商品在 exchange_records 中近7天的记录数）
   * - avg_discount: 平均折扣率（cost_amount / original_price，仅计算 original_price > 0 的商品）
   *
   * @param {Object} where - 当前查询条件（从 getMarketItems 传入）
   * @returns {Promise<Object>} 统计摘要
   * @private
   */
  async _calculateListSummary(where) {
    try {
      const { sequelize } = this.ExchangeItem

      // 1. 计算近7天趋势销量（trending_count）
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      const [trendingResult] = await sequelize.query(
        `SELECT COUNT(*) AS trending_count
         FROM exchange_records er
         INNER JOIN exchange_items p ON er.exchange_item_id = p.exchange_item_id
         WHERE er.created_at >= :seven_days_ago
           AND er.status IN ('completed', 'shipped', 'pending')
           AND p.status = :item_status`,
        {
          replacements: {
            seven_days_ago: sevenDaysAgo,
            item_status: where.status || 'active'
          },
          type: sequelize.constructor.QueryTypes.SELECT
        }
      )

      // 2. 平均评分（avg_rating）
      const [discountAndRatingResult] = await sequelize.query(
        `SELECT
           AVG(er.rating) AS avg_rating,
           COUNT(er.rating) AS rated_order_count
         FROM exchange_items p
         LEFT JOIN exchange_records er
           ON er.exchange_item_id = p.exchange_item_id AND er.rating IS NOT NULL
         WHERE p.status = :item_status`,
        {
          replacements: { item_status: where.status || 'active' },
          type: sequelize.constructor.QueryTypes.SELECT
        }
      )

      return {
        /** 近7天总销量（所有在售商品） */
        trending_count: parseInt(trendingResult?.trending_count || 0, 10),
        /** 平均折扣率（0-1之间，如0.85表示85折，null表示无数据） */
        avg_discount: discountAndRatingResult?.avg_discount
          ? parseFloat(parseFloat(discountAndRatingResult.avg_discount).toFixed(4))
          : null,
        /** 有原价数据的商品数量 */
        has_original_price_count: parseInt(
          discountAndRatingResult?.has_original_price_count || 0,
          10
        ),
        /** 平均评分（1-5分，null表示暂无评分数据） */
        avg_rating: discountAndRatingResult?.avg_rating
          ? parseFloat(parseFloat(discountAndRatingResult.avg_rating).toFixed(2))
          : null,
        /** 已评分订单数量 */
        rated_order_count: parseInt(discountAndRatingResult?.rated_order_count || 0, 10)
      }
    } catch (error) {
      logger.warn('[兑换市场] 统计摘要计算失败（非致命）:', error.message)
      // 统计失败不影响列表返回
      return {
        trending_count: 0,
        avg_discount: null,
        has_original_price_count: 0,
        avg_rating: null,
        rated_order_count: 0
      }
    }
  }

  /*
   * =====================================================================
   *  兑换商品查询方法（ExchangeItem / ExchangeItemSku / ExchangeChannelPrice）
   * =====================================================================
   */

  /**
   * 查询统一商品列表
   *
   * 数据来源：exchange_items → exchange_item_skus → exchange_channel_prices
   *
   * @param {Object} [filters={}] - 筛选条件
   * @param {string}  [filters.status='active']    - 商品状态
   * @param {string}  [filters.asset_code]          - 材料资产代码（定价层筛选）
   * @param {string}  [filters.space]               - 展示空间 lucky/premium
   * @param {string}  [filters.keyword]             - 关键词搜索（匹配 item_name）
   * @param {string|number} [filters.category]      - 品类代码或品类 ID
   * @param {number}  [filters.exclude_id]          - 排除指定商品
   * @param {number}  [filters.min_cost]            - 最低价格
   * @param {number}  [filters.max_cost]            - 最高价格
   * @param {Object} [pagination={}] - 分页与排序
   * @param {number}  [pagination.page=1]           - 页码
   * @param {number}  [pagination.page_size=20]     - 每页数量
   * @param {string}  [pagination.sort_by='sort_order'] - 排序字段
   * @param {string}  [pagination.sort_order='ASC'] - 排序方向
   * @returns {Promise<Object>} { items, pagination }
   */
  async listExchangeItems(filters = {}, pagination = {}) {
    const {
      status = 'active',
      asset_code = null,
      space = null,
      keyword = null,
      category = null,
      exclude_id = null,
      min_cost = null,
      max_cost = null
    } = filters

    const { page = 1, page_size = 20, sort_by = 'sort_order', sort_order = 'ASC' } = pagination

    // 排序参数白名单化（防 SQL 注入：避免用户原始输入进入 ORDER BY）
    const { sort_by: safeSortBy, sort_order: safeSortOrder } = sanitizeMarketSort(
      sort_by,
      sort_order
    )

    try {
      if (!this.ExchangeItem) {
        throw new BusinessError(
          'ExchangeItem 模型未注册，请检查 models 配置',
          'EXCHANGE_CONFIG_ERROR',
          500
        )
      }

      logger.info('[商品中心] 查询商品列表', {
        status,
        asset_code,
        space,
        keyword,
        page,
        page_size
      })

      // ---- 商品层 WHERE ----
      const where = { status }

      if (space) {
        where.space = { [Op.in]: [space, 'both'] }
      }
      if (keyword) {
        where.item_name = { [Op.like]: `%${keyword}%` }
      }
      if (category) {
        const categoryIds = await this._resolveCategoryIds(category)
        if (categoryIds && categoryIds.length > 0) {
          where.category_id = { [Op.in]: categoryIds }
        }
      }
      if (exclude_id) {
        where.exchange_item_id = { [Op.ne]: parseInt(exclude_id, 10) }
      }

      // ---- 定价层 WHERE（ExchangeChannelPrice）----
      const priceWhere = { is_enabled: true }
      const hasPriceFilter = !!(asset_code || min_cost !== null || max_cost !== null)

      if (asset_code) {
        priceWhere.cost_asset_code = asset_code
      }
      if (min_cost !== null) {
        priceWhere.cost_amount = {
          ...priceWhere.cost_amount,
          [Op.gte]: parseInt(min_cost, 10)
        }
      }
      if (max_cost !== null) {
        priceWhere.cost_amount = {
          ...priceWhere.cost_amount,
          [Op.lte]: parseInt(max_cost, 10)
        }
      }

      const offset = (page - 1) * page_size
      const limit = page_size

      const { count, rows } = await this.ExchangeItem.findAndCountAll({
        where,
        attributes: PRODUCT_VIEW_ATTRIBUTES.listView,
        include: [
          {
            model: this.Category,
            as: 'category',
            attributes: ['category_id', 'category_name', 'category_code'],
            required: false
          },
          {
            model: this.models.MediaFile,
            as: 'primary_media',
            attributes: [
              'media_id',
              'object_key',
              'mime_type',
              'thumbnail_keys',
              'width',
              'height'
            ],
            required: false
          },
          {
            model: this.models.RarityDef,
            as: 'rarityDef',
            attributes: ['rarity_code', 'display_name', 'color_hex', 'tier'],
            required: false
          },
          {
            model: this.ExchangeItemSku,
            as: 'skus',
            where: { status: 'active' },
            required: hasPriceFilter,
            attributes: ['sku_id', 'sku_code', 'stock', 'sold_count', 'status', 'sort_order'],
            include: [
              {
                model: this.ExchangeChannelPrice,
                as: 'channelPrices',
                where: priceWhere,
                required: hasPriceFilter,
                attributes: [
                  'id',
                  'cost_asset_code',
                  'cost_amount',
                  'original_amount',
                  'is_enabled'
                ]
              }
            ]
          }
        ],
        limit,
        offset,
        order: [
          ['is_pinned', 'DESC'],
          ['pinned_at', 'DESC'],
          ['is_recommended', 'DESC'],
          ['sort_order', 'ASC'],
          [safeSortBy, safeSortOrder]
        ],
        distinct: true,
        subQuery: false
      })

      logger.info(`[商品中心] 找到${count}个商品，返回第${page}页（${rows.length}个）`)

      const items = rows.map(p => this._formatExchangeItemForListing(p))

      return {
        items,
        pagination: {
          total: count,
          page,
          page_size,
          total_pages: Math.ceil(count / page_size)
        }
      }
    } catch (error) {
      logger.error('[商品中心] 查询商品列表失败:', error.message)
      throw new BusinessError(`查询商品列表失败: ${error.message}`, 'EXCHANGE_QUERY_FAILED', 500)
    }
  }

  /**
   * 获取单个商品详情（ExchangeItem 版本，替代 getItemDetail）
   *
   * 包含 SKU 列表、渠道定价、品类、稀有度、主图、画廊图等全量信息
   *
   * @param {number} productId - 商品 ID（exchange_items.exchange_item_id）
   * @returns {Promise<Object>} { item }
   */
  async getExchangeItemDetail(productId) {
    try {
      if (!this.ExchangeItem) {
        throw new BusinessError(
          'ExchangeItem 模型未注册，请检查 models 配置',
          'EXCHANGE_CONFIG_ERROR',
          500
        )
      }

      logger.info('[商品中心] 查询商品详情', { exchange_item_id: productId })

      const product = await this.ExchangeItem.findOne({
        where: { exchange_item_id: productId },
        attributes: PRODUCT_VIEW_ATTRIBUTES.detailView,
        include: [
          {
            model: this.Category,
            as: 'category',
            attributes: ['category_id', 'category_name', 'category_code'],
            required: false
          },
          {
            model: this.models.MediaFile,
            as: 'primary_media',
            attributes: [
              'media_id',
              'object_key',
              'mime_type',
              'thumbnail_keys',
              'width',
              'height'
            ],
            required: false
          },
          {
            model: this.models.RarityDef,
            as: 'rarityDef',
            attributes: ['rarity_code', 'display_name', 'color_hex', 'tier'],
            required: false
          },
          {
            model: this.ExchangeItemSku,
            as: 'skus',
            where: { status: 'active' },
            required: false,
            attributes: [
              'sku_id',
              'sku_code',
              'stock',
              'sold_count',
              'cost_price',
              'status',
              'image_id',
              'sort_order'
            ],
            include: [
              {
                model: this.ExchangeChannelPrice,
                as: 'channelPrices',
                where: { is_enabled: true },
                required: false,
                attributes: [
                  'id',
                  'cost_asset_code',
                  'cost_amount',
                  'original_amount',
                  'is_enabled',
                  'publish_at',
                  'unpublish_at'
                ]
              },
              ...(this.models.MediaFile
                ? [
                    {
                      model: this.models.MediaFile,
                      as: 'skuImage',
                      attributes: [
                        'media_id',
                        'object_key',
                        'mime_type',
                        'thumbnail_keys',
                        'width',
                        'height'
                      ],
                      required: false
                    }
                  ]
                : [])
            ]
          }
        ]
      })

      if (!product) {
        const err = new Error('商品不存在')
        err.statusCode = 404
        err.errorCode = 'PRODUCT_NOT_FOUND'
        throw err
      }

      const { images, detail_images, showcase_images } = await fetchProductMediaGallery(
        this.models,
        productId
      )

      const itemJSON = this._formatExchangeItemForDetail(product)
      itemJSON.images = images
      itemJSON.detail_images = detail_images
      itemJSON.showcase_images = showcase_images

      return { item: itemJSON }
    } catch (error) {
      logger.error(`[商品中心] 查询商品详情失败(exchange_item_id:${productId}):`, error.message)
      throw error
    }
  }

  /*
   * =====================================================================
   *  ExchangeItem 查询私有工具方法
   * =====================================================================
   */

  /**
   * 将 category_code 或 category_id 解析为该品类及其所有子品类 ID 列表
   *
   * @param {string|number} category - 品类代码或品类 ID
   * @returns {Promise<number[]|null>} 品类 ID 数组，无法解析时返回 null
   * @private
   */
  async _resolveCategoryIds(category) {
    if (category == null) return null
    const CategoryModel = this.Category
    if (!CategoryModel) return null

    const categoryId = await CategoryModel.resolveToId(category)
    if (!categoryId) return null

    return CategoryModel.getIdsWithChildren(categoryId)
  }

  /**
   * 将 ExchangeItem 实例格式化为列表视图 JSON
   *
   * 聚合 SKU 库存、销量和最低渠道定价
   *
   * @param {Model} product - ExchangeItem Sequelize 实例
   * @returns {Object} 格式化后的商品 JSON
   * @private
   */
  _formatExchangeItemForListing(product) {
    const json = product.toJSON()

    const totalStock = (json.skus || []).reduce((sum, sku) => sum + (sku.stock || 0), 0)
    const totalSoldCount = (json.skus || []).reduce((sum, sku) => sum + (sku.sold_count || 0), 0)

    let cheapestPrice = null
    for (const sku of json.skus || []) {
      for (const price of sku.channelPrices || []) {
        if (!cheapestPrice || price.cost_amount < cheapestPrice.cost_amount) {
          cheapestPrice = price
        }
      }
    }

    return {
      ...json,
      exchange_item_id: json.exchange_item_id,
      item_name: json.item_name,
      stock: totalStock,
      sold_count: totalSoldCount,
      cost_asset_code: cheapestPrice?.cost_asset_code || null,
      cost_amount: cheapestPrice?.cost_amount || null,
      original_price: cheapestPrice?.original_amount || null,
      category_id: json.category_id
    }
  }

  /**
   * 将 ExchangeItem 实例格式化为详情视图 JSON
   *
   * @param {Model} product - ExchangeItem Sequelize 实例（含 skus、channelPrices 等嵌套）
   * @returns {Object} 格式化后的商品详情 JSON
   * @private
   */
  _formatExchangeItemForDetail(product) {
    const json = product.toJSON()

    const totalStock = (json.skus || []).reduce((sum, sku) => sum + (sku.stock || 0), 0)
    const totalSoldCount = (json.skus || []).reduce((sum, sku) => sum + (sku.sold_count || 0), 0)

    let cheapestPrice = null
    for (const sku of json.skus || []) {
      for (const price of sku.channelPrices || []) {
        if (!cheapestPrice || price.cost_amount < cheapestPrice.cost_amount) {
          cheapestPrice = price
        }
      }
    }

    return {
      ...json,
      exchange_item_id: json.exchange_item_id,
      item_name: json.item_name,
      stock: totalStock,
      sold_count: totalSoldCount,
      cost_asset_code: cheapestPrice?.cost_asset_code || null,
      cost_amount: cheapestPrice?.cost_amount || null,
      original_price: cheapestPrice?.original_amount || null,
      category_id: json.category_id
    }
  }
}

module.exports = MallQueryService
