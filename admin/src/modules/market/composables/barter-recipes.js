/**
 * 以物易物配方管理模块
 *
 * @file admin/src/modules/market/composables/barter-recipes.js
 * @description 以物易物配方（旧物组合 → 官方产出物）的查看与全量保存
 * @version 1.0.0
 * @date 2026-06-05（合规整改 阶段六 以物易物）
 *
 * 配方字段（snake_case，直接对接后端原名）：
 * - recipe_code: 配方唯一码（业务码）
 * - name: 展示名
 * - required_item_template_id: 旧物模板ID（核销标的）
 * - required_quantity: 需消耗旧物数量
 * - output_exchange_item_id: 产出标的（官方库存 exchange_items）
 * - is_enabled: 是否启用
 * - per_user_limit: 每人限换次数（拍板⑬-(c) 防薅，0=不限）
 * - total_limit: 配方总量（拍板⑬-(c) 防薅，0=不限）
 */

import { logger } from '../../../utils/logger.js'
import { ExchangeAPI } from '../../../api/market/exchange.js'

/**
 * 以物易物配方管理状态
 * @returns {Object} 状态对象
 */
export function useBarterRecipesState() {
  return {
    /** @type {Array<Object>} 配方列表 */
    barterRecipes: [],
    /**
     * 配方限额对账（recipe_code → { total_limit, used_count, remaining }）
     * 数据源：后端换物看板 recipe_limits（库存口径拍板 2026-07-11：
     * 配方 total_limit 是换物发放总量的唯一权威，已用口径=全时段非取消订单计数）
     * @type {Object<string, {total_limit:number, used_count:number, remaining:number|null}>}
     */
    barterRecipeLimits: {},
    /** @type {boolean} 配方加载中 */
    barterLoading: false,
    /** @type {boolean} 配方保存中 */
    barterSaving: false
  }
}

/**
 * 以物易物配方管理方法
 * @returns {Object} 方法对象
 */
export function useBarterRecipesMethods() {
  return {
    /**
     * 加载配方列表
     * @returns {Promise<void>}
     */
    async loadBarterRecipes() {
      this.barterLoading = true
      try {
        const res = await ExchangeAPI.getBarterRecipes()
        if (res.success && res.data) {
          this.barterRecipes = Array.isArray(res.data.recipes) ? res.data.recipes : []
        } else {
          this.showError?.(res.message || '加载以物易物配方失败')
        }
        // 限额对账（已用/剩余）：读换物看板 recipe_limits，与配方表并排展示
        await this.loadBarterRecipeLimits()
      } catch (e) {
        logger.error('[BarterRecipes] 加载失败:', e)
        this.showError?.('加载以物易物配方失败')
      } finally {
        this.barterLoading = false
      }
    },

    /**
     * 加载配方限额对账数据（total_limit / used_count / remaining）
     * @returns {Promise<void>}
     */
    async loadBarterRecipeLimits() {
      try {
        const res = await ExchangeAPI.getBarterStats()
        const limits = res.success && Array.isArray(res.data?.recipe_limits) ? res.data.recipe_limits : []
        const map = {}
        for (const row of limits) {
          map[row.recipe_code] = row
        }
        this.barterRecipeLimits = map
      } catch (e) {
        // 对账数据加载失败不阻塞配方管理（配方 CRUD 仍可用），直接暴露错误便于排查
        logger.error('[BarterRecipes] 限额对账数据加载失败:', e)
        this.showError?.('换物限额对账数据加载失败')
      }
    },

    /**
     * 配方"已用次数"展示值（未保存的新配方/无数据显示 —）
     * @param {string} recipe_code - 配方码
     * @returns {string} 已用次数文本
     */
    barterRecipeUsedText(recipe_code) {
      const row = this.barterRecipeLimits[recipe_code]
      return row ? String(row.used_count) : '—'
    },

    /**
     * 配方"剩余额度"展示值（remaining=null 表示不限量）
     * @param {string} recipe_code - 配方码
     * @returns {string} 剩余额度文本
     */
    barterRecipeRemainingText(recipe_code) {
      const row = this.barterRecipeLimits[recipe_code]
      if (!row) return '—'
      return row.remaining === null ? '不限' : String(row.remaining)
    },

    /**
     * 新增一条空白配方（前端临时，保存后落库）
     * @returns {void}
     */
    addBarterRecipe() {
      this.barterRecipes.push({
        recipe_code: '',
        name: '',
        required_item_template_id: null,
        required_quantity: 1,
        output_exchange_item_id: null,
        is_enabled: true,
        per_user_limit: 0,
        total_limit: 0
      })
    },

    /**
     * 移除指定下标的配方（前端临时，需保存后生效）
     * @param {number} index - 下标
     * @returns {void}
     */
    removeBarterRecipe(index) {
      this.barterRecipes.splice(index, 1)
    },

    /**
     * 全量保存配方配置
     * @returns {Promise<void>}
     */
    async saveBarterRecipes() {
      // 前端基本校验：必填项 + 配方码唯一 + 限量字段非负整数（与后端 saveRecipes 同口径）
      const codes = new Set()
      for (const r of this.barterRecipes) {
        if (!r.recipe_code || !r.output_exchange_item_id || !r.required_item_template_id) {
          this.showError?.('每条配方需填写：配方码、旧物模板ID、产出商品ID')
          return
        }
        if (codes.has(r.recipe_code)) {
          this.showError?.(`配方码重复：${r.recipe_code}`)
          return
        }
        codes.add(r.recipe_code)
        for (const limit_field of ['per_user_limit', 'total_limit']) {
          if (r[limit_field] !== undefined && r[limit_field] !== null && r[limit_field] !== '') {
            const limit_value = Number(r[limit_field])
            if (!Number.isInteger(limit_value) || limit_value < 0) {
              this.showError?.(`配方 ${r.recipe_code} 的限量必须为非负整数（0=不限）`)
              return
            }
          }
        }
      }

      this.barterSaving = true
      try {
        const res = await ExchangeAPI.saveBarterRecipes(this.barterRecipes)
        if (res.success) {
          this.barterRecipes = res.data?.recipes || this.barterRecipes
          this.showSuccess?.('以物易物配方已保存')
        } else {
          this.showError?.(res.message || '保存配方失败')
        }
      } catch (e) {
        logger.error('[BarterRecipes] 保存失败:', e)
        this.showError?.('保存配方失败')
      } finally {
        this.barterSaving = false
      }
    }
  }
}
