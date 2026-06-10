/**
 * 协议正文配置管理 - Composable（ADM-1 / 合规硬项 A-2）
 *
 * @file admin/src/modules/system/composables/agreement-config.js
 * @description 用户协议 / 隐私政策正文的状态管理与读写（分段结构编辑，契约 sections:[{heading?,text}]）
 * @version 1.0.0
 * @date 2026-06-09
 *
 * 字段契约（与后端 routes/v4/console/system/agreement-config.js 及 C 端只读接口一致）：
 *   { title, updated_at, version?, sections:[{ heading?, text }] }
 */

import { API_PREFIX } from '../../../api/base.js'
import { logger } from '../../../utils/logger.js'

/** 管理后台协议配置 API 端点 */
export const AGREEMENT_CONFIG_ENDPOINT = `${API_PREFIX}/console/system/agreement-config`

/** 协议类型与中文名（用于 Tab 切换与提示） */
export const AGREEMENT_DOC_TYPES = [
  { key: 'user_agreement', name: '用户协议' },
  { key: 'privacy_policy', name: '隐私政策' }
]

/**
 * 创建一份空协议草稿（新建/无数据时使用）
 * @param {string} name - 协议中文名（作为默认标题）
 * @returns {Object} 空协议结构
 */
function createEmptyDoc(name) {
  return {
    title: name,
    version: '',
    sections: [{ heading: '', text: '' }]
  }
}

/**
 * 协议正文配置 - 状态
 * @returns {Object} Alpine 响应式状态
 */
export function useAgreementConfigState() {
  return {
    /** @type {string} 当前编辑的协议类型（user_agreement / privacy_policy） */
    activeDocType: 'user_agreement',

    /** @type {Object} 两份协议的编辑态 { user_agreement: {...}, privacy_policy: {...} } */
    docs: {
      user_agreement: createEmptyDoc('用户协议'),
      privacy_policy: createEmptyDoc('隐私政策')
    },

    /** @type {Object} 两份协议的最后更新时间 { user_agreement, privacy_policy } */
    docUpdatedAt: {
      user_agreement: null,
      privacy_policy: null
    },

    /** @type {Object|null} 原始数据快照（用于重置/检测修改） */
    originalDocs: null,

    /** @type {boolean} 加载中 */
    configLoading: false,

    /** @type {boolean} 保存中 */
    saving: false,

    /** @type {boolean} 当前协议已修改 */
    configModified: false
  }
}

/**
 * 协议正文配置 - 方法
 * @returns {Object} Alpine 方法集合
 */
export function useAgreementConfigMethods() {
  return {
    /**
     * 加载两份协议正文
     */
    async loadAgreementConfig() {
      this.configLoading = true
      try {
        const response = await this.apiGet(AGREEMENT_CONFIG_ENDPOINT)
        if (response?.success && response.data) {
          // 后端无数据时下发 null，用空草稿兜底，保证编辑器有结构
          AGREEMENT_DOC_TYPES.forEach(({ key, name }) => {
            const remote = response.data[key]
            if (remote && Array.isArray(remote.sections) && remote.sections.length > 0) {
              this.docs[key] = {
                title: remote.title || name,
                version: remote.version || '',
                sections: remote.sections.map(s => ({
                  heading: s.heading || '',
                  text: s.text || ''
                }))
              }
              this.docUpdatedAt[key] = remote.updated_at || null
            } else {
              this.docs[key] = createEmptyDoc(name)
              this.docUpdatedAt[key] = null
            }
          })
          this.originalDocs = JSON.parse(JSON.stringify(this.docs))
          this.configModified = false
          logger.info('[AgreementConfig] 协议配置加载成功')
        } else {
          this.showError(response?.message || '加载协议配置失败')
        }
      } catch (error) {
        logger.error('[AgreementConfig] 加载配置失败', error)
        this.showError('加载协议配置失败: ' + error.message)
      } finally {
        this.configLoading = false
      }
    },

    /**
     * 保存当前协议（按 activeDocType）
     */
    async saveAgreementConfig() {
      const docType = this.activeDocType
      const doc = this.docs[docType]

      const errors = this.validateDocLocal(doc)
      if (errors.length > 0) {
        this.showError('协议校验失败：\n' + errors.join('\n'))
        return
      }

      this.saving = true
      try {
        const payload = {
          title: doc.title.trim(),
          version: doc.version || null,
          // 过滤空段落，heading 可空（去空白）
          sections: doc.sections
            .filter(s => s.text && s.text.trim() !== '')
            .map(s => ({
              heading: s.heading && s.heading.trim() !== '' ? s.heading.trim() : undefined,
              text: s.text.trim()
            }))
        }
        const response = await this.apiPut(`${AGREEMENT_CONFIG_ENDPOINT}/${docType}`, payload)
        if (response?.success) {
          this.docUpdatedAt[docType] = response.data?.updated_at || null
          this.originalDocs = JSON.parse(JSON.stringify(this.docs))
          this.configModified = false
          const name = AGREEMENT_DOC_TYPES.find(d => d.key === docType)?.name || '协议'
          this.showSuccess(`${name}保存成功，小程序协议页下次打开自动生效`)
          logger.info('[AgreementConfig] 协议保存成功', { docType })
        } else {
          const errorDetail = response?.data?.errors?.join('\n') || response?.message || '保存失败'
          this.showError('保存失败: ' + errorDetail)
        }
      } catch (error) {
        logger.error('[AgreementConfig] 保存配置失败', error)
        this.showError('保存协议失败: ' + error.message)
      } finally {
        this.saving = false
      }
    },

    /**
     * 本地校验（与后端 validateAgreementContent 同口径）
     * @param {Object} doc - 协议草稿
     * @returns {string[]} 错误信息数组
     */
    validateDocLocal(doc) {
      const errors = []
      if (!doc || typeof doc !== 'object') {
        return ['协议数据异常']
      }
      if (!doc.title || doc.title.trim() === '') {
        errors.push('协议标题不能为空')
      }
      const validSections = (doc.sections || []).filter(s => s.text && s.text.trim() !== '')
      if (validSections.length === 0) {
        errors.push('至少需要一段非空正文')
      }
      return errors
    },

    /**
     * 切换编辑的协议类型
     * @param {string} docType - user_agreement / privacy_policy
     */
    switchDocType(docType) {
      if (this.configModified) {
        if (!confirm('当前协议有未保存的修改，切换将丢失修改，确定继续？')) {
          return
        }
        // 放弃修改：从原始快照恢复
        if (this.originalDocs) {
          this.docs = JSON.parse(JSON.stringify(this.originalDocs))
        }
        this.configModified = false
      }
      this.activeDocType = docType
    },

    /**
     * 新增一段正文
     */
    addSection() {
      this.docs[this.activeDocType].sections.push({ heading: '', text: '' })
      this.markConfigModified()
    },

    /**
     * 删除指定段落
     * @param {number} index - 段落下标
     */
    removeSection(index) {
      const sections = this.docs[this.activeDocType].sections
      if (sections.length <= 1) {
        this.showInfo('至少保留一段正文')
        return
      }
      sections.splice(index, 1)
      this.markConfigModified()
    },

    /**
     * 重置当前协议到上次加载的值
     */
    resetAgreementConfig() {
      if (this.originalDocs) {
        this.docs = JSON.parse(JSON.stringify(this.originalDocs))
        this.configModified = false
        this.showInfo('协议已重置')
      }
    },

    /**
     * 标记已修改
     */
    markConfigModified() {
      this.configModified = true
    }
  }
}
