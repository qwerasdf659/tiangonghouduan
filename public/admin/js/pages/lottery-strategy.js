/**
 * 策略引擎配置页面 - Alpine.js 组件
 * lottery-strategy.js
 */

function lotteryStrategyPage() {
  return {
    // 用户信息
    userInfo: {},
    
    // 加载状态
    loading: false,
    
    // 统计数据
    stats: {
      totalStrategies: 0,
      activeStrategies: 0,
      matrixCount: 0,
      tierRulesCount: 0
    },
    
    // 策略数据（按组分类）
    strategyGroups: {},
    
    // 矩阵配置
    matrixConfigs: [],
    budgetTiers: ['B0', 'B1', 'B2', 'B3', 'B4'],
    pressureTiers: ['P0', 'P1', 'P2'],
    
    // 档位规则
    tierRules: [],
    
    // 选中的配置（详情弹窗）
    selectedConfig: null,
    
    // 弹窗实例
    detailModal: null,
    
    /**
     * 初始化
     */
    async init() {
      console.log('🚀 初始化策略引擎配置页面...');
      
      // 初始化弹窗
      this.$nextTick(() => {
        this.detailModal = new bootstrap.Modal(this.$refs.detailModal);
      });
      
      // 加载用户信息
      this.loadUserInfo();
      
      // 加载所有数据
      await this.loadAllData();
    },
    
    /**
     * 加载用户信息
     */
    loadUserInfo() {
      try {
        const stored = localStorage.getItem('userInfo');
        if (stored) {
          this.userInfo = JSON.parse(stored);
        }
      } catch (e) {
        console.error('加载用户信息失败:', e);
      }
    },
    
    /**
     * 退出登录
     */
    logout() {
      if (confirm('确定要退出登录吗？')) {
        localStorage.removeItem('token');
        localStorage.removeItem('userInfo');
        window.location.href = '/admin/login.html';
      }
    },
    
    /**
     * 加载所有数据
     */
    async loadAllData() {
      this.loading = true;
      
      try {
        // 并行加载三种数据
        await Promise.all([
          this.loadStrategies(),
          this.loadMatrixConfigs(),
          this.loadTierRules()
        ]);
        
        // 更新统计
        this.updateStats();
        
        console.log('✅ 所有数据加载完成');
      } catch (error) {
        console.error('❌ 加载数据失败:', error);
        this.showError('加载数据失败: ' + error.message);
      } finally {
        this.loading = false;
      }
    },
    
    /**
     * 加载策略配置
     */
    async loadStrategies() {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/lottery/strategy-configs`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('加载策略配置失败');
        
        const result = await response.json();
        const strategies = result.data || [];
        
        // 按 config_group 分组
        this.strategyGroups = strategies.reduce((groups, config) => {
          const group = config.config_group || 'default';
          if (!groups[group]) groups[group] = [];
          groups[group].push(config);
          return groups;
        }, {});
        
        // 更新统计
        this.stats.totalStrategies = strategies.length;
        this.stats.activeStrategies = strategies.filter(s => s.is_active).length;
        
        console.log(`📊 加载策略配置: ${strategies.length} 个`);
      } catch (error) {
        console.error('加载策略配置失败:', error);
        this.strategyGroups = {};
      }
    },
    
    /**
     * 加载矩阵配置
     */
    async loadMatrixConfigs() {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/lottery/matrix-configs`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('加载矩阵配置失败');
        
        const result = await response.json();
        this.matrixConfigs = result.data || [];
        this.stats.matrixCount = this.matrixConfigs.length;
        
        console.log(`📊 加载矩阵配置: ${this.matrixConfigs.length} 个`);
      } catch (error) {
        console.error('加载矩阵配置失败:', error);
        this.matrixConfigs = [];
      }
    },
    
    /**
     * 加载档位规则
     */
    async loadTierRules() {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/lottery/tier-rules`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('加载档位规则失败');
        
        const result = await response.json();
        this.tierRules = result.data || [];
        this.stats.tierRulesCount = this.tierRules.length;
        
        console.log(`📊 加载档位规则: ${this.tierRules.length} 个`);
      } catch (error) {
        console.error('加载档位规则失败:', error);
        this.tierRules = [];
      }
    },
    
    /**
     * 更新统计数据
     */
    updateStats() {
      // 统计数据已在各加载函数中更新
      console.log('📊 统计更新:', this.stats);
    },
    
    /**
     * 获取分组名称
     */
    getGroupName(group) {
      const groupNames = {
        budget_tier: '💰 预算层策略',
        pity: '🎰 保底机制',
        luck_debt: '🔮 运气债务',
        anti_empty: '🛡️ 防空机制',
        default: '📋 默认配置',
        dynamic_cap: '📈 动态上限',
        weight_adjustment: '⚖️ 权重调整'
      };
      return groupNames[group] || `📁 ${group}`;
    },
    
    /**
     * 获取分组图标
     */
    getGroupIcon(group) {
      const groupIcons = {
        budget_tier: 'bi-currency-yen',
        pity: 'bi-gift',
        luck_debt: 'bi-dice-6',
        anti_empty: 'bi-shield-check',
        default: 'bi-gear',
        dynamic_cap: 'bi-graph-up',
        weight_adjustment: 'bi-sliders'
      };
      return groupIcons[group] || 'bi-folder';
    },
    
    /**
     * 获取矩阵配置
     */
    getMatrixConfig(budgetTier, pressureTier) {
      return this.matrixConfigs.find(
        m => m.budget_tier === budgetTier && m.pressure_tier === pressureTier
      );
    },
    
    /**
     * 查看策略详情
     */
    async viewStrategyDetail(configId) {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE_URL}/admin/lottery/strategy-configs/${configId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!response.ok) throw new Error('加载详情失败');
        
        const result = await response.json();
        this.selectedConfig = result.data;
        
        // 显示模态框
        this.detailModal.show();
      } catch (error) {
        console.error('加载策略详情失败:', error);
        
        // 尝试从本地数据中查找
        for (const group in this.strategyGroups) {
          const found = this.strategyGroups[group].find(c => c.strategy_config_id === configId);
          if (found) {
            this.selectedConfig = found;
            this.detailModal.show();
            return;
          }
        }
        
        this.showError('加载策略详情失败');
      }
    },
    
    /**
     * 格式化日期时间
     */
    formatDateTime(dateStr) {
      if (!dateStr) return '-';
      try {
        const date = new Date(dateStr);
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      } catch {
        return dateStr;
      }
    },
    
    /**
     * 显示错误消息
     */
    showError(message) {
      if (typeof showToast === 'function') {
        showToast(message, 'danger');
      } else {
        alert(message);
      }
    }
  };
}


// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('lotteryStrategyPage', lotteryStrategyPage)
  console.log('✅ [LotteryStrategyPage] Alpine 组件已注册')
})
