/**
 * 弹窗Banner管理页面 - Alpine.js 组件
 */
function popupBannersPage() {
  return {
    userInfo: {},
    loading: false,
    globalLoading: false,
    submitting: false,
    
    // 统计数据
    stats: {
      total: 0,
      active: 0,
      inactive: 0,
      home: 0
    },
    
    // 筛选条件
    filters: {
      position: '',
      status: '',
      keyword: ''
    },
    
    // 列表数据
    banners: [],
    currentPage: 1,
    pageSize: 12,
    pagination: {
      total: 0,
      totalPages: 1
    },
    
    // 表单数据
    bannerForm: {
      banner_id: null,
      title: '',
      position: 'home',
      display_order: 0,
      is_active: true,
      link_type: 'none',
      link_url: '',
      start_time: '',
      end_time: ''
    },
    isEditMode: false,
    
    // 图片上传
    selectedImageFile: null,
    imagePreview: null,
    imageFileName: '',
    isDragging: false,
    
    // 查看详情
    viewBannerData: null,
    currentBannerId: null,
    
    // 删除确认
    deleteBannerId: null,
    deleteBannerTitle: '',
    
    // Modal 和 Toast 实例
    bannerModalInstance: null,
    viewModalInstance: null,
    deleteModalInstance: null,
    // Toast 使用全局 $toast

    async init() {
      console.log('🚀 初始化弹窗Banner管理页面...');
      this.loadUserInfo();
      
      this.$nextTick(() => {
        this.initModals();
      });
      
      await Promise.all([
        this.loadStatistics(),
        this.loadBanners()
      ]);
    },

    loadUserInfo() {
      const userInfo = getCurrentUser();
      if (userInfo) {
        this.userInfo = userInfo;
      }
    },

    initModals() {
      if (this.$refs.bannerModal) {
        this.bannerModalInstance = new bootstrap.Modal(this.$refs.bannerModal);
      }
      if (this.$refs.viewModal) {
        this.viewModalInstance = new bootstrap.Modal(this.$refs.viewModal);
      }
      if (this.$refs.deleteModal) {
        this.deleteModalInstance = new bootstrap.Modal(this.$refs.deleteModal);
      }
      // Toast 使用全局 $toast，无需初始化
    },

    async loadStatistics() {
      try {
        const response = await apiRequest(API_ENDPOINTS.POPUP_BANNER.STATS);
        if (response && response.success) {
          const statsData = response.data?.statistics || response.data || {};
          this.stats = {
            total: statsData.total ?? 0,
            active: statsData.active ?? 0,
            inactive: statsData.inactive ?? 0,
            home: statsData.by_position?.home ?? 0
          };
        }
      } catch (error) {
        console.error('加载统计失败:', error);
      }
    },

    async loadBanners() {
      this.loading = true;
      
      try {
        const params = new URLSearchParams();
        params.append('page', this.currentPage);
        params.append('page_size', this.pageSize);
        
        if (this.filters.position) params.append('position', this.filters.position);
        if (this.filters.status) params.append('is_active', this.filters.status);
        if (this.filters.keyword.trim()) params.append('keyword', this.filters.keyword.trim());
        
        const response = await apiRequest(`${API_ENDPOINTS.POPUP_BANNER.LIST}?${params.toString()}`);
        
        if (response && response.success) {
          this.banners = response.data.banners || [];
          this.pagination = {
            total: response.data.pagination.total,
            totalPages: response.data.pagination.total_pages
          };
          
          // 备用方案：从列表数据更新统计
          if (this.stats.total === 0) {
            this.updateStatisticsFromList();
          }
        } else {
          this.showError(response?.message || '获取弹窗列表失败');
        }
      } catch (error) {
        console.error('加载弹窗失败:', error);
        this.showError('加载失败: ' + error.message);
      } finally {
        this.loading = false;
      }
    },

    updateStatisticsFromList() {
      if (this.banners.length > 0) {
        const activeCount = this.banners.filter(b => b.is_active === true).length;
        const inactiveCount = this.banners.filter(b => b.is_active === false).length;
        const homeCount = this.banners.filter(b => b.position === 'home').length;
        
        this.stats = {
          total: this.pagination.total || this.banners.length,
          active: activeCount,
          inactive: inactiveCount,
          home: homeCount
        };
      }
    },

    // 分页
    goToPage(page) {
      if (page >= 1 && page <= this.pagination.totalPages && page !== this.currentPage) {
        this.currentPage = page;
        this.loadBanners();
      }
    },

    getPageNumbers() {
      const pages = [];
      const total = this.pagination.totalPages;
      const current = this.currentPage;
      const start = Math.max(1, current - 2);
      const end = Math.min(total, current + 2);
      
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      return pages;
    },

    // 新建弹窗
    openAddModal() {
      this.resetForm();
      this.isEditMode = false;
      if (this.bannerModalInstance) {
        this.bannerModalInstance.show();
      }
    },

    resetForm() {
      this.bannerForm = {
        banner_id: null,
        title: '',
        position: 'home',
        display_order: 0,
        is_active: true,
        link_type: 'none',
        link_url: '',
        start_time: '',
        end_time: ''
      };
      this.selectedImageFile = null;
      this.imagePreview = null;
      this.imageFileName = '';
      this.currentBannerId = null;
      
      // 重置文件输入
      if (this.$refs.imageInput) {
        this.$refs.imageInput.value = '';
      }
    },

    // 图片处理
    handleImageSelect(event) {
      const file = event.target.files[0];
      if (file) {
        this.processImageFile(file);
      }
    },

    handleImageDrop(event) {
      this.isDragging = false;
      const files = event.dataTransfer.files;
      if (files.length > 0) {
        this.processImageFile(files[0]);
      }
    },

    processImageFile(file) {
      // 验证文件类型
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        this.showError('只支持 JPG、PNG、GIF、WebP 格式');
        return;
      }
      
      // 验证文件大小（5MB）
      if (file.size > 5 * 1024 * 1024) {
        this.showError('图片大小不能超过 5MB');
        return;
      }
      
      this.selectedImageFile = file;
      this.imageFileName = `${file.name} (${this.formatFileSize(file.size)})`;
      
      // 预览图片
      const reader = new FileReader();
      reader.onload = (e) => {
        this.imagePreview = e.target.result;
      };
      reader.readAsDataURL(file);
    },

    clearImage() {
      this.selectedImageFile = null;
      this.imagePreview = null;
      this.imageFileName = '';
      if (this.$refs.imageInput) {
        this.$refs.imageInput.value = '';
      }
    },

    formatFileSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    },

    // 跳转链接提示
    getLinkUrlHint() {
      const hints = {
        page: '小程序页面示例：/pages/activity/index',
        miniprogram: '其他小程序AppID示例：wx1234567890abcdef',
        webview: 'H5网页地址示例：https://example.com/activity'
      };
      return hints[this.bannerForm.link_type] || '';
    },

    // 查看弹窗详情
    async viewBanner(id) {
      this.globalLoading = true;
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.POPUP_BANNER.DETAIL, { id }));
        
        if (response && response.success) {
          this.currentBannerId = id;
          this.viewBannerData = response.data;
          if (this.viewModalInstance) {
            this.viewModalInstance.show();
          }
        } else {
          this.showError(response?.message || '获取弹窗详情失败');
        }
      } catch (error) {
        console.error('查看弹窗失败:', error);
        this.showError('获取失败: ' + error.message);
      } finally {
        this.globalLoading = false;
      }
    },

    // 编辑弹窗
    async editBanner(id) {
      this.globalLoading = true;
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.POPUP_BANNER.DETAIL, { id }));
        
        if (response && response.success) {
          const banner = response.data;
          this.currentBannerId = id;
          this.isEditMode = true;
          
          // 填充表单
          this.bannerForm = {
            banner_id: banner.banner_id,
            title: banner.title,
            position: banner.position,
            display_order: banner.display_order,
            is_active: banner.is_active,
            link_type: banner.link_type,
            link_url: banner.link_url || '',
            start_time: this.formatDateTimeLocal(banner.start_time),
            end_time: this.formatDateTimeLocal(banner.end_time)
          };
          
          // 显示现有图片
          this.imagePreview = banner.image_url;
          this.imageFileName = '当前图片（上传新图片将替换）';
          this.selectedImageFile = null;
          
          if (this.bannerModalInstance) {
            this.bannerModalInstance.show();
          }
        } else {
          this.showError(response?.message || '获取弹窗详情失败');
        }
      } catch (error) {
        console.error('编辑弹窗失败:', error);
        this.showError('获取失败: ' + error.message);
      } finally {
        this.globalLoading = false;
      }
    },

    // 从详情页面编辑
    editFromView() {
      if (this.viewModalInstance) {
        this.viewModalInstance.hide();
      }
      if (this.currentBannerId) {
        this.editBanner(this.currentBannerId);
      }
    },

    // 切换启用状态
    async toggleBanner(id) {
      this.globalLoading = true;
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.POPUP_BANNER.TOGGLE, { id }), {
          method: 'PATCH'
        });
        
        if (response && response.success) {
          this.showSuccess(response.message || '操作成功');
          await Promise.all([
            this.loadStatistics(),
            this.loadBanners()
          ]);
        } else {
          this.showError(response?.message || '切换状态失败');
        }
      } catch (error) {
        console.error('切换状态失败:', error);
        this.showError('操作失败: ' + error.message);
      } finally {
        this.globalLoading = false;
      }
    },

    // 删除确认
    showDeleteConfirm(banner) {
      this.deleteBannerId = banner.banner_id;
      this.deleteBannerTitle = banner.title;
      if (this.deleteModalInstance) {
        this.deleteModalInstance.show();
      }
    },

    async confirmDelete() {
      this.submitting = true;
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.POPUP_BANNER.UPDATE, { id: this.deleteBannerId }), {
          method: 'DELETE'
        });
        
        if (response && response.success) {
          if (this.deleteModalInstance) {
            this.deleteModalInstance.hide();
          }
          this.showSuccess('弹窗已删除');
          await Promise.all([
            this.loadStatistics(),
            this.loadBanners()
          ]);
        } else {
          this.showError(response?.message || '删除弹窗失败');
        }
      } catch (error) {
        console.error('删除弹窗失败:', error);
        this.showError('删除失败: ' + error.message);
      } finally {
        this.submitting = false;
      }
    },

    // 保存弹窗
    async saveBanner() {
      // 验证必填字段
      if (!this.bannerForm.title.trim()) {
        this.showError('请填写弹窗标题');
        return;
      }
      
      // 新建时验证图片
      if (!this.isEditMode && !this.selectedImageFile) {
        this.showError('请上传弹窗图片');
        return;
      }
      
      // 验证跳转链接
      if (this.bannerForm.link_type !== 'none' && !this.bannerForm.link_url.trim()) {
        this.showError('选择跳转类型后，跳转链接是必填项');
        return;
      }
      
      this.submitting = true;
      
      try {
        const formData = new FormData();
        formData.append('title', this.bannerForm.title.trim());
        formData.append('position', this.bannerForm.position);
        formData.append('display_order', this.bannerForm.display_order);
        formData.append('is_active', this.bannerForm.is_active);
        formData.append('link_type', this.bannerForm.link_type);
        
        if (this.bannerForm.link_url.trim()) {
          formData.append('link_url', this.bannerForm.link_url.trim());
        }
        
        if (this.bannerForm.start_time) {
          formData.append('start_time', this.bannerForm.start_time);
        }
        if (this.bannerForm.end_time) {
          formData.append('end_time', this.bannerForm.end_time);
        }
        
        if (this.selectedImageFile) {
          formData.append('image', this.selectedImageFile);
        }
        
        const url = this.isEditMode
          ? API.buildURL(API_ENDPOINTS.POPUP_BANNER.UPDATE, { id: this.bannerForm.banner_id })
          : API_ENDPOINTS.POPUP_BANNER.CREATE;
        const method = this.isEditMode ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
          method: method,
          headers: {
            Authorization: `Bearer ${getToken()}`
          },
          body: formData
        });
        
        const result = await response.json();
        
        if (result && result.success) {
          if (this.bannerModalInstance) {
            this.bannerModalInstance.hide();
          }
          this.showSuccess(this.isEditMode ? '更新成功' : '创建成功');
          this.resetForm();
          await Promise.all([
            this.loadStatistics(),
            this.loadBanners()
          ]);
        } else {
          this.showError(result?.message || '操作失败');
        }
      } catch (error) {
        console.error('保存弹窗失败:', error);
        this.showError('操作失败: ' + error.message);
      } finally {
        this.submitting = false;
      }
    },

    // 辅助函数
    getPositionText(position) {
      const texts = { home: '首页', profile: '个人中心' };
      return texts[position] || position;
    },

    getLinkTypeText(linkType) {
      const texts = { none: '无跳转', page: '小程序页面', miniprogram: '其他小程序', webview: 'H5网页' };
      return texts[linkType] || linkType;
    },

    formatTimeRange(startTime, endTime) {
      if (!startTime && !endTime) return '永久有效';
      if (startTime && !endTime) return `${this.formatDate(startTime)} 起`;
      if (!startTime && endTime) return `至 ${this.formatDate(endTime)}`;
      return `${this.formatDate(startTime)} ~ ${this.formatDate(endTime)}`;
    },

    formatDate(dateStr) {
      if (!dateStr) return '-';
      return new Date(dateStr).toLocaleString('zh-CN');
    },

    formatDateTimeLocal(dateStr) {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    },

    // 消息提示 - 使用全局 $toast
    showSuccess(message) {
      this.$toast.success(message);
    },

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
  };
}

// Alpine.js 组件注册
document.addEventListener('alpine:init', () => {
  Alpine.data('popupBannersPage', popupBannersPage)
  console.log('✅ [PopupBannersPage] Alpine 组件已注册')
})
