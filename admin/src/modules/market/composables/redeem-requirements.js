/**
 * 兑换等级门槛配置模块（P0-2，拍板⑪）
 *
 * @file admin/src/modules/market/composables/redeem-requirements.js
 * @description 兑换商品的成长等级区间门槛配置（min/max 等级 + 生效时间窗 + 启停）
 * @version 1.0.0
 * @date 2026-07-10（以物易物与会员成长等级功能启用方案 §2.5 / §3 P0-2）
 *
 * 门槛字段（snake_case，直接对接后端原名，后端: /console/exchange/redeem-requirements）：
 * - exchange_redeem_requirement_id: 门槛配置主键（更新时携带）
 * - exchange_item_id: 兑换商品ID
 * - min_growth_level_key: 最低等级（NULL=不限；单配=「及以上」）
 * - max_growth_level_key: 最高等级（NULL=不限；单配=「及以下」；min=max=仅某等级）
 * - is_enabled: 启停开关
 * - publish_at / unpublish_at: 生效时间窗（NULL=立即生效/长期有效）
 *
 * 等级下拉数据源：GET /console/lottery-management/growth-levels（九档 v1~v9）
 */

import { logger } from '../../../utils/logger.js'
import { ExchangeAPI } from '../../../api/market/exchange.js'
import { LotteryAdvancedAPI } from '../../../api/lottery/advanced.js'

/**
 * 兑换等级门槛配置状态
 * @returns {Object} 状态对象
 */
export function useRedeemRequirementsState() {
  return {
    /** @type {Object|null} 正在配置门槛的商品（{exchange_item_id, item_name}） */
    redeemRequirementItem: null,
    /** @type {Array<Object>} 该商品现有门槛配置列表 */
    redeemRequirements: [],
    /** @type {Array<Object>} 成长等级下拉选项（启用九档，按 sort_order 升序） */
    growthLevelOptions: [],
    /** @type {Object|null} 门槛编辑表单（snake_case 与后端一致） */
    redeemRequirementForm: null,
    /** @type {boolean} 门槛列表加载中 */
    redeemRequirementLoading: false,
    /** @type {boolean} 门槛保存中 */
    redeemRequirementSaving: false
  }
}

/**
 * 兑换等级门槛配置方法
 * @returns {Object} 方法对象
 */
export function useRedeemRequirementsMethods() {
  return {
    /**
     * 打开某商品的等级门槛配置弹窗（列表 + 编辑表单）
     * @param {Object} item - 商品行数据（含 exchange_item_id / item_name）
     * @returns {Promise<void>}
     */
    async openRedeemRequirementModal(item) {
      this.redeemRequirementItem = {
        exchange_item_id: item.exchange_item_id,
        item_name: item.item_name
      }
      this.redeemRequirementForm = null
      this.showModal?.('redeemRequirementModal')
      await Promise.all([this.loadRedeemRequirements(), this.loadGrowthLevelOptions()])
    },

    /**
     * 关闭门槛配置弹窗并清理状态
     * @returns {void}
     */
    closeRedeemRequirementModal() {
      this.hideModal?.('redeemRequirementModal')
      this.redeemRequirementItem = null
      this.redeemRequirements = []
      this.redeemRequirementForm = null
    },

    /**
     * 加载当前商品的门槛配置列表
     * @returns {Promise<void>}
     */
    async loadRedeemRequirements() {
      if (!this.redeemRequirementItem) return
      this.redeemRequirementLoading = true
      try {
        const res = await ExchangeAPI.getRedeemRequirements(
          this.redeemRequirementItem.exchange_item_id
        )
        if (res.success && res.data) {
          this.redeemRequirements = Array.isArray(res.data.requirements)
            ? res.data.requirements
            : []
        } else {
          this.showError?.(res.message || '加载门槛配置失败')
        }
      } catch (e) {
        logger.error('[RedeemRequirements] 加载失败:', e)
        this.showError?.('加载门槛配置失败: ' + (e.message || '未知错误'))
      } finally {
        this.redeemRequirementLoading = false
      }
    },

    /**
     * 加载成长等级下拉选项（仅启用档，按 sort_order 升序）
     * @returns {Promise<void>}
     */
    async loadGrowthLevelOptions() {
      if (this.growthLevelOptions.length > 0) return
      try {
        const res = await LotteryAdvancedAPI.getGrowthLevels()
        this.growthLevelOptions = res?.data?.levels || []
      } catch (e) {
        logger.error('[RedeemRequirements] 加载成长等级失败:', e)
        this.showError?.('加载成长等级失败: ' + (e.message || '未知错误'))
        this.growthLevelOptions = []
      }
    },

    /**
     * 等级码 → 展示名（列表展示用）
     * @param {string|null} level_key - 等级码
     * @returns {string} 展示名（NULL=「不限」）
     */
    growthLevelName(level_key) {
      if (!level_key) return '不限'
      const level = this.growthLevelOptions.find(l => l.level_key === level_key)
      return level ? level.level_name : level_key
    },

    /**
     * 新建门槛（打开编辑表单，商品级 sku_id=NULL）
     * @returns {void}
     */
    addRedeemRequirement() {
      this.redeemRequirementForm = {
        exchange_redeem_requirement_id: null,
        exchange_item_id: this.redeemRequirementItem.exchange_item_id,
        min_growth_level_key: '',
        max_growth_level_key: '',
        is_enabled: true,
        publish_at: '',
        unpublish_at: ''
      }
    },

    /**
     * 编辑已有门槛（表单回填，datetime-local 需去掉时区尾巴）
     * @param {Object} requirement - 门槛配置行
     * @returns {void}
     */
    editRedeemRequirement(requirement) {
      /**
       * UTC 时间串 → datetime-local 输入值（北京时间本地展示）
       * @param {string|null} value - 后端 UTC ISO 时间串
       * @returns {string} datetime-local 格式（YYYY-MM-DDTHH:mm）或空串
       */
      const toLocalInput = value => {
        if (!value) return ''
        const date = new Date(value)
        if (Number.isNaN(date.getTime())) return ''
        // 转北京时间（UTC+8）后取 YYYY-MM-DDTHH:mm
        const beijing = new Date(date.getTime() + 8 * 60 * 60 * 1000)
        return beijing.toISOString().slice(0, 16)
      }
      this.redeemRequirementForm = {
        exchange_redeem_requirement_id: requirement.exchange_redeem_requirement_id,
        exchange_item_id: requirement.exchange_item_id,
        min_growth_level_key: requirement.min_growth_level_key || '',
        max_growth_level_key: requirement.max_growth_level_key || '',
        is_enabled: !!requirement.is_enabled,
        publish_at: toLocalInput(requirement.publish_at),
        unpublish_at: toLocalInput(requirement.unpublish_at)
      }
    },

    /**
     * 保存门槛配置（前端校验与后端同口径：等级区间不倒挂）
     * @returns {Promise<void>}
     */
    async saveRedeemRequirement() {
      const form = this.redeemRequirementForm
      if (!form) return

      const min_key = form.min_growth_level_key || null
      const max_key = form.max_growth_level_key || null
      if (!min_key && !max_key) {
        this.showError?.('至少配置最低或最高等级之一（双不限等于无门槛，请直接删除配置）')
        return
      }
      if (min_key && max_key) {
        const minLevel = this.growthLevelOptions.find(l => l.level_key === min_key)
        const maxLevel = this.growthLevelOptions.find(l => l.level_key === max_key)
        if (minLevel && maxLevel && Number(minLevel.sort_order) > Number(maxLevel.sort_order)) {
          this.showError?.(
            `等级区间倒挂：最低等级「${minLevel.level_name}」高于最高等级「${maxLevel.level_name}」`
          )
          return
        }
      }

      /**
       * datetime-local 输入值（北京时间）→ UTC ISO 串（后端统一 UTC 存储）
       * @param {string} value - datetime-local 值
       * @returns {string|null} UTC ISO 串或 null
       */
      const toUtcIso = value => {
        if (!value) return null
        const beijing_ms = new Date(`${value}:00+08:00`).getTime()
        return Number.isNaN(beijing_ms) ? null : new Date(beijing_ms).toISOString()
      }

      this.redeemRequirementSaving = true
      try {
        const payload = {
          exchange_item_id: form.exchange_item_id,
          min_growth_level_key: min_key,
          max_growth_level_key: max_key,
          is_enabled: !!form.is_enabled,
          publish_at: toUtcIso(form.publish_at),
          unpublish_at: toUtcIso(form.unpublish_at)
        }
        if (form.exchange_redeem_requirement_id) {
          payload.exchange_redeem_requirement_id = form.exchange_redeem_requirement_id
        }
        const res = await ExchangeAPI.saveRedeemRequirement(payload)
        if (res.success) {
          this.showSuccess?.('等级门槛已保存')
          this.redeemRequirementForm = null
          await this.loadRedeemRequirements()
        } else {
          this.showError?.(res.message || '保存门槛失败')
        }
      } catch (e) {
        logger.error('[RedeemRequirements] 保存失败:', e)
        this.showError?.('保存门槛失败: ' + (e.message || '未知错误'))
      } finally {
        this.redeemRequirementSaving = false
      }
    },

    /**
     * 删除门槛配置（硬删除，后端 DELETE）
     * @param {Object} requirement - 门槛配置行
     * @returns {Promise<void>}
     */
    async deleteRedeemRequirement(requirement) {
      this.redeemRequirementSaving = true
      try {
        const res = await ExchangeAPI.deleteRedeemRequirement(
          requirement.exchange_redeem_requirement_id
        )
        if (res.success) {
          this.showSuccess?.('等级门槛已删除')
          await this.loadRedeemRequirements()
        } else {
          this.showError?.(res.message || '删除门槛失败')
        }
      } catch (e) {
        logger.error('[RedeemRequirements] 删除失败:', e)
        this.showError?.('删除门槛失败: ' + (e.message || '未知错误'))
      } finally {
        this.redeemRequirementSaving = false
      }
    }
  }
}
