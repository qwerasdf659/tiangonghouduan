/**
 * 欠账管理页面 - Alpine.js 组件
 * 
 * 采用 Alpine.data() 注册方式，符合 CSP 安全策略
 * Toast 使用全局 $toast magic property
 * 
 * @version 2.0.0
 * @date 2026-01-22
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('debtManagementPage', () => ({
    userInfo: {},
    loading: false,
    submitting: false,
    activeTab: 'pending',
    
    // 统计数据
    stats: {
      pendingCount: 0,
      pendingAmount: 0,
      clearedCount: 0,
      clearRate: '0%'
    },
    
    // 列表数据
    pendingDebts: [],
    byCampaignList: [],
    byPrizeList: [],
    limitsList: [],
    
    // 清偿表单
    clearForm: {
      debtId: '',
      debtType: '',
      debtTypeLabel: '',
      pendingQty: 0,
      amount: '',
      remark: ''
    },
    
    // 图表实例
    sourceChart: null,
    campaignChart: null,
    
    // Modal 实例（Toast 使用全局 $toast）
    clearModalInstance: null,

    async init() {
      console.log('🚀 初始化欠账管理页面...');
      this.loadUserInfo();
      
      this.$nextTick(() => {
        this.initModals();
        this.initCharts();
      });
      
      await this.loadAllData();
      
      // 窗口大小变化时重新调整图表
      window.addEventListener('resize', () => this.resizeCharts());
    },

    loadUserInfo() {
      const userInfo = getCurrentUser();
      if (userInfo) {
        this.userInfo = userInfo;
      }
    },

    initModals() {
      if (this.$refs.clearModal) {
        this.clearModalInstance = new bootstrap.Modal(this.$refs.clearModal);
      }
      // Toast 使用全局 $toast，不再需要本地实例
    },

    initCharts() {
      if (this.$refs.sourceChart) {
        this.sourceChart = echarts.init(this.$refs.sourceChart);
      }
      if (this.$refs.campaignChart) {
        this.campaignChart = echarts.init(this.$refs.campaignChart);
      }
    },

    resizeCharts() {
      if (this.sourceChart) this.sourceChart.resize();
      if (this.campaignChart) this.campaignChart.resize();
    },

    async loadAllData() {
      this.loading = true;
      try {
        await Promise.all([
          this.loadDashboard(),
          this.loadPendingDebts(),
          this.loadByCampaign(),
          this.loadByPrize(),
          this.loadLimits()
        ]);
      } catch (error) {
        console.error('加载数据失败:', error);
        this.showError('加载失败: ' + error.message);
      } finally {
        this.loading = false;
      }
    },

    async loadDashboard() {
      try {
        const response = await apiRequest(API_ENDPOINTS.DEBT.DASHBOARD);
        if (response && response.success) {
          this.updateStats(response.data);
          this.updateCharts(response.data);
        }
      } catch (error) {
        console.error('加载仪表盘失败:', error);
      }
    },

    updateStats(data) {
      const invDebt = data.inventory_debt || {};
      const budDebt = data.budget_debt || {};
      
      // 待清偿总数 = 库存欠账待清偿数 + 预算欠账待清偿数
      this.stats.pendingCount = (invDebt.pending_count || 0) + (budDebt.pending_count || 0);
      
      // 待清偿金额 = 预算欠账剩余金额
      this.stats.pendingAmount = budDebt.remaining_amount || 0;
      
      // 已清偿总数 = 库存欠账已核销数 + 预算欠账已核销数
      this.stats.clearedCount = (invDebt.written_off_count || 0) + (budDebt.written_off_count || 0);
      
      // 总数 = 库存欠账总数 + 预算欠账总数
      const totalCount = (invDebt.total_count || 0) + (budDebt.total_count || 0);
      this.stats.clearRate = totalCount > 0 
        ? ((this.stats.clearedCount / totalCount) * 100).toFixed(1) + '%'
        : '0%';
    },

    updateCharts(data) {
      const invDebt = data.inventory_debt || {};
      const budDebt = data.budget_debt || {};
      
      // 来源分布饼图
      const sourceData = [
        { name: '库存欠账', value: invDebt.remaining_quantity || 0 },
        { name: '预算欠账', value: budDebt.remaining_amount || 0 }
      ];
      
      if (this.sourceChart) {
        this.sourceChart.setOption({
          tooltip: { trigger: 'item' },
          legend: { bottom: '5%' },
          series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            data: sourceData,
            emphasis: {
              itemStyle: {
                shadowBlur: 10,
                shadowOffsetX: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
              }
            }
          }]
        });
      }

      // 活动柱状图初始化为空
      if (this.campaignChart) {
        this.campaignChart.setOption({
          tooltip: { trigger: 'axis' },
          xAxis: {
            type: 'category',
            data: [],
            axisLabel: { rotate: 30 }
          },
          yAxis: { type: 'value' },
          series: [{
            type: 'bar',
            data: [],
            itemStyle: { color: '#dc3545' }
          }]
        });
      }
    },

    async loadPendingDebts() {
      try {
        const response = await apiRequest(API_ENDPOINTS.DEBT.PENDING);
        if (response && response.success) {
          this.pendingDebts = response.data.items || [];
        }
      } catch (error) {
        console.error('加载待清偿列表失败:', error);
      }
    },

    async loadByCampaign() {
      try {
        const response = await apiRequest(API_ENDPOINTS.DEBT.BY_CAMPAIGN);
        if (response && response.success) {
          this.byCampaignList = response.data.items || [];
          this.updateCampaignChart();
        }
      } catch (error) {
        console.error('加载活动汇总失败:', error);
      }
    },

    updateCampaignChart() {
      if (!this.campaignChart || this.byCampaignList.length === 0) return;
      
      this.campaignChart.setOption({
        tooltip: { trigger: 'axis' },
        xAxis: {
          type: 'category',
          data: this.byCampaignList.map(c => c.campaign_name || `活动${c.campaign_id}`),
          axisLabel: { rotate: 30 }
        },
        yAxis: { type: 'value' },
        series: [{
          type: 'bar',
          data: this.byCampaignList.map(c => {
            const invDebt = c.inventory_debt || {};
            const budDebt = c.budget_debt || {};
            return (invDebt.remaining_quantity || 0) + (budDebt.remaining_amount || 0);
          }),
          itemStyle: { color: '#dc3545' }
        }]
      });
    },

    async loadByPrize() {
      try {
        const response = await apiRequest(API_ENDPOINTS.DEBT.BY_PRIZE);
        if (response && response.success) {
          this.byPrizeList = response.data.items || [];
        }
      } catch (error) {
        console.error('加载奖品汇总失败:', error);
      }
    },

    async loadLimits() {
      try {
        const response = await apiRequest(API_ENDPOINTS.DEBT.LIMITS);
        if (response && response.success) {
          this.limitsList = response.data.items || [];
        }
      } catch (error) {
        console.error('加载上限配置失败:', error);
      }
    },

    // 判断是否为库存欠账
    isInventoryDebt(debt) {
      return debt.debt_quantity !== undefined;
    },

    // 获取欠账数量
    getDebtQuantity(debt) {
      return this.isInventoryDebt(debt) ? (debt.debt_quantity || 0) : (debt.debt_amount || 0);
    },

    // 获取已清偿数量
    getClearedQuantity(debt) {
      return this.isInventoryDebt(debt) ? (debt.cleared_quantity || 0) : (debt.cleared_amount || 0);
    },

    // 获取剩余数量
    getRemainingQuantity(debt) {
      return this.isInventoryDebt(debt) ? (debt.remaining_quantity || 0) : (debt.remaining_amount || 0);
    },

    // 活动汇总相关计算
    getCampaignDebtCount(c) {
      const invDebt = c.inventory_debt || {};
      const budDebt = c.budget_debt || {};
      return (invDebt.count || 0) + (budDebt.count || 0);
    },

    getCampaignDebtTotal(c) {
      const invDebt = c.inventory_debt || {};
      const budDebt = c.budget_debt || {};
      return (invDebt.remaining_quantity || 0) + (budDebt.remaining_amount || 0);
    },

    getCampaignClearedTotal(c) {
      const invDebt = c.inventory_debt || {};
      const budDebt = c.budget_debt || {};
      return (invDebt.cleared_quantity || 0) + (budDebt.cleared_amount || 0);
    },

    getCampaignClearRate(c) {
      const invDebt = c.inventory_debt || {};
      const budDebt = c.budget_debt || {};
      const totalDebt = (invDebt.total_quantity || 0) + (budDebt.total_amount || 0);
      const clearedTotal = (invDebt.cleared_quantity || 0) + (budDebt.cleared_amount || 0);
      return totalDebt > 0 ? ((clearedTotal / totalDebt) * 100).toFixed(1) : 0;
    },

    // 奖品清偿率
    getPrizeClearRate(p) {
      return p.total_quantity > 0 
        ? ((p.cleared_quantity / p.total_quantity) * 100).toFixed(1) 
        : 0;
    },

    // 打开清偿模态框
    openClearModal(debt) {
      const isInventory = this.isInventoryDebt(debt);
      const remaining = this.getRemainingQuantity(debt);
      
      this.clearForm = {
        debtId: debt.debt_id,
        debtType: isInventory ? 'inventory' : 'budget',
        debtTypeLabel: isInventory ? '库存欠账' : '预算欠账',
        pendingQty: remaining,
        amount: '',
        remark: ''
      };
      
      if (this.clearModalInstance) {
        this.clearModalInstance.show();
      }
    },

    async submitClear() {
      if (!this.clearForm.amount || this.clearForm.amount <= 0) {
        this.showError('请输入有效的清偿数量');
        return;
      }

      if (this.clearForm.amount > this.clearForm.pendingQty) {
        this.showError('清偿数量不能超过待清偿数量');
        return;
      }

      this.submitting = true;
      try {
        const response = await apiRequest(API_ENDPOINTS.DEBT.CLEAR, {
          method: 'POST',
          body: JSON.stringify({
            debt_type: this.clearForm.debtType,
            debt_id: parseInt(this.clearForm.debtId),
            amount: this.clearForm.amount,
            remark: this.clearForm.remark
          })
        });

        if (response && response.success) {
          if (this.clearModalInstance) {
            this.clearModalInstance.hide();
          }
          this.showSuccess('清偿成功');
          await this.loadAllData();
        } else {
          this.showError(response?.message || '清偿失败');
        }
      } catch (error) {
        console.error('清偿失败:', error);
        this.showError('清偿失败: ' + error.message);
      } finally {
        this.submitting = false;
      }
    },

    // 格式化时间
    formatDateTime(dateStr) {
      if (!dateStr) return '-';
      return new Date(dateStr).toLocaleString('zh-CN');
    },

    // 显示成功消息 - 使用全局 $toast
    showSuccess(message) {
      this.$toast.success(message);
    },

    // 显示错误消息 - 使用全局 $toast
    showError(message) {
      this.$toast.error(message);
    },

    // 退出登录
    logout() {
      if (typeof window.logout === 'function') {
        window.logout();
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('userInfo');
        window.location.href = '/admin/login.html';
      }
    }
  }))
})

console.log('📦 欠账管理页面 (Alpine.js) 已加载')

