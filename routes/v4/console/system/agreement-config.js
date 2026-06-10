/**
 * 管理后台 - 协议正文配置管理路由（ADM-1 / 合规硬项 A-2）
 *
 * 路由前缀：/api/v4/console/system/agreement-config
 * 权限要求：authenticateToken + requireRoleLevel(100)
 *
 * 功能：
 * - GET /            — 获取两份协议正文（用户协议 + 隐私政策）供后台编辑
 * - PUT /:doc_type   — 保存指定协议正文（保存后小程序读 GET /api/v4/system/agreement/:doc_type 即生效）
 *
 * 业务场景：
 * - 运营/法务在 Web 后台用富文本/分段编辑《用户协议》《隐私政策》正文。
 * - 保存写入 system_settings（category='agreement'），C 端公开只读接口读取下发。
 * - 协议正文为法务文本，由人工录入；后端不编造、不硬编码任何条款。
 *
 * 数据来源：system_settings 表
 * - setting_key = 'agreement_user_agreement' / 'agreement_privacy_policy'
 * - category = 'agreement'，value_type = 'json'
 * - 与 C 端只读接口 routes/v4/system/agreement.js 共用同一条记录、同一字段契约
 *
 * 字段契约（与 C 端一致）：
 *   { title, updated_at(北京时间字符串), version?, sections:[{ heading?, text }] }
 *
 * @date 2026-06-09
 */

'use strict'

const express = require('express')
const router = express.Router()
const logger = require('../../../../utils/logger').logger
const BeijingTimeHelper = require('../../../../utils/timeHelper')
const { authenticateToken, requireRoleLevel } = require('../../../../middleware/auth')
const { asyncHandler } = require('../../../../middleware/validation')

router.use(authenticateToken, requireRoleLevel(100))

/** 合法协议类型 → system_settings.setting_key 映射（与 C 端只读接口一致） */
const AGREEMENT_DOC_KEYS = {
  user_agreement: 'agreement_user_agreement',
  privacy_policy: 'agreement_privacy_policy'
}

/** 协议类型中文名（仅用于审计日志/默认标题） */
const DOC_TYPE_NAMES = {
  user_agreement: '用户协议',
  privacy_policy: '隐私政策'
}

/**
 * 校验协议正文数据结构
 *
 * @param {Object} content - 协议正文对象 { title, sections:[{ heading?, text }] }
 * @returns {Object} 校验结果 { valid: boolean, errors: string[] }
 */
function validateAgreementContent(content) {
  const errors = []

  if (!content || typeof content !== 'object') {
    return { valid: false, errors: ['协议正文必须是对象'] }
  }

  // title：必填非空字符串
  if (typeof content.title !== 'string' || content.title.trim() === '') {
    errors.push('title（协议标题）不能为空')
  }

  // sections：必填非空数组，每段 text 非空
  if (!Array.isArray(content.sections) || content.sections.length === 0) {
    errors.push('sections（正文段落）必须是非空数组')
  } else {
    content.sections.forEach((section, index) => {
      if (!section || typeof section !== 'object') {
        errors.push(`第 ${index + 1} 段必须是对象`)
        return
      }
      if (typeof section.text !== 'string' || section.text.trim() === '') {
        errors.push(`第 ${index + 1} 段的 text（正文）不能为空`)
      }
      if (
        section.heading !== undefined &&
        section.heading !== null &&
        typeof section.heading !== 'string'
      ) {
        errors.push(`第 ${index + 1} 段的 heading（小标题）必须是字符串`)
      }
    })
  }

  return { valid: errors.length === 0, errors }
}

/**
 * @route GET /api/v4/console/system/agreement-config
 * @desc 获取两份协议正文（用户协议 + 隐私政策）
 * @access Admin（requireRoleLevel(100)）
 *
 * @returns {Object} data - { user_agreement: {...}|null, privacy_policy: {...}|null }
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const AdminSystemService = req.app.locals.services.getService('admin_system')

    const userAgreement = await AdminSystemService.getConfigValue(AGREEMENT_DOC_KEYS.user_agreement)
    const privacyPolicy = await AdminSystemService.getConfigValue(AGREEMENT_DOC_KEYS.privacy_policy)

    return res.apiSuccess(
      {
        user_agreement: userAgreement || null,
        privacy_policy: privacyPolicy || null
      },
      '获取协议配置成功',
      'AGREEMENT_CONFIG_GET_SUCCESS'
    )
  })
)

/**
 * @route PUT /api/v4/console/system/agreement-config/:doc_type
 * @desc 保存指定协议正文
 * @access Admin（requireRoleLevel(100)）
 *
 * @param {string} doc_type - user_agreement（用户协议）/ privacy_policy（隐私政策）
 * @body {string} title - 协议标题
 * @body {Array} sections - 正文段落 [{ heading?, text }]
 * @body {string} [version] - 协议版本号（可选，预留版本留痕）
 */
router.put(
  '/:doc_type',
  asyncHandler(async (req, res) => {
    const docType = req.params.doc_type
    const settingKey = AGREEMENT_DOC_KEYS[docType]
    if (!settingKey) {
      return res.apiError(
        '不支持的协议类型',
        'AGREEMENT_DOC_TYPE_INVALID',
        { doc_type: docType, allowed: Object.keys(AGREEMENT_DOC_KEYS) },
        400
      )
    }

    // 仅取契约内字段，补 updated_at（北京时间，后端权威生成，不信任前端）
    const content = {
      title: req.body.title,
      sections: req.body.sections,
      version: req.body.version || null,
      updated_at: BeijingTimeHelper.apiTimestamp()
    }

    const validation = validateAgreementContent(content)
    if (!validation.valid) {
      return res.apiError(
        '协议正文数据校验失败',
        'INVALID_AGREEMENT_CONTENT',
        { errors: validation.errors },
        400
      )
    }

    const AdminSystemService = req.app.locals.services.getService('admin_system')

    await AdminSystemService.upsertConfig(settingKey, content, {
      description: `${DOC_TYPE_NAMES[docType]}正文（C 端协议页只读下发）`,
      category: 'agreement'
    })

    // 记录审计日志（失败不阻断主流程）
    try {
      const AuditLogService = req.app.locals.services.getService('audit_log')
      await AuditLogService.logOperation({
        operator_id: req.user.user_id,
        operation_type: 'config_update',
        target_type: 'system_config',
        target_id: settingKey,
        description: `更新${DOC_TYPE_NAMES[docType]}正文（${content.sections.length} 段）`,
        details: {
          doc_type: docType,
          title: content.title,
          sections_count: content.sections.length
        }
      })
    } catch (auditError) {
      logger.warn('记录协议配置审计日志失败（非致命）', { error: auditError.message })
    }

    logger.info('协议正文更新成功', {
      operator_id: req.user.user_id,
      doc_type: docType,
      sections_count: content.sections.length
    })

    return res.apiSuccess(
      content,
      `${DOC_TYPE_NAMES[docType]}更新成功（小程序协议页下次打开自动生效）`,
      'AGREEMENT_CONFIG_UPDATE_SUCCESS'
    )
  })
)

module.exports = router
