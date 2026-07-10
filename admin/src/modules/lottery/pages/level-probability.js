/**
 * 成长等级管理面板（P0-1，拍板⑫改造：定位从"B线概率倍数"改为"成长等级管理"）
 *
 * @file admin/src/modules/lottery/pages/level-probability.js
 * @description 会员成长等级九档体系的运营管理面板（2026-07-10 发放线九档阶梯上线）：
 *              1. 成长等级管理（主区块）：九档阈值 / 展示名 / 发放倍数 earn_multiplier / 状态编辑
 *                 （对接 GET/PUT /console/lottery-management/growth-levels）；
 *                 发放倍数 = 消费审核发分时可用积分与预算积分的放大倍数（拍板②发放线阶梯），
 *                 应急回滚 = 九档全部改回 1.00（拍板⑬-(b)，无需发版）。
 *              2. B线概率倍数（退役区块）：机制保留在代码中但按拍板②-(c) 不配置（默认 1.0），
 *                 区块默认收起并标注"已退役"。
 *              作为抽奖管理「策略管理」分类下的子 Tab，挂载 x-data="levelProbabilityPanel()"。
 * @version 2.0.0
 * @module lottery/pages/level-probability
 */

import { logger } from '../../../utils/logger.js'
import { Alpine, createPageMixin } from '../../../alpine/index.js'
import { request } from '../../../api/base.js'
import { LOTTERY_CORE_ENDPOINTS } from '../../../api/lottery/core.js'
import { LotteryAdvancedAPI } from '../../../api/lottery/advanced.js'

/**
 * 成长等级管理组件
 *
 * @returns {Object} Alpine.js 组件配置对象
 */
function levelProbabilityPanel() {
  return {
    ...createPageMixin(),

    /*
     * ===== 成长等级管理（主区块，P0-1） =====
     */
    /**
     * 成长等级九档列表（含编辑态字段）
     * @type {Array<{user_growth_level_id:number, level_key:string, level_name:string, min_history_points:number, earn_multiplier:number, sort_order:number, status:string, description:string}>}
     */
    levels: [],
    /** @type {boolean} 等级列表加载中 */
    loadingLevels: false,
    /** @type {Object|null} 正在编辑的等级（弹窗表单数据副本，snake_case 与后端一致） */
    editingLevel: null,
    /** @type {boolean} 等级保存中 */
    savingLevel: false,

    /*
     * ===== B线概率倍数（退役区块，拍板②-(c) 保持 1.0） =====
     */
    /** @type {boolean} 是否展开已退役的 B线概率区块 */
    showRetiredBLine: false,
    /** @type {Array} 活动列表（B线配置目标活动） */
    campaigns: [],
    /** @type {number|string} 当前选中的活动 ID */
    selectedCampaignId: '',
    /**
     * B线各成长等级倍数编辑项
     * @type {Array<{level_key:string, level_name:string, min_history_points:number, multiplier:number}>}
     */
    items: [],
    /** @type {boolean} 活动列表加载中 */
    loadingCampaigns: false,
    /** @type {boolean} B线倍数配置加载中 */
    loadingItems: false,
    /** @type {boolean} B线保存中 */
    saving: false,
    /** @type {boolean} B线是否已选择活动并加载过配置 */
    loaded: false,

    /**
     * 初始化：认证检查 + 加载成长等级阶梯（主区块）
     * B线活动列表延迟到用户展开退役区块时再加载（减少无效请求）
     * @async
     * @returns {Promise<void>}
     */
    async init() {
      logger.info('[GrowthLevelAdmin] 成长等级管理面板初始化')
      if (!this.checkAuth()) {
        logger.warn('[GrowthLevelAdmin] 认证检查未通过，跳过初始化')
        return
      }
      await this.loadGrowthLevels()
    },

    /*
     * ==================== 成长等级管理（主区块） ====================
     */

    /**
     * 加载成长等级阶梯（含停用档，运营可复核历史档位）
     * @async
     * @returns {Promise<void>}
     */
    async loadGrowthLevels() {
      this.loadingLevels = true
      try {
        const response = await LotteryAdvancedAPI.getGrowthLevels({ include_inactive: true })
        this.levels = response?.data?.levels || []
        logger.debug('[GrowthLevelAdmin] 成长等级加载完成', { count: this.levels.length })
      } catch (error) {
        logger.error('[GrowthLevelAdmin] 加载成长等级失败:', error)
        this.showError('加载成长等级失败: ' + (error.message || '未知错误'))
        this.levels = []
      } finally {
        this.loadingLevels = false
      }
    },

    /**
     * 打开等级编辑弹窗（复制一份编辑态，避免直接改列表数据）
     * @param {Object} level - 等级行数据
     * @returns {void}
     */
    openLevelEditor(level) {
      this.editingLevel = {
        user_growth_level_id: level.user_growth_level_id,
        level_key: level.level_key,
        level_name: level.level_name,
        min_history_points: level.min_history_points,
        earn_multiplier: level.earn_multiplier ?? 1.0,
        sort_order: level.sort_order,
        status: level.status,
        description: level.description || ''
      }
    },

    /**
     * 关闭等级编辑弹窗
     * @returns {void}
     */
    closeLevelEditor() {
      this.editingLevel = null
    },

    /**
     * 保存等级定义（阈值/展示名/发放倍数/状态/说明）
     * 前端防呆与后端同口径：earn_multiplier 1.00~3.00、阈值非负整数；
     * 阈值倒挂由后端权威校验（GROWTH_LEVEL_THRESHOLD_INVERSION）。
     * @async
     * @returns {Promise<void>}
     */
    async saveLevel() {
      if (!this.editingLevel) return
      const editing = this.editingLevel

      const points = Number(editing.min_history_points)
      if (!Number.isInteger(points) || points < 0) {
        this.showError('等级门槛必须为非负整数')
        return
      }
      const multiplier = Number(editing.earn_multiplier)
      if (!Number.isFinite(multiplier) || multiplier < 1.0 || multiplier > 3.0) {
        this.showError('发放倍数必须在 1.00 ~ 3.00 之间（与后端硬封顶同值）')
        return
      }
      if (!editing.level_name || !editing.level_name.trim()) {
        this.showError('等级展示名不能为空')
        return
      }

      this.savingLevel = true
      try {
        const response = await LotteryAdvancedAPI.updateGrowthLevel(
          editing.user_growth_level_id,
          {
            level_name: editing.level_name.trim(),
            min_history_points: points,
            earn_multiplier: multiplier,
            status: editing.status,
            description: editing.description
          }
        )
        if (response?.success) {
          this.showSuccess(`等级「${editing.level_name}」保存成功（60 秒内全端生效）`)
          this.closeLevelEditor()
          await this.loadGrowthLevels()
        } else {
          throw new Error(response?.message || '保存失败')
        }
      } catch (error) {
        logger.error('[GrowthLevelAdmin] 保存等级定义失败:', error)
        this.showError('保存失败: ' + (error.message || '未知错误'))
      } finally {
        this.savingLevel = false
      }
    },

    /*
     * ==================== B线概率倍数（退役区块） ====================
     * 拍板②-(c)：概率倍数常被预算闸门抵消且用户无感知，保持 0 配置（默认 1.0）。
     * 机制保留供未来活动级概率活动复用，故界面保留但默认收起并标注退役。
     */

    /**
     * 展开退役区块时才加载活动列表（惰性）
     * @async
     * @returns {Promise<void>}
     */
    async toggleRetiredBLine() {
      this.showRetiredBLine = !this.showRetiredBLine
      if (this.showRetiredBLine && this.campaigns.length === 0) {
        await this.loadCampaigns()
      }
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
        logger.debug('[GrowthLevelAdmin] 活动列表加载完成', { count: this.campaigns.length })
      } catch (error) {
        logger.error('[GrowthLevelAdmin] 加载活动列表失败:', error)
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
     * 选择活动后：加载成长等级阶梯 + 各等级当前 B线倍数，合并为可编辑项
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
        logger.debug('[GrowthLevelAdmin] B线倍数配置加载完成', {
          campaignId,
          count: this.items.length
        })
      } catch (error) {
        logger.error('[GrowthLevelAdmin] 加载B线倍数失败:', error)
        this.showError('加载B线倍数失败: ' + (error.message || '未知错误'))
        this.items = []
        this.loaded = false
      } finally {
        this.loadingItems = false
      }
    },

    /**
     * 保存各成长等级 B线中奖率倍数（退役机制，仅特殊活动需要时使用）
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
          this.showSuccess('B线概率倍数配置成功（注意：该机制已按拍板②-(c) 退役，常规运营请保持 1.0）')
          await this.loadLevelProbability()
        } else {
          throw new Error(response?.message || '保存失败')
        }
      } catch (error) {
        logger.error('[GrowthLevelAdmin] 保存B线倍数失败:', error)
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
  logger.info('[GrowthLevelAdminPanel] Alpine 组件已注册')
})

export { levelProbabilityPanel }
export default levelProbabilityPanel
