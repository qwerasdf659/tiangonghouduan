/**
 * 定价配置模块
 *
 * @file admin/src/modules/lottery/composables/pricing.js
 * @description 抽奖定价配置和版本管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery/index.js'
import { buildURL } from '../../../api/base.js'

/**
 * 定价配置状态
 * @returns {Object} 状态对象
 */
export function usePricingState() {
  return {
    /** @type {Array} 定价配置列表 */
    pricingConfigs: [],
    /** @type {Array} 定价版本列表 */
    pricingVersions: [],
    /** @type {Object} 定价筛选条件 */
    pricingFilters: { campaign_code: '', status: '' },
    /** @type {Object} 定价表单 - 直接使用后端 draw_buttons 结构，每个按钮独立折扣 */
    pricingForm: {
      campaign_code: '',
      base_cost: 0,
      draw_buttons: [
        { count: 1, discount: 1.0, label: '单抽', enabled: true, sort_order: 1 },
        { count: 3, discount: 1.0, label: '3连抽', enabled: true, sort_order: 3 },
        { count: 5, discount: 1.0, label: '5连抽', enabled: true, sort_order: 5 },
        { count: 10, discount: 1.0, label: '10连抽', enabled: true, sort_order: 10 }
      ]
    },
    /** @type {number|string|null} 当前编辑的定价ID */
    editingPricingId: null,
    /** @type {boolean} 是否编辑模式 */
    isEditPricing: false,
    /** @type {Object|null} 选中的定价活动 */
    selectedPricingCampaign: null,
    /** @type {boolean} 是否正在刷新定价配置 */
    refreshingPricing: false
  }
}

/**
 * 定价配置方法
 * @returns {Object} 方法对象
 */
export function usePricingMethods() {
  return {
    /**
     * 加载定价配置列表
     *
     * 优化后的实现：使用批量接口一次性获取所有活动的定价配置
     * 避免 N+1 请求问题，消除控制台 404 错误
     */
    async loadPricingConfigs() {
      logger.debug('🔄 [Pricing] loadPricingConfigs 开始加载...')
      try {
        // 使用批量接口一次性获取所有定价配置
        const response = await this.apiGet(LOTTERY_ENDPOINTS.PRICING_CONFIG_ALL)

        if (!response?.success) {
          logger.warn('[Pricing] 获取定价配置列表失败:', response?.message)
          this.pricingConfigs = []
          return
        }

        const configs = response.data?.configs || []

        // 处理返回的配置数据
        const pricingList = configs.map(config => {
          // 确保 pricing_config 是对象格式
          let pricing_config = config.pricing_config
          if (typeof pricing_config === 'string') {
            try {
              pricing_config = JSON.parse(pricing_config)
            } catch (_e) {
              logger.warn(`[Pricing] 活动 ${config.campaign_code} pricing_config 解析失败`)
              pricing_config = {}
            }
          }

          return {
            ...config,
            pricing_config
          }
        })

        this.pricingConfigs = pricingList

        logger.debug('📊 [Pricing] 定价配置加载完成:', {
          count: this.pricingConfigs.length,
          configs: this.pricingConfigs.map(c => ({
            campaign_code: c.campaign_code,
            campaign_name: c.campaign_name,
            version: c.version,
            status: c.status
          }))
        })
      } catch (error) {
        logger.error('加载定价配置失败:', error)
        this.pricingConfigs = []
      }
    },

    /**
     * 刷新定价配置（带视觉反馈）
     */
    async refreshPricingWithFeedback() {
      this.refreshingPricing = true
      try {
        await this.loadPricingConfigs()
        // 使用 Alpine.store 显示成功通知
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').success(
            `定价配置已刷新，共 ${this.pricingConfigs.length} 条配置`
          )
        }
        logger.debug('✅ 定价配置已刷新')
      } catch (error) {
        // 使用 Alpine.store 显示错误通知
        if (typeof Alpine !== 'undefined' && Alpine.store('notification')) {
          Alpine.store('notification').error('刷新失败: ' + error.message)
        }
        logger.error('❌ 刷新失败:', error)
      } finally {
        this.refreshingPricing = false
      }
    },

    /**
     * 加载定价版本历史
     * @param {string} campaignCode - 活动代码
     */
    async loadPricingVersions(campaignCode) {
      if (!campaignCode) return
      try {
        const endpoint = buildURL(LOTTERY_ENDPOINTS.PRICING_VERSIONS, { code: campaignCode })
        // apiGet 返回的是 response.data，不是完整 response 对象
        const data = await this.apiGet(endpoint)
        // data 直接就是 response.data 的内容
        if (data) {
          this.pricingVersions = data.versions || data || []
        }
      } catch (error) {
        logger.error('加载定价版本失败:', error)
        this.pricingVersions = []
      }
    },

    /**
     * 打开创建定价模态框 - 初始化默认的 draw_buttons（每个按钮独立折扣）
     */
    openCreatePricingModal() {
      this.isEditPricing = false
      this.pricingForm = {
        campaign_code: '',
        base_cost: 0,
        draw_buttons: [
          { count: 1, discount: 1.0, label: '单抽', enabled: true, sort_order: 1 },
          { count: 3, discount: 1.0, label: '3连抽', enabled: true, sort_order: 3 },
          { count: 5, discount: 1.0, label: '5连抽', enabled: true, sort_order: 5 },
          { count: 10, discount: 1.0, label: '10连抽', enabled: true, sort_order: 10 }
        ]
      }
      this.showModal('pricingModal')
    },

    /**
     * 编辑定价配置 - 直接从后端 draw_buttons 填充表单，每个按钮独立折扣
     * @param {Object} pricing - 后端返回的定价配置对象
     */
    editPricing(pricing) {
      logger.debug('✏️ [Pricing] editPricing 被调用', pricing)
      this.isEditPricing = true
      this.editingPricingId = pricing.lottery_campaign_id

      let pricingConfig = pricing.pricing_config || {}
      if (typeof pricingConfig === 'string') {
        try {
          pricingConfig = JSON.parse(pricingConfig)
          logger.debug('📦 [Pricing] pricing_config 已从字符串解析:', pricingConfig)
        } catch (e) {
          logger.warn('⚠️ [Pricing] pricing_config 解析失败:', e.message)
          pricingConfig = {}
        }
      }

      const baseCost = pricingConfig.base_cost ?? pricing.base_cost ?? 0
      logger.debug('💰 [Pricing] 提取的基础价格 base_cost:', baseCost)

      // 直接使用后端 draw_buttons 数据，保留每个按钮的独立折扣
      const defaultButtons = [
        { count: 1, discount: 1.0, label: '单抽', enabled: true, sort_order: 1 },
        { count: 3, discount: 1.0, label: '3连抽', enabled: true, sort_order: 3 },
        { count: 5, discount: 1.0, label: '5连抽', enabled: true, sort_order: 5 },
        { count: 10, discount: 1.0, label: '10连抽', enabled: true, sort_order: 10 }
      ]

      let drawButtons = defaultButtons
      if (Array.isArray(pricingConfig.draw_buttons) && pricingConfig.draw_buttons.length > 0) {
        drawButtons = pricingConfig.draw_buttons
          .map(btn => ({
            count: btn.count,
            discount: btn.discount ?? 1.0,
            label: btn.label || `${btn.count}连抽`,
            enabled: btn.enabled !== false,
            sort_order: btn.sort_order ?? btn.count
          }))
          .sort((a, b) => a.sort_order - b.sort_order)
      }

      this.pricingForm = {
        campaign_code: pricing.campaign_code || '',
        base_cost: baseCost,
        draw_buttons: drawButtons
      }
      logger.debug('📝 [Pricing] 填充表单数据:', this.pricingForm)
      this.showModal('pricingModal')
    },

    /**
     * 自动生成按钮显示标签（根据折扣值）
     * @param {Object} btn - draw_button 对象
     * @returns {string} 显示标签
     */
    generateButtonLabel(btn) {
      const baseLabel = btn.count === 1 ? '单抽' : `${btn.count}连抽`
      if (btn.discount < 1) {
        const discountDisplay = Math.round(btn.discount * 100) / 10
        return `${baseLabel}(${discountDisplay}折)`
      }
      return baseLabel
    },

    /**
     * 添加新的连抽档位按钮（后端支持 count 1-20）
     */
    addDrawButton() {
      const existingCounts = this.pricingForm.draw_buttons.map(b => b.count)
      const maxCount = Math.max(...existingCounts, 0)
      let newCount = maxCount + 1
      if (newCount > 20) {
        this.showError('连抽次数最大支持20次')
        return
      }
      while (existingCounts.includes(newCount) && newCount <= 20) {
        newCount++
      }
      if (newCount > 20) {
        this.showError('无法添加更多档位，已有的档位次数已覆盖可用范围')
        return
      }
      this.pricingForm.draw_buttons.push({
        count: newCount,
        discount: 1.0,
        label: `${newCount}连抽`,
        enabled: true,
        sort_order: newCount
      })
      this.pricingForm.draw_buttons.sort((a, b) => a.sort_order - b.sort_order)
    },

    /**
     * 删除连抽档位按钮（至少保留单抽）
     * @param {number} index - 按钮在 draw_buttons 数组中的索引
     */
    removeDrawButton(index) {
      if (this.pricingForm.draw_buttons.length <= 1) {
        this.showError('至少保留一个抽奖档位')
        return
      }
      this.pricingForm.draw_buttons.splice(index, 1)
    },

    /**
     * 保存定价配置 - 直接使用表单中的 draw_buttons 发送给后端
     *
     * 后端API设计：创建新版本（POST），不支持直接更新
     * 请求格式要求：{ pricing_config: { base_cost, draw_buttons: [...] }, activate_immediately: true }
     */
    async savePricing() {
      if (!this.pricingForm.campaign_code) {
        this.showError('请选择活动')
        return
      }
      if (!this.pricingForm.base_cost || this.pricingForm.base_cost <= 0) {
        this.showError('请输入有效的单抽基础价格')
        return
      }

      // 校验 draw_buttons
      for (const btn of this.pricingForm.draw_buttons) {
        if (btn.count < 1 || btn.count > 20) {
          this.showError(`档位次数必须在 1-20 之间，当前: ${btn.count}`)
          return
        }
        if (btn.discount <= 0 || btn.discount > 1) {
          this.showError(`${btn.count}连抽的折扣率必须在 0.01-1.0 之间，当前: ${btn.discount}`)
          return
        }
      }

      // 检查 count 重复
      const counts = this.pricingForm.draw_buttons.map(b => b.count)
      if (new Set(counts).size !== counts.length) {
        this.showError('存在重复的连抽次数，请检查')
        return
      }

      this.saving = true
      try {
        const endpoint = buildURL(LOTTERY_ENDPOINTS.PRICING_CREATE, {
          code: this.pricingForm.campaign_code
        })

        const baseCost = parseFloat(this.pricingForm.base_cost) || 100

        // 直接使用表单的 draw_buttons，自动生成 label
        const drawButtons = this.pricingForm.draw_buttons.map(btn => ({
          count: parseInt(btn.count, 10),
          discount: parseFloat(btn.discount),
          label: this.generateButtonLabel(btn),
          enabled: btn.enabled !== false,
          sort_order: btn.sort_order ?? btn.count
        }))

        const requestData = {
          pricing_config: {
            base_cost: baseCost,
            draw_buttons: drawButtons
          },
          activate_immediately: true
        }

        logger.debug('📤 [Pricing] 发送请求:', endpoint, requestData)

        await this.apiPost(endpoint, requestData)

        this.showSuccess(this.isEditPricing ? '定价配置已更新（创建新版本）' : '定价配置创建成功')
        this.hideModal('pricingModal')
        await this.loadPricingConfigs()
      } catch (error) {
        logger.error('❌ [Pricing] 保存失败:', error)
        this.showError('保存定价配置失败: ' + (error.message || '未知错误'))
      } finally {
        this.saving = false
      }
    },

    /**
     * 激活定价版本
     * @param {Object} pricing - 定价配置对象
     * @param {number|string} version - 版本号
     */
    async activatePricing(pricing, version) {
      await this.confirmAndExecute(
        `确认激活定价版本 v${version}？`,
        async () => {
          const endpoint = buildURL(LOTTERY_ENDPOINTS.PRICING_ACTIVATE, {
            code: pricing.campaign_code,
            version: version
          })
          // apiPut 成功时返回 response.data，失败时抛出错误
          await this.apiPut(endpoint, {})
          // 如果没有抛出错误，则表示成功
          await this.loadPricingConfigs()
        },
        { successMessage: '定价版本已激活' }
      )
    },

    /**
     * 归档定价版本
     * @param {Object} pricing - 定价配置对象
     * @param {number|string} version - 版本号
     */
    async archivePricing(pricing, version) {
      await this.confirmAndExecute(
        `确认归档定价版本 v${version}？归档后将无法使用。`,
        async () => {
          const endpoint = buildURL(LOTTERY_ENDPOINTS.PRICING_ARCHIVE, {
            code: pricing.campaign_code,
            version: version
          })
          // apiPut 成功时返回 response.data，失败时抛出错误
          await this.apiPut(endpoint, {})
          // 如果没有抛出错误，则表示成功
          await this.loadPricingConfigs()
        },
        { successMessage: '定价版本已归档', confirmText: '确认归档' }
      )
    },

    /**
     * 查看定价版本历史
     * @param {Object} pricing - 定价配置对象
     */
    viewPricingVersions(pricing) {
      logger.debug('📋 [Pricing] viewPricingVersions 被调用', pricing)
      this.selectedPricingCampaign = pricing
      this.loadPricingVersions(pricing.campaign_code)
      this.showModal('pricingVersionsModal')
    },

    /**
     * 搜索定价配置
     */
    searchPricing() {
      this.loadPricingConfigs()
    },

    /**
     * 重置定价筛选条件
     */
    resetPricingFilters() {
      this.pricingFilters = { campaign_code: '', status: '' }
      this.loadPricingConfigs()
    },

    /**
     * 获取定价状态CSS类
     * @param {string} status - 定价状态代码
     * @returns {string} CSS类名
     */
    getPricingStatusClass(status) {
      const classes = {
        active: 'bg-success',
        draft: 'bg-warning text-dark',
        archived: 'bg-secondary',
        scheduled: 'bg-info'
      }
      return classes[status] || 'bg-secondary'
    },

    /**
     * 获取定价状态文本
     * @param {string} status - 定价状态代码
     * @returns {string} 状态文本
     */
    // ✅ 已删除 getPricingStatusText 映射函数 - 改用后端 _display 字段（P2 中文化）
  }
}

export default { usePricingState, usePricingMethods }
