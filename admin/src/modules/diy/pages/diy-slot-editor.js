/**
 * DIY 槽位标注编辑器 — Konva.js 可视化标注
 *
 * 功能：
 * - 加载模板底图，在底图上拖拽标注椭圆形槽位
 * - 支持拖拽移动、手柄缩放、旋转调整
 * - 坐标自动转换为 0~1 百分比（适配不同屏幕）
 * - 右侧属性面板实时同步
 * - 保存后写回 diy_templates.layout.slot_definitions
 *
 * @file admin/src/modules/diy/pages/diy-slot-editor.js
 */

import { logger } from '@/utils/logger.js'
import { Alpine } from '@/alpine/index.js'
import { getTemplateDetail, updateTemplate, getAdminMaterialList } from '@/api/diy.js'
import Konva from 'konva'

// ========== 全局状态 ==========
const state = {
  templateId: null,
  templateName: '',
  layout: null,
  slots: [],
  selectedIndex: -1,
  stage: null,
  layer: null,
  previewLayer: null, // 珠子预览图层（在槽位层之上）
  transformer: null,
  bgImage: null,
  canvasWidth: 800,
  canvasHeight: 600,
  bgNaturalWidth: 800,
  bgNaturalHeight: 1000,
  saving: false,
  materials: [],       // 珠子素材列表
  previewImages: {}    // { slotIndex: Konva.Image } 已镶嵌的预览图
}

// 暴露给 Alpine 的全局引用
window.__slotEditorState = state

// ========== 初始化 ==========
async function initEditor() {
  // 从 URL 参数获取 template_id
  const params = new URLSearchParams(window.location.search)
  state.templateId = params.get('template_id') || params.get('id')

  if (!state.templateId) {
    logger.error('[SlotEditor] 缺少 template_id 参数')
    alert('缺少模板ID参数，请从模板管理页进入')
    return
  }

  // 加载模板数据
  try {
    const res = await getTemplateDetail(state.templateId)
    if (!res.success) throw new Error(res.message)

    const tpl = res.data
    state.templateName = tpl.display_name
    state.layout = tpl.layout || {}
    state.slots = tpl.layout?.slot_definitions || []

    // 底图尺寸
    state.bgNaturalWidth = tpl.layout?.background_width || 800
    state.bgNaturalHeight = tpl.layout?.background_height || 1000

    // 如果有底图 media，加载底图；回退到预览图
    const bgUrl = tpl.base_image_media?.public_url || tpl.preview_media?.public_url
    if (bgUrl) {
      state.bgImageUrl = bgUrl
    }

    logger.info('[SlotEditor] 模板加载成功', { id: state.templateId, name: state.templateName, slots: state.slots.length })
  } catch (e) {
    logger.error('[SlotEditor] 加载模板失败', e)
    alert('加载模板失败: ' + e.message)
    return
  }

  // 初始化 Konva
  initKonva()

  // 加载珠子素材（异步，不阻塞画布）
  loadMaterials()
}

function initKonva() {
  const container = document.getElementById('konva-container')
  if (!container) return

  const rect = container.getBoundingClientRect()
  state.canvasWidth = rect.width || 800
  state.canvasHeight = rect.height || 600

  state.stage = new Konva.Stage({
    container: 'konva-container',
    width: state.canvasWidth,
    height: state.canvasHeight
  })

  state.layer = new Konva.Layer()
  state.stage.add(state.layer)

  // 预览图层（珠子预览在槽位之上）
  state.previewLayer = new Konva.Layer()
  state.stage.add(state.previewLayer)

  // 添加 Transformer（缩放/旋转手柄）
  state.transformer = new Konva.Transformer({
    rotateEnabled: true,
    enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    boundBoxFunc: (oldBox, newBox) => {
      if (newBox.width < 20 || newBox.height < 15) return oldBox
      return newBox
    }
  })
  state.layer.add(state.transformer)

  // 绘制背景参考框
  drawBackground()

  // 绘制已有槽位
  state.slots.forEach((slot, idx) => renderSlot(slot, idx))

  // 点击空白区域取消选中
  state.stage.on('click tap', (e) => {
    if (e.target === state.stage || e.target.name() === 'background') {
      state.transformer.nodes([])
      state.selectedIndex = -1
      dispatchUpdate()
    }
  })

  state.layer.draw()
}

function drawBackground() {
  // 计算缩放比例，让底图适配画布
  const scaleX = state.canvasWidth / state.bgNaturalWidth
  const scaleY = state.canvasHeight / state.bgNaturalHeight
  const scale = Math.min(scaleX, scaleY) * 0.9 // 留 10% 边距

  const drawWidth = state.bgNaturalWidth * scale
  const drawHeight = state.bgNaturalHeight * scale
  const offsetX = (state.canvasWidth - drawWidth) / 2
  const offsetY = (state.canvasHeight - drawHeight) / 2

  // 存储绘制参数供坐标转换用
  state.drawRect = { x: offsetX, y: offsetY, width: drawWidth, height: drawHeight }

  // 背景矩形
  const bgRect = new Konva.Rect({
    x: offsetX,
    y: offsetY,
    width: drawWidth,
    height: drawHeight,
    fill: '#f0f4f8',
    stroke: '#cbd5e1',
    strokeWidth: 2,
    cornerRadius: 4,
    name: 'background'
  })
  state.layer.add(bgRect)

  // 如果有底图 URL，加载图片
  if (state.bgImageUrl) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const konvaImg = new Konva.Image({
        x: offsetX,
        y: offsetY,
        width: drawWidth,
        height: drawHeight,
        image: img,
        name: 'background'
      })
      // 插入到背景矩形之后、槽位之前
      state.layer.add(konvaImg)
      konvaImg.moveToBottom()
      bgRect.moveToBottom()
      state.layer.draw()
    }
    img.src = state.bgImageUrl
  }

  // 尺寸标注文字
  const label = new Konva.Text({
    x: offsetX,
    y: offsetY + drawHeight + 5,
    text: `底图: ${state.bgNaturalWidth} x ${state.bgNaturalHeight}px`,
    fontSize: 11,
    fill: '#94a3b8',
    name: 'background'
  })
  state.layer.add(label)
}

// ========== 槽位渲染 ==========
function renderSlot(slot, index) {
  const dr = state.drawRect
  const cx = dr.x + slot.x * dr.width
  const cy = dr.y + slot.y * dr.height
  const rx = (slot.width * dr.width) / 2
  const ry = (slot.height * dr.height) / 2

  const colors = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']
  const color = colors[index % colors.length]

  const group = new Konva.Group({
    x: cx,
    y: cy,
    rotation: slot.rotation || 0,
    draggable: true,
    name: `slot_${index}`
  })

  // 椭圆
  const ellipse = new Konva.Ellipse({
    radiusX: rx,
    radiusY: ry,
    fill: color + '30',
    stroke: color,
    strokeWidth: 2,
    name: `ellipse_${index}`
  })
  group.add(ellipse)

  // 标签文字
  const text = new Konva.Text({
    text: slot.label || `#${index + 1}`,
    fontSize: 12,
    fill: color,
    fontStyle: 'bold',
    align: 'center',
    verticalAlign: 'middle',
    offsetX: 0,
    offsetY: 6,
    name: `label_${index}`
  })
  // 居中
  text.offsetX(text.width() / 2)
  group.add(text)

  // 点击选中
  group.on('click tap', () => {
    state.selectedIndex = index
    state.transformer.nodes([group])
    dispatchUpdate()
    state.layer.draw()
  })

  // 拖拽结束 → 更新坐标 + 刷新预览
  group.on('dragend', () => {
    const newX = (group.x() - dr.x) / dr.width
    const newY = (group.y() - dr.y) / dr.height
    state.slots[index].x = Math.max(0, Math.min(1, parseFloat(newX.toFixed(3))))
    state.slots[index].y = Math.max(0, Math.min(1, parseFloat(newY.toFixed(3))))
    refreshSlotPreview(index)
    dispatchUpdate()
  })

  // Transformer 变换结束 → 更新尺寸和旋转 + 刷新预览
  group.on('transformend', () => {
    const scaleX = group.scaleX()
    const scaleY = group.scaleY()
    const newRx = ellipse.radiusX() * scaleX
    const newRy = ellipse.radiusY() * scaleY

    state.slots[index].width = parseFloat(((newRx * 2) / dr.width).toFixed(3))
    state.slots[index].height = parseFloat(((newRy * 2) / dr.height).toFixed(3))
    state.slots[index].rotation = parseFloat(group.rotation().toFixed(1))

    // 重置 scale（已经应用到 radius）
    group.scaleX(1)
    group.scaleY(1)
    ellipse.radiusX(newRx)
    ellipse.radiusY(newRy)

    refreshSlotPreview(index)
    dispatchUpdate()
  })

  state.layer.add(group)
  // 确保 transformer 在最上层
  state.transformer.moveToTop()
}

function rebuildCanvas() {
  if (!state.layer) return
  state.layer.destroyChildren()

  state.transformer = new Konva.Transformer({
    rotateEnabled: true,
    enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    boundBoxFunc: (oldBox, newBox) => {
      if (newBox.width < 20 || newBox.height < 15) return oldBox
      return newBox
    }
  })
  state.layer.add(state.transformer)

  drawBackground()
  state.slots.forEach((slot, idx) => renderSlot(slot, idx))
  state.layer.draw()
}

// ========== 操作方法 ==========
function addSlot() {
  const idx = state.slots.length + 1
  state.slots.push({
    slot_id: `slot_${idx}`,
    label: `槽位${idx}`,
    x: 0.5,
    y: 0.5,
    width: 0.10,
    height: 0.08,
    rotation: 0,
    allowed_shapes: ['circle', 'ellipse'],
    allowed_group_codes: [],
    allowed_diameters: [],
    render_diameter: null,
    required: false
  })
  rebuildCanvas()
  // 自动选中新槽位
  state.selectedIndex = state.slots.length - 1
  dispatchUpdate()
}

function deleteSlot(index) {
  state.slots.splice(index, 1)
  state.selectedIndex = -1
  rebuildCanvas()
  dispatchUpdate()
}

async function saveSlots() {
  if (!state.templateId) return
  state.saving = true

  try {
    const newLayout = {
      ...state.layout,
      shape: 'slots',
      slot_definitions: state.slots
    }

    const res = await updateTemplate(state.templateId, { layout: newLayout })
    if (res.success) {
      state.layout = newLayout
      logger.info('[SlotEditor] 槽位保存成功', { count: state.slots.length })
      alert('槽位标注保存成功')
    } else {
      throw new Error(res.message)
    }
  } catch (e) {
    logger.error('[SlotEditor] 保存失败', e)
    alert('保存失败: ' + e.message)
  } finally {
    state.saving = false
    dispatchUpdate()
  }
}

// ========== Alpine 组件 ==========
function dispatchUpdate() {
  window.dispatchEvent(new CustomEvent('slot-editor-update'))
}

Alpine.data('slotPropertyPanel', () => ({
  selectedSlot: null,

  init() {
    window.addEventListener('slot-editor-update', () => {
      this.selectedSlot = state.selectedIndex >= 0
        ? { ...state.slots[state.selectedIndex] }
        : null
    })
  },

  updateProp(key, value) {
    if (state.selectedIndex < 0) return
    state.slots[state.selectedIndex][key] = value
    rebuildCanvas()
    // 重新选中
    if (state.stage) {
      const group = state.layer.findOne(`.slot_${state.selectedIndex}`)
      if (group) {
        state.transformer.nodes([group])
        state.layer.draw()
      }
    }
    this.selectedSlot = { ...state.slots[state.selectedIndex] }
  },

  toggleShape(shape) {
    if (state.selectedIndex < 0) return
    const slot = state.slots[state.selectedIndex]
    if (!slot.allowed_shapes) slot.allowed_shapes = []
    const idx = slot.allowed_shapes.indexOf(shape)
    if (idx >= 0) {
      slot.allowed_shapes.splice(idx, 1)
    } else {
      slot.allowed_shapes.push(shape)
    }
    this.selectedSlot = { ...slot }
  },

  toggleDiameter(d) {
    if (state.selectedIndex < 0) return
    const slot = state.slots[state.selectedIndex]
    if (!slot.allowed_diameters) slot.allowed_diameters = []
    const idx = slot.allowed_diameters.indexOf(d)
    if (idx >= 0) {
      slot.allowed_diameters.splice(idx, 1)
    } else {
      slot.allowed_diameters.push(d)
      slot.allowed_diameters.sort((a, b) => a - b)
    }
    this.selectedSlot = { ...slot }
  },

  updateRenderDiameter(val) {
    if (state.selectedIndex < 0) return
    const slot = state.slots[state.selectedIndex]
    slot.render_diameter = val ? Number(val) : null
    this.selectedSlot = { ...slot }
  },

  deleteSelectedSlot() {
    if (state.selectedIndex < 0) return
    if (!confirm('确定删除此槽位？')) return
    deleteSlot(state.selectedIndex)
  },

  clearSlotPreview() {
    if (state.selectedIndex < 0) return
    clearPreviewFromSlot(state.selectedIndex)
    this.selectedSlot = { ...state.slots[state.selectedIndex] }
  }
}))

Alpine.data('slotListPanel', () => ({
  slots: [],
  selectedIndex: -1,

  init() {
    this.slots = state.slots
    window.addEventListener('slot-editor-update', () => {
      this.slots = [...state.slots]
      this.selectedIndex = state.selectedIndex
    })
  },

  selectSlotByIndex(idx) {
    state.selectedIndex = idx
    if (state.stage) {
      const group = state.layer.findOne(`.slot_${idx}`)
      if (group) {
        state.transformer.nodes([group])
        state.layer.draw()
      }
    }
    dispatchUpdate()
  }
}))

// ========== 珠子素材面板 ==========

const GROUP_LABELS = {
  yellow: '黄水晶', red: '红/粉水晶', orange: '橙/茶水晶',
  green: '绿水晶', blue: '蓝水晶', purple: '紫水晶'
}

async function loadMaterials() {
  try {
    const res = await getAdminMaterialList({ page_size: 200 })
    if (res.success) {
      state.materials = (res.data?.rows || []).map(m => ({
        ...m,
        image_url: m.image_media?.public_url || null
      }))
      logger.info('[SlotEditor] 珠子素材加载成功', { count: state.materials.length })
    }
  } catch (e) {
    logger.error('[SlotEditor] 加载珠子素材失败', e)
  }
}

/**
 * 将珠子图片渲染到指定槽位上（Konva.Image 预览）
 */
function renderPreviewToSlot(slotIndex, material) {
  // 清除该槽位旧的预览
  clearPreviewFromSlot(slotIndex)

  const slot = state.slots[slotIndex]
  if (!slot) return

  // 记录到 slot 数据上（非持久化，仅预览用）
  slot._previewMaterial = {
    diy_material_id: material.diy_material_id,
    display_name: material.display_name,
    diameter: material.diameter,
    price: material.price,
    image_url: material.image_url
  }

  const dr = state.drawRect
  if (!dr) return

  // 槽位坐标是相对于底图的归一化值 (0~1)，需要映射到画布上的实际像素位置
  const cx = dr.x + slot.x * dr.width
  const cy = dr.y + slot.y * dr.height
  const rw = slot.width * dr.width
  const rh = slot.height * dr.height

  if (material.image_url) {
    const img = new window.Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // 放大 15% 让珠子图片完全覆盖槽位椭圆（补偿 PNG 透明边距 + 椭圆描边）
      const scale = 1.15
      const sw = rw * 2 * scale
      const sh = rh * 2 * scale
      const kImg = new Konva.Image({
        image: img,
        x: cx - sw / 2,
        y: cy - sh / 2,
        width: sw,
        height: sh,
        rotation: slot.rotation || 0,
        offsetX: 0,
        offsetY: 0,
        name: `preview_${slotIndex}`,
        listening: false
      })
      state.previewLayer.add(kImg)
      state.previewLayer.draw()
      state.previewImages[slotIndex] = kImg
    }
    img.src = material.image_url
  } else {
    // 无图时用彩色圆形占位
    const circle = new Konva.Circle({
      x: cx,
      y: cy,
      radius: Math.min(rw, rh),
      fill: 'rgba(139, 92, 246, 0.4)',
      stroke: '#8B5CF6',
      strokeWidth: 1,
      name: `preview_${slotIndex}`,
      listening: false
    })
    state.previewLayer.add(circle)
    state.previewLayer.draw()
    state.previewImages[slotIndex] = circle
  }

  dispatchUpdate()
}

function clearPreviewFromSlot(slotIndex) {
  const existing = state.previewImages[slotIndex]
  if (existing) {
    existing.destroy()
    delete state.previewImages[slotIndex]
    state.previewLayer.draw()
  }
  if (state.slots[slotIndex]) {
    delete state.slots[slotIndex]._previewMaterial
  }
}

/**
 * 刷新指定槽位的预览图位置和大小（槽位拖拽/缩放后调用）
 * 如果该槽位没有预览，则跳过
 */
function refreshSlotPreview(slotIndex) {
  const slot = state.slots[slotIndex]
  if (!slot?._previewMaterial) return

  const existing = state.previewImages[slotIndex]
  if (!existing) return

  const dr = state.drawRect
  if (!dr) return

  const cx = dr.x + slot.x * dr.width
  const cy = dr.y + slot.y * dr.height
  const rw = slot.width * dr.width
  const rh = slot.height * dr.height

  if (existing instanceof Konva.Image) {
    // 图片类型：更新位置、尺寸、旋转（放大 15% 补偿 PNG 边距）
    const scale = 1.15
    const sw = rw * 2 * scale
    const sh = rh * 2 * scale
    existing.x(cx - sw / 2)
    existing.y(cy - sh / 2)
    existing.width(sw)
    existing.height(sh)
    existing.rotation(slot.rotation || 0)
  } else {
    // 圆形占位：更新位置和半径
    existing.x(cx)
    existing.y(cy)
    existing.radius(Math.min(rw, rh))
  }

  state.previewLayer.draw()
}

function clearAllPreviews() {
  Object.keys(state.previewImages).forEach(idx => {
    clearPreviewFromSlot(Number(idx))
  })
  dispatchUpdate()
}

Alpine.data('materialPickerPanel', () => ({
  materials: [],
  activeGroup: '',
  groups: [],
  hasSelectedSlot: false,

  init() {
    // 等材料加载完成后更新
    const checkMaterials = () => {
      if (state.materials.length > 0) {
        this.materials = state.materials
        this._buildGroups()
      } else {
        setTimeout(checkMaterials, 300)
      }
    }
    checkMaterials()

    window.addEventListener('slot-editor-update', () => {
      this.hasSelectedSlot = state.selectedIndex >= 0
    })
  },

  _buildGroups() {
    const groupMap = {}
    this.materials.forEach(m => {
      if (!groupMap[m.group_code]) groupMap[m.group_code] = 0
      groupMap[m.group_code]++
    })
    this.groups = Object.entries(groupMap).map(([code, count]) => ({
      code,
      label: GROUP_LABELS[code] || code,
      count
    })).sort((a, b) => a.label.localeCompare(b.label))
  },

  get filteredMaterials() {
    let list = this.materials
    if (this.activeGroup) {
      list = list.filter(m => m.group_code === this.activeGroup)
    }
    if (state.selectedIndex >= 0) {
      const slot = state.slots[state.selectedIndex]
      if (slot?.allowed_diameters?.length > 0) {
        list = list.map(m => ({
          ...m,
          _diameterAllowed: slot.allowed_diameters.includes(Number(m.diameter))
        }))
      } else {
        list = list.map(m => ({ ...m, _diameterAllowed: true }))
      }
    }
    return list
  },

  applyToSlot(material) {
    if (state.selectedIndex < 0) return
    renderPreviewToSlot(state.selectedIndex, material)
  }
}))

// 工具栏增加清除预览方法
Alpine.data('slotEditorToolbar', () => ({
  saving: false,

  addSlot() {
    addSlot()
  },

  async saveSlots() {
    this.saving = true
    await saveSlots()
    this.saving = false
  },

  clearAllPreviews() {
    clearAllPreviews()
  }
}))

// ========== 启动 ==========
document.addEventListener('DOMContentLoaded', () => {
  initEditor()
})

logger.info('[SlotEditor] 槽位标注编辑器模块已加载')
