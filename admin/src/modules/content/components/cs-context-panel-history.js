/**
 * C区面板 - 历史会话 Tab
 * @file admin/src/modules/content/components/cs-context-panel-history.js
 */

import { buildURL, request, buildQueryString } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'

/**
 * 加载用户历史会话数据
 * @param {number} userId - 用户ID
 * @returns {Promise<Object|null>} 历史会话数据
 */
export async function loadHistory (userId) {
  const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_HISTORY, { userId }) + buildQueryString({ page_size: 10 })
  const res = await request({ url, method: 'GET' })
  return res.success ? res.data : null
}
