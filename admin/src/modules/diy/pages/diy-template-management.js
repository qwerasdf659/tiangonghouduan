/**
 * DIY 款式模板管理页面
 *
 * @file admin/src/modules/diy/pages/diy-template-management.js
 * @description 款式模板列表、创建、编辑、删除
 *
 * 后端数据结构（管理端 GET /api/v4/console/diy/templates）：
 * - data.rows[]: { diy_template_id, template_code, display_name, category_id,
 *     layout, bead_rules, sizing_rules, capacity_rules, material_group_codes,
 *     preview_media_id, base_image_media_id, status, is_enabled, sort_order,
 *     meta, created_at, updated_at, category{}, preview_media{}, base_image_media{} }
 * - data.count: number
 */

import { logger } from '@/utils/logger.js'
import { Alpine, createPageMixin } from '@/alpine/index.js'
import { imageUploadMixin } from '@/alpine/mixins/image-upload.js'
import {
  getTemplateList,
  getTemplateDetail,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getCategoriesTree,
  getDiyStats
} from '@/api/diy.js'

/** 布局形状选项 */
const SHAPE_OPTIONS = [
  { value: 'circle', label: '圆形（手链）', group: '串珠模式' },
  { value: 'ellipse', label: '椭圆形（项链）', group: '串珠模式' },
  { value: 'arc', label: '弧形', group: '串珠模式' },
  { value: 'line', label: '直线', group: '串珠模式' },
  { value: 'slots', label: '镶嵌槽位（吊坠/胸针）', group: '镶嵌模式' }
]

/** 模板状态选项（对齐后端 ENUM: draft/published/archived） */
const STATUS_OPTIONS = [
  { value: 'draft', label: '草稿' },
  { value: 'published', label: '已发布' },
  { value: 'archived', label: '已归档' }
]

const SHAPE_LABELS = Object.fromEntries(SHAPE_OPTIONS.map(o => [o.value, o.label]))
const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o.label]))

/** 空表单（对齐后端字段名） */
function emptyForm() {
  return {
    display_name: '',
    category_id: '',
    layout: { shape: 'circle', bead_count: 18, radius_x: 120, radius_y: 120 },
    bead_rules: { margin: 10, default_diameter: 10, allowed_diameters: [6, 8, 10, 12] },
    sizing_rules: {
      default_size: 'M',
      size_options: [
        { label: 'S', display: '小号', bead_count: 14, radius_x: 95, radius_y: 95 },
        { label: 'M', display: '中号', bead_count: 18, radius_x: 120, radius_y: 120 },
        { label: 'L', display: '大号', bead_count: 22, radius_x: 140, radius_y: 140 }
      ]
    },
    capacity_rules: { min_beads: 12, max_beads: 24 },
    material_group_codes: [],
    sort_order: 0,
    status: 'draft',
    is_enabled: true,
    meta: null
  }
}

function diyTemplateManagement() {
  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[DIY] Alpine 或 createPageMixin 未加载')
    return {}
  }

  return {
    ...createPageMixin({ pagination: true, tableSelection: false }),
    ...imageUploadMixin({ max_size: 2 * 1024 * 1024 }),

    // ========== 列表数据 ==========
    templates: [],
    total: 0,
    page: 1,
    page_size: 20,
    loading: false,
    saving: false,

    // ========== 筛选条件 ==========
    filterStatus: '',
    filterEnabled: '',
    filterKeyword: '',

    // ========== 表单弹窗 ==========
    showFormModal: false,
    editingId: null,
    form: emptyForm(),

    // ========== 分类数据 ==========
    categories: [],

    // ========== 预览图 ==========
    iconPreviewUrl: null,
    iconMediaId: null,

    // ========== 底图（base_image） ==========
    baseImagePreviewUrl: null,
    baseImageMediaId: null,

    // ========== 统计数据 ==========
    stats: {},

    // ========== 常量 ==========
    shapeOptions: SHAPE_OPTIONS,
    statusOptions: STATUS_OPTIONS,
    shapeLabels: SHAPE_LABELS,
    statusLabels: STATUS_LABELS,

    async init() {
      logger.info('[DIY] 模板管理页面初始化')
      await Promise.all([
        this.loadCategories(),
        this.loadData(),
        this.loadStats()
      ])
    },

    // ==================== 数据加载 ====================

    async loadData() {
      this.loading = true
      try {
        const params = { page: this.page, page_size: this.page_size }
        if (this.filterStatus) params.status = this.filterStatus
        if (this.filterEnabled !== '') params.is_enabled = this.filterEnabled
        if (this.filterKeyword) params.keyword = this.filterKeyword

        const res = await getTemplateList(params)
        if (res.success) {
          // 后端返回 { rows: [], count: N }
          this.templates = res.data?.rows || []
          this.total = res.data?.count || 0
          logger.info('[DIY] 模板列表加载成功', { count: this.total })
        } else {
          logger.error('[DIY] 加载模板列表失败', { message: res.message })
          Alpine.store('notification')?.show(res.message || '加载失败', 'error')
        }
      } catch (e) {
        logger.error('[DIY] 加载模板列表异常', e)
        Alpine.store('notification')?.show(e.message || '加载失败', 'error')
      } finally {
        this.loading = false
      }
    },

    async loadCategories() {
      try {
        const res = await getCategoriesTree()
        if (res.success) {
          // 后端返回 { tree: [...] }，找到 DIY_JEWELRY 顶级分类的 children
          const tree = res.data?.tree || res.data || []
          const diyRoot = this._findCategoryByCode(tree, 'DIY_JEWELRY')
          this.categories = diyRoot?.children || []
          logger.info('[DIY] 分类加载成功', { count: this.categories.length })
        }
      } catch (e) {
        logger.error('[DIY] 加载分类失败', e)
      }
    },

    async loadStats() {
      try {
        const res = await getDiyStats()
        if (res.success) {
          this.stats = res.data || {}
        }
      } catch (e) {
        logger.error('[DIY] 加载统计失败', e)
      }
    },

    _findCategoryByCode(nodes, code) {
      if (!Array.isArray(nodes)) return null
      for (const n of nodes) {
        if (n.category_code === code) return n
        if (n.children) {
          const found = this._findCategoryByCode(n.children, code)
          if (found) return found
        }
      }
      return null
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
      this.filterEnabled = ''
      this.filterKeyword = ''
      this.page = 1
      await this.loadData()
    },

    // ==================== 表单操作 ====================

    openCreateForm() {
      this.editingId = null
      this.form = emptyForm()
      this.iconPreviewUrl = null
      this.iconMediaId = null
      this.baseImagePreviewUrl = null
      this.baseImageMediaId = null
      this.showFormModal = true
    },

    async openEditForm(id) {
      try {
        const res = await getTemplateDetail(id)
        if (!res.success) {
          Alpine.store('notification')?.show(res.message || '加载详情失败', 'error')
          return
        }
        const t = res.data
        this.editingId = Number(t.diy_template_id)
        this.form = {
          display_name: t.display_name || '',
          category_id: t.category_id || '',
          layout: t.layout || { shape: 'circle', bead_count: 18, radius_x: 120, radius_y: 120 },
          bead_rules: t.bead_rules || { margin: 10, default_diameter: 10, allowed_diameters: [8] },
          sizing_rules: t.sizing_rules || null,
          capacity_rules: t.capacity_rules || null,
          material_group_codes: t.material_group_codes || [],
          sort_order: t.sort_order || 0,
          status: t.status || 'draft',
          is_enabled: t.is_enabled ?? true,
          meta: t.meta || null
        }

        // 预览图
        if (t.preview_media?.object_key) {
          this.iconPreviewUrl = `/api/v4/images/${t.preview_media.object_key}`
          this.iconMediaId = t.preview_media.media_id
        } else {
          this.iconPreviewUrl = null
          this.iconMediaId = null
        }

        // 底图
        if (t.base_image_media?.object_key) {
          this.baseImagePreviewUrl = `/api/v4/images/${t.base_image_media.object_key}`
          this.baseImageMediaId = t.base_image_media.media_id
        } else {
          this.baseImagePreviewUrl = null
          this.baseImageMediaId = null
        }

        this.showFormModal = true
        logger.info('[DIY] 编辑模板', { id: this.editingId })
      } catch (e) {
        logger.error('[DIY] 加载模板详情失败', e)
        Alpine.store('notification')?.show(e.message || '加载失败', 'error')
      }
    },

    async saveTemplate() {
      if (!this.form.display_name?.trim()) {
        Alpine.store('notification')?.show('请填写模板名称', 'warning')
        return
      }
      if (!this.form.category_id) {
        Alpine.store('notification')?.show('请选择所属分类', 'warning')
        return
      }
      /* 强制校验：底图和预览图必须上传 */
      if (!this.baseImageMediaId) {
        Alpine.store('notification')?.show('请上传款式底图（小程序设计器渲染必需）', 'warning')
        return
      }
      if (!this.iconMediaId) {
        Alpine.store('notification')?.show('请上传模板预览图（模板列表展示必需）', 'warning')
        return
      }

      this.saving = true
      try {
        const data = { ...this.form }

        // JSON 字段：如果是字符串则解析
        for (const key of ['layout', 'bead_rules', 'sizing_rules', 'capacity_rules', 'material_group_codes', 'meta']) {
          if (typeof data[key] === 'string' && data[key].trim()) {
            try { data[key] = JSON.parse(data[key]) } catch { /* 保持原值 */ }
          }
        }

        // 绑定预览图
        if (this.iconMediaId) {
          data.preview_media_id = this.iconMediaId
        }

        // 绑定底图
        if (this.baseImageMediaId) {
          data.base_image_media_id = this.baseImageMediaId
        }

        // category_id 转数字
        data.category_id = Number(data.category_id)

        let res
        if (this.editingId) {
          res = await updateTemplate(this.editingId, data)
        } else {
          res = await createTemplate(data)
        }

        if (res.success) {
          this.showFormModal = false
          await this.loadData()
          Alpine.store('notification')?.show(
            this.editingId ? '模板更新成功' : '模板创建成功',
            'success'
          )
        } else {
          Alpine.store('notification')?.show(res.message || '操作失败', 'error')
        }
      } catch (e) {
        logger.error('[DIY] 保存模板失败', e)
        Alpine.store('notification')?.show(e.message || '保存失败', 'error')
      } finally {
        this.saving = false
      }
    },

    async handleDelete(id, name) {
      if (!confirm(`确定删除模板「${name}」？此操作不可恢复。`)) return
      try {
        const res = await deleteTemplate(id)
        if (res.success) {
          await this.loadData()
          Alpine.store('notification')?.show('模板已删除', 'success')
        } else {
          Alpine.store('notification')?.show(res.message || '删除失败', 'error')
        }
      } catch (e) {
        logger.error('[DIY] 删除模板失败', e)
        Alpine.store('notification')?.show(e.message || '删除失败', 'error')
      }
    },

    // ==================== 布局切换 ====================

    onShapeChange() {
      const shape = this.form.layout.shape
      if (shape === 'slots') {
        this.form.layout = {
          shape: 'slots',
          background_width: 800,
          background_height: 1000,
          slot_definitions: []
        }
        this.form.bead_rules = null
        this.form.sizing_rules = null
      } else {
        this.form.layout = { shape, bead_count: 18, radius_x: 120, radius_y: 120 }
        if (!this.form.bead_rules) {
          this.form.bead_rules = { margin: 10, default_diameter: 10, allowed_diameters: [6, 8, 10, 12] }
        }
      }
    },

    get isSlotMode() {
      return this.form.layout?.shape === 'slots'
    },

    // ==================== 图片上传 ====================

    /** 预览图上传（模板列表展示用） */
    async handleIconUpload(event) {
      const file = event.target?.files?.[0]
      if (!file) return

      // 本地预览
      this.iconPreviewUrl = URL.createObjectURL(file)

      // 上传到后端（复用 imageUploadMixin.uploadImage）
      const result = await this.uploadImage(file)
      if (result) {
        this.iconMediaId = result.media_id
        if (result.public_url) {
          this.iconPreviewUrl = result.public_url
        }
        logger.info('[DIY] 预览图上传成功', { media_id: result.media_id })
      }
    },

    removeIcon() {
      this.iconPreviewUrl = null
      this.iconMediaId = null
    },

    /** 底图上传（小程序设计器渲染用，建议透明背景 PNG） */
    async handleBaseImageUpload(event) {
      const file = event.target?.files?.[0]
      if (!file) return

      this.baseImagePreviewUrl = URL.createObjectURL(file)

      const result = await this.uploadImage(file)
      if (result) {
        this.baseImageMediaId = result.media_id
        if (result.public_url) {
          this.baseImagePreviewUrl = result.public_url
        }
        logger.info('[DIY] 底图上传成功', { media_id: result.media_id })
      }
    },

    removeBaseImage() {
      this.baseImagePreviewUrl = null
      this.baseImageMediaId = null
    },

    // ==================== 跳转槽位标注页 ====================

    openSlotEditor(templateId) {
      window.location.href = `/admin/diy-slot-editor.html?template_id=${templateId}`
    },

    // ==================== 格式化工具 ====================

    getStatusBadgeClass(status) {
      const map = {
        draft: 'bg-gray-100 text-gray-800',
        published: 'bg-green-100 text-green-800',
        archived: 'bg-amber-100 text-amber-800'
      }
      return map[status] || 'bg-gray-100 text-gray-800'
    },

    formatBeadCount(layout) {
      if (!layout) return '-'
      if (layout.shape === 'slots') {
        return `${layout.slot_definitions?.length || 0} 个槽位`
      }
      return `${layout.bead_count || 0} 颗珠子`
    }
  }
}

Alpine.data('diyTemplateManagement', diyTemplateManagement)
logger.info('[DIY] 模板管理页面模块已加载')
