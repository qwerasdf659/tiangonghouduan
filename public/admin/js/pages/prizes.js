/**
 * 奖品池配置页面 - Alpine.js 版本
 *
 * @file public/admin/js/pages/prizes.js
 * @description 奖品管理、添加、编辑、补货、删除等功能
 * @version 2.0.0 (Alpine.js 重构版)
 * @date 2026-01-22
 */

/**
 * 奖品管理页面 Alpine.js 组件
 */
function prizesPage() {
  return {
    // ==================== 状态数据 ====================
    
    /** 用户信息 */
    userInfo: null,
    
    /** 奖品列表 */
    prizes: [],
    
    /** 加载状态 */
    loading: true,
    
    /** 全局加载状态（遮罩层） */
    globalLoading: false,
    
    /** 默认奖品图片 */
    defaultPrizeImage: '/admin/images/default-prize.png',
    
    /** 统计数据 */
    statistics: {
      totalPrizes: 0,
      inStockPrizes: 0,
      lowStockPrizes: 0,
      claimedPrizes: 0
    },
    
    /** 添加表单数据 */
    addForm: {
      name: '',
      type: '',
      value: 0,
      quantity: 0,
      description: '',
      imagePreview: ''
    },
    
    /** 编辑表单数据 */
    editForm: {
      prizeId: null,
      name: '',
      type: '',
      value: 0,
      quantity: 0,
      description: '',
      imagePreview: ''
    },
    
    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 奖品管理页面 Alpine.js 组件初始化')
      
      // 获取默认图片
      if (typeof ResourceConfig !== 'undefined') {
        this.defaultPrizeImage = ResourceConfig.getImage('defaultPrize')
      }
      
      // 获取用户信息
      this.userInfo = getCurrentUser()
      
      // Token和权限验证
      if (!getToken() || !checkAdminPermission()) {
        return
      }
      
      // 加载奖品列表
      this.loadPrizes()
    },
    
    // ==================== 数据加载方法 ====================
    
    /**
     * 加载奖品列表
     */
    async loadPrizes() {
      this.loading = true
      
      try {
        const response = await apiRequest(API_ENDPOINTS.PRIZE.LIST)
        
        if (response && response.success) {
          this.prizes = response.data.prizes || response.data.list || []
          this.updateStatistics(response.data)
        } else {
          this.showError('加载失败', response?.message || '获取数据失败')
        }
      } catch (error) {
        console.error('加载奖品失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        this.loading = false
      }
    },
    
    /**
     * 更新统计信息
     */
    updateStatistics(data) {
      if (data.statistics) {
        const stats = data.statistics
        this.statistics.totalPrizes = stats.total || 0
        this.statistics.inStockPrizes = (stats.active || 0) - (stats.out_of_stock || 0)
        this.statistics.lowStockPrizes = stats.out_of_stock || 0
        this.statistics.claimedPrizes = (stats.total_stock || 0) - (stats.remaining_stock || 0)
      }
    },
    
    // ==================== 添加奖品方法 ====================
    
    /**
     * 打开添加模态框
     */
    openAddModal() {
      this.addForm = {
        name: '',
        type: '',
        value: 0,
        quantity: 0,
        description: '',
        imagePreview: ''
      }
      if (this.$refs.addImageInput) {
        this.$refs.addImageInput.value = ''
      }
      new bootstrap.Modal(this.$refs.addPrizeModal).show()
    },
    
    /**
     * 预览添加图片
     */
    previewAddImage(event) {
      const input = event.target
      if (input.files && input.files[0]) {
        const reader = new FileReader()
        reader.onload = (e) => {
          this.addForm.imagePreview = e.target.result
        }
        reader.readAsDataURL(input.files[0])
      }
    },
    
    /**
     * 提交添加奖品
     */
    async submitAddPrize() {
      if (!this.addForm.name || !this.addForm.type || !this.addForm.value || !this.addForm.quantity) {
        this.showError('验证失败', '请填写所有必填字段')
        return
      }
      
      this.globalLoading = true
      
      try {
        const prizeData = {
          name: this.addForm.name,
          type: this.addForm.type,
          value: parseFloat(this.addForm.value) || 0,
          quantity: parseInt(this.addForm.quantity) || 0,
          description: this.addForm.description || '',
          probability: 1,
          image_id: null,
          angle: 0,
          color: '#FF6B6B'
        }
        
        const response = await apiRequest(API_ENDPOINTS.PRIZE.BATCH_ADD, {
          method: 'POST',
          body: JSON.stringify({
            campaign_id: 1,
            prizes: [prizeData]
          })
        })
        
        if (response && response.success) {
          this.showSuccess('添加成功', '奖品已添加到奖品池')
          bootstrap.Modal.getInstance(this.$refs.addPrizeModal).hide()
          this.loadPrizes()
        } else {
          this.showError('添加失败', response?.message || '操作失败')
        }
      } catch (error) {
        console.error('添加奖品失败:', error)
        this.showError('添加失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    // ==================== 编辑奖品方法 ====================
    
    /**
     * 编辑奖品
     */
    editPrize(prizeId) {
      const prize = this.prizes.find(p => (p.prize_id || p.id) === prizeId)
      if (!prize) {
        alert('奖品不存在')
        return
      }
      
      this.editForm = {
        prizeId: prizeId,
        name: prize.prize_name,
        type: prize.prize_type,
        value: prize.prize_value,
        quantity: prize.stock_quantity || 0,
        description: prize.prize_description || '',
        imagePreview: prize.image_url || this.defaultPrizeImage
      }
      
      if (this.$refs.editImageInput) {
        this.$refs.editImageInput.value = ''
      }
      
      new bootstrap.Modal(this.$refs.editPrizeModal).show()
    },
    
    /**
     * 预览编辑图片
     */
    previewEditImage(event) {
      const input = event.target
      if (input.files && input.files[0]) {
        const reader = new FileReader()
        reader.onload = (e) => {
          this.editForm.imagePreview = e.target.result
        }
        reader.readAsDataURL(input.files[0])
      }
    },
    
    /**
     * 提交编辑奖品
     */
    async submitEditPrize() {
      if (!this.editForm.name || !this.editForm.type) {
        this.showError('验证失败', '请填写所有必填字段')
        return
      }
      
      this.globalLoading = true
      
      try {
        const updateData = {
          name: this.editForm.name,
          type: this.editForm.type,
          value: parseFloat(this.editForm.value) || 0,
          quantity: parseInt(this.editForm.quantity) || 0,
          description: this.editForm.description || ''
        }
        
        const result = await apiRequest(
          API.buildURL(API_ENDPOINTS.PRIZE.UPDATE, { prize_id: this.editForm.prizeId }),
          {
            method: 'PUT',
            body: JSON.stringify(updateData)
          }
        )
        
        if (result && result.success) {
          this.showSuccess('更新成功', '奖品信息已更新')
          bootstrap.Modal.getInstance(this.$refs.editPrizeModal).hide()
          this.loadPrizes()
        } else {
          this.showError('更新失败', result?.message || '操作失败')
        }
      } catch (error) {
        console.error('更新奖品失败:', error)
        this.showError('更新失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    // ==================== 其他操作方法 ====================
    
    /**
     * 补货
     */
    async addStock(prizeId) {
      const quantity = prompt('请输入补货数量：')
      if (!quantity || isNaN(quantity) || parseInt(quantity) <= 0) {
        alert('请输入有效的补货数量')
        return
      }
      
      this.globalLoading = true
      
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.PRIZE.ADD_STOCK, { prize_id: prizeId }),
          {
            method: 'POST',
            body: JSON.stringify({ quantity: parseInt(quantity) })
          }
        )
        
        if (response && response.success) {
          this.showSuccess('补货成功', `已补充 ${quantity} 件库存`)
          this.loadPrizes()
        } else {
          this.showError('补货失败', response?.message || '操作失败')
        }
      } catch (error) {
        console.error('补货失败:', error)
        this.showError('补货失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 删除奖品
     */
    async deletePrize(prizeId) {
      if (!confirm('确认删除该奖品？删除后无法恢复。')) {
        return
      }
      
      this.globalLoading = true
      
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.PRIZE.DELETE, { prize_id: prizeId }),
          {
            method: 'DELETE'
          }
        )
        
        if (response && response.success) {
          this.showSuccess('删除成功', '奖品已从奖品池中删除')
          this.loadPrizes()
        } else {
          this.showError('删除失败', response?.message || '操作失败')
        }
      } catch (error) {
        console.error('删除奖品失败:', error)
        this.showError('删除失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    // ==================== 渲染辅助方法 ====================
    
    /**
     * 获取奖品类型标签
     */
    getPrizeTypeLabel(type) {
      const labels = {
        physical: '<span class="badge bg-primary">实物奖品</span>',
        virtual: '<span class="badge bg-info">虚拟奖品</span>',
        points: '<span class="badge bg-success">积分奖励</span>',
        coupon: '<span class="badge bg-warning text-dark">优惠券</span>'
      }
      return labels[type] || '<span class="badge bg-secondary">未知</span>'
    },
    
    /**
     * 渲染库存徽章
     */
    renderStockBadge(remaining, total) {
      const current = remaining || 0
      const initial = total || 0
      const percentage = initial > 0 ? (current / initial) * 100 : 0
      let badgeClass = 'bg-success'
      let icon = 'check-circle'
      
      if (current === 0) {
        badgeClass = 'bg-danger'
        icon = 'x-circle'
      } else if (percentage < 20) {
        badgeClass = 'bg-warning text-dark'
        icon = 'exclamation-circle'
      }
      
      return `
        <span class="badge ${badgeClass} stock-badge">
          <i class="bi bi-${icon}"></i> ${current}/${initial}
        </span>
      `
    },
    
    /**
     * 渲染奖品状态
     */
    renderPrizeStatus(prize) {
      const remaining = prize.remaining_quantity || 0
      const total = prize.stock_quantity || 0
      
      if (remaining === 0) {
        return '<span class="badge bg-danger">已售罄</span>'
      } else if (remaining < total * 0.2) {
        return '<span class="badge bg-warning text-dark">库存不足</span>'
      } else {
        return '<span class="badge bg-success">正常</span>'
      }
    },
    
    // ==================== 工具方法 ====================
    
    /**
     * 格式化数字
     */
    formatNumber(num) {
      if (num === null || num === undefined || num === '-') return '-'
      return Number(num).toLocaleString()
    },
    
    /**
     * 显示成功提示
     */
    showSuccess(title, message) {
      this.$toast.success(message)
    },
    
    /**
     * 显示错误提示
     */
    showError(title, message) {
      this.$toast.error(message)
    },
    
    /**
     * 退出登录
     */
    logout() {
      if (typeof window.logout === 'function') {
        window.logout()
      }
    }
  }
}

// 注册 Alpine.js 组件
document.addEventListener('alpine:init', () => {
  Alpine.data('prizesPage', prizesPage)
})
