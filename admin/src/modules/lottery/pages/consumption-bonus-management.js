/**
 * 消费加成活动管理页（多活动独立倍率，方案C）
 *
 * @module modules/lottery/pages/consumption-bonus-management
 * @description 消费加成活动规则的列表/筛选/分页/增删改查/状态开关
 * @date 2026-07-15
 *
 * 业务说明：
 * - 全平台活动（门店/商家 ID 均留空）与单商家专属活动（任一填写）并存，商家专属优先。
 * - 命中的 bonus_rate 在消费提交时锁定，与等级倍率加法叠加，受总倍数 3.0 硬封顶。
 * - snake_case 契约：字段名 = 数据库列名，前端不做映射。
 */

import { logger } from '../../../utils/index.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { ConsumptionBonusAPI } from '../../../api/lottery/consumption-bonus.js'

/** 规则状态中文映射 */
const STATUS_MAP = {
  active: { label: '生效中', color: 'bg-green-100 text-green-700' },
  inactive: { label: '已停用', color: 'bg-gray-100 text-gray-700' }
}

/** 空表单 */
function getEmptyForm() {
  return {
    rule_name: '',
    display_name: '',
    bonus_rate: 0.5,
    store_ids_text: '',
    merchant_ids_text: '',
    start_at: '',
    end_at: '',
    priority: 0,
    max_bonus_rate: 2.0,
    status: 'inactive',
    remark: ''
  }
}

/**
 * 把逗号分隔文本解析为数字数组（空文本 → null，即"不限"=全平台）
 * @param {string} text - 逗号分隔的 ID 文本
 * @returns {number[]|null} 数字数组或 null
 */
function parseCsvToIdArray(text) {
  if (!text || !String(text).trim()) return null
  const arr = String(text)
    .split(',')
    .map(v => parseInt(v.trim(), 10))
    .filter(v => !isNaN(v))
  return arr.length > 0 ? arr : null
}

document.addEventListener('alpine:init', () => {
  Alpine.data('consumptionBonusManagementPage', () => ({
    ...createPageMixin(),

    // ========== 列表 ==========
    rules: [],
    rules_loading: false,
    rules_error: '',
    filter_status: '',
    pagination: { page: 1, page_size: 20, total: 0 },

    // ========== 表单 ==========
    show_form: false,
    is_editing: false,
    editing_id: null,
    form: getEmptyForm(),

    // ========== 计算属性（单一分页状态 + getter） ==========
    get total_pages() {
      return Math.ceil(this.pagination.total / this.pagination.page_size) || 1
    },
    get has_prev_page() {
      return this.pagination.page > 1
    },
    get has_next_page() {
      return this.pagination.page < this.total_pages
    },

    // ========== 初始化 ==========
    async init() {
      logger.info('[ConsumptionBonus] 初始化...')
      await this.loadRules()
    },

    // ========== 中文映射（模板用） ==========
    statusLabel(status) {
      return (STATUS_MAP[status] && STATUS_MAP[status].label) || status
    },
    statusColor(status) {
      return (STATUS_MAP[status] && STATUS_MAP[status].color) || 'bg-gray-100 text-gray-700'
    },
    /** 活动范围标签：门店/商家任一非空=商家专属，否则全平台 */
    scopeLabel(rule) {
      const hasStore = Array.isArray(rule.store_ids) && rule.store_ids.length > 0
      const hasMerchant = Array.isArray(rule.merchant_ids) && rule.merchant_ids.length > 0
      return hasStore || hasMerchant ? '商家专属' : '全平台'
    },
    /** 加成率转百分比展示（0.5 → 50%） */
    ratePercent(rate) {
      return `${Math.round((Number(rate) || 0) * 100)}%`
    },

    // ========== 列表加载 ==========
    async loadRules() {
      this.rules_loading = true
      this.rules_error = ''
      try {
        const params = {
          page: this.pagination.page,
          page_size: this.pagination.page_size
        }
        if (this.filter_status) params.status = this.filter_status

        const res = await ConsumptionBonusAPI.getRules(params)
        if (res.success) {
          this.rules = res.data || []
          this.pagination.total = res.pagination ? res.pagination.total : 0
        } else {
          this.rules_error = res.message || '加载失败'
        }
      } catch (err) {
        this.rules_error = err.message || '网络错误'
        logger.error('[ConsumptionBonus] 加载规则失败:', err)
      } finally {
        this.rules_loading = false
      }
    },

    // ========== 分页 ==========
    async prevPage() {
      if (this.has_prev_page) {
        this.pagination.page -= 1
        await this.loadRules()
      }
    },
    async nextPage() {
      if (this.has_next_page) {
        this.pagination.page += 1
        await this.loadRules()
      }
    },
    async applyFilter() {
      this.pagination.page = 1
      await this.loadRules()
    },

    // ========== 表单：新增 / 编辑 ==========
    openAddForm() {
      this.is_editing = false
      this.editing_id = null
      this.form = getEmptyForm()
      this.show_form = true
    },
    openEditForm(rule) {
      this.is_editing = true
      this.editing_id = rule.consumption_bonus_rule_id
      this.form = {
        rule_name: rule.rule_name,
        display_name: rule.display_name,
        bonus_rate: Number(rule.bonus_rate),
        store_ids_text: Array.isArray(rule.store_ids) ? rule.store_ids.join(',') : '',
        merchant_ids_text: Array.isArray(rule.merchant_ids) ? rule.merchant_ids.join(',') : '',
        start_at: rule.start_at ? String(rule.start_at).slice(0, 16) : '',
        end_at: rule.end_at ? String(rule.end_at).slice(0, 16) : '',
        priority: rule.priority || 0,
        max_bonus_rate: Number(rule.max_bonus_rate),
        status: rule.status,
        remark: rule.remark || ''
      }
      this.show_form = true
    },
    closeForm() {
      this.show_form = false
      this.form = getEmptyForm()
    },

    // ========== 提交 ==========
    async submitForm() {
      // 前端基础校验（与后端一致，减少往返）
      if (!this.form.rule_name || !this.form.display_name) {
        Alpine.store('notification').show('规则名和展示名不能为空', 'error')
        return
      }
      const rate = Number(this.form.bonus_rate)
      const cap = Number(this.form.max_bonus_rate)
      if (!Number.isFinite(rate) || rate < 0) {
        Alpine.store('notification').show('加成率必须为非负数', 'error')
        return
      }
      if (rate > cap) {
        Alpine.store('notification').show(`加成率 ${rate} 不能超过上限 ${cap}`, 'error')
        return
      }

      const data = {
        rule_name: this.form.rule_name,
        display_name: this.form.display_name,
        bonus_rate: rate,
        store_ids: parseCsvToIdArray(this.form.store_ids_text),
        merchant_ids: parseCsvToIdArray(this.form.merchant_ids_text),
        start_at: this.form.start_at || null,
        end_at: this.form.end_at || null,
        priority: Number(this.form.priority) || 0,
        max_bonus_rate: cap,
        status: this.form.status,
        remark: this.form.remark || null
      }

      try {
        let res
        if (this.is_editing) {
          res = await ConsumptionBonusAPI.updateRule(this.editing_id, data)
        } else {
          res = await ConsumptionBonusAPI.createRule(data)
        }
        if (res.success) {
          Alpine.store('notification').show(
            this.is_editing ? '规则更新成功' : '规则创建成功',
            'success'
          )
          this.closeForm()
          await this.loadRules()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (err) {
        logger.error('[ConsumptionBonus] 提交失败:', err)
        Alpine.store('notification').show(err.message || '网络错误', 'error')
      }
    },

    // ========== 状态开关 ==========
    async toggleStatus(rule) {
      const next = rule.status === 'active' ? 'inactive' : 'active'
      try {
        const res = await ConsumptionBonusAPI.updateRuleStatus(rule.consumption_bonus_rule_id, next)
        if (res.success) {
          Alpine.store('notification').show(`已${next === 'active' ? '启用' : '停用'}`, 'success')
          await this.loadRules()
        } else {
          Alpine.store('notification').show(res.message || '操作失败', 'error')
        }
      } catch (err) {
        logger.error('[ConsumptionBonus] 切换状态失败:', err)
        Alpine.store('notification').show(err.message || '网络错误', 'error')
      }
    },

    // ========== 删除 ==========
    async confirmDelete(rule) {
      if (!confirm(`确认删除消费加成活动"${rule.display_name}"？此操作不可恢复。`)) return
      try {
        const res = await ConsumptionBonusAPI.deleteRule(rule.consumption_bonus_rule_id)
        if (res.success) {
          Alpine.store('notification').show('删除成功', 'success')
          await this.loadRules()
        } else {
          Alpine.store('notification').show(res.message || '删除失败', 'error')
        }
      } catch (err) {
        logger.error('[ConsumptionBonus] 删除失败:', err)
        Alpine.store('notification').show(err.message || '网络错误', 'error')
      }
    }
  }))
})
