/**
 * 管理后台 - 全局氛围主题配置管理路由
 *
 * 路由前缀：/api/v4/console/system/app-theme-config
 * 权限要求：authenticateToken + requireRoleLevel(100)
 *
 * 功能：
 * - GET / — 获取当前全局氛围主题配置
 * - PUT / — 更新全局氛围主题配置
 *
 * 业务场景：
 * - 运营在Web后台一键切换小程序全局视觉主题
 * - 保存后小程序下次打开任意页面自动获取最新主题
 * - 与抽奖活动级别主题（lottery_campaigns.effect_theme）独立，互不影响
 * - 抽奖活动未单独配置主题时，自动继承全局氛围主题
 *
 * 主题列表（6套）：
 * - default: 日常活动（暖橙）
 * - gold_luxury: 金色奢华
 * - purple_mystery: 紫色神秘
 * - spring_festival: 春节（红金）
 * - christmas: 圣诞节（绿色）
 * - summer: 夏日（蓝色）
 *
 * @date 2026-03-06
 */

'use strict'

const express = require('express')
const router = express.Router()
const logger = require('../../../../utils/logger').logger
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')
const ServiceManager = require('../../../../services')

router.use(authenticateToken, requireRoleLevel(100))

/** 全局氛围主题合法值枚举 */
const VALID_THEMES = [
  'default',
  'gold_luxury',
  'purple_mystery',
  'spring_festival',
  'christmas',
  'summer'
]

/** 主题元信息（供管理后台展示） */
const THEME_META = {
  default: {
    label: '日常活动',
    primary_color: '#e67e22',
    description: '暖橙色主色调，白底标准风格'
  },
  gold_luxury: {
    label: '金色奢华',
    primary_color: '#f1c40f',
    description: '金色 + 深色背景，高端活动'
  },
  purple_mystery: {
    label: '紫色神秘',
    primary_color: '#9b59b6',
    description: '紫色 + 深紫背景，神秘活动'
  },
  spring_festival: {
    label: '春节',
    primary_color: '#e74c3c',
    description: '中国红 + 金色，年节专用'
  },
  christmas: { label: '圣诞节', primary_color: '#27ae60', description: '圣诞绿 + 红色，圣诞节日' },
  summer: { label: '夏日', primary_color: '#3498db', description: '天空蓝 + 白色，夏季清爽' }
}

/**
 * @route GET /api/v4/console/system/app-theme-config
 * @desc 获取当前全局氛围主题配置（管理后台用）
 * @access Admin（requireRoleLevel(100)）
 */
router.get('/', async (req, res) => {
  try {
    const AdminSystemService = ServiceManager.getService('admin_system')
    const configData = await AdminSystemService.getConfigValue('app_theme')

    if (!configData) {
      return res.apiSuccess(
        {
          theme: 'default',
          theme_meta: THEME_META,
          valid_themes: VALID_THEMES,
          is_default: true
        },
        '配置为空（使用默认主题）'
      )
    }

    return res.apiSuccess(
      {
        theme: configData.theme || 'default',
        theme_meta: THEME_META,
        valid_themes: VALID_THEMES,
        version: Date.now().toString()
      },
      '获取全局主题配置成功',
      'APP_THEME_CONFIG_GET_SUCCESS'
    )
  } catch (error) {
    logger.error('获取全局主题配置失败', { error: error.message, stack: error.stack })
    return handleServiceError(error, res, '获取全局主题配置失败')
  }
})

/**
 * @route PUT /api/v4/console/system/app-theme-config
 * @desc 更新全局氛围主题配置
 * @access Admin（requireRoleLevel(100)）
 *
 * @body {string} theme - 主题标识（必须是 VALID_THEMES 中的值）
 */
router.put('/', async (req, res) => {
  try {
    const { theme } = req.body

    if (!theme || !VALID_THEMES.includes(theme)) {
      return res.apiError(
        `theme 值无效（${theme}），允许值: ${VALID_THEMES.join(' / ')}`,
        'INVALID_THEME',
        { valid_themes: VALID_THEMES },
        400
      )
    }

    const AdminSystemService = ServiceManager.getService('admin_system')
    const configValue = { theme }

    await AdminSystemService.upsertConfig('app_theme', configValue, {
      description: '全局氛围主题配置，控制小程序所有页面的视觉主题',
      category: 'feature'
    })

    try {
      const AuditLogService = req.app.locals.services.getService('audit_log')
      await AuditLogService.logOperation({
        operator_id: req.user.user_id,
        operation_type: 'config_update',
        target_type: 'system_config',
        target_id: 'app_theme',
        description: `切换全局氛围主题为「${THEME_META[theme]?.label || theme}」`,
        details: configValue
      })
    } catch (auditError) {
      logger.warn('记录审计日志失败（非致命）', { error: auditError.message })
    }

    logger.info('全局氛围主题配置更新成功', {
      operator_id: req.user.user_id,
      theme,
      theme_label: THEME_META[theme]?.label
    })

    return res.apiSuccess(
      { theme, theme_label: THEME_META[theme]?.label },
      `全局主题已切换为「${THEME_META[theme]?.label || theme}」（小程序下次打开页面自动生效）`,
      'APP_THEME_CONFIG_UPDATE_SUCCESS'
    )
  } catch (error) {
    logger.error('更新全局主题配置失败', { error: error.message, stack: error.stack })
    return handleServiceError(error, res, '更新全局主题配置失败')
  }
})

module.exports = router
