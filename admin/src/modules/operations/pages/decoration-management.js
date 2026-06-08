/**
 * 星石虚拟装饰管理页面模块（模块D·第5步，data-table 版）
 *
 * @file admin/src/modules/operations/pages/decoration-management.js
 * @description 运营配置装饰 SKU（创建/编辑/上下架），纯展示装饰、星石明码标价
 * @version 1.0.0
 * @date 2026-06-08
 *
 * 🔴 合规红线（管理端体现）：
 * - 只配明码星石价（price_star_stone），无任何"抽取/开箱/随机"配置项
 * - 装饰纯展示零数值，无数值属性字段
 *
 * 架构：data-table 渲染列表，页面只定义 columns + dataSource + actions + 表单 Modal。
 * 端点直接对接后端 /api/v4/console/decorations（以后端为准，snake_case 字段）。
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { DecorationAPI } from '../../../api/decoration.js'

let _registered = false

/**
 * 注册装饰管理页面组件
 * @returns {void}
 */
function registerDecorationManagementComponents() {
  if (_registered) {
    logger.debug('[Decoration] 组件已注册，跳过')
    return
  }
  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[Decoration] 关键依赖未加载')
    return
  }

  Alpine.data('decorationManagement', () => ({
    ...createPageMixin({ pagination: false, tableSelection: false }),

    saving: false,
    editingId: null,
    // Tab 切换：decorations(装饰SKU) / seasons(赛季)
    activeTab: 'decorations',
    // 赛季列表与表单
    seasons: [],
    seasonSaving: false,
    seasonEditingId: null,
    seasonForm: {
      season_code: '',
      season_name: '',
      start_at: '',
      end_at: '',
      status: 'draft'
    },
    decorationForm: {
      decoration_code: '',
      decoration_name: '',
      decoration_type: 'avatar_frame',
      rarity_code: '',
      price_star_stone: 0,
      validity_days: '',
      is_limited: false,
      image_url: '',
      sort_order: 0,
      status: 'draft'
    },

    // ========== data-table 列配置（snake_case 后端字段）==========
    tableColumns: [
      { key: 'decoration_sku_id', label: 'ID', sortable: true },
      { key: 'decoration_code', label: '装饰码', type: 'code' },
      { key: 'decoration_name', label: '名称', sortable: true },
      {
        key: 'decoration_type',
        label: '类型',
        type: 'badge',
        badgeMap: {
          avatar_frame: 'blue',
          bubble: 'purple',
          theme: 'green',
          title: 'orange',
          badge_visual: 'yellow'
        },
        labelMap: {
          avatar_frame: '头像框',
          bubble: '气泡',
          theme: '主题',
          title: '称号',
          badge_visual: '视觉徽章'
        }
      },
      {
        key: 'price_star_stone',
        label: '星石价',
        sortable: true,
        render: val => `<span class="font-semibold text-amber-600">${val || 0} ⭐</span>`
      },
      {
        key: 'validity_days',
        label: '有效期',
        render: val =>
          val ? `<span class="text-gray-600">${val}天</span>` : '<span class="text-green-600">永久</span>'
      },
      {
        key: 'is_limited',
        label: '限定',
        type: 'status',
        statusMap: {
          true: { class: 'orange', label: '限定' },
          false: { class: 'gray', label: '常驻' }
        }
      },
      {
        key: 'status',
        label: '上架状态',
        sortable: true,
        type: 'badge',
        badgeMap: { draft: 'gray', on_sale: 'green', off_sale: 'red' },
        labelMap: { draft: '草稿', on_sale: '在售', off_sale: '下架' }
      },
      {
        key: '_actions',
        label: '操作',
        type: 'actions',
        width: '200px',
        actions: [
          { name: 'edit', label: '编辑', icon: '✏️', class: 'text-blue-600 hover:text-blue-800' },
          {
            name: 'toggle_sale',
            label: '上/下架',
            icon: '🔄',
            class: 'text-green-600 hover:text-green-800'
          }
        ]
      }
    ],

    /**
     * data-table 数据源
     * @returns {Promise<{items: Array, total: number}>} 装饰列表
     */
    async fetchTableData() {
      const response = await DecorationAPI.listDecorations()
      if (response?.success) {
        const items = response.data?.decorations || []
        return { items, total: items.length }
      }
      throw new Error(response?.message || '加载装饰列表失败')
    },

    /**
     * 处理表格操作
     * @param {Object} detail - { action, row }
     * @returns {void}
     */
    handleTableAction(detail) {
      const { action, row } = detail
      if (action === 'edit') {
        this.openEditModal(row)
      } else if (action === 'toggle_sale') {
        this.toggleSale(row)
      }
    },

    /**
     * 打开新增弹窗
     * @returns {void}
     */
    openCreateModal() {
      this.editingId = null
      this.decorationForm = {
        decoration_code: '',
        decoration_name: '',
        decoration_type: 'avatar_frame',
        rarity_code: '',
        price_star_stone: 0,
        validity_days: '',
        is_limited: false,
        image_url: '',
        sort_order: 0,
        status: 'draft'
      }
      this.showModal('decorationModal')
    },

    /**
     * 打开编辑弹窗
     * @param {Object} row - 装饰行数据
     * @returns {void}
     */
    openEditModal(row) {
      this.editingId = row.decoration_sku_id
      this.decorationForm = {
        decoration_code: row.decoration_code,
        decoration_name: row.decoration_name,
        decoration_type: row.decoration_type,
        rarity_code: row.rarity_code || '',
        price_star_stone: row.price_star_stone || 0,
        validity_days: row.validity_days || '',
        is_limited: !!row.is_limited,
        image_url: row.image_url || '',
        sort_order: row.sort_order || 0,
        status: row.status
      }
      this.showModal('decorationModal')
    },

    /**
     * 保存装饰（创建或更新）
     * @returns {Promise<void>}
     */
    async saveDecoration() {
      this.saving = true
      try {
        const payload = { ...this.decorationForm }
        if (payload.validity_days === '') payload.validity_days = null
        let response
        if (this.editingId) {
          response = await DecorationAPI.updateDecoration(this.editingId, payload)
        } else {
          response = await DecorationAPI.createDecoration(payload)
        }
        if (response?.success) {
          Alpine.store('notification')?.success(this.editingId ? '装饰更新成功' : '装饰创建成功')
          this.hideModal('decorationModal')
          window.dispatchEvent(new CustomEvent('dt-refresh'))
        } else {
          Alpine.store('notification')?.error(response?.message || '保存失败')
        }
      } catch (error) {
        logger.error('[Decoration] 保存失败', error)
        Alpine.store('notification')?.error(error.message || '保存失败')
      } finally {
        this.saving = false
      }
    },

    /**
     * 上架/下架切换
     * @param {Object} row - 装饰行数据
     * @returns {Promise<void>}
     */
    async toggleSale(row) {
      const nextStatus = row.status === 'on_sale' ? 'off_sale' : 'on_sale'
      try {
        const response = await DecorationAPI.updateDecoration(row.decoration_sku_id, {
          status: nextStatus
        })
        if (response?.success) {
          Alpine.store('notification')?.success(nextStatus === 'on_sale' ? '已上架' : '已下架')
          window.dispatchEvent(new CustomEvent('dt-refresh'))
        } else {
          Alpine.store('notification')?.error(response?.message || '操作失败')
        }
      } catch (error) {
        logger.error('[Decoration] 上下架失败', error)
        Alpine.store('notification')?.error(error.message || '操作失败')
      }
    },

    /**
     * 切换 Tab，赛季 Tab 首次进入时加载赛季
     * @param {string} tab - 'decorations' | 'seasons'
     * @returns {void}
     */
    switchTab(tab) {
      this.activeTab = tab
      if (tab === 'seasons') {
        this.loadSeasons()
      }
    },

    /**
     * 加载赛季列表
     * @returns {Promise<void>}
     */
    async loadSeasons() {
      try {
        const response = await DecorationAPI.listSeasons()
        if (response?.success) {
          this.seasons = response.data?.seasons || []
        }
      } catch (error) {
        logger.error('[Decoration] 加载赛季失败', error)
        Alpine.store('notification')?.error(error.message || '加载赛季失败')
      }
    },

    /**
     * 打开新增赛季弹窗
     * @returns {void}
     */
    openCreateSeasonModal() {
      this.seasonEditingId = null
      this.seasonForm = { season_code: '', season_name: '', start_at: '', end_at: '', status: 'draft' }
      this.showModal('seasonModal')
    },

    /**
     * 打开编辑赛季弹窗
     * @param {Object} row - 赛季行数据
     * @returns {void}
     */
    openEditSeasonModal(row) {
      this.seasonEditingId = row.decoration_season_id
      this.seasonForm = {
        season_code: row.season_code,
        season_name: row.season_name,
        start_at: row.start_at || '',
        end_at: row.end_at || '',
        status: row.status
      }
      this.showModal('seasonModal')
    },

    /**
     * 保存赛季（创建或更新）
     * @returns {Promise<void>}
     */
    async saveSeason() {
      this.seasonSaving = true
      try {
        const payload = { ...this.seasonForm }
        if (payload.start_at === '') payload.start_at = null
        if (payload.end_at === '') payload.end_at = null
        let response
        if (this.seasonEditingId) {
          response = await DecorationAPI.updateSeason(this.seasonEditingId, payload)
        } else {
          response = await DecorationAPI.createSeason(payload)
        }
        if (response?.success) {
          Alpine.store('notification')?.success(this.seasonEditingId ? '赛季更新成功' : '赛季创建成功')
          this.hideModal('seasonModal')
          this.loadSeasons()
        } else {
          Alpine.store('notification')?.error(response?.message || '保存失败')
        }
      } catch (error) {
        logger.error('[Decoration] 保存赛季失败', error)
        Alpine.store('notification')?.error(error.message || '保存失败')
      } finally {
        this.seasonSaving = false
      }
    },

    /**
     * 初始化
     * @returns {void}
     */
    init() {
      if (!this.checkAuth()) {
        logger.warn('[Decoration] 认证检查失败')
        return
      }
      logger.info('[Decoration] 装饰管理页面初始化完成（data-table 模式）')
    }
  }))

  _registered = true
  logger.info('[Decoration] Alpine 组件注册完成')
}

registerDecorationManagementComponents()
document.addEventListener('alpine:init', () => {
  registerDecorationManagementComponents()
})

export { registerDecorationManagementComponents }
export default registerDecorationManagementComponents
