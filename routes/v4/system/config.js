/**
 * 系统公开配置路由
 *
 * 路由前缀：/api/v4/system/config
 *
 * 功能：
 * - 获取活动位置配置（公开接口，无需登录）
 * - 获取系统基础配置（公开接口，无需登录）
 *
 * 业务场景：
 * - 前端小程序每次打开页面直接调此API获取最新活动位置配置
 * - 后端/Web后台修改配置后，用户下次打开页面立即生效
 * - 前端调用成功后存一份到本地（断网兜底），失败时读上次存的数据
 * - 响应包含 version 字段（基于 updated_at 时间戳），供前端缓存模块对比版本
 *
 * system_settings 表 category（2026-06-14 真实数据库快照对齐）：
 * - ad_pricing / ad_system / backpack / basic / batch_operation / customer_service
 * - dispute / exchange / feature / general / notification / points / redemption / security
 * 注：marketplace / auction 已随 C2C 合规下线移除（库中 0 条），公开白名单不再包含。
 *
 * 安全说明：
 * - 位置配置不含敏感信息（仅包含 campaign_code、页面、位置、尺寸、优先级）
 * - 公开接口仅返回 PUBLIC_SETTING_KEYS 白名单内的配置项
 * - 敏感配置（security、batch_operation 等）不对外暴露
 * - 无需 authenticateToken 中间件
 *
 * @date 2026-04-23
 */

'use strict'

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../middleware/validation')
const { getRateLimiter } = require('../../../middleware/RateLimiterMiddleware')

// 公开只读接口宽松限流档（A1/A2：阈值读 .env RATE_LIMIT_PUBLIC_READ_MAX）；本路由全部为公开只读配置
router.use(getRateLimiter().createLimiter('public_read'))

/**
 * 小程序前端可访问的公开配置项白名单
 *
 * 按 category 分组，仅白名单内的 key 会通过公开 API 返回。
 * 敏感 category（security、batch_operation 等）不在此列。
 *
 * ⚠️ 白名单必须与真实库 system_settings 的 category/key 对齐：
 * - 只列「真实存在 + 适合公开下发给小程序」的 key（避免对已下线分类做无效校验 / 空拉）。
 * - 2026-06-14 校准：原残留的 marketplace（C2C 已下线、库中 0 条）已移除，
 *   原 feature/general/points/notification 下所列 key 在真实库均不存在，一并移除；
 *   维护模式相关 key 实际归属 basic 分类，纳入 basic 白名单。
 *
 * @type {Object<string, string[]>}
 */
const PUBLIC_SETTING_KEYS = {
  // basic：系统名称/版本、客服联系方式、维护模式（小程序联系客服页/维护提示用）
  basic: [
    'system_name',
    'system_version',
    'customer_email',
    'customer_phone',
    'customer_wechat',
    'maintenance_mode',
    'maintenance_message',
    'maintenance_end_time'
  ]
}

/**
 * @route GET /api/v4/system/config/placement
 * @desc 获取活动位置配置 - 公开接口（无需登录）
 * @access Public
 *
 * @returns {Object} 活动位置配置列表
 * @returns {Array} data.placements - 位置配置数组
 * @returns {string} data.placements[].campaign_code - 活动代码
 * @returns {Object} data.placements[].placement - 位置配置
 * @returns {string} data.placements[].placement.page - 展示页面（lottery/discover/user）
 * @returns {string} data.placements[].placement.position - 页面位置（main/secondary/floating/top/bottom）
 * @returns {string} data.placements[].placement.size - 组件尺寸（full/medium/small/mini）
 * @returns {number} data.placements[].placement.priority - 排列优先级（0-1000）
 * @returns {string} data.version - 配置版本标识（基于 updated_at 时间戳，前端缓存对比用）
 * @returns {string} data.updated_at - 配置最后更新时间（北京时间）
 *
 * @example
 * GET /api/v4/system/config/placement
 * → { success: true, data: { placements: [...], version: "1739600000000", updated_at: "2025-02-15T12:00:00.000Z" } }
 */
router.get(
  '/placement',
  asyncHandler(async (req, res) => {
    const AdminSystemService = req.app.locals.services.getService('admin_system')
    // 方案A：取配置值 + 行级 updated_at（version 只在运营改配置时变，杜绝 Date.now() 漂移）
    const { value: configData, updated_at } =
      await AdminSystemService.getConfigWithMeta('campaign_placement')

    if (!configData) {
      return res.apiError('配置不存在', 'CONFIG_NOT_FOUND', null, 404)
    }

    const versionTs = updated_at ? new Date(updated_at).getTime().toString() : '0'

    return res.apiSuccess(
      {
        placements: configData.placements || [],
        version: versionTs,
        updated_at: updated_at || null
      },
      '获取配置成功',
      'PLACEMENT_CONFIG_SUCCESS'
    )
  })
)

/**
 * @route GET /api/v4/system/config/product-filter
 * @desc 获取商品筛选配置 - 公开接口（无需登录）
 * @access Public
 *
 * 业务场景：
 * - 前端兑换商品列表页面使用筛选功能时，拉取筛选范围的配置值
 * - 配置内容由运营通过管理后台维护（system_settings 表 config_key = 'product_filter'）
 * - 前端启动时拉取，减少硬编码
 *
 * 数据结构设计依据：
 * - 基于后端已有的 cost_asset_code + cost_amount 字段体系
 * - 筛选区间可按资产类型分组设置
 *
 * @returns {Object} 商品筛选配置
 */
router.get(
  '/product-filter',
  asyncHandler(async (req, res) => {
    const AdminSystemService = req.app.locals.services.getService('admin_system')
    const configData = await AdminSystemService.getConfigValue('product_filter')

    if (!configData) {
      return res.apiSuccess(
        {
          filter_config: {
            cost_ranges: [
              { label: '全部', min: null, max: null },
              { label: '100以内', min: 0, max: 100 },
              { label: '100-500', min: 100, max: 500 },
              { label: '500-1000', min: 500, max: 1000 },
              { label: '1000以上', min: 1000, max: null }
            ],
            categories: [],
            sort_options: [
              { label: '默认排序', value: 'sort_order' },
              { label: '价格从低到高', value: 'cost_amount_asc' },
              { label: '价格从高到低', value: 'cost_amount_desc' },
              { label: '最新上架', value: 'created_at_desc' },
              { label: '销量最高', value: 'sold_count_desc' }
            ],
            stock_statuses: [
              { label: '全部', value: 'all' },
              { label: '有货', value: 'in_stock' },
              { label: '即将售罄', value: 'low_stock' }
            ]
          },
          is_default: true
        },
        '获取默认筛选配置'
      )
    }

    return res.apiSuccess(
      {
        filter_config: configData,
        version: Date.now().toString(),
        is_default: false
      },
      '获取筛选配置成功'
    )
  })
)

/**
 * @route GET /api/v4/system/config/feedback
 * @desc 获取反馈表单配置 - 公开接口（无需登录）
 * @access Public
 *
 * 业务场景：
 * - 前端反馈表单页面需要获取类别列表、字段限制等配置
 * - 配置内容优先从 system_settings 表获取（运营可维护）
 * - 如不存在则返回数据库 feedbacks 表 enum 定义导出的默认值
 *
 * @returns {Object} 反馈表单配置
 */
router.get(
  '/feedback',
  asyncHandler(async (req, res) => {
    const AdminSystemService = req.app.locals.services.getService('admin_system')
    const configData = await AdminSystemService.getConfigValue('feedback_config')

    if (configData) {
      return res.apiSuccess(
        {
          feedback_config: configData,
          version: Date.now().toString(),
          is_default: false
        },
        '获取反馈配置成功'
      )
    }

    const defaultConfig = {
      /** 反馈类别（对应 feedbacks.category enum） */
      categories: [
        { value: 'technical', label: '技术问题' },
        { value: 'feature', label: '功能建议' },
        { value: 'bug', label: 'Bug反馈' },
        { value: 'complaint', label: '投诉' },
        { value: 'suggestion', label: '建议' },
        { value: 'other', label: '其他' }
      ],
      /** 优先级选项（对应 feedbacks.priority enum） */
      priorities: [
        { value: 'low', label: '低' },
        { value: 'medium', label: '中' },
        { value: 'high', label: '高' }
      ],
      /** 内容长度限制（feedbacks.content TEXT类型） */
      content_rules: {
        min_length: 10,
        max_length: 500
      },
      /** 附件限制（feedbacks.attachments JSON字段的数组长度限制） */
      attachment_rules: {
        max_images: 5,
        max_file_size: 5 * 1024 * 1024, // 5MB
        allowed_types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      }
    }

    return res.apiSuccess(
      {
        feedback_config: defaultConfig,
        is_default: true
      },
      '获取默认反馈配置'
    )
  })
)

/**
 * @route GET /api/v4/system/config/exchange-page
 * @desc 获取兑换页面配置 - 公开接口（无需登录）
 * @access Public
 *
 * 业务场景：
 * - 小程序兑换页面启动时拉取 Tab/空间/筛选/卡片主题/运营参数配置
 * - 配置由运营通过管理后台维护（system_settings 表 config_key = 'exchange_page'）
 * - 替代前端硬编码，运营无需前端发版即可调整兑换页面呈现
 * - 前端使用 4 层降级缓存策略，本接口不可用时降级到本地缓存 → 默认值
 *
 * @returns {Object} 兑换页面配置
 * @returns {Array} data.tabs - Tab 配置
 * @returns {Object} data.detail_page - 详情页配置（attr_display_mode: grid/list, tag_style_type: game/plain）
 * @returns {Array} data.spaces - 空间配置
 * @returns {Object} data.shop_filters - 商品兑换筛选项
 * @returns {Object} data.market_filters - 交易市场筛选项
 * @returns {Object} data.card_display - 卡片主题配置
 * @returns {Object} data.ui - 运营参数
 * @returns {string} data.version - 配置版本标识（基于 updated_at 时间戳）
 * @returns {string} data.updated_at - 配置最后更新时间
 */
router.get(
  '/exchange-page',
  asyncHandler(async (req, res) => {
    const AdminSystemService = req.app.locals.services.getService('admin_system')
    const configData = await AdminSystemService.getConfigValue('exchange_page')

    if (!configData) {
      const defaultConfig = {
        tabs: [
          { key: 'exchange', label: '商品兑换', icon: 'download', enabled: true, sort_order: 1 },
          { key: 'prop', label: '道具商城', icon: 'gift', enabled: true, sort_order: 2 }
        ],
        spaces: [
          {
            id: 'lucky',
            name: '幸运空间',
            subtitle: '瀑布流卡片',
            description: '发现随机好物',
            layout: 'waterfall',
            color: '#52c41a',
            bgGradient: 'linear-gradient(135deg, #52c41a 0%, #95de64 100%)',
            locked: false,
            enabled: true,
            sort_order: 1
          },
          {
            id: 'premium',
            name: '臻选空间',
            subtitle: '混合精品展示',
            description: '解锁高级商品',
            layout: 'simple',
            color: '#667eea',
            bgGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            locked: true,
            enabled: true,
            sort_order: 2
          }
        ],
        shop_filters: {
          categories: [{ value: 'all', label: '全部' }],
          cost_ranges: [{ label: '全部', min: null, max: null }],
          basic_filters: [{ value: 'all', label: '全部', showCount: true }],
          stock_statuses: [{ value: 'all', label: '全部' }],
          sort_options: [{ value: 'sort_order', label: '默认排序' }]
        },
        market_filters: {
          type_filters: [{ value: 'all', label: '全部', showCount: true }],
          category_filters: [{ value: 'all', label: '全部' }],
          sort_options: [{ value: 'default', label: '默认' }]
        },
        card_display: {
          effects: {
            grain: true,
            holo: true,
            rotatingBorder: true,
            breathingGlow: true,
            ripple: true,
            fullbleed: true,
            listView: false
          },
          shop_cta_text: '立即兑换',
          market_cta_text: '立即购买',
          show_stock_bar: true,
          stock_display_mode: 'bar',
          show_sold_count: true,
          show_tags: true,
          price_display_mode: 'highlight',
          image_placeholder_style: 'gradient',
          press_effect: 'ripple',
          show_type_badge: true,
          price_color_mode: 'type_based',
          default_view_mode: 'grid'
        },
        detail_page: {
          attr_display_mode: 'grid',
          tag_style_type: 'game'
        },
        ui: {
          low_stock_threshold: 10,
          grid_page_size: 4,
          waterfall_page_size: 20,
          default_api_page_size: 20,
          search_debounce_ms: 500
        }
      }

      return res.apiSuccess(
        { ...defaultConfig, version: Date.now().toString(), is_default: true },
        '获取默认兑换页面配置',
        'EXCHANGE_PAGE_CONFIG_DEFAULT'
      )
    }

    if (!configData.detail_page) {
      configData.detail_page = {
        attr_display_mode: 'grid',
        tag_style_type: 'game'
      }
    }

    const updatedAtExchange = configData.updated_at || new Date().toISOString()
    const versionTsExchange = new Date(updatedAtExchange).getTime().toString()

    return res.apiSuccess(
      {
        ...configData,
        version: versionTsExchange,
        updated_at: updatedAtExchange,
        is_default: false
      },
      '获取兑换页面配置成功',
      'EXCHANGE_PAGE_CONFIG_SUCCESS'
    )
  })
)

/**
 * @route GET /api/v4/system/config
 * @desc 获取系统基础公开配置（含客服联系方式）
 * @access Public（无需登录）
 *
 * @returns {Object} 基础配置
 * @returns {string} data.system_name - 系统名称
 * @returns {string} data.customer_phone - 客服电话
 * @returns {string} data.customer_email - 客服邮箱
 * @returns {string} data.customer_wechat - 客服微信号
 *
 * 业务场景：微信小程序联系客服页面、关于页面等需要读取运营配置的公开信息
 * 数据来源：system_settings 表中 category='basic' 且 is_visible=1 的配置项
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const AdminSystemService = req.app.locals.services.getService('admin_system')

    /* 只返回白名单内的公开配置项（各 category 互相独立，并行读取） */
    const configMap = {}
    const categoryEntries = Object.entries(PUBLIC_SETTING_KEYS)
    const settingsList = await Promise.all(
      categoryEntries.map(([category]) => AdminSystemService.getSettingsByCategory(category))
    )
    categoryEntries.forEach(([, keys], idx) => {
      for (const s of settingsList[idx].settings) {
        if (keys.includes(s.setting_key)) {
          configMap[s.setting_key] = s.setting_value
        }
      }
    })

    return res.apiSuccess(configMap, '获取系统配置成功')
  })
)

/**
 * @route GET /api/v4/system/config/category-tree
 * @desc 获取商品品类树形结构（公开接口，无需登录）
 * @access Public
 *
 * @returns {Array} data - 顶级品类数组，每项含 children 子品类
 * @returns {number} data[].category_id - 品类ID
 * @returns {string} data[].category_name - 品类名称
 * @returns {number|null} data[].parent_category_id - 父品类ID（顶级为 null）
 * @returns {number} data[].sort_order - 排序权重
 * @returns {Array} data[].children - 子品类数组
 *
 * 业务场景：微信小程序商品分类导航、筛选器、DIY 材料分类等
 * 数据来源：categories 表，按 sort_order 排序，构建两级树
 */
router.get(
  '/category-tree',
  asyncHandler(async (req, res) => {
    const DictionaryService = req.app.locals.services.getService('dictionary')
    const tree = await DictionaryService.getCategoryTree()
    return res.apiSuccess(tree, '获取品类树成功')
  })
)

module.exports = router
