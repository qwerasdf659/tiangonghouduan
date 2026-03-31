/**
 * DIY 用户作品管理页面（管理端只读查看）
 *
 * @file admin/src/modules/diy/pages/diy-work-management.js
 * @description 查看所有用户的 DIY 作品，支持筛选/分页/详情查看
 *
 * 后端数据结构（GET /api/v4/console/diy/works）：
 * - data.rows[]: { diy_work_id, work_code, account_id, diy_template_id,
 *     work_name, design_data, total_cost, preview_media_id, item_id,
 *     status, frozen_at, completed_at, created_at, updated_at,
 *     template{}, account{ user{} }, preview_media{} }
 * - data.count: number
 */

import { logger } from '@/utils/logger.js'
import { Alpine, createPageMixin } from '@/alpine/index.js'
import {
  getAdminWorkList,
  getAdminWorkDetail,
  getDiyStats,
  getTemplateList
} from '@/api/diy.js'

/** 作品状态标签（对齐后端 ENUM） */
const STATUS_LABELS = {
  draft: '草稿',
  frozen: '已冻结',
  completed: '已完成',
  cancelled: '已取消'
}

function diyWorkManagement() {
  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[DIY-Works] Alpine 或 createPageMixin 未加载')
    return {}
  }

  return {
    ...createPageMixin({ pagination: true }),

    // ========== 列表数据 ==========
    works: [],
    total: 0,
    page: 1,
    page_size: 20,
    loading: false,

    // ========== 统计 ==========
    stats: {},

    // ========== 筛选 ==========
    filterStatus: '',
    filterTemplateId: '',
    filterKeyword: '',
    templateOptions: [],

    // ========== 详情弹窗 ==========
    showDetail: false,
    detailData: null,

    // ========== 常量 ==========
    statusLabels: STATUS_LABELS,

    async init() {
      logger.info('[DIY-Works] 作品管理页面初始化')
      await Promise.all([
        this.loadStats(),
        this.loadTemplateOptions(),
        this.loadData()
      ])
    },

    // ==================== 数据加载 ====================

    async loadData() {
      this.loading = true
      try {
        const params = { page: this.page, page_size: this.page_size }
        if (this.filterStatus) params.status = this.filterStatus
        if (this.filterTemplateId) params.template_id = this.filterTemplateId
        if (this.filterKeyword) params.keyword = this.filterKeyword

        const res = await getAdminWorkList(params)
        if (res.success) {
          this.works = res.data?.rows || []
          this.total = res.data?.count || 0
          logger.info('[DIY-Works] 作品列表加载成功', { count: this.total })
        } else {
          Alpine.store('notification')?.show(res.message || '加载失败', 'error')
        }
      } catch (e) {
        logger.error('[DIY-Works] 加载作品列表异常', e)
        Alpine.store('notification')?.show(e.message || '加载失败', 'error')
      } finally {
        this.loading = false
      }
    },

    async loadStats() {
      try {
        const res = await getDiyStats()
        if (res.success) {
          this.stats = res.data || {}
        }
      } catch (e) {
        logger.error('[DIY-Works] 加载统计失败', e)
      }
    },

    async loadTemplateOptions() {
      try {
        const res = await getTemplateList({ page_size: 100 })
        if (res.success) {
          this.templateOptions = res.data?.rows || []
        }
      } catch (e) {
        logger.error('[DIY-Works] 加载模板选项失败', e)
      }
    },

    // ==================== 分页 ====================

    get totalPages() {
      return Math.ceil(this.total / this.page_size) || 1
    },

    async goToPage(p) {
      if (p < 1 || p > this.totalPages) return
      this.page = p
      await this.loadData()
    },

    async applyFilter() {
      this.page = 1
      await this.loadData()
    },

    async resetFilter() {
      this.filterStatus = ''
      this.filterTemplateId = ''
      this.filterKeyword = ''
      this.page = 1
      await this.loadData()
    },

    // ==================== 详情 ====================

    async viewDetail(workId) {
      try {
        const res = await getAdminWorkDetail(workId)
        if (res.success) {
          this.detailData = res.data
          this.showDetail = true
        } else {
          Alpine.store('notification')?.show(res.message || '加载详情失败', 'error')
        }
      } catch (e) {
        logger.error('[DIY-Works] 加载作品详情失败', e)
        Alpine.store('notification')?.show(e.message || '加载失败', 'error')
      }
    },

    // ==================== 格式化 ====================

    getStatusBadgeClass(status) {
      const map = {
        draft: 'bg-gray-100 text-gray-800',
        frozen: 'bg-amber-100 text-amber-800',
        completed: 'bg-green-100 text-green-800',
        cancelled: 'bg-red-100 text-red-800'
      }
      return map[status] || 'bg-gray-100 text-gray-800'
    }
  }
}

Alpine.data('diyWorkManagement', diyWorkManagement)
logger.info('[DIY-Works] 作品管理页面模块已加载')
