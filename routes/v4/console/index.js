/**
 * Console 控制台模块主入口
 *
 * @description 按业务域聚合所有 console 子模块，提供统一路由入口
 * @version 5.0.0（路由目录化重构 - 80 个根文件 → 13 个域目录）
 * @date 2026-03-22
 *
 * 域目录结构：
 *   lottery/      21 文件  抽奖核心 + 监控 + 强控
 *   ad/            5 文件  广告活动/广告位/定价/报表/地域
 *   user/          8 文件  用户管理/分层/行为/高级空间/分群
 *   market/        5 文件  市场统计/竞价/兑换商品/汇率/订单
 *   merchant/      7 文件  商家/门店/员工/区划/积分/欠账/消费
 *   risk/          6 文件  风控告警/配置/静默/孤儿冻结/异常/对账
 *   analytics/     8 文件  分析/看板/统计/报表/记录/数据/预算/待处理
 *   operations/   15 文件  数据管理/字典/品类/物品/属性/开关/批量/媒体/存储/材料/导航/提醒
 *   config/       10 文件  认证/配置/设置/会话/审批/审计/调整/钻石
 *   system/        6 文件  (保留) 系统监控
 *   customer-service/ 10 文件  (保留) 客服管理
 *   assets/        3 文件  (保留) 资产中心
 *   shared/        1 文件  (保留) 公共中间件
 */

const BeijingTimeHelper = require('../../../utils/timeHelper')
const express = require('express')
const router = express.Router()

// ── 域级路由挂载（16 个域）──
router.use('/', require('./lottery'))
router.use('/', require('./ad'))
router.use('/', require('./user'))
router.use('/', require('./market'))
router.use('/', require('./merchant'))
router.use('/', require('./risk'))
router.use('/', require('./analytics'))
router.use('/', require('./operations'))
router.use('/', require('./config'))
router.use('/system', require('./system'))
router.use('/customer-service', require('./customer-service'))
router.use('/assets', require('./assets'))
router.use('/exchange', require('./exchange'))
router.use('/bids', require('./bids'))
router.use('/dashboard', require('./dashboard'))

/**
 * GET / - Console API 根路径信息
 *
 * @description 返回 Console API 的基本信息和可用模块清单
 * @route GET /api/v4/console/
 * @access Public
 */
/**
 * ⚠️ 重要提醒：添加新路由时的步骤
 *
 * 1. 在对应域目录下创建路由文件（如 lottery/new-feature.js）
 * 2. 在域 index.js 中 require 并 router.use 挂载
 * 3. 在下方 modules 对象中添加模块信息
 * 4. 运行测试验证: npm test
 */
router.get('/', (req, res) => {
  const adminInfo = {
    name: 'Admin API v4.0',
    description: '统一决策引擎管理员API',
    version: '4.0.0',
    modules: {
      auth: {
        description: '管理员认证',
        endpoints: ['/auth']
      },
      system: {
        description: '系统监控',
        endpoints: ['/status', '/dashboard', '/management-status']
      },
      config: {
        description: '配置管理',
        endpoints: ['/config', '/test/simulate']
      },
      settings: {
        description: '系统设置管理（运营配置）',
        endpoints: [
          '/settings',
          '/settings/basic',
          '/settings/points',
          '/settings/notification',
          '/settings/security',
          '/cache/clear'
        ],
        note: '抽奖算法配置在 /config/business.config.js 中管理'
      },
      prize_pool: {
        description: '奖品池管理',
        endpoints: ['/prize-pool/batch-add', '/prize-pool/:code', '/prize-pool/prize/:id']
      },
      user_management: {
        description: '用户管理',
        endpoints: [
          '/users/resolve',
          '/users',
          '/users/:user_id',
          '/users/:user_id/role',
          '/users/:user_id/status',
          '/roles',
          '/roles/:role_id',
          '/permission-resources',
          '/stats'
        ],
        note: '用户CRUD管理、角色权限管理、手机号解析（2026-02-06 手机号主导搜索改造）'
      },
      lottery_management: {
        description: '抽奖管理',
        endpoints: [
          '/force-win',
          '/force-lose',
          '/probability-adjust',
          '/user-specific-queue',
          '/user-status/:user_id',
          '/clear-user-settings/:user_id'
        ]
      },
      analytics: {
        description: '数据分析',
        endpoints: ['/decisions/analytics', '/lottery/trends', '/performance/report']
      },
      customer_service: {
        description: '客服管理',
        endpoints: [
          '/sessions',
          '/sessions/stats',
          '/sessions/:id/messages',
          '/sessions/:id/send',
          '/sessions/:id/mark-read',
          '/sessions/:id/transfer',
          '/sessions/:id/close'
        ]
      },
      marketplace: {
        description: '市场统计管理',
        endpoints: ['/marketplace/listing-stats']
      },
      material: {
        description: '材料系统管理（V4.5.0）',
        endpoints: ['/material/asset-types', '/material/conversion-rules'],
        note: '材料资产类型管理、转换规则管理（用户余额管理已迁移至 asset-adjustment 模块）'
      },
      lottery_quota: {
        description: '抽奖配额管理（2025-12-23）',
        endpoints: [
          '/lottery-quota/rules',
          '/lottery-quota/rules/:id/disable',
          '/lottery-quota/users/:user_id/status',
          '/lottery-quota/users/:user_id/bonus',
          '/lottery-quota/users/:user_id/check'
        ],
        note: '四维度配额规则（全局/活动/角色/用户）、客服临时加次数、原子扣减'
      },
      asset_adjustment: {
        description: '资产调整管理（2025-12-30）',
        endpoints: [
          '/asset-adjustment/adjust',
          '/asset-adjustment/batch-adjust',
          '/asset-adjustment/user/:user_id/balances'
        ],
        note: '管理员调整用户积分、预算积分、钻石等资产，支持批量操作和幂等控制'
      },
      campaign_budget: {
        description: '活动预算管理（2026-01-03 BUDGET_POINTS架构）',
        endpoints: [
          '/campaign-budget/campaigns/:lottery_campaign_id',
          '/campaign-budget/campaigns/:lottery_campaign_id/validate',
          '/campaign-budget/campaigns/:lottery_campaign_id/pool/add',
          '/campaign-budget/campaigns/:lottery_campaign_id/budget-status',
          '/campaign-budget/users/:user_id'
        ],
        note: '活动预算配置（budget_mode）、空奖约束验证、活动池预算补充、用户BUDGET_POINTS查询'
      },
      assets: {
        description: '后台运营资产中心（2026-01-07 架构重构）',
        endpoints: [
          '/assets/portfolio',
          '/assets/portfolio/items',
          '/assets/portfolio/items/:id',
          '/assets/item-events'
        ],
        note: '资产总览、物品列表、物品详情、物品事件历史；权限要求：admin（可写）或 ops（只读）'
      },
      orphan_frozen: {
        description: '孤儿冻结清理（P0-2 2026-01-09）',
        endpoints: ['/orphan-frozen/detect', '/orphan-frozen/stats', '/orphan-frozen/cleanup'],
        note: '检测和清理孤儿冻结（frozen_amount > 活跃挂牌冻结），唯一入口设计，支持干跑模式'
      },
      merchant_points: {
        description: '商家积分审核管理（P1 2026-01-09）',
        endpoints: [
          '/merchant-points',
          '/merchant-points/:audit_id',
          '/merchant-points/:audit_id/approve',
          '/merchant-points/:audit_id/reject',
          '/merchant-points/stats/pending'
        ],
        note: '商家积分申请审核管理，基于统一审核引擎（ContentAuditEngine），审核通过后自动发放积分'
      },
      user_hierarchy: {
        description: '用户层级管理（业务员/门店管理 2026-01-09）',
        endpoints: [
          '/user-hierarchy',
          '/user-hierarchy/roles',
          '/user-hierarchy/:user_id/subordinates',
          '/user-hierarchy/:user_id/stats',
          '/user-hierarchy/:user_id/deactivate',
          '/user-hierarchy/:user_id/activate'
        ],
        note: '区域负责人→业务经理→业务员三级层级管理，门店分配，权限激活/停用'
      },
      consumption: {
        description: '消费记录审核管理（2026-01-12）',
        endpoints: [
          '/consumption/pending',
          '/consumption/records',
          '/consumption/approve/:id',
          '/consumption/reject/:id',
          '/consumption/batch-review',
          '/consumption/qrcode/:user_id'
        ],
        note: '仅限 admin（role_level >= 100）访问'
      },
      dashboard: {
        description: '运营看板（2026-01-31 P0 待处理聚合）',
        endpoints: ['/dashboard/pending-summary'],
        note: '运营首页看板待处理事项聚合统计；仅限 admin 访问'
      },
      pending: {
        description: '待处理中心（2026-01-31 P0）',
        endpoints: ['/pending/summary', '/pending/list'],
        note: '统一待处理事项管理：分类汇总、列表筛选、紧急优先；仅限 admin 访问'
      },
      nav: {
        description: '导航徽标（2026-01-31 P0）',
        endpoints: ['/nav/badges'],
        note: '侧边栏待处理徽标计数，轻量级接口适合轮询（建议30-60秒）；仅限 admin 访问'
      },
      consumption_anomaly: {
        description: '消费异常检测（2026-01-31 P1）',
        endpoints: [
          '/consumption-anomaly/summary',
          '/consumption-anomaly/high-risk',
          '/consumption-anomaly/detect/:id',
          '/consumption-anomaly/batch-detect',
          '/consumption-anomaly/:id/mark',
          '/consumption-anomaly/rules'
        ],
        note: '消费记录异常检测：汇总统计、高风险列表、单条/批量检测、手动标记、规则配置'
      },
      lottery_health: {
        description: '抽奖健康度评估（2026-01-31 P1）',
        endpoints: ['/lottery-health/:lottery_campaign_id'],
        note: '活动健康度评估：健康分数、问题诊断、优化建议'
      },
      user_segments: {
        description: '用户分层分析（2026-01-31 P1）',
        endpoints: [
          '/users/segments',
          '/users/segments/:type',
          '/users/activity-heatmap',
          '/users/exchange-preferences',
          '/users/funnel',
          '/users/segment-rules'
        ],
        note: '用户分层统计：高价值/活跃/沉默/流失分布、活跃热力图、兑换偏好、行为漏斗'
      },
      stores: {
        description: '门店管理（2026-01-12 P1）',
        endpoints: [
          '/stores',
          '/stores/stats',
          '/stores/:store_id',
          '/stores/:store_id/activate',
          '/stores/:store_id/deactivate'
        ],
        note: '平台管理员门店 CRUD 操作；仅限 admin（role_level >= 100）访问'
      },
      regions: {
        description: '行政区划管理（2026-01-12）',
        endpoints: [
          '/regions/provinces',
          '/regions/children/:parent_code',
          '/regions/search',
          '/regions/path/:region_code',
          '/regions/stats',
          '/regions/validate'
        ],
        note: '省市区街道四级行政区划查询，用于门店管理时的级联选择器'
      },
      staff: {
        description: '员工管理（2026-01-12）',
        endpoints: [
          '/staff',
          '/staff/stats',
          '/staff/:store_staff_id',
          '/staff/by-user/:user_id',
          '/staff/transfer',
          '/staff/:store_staff_id/role',
          '/staff/disable/:user_id',
          '/staff/enable'
        ],
        note: '商家员工管理：入职/调店/离职/禁用/角色变更'
      },
      audit_logs: {
        description: '商家操作审计日志（2026-01-12）',
        endpoints: [
          '/audit-logs',
          '/audit-logs/:merchant_log_id',
          '/audit-logs/stats/store/:store_id',
          '/audit-logs/stats/operator/:operator_id',
          '/audit-logs/cleanup',
          '/audit-logs/operation-types'
        ],
        note: '商家域审计日志查询、统计、清理（保留180天）'
      },
      risk_alerts: {
        description: '风控告警管理（2026-01-12）',
        endpoints: [
          '/risk-alerts',
          '/risk-alerts/pending',
          '/risk-alerts/:alert_id',
          '/risk-alerts/:alert_id/review',
          '/risk-alerts/stats/summary',
          '/risk-alerts/stats/store/:store_id',
          '/risk-alerts/types'
        ],
        note: '风控告警查询、复核、统计；支持频次阻断、金额告警、关联告警'
      },
      alert_silence_rules: {
        description: '告警静默规则管理（2026-03-20）',
        endpoints: ['/alert-silence-rules', '/alert-silence-rules/:id'],
        note: '告警静默规则的增删改查，用于抑制特定条件下的重复告警'
      },
      debt_management: {
        description: '欠账管理（2026-01-18）',
        endpoints: [
          '/debt-management/dashboard',
          '/debt-management/by-campaign',
          '/debt-management/by-prize',
          '/debt-management/by-creator',
          '/debt-management/trend',
          '/debt-management/pending',
          '/debt-management/clear',
          '/debt-management/limits',
          '/debt-management/limits/:lottery_campaign_id',
          '/debt-management/limits/:lottery_campaign_id/alert-check'
        ],
        note: '预设欠账看板、清偿管理、上限配置'
      },
      dictionaries: {
        description: '字典表管理（2026-01-21）',
        endpoints: [
          '/dictionaries/categories',
          '/dictionaries/categories/:code',
          '/dictionaries/rarities',
          '/dictionaries/rarities/:code',
          '/dictionaries/asset-groups',
          '/dictionaries/asset-groups/:code'
        ],
        note: '配置/字典表 CRUD 管理'
      },
      lottery_configs: {
        description: '抽奖配置管理（2026-01-21）',
        endpoints: [
          '/lottery-configs/strategy',
          '/lottery-configs/strategy/:id',
          '/lottery-configs/matrix',
          '/lottery-configs/matrix/:id',
          '/lottery-configs/matrix/full'
        ],
        note: '抽奖策略配置和 BxPx 矩阵配置 CRUD 管理'
      },
      item_templates: {
        description: '物品模板管理（2026-01-21）',
        endpoints: [
          '/item-templates',
          '/item-templates/types',
          '/item-templates/:id',
          '/item-templates/batch/status'
        ],
        note: '物品模板 CRUD 管理，包括类型查询和批量状态更新'
      },
      unified_product_center: {
        description: '统一商品中心（品类 / EAV 属性 / SPU·SKU / 渠道定价）',
        endpoints: ['/categories', '/attributes', '/exchange-items'],
        note: '管理后台商品主数据：categories 树、attributes 与选项、exchange_items 与 skus'
      },
      risk_profiles: {
        description: '用户风控配置管理（2026-01-21）',
        endpoints: [
          '/risk-profiles',
          '/risk-profiles/level/:risk_level',
          '/risk-profiles/:id',
          '/risk-profiles/user/:user_id',
          '/risk-profiles/user/:user_id/freeze',
          '/risk-profiles/user/:user_id/unfreeze'
        ],
        note: '用户风控配置 CRUD 管理，包括冻结/解冻用户'
      },
      lottery_tier_rules: {
        description: '抽奖档位规则管理（2026-01-21）',
        endpoints: [
          '/lottery-tier-rules',
          '/lottery-tier-rules/:id',
          '/lottery-tier-rules/validate-weights'
        ],
        note: '抽奖档位规则 CRUD 管理，包括权重验证'
      },
      lottery_presets: {
        description: '抽奖预设管理（2026-01-21）',
        endpoints: [
          '/lottery-presets',
          '/lottery-presets/stats',
          '/lottery-presets/user/:user_id',
          '/lottery-presets/:id'
        ],
        note: '抽奖预设 CRUD 管理，为用户创建预设队列和统计'
      },
      items: {
        description: '物品管理（三表模型 CRUD + 锁定率监控）',
        endpoints: [
          '/items',
          '/items/lock-rate',
          '/items/user/:user_id',
          '/items/:id',
          '/items/:id/freeze',
          '/items/:id/unfreeze',
          '/items/:id/transfer'
        ],
        note: '管理员查看全平台物品列表/详情/冻结/解冻/转移 + 锁定率监控'
      },
      lottery_monitoring: {
        description: '抽奖监控数据查询（2026-01-21 P2）',
        endpoints: [
          '/lottery-monitoring/hourly-metrics',
          '/lottery-monitoring/hourly-metrics/:id',
          '/lottery-monitoring/hourly-metrics/summary/:lottery_campaign_id',
          '/lottery-monitoring/user-experience-states',
          '/lottery-monitoring/user-experience-states/:user_id/:lottery_campaign_id',
          '/lottery-monitoring/user-global-states',
          '/lottery-monitoring/user-global-states/:user_id',
          '/lottery-monitoring/quota-grants',
          '/lottery-monitoring/quota-grants/:id',
          '/lottery-monitoring/user-quotas',
          '/lottery-monitoring/user-quotas/:user_id/:lottery_campaign_id',
          '/lottery-monitoring/user-quotas/stats/:lottery_campaign_id'
        ],
        note: '抽奖监控数据只读查询'
      },
      trade_orders: {
        description: '交易订单查询（2026-01-21 P2）',
        endpoints: [
          '/trade-orders',
          '/trade-orders/stats',
          '/trade-orders/user/:user_id/stats',
          '/trade-orders/by-business-id/:business_id',
          '/trade-orders/:id'
        ],
        note: '交易订单只读查询，支持买家/卖家/状态筛选和统计汇总'
      },
      user_premium: {
        description: '用户高级空间状态查询（2026-01-21 P2）',
        endpoints: [
          '/user-premium',
          '/user-premium/stats',
          '/user-premium/expiring',
          '/user-premium/:user_id'
        ],
        note: '用户高级空间状态只读查询，支持有效期筛选和即将过期提醒'
      },
      admin_audit_logs: {
        description: '管理员操作审计日志（2026-01-22 P1）',
        endpoints: ['/admin-audit-logs'],
        note: '管理员域审计日志只读查询'
      },
      business_records: {
        description: '业务记录查询（2026-01-22 P1）',
        endpoints: [
          '/business-records/lottery-clear-settings',
          '/business-records/redemption-orders',
          '/business-records/content-reviews',
          '/business-records/user-role-changes',
          '/business-records/user-status-changes',
          '/business-records/exchange-records',
          '/business-records/chat-messages'
        ],
        note: '多个 P1 优先级业务数据表的只读查询'
      },
      system_data: {
        description: '系统数据查询（2026-01-22 P1）',
        endpoints: [
          '/system-data/accounts',
          '/system-data/accounts/:account_id',
          '/system-data/user-roles',
          '/system-data/market-listings',
          '/system-data/market-listings/:market_listing_id',
          '/system-data/market-listings/statistics/summary',
          '/system-data/lottery-campaigns',
          '/system-data/lottery-campaigns/:lottery_campaign_id',
          '/system-data/lottery-campaigns/:lottery_campaign_id/status',
          '/system-data/lottery-daily-quotas',
          '/system-data/lottery-daily-quotas/:quota_id'
        ],
        note: '系统级数据管理'
      },
      feature_flags: {
        description: '功能开关管理（2026-01-21）',
        endpoints: [
          '/feature-flags',
          '/feature-flags/:flagKey',
          '/feature-flags/:flagKey/toggle',
          '/feature-flags/:flagKey/whitelist',
          '/feature-flags/:flagKey/blacklist',
          '/feature-flags/:flagKey/check/:userId',
          '/feature-flags/batch-check'
        ],
        note: '功能开关 CRUD、启用/禁用、白名单/黑名单管理、用户可用性检查'
      },
      sessions: {
        description: '会话管理（2026-01-21）',
        endpoints: [
          '/sessions',
          '/sessions/stats',
          '/sessions/:user_session_id/deactivate',
          '/sessions/deactivate-user',
          '/sessions/cleanup',
          '/sessions/online-users'
        ],
        note: '用户会话管理：列表、统计、强制登出、清理过期、在线监控'
      },
      lottery_campaigns: {
        description: '抽奖活动列表管理（2026-01-28 P1）',
        endpoints: ['/lottery/campaigns', '/lottery/campaigns/:lottery_campaign_id'],
        note: '活动列表含 ROI、复购率、库存预警；Redis 缓存（5分钟 TTL）'
      },
      lottery_analytics: {
        description: '抽奖分析（2026-01-28 P2）',
        endpoints: ['/lottery-analytics/daily-report'],
        note: '运营日报聚合：当日汇总、昨日/上周对比、告警、小时分布、档位分布'
      },
      user_data_query: {
        description: '用户数据查询（2026-02-18）',
        endpoints: [
          '/user-data-query/search',
          '/user-data-query/:user_id/overview',
          '/user-data-query/:user_id/asset-transactions',
          '/user-data-query/:user_id/lottery-draws',
          '/user-data-query/:user_id/exchange-records',
          '/user-data-query/:user_id/trade-records',
          '/user-data-query/:user_id/market-listings',
          '/user-data-query/:user_id/conversions'
        ],
        note: '用户全维度数据检索'
      },
      ad_campaigns: {
        description: '广告计划管理（含商业/运营/系统三类）',
        endpoints: [
          '/ad-campaigns',
          '/ad-campaigns/:id',
          '/ad-campaigns/:id/review',
          '/ad-campaigns/statistics',
          '/ad-campaigns/dashboard',
          '/ad-campaigns/popup-queue-config',
          '/ad-campaigns/bid-logs',
          '/ad-campaigns/user-ad-tags',
          '/ad-campaigns/antifraud-logs',
          '/ad-campaigns/attribution-logs'
        ],
        note: '广告计划 CRUD + category 筛选、审核、竞价日志、DMP 标签、反作弊'
      },
      ad_slots: {
        description: '广告位管理（Phase 3）',
        endpoints: ['/ad-slots', '/ad-slots/:id', '/ad-slots/:id/toggle', '/ad-slots/statistics'],
        note: '广告位 CRUD、开关控制（popup/carousel/announcement 三种类型）'
      },
      ad_reports: {
        description: '广告报表（Phase 6）',
        endpoints: ['/ad-reports/overview', '/ad-reports/campaigns/:id', '/ad-reports/slots/:id'],
        note: '全局广告数据总览、单计划/单广告位详细报表'
      },
      data_management: {
        description: '数据管理（2026-03-10）',
        endpoints: [
          '/data-management/stats',
          '/data-management/policies',
          '/data-management/policies/:config_key',
          '/data-management/history',
          '/data-management/preview',
          '/data-management/cleanup'
        ],
        note: '数据量统计、自动清理策略管理、手动清理（预览+执行）'
      },
      media: {
        description: '媒体管理（2026-03-16）',
        endpoints: [
          '/media',
          '/media/upload',
          '/media/:media_id',
          '/media/:media_id/attach',
          '/media/:media_id (DELETE)'
        ],
        note: '媒体库 CRUD、上传、多态关联'
      },
      storage: {
        description: '存储管理（2026-03-16）',
        endpoints: [
          '/storage/overview',
          '/storage/orphans',
          '/storage/trash',
          '/storage/cleanup',
          '/storage/duplicates'
        ],
        note: '存储概览、孤儿媒体、回收站、物理清理、重复检测'
      }
    },
    documentation: '请参考各模块的API文档',
    timestamp: BeijingTimeHelper.apiTimestamp()
  }

  res.apiSuccess(adminInfo, 'Admin API模块信息')
})

module.exports = router
