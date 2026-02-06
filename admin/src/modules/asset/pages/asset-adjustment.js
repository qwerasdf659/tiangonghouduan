/**
 * 通用资产调整页面 - Alpine.js 组件
 *
 * @file admin/src/modules/asset/pages/asset-adjustment.js
 * @description 管理员资产调整页面，提供用户资产的查询、调整、记录查看等功能
 * @version 3.1.0 (Composable 重构版)
 * @date 2026-02-06
 * @module AssetAdjustment
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createCrudMixin } from '../../../alpine/index.js'
import { userResolverMixin } from '../../../alpine/mixins/user-resolver.js'
import { useAdjustmentState, useAdjustmentMethods } from '../composables/index.js'

/**
 * 创建资产调整页面组件
 * @returns {Object} Alpine.js组件配置对象
 */
function assetAdjustmentPage() {
  const baseMixin =
    typeof createCrudMixin === 'function'
      ? createCrudMixin({ page_size: 20, enableFormValidation: true })
      : {}

  return {
    ...baseMixin,
    ...userResolverMixin(),

    // ==================== Composables ====================
    ...useAdjustmentState(),
    ...useAdjustmentMethods(),

    // ==================== 生命周期 ====================

    async init() {
      logger.info('初始化资产调整页面 (Composable版)...')

      // 初始化openModals为Set
      this.openModals = new Set()

      // 调用 Mixin 的初始化
      if (baseMixin.init) {
        baseMixin.init.call(this)
      }

      // 检查登录状态
      if (typeof this.checkAuth === 'function') {
        if (!this.checkAuth()) return
      }

      // 加载当前登录的管理员信息
      this.loadAdminUserInfo()

      // 加载资产类型
      await this.loadAssetTypes()

      // 加载活动列表
      await this.loadCampaigns()

      logger.info('资产调整页面初始化完成')
    }
  }
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('assetAdjustmentPage', assetAdjustmentPage)
  logger.info('[AssetAdjustmentPage] Alpine 组件已注册')
})
