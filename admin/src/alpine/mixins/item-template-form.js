/**
 * 物品模板表单 Mixin（可复用的新建/编辑物品模板表单逻辑）
 *
 * @file admin/src/alpine/mixins/item-template-form.js
 * @description
 *   把「新建/编辑物品模板」表单的状态与方法抽成单一真相 Mixin，供两处复用：
 *   1. 物品模板管理页（system/pages/item-templates.js）——列表 + 新建/编辑；
 *   2. 兑换市场「新增商品」弹窗（market/composables/exchange-items.js）——边建模板边关联。
 *   逻辑只此一份，避免两页各写一套造成技术债。
 *
 *   宿主可覆盖 onTemplateSaved(created) 钩子接收保存结果：
 *   - 物品模板页：刷新列表；
 *   - 兑换市场页：把新模板加入下拉并回填 item_template_id。
 *
 * @version 1.0.0
 * @date 2026-07-17
 */

import { ASSET_ENDPOINTS } from '../../api/asset.js'
import { SYSTEM_ADMIN_ENDPOINTS } from '../../api/system/admin.js'
import { buildURL, request } from '../../api/base.js'
import { logger } from '../../utils/index.js'

/** 属性规则默认五档品质（与 C2C 品质文案对齐） */
function defaultQualityTiers() {
  const grades = ['完美无瑕', '精良', '良好', '普通', '微瑕']
  return grades.map(grade => ({ min: 0, max: 100, weight: 1, grade }))
}

/** 属性规则表单默认态（写入 meta.attribute_rules） */
function defaultAttributeRulesState() {
  return {
    quality_score: { enabled: false, tiers: defaultQualityTiers() },
    pattern_id: { enabled: false, min: null, max: null },
    trade_cooldown_days: 7
  }
}

/** 物品模板表单空态（新建时重置用） */
function emptyTemplateForm() {
  return {
    template_id: '',
    display_name: '',
    template_code: '',
    item_type: 'voucher',
    rarity_code: 'common',
    is_enabled: true,
    primary_media_id: null,
    reference_price_points: 0,
    value_tier: 'low',
    description: '',
    meta: '',
    use_instructions: '',
    allowed_actions: []
  }
}

export { defaultQualityTiers, defaultAttributeRulesState, emptyTemplateForm }

/**
 * 创建物品模板表单 Mixin
 * @returns {Object} 供 Alpine 组件展开的状态与方法集合
 */
export function itemTemplateFormMixin() {
  return {
    /* ==================== 表单状态 ==================== */
    /** @type {Object} 模板表单数据 */
    form: emptyTemplateForm(),
    /** @type {number|null} 限量总数上限（写入 meta.max_edition） */
    max_edition: null,
    /** @type {Object} 属性规则表单（写入 meta.attribute_rules） */
    attribute_rules: defaultAttributeRulesState(),
    /** @type {boolean} 是否正在提交 */
    is_submitting: false,
    /** @type {string|null} 图片上传预览 URL */
    image_preview_url: null,
    /** @type {boolean} 图片上传中 */
    image_uploading: false,
    /** @type {Array<Object>} 可选操作类型 */
    action_options: [
      { value: 'use', label: '直接使用（线上生效）' },
      { value: 'redeem', label: '生成核销码（到店核销）' },
      { value: 'sell', label: '上架交易市场' }
    ],
    /** @type {Object} 物品类型图标映射 */
    typeIcons: {
      prop: '🎟️',
      voucher: '🎫',
      coupon: '🎫',
      points: '💰',
      gift: '🎁',
      virtual: '✨',
      material: '📦'
    },
    /** @type {Object} 稀有度标签映射 */
    rarityLabels: {
      common: '普通',
      uncommon: '稀有',
      rare: '精良',
      epic: '史诗',
      legendary: '传说'
    },

    /**
     * 保存成功钩子（宿主可覆盖）：物品模板页刷新列表；兑换市场页回填 item_template_id
     * @param {Object} _created - 后端返回的已保存模板数据
     */
    onTemplateSaved(_created) {},

    /**
     * 重置为新建态（清空表单 + 默认属性规则 + 清预览图）
     */
    resetTemplateForm() {
      this.max_edition = null
      this.attribute_rules = defaultAttributeRulesState()
      this.form = emptyTemplateForm()
      this.image_preview_url = null
    },

    /** 获取物品类型图标 */
    getTypeIcon(itemType) {
      return this.typeIcons[itemType] || '📦'
    },

    /** 获取稀有度显示标签 */
    getRarityLabel(rarityCode, rarityObj) {
      if (rarityObj && rarityObj.display_name) return rarityObj.display_name
      return this.rarityLabels[rarityCode] || '普通'
    },

    /**
     * 提交模板表单（创建或更新）。template_code 由后端自动生成，前端不提交。
     * 成功后调用 onTemplateSaved(created) 通知宿主。
     * @returns {Promise<void>}
     */
    async submitTemplate() {
      if (this.is_submitting) return

      let meta = null
      try {
        if (this.form.meta && this.form.meta.trim()) meta = JSON.parse(this.form.meta)
      } catch (_e) {
        this.showError('格式错误', '扩展属性JSON格式错误')
        return
      }

      const finalMeta = meta || {}
      if (this.form.use_instructions && this.form.use_instructions.trim()) {
        finalMeta.use_instructions = this.form.use_instructions.trim()
      }
      if (this.form.allowed_actions && this.form.allowed_actions.length > 0) {
        finalMeta.allowed_actions = this.form.allowed_actions
      }
      finalMeta.attribute_rules = this.buildAttributeRulesPayload()

      const data = {
        display_name: this.form.display_name,
        item_type: this.form.item_type,
        rarity_code: this.form.rarity_code,
        is_enabled: this.form.is_enabled,
        primary_media_id: this.form.primary_media_id || null,
        reference_price_points: this.form.reference_price_points || 0,
        value_tier: this.form.value_tier || 'low',
        description: this.form.description || null,
        max_edition:
          this.max_edition != null &&
          this.max_edition !== '' &&
          !Number.isNaN(Number(this.max_edition))
            ? Number(this.max_edition)
            : null,
        meta: Object.keys(finalMeta).length > 0 ? finalMeta : null
      }

      if (!data.display_name) {
        this.showError('验证失败', '请填写模板名称')
        return
      }

      this.is_submitting = true
      try {
        const url = this.form.template_id
          ? buildURL(ASSET_ENDPOINTS.ITEM_TEMPLATE_UPDATE, { id: this.form.template_id })
          : ASSET_ENDPOINTS.ITEM_TEMPLATE_CREATE
        const method = this.form.template_id ? 'PUT' : 'POST'
        const response = await request({ url, method, data })

        if (response && response.success) {
          this.showSuccess(`${this.form.template_id ? '更新' : '创建'}成功`)
          this.onTemplateSaved(response.data || null)
        } else {
          this.showError('保存失败', response?.message || '操作失败')
        }
      } catch (error) {
        logger.error('保存模板失败:', error)
        this.showError('保存失败', error.message)
      } finally {
        this.is_submitting = false
      }
    },

    /**
     * 上传物品模板图片，成功后写入 form.primary_media_id + image_preview_url
     * @param {Event} event - 文件选择事件
     * @returns {Promise<void>}
     */
    async uploadTemplateImage(event) {
      const file = event.target.files?.[0]
      if (!file) return

      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!allowedTypes.includes(file.type)) {
        this.showError('格式错误', '仅支持 JPG/PNG/GIF/WebP 格式')
        return
      }
      // 上限放宽到 20MB（与后端 multer 一致）：超过 5MB 的图交后端 sharp 自动无损压缩到 5MB 内（等比缩放+降质，不裁内容）
      if (file.size > 20 * 1024 * 1024) {
        this.showError('文件过大', '图片大小不能超过 20MB（5MB 以内直接使用，5-20MB 将由系统自动压缩）')
        return
      }

      try {
        this.image_uploading = true
        const formData = new FormData()
        formData.append('image', file)
        formData.append('business_type', 'uploads')
        const res = await request({
          url: SYSTEM_ADMIN_ENDPOINTS.MEDIA_UPLOAD,
          method: 'POST',
          data: formData
        })
        if (res.success && res.data) {
          this.form.primary_media_id = res.data.media_id ?? null
          this.image_preview_url = res.data.public_url || res.data.url || null
          this.showSuccess('图片上传成功')
        } else {
          this.showError('上传失败', res.message || '图片上传失败')
        }
      } catch (e) {
        logger.error('[ItemTemplateForm] 图片上传失败:', e)
        this.showError('上传失败', '图片上传失败')
      } finally {
        this.image_uploading = false
      }
    },

    /** 清除已上传的图片 */
    clearTemplateImage() {
      this.form.primary_media_id = null
      this.image_preview_url = null
    },

    /**
     * 将接口 attribute_rules 规范化为表单状态（回显用）
     * @param {Object} raw - 接口返回的 attribute_rules
     * @returns {Object} 规范化后的表单态
     */
    normalizeAttributeRules(raw) {
      const base = defaultAttributeRulesState()
      if (!raw || typeof raw !== 'object') return base
      base.quality_score.enabled = !!raw.quality_score?.enabled
      const tiers = raw.quality_score?.tiers
      if (Array.isArray(tiers) && tiers.length > 0) {
        base.quality_score.tiers = tiers.map((t, i) => ({
          min: t.min != null ? Number(t.min) : 0,
          max: t.max != null ? Number(t.max) : 100,
          weight: t.weight != null ? Number(t.weight) : 1,
          grade: t.grade != null ? String(t.grade) : base.quality_score.tiers[i]?.grade || ''
        }))
        while (base.quality_score.tiers.length < 5) {
          base.quality_score.tiers.push({
            min: 0,
            max: 100,
            weight: 1,
            grade: defaultQualityTiers()[base.quality_score.tiers.length]?.grade || ''
          })
        }
        base.quality_score.tiers = base.quality_score.tiers.slice(0, 5)
      }
      base.pattern_id.enabled = !!raw.pattern_id?.enabled
      base.pattern_id.min = raw.pattern_id?.min != null ? Number(raw.pattern_id.min) : null
      base.pattern_id.max = raw.pattern_id?.max != null ? Number(raw.pattern_id.max) : null
      base.trade_cooldown_days =
        raw.trade_cooldown_days != null ? Number(raw.trade_cooldown_days) || 7 : 7
      return base
    },

    /**
     * 组装写入 meta 的 attribute_rules（完整结构，便于回显）
     * @returns {Object} attribute_rules 载荷
     */
    buildAttributeRulesPayload() {
      const q = this.attribute_rules?.quality_score
      const p = this.attribute_rules?.pattern_id
      const cd = this.attribute_rules?.trade_cooldown_days
      return {
        quality_score: {
          enabled: !!q?.enabled,
          tiers: (q?.tiers || defaultQualityTiers()).slice(0, 5).map(t => ({
            min: Number(t.min) || 0,
            max: Number(t.max) || 0,
            weight: Number(t.weight) || 0,
            grade: t.grade != null ? String(t.grade) : ''
          }))
        },
        pattern_id: {
          enabled: !!p?.enabled,
          min: p?.min != null && p.min !== '' ? Number(p.min) : null,
          max: p?.max != null && p.max !== '' ? Number(p.max) : null
        },
        trade_cooldown_days: cd != null && cd !== '' ? Number(cd) || 7 : 7
      }
    }
  }
}
