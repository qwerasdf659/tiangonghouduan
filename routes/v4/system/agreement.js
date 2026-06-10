'use strict'

/**
 * 协议正文只读路由（BE-6 / 合规硬项 A-1）
 *
 * 路由前缀：/api/v4/system/agreement
 *
 * 功能：
 * - 向 C 端（微信小程序）下发《用户协议》《隐私政策》正文（公开只读，无需登录）。
 *
 * 业务背景（拍板点⑤，后端权威）：
 * - 协议正文属法务文本，前端不硬编码、不编造，统一由后端下发。
 * - 复用现有配置中心 system_settings（category='agreement'）+ SystemConfigService 读写，不新建表。
 * - JSON 内预留 version 字段（未来需"协议重大变更强制重新同意/审计"时再升级专表）。
 *
 * 存储约定（system_settings）：
 * - category='agreement'
 * - setting_key='agreement_user_agreement' / 'agreement_privacy_policy'
 * - value_type='json'，setting_value 结构：
 *   { title, updated_at(北京时间字符串), version?, sections:[{ heading?, text }] }
 *
 * 安全说明：
 * - 协议正文为公开合规文本，无敏感信息，无需登录。
 * - 缺失必需数据时明确报错（不静默降级、不返回假内容）。
 *
 * 适用区域：中国（北京时间 Asia/Shanghai）
 */

const express = require('express')
const router = express.Router()
const { asyncHandler } = require('../../../middleware/validation')

/** 合法的协议文档类型 → system_settings.setting_key 映射 */
const AGREEMENT_DOC_KEYS = {
  user_agreement: 'agreement_user_agreement',
  privacy_policy: 'agreement_privacy_policy'
}

/**
 * @route GET /api/v4/system/agreement/:doc_type
 * @desc 获取协议正文（公开只读）
 * @access Public（无需登录）
 *
 * @param {string} doc_type - 文档类型：user_agreement（用户协议）/ privacy_policy（隐私政策）
 *
 * @returns {Object} data - 协议正文 { title, updated_at, version?, sections: [{ heading?, text }] }
 */
router.get(
  '/:doc_type',
  asyncHandler(async (req, res) => {
    const docType = req.params.doc_type

    // 文档类型白名单校验（仅允许用户协议 / 隐私政策）
    const settingKey = AGREEMENT_DOC_KEYS[docType]
    if (!settingKey) {
      return res.apiError(
        '不支持的协议类型',
        'AGREEMENT_DOC_TYPE_INVALID',
        { doc_type: docType, allowed: Object.keys(AGREEMENT_DOC_KEYS) },
        400
      )
    }

    // 读操作收口到 AdminSystemService（配置中心读取，路由不直连 models）
    const AdminSystemService = req.app.locals.services.getService('admin_system')
    const content = await AdminSystemService.getConfigValue(settingKey)

    // 协议正文为合规必需数据，缺失时明确报错（不返回假内容、不静默降级）
    if (!content) {
      return res.apiError(
        '协议内容暂未配置，请稍后再试',
        'AGREEMENT_NOT_CONFIGURED',
        { doc_type: docType },
        404
      )
    }

    return res.apiSuccess(content, '获取协议成功')
  })
)

module.exports = router
