/**
 * DIY 珠子素材管理页面
 *
 * @file admin/src/modules/diy/pages/diy-material-management.js
 * @description 珠子/宝石素材 CRUD，支持分组筛选、直径筛选、图片上传
 *
 * 后端数据结构（GET /api/v4/console/diy/materials）：
 * - data.rows[]: { diy_material_id, material_code, display_name, material_name,
 *     group_code, diameter, shape, price, price_asset_code, stock, is_stackable,
 *     image_media_id, category_id, sort_order, is_enabled, meta,
 *     image_media{}, category{} }
 * - data.count: number
 */

import { logger } from '@/utils/logger.js'
import { Alpine, createPageMixin } from '@/alpine/index.js'
import { imageUploadMixin } from '@/alpine/mixins/image-upload.js'
import {
  getAdminMaterialList,
  createMaterial,
  updateMaterial,
  deleteMaterial
} from '@/api/diy.js'

/** 分组标签（对齐 asset_group_defs） */
const GROUP_LABELS = {
  yellow: '黄水晶',
  red: '红/粉水晶',
  orange: '橙/茶水晶',
  green: '绿水晶',
  blue: '蓝水晶',
  purple: '紫水晶'
}

/** 分组选项（表单下拉用） */
const ALL_GROUP_OPTIONS = [
  { value: 'yellow', label: '黄水晶' },
  { value: 'red', label: '红/粉水晶' },
  { value: 'orange', label: '橙/茶水晶' },
  { value: 'green', label: '绿水晶' },
  { value: 'blue', label: '蓝水晶' },
  { value: 'purple', label: '紫水晶' }
]

/** 形状标签 */
const SHAPE_LABELS = {
  circle: '圆形',
  ellipse: '椭圆',
  oval: '卵形',
  square: '方形',
  heart: '心形',
  teardrop: '水滴形'
}

/** 空表单 */
function emptyForm() {
  return {
    display_name: '',
    material_name: '',
    material_code: '',
    group_code: '',
    diameter: 10,
    shape: 'circle',
    price: 0,
    price_asset_code: 'DIAMOND',
    stock: -1,
    is_stackable: true,
    sort_order: 0,
    is_enabled: true
  }
}

function diyMaterialManagement() {
  if (!Alpine || typeof createPageMixin !== 'function') {
    logger.error('[DIY-Materials] Alpine 或 createPageMixin 未加载')
    return {}
  }

  return {
    ...createPageMixin({ pagination: true }),
    ...imageUploadMixin({ max_size: 2 * 1024 * 1024 }),

    // ========== 列表数据 ==========
    materials: [],
    total: 0,
    page: 1,
    page_size: 50,
    loading: false,
    saving: false,

    // ========== 筛选 ==========
    filterGroup: '',
    filterDiameter: '',
    filterKeyword: '',

    // ========== 表单弹窗 ==========
    showFormModal: false,
    editingId: null,
    form: emptyForm(),

    // ========== 图片 ==========
    imagePreviewUrl: null,
    imageMediaId: null,

    // ========== 常量 ==========
    groupLabels: GROUP_LABELS,
    allGroupOptions: ALL_GROUP_OPTIONS,
    shapeLabels: SHAPE_LABELS,

    // ========== 动态选项（从数据中提取） ==========
    get groupOptions() {
      return [...new Set(this.materials.map(m => m.group_code))].sort()
    },

    get diameterOptions() {
      return [...new Set(this.materials.map(m => m.diameter))].sort((a, b) => a - b)
    },

    async init() {
      logger.info('[DIY-Materials] 素材管理页面初始化')
      await this.loadData()
    },

    // ==================== 数据加载 ====================

    async loadData() {
      this.loading = true
      try {
        const params = { page: this.page, page_size: this.page_size }
        if (this.filterGroup) params.group_code = this.filterGroup
        if (this.filterDiameter) params.diameter = this.filterDiameter
        if (this.filterKeyword) params.keyword = this.filterKeyword

        const res = await getAdminMaterialList(params)
        if (res.success) {
          this.materials = res.data?.rows || []
          this.total = res.data?.count || 0
          logger.info('[DIY-Materials] 素材列表加载成功', { count: this.total })
        } else {
          Alpine.store('notification')?.show(res.message || '加载失败', 'error')
        }
      } catch (e) {
        logger.error('[DIY-Materials] 加载素材列表异常', e)
        Alpine.store('notification')?.show(e.message || '加载失败', 'error')
      } finally {
        this.loading = false
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
      this.filterGroup = ''
      this.filterDiameter = ''
      this.filterKeyword = ''
      this.page = 1
      await this.loadData()
    },

    // ==================== 表单操作 ====================

    openCreateForm() {
      this.editingId = null
      this.form = emptyForm()
      this.imagePreviewUrl = null
      this.imageMediaId = null
      this.showFormModal = true
    },

    async openEditForm(id) {
      const mat = this.materials.find(m => m.diy_material_id === id)
      if (!mat) return

      this.editingId = id
      this.form = {
        display_name: mat.display_name || '',
        material_name: mat.material_name || '',
        material_code: mat.material_code || '',
        group_code: mat.group_code || '',
        diameter: mat.diameter || 10,
        shape: mat.shape || 'circle',
        price: mat.price || 0,
        price_asset_code: mat.price_asset_code || 'DIAMOND',
        stock: mat.stock ?? -1,
        is_stackable: mat.is_stackable ?? true,
        sort_order: mat.sort_order || 0,
        is_enabled: mat.is_enabled ?? true
      }

      if (mat.image_media?.public_url) {
        this.imagePreviewUrl = mat.image_media.public_url
        this.imageMediaId = mat.image_media.media_id
      } else {
        this.imagePreviewUrl = null
        this.imageMediaId = null
      }

      this.showFormModal = true
    },

    async saveMaterial() {
      if (!this.form.display_name?.trim()) {
        Alpine.store('notification')?.show('请填写素材名称', 'warning')
        return
      }
      if (!this.form.group_code) {
        Alpine.store('notification')?.show('请选择材料分组', 'warning')
        return
      }

      this.saving = true
      try {
        const data = { ...this.form }
        if (this.imageMediaId) {
          data.image_media_id = this.imageMediaId
        }

        let res
        if (this.editingId) {
          res = await updateMaterial(this.editingId, data)
        } else {
          res = await createMaterial(data)
        }

        if (res.success) {
          this.showFormModal = false
          await this.loadData()
          Alpine.store('notification')?.show(
            this.editingId ? '素材更新成功' : '素材创建成功',
            'success'
          )
        } else {
          Alpine.store('notification')?.show(res.message || '操作失败', 'error')
        }
      } catch (e) {
        logger.error('[DIY-Materials] 保存素材失败', e)
        Alpine.store('notification')?.show(e.message || '保存失败', 'error')
      } finally {
        this.saving = false
      }
    },

    async handleDelete(id, name) {
      if (!confirm(`确定删除素材「${name}」？此操作不可恢复。`)) return
      try {
        const res = await deleteMaterial(id)
        if (res.success) {
          await this.loadData()
          Alpine.store('notification')?.show('素材已删除', 'success')
        } else {
          Alpine.store('notification')?.show(res.message || '删除失败', 'error')
        }
      } catch (e) {
        logger.error('[DIY-Materials] 删除素材失败', e)
        Alpine.store('notification')?.show(e.message || '删除失败', 'error')
      }
    },

    // ==================== 图片上传 ====================

    async handleImageUpload(event) {
      const file = event.target?.files?.[0]
      if (!file) return

      this.imagePreviewUrl = URL.createObjectURL(file)

      const result = await this.uploadImage(file)
      if (result) {
        this.imageMediaId = result.media_id
        if (result.public_url) {
          this.imagePreviewUrl = result.public_url
        }
        logger.info('[DIY-Materials] 素材图片上传成功', { media_id: result.media_id })
      }
    },

    // ==================== 格式化 ====================

    getGroupBadgeClass(groupCode) {
      const map = {
        yellow: 'bg-yellow-100 text-yellow-800',
        red: 'bg-red-100 text-red-800',
        orange: 'bg-orange-100 text-orange-800',
        green: 'bg-green-100 text-green-800',
        blue: 'bg-blue-100 text-blue-800',
        purple: 'bg-purple-100 text-purple-800'
      }
      return map[groupCode] || 'bg-gray-100 text-gray-800'
    }
  }
}

Alpine.data('diyMaterialManagement', diyMaterialManagement)
logger.info('[DIY-Materials] 素材管理页面模块已加载')
