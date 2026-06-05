/**
 * 奖品管理模块
 *
 * @file admin/src/modules/lottery/composables/prizes.js
 * @description 奖品的 CRUD 操作、库存管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import Sortable from 'sortablejs'
import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS, PRIZE_DEFINITION_ENDPOINTS } from '../../../api/lottery/index.js'
import { MERCHANT_ENDPOINTS } from '../../../api/merchant.js'
import { buildURL } from '../../../api/base.js'
import { imageUploadMixin } from '../../../alpine/mixins/image-upload.js'

/**
 * 奖品管理状态
 * @returns {Object} 状态对象
 *
 * 集中奖品目录架构：
 * - lottery_campaign_prizes 表仅存储活动级参数
 * - 通过 prize_definition_id 引用 prize_definitions 表
 * - 活动级字段：win_weight, stock_quantity, reward_tier, is_fallback, sort_order, status
 */
export function usePrizesState() {
  return {
    ...imageUploadMixin(),
    /** @type {string|null} 奖品图片预览URL（编辑/上传时的本地预览） */
    prize_image_preview_url: null,
    /** @type {Array} 奖品列表 */
    prizes: [],
    /** @type {Object} 奖品筛选条件 */
    prizeFilters: { prize_type: '', status: '', keyword: '', merchant_id: '' },
    /** @type {Array} 商家下拉选项列表（来自 /api/v4/console/merchants/options） */
    merchantOptions: [],
    /** @type {Array} 奖品目录下拉选项（来自 prize-definitions/options） */
    prizeDefinitionOptions: [],
    /** @type {Object} 奖品编辑表单 - 集中奖品目录架构，仅活动级参数 */
    prizeForm: {
      lottery_campaign_id: null,
      prize_definition_id: null,
      win_weight: 100000,
      stock_quantity: 100,
      reward_tier: 'low',
      is_fallback: false,
      sort_order: 1,
      status: 'active',
      max_daily_wins: null,
      max_user_wins: null
    },
    /** @type {Array} 稀有度选项（来自 rarity_defs 表，5级） */
    rarityOptions: [
      { value: 'common', label: '普通', color: '#9E9E9E' },
      { value: 'uncommon', label: '稀有', color: '#4CAF50' },
      { value: 'rare', label: '精良', color: '#2196F3' },
      { value: 'epic', label: '史诗', color: '#9C27B0' },
      { value: 'legendary', label: '传说', color: '#FF9800' }
    ],
    /** @type {number|string|null} 当前编辑的奖品ID - 使用后端字段名 */
    editingLotteryPrizeId: null,
    /** @type {Array} 同档位其他奖品列表（编辑时从已加载的奖品数据中过滤） */
    sameTierPrizes: [],
    /** @type {Object} 库存补充表单 - 使用后端字段名 */
    stockForm: { lottery_campaign_prize_id: null, prize_name: '', quantity: 1 },

    // ========== 批量添加奖品 ==========
    /** @type {number|null} 批量添加奖品的目标活动ID - 使用后端字段名 */
    batchLotteryCampaignId: null,
    /** @type {Array} 批量奖品列表 */
    batchPrizes: [],
    /** @type {number} 批量奖品概率总和 */
    batchProbabilitySum: 0,

    // ========== 活动级奖品管理状态（任务11-14） ==========
    /** @type {boolean} 奖品管理面板是否可见 */
    prizeManagerVisible: false,
    /** @type {Object|null} 当前管理奖品的活动对象 */
    managingCampaign: null,
    /** @type {Array} 按档位分组的奖品列表 */
    campaignPrizeGroups: [],
    /** @type {Array} 风险警告列表（不阻止操作） */
    campaignPrizeWarnings: [],
    /** @type {Array} 阻断性错误列表（阻止发布） */
    campaignPrizeErrors: [],
    /** @type {boolean} 排序模式开关 */
    prizeManagerSortMode: false,
    /** @type {Array} 批量库存调整项目 */
    batchStockItems: [],

    // ========== P2新增: 奖品发放统计 ==========
    /** @type {Object} 奖品发放统计汇总 */
    prizeIssuedStats: {
      total_issued: 0, // 总发放数量
      total_value: 0, // 总发放价值
      today_issued: 0, // 今日发放数量
      low_stock_count: 0 // 低库存奖品数量
    },
    /** @type {Array} 按奖品的发放明细 */
    prizeDistributionDetail: []
  }
}

/**
 * 奖品管理方法
 * @returns {Object} 方法对象
 */
export function usePrizesMethods() {
  return {
    /**
     * 加载商家下拉选项（供筛选器使用）
     * 后端返回：[{ merchant_id, merchant_name, merchant_type }]
     */
    async loadMerchantOptions() {
      try {
        const response = await this.apiGet(MERCHANT_ENDPOINTS.OPTIONS, {}, { showLoading: false })
        const data = response?.success ? response.data : response
        this.merchantOptions = Array.isArray(data) ? data : []
        logger.debug('[Prizes] 商家选项加载完成', { count: this.merchantOptions.length })
      } catch (error) {
        logger.warn('[Prizes] 加载商家选项失败', error)
        this.merchantOptions = []
      }
    },

    /**
     * 加载奖品目录下拉选项
     * 后端返回：[{ prize_definition_id, prize_name, prize_type, rarity_code, ... }]
     */
    async loadPrizeDefinitionOptions() {
      try {
        const response = await this.apiGet(
          PRIZE_DEFINITION_ENDPOINTS.OPTIONS,
          {},
          { showLoading: false }
        )
        const data = response?.success ? response.data : response
        this.prizeDefinitionOptions = Array.isArray(data) ? data : []
        logger.debug('[Prizes] 奖品目录选项加载完成', {
          count: this.prizeDefinitionOptions.length
        })
      } catch (error) {
        logger.warn('[Prizes] 加载奖品目录选项失败', error)
        this.prizeDefinitionOptions = []
      }
    },

    /**
     * 加载奖品列表
     * 后端返回字段: lottery_campaign_prize_id, prize_name (from join), prize_definition_id,
     *               win_weight, stock_quantity, reward_tier, is_fallback, sort_order, status
     */
    async loadPrizes() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.page_size)
        // 使用后端字段名
        if (this.prizeFilters.prize_type) {
          params.append('prize_type', this.prizeFilters.prize_type)
        }
        if (this.prizeFilters.status) {
          params.append('status', this.prizeFilters.status)
        }
        if (this.prizeFilters.keyword) {
          params.append('keyword', this.prizeFilters.keyword)
        }
        if (this.prizeFilters.merchant_id) {
          params.append('merchant_id', this.prizeFilters.merchant_id)
        }

        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.PRIZE_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        logger.debug('[Prizes] API 返回数据:', response)

        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        logger.debug('[Prizes] 解包后数据:', data)

        if (data) {
          this.prizes = data.prizes || data.list || []
          // 更新分页信息
          if (data.pagination) {
            this.total_pages = data.pagination.total_pages || 1
            this.totalCount = data.pagination.total || 0
          }
          logger.debug('[Prizes] 数据加载完成, prizes:', this.prizes.length)
        }
      } catch (error) {
        logger.error('[Prizes] loadPrizes 失败:', error)
        this.prizes = []
      }
    },

    /**
     * 打开创建奖品模态框
     */
    openCreatePrizeModal() {
      this.editingLotteryPrizeId = null
      this.isEditMode = false
      this.prize_image_preview_url = null
      this.prizeForm = {
        lottery_campaign_id: this.campaigns?.[0]?.lottery_campaign_id || null,
        prize_definition_id: null,
        win_weight: 100000,
        stock_quantity: 100,
        reward_tier: 'low',
        is_fallback: false,
        sort_order: 1,
        status: 'active',
        max_daily_wins: null,
        max_user_wins: null
      }
      this.loadPrizeDefinitionOptions()
      this.showModal('prizeModal')
    },

    /**
     * 编辑奖品
     * @param {Object} prize - 奖品对象（后端字段名）
     */
    editPrize(prize) {
      this.editingLotteryPrizeId = prize.lottery_campaign_prize_id
      this.isEditMode = true
      this.prize_image_preview_url = null
      this.prizeForm = {
        lottery_campaign_prize_id: prize.lottery_campaign_prize_id,
        lottery_campaign_id: prize.lottery_campaign_id || null,
        prize_definition_id: prize.prize_definition_id || null,
        win_weight: prize.win_weight || 100000,
        stock_quantity: prize.stock_quantity || 100,
        reward_tier: prize.reward_tier || 'low',
        is_fallback: prize.is_fallback || false,
        sort_order: prize.sort_order || 1,
        status: prize.status || 'active',
        max_daily_wins: prize.max_daily_wins ?? null,
        max_user_wins: prize.max_user_wins ?? null
      }
      this._loadSameTierPrizes(prize)
      this.showModal('prizeModal')
    },

    /**
     * 加载同档位其他奖品用于对比参照
     * 从已加载的 prizes 列表中过滤同 reward_tier 的奖品
     * @param {Object} currentPrize - 当前编辑的奖品
     * @private
     */
    _loadSameTierPrizes(currentPrize) {
      const tier = currentPrize.reward_tier || 'low'
      const campaignId = currentPrize.lottery_campaign_id
      const sameTier = (this.prizes || []).filter(
        p => p.reward_tier === tier && p.lottery_campaign_id === campaignId
      )
      const totalWeight = sameTier.reduce((sum, p) => sum + (p.win_weight || 0), 0)
      this.sameTierPrizes = sameTier.map(p => ({
        lottery_campaign_prize_id: p.lottery_campaign_prize_id,
        prize_name: p.prize_name,
        win_weight: p.win_weight || 0,
        tier_percentage:
          totalWeight > 0 ? parseFloat((((p.win_weight || 0) / totalWeight) * 100).toFixed(2)) : 0,
        stock_quantity: p.stock_quantity || 0,
        remaining_quantity: Math.max(0, (p.stock_quantity || 0) - (p.total_win_count || 0))
      }))
    },

    /**
     * 切换奖品启用状态
     * 后端无独立 toggle 端点，使用 PUT /prize/:id 更新 status 字段
     * @param {Object} prize - 奖品对象（后端字段名）
     */
    async togglePrize(prize) {
      const isActive = prize.status === 'active'
      const newStatus = isActive ? 'inactive' : 'active'
      await this.confirmAndExecute(
        `确认${!isActive ? '启用' : '禁用'}奖品「${prize.prize_name}」？`,
        async () => {
          await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.PRIZE_UPDATE, {
              id: prize.lottery_campaign_prize_id
            }),
            { method: 'PUT', data: { status: newStatus } }
          )
          this.loadPrizes()
        },
        { successMessage: `奖品已${!isActive ? '启用' : '禁用'}` }
      )
    },

    /**
     * 删除奖品
     * @param {Object} prize - 奖品对象（后端字段名）
     */
    async deletePrize(prize) {
      await this.confirmAndExecute(
        `确认删除奖品「${prize.prize_name}」？`,
        async () => {
          // apiCall 成功时返回 response.data，失败时抛出错误
          await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.PRIZE_DELETE, {
              id: prize.lottery_campaign_prize_id
            }),
            { method: 'DELETE' }
          )
          // 如果没有抛出错误，则表示成功
          this.loadPrizes()
        },
        { successMessage: '奖品已删除' }
      )
    },

    /**
     * 提交奖品表单
     * 使用后端字段名直接提交
     * 新增奖品使用batch-add端点，编辑使用prize/:id端点
     */
    async submitPrizeForm() {
      if (!this.isEditMode && !this.prizeForm.prize_definition_id) {
        this.showError('请选择奖品目录')
        return
      }

      if (!this.isEditMode && !this.prizeForm.lottery_campaign_id) {
        this.showError('请选择所属活动')
        return
      }

      try {
        this.saving = true

        if (this.isEditMode) {
          const url = buildURL(LOTTERY_ENDPOINTS.PRIZE_UPDATE, {
            id: this.editingLotteryPrizeId
          })
          const updateData = {
            win_weight: parseInt(this.prizeForm.win_weight) || 100000,
            stock_quantity: this.prizeForm.stock_quantity,
            reward_tier: this.prizeForm.reward_tier || 'low',
            is_fallback: this.prizeForm.is_fallback ? 1 : 0,
            sort_order: parseInt(this.prizeForm.sort_order) || 1,
            status: this.prizeForm.status
          }
          if (this.prizeForm.max_daily_wins !== null && this.prizeForm.max_daily_wins !== '') {
            updateData.max_daily_wins = parseInt(this.prizeForm.max_daily_wins)
          }
          if (this.prizeForm.max_user_wins !== null && this.prizeForm.max_user_wins !== '') {
            updateData.max_user_wins = parseInt(this.prizeForm.max_user_wins)
          }
          await this.apiCall(url, { method: 'PUT', data: updateData })
        } else {
          const stockQuantity =
            this.prizeForm.stock_quantity === -1 ? 999999 : this.prizeForm.stock_quantity

          const prizeData = {
            prize_definition_id: this.prizeForm.prize_definition_id,
            win_weight: parseInt(this.prizeForm.win_weight) || 100000,
            stock_quantity: stockQuantity,
            reward_tier: this.prizeForm.reward_tier || 'low',
            is_fallback: this.prizeForm.is_fallback ? 1 : 0,
            sort_order: parseInt(this.prizeForm.sort_order) || 1
          }
          await this.apiCall(LOTTERY_ENDPOINTS.PRIZE_BATCH_ADD, {
            method: 'POST',
            data: {
              lottery_campaign_id: this.prizeForm.lottery_campaign_id,
              prizes: [prizeData]
            }
          })
        }

        this.showSuccess(this.isEditMode ? '奖品更新成功' : '奖品创建成功')
        this.hideModal('prizeModal')
        await this.loadPrizes()
      } catch (error) {
        this.showError('保存奖品失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 获取奖品类型文本
     * @param {string} prize_type - 奖品类型（后端字段名）
     * @returns {string} 类型文本
     */
    // ✅ 已删除 getPrizeTypeText 映射函数 - 改用后端 _display 字段（P2 中文化）

    /**
     * 打开奖品补货模态框
     * @param {Object} prize - 奖品对象（后端字段名）
     */
    openStockModal(prize) {
      this.stockForm = {
        lottery_campaign_prize_id: prize.lottery_campaign_prize_id,
        prize_name: prize.prize_name,
        quantity: 1
      }
      this.showModal('stockModal')
    },

    /**
     * 提交奖品补货
     */
    async submitAddStock() {
      if (!this.stockForm.lottery_campaign_prize_id) {
        this.showError('奖品信息无效')
        return
      }
      if (!this.stockForm.quantity || this.stockForm.quantity <= 0) {
        this.showError('请输入有效的补货数量')
        return
      }

      try {
        this.saving = true
        // apiCall 成功时返回 response.data，失败时抛出错误
        await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.PRIZE_ADD_STOCK, {
            id: this.stockForm.lottery_campaign_prize_id
          }),
          {
            method: 'POST',
            data: { quantity: parseInt(this.stockForm.quantity) }
          }
        )

        // 如果没有抛出错误，则表示成功
        this.showSuccess(`已成功补充 ${this.stockForm.quantity} 件库存`)
        this.hideModal('stockModal')
        await this.loadPrizes()
      } catch (error) {
        this.showError('补货失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 判断奖品是否启用
     * @param {Object} prize - 奖品对象
     * @returns {boolean} 是否启用
     */
    isPrizeActive(prize) {
      return prize.status === 'active'
    },

    // ========== P2新增: 奖品发放统计方法 ==========

    /**
     * 加载奖品发放统计
     * 从监控 API 获取 prize_stats 数据
     */
    async loadPrizeIssuedStats() {
      try {
        logger.info('[Prizes] 加载奖品发放统计')

        // 使用监控统计 API 获取 prize_stats
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.MONITORING_STATS}?time_range=today`,
          {},
          { showLoading: false }
        )

        const data = response?.success ? response.data : response

        if (data) {
          // 从 prize_stats 计算汇总
          const prizeStats = data.prize_stats || []

          this.prizeDistributionDetail = prizeStats

          // 计算汇总数据
          let totalIssued = 0
          let totalValue = 0
          let lowStockCount = 0

          prizeStats.forEach(stat => {
            totalIssued += stat.issued_count || stat.count || 0
            totalValue += stat.total_value || 0
          })

          // 从当前奖品列表检查低库存
          this.prizes.forEach(prize => {
            const stock = prize.stock_quantity || 0
            if (stock > 0 && stock < 100 && stock !== 999999) {
              lowStockCount++
            }
          })

          this.prizeIssuedStats = {
            total_issued: totalIssued,
            total_value: totalValue,
            today_issued: totalIssued, // 今日发放（与 totalIssued 相同，因为筛选了 today）
            low_stock_count: lowStockCount
          }

          logger.info('[Prizes] 发放统计加载完成', this.prizeIssuedStats)
        }
      } catch (error) {
        logger.error('[Prizes] 加载发放统计失败:', error)
        // 保持默认值
      }
    },

    /**
     * 计算奖品发放比例（百分比）
     * @param {Object} stat - 奖品统计对象
     * @returns {number} 发放比例
     */
    getPrizeIssuedPercentage(stat) {
      const total = this.prizeIssuedStats.total_issued
      if (total === 0) return 0
      return (((stat.issued_count || stat.count || 0) / total) * 100).toFixed(1)
    },

    // ========== 活动级奖品管理（任务11-14） ==========

    /**
     * 打开某活动的奖品管理面板
     * 加载按档位分组的奖品数据
     * @param {Object} campaign - 活动对象
     */
    async openPrizeManager(campaign) {
      this.managingCampaign = campaign
      this.prizeManagerVisible = true
      this.prizeManagerSortMode = false
      await this.loadCampaignGroupedPrizes()
    },

    /** 关闭活动奖品管理面板 */
    closePrizeManager() {
      this.prizeManagerVisible = false
      this.managingCampaign = null
      this.campaignPrizeGroups = []
      this.campaignPrizeWarnings = []
      this.campaignPrizeErrors = []
    },

    /**
     * 加载活动奖品分组数据（调用 grouped API）
     * 加载完成后自动执行档位权重校验
     */
    async loadCampaignGroupedPrizes() {
      if (!this.managingCampaign?.campaign_code) return
      try {
        const response = await this.apiGet(
          buildURL(LOTTERY_ENDPOINTS.PRIZE_GROUPED, { code: this.managingCampaign.campaign_code }),
          {},
          { showLoading: false }
        )
        const data = response?.success ? response.data : response
        if (data) {
          this.campaignPrizeGroups = data.prize_groups || []
          this.campaignPrizeWarnings = data.warnings || []
          this.validateTierWeights()
        }
      } catch (error) {
        logger.error('[Prizes] 加载活动奖品分组失败:', error)
        this.showError('加载奖品分组失败')
      }
    },

    /**
     * 活动奖品综合校验（前端侧）
     *
     * 业务规则：
     * 1. 每个档位内所有激活奖品的 win_weight 之和 = 1,000,000（百万分制）
     * 2. D11: fallback 奖品必须恰好 1 个
     * 3. low 档非 fallback 奖品至少一个 prize_value_points > 0（避免阈值回退）
     * 4. D13: 奖品总数匹配 display_mode 格位数
     *
     * D11 fallback 数量、D13 格位精确匹配 → campaignPrizeErrors（阻止发布）
     * 权重偏差、灵活格位范围、low 档预算 → campaignPrizeWarnings（仅提示）
     */
    validateTierWeights() {
      const WEIGHT_SCALE = 1000000
      const tierLabels = { high: '高档位 (high)', mid: '中档位 (mid)', low: '低档位 (low)' }
      this.campaignPrizeErrors = []

      const allActivePrizes = []

      this.campaignPrizeGroups.forEach(group => {
        const activePrizes = (group.prizes || []).filter(p => p.status === 'active')
        allActivePrizes.push(...activePrizes)
        if (activePrizes.length === 0) return

        const totalWeight = activePrizes.reduce((sum, p) => sum + (parseInt(p.win_weight) || 0), 0)
        const tierName = tierLabels[group.tier] || group.tier

        if (totalWeight !== WEIGHT_SCALE) {
          const diff = totalWeight - WEIGHT_SCALE
          const diffText =
            diff > 0 ? `超出 ${diff.toLocaleString()}` : `不足 ${Math.abs(diff).toLocaleString()}`
          const warning = `⚠️ ${tierName} 权重总和 ${totalWeight.toLocaleString()} ≠ ${WEIGHT_SCALE.toLocaleString()}（${diffText}），请调整后再上线活动`

          if (!this.campaignPrizeWarnings.includes(warning)) {
            this.campaignPrizeWarnings.push(warning)
          }
          logger.warn('[Prizes] 权重校验不通过:', warning)
        }
      })

      // D11: fallback 数量校验 → 升级为 error（阻止发布）
      const fallbackPrizes = allActivePrizes.filter(p => p.is_fallback)
      if (fallbackPrizes.length !== 1) {
        const errMsg =
          `❌ Fallback（保底）奖品必须恰好 1 个，当前 ${fallbackPrizes.length} 个。` +
          (fallbackPrizes.length === 0
            ? '缺少保底奖品会导致极端情况下抽奖失败'
            : '多个保底奖品增加运营复杂度且无额外安全性')
        this.campaignPrizeErrors.push(errMsg)
      }

      // low 档 prize_value_points 校验
      const lowGroup = this.campaignPrizeGroups.find(g => g.tier === 'low')
      if (lowGroup) {
        const lowNonFallback = (lowGroup.prizes || []).filter(
          p => p.status === 'active' && !p.is_fallback
        )
        const allZeroPvp =
          lowNonFallback.length > 0 &&
          lowNonFallback.every(p => !p.prize_value_points || parseInt(p.prize_value_points) === 0)
        if (allZeroPvp) {
          const warning =
            '🚨 低档位（low）非保底奖品的预算价值全部为 0，会导致动态阈值异常回退。' +
            '至少一个非保底奖品的预算价值应 > 0'
          if (!this.campaignPrizeWarnings.includes(warning)) {
            this.campaignPrizeWarnings.push(warning)
          }
        }
      }

      // D13: 格位数量校验
      if (this.managingCampaign?.display_mode) {
        const display_mode = this.managingCampaign.display_mode
        const FIXED_SLOTS = { grid_3x3: 8, grid_4x3: 12, grid_4x4: 16 }
        const FLEXIBLE_RANGE = {
          wheel: { min: 4, max: 12 },
          card_flip: { min: 4, max: 20 },
          scratch_card: { min: 4, max: 16 }
        }
        const DEFAULT_RANGE = { min: 4, max: 20 }
        const prizeCount = allActivePrizes.length

        if (FIXED_SLOTS[display_mode]) {
          const expected = FIXED_SLOTS[display_mode]
          if (prizeCount !== expected) {
            // 固定格位 → error 阻止发布
            const errMsg = `❌ ${display_mode} 玩法需要恰好 ${expected} 个奖品，当前 ${prizeCount} 个`
            this.campaignPrizeErrors.push(errMsg)
          }
        } else {
          const range = FLEXIBLE_RANGE[display_mode] || DEFAULT_RANGE
          if (prizeCount < range.min || prizeCount > range.max) {
            const warning = `⚠️ ${display_mode} 玩法建议 ${range.min}-${range.max} 个奖品，当前 ${prizeCount} 个`
            if (!this.campaignPrizeWarnings.includes(warning)) {
              this.campaignPrizeWarnings.push(warning)
            }
          }
        }
      }

      // W4: 奖品命名负面词校验
      const NEGATIVE_WORDS = ['谢谢参与', '下次好运', '未中奖', '很遗憾', '再试一次', '安慰']
      allActivePrizes.forEach(p => {
        const name = p.prize_name || ''
        const matched = NEGATIVE_WORDS.filter(w => name.includes(w))
        if (matched.length > 0) {
          const warning = `⚠️ 奖品「${name}」包含负面词（${matched.join('、')}），建议使用正向命名`
          if (!this.campaignPrizeWarnings.includes(warning)) {
            this.campaignPrizeWarnings.push(warning)
          }
        }
      })
    },

    /**
     * 调用后端 validateForLaunch 接口，执行完整的上线前校验
     * 将后端返回的 errors/warnings 合并到前端展示
     */
    async validateForLaunch() {
      if (!this.managingCampaign?.lottery_campaign_id) {
        this.showError('请先选择一个活动')
        return
      }
      try {
        this.saving = true
        const url = buildURL(LOTTERY_ENDPOINTS.CAMPAIGN_BUDGET_VALIDATE_LAUNCH, {
          lottery_campaign_id: this.managingCampaign.lottery_campaign_id
        })
        const result = await this.apiCall(url, { method: 'POST' })

        this.campaignPrizeErrors = []
        this.campaignPrizeWarnings = []

        if (result.can_launch) {
          this.showSuccess('✅ 上线校验全部通过，活动可以安全上线')
        } else {
          if (result.errors && result.errors.length > 0) {
            this.campaignPrizeErrors = result.errors.map(e =>
              typeof e === 'string' ? `❌ ${e}` : `❌ [${e.code || ''}] ${e.message || e}`
            )
          }
          if (result.warnings && result.warnings.length > 0) {
            this.campaignPrizeWarnings = result.warnings.map(w =>
              typeof w === 'string' ? `⚠️ ${w}` : `⚠️ [${w.code || ''}] ${w.message || w}`
            )
          }
          this.showError(
            `上线校验未通过：${this.campaignPrizeErrors.length} 项错误，${this.campaignPrizeWarnings.length} 项警告`
          )
        }
      } catch (error) {
        this.showError('上线校验请求失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 在活动奖品管理面板内新增奖品
     * campaign_code 自动锁定为当前管理的活动
     */
    async addPrizeToCampaign() {
      if (!this.managingCampaign?.campaign_code) return
      this.editingLotteryPrizeId = null
      this.isEditMode = false
      this.prize_image_preview_url = null
      this.prizeForm = {
        lottery_campaign_id: this.managingCampaign.lottery_campaign_id,
        prize_definition_id: null,
        win_weight: 100000,
        stock_quantity: 100,
        reward_tier: 'low',
        is_fallback: false,
        sort_order: 1,
        status: 'active',
        max_daily_wins: null,
        max_user_wins: null
      }
      this.loadPrizeDefinitionOptions()
      this.showModal('campaignPrizeModal')
    },

    /**
     * 提交活动级新增/编辑奖品
     * 新增使用 add-prize 端点，编辑使用 prize/:id 端点
     * 支持全部可调整参数：价值、预算成本、库存、权重、每日限制、兜底标记等
     */
    async submitCampaignPrize() {
      if (!this.isEditMode && !this.prizeForm.prize_definition_id) {
        this.showError('请选择奖品目录')
        return
      }
      try {
        this.saving = true
        if (this.isEditMode) {
          const url = buildURL(LOTTERY_ENDPOINTS.PRIZE_UPDATE, {
            id: this.editingLotteryPrizeId
          })
          const updateData = {
            win_weight: parseInt(this.prizeForm.win_weight) || 100000,
            stock_quantity: this.prizeForm.stock_quantity,
            reward_tier: this.prizeForm.reward_tier || 'low',
            is_fallback: this.prizeForm.is_fallback ? 1 : 0,
            sort_order: parseInt(this.prizeForm.sort_order) || 1,
            status: this.prizeForm.status
          }
          if (this.prizeForm.max_daily_wins !== null && this.prizeForm.max_daily_wins !== '') {
            updateData.max_daily_wins = parseInt(this.prizeForm.max_daily_wins)
          } else {
            updateData.max_daily_wins = null
          }
          if (this.prizeForm.max_user_wins !== null && this.prizeForm.max_user_wins !== '') {
            updateData.max_user_wins = parseInt(this.prizeForm.max_user_wins)
          } else {
            updateData.max_user_wins = null
          }
          await this.apiCall(url, { method: 'PUT', data: updateData })
        } else {
          const prizeData = {
            prize_definition_id: this.prizeForm.prize_definition_id,
            win_weight: parseInt(this.prizeForm.win_weight) || 100000,
            stock_quantity:
              this.prizeForm.stock_quantity === -1 ? 999999 : this.prizeForm.stock_quantity,
            reward_tier: this.prizeForm.reward_tier || 'low',
            is_fallback: this.prizeForm.is_fallback ? 1 : 0,
            sort_order: parseInt(this.prizeForm.sort_order) || 1
          }
          if (this.prizeForm.max_daily_wins !== null && this.prizeForm.max_daily_wins !== '') {
            prizeData.max_daily_wins = parseInt(this.prizeForm.max_daily_wins)
          }
          if (this.prizeForm.max_user_wins !== null && this.prizeForm.max_user_wins !== '') {
            prizeData.max_user_wins = parseInt(this.prizeForm.max_user_wins)
          }
          await this.apiCall(LOTTERY_ENDPOINTS.PRIZE_BATCH_ADD, {
            method: 'POST',
            data: {
              lottery_campaign_id: this.prizeForm.lottery_campaign_id,
              prizes: [prizeData]
            }
          })
        }
        this.showSuccess(this.isEditMode ? '奖品更新成功' : '奖品添加成功')
        this.hideModal('campaignPrizeModal')
        await this.loadCampaignGroupedPrizes()
      } catch (error) {
        this.showError('操作失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 在活动奖品管理面板内编辑奖品
     * 加载全部可调整参数到表单
     * @param {Object} prize - 奖品对象（后端字段名）
     */
    editCampaignPrize(prize) {
      this.editingLotteryPrizeId = prize.lottery_campaign_prize_id
      this.isEditMode = true
      this.prize_image_preview_url = null
      this.prizeForm = {
        lottery_campaign_id: this.managingCampaign?.lottery_campaign_id,
        prize_definition_id: prize.prize_definition_id || null,
        win_weight: prize.win_weight || 100000,
        stock_quantity: prize.stock_quantity || 100,
        reward_tier: prize.reward_tier || 'low',
        is_fallback: prize.is_fallback || false,
        sort_order: prize.sort_order || 1,
        status: prize.status || 'active',
        max_daily_wins: prize.max_daily_wins ?? null,
        max_user_wins: prize.max_user_wins ?? null
      }
      this.showModal('campaignPrizeModal')
    },

    /**
     * 删除活动奖品（软删除）
     * @param {Object} prize - 奖品对象
     */
    async deleteCampaignPrize(prize) {
      if (prize.is_fallback) {
        this.showError('兜底奖品不可删除')
        return
      }
      await this.confirmAndExecute(
        `确认删除奖品「${prize.prize_name}」？删除后该档位的概率分布将自动调整。`,
        async () => {
          await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.PRIZE_DELETE, { id: prize.lottery_campaign_prize_id }),
            { method: 'DELETE' }
          )
          await this.loadCampaignGroupedPrizes()
        },
        { successMessage: '奖品已删除' }
      )
    },

    /**
     * 行内更新单个奖品库存（绝对值）
     * @param {Object} prize - 奖品对象
     * @param {number} newStock - 新库存值
     */
    async updateInlineStock(prize, newStock) {
      const stockValue = parseInt(newStock)
      if (isNaN(stockValue) || stockValue < 0) {
        this.showError('请输入有效的库存值')
        return
      }
      try {
        await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.PRIZE_SET_STOCK, { id: prize.lottery_campaign_prize_id }),
          { method: 'PUT', data: { stock_quantity: stockValue } }
        )
        prize.stock_quantity = stockValue
        if (stockValue === 0 && prize.win_weight > 0) {
          this.showSuccess('库存已更新 ⚠️ 注意：库存为0但权重>0，算法选中后将触发降级')
        } else {
          this.showSuccess('库存已更新')
        }
      } catch (error) {
        this.showError('库存更新失败: ' + (error.message || '未知错误'))
      }
    },

    /** 快捷调整库存（增量） */
    async quickAdjustStock(prize, delta) {
      const newStock = Math.max(0, (prize.stock_quantity || 0) + delta)
      await this.updateInlineStock(prize, newStock)
    },

    /** 设为无限库存 */
    async setInfiniteStock(prize) {
      await this.updateInlineStock(prize, 999999)
    },

    /** 清零库存 */
    async clearStock(prize) {
      await this.updateInlineStock(prize, 0)
    },

    /**
     * 批量更新奖品排序
     * @param {Array} prizeOrders - [{ lottery_campaign_prize_id, sort_order }, ...]
     */
    async savePrizeSortOrder(prizeOrders) {
      if (!this.managingCampaign?.campaign_code || !prizeOrders?.length) return
      try {
        await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.PRIZE_SORT_ORDER, {
            code: this.managingCampaign.campaign_code
          }),
          { method: 'PUT', data: { updates: prizeOrders } }
        )
        this.showSuccess('排序已保存')
        await this.loadCampaignGroupedPrizes()
      } catch (error) {
        this.showError('排序保存失败: ' + (error.message || '未知错误'))
      }
    },

    /** 同档位内上移奖品 */
    async movePrizeUp(group, prizeIndex) {
      if (prizeIndex <= 0) return
      const prizes = group.prizes
      const updates = [
        {
          lottery_campaign_prize_id: prizes[prizeIndex].lottery_campaign_prize_id,
          sort_order: prizes[prizeIndex - 1].sort_order
        },
        {
          lottery_campaign_prize_id: prizes[prizeIndex - 1].lottery_campaign_prize_id,
          sort_order: prizes[prizeIndex].sort_order
        }
      ]
      await this.savePrizeSortOrder(updates)
    },

    /** 同档位内下移奖品 */
    async movePrizeDown(group, prizeIndex) {
      if (prizeIndex >= group.prizes.length - 1) return
      const prizes = group.prizes
      const updates = [
        {
          lottery_campaign_prize_id: prizes[prizeIndex].lottery_campaign_prize_id,
          sort_order: prizes[prizeIndex + 1].sort_order
        },
        {
          lottery_campaign_prize_id: prizes[prizeIndex + 1].lottery_campaign_prize_id,
          sort_order: prizes[prizeIndex].sort_order
        }
      ]
      await this.savePrizeSortOrder(updates)
    },

    /**
     * 初始化奖品列表拖拽排序（SortableJS）
     * 拖拽结束后自动调用后端批量更新排序接口
     * @param {HTMLElement} el - tbody 元素
     */
    initPrizeSortable(el) {
      if (!el || this._prizeSortableInstance) return
      this._prizeSortableInstance = Sortable.create(el, {
        animation: 150,
        handle: 'tr',
        ghostClass: 'bg-blue-50',
        chosenClass: 'opacity-70',
        onEnd: async evt => {
          if (evt.oldIndex === evt.newIndex) return
          const rows = el.querySelectorAll('tr[data-prize-id]')
          const updates = Array.from(rows).map((row, idx) => ({
            lottery_campaign_prize_id: parseInt(row.dataset.prizeId),
            sort_order: idx + 1
          }))
          try {
            await this.savePrizeSortOrder(updates)
            logger.info('[SortableJS] 拖拽排序已保存', { count: updates.length })
          } catch (error) {
            logger.error('[SortableJS] 排序保存失败:', error)
            this.showError('排序保存失败: ' + error.message)
            await this.loadPrizes()
          }
        }
      })
    },

    /** 打开批量调库存弹窗 */
    openBatchStockModal() {
      this.batchStockItems = []
      this.campaignPrizeGroups.forEach(group => {
        group.prizes.forEach(prize => {
          this.batchStockItems.push({
            lottery_campaign_prize_id: prize.lottery_campaign_prize_id,
            prize_name: prize.prize_name,
            reward_tier: prize.reward_tier,
            current_stock: prize.stock_quantity,
            new_stock: prize.stock_quantity,
            selected: false
          })
        })
      })
      this.showModal('batchStockModal')
    },

    /** 提交批量库存更新 */
    async submitBatchStock() {
      const selectedItems = this.batchStockItems.filter(
        item => item.new_stock !== item.current_stock
      )
      if (selectedItems.length === 0) {
        this.showError('没有检测到库存变更，请修改至少一个奖品的库存')
        return
      }
      try {
        this.saving = true
        await this.apiCall(
          buildURL(LOTTERY_ENDPOINTS.PRIZE_BATCH_STOCK, {
            code: this.managingCampaign.campaign_code
          }),
          {
            method: 'PUT',
            data: {
              updates: selectedItems.map(item => ({
                lottery_campaign_prize_id: item.lottery_campaign_prize_id,
                stock_quantity: parseInt(item.new_stock)
              }))
            }
          }
        )
        this.showSuccess(`已更新 ${selectedItems.length} 个奖品的库存`)
        this.hideModal('batchStockModal')
        await this.loadCampaignGroupedPrizes()
      } catch (error) {
        this.showError('批量更新失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    // ========== 批量添加奖品方法 ==========

    /**
     * 打开批量添加奖品模态框
     */
    openBatchPrizeModal() {
      this.batchLotteryCampaignId = this.campaigns?.[0]?.lottery_campaign_id || null
      this.batchPrizes = [
        {
          prize_definition_id: null,
          win_weight: 100000,
          stock_quantity: 999999,
          reward_tier: 'high',
          is_fallback: false,
          sort_order: 1
        }
      ]
      this.loadPrizeDefinitionOptions()
      this.showModal('batchPrizeModal')
    },

    /**
     * 添加一个奖品槽位
     */
    addBatchPrizeSlot() {
      this.batchPrizes.push({
        prize_definition_id: null,
        win_weight: 100000,
        stock_quantity: 100,
        reward_tier: 'low',
        is_fallback: false,
        sort_order: this.batchPrizes.length + 1
      })
    },

    /**
     * 移除一个奖品槽位
     * @param {number} index - 槽位索引
     */
    removeBatchPrizeSlot(index) {
      if (this.batchPrizes.length > 1) {
        this.batchPrizes.splice(index, 1)
      }
    },

    /**
     * 提交批量添加奖品
     */
    async submitBatchPrizes() {
      if (!this.batchLotteryCampaignId) {
        this.showError('请选择所属活动')
        return
      }

      if (this.batchPrizes.length === 0) {
        this.showError('请至少添加一个奖品')
        return
      }

      const missingDefs = this.batchPrizes.filter(p => !p.prize_definition_id)
      if (missingDefs.length > 0) {
        this.showError('请为所有奖品选择奖品目录')
        return
      }

      try {
        this.saving = true

        const prizesData = this.batchPrizes.map((prize, index) => ({
          prize_definition_id: prize.prize_definition_id,
          win_weight: parseInt(prize.win_weight) || 100000,
          stock_quantity:
            prize.stock_quantity === -1 ? 999999 : parseInt(prize.stock_quantity) || 100,
          reward_tier: prize.reward_tier || 'low',
          is_fallback: prize.is_fallback ? 1 : 0,
          sort_order: parseInt(prize.sort_order) || index + 1
        }))

        await this.apiCall(LOTTERY_ENDPOINTS.PRIZE_BATCH_ADD, {
          method: 'POST',
          data: {
            lottery_campaign_id: this.batchLotteryCampaignId,
            prizes: prizesData
          }
        })

        this.showSuccess(`成功添加 ${prizesData.length} 个奖品`)
        this.hideModal('batchPrizeModal')
        await this.loadPrizes()
      } catch (error) {
        this.showError('批量添加失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    }
  }
}

export default { usePrizesState, usePrizesMethods }
