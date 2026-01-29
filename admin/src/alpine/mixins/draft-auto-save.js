/**
 * 表单草稿自动保存 Mixin
 * @description 为任何编辑表单添加草稿自动保存功能，防止数据丢失
 * @version 1.0.0
 * @date 2026-01-25
 */

import { logger } from '../../utils/logger.js'

/**
 * 创建草稿自动保存 Mixin
 * @param {string} componentName - 组件名称，用于生成唯一的存储键
 * @returns {Object} Mixin 对象
 */
export function withDraftAutoSave(componentName) {
  const draftKey = `draft_${componentName}`

  return {
    // 草稿保存的键名
    _draftKey: draftKey,
    // 记录当前编辑的记录ID
    _draftRecordId: null,
    // 上次保存时间
    _lastSaveTime: null,
    // 是否有未保存的变更
    _hasUnsavedChanges: false,

    /**
     * 初始化草稿功能
     * @param {string|number} recordId - 当前编辑的记录ID（新建时为 'new'）
     */
    initDraft(recordId = 'new') {
      this._draftRecordId = recordId
      this.restoreDraft()
    },

    /**
     * 恢复草稿
     * @returns {Object|null} 恢复的草稿数据
     */
    restoreDraft() {
      try {
        const draft = localStorage.getItem(this._draftKey)
        if (!draft) return null

        const saved = JSON.parse(draft)
        const savedTime = new Date(saved.savedAt)
        const hours = (new Date() - savedTime) / 1000 / 60 / 60

        // 24小时过期
        if (hours > 24) {
          localStorage.removeItem(this._draftKey)
          logger.debug('📝 草稿已过期，已清除')
          return null
        }

        // 检查是否是同一条记录
        if (saved.recordId !== this._draftRecordId) {
          return null
        }

        logger.debug(`📝 恢复草稿（${Math.round(hours * 60)}分钟前保存）`)
        this._lastSaveTime = savedTime
        return saved.formData
      } catch (e) {
        logger.warn('草稿恢复失败', e)
        return null
      }
    },

    /**
     * 保存草稿
     * @param {Object} formData - 要保存的表单数据
     */
    saveDraft(formData) {
      try {
        const now = new Date()
        localStorage.setItem(
          this._draftKey,
          JSON.stringify({
            recordId: this._draftRecordId,
            formData: formData,
            savedAt: now.toISOString()
          })
        )
        this._lastSaveTime = now
        this._hasUnsavedChanges = false
        logger.debug('💾 草稿已保存')
      } catch (e) {
        logger.warn('草稿保存失败', e)
      }
    },

    /**
     * 清除草稿
     */
    clearDraft() {
      localStorage.removeItem(this._draftKey)
      this._hasUnsavedChanges = false
      logger.debug('🗑️ 草稿已清除')
    },

    /**
     * 检查是否有草稿
     * @returns {boolean}
     */
    hasDraft() {
      return localStorage.getItem(this._draftKey) !== null
    },

    /**
     * 获取草稿保存时间的显示文本
     * @returns {string}
     */
    getDraftTimeText() {
      if (!this._lastSaveTime) return ''

      const now = new Date()
      const diffMs = now - this._lastSaveTime
      const diffMinutes = Math.floor(diffMs / 60000)

      if (diffMinutes < 1) return '刚刚保存'
      if (diffMinutes < 60) return `${diffMinutes}分钟前保存`

      const diffHours = Math.floor(diffMinutes / 60)
      return `${diffHours}小时前保存`
    },

    /**
     * 标记有未保存的变更
     */
    markAsChanged() {
      this._hasUnsavedChanges = true
    },

    /**
     * 检查是否有未保存的变更
     * @returns {boolean}
     */
    hasUnsavedChanges() {
      return this._hasUnsavedChanges
    }
  }
}

/**
 * 创建带草稿保存功能的表单 Mixin 工厂函数
 * @param {string} formName - 表单名称
 * @param {Object} defaultFormData - 默认表单数据
 * @returns {Object} 完整的表单 Mixin
 */
export function createDraftFormMixin(formName, defaultFormData = {}) {
  return {
    // 表单数据
    formData: { ...defaultFormData },
    // 混入草稿保存功能
    ...withDraftAutoSave(formName),

    /**
     * 打开编辑弹窗
     * @param {Object} record - 要编辑的记录
     */
    openEdit(record = null) {
      const recordId = record?.id || 'new'
      this.initDraft(recordId)

      // 尝试恢复草稿
      const draftData = this.restoreDraft()
      if (draftData) {
        this.formData = draftData
      } else if (record) {
        this.formData = { ...record }
      } else {
        this.formData = { ...defaultFormData }
      }
    },

    /**
     * 表单数据变更处理（带防抖）
     */
    onFormChange() {
      this.markAsChanged()
      // 防抖保存将由模板中的 @input.debounce.500ms 处理
    },

    /**
     * 保存表单草稿
     */
    saveFormDraft() {
      this.saveDraft(this.formData)
    },

    /**
     * 提交成功后清理
     */
    onSubmitSuccess() {
      this.clearDraft()
    },

    /**
     * 取消编辑
     * @returns {boolean} 是否确认取消
     */
    confirmCancel() {
      if (this.hasUnsavedChanges() && this.hasDraft()) {
        return confirm('是否保留草稿？下次打开时可恢复。')
      }
      return true
    },

    /**
     * 强制取消（不保留草稿）
     */
    forceCancel() {
      this.clearDraft()
    }
  }
}

export default {
  withDraftAutoSave,
  createDraftFormMixin
}
