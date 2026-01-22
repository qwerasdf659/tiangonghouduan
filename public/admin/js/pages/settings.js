/**
 * 系统设置页面 - Alpine.js CSP 版本
 * 管理系统各项配置：基础设置、抽奖设置、积分设置、通知设置、安全设置、缓存管理
 * 
 * 注意：使用 Alpine.data() 注册组件以兼容 CSP 策略
 */

function settingsPage() {
  return {
    // ========== 状态 ==========
    loading: false,
    showBanner: true,
    userInfo: null,
    
    // 保存状态（各个表单独立）
    saving: {
      basic: false,
      lottery: false,
      points: false,
      notification: false,
      security: false
    },
    
    // 缓存清理状态
    clearing: {
      user: false,
      stats: false,
      config: false,
      all: false
    },
    
    // ========== 基础设置 ==========
    basicSettings: {
      systemName: '餐厅抽奖系统',
      systemVersion: 'v1.0.0',
      customerServicePhone: '',
      customerServiceEmail: '',
      systemAnnouncement: '',
      maintenanceMode: false
    },
    
    // ========== 抽奖设置 ==========
    lotterySettings: {
      dailyDrawLimit: 10,
      drawCostPoints: 100,
      minConsumptionAmount: 50.00,
      pointsConversionRate: '1:10',
      guaranteedWinEnabled: false,
      guaranteedWinCount: 20
    },
    
    // ========== 积分设置 ==========
    pointsSettings: {
      registerBonusPoints: 100,
      dailyCheckInPoints: 10,
      referralBonusPoints: 50,
      pointsExpireDays: 365,
      pointsClearRule: 'never',
      budgetAllocationRatio: 0.24
    },
    
    // ========== 通知设置 ==========
    notificationSettings: {
      smtpHost: '',
      smtpPort: 465,
      smtpEmail: '',
      smtpPassword: '',
      smsProvider: '',
      smsAccessKey: '',
      smsAccessSecret: '',
      smsSignature: ''
    },
    
    // ========== 安全设置 ==========
    securitySettings: {
      loginFailLimit: 5,
      lockoutDuration: 30,
      sessionTimeout: 120,
      jwtExpireHours: 24,
      ipWhitelist: '',
      enableTwoFactor: false,
      forceHttps: false,
      enableAuditLog: false
    },
    
    // ========== 初始化 ==========
    init() {
      // 获取当前用户信息
      this.userInfo = this.getCurrentUser()
      
      // 权限验证
      if (!this.getToken() || !this.checkAdminPermission()) {
        return
      }
      
      // 加载所有设置
      this.loadAllSettings()
    },
    
    // ========== 辅助方法 ==========
    getToken() {
      return localStorage.getItem('admin_token')
    },
    
    getCurrentUser() {
      try {
        const userStr = localStorage.getItem('admin_user')
        return userStr ? JSON.parse(userStr) : null
      } catch {
        return null
      }
    },
    
    checkAdminPermission() {
      const user = this.userInfo
      if (!user) {
        window.location.href = '/admin/login.html'
        return false
      }
      if (user.role_level >= 100) return true
      if (user.roles?.some(role => role.role_level >= 100)) return true
      
      alert('权限不足，请使用管理员账号登录')
      window.location.href = '/admin/login.html'
      return false
    },
    
    logout() {
      localStorage.removeItem('admin_token')
      localStorage.removeItem('admin_user')
      window.location.href = '/admin/login.html'
    },
    
    scrollTo(sectionId) {
      const target = document.getElementById(sectionId)
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' })
      }
    },
    
    showMessage(title, message, isError = false) {
      alert(`${isError ? '❌' : '✅'} ${title}\n${message}`)
    },
    
    // ========== 加载所有设置 ==========
    async loadAllSettings() {
      this.loading = true
      
      try {
        // 并行加载所有分类的设置
        const [basicRes, pointsRes, notificationRes, securityRes] = await Promise.all([
          this.apiRequest(API_ENDPOINTS.SETTINGS.BASIC).catch(() => null),
          this.apiRequest(API_ENDPOINTS.SETTINGS.POINTS).catch(() => null),
          this.apiRequest(API_ENDPOINTS.SETTINGS.NOTIFICATION).catch(() => null),
          this.apiRequest(API_ENDPOINTS.SETTINGS.SECURITY).catch(() => null)
        ])
        
        // 加载基础设置
        if (basicRes?.success && basicRes.data?.settings) {
          basicRes.data.settings.forEach(setting => {
            const { setting_key, parsed_value } = setting
            if (setting_key === 'system_name') this.basicSettings.systemName = parsed_value
            if (setting_key === 'system_version') this.basicSettings.systemVersion = parsed_value
            if (setting_key === 'customer_phone') this.basicSettings.customerServicePhone = parsed_value
            if (setting_key === 'customer_email') this.basicSettings.customerServiceEmail = parsed_value
          })
        }
        
        // 加载积分设置
        if (pointsRes?.success && pointsRes.data?.settings) {
          pointsRes.data.settings.forEach(setting => {
            const { setting_key, parsed_value } = setting
            if (setting_key === 'sign_in_points') this.pointsSettings.dailyCheckInPoints = parsed_value
            if (setting_key === 'initial_points') this.pointsSettings.registerBonusPoints = parsed_value
            if (setting_key === 'points_expire_days') this.pointsSettings.pointsExpireDays = parsed_value
            if (setting_key === 'budget_allocation_ratio') this.pointsSettings.budgetAllocationRatio = parsed_value
          })
        }
        
        // 加载安全设置
        if (securityRes?.success && securityRes.data?.settings) {
          securityRes.data.settings.forEach(setting => {
            const { setting_key, parsed_value } = setting
            if (setting_key === 'max_login_attempts') this.securitySettings.loginFailLimit = parsed_value
            if (setting_key === 'lockout_duration') this.securitySettings.lockoutDuration = parsed_value
          })
        }
        
        console.log('✅ 所有设置加载完成')
      } catch (error) {
        console.error('加载设置失败:', error)
        this.showMessage('加载失败', error.message, true)
      } finally {
        this.loading = false
      }
    },
    
    // ========== API 请求封装 ==========
    async apiRequest(url, options = {}) {
      const token = this.getToken()
      const defaultOptions = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
      
      const response = await fetch(url, { ...defaultOptions, ...options })
      return await response.json()
    },
    
    // ========== 保存基础设置 ==========
    async saveBasicSettings() {
      this.saving.basic = true
      
      try {
        const settings = {
          system_name: this.basicSettings.systemName,
          customer_phone: this.basicSettings.customerServicePhone,
          customer_email: this.basicSettings.customerServiceEmail
        }
        
        const response = await this.apiRequest(API_ENDPOINTS.SETTINGS.BASIC, {
          method: 'PUT',
          body: JSON.stringify({ settings })
        })
        
        if (response?.success) {
          this.showMessage('保存成功', '基础设置已更新')
        } else {
          this.showMessage('保存失败', response?.message || '保存基础设置失败', true)
        }
      } catch (error) {
        console.error('保存设置失败:', error)
        this.showMessage('保存失败', error.message, true)
      } finally {
        this.saving.basic = false
      }
    },
    
    // ========== 保存抽奖设置 ==========
    async saveLotterySettings() {
      this.saving.lottery = true
      
      try {
        // 提示用户：抽奖核心配置需要修改代码
        alert(
          '💡 抽奖配置说明\n\n' +
          '✅ 运营配置（可通过界面修改）：\n' +
          '   - 请前往【用户管理】页面\n' +
          '   - 点击用户的【概率】按钮\n' +
          '   - 可设置特定用户的中奖率\n' +
          '\n' +
          '⚙️ 算法配置（需要技术团队修改代码）：\n' +
          '   - 基础中奖率：config/business.config.js\n' +
          '   - 保底触发规则：BasicGuaranteeStrategy.js\n' +
          '   - 连抽定价：config/business.config.js\n' +
          '\n' +
          '修改算法配置后需要重启服务生效。'
        )
      } finally {
        this.saving.lottery = false
      }
    },
    
    // ========== 保存积分设置 ==========
    async savePointsSettings() {
      this.saving.points = true
      
      try {
        const settings = {
          sign_in_points: this.pointsSettings.dailyCheckInPoints,
          initial_points: this.pointsSettings.registerBonusPoints,
          points_expire_days: this.pointsSettings.pointsExpireDays,
          budget_allocation_ratio: this.pointsSettings.budgetAllocationRatio
        }
        
        const response = await this.apiRequest(API_ENDPOINTS.SETTINGS.POINTS, {
          method: 'PUT',
          body: JSON.stringify({ settings })
        })
        
        if (response?.success) {
          this.showMessage('保存成功', '积分设置已更新（包括预算分配系数）')
        } else {
          this.showMessage('保存失败', response?.message || '保存积分设置失败', true)
        }
      } catch (error) {
        console.error('保存设置失败:', error)
        this.showMessage('保存失败', error.message, true)
      } finally {
        this.saving.points = false
      }
    },
    
    // ========== 保存通知设置 ==========
    async saveNotificationSettings() {
      this.saving.notification = true
      
      try {
        const settings = {
          sms_enabled: this.notificationSettings.smsProvider !== '',
          email_enabled: this.notificationSettings.smtpHost !== '',
          app_notification_enabled: true
        }
        
        const response = await this.apiRequest(API_ENDPOINTS.SETTINGS.NOTIFICATION, {
          method: 'PUT',
          body: JSON.stringify({ settings })
        })
        
        if (response?.success) {
          this.showMessage('保存成功', '通知设置已更新')
        } else {
          this.showMessage('保存失败', response?.message || '保存通知设置失败', true)
        }
      } catch (error) {
        console.error('保存设置失败:', error)
        this.showMessage('保存失败', error.message, true)
      } finally {
        this.saving.notification = false
      }
    },
    
    // ========== 保存安全设置 ==========
    async saveSecuritySettings() {
      this.saving.security = true
      
      try {
        const settings = {
          max_login_attempts: this.securitySettings.loginFailLimit,
          lockout_duration: this.securitySettings.lockoutDuration,
          password_min_length: 6,
          api_rate_limit: 100
        }
        
        const response = await this.apiRequest(API_ENDPOINTS.SETTINGS.SECURITY, {
          method: 'PUT',
          body: JSON.stringify({ settings })
        })
        
        if (response?.success) {
          this.showMessage('保存成功', '安全设置已更新')
        } else {
          this.showMessage('保存失败', response?.message || '保存安全设置失败', true)
        }
      } catch (error) {
        console.error('保存设置失败:', error)
        this.showMessage('保存失败', error.message, true)
      } finally {
        this.saving.security = false
      }
    },
    
    // ========== 清除缓存 ==========
    async clearCache(type) {
      const typeNames = {
        user: '用户',
        stats: '统计',
        config: '系统配置',
        all: '全部'
      }
      
      if (!confirm(`确认清除${typeNames[type] || type}缓存？\n清除后需要一定时间重建缓存，可能暂时影响性能。`)) {
        return
      }
      
      this.clearing[type] = true
      
      try {
        // 根据类型构建pattern
        let pattern = '*' // 默认全部
        if (type === 'rate_limit') pattern = 'rate_limit:*'
        else if (type === 'user') pattern = 'user_*'
        else if (type === 'prize') pattern = 'prize_*'
        
        const response = await this.apiRequest(API_ENDPOINTS.CACHE.CLEAR, {
          method: 'POST',
          body: JSON.stringify({ pattern, confirm: true })
        })
        
        if (response?.success) {
          this.showMessage('清除成功', `已清除${response.data?.cleared_count || 0}个缓存键`)
        } else {
          this.showMessage('清除失败', response?.message || '缓存清除失败', true)
        }
      } catch (error) {
        console.error('清除缓存失败:', error)
        this.showMessage('清除失败', error.message, true)
      } finally {
        this.clearing[type] = false
      }
    }
  }
}

// ========== Alpine.js CSP 兼容注册 ==========
document.addEventListener('alpine:init', () => {
  Alpine.data('settingsPage', settingsPage)
  console.log('✅ [SettingsPage] Alpine 组件已注册')
})
