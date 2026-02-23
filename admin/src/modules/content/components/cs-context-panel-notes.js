/**
 * C区面板 - 备注/工单 Tab
 * @file admin/src/modules/content/components/cs-context-panel-notes.js
 */

import { buildURL, request, buildQueryString } from '../../../api/base.js'
import { CONTENT_ENDPOINTS } from '../../../api/content.js'

/**
 * 加载用户内部备注和工单数据
 * @param {number} userId - 用户ID
 * @returns {Promise<{notes: Array, issues: Array}>} 备注和工单列表
 */
export async function loadNotes (userId) {
  const notesUrl = buildURL(CONTENT_ENDPOINTS.CS_USER_CONTEXT_NOTES, { userId }) + buildQueryString({ page_size: 50 })
  const issuesUrl = CONTENT_ENDPOINTS.CS_ISSUE_LIST + buildQueryString({ user_id: userId, page_size: 50 })
  const [notesRes, issuesRes] = await Promise.all([
    request({ url: notesUrl, method: 'GET' }),
    request({ url: issuesUrl, method: 'GET' })
  ])
  return {
    notes: notesRes.success ? (notesRes.data?.rows || []) : [],
    issues: issuesRes.success ? (issuesRes.data?.rows || []) : []
  }
}
