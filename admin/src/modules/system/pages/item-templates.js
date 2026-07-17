/**
 * 物品模板管理页面 Alpine.js 组件
 *
 * @file admin/src/modules/system/pages/item-templates.js
 * @module ItemTemplatesPage
 * @version 3.0.0
 * @date 2026-01-23
 * @author Admin System
 *
 * @description
 * 物品模板管理页面，提供以下功能：
 * - 物品模板列表展示和搜索筛选
 * - 物品模板的创建、编辑和删除
 * - 按类型、稀有度、状态筛选
 * - 模板统计信息展示
 *
 * @requires createCrudMixin - CRUD操作基础Mixin
 * @requires ASSET_ENDPOINTS - 资产API端点配置
 * @requires apiRequest - API请求工具函数
 * @requires showLoading - 显示全局loading
 * @requires hideLoading - 隐藏全局loading
 *
 * @example
 * // HTML中使用
 * <div x-data="itemTemplatesPage">
 *   <template x-for="template in templates">
 *     <div @click="editTemplate(template.item_template_id)">...</div>
 *   </template>
 * </div>
 */

import { logger, $confirmDanger } from '../../../utils/index.js'
import { ASSET_ENDPOINTS } from '../../../api/asset.js'
import { buildURL, request } from '../../../api/base.js'
import { createCrudMixin } from '../../../alpine/mixins/index.js'
import { itemTemplateFormMixin } from '../../../alpine/mixins/item-template-form.js'

// API请求封装
const apiRequest = async (url, options = {}) => {
  return await request({ url, ...options })
}

// 加载状态辅助函数（使用Alpine store或组件自身状态）
function showLoading() {
  if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('ui')) {
    try {
      Alpine.store('ui').setLoading(true)
    } catch (_e) {
      // 忽略
    }
  }
}

function hideLoading() {
  if (typeof Alpine !== 'undefined' && Alpine.store && Alpine.store('ui')) {
    try {
      Alpine.store('ui').setLoading(false)
    } catch (_e) {
      // 忽略
    }
  }
}

document.addEventListener('alpine:init', () => {
  // 使用 createCrudMixin 获取标准功能
  const baseMixin =
    typeof createCrudMixin === 'function'
      ? createCrudMixin({ enableFormValidation: true, enablePagination: false })
      : {}

  /**
   * 物品模板管理页面Alpine.js组件
   * @component itemTemplatesPage
   * @description 物品模板的CRUD管理组件
   * @mixes createCrudMixin
   *
   * @property {Array<Object>} templates - 物品模板列表
   * @property {Object} filters - 筛选条件
   * @property {Object} stats - 统计数据
   * @property {Object} form - 表单数据
   * @property {boolean} is_submitting - 是否正在提交
   * @property {Object} typeIcons - 类型图标映射
   * @property {Object} rarityLabels - 稀有度标签映射
   */
  Alpine.data('itemTemplatesPage', () => ({
    ...baseMixin,
    // 物品模板表单状态与方法（form/max_edition/attribute_rules/submitTemplate/
    // uploadTemplateImage/clearTemplateImage/getTypeIcon/getRarityLabel 等）来自公共 Mixin，
    // 与兑换市场「新增商品」弹窗共用同一份逻辑，避免重复
    ...itemTemplateFormMixin(),

    /** @type {boolean} 页面加载状态 */
    loading: false,

    /** @type {Array<Object>} 物品模板列表 */
    templates: [],
    filters: {
      type: '',
      rarity: '',
      status: '',
      search: ''
    },
    stats: {
      total: 0,
      types: 0,
      active: 0,
      rarities: 0
    },

    /**
     * 组件初始化方法
     * @description 组件挂载时自动调用，加载物品模板列表
     * @returns {void}
     */
    init() {
      this.loadTemplates()
    },

    /**
     * 表单保存成功钩子（覆盖 Mixin 默认空实现）：关闭弹窗 + 刷新列表
     * @param {Object} _created - 后端返回的已保存模板
     */
    onTemplateSaved(_created) {
      this.hideModal('templateModal')
      this.loadTemplates()
    },

    /**
     * 截断文本并添加省略号
     * @param {string} text - 原始文本
     * @param {number} maxLength - 最大长度
     * @returns {string} 截断后的文本
     * @example
     * truncateText('这是一个很长的文本', 5) // '这是一个很...'
     */
    truncateText(text, maxLength) {
      if (!text) return ''
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text
    },

    /**
     * 加载物品模板列表
     * @async
     * @description 根据筛选条件从后端获取物品模板列表
     * @returns {Promise<void>}
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATE_LIST
     */
    async loadTemplates() {
      this.loading = true
      showLoading()
      try {
        const params = new URLSearchParams()
        if (this.filters.type) params.append('item_type', this.filters.type)
        if (this.filters.rarity) params.append('rarity_code', this.filters.rarity)
        if (this.filters.status)
          params.append('is_enabled', this.filters.status === 'active' ? 'true' : 'false')
        if (this.filters.search) params.append('keyword', this.filters.search)

        const url =
          ASSET_ENDPOINTS.ITEM_TEMPLATE_LIST + (params.toString() ? `?${params.toString()}` : '')
        logger.info('请求物品模板列表:', url)
        const response = await apiRequest(url)
        logger.info('物品模板列表响应:', response)

        if (response && response.success) {
          this.templates = response.data.list || response.data.templates || []
          this.updateStats(response.data.pagination || {})
          logger.info('加载到物品模板:', this.templates.length, '个')
          // 搜索完成反馈
          const hasFilters =
            this.filters.type || this.filters.rarity || this.filters.status || this.filters.search
          if (hasFilters) {
            this.showInfo(`搜索完成，找到 ${this.templates.length} 个模板`)
          }
        } else {
          this.showError('加载失败', response?.message || '获取物品模板失败')
        }
      } catch (error) {
        logger.error('加载物品模板失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        this.loading = false
        hideLoading()
      }
    },

    /**
     * 更新统计信息
     * @param {Object} pagination - 分页信息对象
     * @param {number} [pagination.total_count] - 总数量
     * @description 根据当前模板列表计算统计数据
     * @returns {void}
     */
    updateStats(pagination) {
      this.stats.total = pagination.total_count || this.templates.length
      this.stats.types = new Set(this.templates.map(t => t.item_type)).size
      this.stats.active = this.templates.filter(t => t.is_enabled).length
      this.stats.rarities =
        new Set(this.templates.map(t => t.rarity_code).filter(Boolean)).size || '-'
    },

    /**
     * 重置筛选条件
     * @description 清空所有筛选条件并重新加载列表
     * @returns {void}
     */
    resetFilters() {
      logger.info('[resetFilters] 重置筛选条件')
      this.filters = {
        type: '',
        rarity: '',
        status: '',
        search: ''
      }
      this.loadTemplates()
      this.showInfo('筛选条件已重置')
    },

    /**
     * 打开创建模板模态框
     * @description 重置表单并显示创建模板的模态框
     * @returns {void}
     */
    openCreateModal() {
      this.resetTemplateForm() // 来自公共 Mixin：清空表单 + 默认属性规则 + 清预览图
      this.showModal('templateModal')
    },

    /**
     * 编辑物品模板
     * @async
     * @param {number|string} templateId - 模板ID
     * @description 获取模板详情并填充到表单中，然后显示编辑模态框
     * @returns {Promise<void>}
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATE_DETAIL
     */
    async editTemplate(templateId) {
      this.loading = true
      showLoading()
      try {
        const response = await apiRequest(
          buildURL(ASSET_ENDPOINTS.ITEM_TEMPLATE_DETAIL, { id: templateId })
        )
        if (response && response.success) {
          const t = response.data
          const metaObj = t.meta || {}
          const metaCopy = { ...metaObj }
          delete metaCopy.use_instructions
          delete metaCopy.allowed_actions
          delete metaCopy.max_edition
          delete metaCopy.attribute_rules

          this.max_edition =
            t.max_edition != null
              ? Number(t.max_edition)
              : metaObj.max_edition != null
                ? Number(metaObj.max_edition)
                : null
          this.attribute_rules = this.normalizeAttributeRules(metaObj.attribute_rules)

          this.form = {
            template_id: t.item_template_id,
            display_name: t.display_name || '',
            template_code: t.template_code || '',
            item_type: t.item_type || 'voucher',
            rarity_code: t.rarity_code || 'common',
            is_enabled: t.is_enabled,
            primary_media_id: t.primary_media_id ?? null,
            reference_price_points: t.reference_price_points || 0,
            value_tier: t.value_tier || 'low',
            description: t.description || '',
            meta: Object.keys(metaCopy).length > 0 ? JSON.stringify(metaCopy, null, 2) : '',
            use_instructions: metaObj.use_instructions || '',
            allowed_actions: metaObj.allowed_actions || []
          }
          this.image_preview_url = t.public_url || null
          this.showModal('templateModal')
        } else {
          this.showError('加载失败', response?.message || '获取模板详情失败')
        }
      } catch (error) {
        logger.error('加载模板详情失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        this.loading = false
        hideLoading()
      }
    },

    /**
     * 删除物品模板
     * @async
     * @param {number|string} templateId - 模板ID
     * @description 确认后删除指定的物品模板
     * @returns {Promise<void>}
     * @fires ASSET_ENDPOINTS.ITEM_TEMPLATE_DELETE
     */
    async deleteTemplate(templateId) {
      if (!(await $confirmDanger('确定要删除此物品模板吗？此操作不可恢复！'))) return

      this.loading = true
      showLoading()
      try {
        const response = await apiRequest(
          buildURL(ASSET_ENDPOINTS.ITEM_TEMPLATE_DELETE, { id: templateId }),
          {
            method: 'DELETE'
          }
        )

        if (response && response.success) {
          this.showSuccess('删除成功')
          this.loadTemplates()
        } else {
          this.showError('删除失败', response?.message || '操作失败')
        }
      } catch (error) {
        logger.error('删除模板失败:', error)
        this.showError('删除失败', error.message)
      } finally {
        this.loading = false
        hideLoading()
      }
    },

    /**
     * 显示成功提示消息
     * @param {string} message - 成功消息内容
     * @returns {void}
     */
    showSuccess(message) {
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').success(message)
      } else if (typeof showToast === 'function') {
        showToast(message, 'success')
      } else {
        logger.info('', message)
      }
    },

    /**
     * 显示信息提示消息
     * @param {string} message - 信息消息内容
     * @returns {void}
     */
    showInfo(message) {
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').info(message)
      } else if (typeof showToast === 'function') {
        showToast(message, 'info')
      } else {
        logger.info('', message)
      }
    },

    /**
     * 显示错误提示消息
     * @param {string} title - 错误标题
     * @param {string} [message] - 错误详情（可选）
     * @returns {void}
     */
    showError(title, message) {
      const fullMessage = message ? `${title}: ${message}` : title
      if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
        Alpine.store('notification').error(fullMessage)
      } else if (typeof showToast === 'function') {
        showToast(fullMessage, 'error')
      } else {
        logger.error('❌', fullMessage)
      }
    }
  }))
})
