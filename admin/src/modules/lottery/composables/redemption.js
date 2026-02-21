/**
 * 核销码管理模块 - 已迁移到运营管理模块
 *
 * @file admin/src/modules/lottery/composables/redemption.js
 * @description 核销码管理功能已迁移至 admin/src/modules/operations/pages/redemption-management.js
 *              此文件仅保留空壳接口以维持 composables/index.js 的兼容性。
 *              所有实际功能请访问：运营管理 → 核销码管理页面 (redemption-management.html)
 * @version 2.0.0 (stub)
 * @date 2026-02-21
 */

import { logger } from '../../../utils/logger.js'

const MIGRATION_MSG = '核销码管理已迁移到运营管理 → 核销码管理页面'

function showMigrationNotice(methodName) {
  logger.warn(`[Redemption Stub] ${methodName}() 已废弃 — ${MIGRATION_MSG}`)
  try {
    if (window.Alpine?.store('notification')) {
      window.Alpine.store('notification').show(MIGRATION_MSG, 'warning')
    }
  } catch (_e) {
    // notification store may not exist
  }
}

/**
 * 核销码管理状态（空壳）
 * @returns {Object} 空状态对象
 */
export function useRedemptionState() {
  return {
    redemptionCodes: [],
    redemptionStats: { total: 0, pending: 0, fulfilled: 0, expired: 0 },
    redemptionFilters: { status: '', prize_type: '', code: '', mobile: '' },
    redemptionSelectedIds: [],
    redemptionDetail: null,
    redeemForm: { order_id: '', code_display: '', store_id: '', remark: '' },
    stores: []
  }
}

/**
 * 核销码管理方法（空壳 — 所有方法仅提示迁移信息）
 * @returns {Object} 方法对象
 */
export function useRedemptionMethods() {
  return {
    async loadStores() { showMigrationNotice('loadStores') },
    async loadRedemptionStats() { showMigrationNotice('loadRedemptionStats') },
    async loadRedemptionCodes() { showMigrationNotice('loadRedemptionCodes') },
    searchRedemptionCodes() { showMigrationNotice('searchRedemptionCodes') },
    async viewRedemptionDetail() { showMigrationNotice('viewRedemptionDetail') },
    openRedeemModal() { showMigrationNotice('openRedeemModal') },
    async submitRedeem() { showMigrationNotice('submitRedeem') },
    async cancelRedemptionCode() { showMigrationNotice('cancelRedemptionCode') },
    toggleRedemptionSelect() { showMigrationNotice('toggleRedemptionSelect') },
    toggleRedemptionSelectAll() { showMigrationNotice('toggleRedemptionSelectAll') },
    checkIsAllRedemptionSelected() { return false },
    async batchExpireRedemption() { showMigrationNotice('batchExpireRedemption') },
    async exportRedemptionCodes() { showMigrationNotice('exportRedemptionCodes') },
    getCodeDisplay() { return '-' },
    getRedeemerName() { return '' },
    getRedemptionPrizeName() { return '-' },
    getRedemptionCampaignName() { return '-' },
    getRedemptionStatusClass() { return 'bg-gray-100 text-gray-800' }
  }
}

export default { useRedemptionState, useRedemptionMethods }
