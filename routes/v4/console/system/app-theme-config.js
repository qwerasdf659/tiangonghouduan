/**
 * 管理后台 - 全局氛围主题配置管理路由
 *
 * 路由前缀：/api/v4/console/system/app-theme-config
 * 权限要求：authenticateToken + requireRoleLevel(100)
 *
 * 功能：
 * - GET / — 获取当前全局氛围主题配置（管理后台用，带鉴权）
 * - PUT / — 更新全局氛围主题（保存后小程序下次打开页面即生效）
 *
 * 业务场景：
 * - 运营在 Web 后台一键切换小程序所有页面的视觉风格（6 套主题）
 * - 保存后写入 system_settings（setting_key=app_theme），小程序公开配置出口下次读取即生效
 * - 活动级 effect_theme 为 NULL 时继承本全局主题（见 models/LotteryCampaign.js）
 *
 * 数据来源：system_settings 表，setting_key = 'app_theme'，category = 'feature'
 * 复用范式：仿 routes/v4/console/system/exchange-page-config.js（upsertConfig 自由 JSON 通道，绕开白名单）
 *
 * ⚠️ 主题枚举权威来源：与 models/LotteryCampaign.js 的 effect_theme 注释一致
 *   （default / gold_luxury / purple_mystery / spring_festival / christmas / summer）
 *
 * @date 2026-06-03
 */

'use strict'

const express = require('express')
const router = express.Router()
const logger = require('../../../../utils/logger').logger
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')

router.use(authenticateToken, requireRoleLevel(100))

/** 配置项标识（system_settings.setting_key） */
const SETTING_KEY = 'app_theme'

/** 缺省主题（配置缺失时的安全兜底，与小程序默认一致） */
const DEFAULT_THEME = 'default'

/**
 * 主题元信息（6 套，权威枚举与 models/LotteryCampaign.js 的 effect_theme 一致）
 *
 * - label：中文展示名（管理后台主题卡片标题）
 * - primary_color：主色调（卡片色点/标题色，与抽奖活动 effectThemeOptions 同色值）
 * - description：一句话风格描述
 *
 * @constant {Object<string, {label: string, primary_color: string, description: string}>}
 */
const THEME_META = {
  default: { label: '默认日常', primary_color: '#e67e22', description: '温暖橙调，适合日常活动' },
  gold_luxury: {
    label: '金色奢华',
    primary_color: '#f1c40f',
    description: '金黑配色，高端大促氛围'
  },
  purple_mystery: {
    label: '紫色神秘',
    primary_color: '#9b59b6',
    description: '神秘紫调，适合限定/盲盒'
  },
  spring_festival: {
    label: '春节红色',
    primary_color: '#e74c3c',
    description: '红金喜庆，春节专属'
  },
  christmas: { label: '圣诞绿色', primary_color: '#27ae60', description: '红绿圣诞，节日氛围' },
  summer: { label: '夏日清凉', primary_color: '#3498db', description: '清爽蓝调，夏季活动' }
}

/** 合法主题标识列表（由 THEME_META 派生，单一真相源） */
const VALID_THEMES = Object.keys(THEME_META)

/**
 * @route GET /api/v4/console/system/app-theme-config
 * @desc 获取当前全局氛围主题配置（管理后台用）
 * @access Admin（requireRoleLevel(100)）
 *
 * @returns {Object} data
 * @returns {string} data.theme - 当前生效主题标识
 * @returns {string[]} data.valid_themes - 合法主题标识列表
 * @returns {Object} data.theme_meta - 各主题的展示元信息（label/primary_color/description）
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const AdminSystemService = req.app.locals.services.getService('admin_system')
    const cfg = await AdminSystemService.getConfigValue(SETTING_KEY)

    /* cfg 形如 { theme: 'summer' }；缺失或非法时回退默认主题 */
    const theme = cfg && VALID_THEMES.includes(cfg.theme) ? cfg.theme : DEFAULT_THEME

    return res.apiSuccess(
      { theme, valid_themes: VALID_THEMES, theme_meta: THEME_META },
      '获取全局主题配置成功',
      'APP_THEME_CONFIG_GET_SUCCESS'
    )
  })
)

/**
 * @route PUT /api/v4/console/system/app-theme-config
 * @desc 更新全局氛围主题（保存后小程序下次打开页面自动生效）
 * @access Admin（requireRoleLevel(100)）
 *
 * @body {string} theme - 目标主题标识（必须在 VALID_THEMES 内）
 */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    const { theme } = req.body

    if (!theme || !VALID_THEMES.includes(theme)) {
      return res.apiError(
        '主题标识无效',
        'INVALID_APP_THEME',
        { errors: [`theme 必须是以下之一：${VALID_THEMES.join(' / ')}`] },
        400
      )
    }

    const AdminSystemService = req.app.locals.services.getService('admin_system')

    /* 仅存 { theme }，与实库既有结构一致，不夹带展示元信息（元信息由后端常量提供） */
    await AdminSystemService.upsertConfig(
      SETTING_KEY,
      { theme },
      { description: '全局氛围主题配置 — 控制小程序所有页面的视觉风格', category: 'feature' }
    )

    /* 记录审计日志（失败不阻断主流程） */
    try {
      const AuditLogService = req.app.locals.services.getService('audit_log')
      await AuditLogService.logOperation({
        operator_id: req.user.user_id,
        operation_type: 'config_update',
        target_type: 'system_config',
        target_id: SETTING_KEY,
        description: `更新全局氛围主题为 ${theme}（${THEME_META[theme].label}）`,
        details: { theme }
      })
    } catch (auditError) {
      logger.warn('记录全局主题审计日志失败（非致命）', { error: auditError.message })
    }

    logger.info('全局氛围主题更新成功', { operator_id: req.user.user_id, theme })

    return res.apiSuccess(
      { theme, valid_themes: VALID_THEMES, theme_meta: THEME_META },
      '全局主题配置更新成功（小程序下次打开页面自动生效）',
      'APP_THEME_CONFIG_UPDATE_SUCCESS'
    )
  })
)

module.exports = router
