/**
 * C区面板 - 时间线 Tab
 * @file admin/src/modules/content/components/cs-context-panel-timeline.js
 */

import { buildURL, request, buildQueryString } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'

/**
 * 加载用户时间线数据
 * @param {number} userId - 用户ID
 * @returns {Promise<Object|null>} 时间线数据
 */
export async function loadTimeline (userId) {
  const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_TIMELINE, { userId }) + buildQueryString({ page_size: 20 })
  const res = await request({ url, method: 'GET' })
  return res.success ? res.data : null
}
