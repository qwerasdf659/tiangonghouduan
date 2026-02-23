/**
 * 内容管理模块 - Composables 导出汇总
 *
 * 内容投放合并后，公告/弹窗/轮播管理已统一到 ad-management 页面
 * 此处保留图片资源、客服（含GM工具）、反馈、座席管理模块
 *
 * @file admin/src/modules/content/composables/index.js
 * @version 4.0.0
 * @date 2026-02-22
 */

// 图片资源管理模块
import { useImagesState, useImagesMethods } from './images.js'

// 客服工作台核心模块（会话管理、消息收发、WebSocket）
import { useCustomerServiceState, useCustomerServiceMethods } from './customer-service.js'

// 客服工作台 - C区 用户上下文面板（8Tab数据查询+诊断+工单+备注）
import { useUserContextState, useUserContextMethods } from './cs-user-context.js'

// 客服工作台 - 顶部工作状态栏（SLA告警、工单统计）
import { useCsWorkStatusState, useCsWorkStatusMethods } from './cs-work-status.js'

// 客服工作台 - 补偿工具（GM操作：资产/物品发放）
import { useCsCompensationState, useCsCompensationMethods } from './cs-compensation.js'

// 客服工作台 - 消息模板库（知识库雏形，分类快捷回复）
import { useCsTemplatesState, useCsTemplatesMethods } from './cs-templates.js'

// 客服工作台 - 一键诊断（并行检查5个模块异常状态）
import { useCsDiagnosisState, useCsDiagnosisMethods } from './cs-diagnosis.js'

// 客服工作台 - 工单管理（问题生命周期跟踪）
import { useCsIssuesState, useCsIssuesMethods } from './cs-issues.js'

// 反馈管理模块
import { useFeedbackState, useFeedbackMethods } from './feedback.js'

// 客服座席管理模块
import { useCsAgentManagementState, useCsAgentManagementMethods } from './cs-agent-management.js'

export { useImagesState, useImagesMethods }
export { useCustomerServiceState, useCustomerServiceMethods }
export { useUserContextState, useUserContextMethods }
export { useCsWorkStatusState, useCsWorkStatusMethods }
export { useCsCompensationState, useCsCompensationMethods }
export { useCsTemplatesState, useCsTemplatesMethods }
export { useCsDiagnosisState, useCsDiagnosisMethods }
export { useCsIssuesState, useCsIssuesMethods }
export { useFeedbackState, useFeedbackMethods }
export { useCsAgentManagementState, useCsAgentManagementMethods }
