/**
 * DIY 珠子素材管理页面
 *
 * @file admin/src/modules/diy/pages/diy-material-management.js
 * @description 珠子/宝石素材 CRUD，支持素材大类 Tab、分组筛选、直径筛选、图片上传、
 *   展示文案录入（寓意/能量/搭配/五行/克重）、异形珠几何参数、P0 数据完备度卡片
 *
 * 后端数据结构（GET /api/v4/console/diy/materials）：
 * - data.rows[]: { diy_material_id, material_code, display_name, material_name,
 *     group_code, diameter, shape, item_type, material_type, five_elements, weight,
 *     meaning, energy, pairing, size_length_mm, size_width_mm, bore_orientation,
 *     price, price_asset_code, stock, is_stackable,
 *     image_media_id, category_id, sort_order, is_enabled, meta,
 *     image_media{}, category{} }
 * - data.count: number
 *
 * 完备度数据（GET /api/v4/console/diy/stats → data.completeness.materials）：
 * - { total, enabled_count, disabled_count, missing_image_count,
 *     missing_copy_count, zero_price_enabled_count }
 */

import { logger } from '@/utils/logger.js'
import { Alpine, createPageMixin } from '@/alpine/index.js'
import { imageUploadMixin } from '@/alpine/mixins/image-upload.js'
import {
  getAdminMaterialList,
  createMaterial,
  updateMaterial,
  deleteMaterial,
  getDiyStats
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

/** 素材大类标签（item_type，与 material_type 材质档位是两个独立业务概念） */
const ITEM_TYPE_LABELS = {
  beads: '珠子',
  accessories: '配饰',
  pendants: '吊坠'
}

/** 素材大类 Tab 选项（列表筛选 + 表单下拉共用） */
const ITEM_TYPE_OPTIONS = [
  { value: 'beads', label: '珠子（饰品主体）' },
  { value: 'accessories', label: '配饰（隔片/佛头/流苏）' },
  { value: 'pendants', label: '吊坠' }
]

/** 材质光影档位选项（前端立体渲染高光参数） */
const MATERIAL_TYPE_OPTIONS = [
  { value: 'crystal', label: '通透水晶（大而亮高光）' },
  { value: 'stone', label: '玉石/奶体（柔和温润）' },
  { value: 'metal', label: '金属/镜面（小而锐高光）' },
  { value: 'matte', label: '哑光/不透光（漫反射）' }
]

/** 五行属性选项（多选 → 逗号串存库） */
const FIVE_ELEMENT_OPTIONS = [
  { value: 'metal', label: '金' },
  { value: 'wood', label: '木' },
  { value: 'water', label: '水' },
  { value: 'fire', label: '火' },
  { value: 'earth', label: '土' }
]

/** 穿绳方向选项（异形珠几何参数） */
const BORE_ORIENTATION_OPTIONS = [
  { value: 'none', label: '圆珠（无方向）' },
  { value: 'along_length', label: '绳穿长轴（管珠）' },
  { value: 'along_width', label: '绳穿短边（药片）' }
]

/** 空表单 */
function emptyForm() {
  return {
    display_name: '',
    material_name: '',
    material_code: '',
    group_code: '',
    diameter: 10,
    shape: 'circle',
    item_type: 'beads',
    material_type: 'crystal',
    five_elements: [], // 多选数组，保存时 join(',') 转逗号串
    weight: null,
    meaning: '',
    energy: '',
    pairing: '',
    size_length_mm: null,
    size_width_mm: null,
    bore_orientation: 'none',
    price: 0,
    price_asset_code: 'star_stone',
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
    filterItemType: '', // 素材大类 Tab（'' 全部 / beads / accessories / pendants）
    /* 完备度快捷筛选（'' 无 / missing_image 缺图 / missing_copy 缺文案 / zero_price_enabled 0价启用） */
    filterCompleteness: '',

    // ========== P0 数据完备度（来自 stats 接口 completeness.materials） ==========
    completeness: null,

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
    itemTypeLabels: ITEM_TYPE_LABELS,
    itemTypeOptions: ITEM_TYPE_OPTIONS,
    materialTypeOptions: MATERIAL_TYPE_OPTIONS,
    fiveElementOptions: FIVE_ELEMENT_OPTIONS,
    boreOrientationOptions: BORE_ORIENTATION_OPTIONS,

    // ========== 动态选项（从数据中提取） ==========
    get groupOptions() {
      return [...new Set(this.materials.map(m => m.group_code))].sort()
    },

    get diameterOptions() {
      return [...new Set(this.materials.map(m => m.diameter))].sort((a, b) => a - b)
    },

    async init() {
      logger.info('[DIY-Materials] 素材管理页面初始化')
      /* URL 带完备度筛选参数时直接应用（大屏指标点击跳转带参，如 ?filter=missing_image） */
      const urlFilter = new URLSearchParams(window.location.search).get('filter')
      if (['missing_image', 'missing_copy', 'zero_price_enabled'].includes(urlFilter)) {
        this.filterCompleteness = urlFilter
      }
      await Promise.all([this.loadData(), this.loadCompleteness()])
    },

    // ==================== 数据加载 ====================

    /** 加载 P0 数据完备度卡片（缺图/缺文案/0价，运营录数工作清单） */
    async loadCompleteness() {
      try {
        const res = await getDiyStats()
        if (res.success) {
          this.completeness = res.data?.completeness?.materials || null
        }
      } catch (e) {
        logger.error('[DIY-Materials] 加载完备度统计异常', e)
      }
    },

    async loadData() {
      this.loading = true
      try {
        const params = { page: this.page, page_size: this.page_size }
        if (this.filterGroup) params.group_code = this.filterGroup
        if (this.filterDiameter) params.diameter = this.filterDiameter
        if (this.filterKeyword) params.keyword = this.filterKeyword
        if (this.filterItemType) params.item_type = this.filterItemType
        if (this.filterCompleteness) params[this.filterCompleteness] = true

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
      this.filterItemType = ''
      this.filterCompleteness = ''
      this.page = 1
      await this.loadData()
    },

    /** 切换素材大类 Tab（饰品/配饰/吊坠） */
    async switchItemType(itemType) {
      this.filterItemType = itemType
      this.page = 1
      await this.loadData()
    },

    /** 点完备度卡片即带筛选过滤（缺图/缺文案/0价，二次点击取消） */
    async toggleCompletenessFilter(filterKey) {
      this.filterCompleteness = this.filterCompleteness === filterKey ? '' : filterKey
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
        item_type: mat.item_type || 'beads',
        material_type: mat.material_type || 'crystal',
        /* 后端存逗号串，表单用多选数组 */
        five_elements: mat.five_elements
          ? mat.five_elements.split(',').map(el => el.trim())
          : [],
        weight: mat.weight ?? null,
        meaning: mat.meaning || '',
        energy: mat.energy || '',
        pairing: mat.pairing || '',
        size_length_mm: mat.size_length_mm ?? null,
        size_width_mm: mat.size_width_mm ?? null,
        bore_orientation: mat.bore_orientation || 'none',
        price: mat.price || 0,
        price_asset_code: mat.price_asset_code || 'star_stone',
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
      // 强制整数定价校验（文档决策 A）
      if (this.form.price !== undefined && this.form.price % 1 !== 0) {
        Alpine.store('notification')?.show('价格必须为整数（强制整数定价策略）', 'warning')
        return
      }
      /* 强制校验：素材图片必须上传 */
      if (!this.imageMediaId) {
        Alpine.store('notification')?.show('请上传素材图片（小程序设计器渲染必需）', 'warning')
        return
      }
      /* 价格护栏（拍板 ⑥，与后端同一规则）：0 价素材禁止启用 */
      if (Number(this.form.price) === 0 && this.form.is_enabled === true) {
        Alpine.store('notification')?.show('0 价素材禁止启用，请先定价（价格护栏）', 'warning')
        return
      }

      this.saving = true
      try {
        const data = { ...this.form }
        delete data.material_code
        /* 五行多选数组 → 逗号串（后端 VARCHAR 存储约定）；空数组存 null */
        data.five_elements = this.form.five_elements.length
          ? this.form.five_elements.join(',')
          : null
        /* 数字类字段空串归一为 null，避免后端 DECIMAL 收到 '' */
        for (const numField of ['weight', 'size_length_mm', 'size_width_mm']) {
          if (data[numField] === '' || data[numField] === undefined) data[numField] = null
        }
        /* 文本类字段空串归一为 null */
        for (const textField of ['meaning', 'energy', 'pairing']) {
          if (!data[textField]?.trim()) data[textField] = null
        }
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
          await Promise.all([this.loadData(), this.loadCompleteness()])
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

      /* DIY 素材图片上传时自动裁剪透明边距，确保宝石内容填满槽位区域 */
      const result = await this.uploadImage(file, { trim_transparent: true })
      if (result) {
        this.imageMediaId = result.media_id
        if (result.public_url) {
          this.imagePreviewUrl = result.public_url
        }
        logger.info('[DIY-Materials] 素材图片上传成功（已裁剪透明边距）', { media_id: result.media_id })
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
