/**
 * 市场挂牌查询服务（QueryService）
 *
 * V4.7.0 大文件拆分方案 Phase 2（2026-01-31）
 * 从 MarketListingService.js (2295行) 拆分
 *
 * 职责：
 * - 挂牌查询/搜索/筛选
 * - 市场列表展示
 * - 筛选维度配置
 *
 * @module services/market-listing/QueryService
 */

const {
  MarketListing,
  ItemInstance,
  ItemTemplate,
  MaterialAssetType,
  User,
  sequelize
} = require('../../models')
const { Op } = sequelize.Sequelize
const { BusinessCacheHelper } = require('../../utils/BusinessCacheHelper')
const logger = require('../../utils/logger').logger
const { attachDisplayNames, DICT_TYPES } = require('../../utils/displayNameHelper')
const { getImageUrl } = require('../../utils/ImageUrlHelper')

/**
 * 市场挂牌查询服务类
 *
 * @class MarketListingQueryService
 * @description 挂牌域查询服务
 */
class MarketListingQueryService {
  /**
   * 查询挂牌详情
   *
   * @param {number} market_listing_id - 挂牌ID（数据库主键）
   * @param {Object} [options] - 查询选项
   * @param {Object} [options.transaction] - Sequelize事务对象
   * @returns {Promise<Object|null>} 挂牌详情或 null
   */
  static async getListingById(market_listing_id, options = {}) {
    const listing = await MarketListing.findOne({
      where: { market_listing_id },
      include: [
        {
          model: ItemInstance,
          as: 'offerItem',
          required: false,
          include: [
            {
              model: ItemTemplate,
              as: 'itemTemplate',
              attributes: ['item_template_id', 'display_name', 'image_url', 'thumbnail_url'],
              required: false
            }
          ]
        },
        {
          model: ItemTemplate,
          as: 'offerItemTemplate',
          attributes: ['item_template_id', 'display_name', 'image_url', 'thumbnail_url'],
          required: false
        }
      ],
      transaction: options.transaction
    })

    return listing
  }

  /**
   * 查询用户的挂牌列表
   *
   * @param {Object} params - 查询参数
   * @param {number} params.seller_user_id - 卖家用户ID
   * @param {string} [params.status] - 挂牌状态筛选
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @returns {Promise<Object>} 挂牌列表 {listings, total, page, page_size}
   */
  static async getUserListings(params) {
    const { seller_user_id, status, page = 1, page_size = 20 } = params

    const where = { seller_user_id }
    if (status) {
      where.status = status
    }

    const { count, rows } = await MarketListing.findAndCountAll({
      where,
      include: [
        {
          model: ItemInstance,
          as: 'offerItem',
          required: false
        }
      ],
      order: [['created_at', 'DESC']],
      limit: page_size,
      offset: (page - 1) * page_size
    })

    // 添加中文显示名称
    const listingsData = rows.map(row => (row.get ? row.get({ plain: true }) : row))
    await attachDisplayNames(listingsData, [
      { field: 'status', dictType: DICT_TYPES.LISTING_STATUS }
    ])

    return {
      listings: listingsData,
      total: count,
      page,
      page_size
    }
  }

  /**
   * 获取公开市场挂牌列表（带缓存）
   *
   * @param {Object} params - 查询参数
   * @param {number} [params.page=1] - 页码
   * @param {number} [params.page_size=20] - 每页数量
   * @param {string} [params.listing_kind] - 挂牌类型筛选
   * @param {string} [params.asset_code] - 资产代码筛选
   * @param {string} [params.item_category_code] - 物品类目代码筛选
   * @param {string} [params.asset_group_code] - 资产分组代码筛选
   * @param {string} [params.rarity_code] - 稀有度代码筛选
   * @param {number} [params.min_price] - 最低价格筛选
   * @param {number} [params.max_price] - 最高价格筛选
   * @param {string} [params.sort='newest'] - 排序方式
   * @returns {Promise<Object>} 市场列表 {products, pagination}
   */
  static async getMarketListings(params = {}) {
    const {
      page = 1,
      page_size = 20,
      listing_kind,
      asset_code,
      item_category_code,
      asset_group_code,
      rarity_code,
      min_price,
      max_price,
      sort = 'newest'
    } = params

    // 构建缓存参数对象（BusinessCacheHelper 使用对象来构建缓存键）
    const cacheParams = {
      page,
      page_size,
      listing_kind: listing_kind || 'all',
      asset_code: asset_code || 'all',
      item_category_code: item_category_code || 'all',
      asset_group_code: asset_group_code || 'all',
      rarity_code: rarity_code || 'all',
      min_price: min_price || 0,
      max_price: max_price || 0,
      sort
    }

    // 尝试从缓存读取
    try {
      const cached = await BusinessCacheHelper.getMarketListings(cacheParams)
      if (cached) {
        logger.debug('[MarketListingQueryService] 缓存命中', { cacheParams })
        return cached
      }
    } catch (cacheError) {
      logger.warn('[MarketListingQueryService] 缓存读取失败', { error: cacheError.message })
    }

    // 构建查询条件
    const where = { status: 'on_sale' }

    if (listing_kind) {
      where.listing_kind = listing_kind
    }

    // 物品实例类型筛选
    if (item_category_code) {
      where.offer_item_category_code = item_category_code
    }

    if (rarity_code) {
      where.offer_item_rarity = rarity_code
    }

    // 可叠加资产类型筛选
    if (asset_code) {
      where.offer_asset_code = asset_code
    }

    // 价格筛选
    if (min_price || max_price) {
      where.price_amount = {}
      if (min_price) where.price_amount[Op.gte] = min_price
      if (max_price) where.price_amount[Op.lte] = max_price
    }

    // 资产分组筛选（需要关联查询）
    let includeAssetGroup = false
    if (asset_group_code && listing_kind === 'fungible_asset') {
      includeAssetGroup = true
    }

    // 排序
    let order
    switch (sort) {
      case 'price_asc':
        order = [['price_amount', 'ASC']]
        break
      case 'price_desc':
        order = [['price_amount', 'DESC']]
        break
      case 'newest':
      default:
        order = [['created_at', 'DESC']]
    }

    // 构建关联查询
    const include = [
      {
        model: User,
        as: 'seller',
        attributes: ['user_id', 'nickname', 'avatar_url'],
        required: false
      },
      {
        model: ItemInstance,
        as: 'offerItem',
        required: false,
        include: [
          {
            model: ItemTemplate,
            as: 'itemTemplate',
            attributes: ['item_template_id', 'display_name', 'image_url', 'thumbnail_url'],
            required: false
          }
        ]
      },
      {
        /** 直接关联物品模板（通过 offer_item_template_id 快照字段） */
        model: ItemTemplate,
        as: 'offerItemTemplate',
        attributes: ['item_template_id', 'display_name', 'image_url', 'thumbnail_url'],
        required: false
      }
    ]

    // 可叠加资产类型关联
    if (listing_kind === 'fungible_asset' || !listing_kind) {
      include.push({
        model: MaterialAssetType,
        as: 'offerMaterialAsset',
        // V4.7.0: 恢复 icon_url 字段（已通过迁移添加到数据库）
        attributes: ['asset_code', 'display_name', 'group_code', 'icon_url'],
        required: false,
        where: includeAssetGroup ? { group_code: asset_group_code } : undefined
      })
    }

    // 执行查询
    const { count, rows } = await MarketListing.findAndCountAll({
      where,
      include,
      order,
      limit: page_size,
      offset: (page - 1) * page_size,
      distinct: true
    })

    // 转换数据格式
    const products = rows.map(listing => {
      const plain = listing.get ? listing.get({ plain: true }) : listing

      // 基础信息
      const product = {
        market_listing_id: plain.market_listing_id,
        listing_kind: plain.listing_kind,
        seller_user_id: plain.seller_user_id,
        seller_nickname: plain.seller?.nickname || `用户${plain.seller_user_id}`,
        seller_avatar_url: plain.seller?.avatar_url || null, // V4.7.0: 恢复头像字段
        price_amount: plain.price_amount,
        price_asset_code: plain.price_asset_code,
        status: plain.status,
        created_at: plain.created_at
      }

      // 物品实例类型
      if (plain.listing_kind === 'item_instance') {
        /**
         * 图片 object key 优先级：
         * 1. 直接关联的 offerItemTemplate（通过快照字段 offer_item_template_id）
         * 2. 通过 offerItem.itemTemplate 间接获取
         * 数据库存 object key，通过 ImageUrlHelper 拼接完整公网 URL
         */
        const templateImageKey =
          plain.offerItemTemplate?.image_url ||
          plain.offerItem?.itemTemplate?.image_url ||
          null

        product.item_info = {
          item_instance_id: plain.offer_item_instance_id,
          display_name: plain.offer_item_display_name || plain.offerItem?.meta?.name,
          image_url: templateImageKey ? getImageUrl(templateImageKey) : null,
          category_code: plain.offer_item_category_code,
          rarity_code: plain.offer_item_rarity,
          template_id: plain.offer_item_template_id
        }
      }

      // 可叠加资产类型
      if (plain.listing_kind === 'fungible_asset') {
        /** icon_url 存储 object key，通过 ImageUrlHelper 拼接完整公网 URL */
        const iconKey = plain.offerMaterialAsset?.icon_url || null

        product.asset_info = {
          asset_code: plain.offer_asset_code,
          amount: plain.offer_amount,
          display_name: plain.offerMaterialAsset?.display_name || plain.offer_asset_code,
          icon_url: iconKey ? getImageUrl(iconKey) : null,
          group_code: plain.offerMaterialAsset?.group_code
        }
      }

      return product
    })

    const result = {
      products,
      pagination: {
        total: count,
        page,
        page_size,
        total_pages: Math.ceil(count / page_size)
      }
    }

    // 写入缓存
    try {
      await BusinessCacheHelper.setMarketListings(cacheParams, result)
    } catch (cacheError) {
      logger.warn('[MarketListingQueryService] 缓存写入失败', { error: cacheError.message })
    }

    return result
  }

  /**
   * 获取市场筛选维度配置（facets）
   *
   * @param {Object} options - 配置选项
   * @param {boolean} options.include_disabled - 是否包含已禁用项
   * @returns {Promise<Object>} 筛选维度配置
   */
  static async getFilterFacets(options = {}) {
    const { include_disabled = false } = options

    // 延迟加载字典模型
    const { CategoryDef, RarityDef, AssetGroupDef } = require('../../models')

    // 1. 查询物品类目列表
    const categoryWhere = include_disabled ? {} : { is_enabled: true }
    const categories = await CategoryDef.findAll({
      where: categoryWhere,
      attributes: ['category_code', 'display_name', 'description', 'icon_url', 'sort_order'],
      order: [
        ['sort_order', 'ASC'],
        ['category_code', 'ASC']
      ],
      raw: true
    })

    // 2. 查询稀有度列表
    const rarityWhere = include_disabled ? {} : { is_enabled: true }
    const rarities = await RarityDef.findAll({
      where: rarityWhere,
      attributes: ['rarity_code', 'display_name', 'description', 'color_hex', 'tier', 'sort_order'],
      order: [
        ['tier', 'ASC'],
        ['sort_order', 'ASC']
      ],
      raw: true
    })

    // 3. 查询资产分组列表
    const assetGroupWhere = include_disabled ? {} : { is_enabled: true, is_tradable: true }
    const assetGroups = await AssetGroupDef.findAll({
      where: assetGroupWhere,
      attributes: [
        'group_code',
        'display_name',
        'description',
        'group_type',
        'color_hex',
        'sort_order'
      ],
      order: [
        ['sort_order', 'ASC'],
        ['group_code', 'ASC']
      ],
      raw: true
    })

    // 4. 挂牌类型列表（静态定义）
    const listingKinds = [
      {
        listing_kind: 'item_instance',
        display_name: '物品',
        description: '不可叠加物品（NFT类），如奖品实例'
      },
      {
        listing_kind: 'fungible_asset',
        display_name: '材料',
        description: '可叠加资产，如材料碎片'
      }
    ]

    logger.debug('[MarketListingQueryService] 获取筛选维度配置成功', {
      categories_count: categories.length,
      rarities_count: rarities.length,
      asset_groups_count: assetGroups.length
    })

    return {
      categories,
      rarities,
      asset_groups: assetGroups,
      listing_kinds: listingKinds
    }
  }

  /**
   * 获取用户活跃挂牌数
   *
   * @param {number} seller_user_id - 卖家用户ID
   * @param {Object} [options] - 查询选项
   * @returns {Promise<number>} 活跃挂牌数
   */
  static async getUserActiveListingCount(seller_user_id, options = {}) {
    const count = await MarketListing.count({
      where: {
        seller_user_id,
        status: 'on_sale'
      },
      transaction: options.transaction
    })

    return count
  }

  /**
   * 获取用户端结算币种列表
   *
   * 从 system_settings.allowed_settlement_assets 读取白名单，
   * 再关联 material_asset_types 表获取 display_name。
   *
   * @returns {Promise<Object[]>} 结算币种列表 [{asset_code, display_name}]
   */
  static async getSettlementCurrencies() {
    const AdminSystemService = require('../AdminSystemService')

    const whitelist = await AdminSystemService.getSettingValue(
      'marketplace',
      'allowed_settlement_assets',
      ['DIAMOND', 'red_shard']
    )

    let assetCodes = whitelist
    if (typeof whitelist === 'string') {
      try {
        assetCodes = JSON.parse(whitelist)
      } catch {
        assetCodes = ['DIAMOND', 'red_shard']
      }
    }

    const assetTypes = await MaterialAssetType.findAll({
      where: { asset_code: { [Op.in]: assetCodes } },
      attributes: ['asset_code', 'display_name'],
      raw: true
    })

    const typeMap = new Map(assetTypes.map(t => [t.asset_code, t.display_name]))

    return assetCodes.map(code => ({
      asset_code: code,
      display_name: typeMap.get(code) || code
    }))
  }
}

module.exports = MarketListingQueryService
