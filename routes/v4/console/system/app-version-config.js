/**
 * 管理后台 - 小程序版本闸门配置管理路由
 *
 * 路由前缀：/api/v4/console/system/app-version-config
 * 权限要求：authenticateToken + requireRoleLevel(100)
 *
 * 功能：
 * - GET / — 获取当前版本闸门配置（管理后台用，带鉴权）
 * - PUT / — 更新版本闸门配置（保存后小程序下次 onLaunch 即生效）
 *
 * 业务场景：
 * - 运营在 Web 后台配置小程序版本闸门（最低可用版本、最新版本、强更开关、提示文案）
 * - 保存后写入 system_settings（setting_key=app_version_gate），公开只读接口
 *   GET /api/v4/system/app-version 下次读取即生效（带 Redis 缓存）
 * - 配置变更通过审计日志（AuditLogService）追溯
 *
 * 数据来源：system_settings 表，setting_key = 'app_version_gate'，category = 'feature'
 * 复用范式：仿 routes/v4/console/system/exchange-page-config.js（upsertConfig 自由 JSON 通道，绕开白名单）
 *
 * ⚠️ 与公开只读接口字段契约一致（routes/v4/system/app-version.js 的 DEFAULTS）：
 *   latest_version / min_version / force_update / update_message / platform
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

/** 配置项标识（system_settings.setting_key，与公开只读接口共用同一条记录） */
const SETTING_KEY = 'app_version_gate'

/**
 * 版本闸门默认值（与 routes/v4/system/app-version.js 的 DEFAULTS 保持字段一致）
 *
 * 设计原则：缺省绝不拦截，避免误伤正常用户
 * @constant {Object}
 */
const DEFAULTS = {
  latest_version: null, // 最新版本号（用于提示"有新版本"，非强制）
  min_version: '0.0.0', // 最低可用版本号（低于此版本且 force_update=true 才拦截）
  force_update: false, // 是否强制更新（仅为 true 且低于 min_version 时拦截）
  update_message: '检测到新版本，请更新后继续使用', // 拦截时展示文案
  platform: 'miniprogram' // 适用平台标识
}

/** 语义化版本号格式：x.y.z（与白名单 system_version 同口径，不收 v 前缀） */
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/

/**
 * 校验版本闸门配置数据结构
 *
 * @param {Object} config - 完整配置对象
 * @returns {Object} 校验结果 { valid: boolean, errors: string[] }
 */
function validateAppVersionConfig(config) {
  const errors = []

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['配置必须是对象'] }
  }

  // min_version：必填，必须是 x.y.z 语义化版本
  if (typeof config.min_version !== 'string' || !SEMVER_PATTERN.test(config.min_version)) {
    errors.push('min_version 必须是 x.y.z 格式的语义化版本号（如 5.2.0）')
  }

  // latest_version：可空；非空时必须是 x.y.z
  if (
    config.latest_version !== null &&
    config.latest_version !== undefined &&
    config.latest_version !== '' &&
    (typeof config.latest_version !== 'string' || !SEMVER_PATTERN.test(config.latest_version))
  ) {
    errors.push('latest_version 为空或 x.y.z 格式的语义化版本号（如 5.3.0）')
  }

  // force_update：必须是布尔值
  if (typeof config.force_update !== 'boolean') {
    errors.push('force_update 必须是布尔值')
  }

  // update_message：必须是非空字符串
  if (typeof config.update_message !== 'string' || config.update_message.trim() === '') {
    errors.push('update_message 不能为空')
  }

  // platform：必须是非空字符串
  if (typeof config.platform !== 'string' || config.platform.trim() === '') {
    errors.push('platform 不能为空')
  }

  return { valid: errors.length === 0, errors }
}

/**
 * @route GET /api/v4/console/system/app-version-config
 * @desc 获取当前版本闸门配置（管理后台用）
 * @access Admin（requireRoleLevel(100)）
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const AdminSystemService = req.app.locals.services.getService('admin_system')
    const cfg = await AdminSystemService.getConfigValue(SETTING_KEY)

    /* 合并默认值：DB 配置缺字段时由 DEFAULTS 兜底，确保前端拿到完整结构 */
    const data = { ...DEFAULTS, ...(cfg || {}) }

    return res.apiSuccess(data, '获取版本闸门配置成功', 'APP_VERSION_CONFIG_GET_SUCCESS')
  })
)

/**
 * @route PUT /api/v4/console/system/app-version-config
 * @desc 更新版本闸门配置（保存后小程序下次 onLaunch 自动生效）
 * @access Admin（requireRoleLevel(100)）
 *
 * @body {string|null} latest_version - 最新版本号（x.y.z 或留空）
 * @body {string} min_version - 最低可用版本号（x.y.z，必填）
 * @body {boolean} force_update - 是否强制更新
 * @body {string} update_message - 强更提示文案
 * @body {string} platform - 适用平台（默认 miniprogram）
 */
router.put(
  '/',
  asyncHandler(async (req, res) => {
    /* 仅取契约内字段，归一空 latest_version 为 null，避免存入无关字段 */
    const configValue = {
      latest_version: req.body.latest_version === '' ? null : (req.body.latest_version ?? null),
      min_version: req.body.min_version,
      force_update: req.body.force_update,
      update_message: req.body.update_message,
      platform: req.body.platform || DEFAULTS.platform
    }

    const validation = validateAppVersionConfig(configValue)
    if (!validation.valid) {
      return res.apiError(
        '版本闸门配置数据校验失败',
        'INVALID_APP_VERSION_CONFIG',
        { errors: validation.errors },
        400
      )
    }

    const AdminSystemService = req.app.locals.services.getService('admin_system')

    await AdminSystemService.upsertConfig(SETTING_KEY, configValue, {
      description: '小程序版本闸门配置 — 最低/最新版本、强更开关、提示文案',
      category: 'feature'
    })

    /* 记录审计日志（失败不阻断主流程） */
    try {
      const AuditLogService = req.app.locals.services.getService('audit_log')
      await AuditLogService.logOperation({
        operator_id: req.user.user_id,
        operation_type: 'config_update',
        target_type: 'system_config',
        target_id: SETTING_KEY,
        description: `更新版本闸门配置（min_version=${configValue.min_version}、force_update=${configValue.force_update}）`,
        details: configValue
      })
    } catch (auditError) {
      logger.warn('记录版本闸门审计日志失败（非致命）', { error: auditError.message })
    }

    logger.info('版本闸门配置更新成功', {
      operator_id: req.user.user_id,
      min_version: configValue.min_version,
      force_update: configValue.force_update
    })

    return res.apiSuccess(
      configValue,
      '版本闸门配置更新成功（小程序下次启动自动生效）',
      'APP_VERSION_CONFIG_UPDATE_SUCCESS'
    )
  })
)

module.exports = router
