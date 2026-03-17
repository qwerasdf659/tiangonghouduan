/**
 * 存储管理 - Composable
 *
 * @file admin/src/modules/content/composables/storage.js
 * @description 存储概览、孤儿检测、回收站、重复文件检测
 * @version 1.0.0
 * @date 2026-03-17
 */

import { logger } from '../../../utils/logger.js'
import { SYSTEM_ADMIN_ENDPOINTS } from '../../../api/system/admin.js'

/**
 * 存储管理状态
 * @returns {Object} 状态对象
 */
export function useStorageState() {
  return {
    /** 存储概览数据 */
    storageOverview: null,
    /** 孤儿文件列表 */
    orphanFiles: [],
    /** 回收站文件列表 */
    trashFiles: [],
    /** 重复文件列表 */
    duplicateFiles: [],
    /** 存储加载状态 */
    storageLoading: false,
    /** 清理中状态 */
    cleaning: false
  }
}

/**
 * 存储管理方法
 * @returns {Object} 方法对象
 */
export function useStorageMethods() {
  return {
    /** 加载存储概览 */
    async loadStorageOverview() {
      this.storageLoading = true
      try {
        logger.info('[StorageManagement] 加载存储概览...')
        const response = await this.apiGet(SYSTEM_ADMIN_ENDPOINTS.STORAGE_OVERVIEW)
        if (response?.success) {
          this.storageOverview = response.data
          logger.info('[StorageManagement] 存储概览加载完成')
        }
      } catch (error) {
        logger.error('加载存储概览失败:', error)
        this.storageOverview = null
      } finally {
        this.storageLoading = false
      }
    },

    /** 加载孤儿文件 */
    async loadOrphanFiles() {
      try {
        logger.info('[StorageManagement] 检测孤儿文件...')
        const response = await this.apiGet(SYSTEM_ADMIN_ENDPOINTS.STORAGE_ORPHANS)
        if (response?.success) {
          this.orphanFiles = response.data?.orphans || response.data?.items || []
          logger.info('[StorageManagement] 孤儿文件数:', this.orphanFiles.length)
        }
      } catch (error) {
        logger.error('加载孤儿文件失败:', error)
        this.orphanFiles = []
      }
    },

    /** 加载回收站 */
    async loadTrashFiles() {
      try {
        logger.info('[StorageManagement] 加载回收站...')
        const response = await this.apiGet(SYSTEM_ADMIN_ENDPOINTS.STORAGE_TRASH)
        if (response?.success) {
          this.trashFiles = response.data?.items || response.data?.trash || []
          logger.info('[StorageManagement] 回收站文件数:', this.trashFiles.length)
        }
      } catch (error) {
        logger.error('加载回收站失败:', error)
        this.trashFiles = []
      }
    },

    /** 加载重复文件 */
    async loadDuplicateFiles() {
      try {
        logger.info('[StorageManagement] 检测重复文件...')
        const response = await this.apiGet(SYSTEM_ADMIN_ENDPOINTS.STORAGE_DUPLICATES)
        if (response?.success) {
          this.duplicateFiles = response.data?.duplicates || response.data?.items || []
          logger.info('[StorageManagement] 重复文件组数:', this.duplicateFiles.length)
        }
      } catch (error) {
        logger.error('加载重复文件失败:', error)
        this.duplicateFiles = []
      }
    },

    /** 加载全部存储数据 */
    async loadStorageData() {
      await Promise.all([
        this.loadStorageOverview(),
        this.loadOrphanFiles(),
        this.loadTrashFiles(),
        this.loadDuplicateFiles()
      ])
    },

    /** 清理回收站（超过 7 天） */
    async cleanupTrash() {
      if (!confirm('确定要清理回收站中超过 7 天的文件吗？此操作不可撤销。')) return
      this.cleaning = true
      try {
        const response = await this.apiPost(SYSTEM_ADMIN_ENDPOINTS.STORAGE_CLEANUP, { days: 7 })
        if (response?.success) {
          this.showSuccess(`清理完成：删除 ${response.data?.cleaned_count ?? 0} 个文件`)
          await this.loadStorageData()
        } else {
          this.showError(response?.message || '清理失败')
        }
      } catch (error) {
        logger.error('清理回收站失败:', error)
        this.showError('清理失败: ' + error.message)
      } finally {
        this.cleaning = false
      }
    }
  }
}
