/**
 * C区面板 - 交易 Tab
 * @file admin/src/modules/content/components/cs-context-panel-trades.js
 */

import { buildURL, request, buildQueryString } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'

/**
 * 加载用户交易数据
 * @param {number} userId - 用户ID
 * @returns {Promise<Object|null>} 交易数据
 */
export async function loadTrades (userId) {
  const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_TRADES, { userId }) + buildQueryString({ page_size: 10 })
  const res = await request({ url, method: 'GET' })
  return res.success ? res.data : null
}
