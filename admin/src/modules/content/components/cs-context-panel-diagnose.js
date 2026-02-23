/**
 * C区面板 - 一键诊断
 * @file admin/src/modules/content/components/cs-context-panel-diagnose.js
 */

import { buildURL, request } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'

/**
 * 执行用户一键诊断
 * @param {number} userId - 用户ID
 * @returns {Promise<Object|null>} 诊断结果
 */
export async function runDiagnose (userId) {
  const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_DIAGNOSE, { userId })
  const res = await request({ url, method: 'GET' })
  return res.success ? res.data : null
}
