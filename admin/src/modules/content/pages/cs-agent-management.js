/**
 * 客服管理页面 - Alpine.js 组件
 *
 * @file admin/src/modules/content/pages/cs-agent-management.js
 * @description 客服座席管理和用户分配管理页面
 * @version 1.0.0
 * @date 2026-02-20
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import {
  useCsAgentManagementState,
  useCsAgentManagementMethods
} from '../composables/index.js'

/**
 * 创建客服管理页面组件
 * @returns {Object} Alpine.js 组件配置对象
 */
function csAgentManagementPage() {
  return {
    ...createPageMixin(),
    ...useCsAgentManagementState(),
    ...useCsAgentManagementMethods(),

    init() {
      logger.info('客服管理页面初始化')

      if (!this.checkAuth()) return

      this.loadAgents()
      this.loadWorkload()
    }
  }
}

document.addEventListener('alpine:init', () => {
  Alpine.data('csAgentManagementPage', csAgentManagementPage)
  logger.info('[CsAgentManagement] Alpine 组件已注册')
})
