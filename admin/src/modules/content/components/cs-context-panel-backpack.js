/**
 * C区面板 - 背包 Tab
 * @file admin/src/modules/content/components/cs-context-panel-backpack.js
 */

import { buildURL, request, buildQueryString } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'

/**
 * 加载用户背包数据
 * @param {number} userId - 用户ID
 * @returns {Promise<Object|null>} 背包数据
 */
export async function loadBackpack (userId) {
  const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_BACKPACK, { userId }) + buildQueryString({ page_size: 20 })
  const res = await request({ url, method: 'GET' })
  return res.success ? res.data : null
}
