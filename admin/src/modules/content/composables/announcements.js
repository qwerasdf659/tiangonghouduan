/**
 * 公告管理 - Composable
 *
 * @file admin/src/modules/content/composables/announcements.js
 * @description 从 content-management.js 提取的公告管理状态和方法
 * @version 1.0.0
 * @date 2026-02-06
 */

import { logger } from '../../../utils/logger.js'
import { buildURL } from '../../../api/base.js'
import { SYSTEM_ENDPOINTS } from '../../../api/system/index.js'

/**
 * 公告管理状态
 * @returns {Object} 状态对象
 */
export function useAnnouncementsState() {
  return {
    /** 公告列表 */
    announcements: [],
    /** 公告统计 */
    announcementStats: { total: 0 },
    /** 公告表单 */
    announcementForm: {
      announcement_id: null,
      title: '',
      content: '',
      type: 'notice',
      priority: 'medium',
      status: 'published',
      expires_at: ''
    }
  }
}

/**
 * 公告管理方法
 * @returns {Object} 方法对象
 */
export function useAnnouncementsMethods() {
  return {
    async loadAnnouncements() {
      try {
        logger.info('[ContentManagement] 加载公告列表...')
        const response = await this.apiGet(SYSTEM_ENDPOINTS.ANNOUNCEMENT_LIST)
        if (response?.success) {
          this.announcements = response.data?.announcements || []
          this.announcementStats = { total: response.data?.total || this.announcements.length }
          logger.info('[ContentManagement] 公告数量:', this.announcements.length)
        }
      } catch (error) {
        logger.error('加载公告失败:', error)
        this.announcements = []
      }
    },

    openCreateAnnouncementModal() {
      this.isEditMode = false
      this.announcementForm = {
        announcement_id: null,
        title: '',
        content: '',
        type: 'notice',
        priority: 'medium',
        status: 'published',
        expires_at: ''
      }
      this.showModal('announcementModal')
    },

    editAnnouncement(ann) {
      this.isEditMode = true
      this.announcementForm = {
        announcement_id: ann.announcement_id,
        title: ann.title || '',
        content: ann.content || '',
        type: ann.type || 'notice',
        priority: ann.priority || 'medium',
        status: ann.is_active ? 'published' : 'draft',
        expires_at: ann.expires_at || ''
      }
      this.showModal('announcementModal')
    },

    async saveAnnouncement() {
      if (!this.announcementForm.title?.trim()) {
        this.showError('请输入公告标题')
        return
      }
      if (!this.announcementForm.content?.trim()) {
        this.showError('请输入公告内容')
        return
      }

      this.saving = true
      try {
        const payload = {
          title: this.announcementForm.title.trim(),
          content: this.announcementForm.content.trim(),
          type: this.announcementForm.type,
          priority: this.announcementForm.priority,
          is_active: this.announcementForm.status === 'published',
          expires_at: this.announcementForm.expires_at || null
        }

        const url = this.isEditMode
          ? buildURL(SYSTEM_ENDPOINTS.ANNOUNCEMENT_UPDATE, {
              id: this.announcementForm.announcement_id
            })
          : SYSTEM_ENDPOINTS.ANNOUNCEMENT_CREATE
        const method = this.isEditMode ? 'PUT' : 'POST'

        const response = await this.apiCall(url, { method, data: payload })

        if (response?.success) {
          this.hideModal('announcementModal')
          await this.loadAnnouncements()
          this.showSuccess(this.isEditMode ? '公告已更新' : '公告已发布')
        }
      } catch (error) {
        logger.error('保存公告失败:', error)
        this.showError('保存公告失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    async deleteAnnouncement(ann) {
      this.deleteTarget = ann
      this.deleteType = 'announcement'
      this.showModal('deleteModal')
    }
  }
}
