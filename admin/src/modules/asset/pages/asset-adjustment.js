/**
 * 通用资产调整页面 - Alpine.js 组件
 *
 * @file admin/src/modules/asset/pages/asset-adjustment.js
 * @description 管理员资产调整页面，提供用户资产的查询、调整、记录查看等功能
 * @version 3.2.0 (修复 getter 与 spread 运算符冲突)
 * @date 2026-02-15
 * @module AssetAdjustment
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createCrudMixin } from '../../../alpine/index.js'
import { userResolverMixin } from '../../../alpine/mixins/user-resolver.js'
import { useAdjustmentState, useAdjustmentMethods } from '../composables/index.js'

/**
 * 创建资产调整页面组件
 *
 * 重要说明：
 * useAdjustmentMethods() 包含 JavaScript getters（aggregatedBalances、visiblePages 等）。
 * 使用 `{...obj}` 展开含 getter 的对象时，JavaScript 会 **调用** getter 并复制返回值，
 * 而非保留 getter 描述符。此时 getter 中的 `this` 指向源对象（缺少 state 属性），导致运行时错误。
 *
 * 解决方案：使用 Object.defineProperties + Object.getOwnPropertyDescriptors 替代展开运算符，
 * 正确保留 getter 描述符，使 `this` 在运行时指向最终组合对象。
 *
 * @returns {Object} Alpine.js组件配置对象
 */
function assetAdjustmentPage() {
  let baseMixin = {}
  try {
    baseMixin = typeof createCrudMixin === 'function'
      ? createCrudMixin({ page_size: 20, enableFormValidation: true })
      : {}
  } catch (e) {
    logger.error('[AssetAdjustmentPage] createCrudMixin 失败:', e.message)
  }

  const userResolver = userResolverMixin()
  const adjustmentState = useAdjustmentState()
  const adjustmentMethods = useAdjustmentMethods()

  // 第1步：展开不含 getter 的对象（纯数据和普通方法）
  const result = {
    ...baseMixin,
    ...userResolver,
    ...adjustmentState
  }

  // 第2步：使用 defineProperties 正确复制含 getter 的方法对象
  // 这样 getter 的 this 在运行时指向 result 而非 adjustmentMethods
  Object.defineProperties(result, Object.getOwnPropertyDescriptors(adjustmentMethods))

  // 第3步：定义 init 方法
  result.init = async function () {
    logger.info('初始化资产调整页面...')

    // 初始化openModals为Set
    this.openModals = new Set()

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

  return result
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('assetAdjustmentPage', assetAdjustmentPage)
  logger.info('[AssetAdjustmentPage] Alpine 组件已注册')
})
