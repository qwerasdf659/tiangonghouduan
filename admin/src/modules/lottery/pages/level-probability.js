/**
 * 成长等级公示分级概率管理面板（B 线，2026-06 合规改造）
 *
 * @file admin/src/modules/lottery/pages/level-probability.js
 * @description per-user 暗箱干预下线后，「让某类人更易中」改为「按成长等级的公示分级概率」。
 *              本面板：选择活动 → 读取成长等级阶梯（growth-levels）+ 各等级当前中奖率倍数
 *              （level-probability）→ 编辑各等级 multiplier → 保存（PUT level-probability）。
 *              作为抽奖管理「策略管理」分类下的一个子 Tab，挂载为嵌套 Alpine 组件
 *              x-data="levelProbabilityPanel()"。
 * @version 1.0.0
 * @module lottery/pages/level-probability
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { request } from '../../../api/base.js'
import { LOTTERY_CORE_ENDPOINTS } from '../../../api/lottery/core.js'
import { LotteryAdvancedAPI } from '../../../api/lottery/advanced.js'

/**
 * 成长等级公示分级概率管理组件
 *
 * @returns {Object} Alpine.js 组件配置对象
 */
function levelProbabilityPanel() {
  return {
    ...createPageMixin(),

    /** @type {Array} 活动列表（供选择配置目标活动） */
    campaigns: [],
    /** @type {number|string} 当前选中的活动 ID */
    selectedCampaignId: '',
    /**
     * 各成长等级倍数编辑项
     * @type {Array<{level_key:string, level_name:string, min_history_points:number, multiplier:number}>}
     */
    items: [],
    /** @type {boolean} 活动列表加载中 */
    loadingCampaigns: false,
    /** @type {boolean} 倍数配置加载中 */
    loadingItems: false,
    /** @type {boolean} 保存中 */
    saving: false,
    /** @type {boolean} 是否已选择活动并加载过配置 */
    loaded: false,

    /**
     * 初始化：认证检查 + 加载活动列表
     * @async
     * @returns {Promise<void>}
     */
    async init() {
      logger.info('[LevelProbability] 成长等级公示分级概率面板初始化')
      if (!this.checkAuth()) {
        logger.warn('[LevelProbability] 认证检查未通过，跳过初始化')
        return
      }
      await this.loadCampaigns()
    },

    /**
     * 加载活动列表
     * @async
     * @returns {Promise<void>}
     */
    async loadCampaigns() {
      this.loadingCampaigns = true
      try {
        const response = await request({ url: LOTTERY_CORE_ENDPOINTS.CAMPAIGN_LIST, method: 'GET' })
        const data = response?.data || response
        this.campaigns = Array.isArray(data?.campaigns)
          ? data.campaigns
          : Array.isArray(data?.list)
            ? data.list
            : Array.isArray(data)
              ? data
              : []
        logger.debug('[LevelProbability] 活动列表加载完成', { count: this.campaigns.length })
      } catch (error) {
        logger.error('[LevelProbability] 加载活动列表失败:', error)
        this.showError('加载活动列表失败: ' + (error.message || '未知错误'))
        this.campaigns = []
      } finally {
        this.loadingCampaigns = false
      }
    },

    /**
     * 活动名称展示（兼容 name / campaign_name）
     * @param {Object} c - 活动对象
     * @returns {string} 展示名称
     */
    campaignLabel(c) {
      return c.name || c.campaign_name || `活动${c.lottery_campaign_id}`
    },

    /**
     * 选择活动后：加载成长等级阶梯 + 各等级当前倍数，合并为可编辑项
     * @async
     * @returns {Promise<void>}
     */
    async loadLevelProbability() {
      if (!this.selectedCampaignId) {
        this.items = []
        this.loaded = false
        return
      }

      this.loadingItems = true
      try {
        const campaignId = parseInt(this.selectedCampaignId, 10)
        // 并行获取成长等级阶梯定义（公示）与该活动各等级中奖率倍数
        const [levelsResp, probResp] = await Promise.all([
          LotteryAdvancedAPI.getGrowthLevels(),
          LotteryAdvancedAPI.getLevelProbability(campaignId)
        ])

        const levels = levelsResp?.data?.levels || []
        const probItems = probResp?.data?.items || []
        const multiplierMap = new Map(probItems.map(it => [it.level_key, it]))

        // 以成长等级阶梯为基准（按 sort_order 排序），合并当前倍数
        this.items = levels.map(level => {
          const prob = multiplierMap.get(level.level_key)
          return {
            level_key: level.level_key,
            level_name: level.level_name,
            min_history_points: level.min_history_points,
            multiplier: prob?.multiplier ?? 1.0
          }
        })
        this.loaded = true
        logger.debug('[LevelProbability] 倍数配置加载完成', {
          campaignId,
          count: this.items.length
        })
      } catch (error) {
        logger.error('[LevelProbability] 加载成长等级倍数失败:', error)
        this.showError('加载成长等级倍数失败: ' + (error.message || '未知错误'))
        this.items = []
        this.loaded = false
      } finally {
        this.loadingItems = false
      }
    },

    /**
     * 保存各成长等级中奖率倍数
     * @async
     * @returns {Promise<void>}
     */
    async saveLevelProbability() {
      if (!this.selectedCampaignId) {
        this.showError('请先选择活动')
        return
      }
      if (!this.items.length) {
        this.showError('没有可保存的成长等级配置')
        return
      }

      // 前端校验：倍数必须为正数
      for (const item of this.items) {
        const num = Number(item.multiplier)
        if (!Number.isFinite(num) || num <= 0) {
          this.showError(`等级「${item.level_name}」的倍数必须为正数`)
          return
        }
      }

      this.saving = true
      try {
        const campaignId = parseInt(this.selectedCampaignId, 10)
        const payload = this.items.map(item => ({
          level_key: item.level_key,
          multiplier: Number(item.multiplier)
        }))
        const response = await LotteryAdvancedAPI.updateLevelProbability(campaignId, payload)
        if (response?.success) {
          this.showSuccess('成长等级公示分级概率配置成功')
          await this.loadLevelProbability()
        } else {
          throw new Error(response?.message || '保存失败')
        }
      } catch (error) {
        logger.error('[LevelProbability] 保存成长等级倍数失败:', error)
        this.showError('保存失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    }
  }
}

// Alpine.js 组件注册（嵌套于抽奖管理「策略管理」分类的子 Tab）
document.addEventListener('alpine:init', () => {
  Alpine.data('levelProbabilityPanel', levelProbabilityPanel)
  logger.info('[LevelProbabilityPanel] Alpine 组件已注册')
})

export { levelProbabilityPanel }
export default levelProbabilityPanel
