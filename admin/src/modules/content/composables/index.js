/**
 * 内容管理模块 - Composables 导出汇总
 *
 * 内容投放合并后，公告/弹窗/轮播管理已统一到 ad-management 页面
 * 此处只保留图片资源、客服、反馈、座席管理模块
 *
 * @file admin/src/modules/content/composables/index.js
 * @version 3.0.0
 * @date 2026-02-22
 */

// 图片资源管理模块
import { useImagesState, useImagesMethods } from './images.js'

// 客服工作台模块
import { useCustomerServiceState, useCustomerServiceMethods } from './customer-service.js'

// 反馈管理模块（P1-5）
import { useFeedbackState, useFeedbackMethods } from './feedback.js'

// 客服座席管理模块
import { useCsAgentManagementState, useCsAgentManagementMethods } from './cs-agent-management.js'

export { useImagesState, useImagesMethods }
export { useCustomerServiceState, useCustomerServiceMethods }
export { useFeedbackState, useFeedbackMethods }
export { useCsAgentManagementState, useCsAgentManagementMethods }
