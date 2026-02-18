/**
 * 内容管理模块 - Composables 导出汇总
 *
 * @file admin/src/modules/content/composables/index.js
 * @description 导出所有子模块，便于主模块组合使用
 * @version 2.0.0
 * @date 2026-02-18
 */

// 公告管理模块
import { useAnnouncementsState, useAnnouncementsMethods } from './announcements.js'

// 弹窗管理模块（popup_banners）
import { useBannersState, useBannersMethods } from './banners.js'

// 轮播图管理模块（carousel_items 独立表）
import { useCarouselItemsState, useCarouselItemsMethods } from './carousel-items.js'

// 图片资源管理模块
import { useImagesState, useImagesMethods } from './images.js'

// 客服工作台模块
import { useCustomerServiceState, useCustomerServiceMethods } from './customer-service.js'

// 反馈管理模块（P1-5）
import { useFeedbackState, useFeedbackMethods } from './feedback.js'

export { useAnnouncementsState, useAnnouncementsMethods }
export { useBannersState, useBannersMethods }
export { useCarouselItemsState, useCarouselItemsMethods }
export { useImagesState, useImagesMethods }
export { useCustomerServiceState, useCustomerServiceMethods }
export { useFeedbackState, useFeedbackMethods }

/**
 * 组合所有内容管理状态（content-management.js 使用）
 * @returns {Object} 合并后的状态对象
 */
export function useAllContentManagementState() {
  return {
    ...useAnnouncementsState(),
    ...useBannersState(),
    ...useCarouselItemsState(),
    ...useImagesState()
  }
}

/**
 * 组合所有内容管理方法（content-management.js 使用）
 * @returns {Object} 合并后的方法对象
 */
export function useAllContentManagementMethods() {
  return {
    ...useAnnouncementsMethods(),
    ...useBannersMethods(),
    ...useCarouselItemsMethods(),
    ...useImagesMethods()
  }
}
