/**
 * 客服工作台 - 消息模板库 Composable
 *
 * @file admin/src/modules/content/composables/cs-templates.js
 * @description 知识库雏形，分类快捷回复模板
 * 从 system_configs(config_key='cs_reply_templates') 加载
 */

import { logger } from '../../../utils/logger.js'
import { ContentAPI } from '../../../api/content.js'

/**
 * 消息模板状态
 * @returns {Object} 状态对象
 */
export function useCsTemplatesState () {
  return {
    /** @type {Array} 模板分类列表 [{ category, templates: [{title, content}] }] */
    templateCategories: [],
    /** @type {boolean} 加载中 */
    templatesLoading: false,
    /** @type {boolean} 模板面板显示状态 */
    showTemplatePanel: false,
    /** @type {string} 搜索过滤关键词 */
    templateFilter: ''
  }
}

/**
 * 消息模板方法
 * @returns {Object} 方法对象
 */
export function useCsTemplatesMethods () {
  return {
    /** 加载消息模板库（从 system_configs 获取） */
    async loadTemplates () {
      this.templatesLoading = true
      try {
        const response = await ContentAPI.getMessageTemplates()
        if (response?.success) {
          this.templateCategories = response.data?.categories || response.data || []
        }
      } catch (error) {
        logger.error('[Templates] 加载消息模板失败:', error)
      } finally {
        this.templatesLoading = false
      }
    },

    /** 切换模板面板显示/隐藏 */
    toggleTemplatePanel () {
      this.showTemplatePanel = !this.showTemplatePanel
      if (this.showTemplatePanel && !this.templateCategories.length) {
        this.loadTemplates()
      }
    },

    /**
     * 选择模板内容插入到消息输入框
     * @param {string} content - 模板文本
     */
    selectTemplate (content) {
      this.messageInput = content
      this.showTemplatePanel = false
    },

    /**
     * 获取按关键词过滤后的模板列表
     * @returns {Array} 过滤结果
     */
    getFilteredTemplates () {
      if (!this.templateFilter) return this.templateCategories
      const keyword = this.templateFilter.toLowerCase()
      return this.templateCategories
        .map(cat => ({
          ...cat,
          items: (cat.items || []).filter(
            t => t.title?.toLowerCase().includes(keyword) || t.content?.toLowerCase().includes(keyword)
          )
        }))
        .filter(cat => cat.items.length > 0)
    }
  }
}
