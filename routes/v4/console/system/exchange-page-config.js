/**
 * 管理后台 - 兑换页面配置管理路由
 *
 * 路由前缀：/api/v4/console/system/exchange-page-config
 * 权限要求：authenticateToken + requireRoleLevel(100)
 *
 * 功能：
 * - GET / — 获取当前兑换页面配置（管理后台用，带鉴权）
 * - PUT / — 更新兑换页面配置（保存后小程序下次打开即生效）
 *
 * 业务场景：
 * - 运营在Web后台配置兑换页面的Tab/空间/筛选项/卡片主题/运营参数
 * - 保存后清除 Redis 缓存，小程序下次打开页面自动获取最新配置
 * - 配置变更通过审计日志（AuditLogService）追溯
 *
 * 数据来源：system_configs 表，config_key = 'exchange_page'
 *
 * @see docs/exchange-config-implementation.md Section 3.4
 * @date 2026-02-19
 */

'use strict'

const express = require('express')
const router = express.Router()
const logger = require('../../../../utils/logger').logger
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')

router.use(authenticateToken, requireRoleLevel(100))

/**
 * 兑换页面配置校验常量
 * @readonly
 */
const EXCHANGE_PAGE_ENUMS = {
  /** 卡片主题枚举（A~E 五套主题） */
  THEMES: ['A', 'B', 'C', 'D', 'E'],
  /** 空间布局枚举 */
  LAYOUTS: ['waterfall', 'grid', 'list', 'simple'],
  /** 库存显示模式 */
  STOCK_DISPLAY_MODES: ['bar', 'text', 'badge'],
  /** 价格显示模式 */
  PRICE_DISPLAY_MODES: ['normal', 'highlight', 'capsule'],
  /** 点击效果 */
  PRESS_EFFECTS: ['scale', 'ripple', 'glow', 'none'],
  /** 价格颜色模式 */
  PRICE_COLOR_MODES: ['fixed', 'type_based'],
  /** 视图模式 */
  VIEW_MODES: ['grid', 'list'],
  /** 图片占位样式 */
  IMAGE_PLACEHOLDER_STYLES: ['gradient', 'emoji', 'icon']
}

/**
 * 校验兑换页面配置数据结构
 *
 * @param {Object} config - 完整配置对象
 * @returns {Object} 校验结果 { valid: boolean, errors: string[] }
 */
function validateExchangePageConfig(config) {
  const errors = []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['配置必须是对象'] }
  }

  // ---- tabs 校验 ----
  if (!Array.isArray(config.tabs)) {
    errors.push('tabs 必须是数组')
  } else {
    config.tabs.forEach((tab, i) => {
      const prefix = `tabs[${i}]`
      if (!tab.key || typeof tab.key !== 'string') errors.push(`${prefix}.key 不能为空`)
      if (!tab.label || typeof tab.label !== 'string') errors.push(`${prefix}.label 不能为空`)
      if (typeof tab.enabled !== 'boolean') errors.push(`${prefix}.enabled 必须是布尔值`)
      if (typeof tab.sort_order !== 'number') errors.push(`${prefix}.sort_order 必须是数字`)
    })
  }

  // ---- spaces 校验 ----
  if (!Array.isArray(config.spaces)) {
    errors.push('spaces 必须是数组')
  } else {
    config.spaces.forEach((space, i) => {
      const prefix = `spaces[${i}]`
      if (!space.id || typeof space.id !== 'string') errors.push(`${prefix}.id 不能为空`)
      if (!space.name || typeof space.name !== 'string') errors.push(`${prefix}.name 不能为空`)
      if (typeof space.enabled !== 'boolean') errors.push(`${prefix}.enabled 必须是布尔值`)
      if (typeof space.sort_order !== 'number') errors.push(`${prefix}.sort_order 必须是数字`)
      if (space.layout && !EXCHANGE_PAGE_ENUMS.LAYOUTS.includes(space.layout)) {
        errors.push(
          `${prefix}.layout 值无效（${space.layout}），允许值: ${EXCHANGE_PAGE_ENUMS.LAYOUTS.join('/')}`
        )
      }
    })
  }

  // ---- shop_filters 校验 ----
  if (!config.shop_filters || typeof config.shop_filters !== 'object') {
    errors.push('shop_filters 必须是对象')
  } else {
    const sf = config.shop_filters
    if (!Array.isArray(sf.categories)) errors.push('shop_filters.categories 必须是数组')
    if (!Array.isArray(sf.cost_ranges)) errors.push('shop_filters.cost_ranges 必须是数组')
    if (!Array.isArray(sf.sort_options)) errors.push('shop_filters.sort_options 必须是数组')
    if (sf.basic_filters && !Array.isArray(sf.basic_filters)) {
      errors.push('shop_filters.basic_filters 必须是数组')
    }
    if (sf.stock_statuses && !Array.isArray(sf.stock_statuses)) {
      errors.push('shop_filters.stock_statuses 必须是数组')
    }

    // 校验筛选项结构（value + label）
    if (Array.isArray(sf.categories)) {
      sf.categories.forEach((item, i) => {
        if (!item.label || typeof item.label !== 'string') {
          errors.push(`shop_filters.categories[${i}].label 不能为空`)
        }
      })
    }
    if (Array.isArray(sf.cost_ranges)) {
      sf.cost_ranges.forEach((item, i) => {
        if (!item.label || typeof item.label !== 'string') {
          errors.push(`shop_filters.cost_ranges[${i}].label 不能为空`)
        }
      })
    }
  }

  // ---- market_filters 校验 ----
  if (!config.market_filters || typeof config.market_filters !== 'object') {
    errors.push('market_filters 必须是对象')
  } else {
    const mf = config.market_filters
    if (!Array.isArray(mf.type_filters)) errors.push('market_filters.type_filters 必须是数组')
    if (!Array.isArray(mf.sort_options)) errors.push('market_filters.sort_options 必须是数组')
  }

  // ---- card_display 校验 ----
  if (!config.card_display || typeof config.card_display !== 'object') {
    errors.push('card_display 必须是对象')
  } else {
    const cd = config.card_display
    if (!EXCHANGE_PAGE_ENUMS.THEMES.includes(cd.theme)) {
      errors.push(
        `card_display.theme 值无效（${cd.theme}），允许值: ${EXCHANGE_PAGE_ENUMS.THEMES.join('/')}`
      )
    }
    if (cd.effects && typeof cd.effects !== 'object') {
      errors.push('card_display.effects 必须是对象')
    }
    if (
      cd.stock_display_mode &&
      !EXCHANGE_PAGE_ENUMS.STOCK_DISPLAY_MODES.includes(cd.stock_display_mode)
    ) {
      errors.push(
        `card_display.stock_display_mode 值无效，允许值: ${EXCHANGE_PAGE_ENUMS.STOCK_DISPLAY_MODES.join('/')}`
      )
    }
    if (cd.default_view_mode && !EXCHANGE_PAGE_ENUMS.VIEW_MODES.includes(cd.default_view_mode)) {
      errors.push(
        `card_display.default_view_mode 值无效，允许值: ${EXCHANGE_PAGE_ENUMS.VIEW_MODES.join('/')}`
      )
    }
  }

  // ---- ui 校验 ----
  if (!config.ui || typeof config.ui !== 'object') {
    errors.push('ui 必须是对象')
  } else {
    const ui = config.ui
    if (
      ui.low_stock_threshold !== undefined &&
      (typeof ui.low_stock_threshold !== 'number' || ui.low_stock_threshold < 0)
    ) {
      errors.push('ui.low_stock_threshold 必须是非负整数')
    }
    if (
      ui.grid_page_size !== undefined &&
      (typeof ui.grid_page_size !== 'number' || ui.grid_page_size < 1)
    ) {
      errors.push('ui.grid_page_size 必须是正整数')
    }
    if (
      ui.waterfall_page_size !== undefined &&
      (typeof ui.waterfall_page_size !== 'number' || ui.waterfall_page_size < 1)
    ) {
      errors.push('ui.waterfall_page_size 必须是正整数')
    }
    if (
      ui.default_api_page_size !== undefined &&
      (typeof ui.default_api_page_size !== 'number' || ui.default_api_page_size < 1)
    ) {
      errors.push('ui.default_api_page_size 必须是正整数')
    }
    if (
      ui.search_debounce_ms !== undefined &&
      (typeof ui.search_debounce_ms !== 'number' || ui.search_debounce_ms < 0)
    ) {
      errors.push('ui.search_debounce_ms 必须是非负整数')
    }
  }

  return { valid: errors.length === 0, errors }
}

/**
 * @route GET /api/v4/console/system/exchange-page-config
 * @desc 获取当前兑换页面配置（管理后台用）
 * @access Admin（requireRoleLevel(100)）
 */
router.get('/', async (req, res) => {
  try {
    const { SystemConfig } = req.app.locals.models

    const config = await SystemConfig.getByKey('exchange_page')

    if (!config) {
      return res.apiSuccess(
        { tabs: [], spaces: [], shop_filters: {}, market_filters: {}, card_display: {}, ui: {} },
        '配置为空（尚未配置兑换页面）'
      )
    }

    const configData = config.getValue()
    const version = config.updated_at
      ? new Date(config.updated_at).getTime().toString()
      : Date.now().toString()

    return res.apiSuccess(
      { ...configData, version, updated_at: config.updated_at },
      '获取兑换页面配置成功',
      'EXCHANGE_PAGE_CONFIG_GET_SUCCESS'
    )
  } catch (error) {
    logger.error('获取兑换页面配置失败', { error: error.message, stack: error.stack })
    return handleServiceError(error, res, '获取兑换页面配置失败')
  }
})

/**
 * @route PUT /api/v4/console/system/exchange-page-config
 * @desc 更新兑换页面配置（保存后小程序下次打开即生效）
 * @access Admin（requireRoleLevel(100)）
 *
 * @body {Array} tabs - Tab 配置数组
 * @body {Array} spaces - 空间配置数组
 * @body {Object} shop_filters - 商品兑换筛选项配置
 * @body {Object} market_filters - 交易市场筛选项配置
 * @body {Object} card_display - 卡片主题配置（两个 Tab 共用）
 * @body {Object} ui - 运营参数配置
 */
router.put('/', async (req, res) => {
  try {
    const configValue = req.body

    const validation = validateExchangePageConfig(configValue)
    if (!validation.valid) {
      return res.apiError(
        '兑换页面配置数据校验失败',
        'INVALID_EXCHANGE_PAGE_CONFIG',
        { errors: validation.errors },
        400
      )
    }

    const { SystemConfig } = req.app.locals.models

    await SystemConfig.upsert('exchange_page', configValue, {
      description: '兑换页面配置 — Tab/空间/筛选/卡片主题/运营参数的统一下发配置',
      config_category: 'feature',
      is_active: true
    })

    // 记录审计日志
    try {
      const AuditLogService = req.app.locals.services.getService('audit_log')
      await AuditLogService.log({
        operator_id: req.user.user_id,
        operation_type: 'config_update',
        target_type: 'system_config',
        target_id: 'exchange_page',
        description: `更新兑换页面配置（${configValue.tabs?.length || 0} 个Tab、${configValue.spaces?.length || 0} 个空间、主题 ${configValue.card_display?.theme || '-'}）`,
        details: configValue
      })
    } catch (auditError) {
      logger.warn('记录审计日志失败（非致命）', { error: auditError.message })
    }

    logger.info('兑换页面配置更新成功', {
      operator_id: req.user.user_id,
      tab_count: configValue.tabs?.length,
      space_count: configValue.spaces?.length,
      theme: configValue.card_display?.theme
    })

    return res.apiSuccess(
      configValue,
      '兑换页面配置更新成功（小程序下次打开页面自动生效）',
      'EXCHANGE_PAGE_CONFIG_UPDATE_SUCCESS'
    )
  } catch (error) {
    logger.error('更新兑换页面配置失败', { error: error.message, stack: error.stack })
    return handleServiceError(error, res, '更新兑换页面配置失败')
  }
})

module.exports = router
