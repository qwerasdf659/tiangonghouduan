/**
 * 奖品管理模块
 *
 * @file admin/src/modules/lottery/composables/prizes.js
 * @description 奖品的 CRUD 操作、库存管理
 * @version 1.0.0
 * @date 2026-01-24
 */

import { logger } from '../../../utils/logger.js'
import { LOTTERY_ENDPOINTS } from '../../../api/lottery.js'
import { buildURL } from '../../../api/base.js'

/**
 * 奖品管理状态
 * @returns {Object} 状态对象
 * 
 * 字段说明（以后端数据库为准）：
 * - prize_name: 奖品名称
 * - prize_type: 奖品类型 (physical/virtual/coupon/points/empty)
 * - win_probability: 中奖概率 (0-100 前端百分比显示)
 * - stock_quantity: 库存数量 (正整数，999999表示无限)
 * - status: 状态 (active/inactive)
 * - prize_description: 奖品描述
 * - image_id: 图片ID
 * 
 * 注意：后端要求 quantity 必须为正整数，不接受 -1 或 0
 */
export function usePrizesState() {
  return {
    /** @type {Array} 奖品列表 */
    prizes: [],
    /** @type {Object} 奖品筛选条件 */
    prizeFilters: { prize_type: '', status: '', keyword: '' },
    /** @type {Object} 奖品编辑表单 - 使用后端字段名 */
    prizeForm: {
      campaign_id: null,  // 添加奖品时需要选择活动
      prize_name: '',
      prize_type: 'virtual',
      win_probability: 0,  // 前端百分比显示 0-100
      stock_quantity: 100, // 默认库存100，后端要求正整数
      status: 'active',
      image_id: null,
      prize_description: ''
    },
    /** @type {number|string|null} 当前编辑的奖品ID */
    editingPrizeId: null,
    /** @type {Object} 库存补充表单 */
    stockForm: { prizeId: null, prizeName: '', quantity: 1 },
    
    // ========== 批量添加奖品 ==========
    /** @type {number|null} 批量添加奖品的目标活动ID */
    batchCampaignId: null,
    /** @type {Array} 批量奖品列表 */
    batchPrizes: [],
    /** @type {number} 批量奖品概率总和 */
    batchProbabilitySum: 0
  }
}

/**
 * 奖品管理方法
 * @returns {Object} 方法对象
 */
export function usePrizesMethods() {
  return {
    /**
     * 加载奖品列表
     * 后端返回字段: prize_id, prize_name, prize_type, win_probability, 
     *               stock_quantity, status, prize_description, image_id
     */
    async loadPrizes() {
      try {
        const params = new URLSearchParams()
        params.append('page', this.page)
        params.append('page_size', this.pageSize)
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

        // apiGet 通过 withLoading 包装，返回 { success: true, data: {...} }
        const response = await this.apiGet(
          `${LOTTERY_ENDPOINTS.PRIZE_LIST}?${params}`,
          {},
          { showLoading: false }
        )
        console.log('🏆 [Prizes] API 返回数据:', response)
        
        // 解包 withLoading 返回的结构
        const data = response?.success ? response.data : response
        console.log('🏆 [Prizes] 解包后数据:', data)
        
        if (data) {
          this.prizes = data.prizes || data.list || []
          // 更新分页信息
          if (data.pagination) {
            this.totalPages = data.pagination.total_pages || 1
            this.totalCount = data.pagination.total || 0
          }
          logger.debug('加载奖品成功', { count: this.prizes.length })
          console.log('✅ [Prizes] 数据加载完成, prizes:', this.prizes.length)
        }
      } catch (error) {
        logger.error('加载奖品失败:', error)
        console.error('❌ [Prizes] loadPrizes 失败:', error)
        this.prizes = []
      }
    },

    /**
     * 打开创建奖品模态框
     */
    openCreatePrizeModal() {
      this.editingPrizeId = null
      this.isEditMode = false
      // 使用后端字段名，添加campaign_id
      // 注意：后端要求 quantity 必须为正整数，默认100
      this.prizeForm = {
        campaign_id: this.campaigns?.[0]?.campaign_id || null,  // 默认选择第一个活动
        prize_name: '',
        prize_type: 'virtual',
        win_probability: 0,  // 前端百分比 0-100
        stock_quantity: 100, // 默认库存100，后端要求正整数
        status: 'active',
        image_id: null,
        prize_description: ''
      }
      this.showModal('prizeModal')
    },

    /**
     * 编辑奖品
     * @param {Object} prize - 奖品对象（后端字段名）
     */
    editPrize(prize) {
      this.editingPrizeId = prize.prize_id
      this.isEditMode = true
      // 后端概率是小数(0-1)，前端显示百分比(0-100)
      const winProbability = parseFloat(prize.win_probability || 0) * 100
      // 使用后端字段名
      this.prizeForm = {
        campaign_id: prize.campaign_id || null,  // 编辑时保留原活动ID
        prize_name: prize.prize_name || '',
        prize_type: prize.prize_type || 'virtual',
        win_probability: winProbability, // 转换为百分比显示
        stock_quantity: prize.stock_quantity || 100,
        status: prize.status || 'active',
        image_id: prize.image_id || null,
        prize_description: prize.prize_description || ''
      }
      this.showModal('prizeModal')
    },

    /**
     * 切换奖品启用状态
     * @param {Object} prize - 奖品对象（后端字段名）
     */
    async togglePrize(prize) {
      const isActive = prize.status === 'active'
      const newStatus = isActive ? 'inactive' : 'active'
      await this.confirmAndExecute(
        `确认${!isActive ? '启用' : '禁用'}奖品「${prize.prize_name}」？`,
        async () => {
          // apiCall 成功时返回 response.data，失败时抛出错误
          await this.apiCall(
            buildURL(LOTTERY_ENDPOINTS.PRIZE_TOGGLE, {
              prize_id: prize.prize_id
            }),
            { method: 'PUT' }
          )
          // 如果没有抛出错误，则表示成功
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
              prize_id: prize.prize_id
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
      if (!this.prizeForm.prize_name) {
        this.showError('请输入奖品名称')
        return
      }

      // 新增奖品时必须选择活动
      if (!this.isEditMode && !this.prizeForm.campaign_id) {
        this.showError('请选择所属活动')
        return
      }

      try {
        this.saving = true
        
        if (this.isEditMode) {
          // 编辑模式：使用PUT更新单个奖品
          // 中奖概率：前端表单是百分比(0-100)，后端需要小数(0-1)
          const winProbability = (this.prizeForm.win_probability || 0) / 100
          const url = buildURL(LOTTERY_ENDPOINTS.PRIZE_UPDATE, { prize_id: this.editingPrizeId })
          await this.apiCall(url, {
            method: 'PUT',
            data: {
              prize_name: this.prizeForm.prize_name,
              prize_type: this.prizeForm.prize_type,
              win_probability: winProbability,
              stock_quantity: this.prizeForm.stock_quantity,
              status: this.prizeForm.status,
              image_id: this.prizeForm.image_id,
              prize_description: this.prizeForm.prize_description
            }
          })
        } else {
          // 新增模式：使用batch-add端点，传入活动ID和奖品数组
          // 后端要求 quantity 必须是正整数，-1(前端无限库存)需转换为大数值999999
          const stockQuantity = this.prizeForm.stock_quantity === -1 ? 999999 : this.prizeForm.stock_quantity
          
          // ⚠️ 后端 batch-add 验证要求：所有奖品概率总和必须等于 1.0
          // 单个添加奖品时，暂时设置概率为 1.0，用户后续可通过编辑调整
          // 中奖概率：前端表单是百分比(0-100)，后端需要小数(0-1)
          let winProbability = (this.prizeForm.win_probability || 0) / 100
          
          // 如果只添加单个奖品且概率不为1，需要警告用户
          if (winProbability !== 1.0) {
            // 单个添加时强制设置为1.0，避免验证失败
            // 用户可以后续通过编辑功能调整概率
            console.warn('[Prizes] 单个添加奖品时概率自动设置为100%，请添加多个奖品后编辑调整概率分配')
            winProbability = 1.0
          }
          
          await this.apiCall(LOTTERY_ENDPOINTS.PRIZE_BATCH_ADD, {
            method: 'POST',
            data: {
              campaign_id: this.prizeForm.campaign_id,
              prizes: [{
                name: this.prizeForm.prize_name,
                type: this.prizeForm.prize_type,
                win_probability: winProbability,
                quantity: stockQuantity,
                description: this.prizeForm.prize_description
              }]
            }
          })
          
          // 提示用户概率配置
          if ((this.prizeForm.win_probability || 0) !== 100) {
            this.showSuccess('奖品添加成功！注意：概率已临时设为100%，请添加更多奖品后编辑调整概率分配')
            return  // 阻止默认的成功提示
          }
        }

        // 如果没有抛出错误，则表示成功
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
    getPrizeTypeText(prize_type) {
      const map = { 
        physical: '实物', 
        virtual: '虚拟', 
        coupon: '优惠券', 
        points: '积分',
        empty: '未中奖'
      }
      return map[prize_type] || prize_type || '未知'
    },

    /**
     * 打开奖品补货模态框
     * @param {Object} prize - 奖品对象（后端字段名）
     */
    openStockModal(prize) {
      this.stockForm = {
        prizeId: prize.prize_id,
        prizeName: prize.prize_name,
        quantity: 1
      }
      this.showModal('stockModal')
    },

    /**
     * 提交奖品补货
     */
    async submitAddStock() {
      if (!this.stockForm.prizeId) {
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
            prize_id: this.stockForm.prizeId
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

    // ========== 批量添加奖品方法 ==========
    
    /**
     * 打开批量添加奖品模态框
     */
    openBatchPrizeModal() {
      this.batchCampaignId = this.campaigns?.[0]?.campaign_id || null
      // 初始化一个包含多个奖品槽位的模板
      this.batchPrizes = [
        { name: '一等奖', type: 'physical', probability: 5, quantity: 10, description: '' },
        { name: '二等奖', type: 'virtual', probability: 15, quantity: 50, description: '' },
        { name: '三等奖', type: 'points', probability: 30, quantity: 200, description: '' },
        { name: '谢谢参与', type: 'empty', probability: 50, quantity: 999999, description: '' }
      ]
      this.updateBatchProbabilitySum()
      this.showModal('batchPrizeModal')
    },

    /**
     * 添加一个奖品槽位
     */
    addBatchPrizeSlot() {
      this.batchPrizes.push({
        name: '',
        type: 'virtual',
        probability: 0,
        quantity: 100,
        description: ''
      })
    },

    /**
     * 移除一个奖品槽位
     * @param {number} index - 槽位索引
     */
    removeBatchPrizeSlot(index) {
      if (this.batchPrizes.length > 1) {
        this.batchPrizes.splice(index, 1)
        this.updateBatchProbabilitySum()
      }
    },

    /**
     * 更新批量奖品概率总和
     */
    updateBatchProbabilitySum() {
      this.batchProbabilitySum = this.batchPrizes.reduce((sum, prize) => {
        return sum + (parseFloat(prize.probability) || 0)
      }, 0)
    },

    /**
     * 自动平均分配概率
     */
    autoDistributeProbability() {
      const count = this.batchPrizes.length
      if (count === 0) return
      
      const avgProbability = Math.floor(100 / count)
      const remainder = 100 - (avgProbability * count)
      
      this.batchPrizes.forEach((prize, index) => {
        // 最后一个奖品分配剩余概率
        prize.probability = index === count - 1 ? avgProbability + remainder : avgProbability
      })
      this.updateBatchProbabilitySum()
    },

    /**
     * 提交批量添加奖品
     */
    async submitBatchPrizes() {
      // 验证活动ID
      if (!this.batchCampaignId) {
        this.showError('请选择所属活动')
        return
      }

      // 验证至少有一个奖品
      if (this.batchPrizes.length === 0) {
        this.showError('请至少添加一个奖品')
        return
      }

      // 验证奖品名称
      const emptyNames = this.batchPrizes.filter(p => !p.name.trim())
      if (emptyNames.length > 0) {
        this.showError('请填写所有奖品名称')
        return
      }

      // 验证概率总和
      this.updateBatchProbabilitySum()
      if (Math.abs(this.batchProbabilitySum - 100) > 0.01) {
        this.showError(`概率总和必须等于100%，当前为${this.batchProbabilitySum.toFixed(2)}%`)
        return
      }

      try {
        this.saving = true
        
        // 转换数据格式：前端百分比(0-100) → 后端小数(0-1)
        const prizesData = this.batchPrizes.map(prize => ({
          name: prize.name.trim(),
          type: prize.type,
          win_probability: parseFloat(prize.probability) / 100,
          quantity: prize.quantity === -1 ? 999999 : parseInt(prize.quantity) || 100,
          description: prize.description || ''
        }))

        await this.apiCall(LOTTERY_ENDPOINTS.PRIZE_BATCH_ADD, {
          method: 'POST',
          data: {
            campaign_id: this.batchCampaignId,
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

