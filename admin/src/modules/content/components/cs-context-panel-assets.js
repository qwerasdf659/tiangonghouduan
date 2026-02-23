/**
 * C区面板 - 资产 Tab
 * @file admin/src/modules/content/components/cs-context-panel-assets.js
 */

import { buildURL, request, buildQueryString } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'

/**
 * 加载用户资产数据
 * @param {number} userId - 用户ID
 * @returns {Promise<Object|null>} 资产数据
 */
export async function loadAssets (userId) {
  const url = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_ASSETS, { userId }) + buildQueryString({ page_size: 10 })
  const res = await request({ url, method: 'GET' })
  return res.success ? res.data : null
}
