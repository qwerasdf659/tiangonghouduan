/**
 * 存储管理 - Composable
 *
 * @file admin/src/modules/content/composables/storage.js
 * @description 存储概览、孤儿检测、回收站、重复文件检测
 * @version 1.0.0
 * @date 2026-03-17
 */

import { logger } from '../../../utils/logger.js'
import { request } from '../../../api/base.js'
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
    /** 受损（缺原图）文件列表（治本 B 配套 - 缺原图核对） */
    damagedFiles: [],
    /** 存储加载状态 */
    storageLoading: false,
    /** 清理中状态 */
    cleaning: false,
    /** 批量优化中状态 */
    optimizing: false
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
        this.loadDuplicateFiles(),
        this.loadDamagedFiles()
      ])
    },

    /** 缺原图核对（治本 B 配套：列出 DB 有记录但对象存储缺原图的受损图，引导运营重传） */
    async loadDamagedFiles() {
      try {
        logger.info('[StorageManagement] 缺原图核对...')
        const response = await this.apiGet(SYSTEM_ADMIN_ENDPOINTS.STORAGE_DAMAGED)
        if (response?.success) {
          this.damagedFiles = response.data?.items || []
          logger.info('[StorageManagement] 受损（缺原图）文件数:', this.damagedFiles.length)
        }
      } catch (error) {
        logger.error('缺原图核对失败:', error)
        this.damagedFiles = []
      }
    },

    /** 回收站项剩余保留天数（治本 C：30 天保留期，基于 trashed_at 计算，向下取整不为负） */
    trashRemainingDays(trashedAt) {
      if (!trashedAt) return 30
      const RETENTION_DAYS = 30
      const trashedMs = new Date(trashedAt).getTime()
      if (Number.isNaN(trashedMs)) return 30
      const elapsedDays = Math.floor((Date.now() - trashedMs) / (24 * 60 * 60 * 1000))
      const remaining = RETENTION_DAYS - elapsedDays
      return remaining > 0 ? remaining : 0
    },

    /** 清理回收站（治本 C：物理删超过 30 天的回收站项） */
    async cleanupTrash() {
      if (!confirm('确定要清理回收站中超过 30 天的文件吗？此操作不可撤销。')) return
      this.cleaning = true
      try {
        const response = await this.apiPost(SYSTEM_ADMIN_ENDPOINTS.STORAGE_CLEANUP, {
          older_than_days: 30
        })
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
    },

    /** 从回收站恢复单条媒体 */
    async restoreTrashFile(mediaId) {
      try {
        const response = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_RESTORE(mediaId),
          method: 'POST'
        })
        if (response?.success) {
          this.showSuccess('已从回收站恢复')
          await this.loadStorageData()
        } else {
          this.showError(response?.message || '恢复失败')
        }
      } catch (error) {
        logger.error('恢复媒体失败:', error)
        this.showError('恢复失败: ' + error.message)
      }
    },

    /** 立即彻底删除单条（仅限回收站内，不可逆） */
    async purgeTrashFile(mediaId) {
      if (!confirm('确定要彻底删除这张图吗？将物理删除原图+全部衍生图，不可恢复。')) return
      try {
        const response = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_PURGE(mediaId),
          method: 'POST'
        })
        if (response?.success) {
          this.showSuccess('已彻底删除')
          await this.loadStorageData()
        } else {
          this.showError(response?.message || '彻底删除失败')
        }
      } catch (error) {
        logger.error('彻底删除媒体失败:', error)
        this.showError('彻底删除失败: ' + error.message)
      }
    },

    /** 存量批量优化：对存量图补齐 w375/w750/w1080 衍生 */
    async optimizeStorage(folder = null) {
      if (!confirm('确定要对存量图批量补齐宽度档衍生图吗？建议低峰时段执行。')) return
      this.optimizing = true
      try {
        const response = await this.apiPost(
          SYSTEM_ADMIN_ENDPOINTS.STORAGE_OPTIMIZE,
          folder ? { folder } : {}
        )
        if (response?.success) {
          const d = response.data || {}
          this.showSuccess(
            `优化完成：成功 ${d.succeeded ?? 0}，跳过 ${d.skipped ?? 0}（缺原图），失败 ${d.failed ?? 0}`
          )
          await this.loadStorageData()
        } else {
          this.showError(response?.message || '批量优化失败')
        }
      } catch (error) {
        logger.error('存量批量优化失败:', error)
        this.showError('批量优化失败: ' + error.message)
      } finally {
        this.optimizing = false
      }
    }
  }
}
