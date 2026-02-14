/**
 * 管理后台 - 活动投放位置配置管理路由
 *
 * 路由前缀：/api/v4/console/system/placement
 * 权限要求：authenticateToken + requireRoleLevel(100)
 *
 * 功能：
 * - GET / — 获取当前活动位置配置
 * - PUT / — 更新活动位置配置（保存后前端下次打开即生效）
 *
 * 业务场景：
 * - 运营在Web后台配置活动投放到小程序的哪个页面、什么位置、多大尺寸
 * - 保存后无需版本号管理，前端下次打开页面自动获取最新配置
 * - 配置变更通过审计日志（AuditLogService）追溯
 *
 * 数据来源：system_configs 表，config_key = 'campaign_placement'
 *
 * @see docs/后端与Web管理平台-对接需求总览.md Section 3.4
 * @date 2026-02-15
 */

'use strict'

const express = require('express')
const router = express.Router()
const logger = require('../../../../utils/logger').logger
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { handleServiceError } = require('../../../../middleware/validation')

// 所有路由强制管理员权限（role_level >= 100）
router.use(authenticateToken, requireRoleLevel(100))

/**
 * 位置配置校验常量
 * @readonly
 */
const PLACEMENT_ENUMS = {
  /** 展示页面枚举值 */
  PAGE: ['lottery', 'discover', 'user'],
  /** 页面位置枚举值 */
  POSITION: ['main', 'secondary', 'floating', 'top', 'bottom'],
  /** 组件尺寸枚举值 */
  SIZE: ['full', 'medium', 'small', 'mini'],
  /** 优先级范围 */
  PRIORITY: { min: 0, max: 1000 }
}

/**
 * 校验位置配置数据结构
 *
 * @param {Array} placements - 位置配置数组
 * @returns {Object} 校验结果 { valid: boolean, errors: string[] }
 */
function validatePlacements(placements) {
  const errors = []

  if (!Array.isArray(placements)) {
    return { valid: false, errors: ['placements 必须是数组'] }
  }

  // 按页面统计 main 位置数量（每个页面最多1个 main）
  const mainCountByPage = {}

  placements.forEach((item, index) => {
    const prefix = `placements[${index}]`

    // 校验 campaign_code
    if (!item.campaign_code || typeof item.campaign_code !== 'string') {
      errors.push(`${prefix}.campaign_code 不能为空`)
    }

    // 校验 placement 对象
    if (!item.placement || typeof item.placement !== 'object') {
      errors.push(`${prefix}.placement 必须是对象`)
      return
    }

    const p = item.placement

    // 校验 page 枚举值
    if (!PLACEMENT_ENUMS.PAGE.includes(p.page)) {
      errors.push(
        `${prefix}.placement.page 值无效（${p.page}），允许值: ${PLACEMENT_ENUMS.PAGE.join('/')}`
      )
    }

    // 校验 position 枚举值
    if (!PLACEMENT_ENUMS.POSITION.includes(p.position)) {
      errors.push(
        `${prefix}.placement.position 值无效（${p.position}），允许值: ${PLACEMENT_ENUMS.POSITION.join('/')}`
      )
    }

    // 校验 size 枚举值
    if (!PLACEMENT_ENUMS.SIZE.includes(p.size)) {
      errors.push(
        `${prefix}.placement.size 值无效（${p.size}），允许值: ${PLACEMENT_ENUMS.SIZE.join('/')}`
      )
    }

    // 校验 priority 范围
    if (p.priority !== undefined) {
      const priority = Number(p.priority)
      if (
        isNaN(priority) ||
        priority < PLACEMENT_ENUMS.PRIORITY.min ||
        priority > PLACEMENT_ENUMS.PRIORITY.max
      ) {
        errors.push(
          `${prefix}.placement.priority 超出范围（${p.priority}），允许范围: ${PLACEMENT_ENUMS.PRIORITY.min}-${PLACEMENT_ENUMS.PRIORITY.max}`
        )
      }
    }

    // 校验每页最多1个 main 位置
    if (p.position === 'main' && p.page) {
      mainCountByPage[p.page] = (mainCountByPage[p.page] || 0) + 1
      if (mainCountByPage[p.page] > 1) {
        errors.push(
          `页面 ${p.page} 最多只能有 1 个 main 位置，当前配置了 ${mainCountByPage[p.page]} 个`
        )
      }
    }
  })

  return { valid: errors.length === 0, errors }
}

/**
 * @route GET /api/v4/console/system/placement
 * @desc 获取当前活动位置配置
 * @access Admin（requireRoleLevel(100)）
 */
router.get('/', async (req, res) => {
  try {
    const { SystemConfig } = req.app.locals.models

    const config = await SystemConfig.getByKey('campaign_placement')

    if (!config) {
      return res.apiSuccess({ placements: [] }, '配置为空（尚未配置活动位置）')
    }

    return res.apiSuccess(config.getValue(), '获取位置配置成功', 'PLACEMENT_GET_SUCCESS')
  } catch (error) {
    logger.error('获取位置配置失败', { error: error.message, stack: error.stack })
    return handleServiceError(error, res, '获取位置配置失败')
  }
})

/**
 * @route PUT /api/v4/console/system/placement
 * @desc 更新活动位置配置（保存后前端下次打开即生效）
 * @access Admin（requireRoleLevel(100)）
 *
 * @body {Array} placements - 位置配置数组
 * @body {string} placements[].campaign_code - 活动代码
 * @body {Object} placements[].placement - 位置配置
 * @body {string} placements[].placement.page - 展示页面（lottery/discover/user）
 * @body {string} placements[].placement.position - 页面位置（main/secondary/floating/top/bottom）
 * @body {string} placements[].placement.size - 组件尺寸（full/medium/small/mini）
 * @body {number} placements[].placement.priority - 排列优先级（0-1000）
 */
router.put('/', async (req, res) => {
  try {
    const { placements } = req.body

    // 参数校验
    const validation = validatePlacements(placements)
    if (!validation.valid) {
      return res.apiError(
        '位置配置数据校验失败',
        'INVALID_PLACEMENT_CONFIG',
        { errors: validation.errors },
        400
      )
    }

    const { SystemConfig } = req.app.locals.models

    // 使用 SystemConfig.upsert 创建或更新配置
    await SystemConfig.upsert(
      'campaign_placement',
      { placements },
      {
        description: '活动位置配置 - 控制每个活动在小程序中的展示位置和尺寸',
        config_category: 'feature',
        is_active: true
      }
    )

    // 记录审计日志（通过 ServiceManager 获取审计日志服务）
    try {
      const AuditLogService = req.app.locals.services.getService('audit_log')
      await AuditLogService.log({
        operator_id: req.user.user_id,
        operation_type: 'config_update',
        target_type: 'system_config',
        target_id: 'campaign_placement',
        description: `更新活动位置配置（${placements.length} 个活动）`,
        details: { placements }
      })
    } catch (auditError) {
      // 审计日志失败不影响主操作（非致命）
      logger.warn('记录审计日志失败（非致命）', { error: auditError.message })
    }

    logger.info('活动位置配置更新成功', {
      operator_id: req.user.user_id,
      placement_count: placements.length
    })

    return res.apiSuccess(
      { placements },
      '位置配置更新成功（前端下次打开页面自动生效）',
      'PLACEMENT_UPDATE_SUCCESS'
    )
  } catch (error) {
    logger.error('更新位置配置失败', { error: error.message, stack: error.stack })
    return handleServiceError(error, res, '更新位置配置失败')
  }
})

module.exports = router
