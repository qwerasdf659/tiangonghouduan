/**
 * C区面板 - 风控 Tab
 * @file admin/src/modules/content/components/cs-context-panel-risk.js
 */

import { buildURL, request } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'

/**
 * 加载用户风控数据
 * @param {number} userId - 用户ID
 * @returns {Promise<Object|null>} 风控数据
 */
export async function loadRisk (userId) {
  const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_RISK, { userId })
  const res = await request({ url, method: 'GET' })
  return res.success ? res.data : null
}
