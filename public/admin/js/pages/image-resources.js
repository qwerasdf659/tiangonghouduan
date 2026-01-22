/**
 * 图片资源管理页面 - Alpine.js 版本
 *
 * @file public/admin/js/pages/image-resources.js
 * @description 图片列表、上传、删除、详情查看等功能
 * @version 2.0.0 (Alpine.js 重构版)
 * @date 2026-01-22
 */

/**
 * 图片资源管理页面 Alpine.js 组件
 */
function imageResourcesPage() {
  return {
    // ==================== 状态数据 ====================
    
    /** 用户信息 */
    userInfo: null,
    
    /** 图片列表 */
    images: [],
    
    /** 选中的图片详情 */
    selectedImage: null,
    
    /** 加载状态 */
    loading: true,
    
    /** 全局加载状态 */
    globalLoading: false,
    
    /** 上传中状态 */
    uploading: false,
    
    /** 当前页码 */
    currentPage: 1,
    
    /** 每页显示数量 */
    pageSize: 24,
    
    /** 总页数 */
    totalPages: 1,
    
    /** 筛选条件 */
    filters: {
      imageType: '',
      status: ''
    },
    
    /** 统计数据 */
    statistics: {
      totalImages: 0,
      totalSize: '0 MB',
      weeklyUploads: 0,
      orphanImages: 0
    },
    
    /** 待上传的文件列表 */
    selectedFiles: [],
    
    /** 上传图片类型 */
    uploadImageType: 'uploads',
    
    /** 文件预览URL缓存 */
    filePreviewUrls: new Map(),
    
    // ==================== 生命周期 ====================
    
    /**
     * 初始化
     */
    init() {
      console.log('✅ 图片资源管理页面 Alpine.js 组件初始化')
      
      // 获取用户信息
      this.userInfo = getCurrentUser()
      
      // 加载数据
      this.loadImageData()
    },
    
    // ==================== 数据加载方法 ====================
    
    /**
     * 加载图片数据
     */
    async loadImageData() {
      this.loading = true
      
      try {
        const params = new URLSearchParams({
          page: this.currentPage,
          page_size: this.pageSize
        })
        
        if (this.filters.imageType) params.append('business_type', this.filters.imageType)
        if (this.filters.status) params.append('status', this.filters.status)
        
        const response = await apiRequest(`${API_ENDPOINTS.IMAGE.LIST}?${params.toString()}`)
        
        if (response && response.success) {
          const { images, statistics, pagination } = response.data || {}
          
          this.images = images || []
          this.totalPages = pagination?.total_pages || 1
          
          // 更新统计数据
          this.statistics = {
            totalImages: statistics?.total ?? 0,
            totalSize: this.formatFileSize(statistics?.total_size ?? 0),
            weeklyUploads: statistics?.weekly_uploads ?? 0,
            orphanImages: statistics?.orphan_count ?? 0
          }
        } else {
          this.showError('加载失败', response?.message || '获取图片列表失败')
        }
      } catch (error) {
        console.error('加载图片失败:', error)
        this.showError('加载失败', error.message)
      } finally {
        this.loading = false
      }
    },
    
    // ==================== 上传相关方法 ====================
    
    /**
     * 处理文件拖放
     */
    handleDrop(event) {
      this.$refs.uploadZone.classList.remove('dragover')
      this.handleFiles(event.dataTransfer.files)
    },
    
    /**
     * 处理文件选择
     */
    handleFileSelect(event) {
      this.handleFiles(event.target.files)
    },
    
    /**
     * 处理文件
     */
    handleFiles(files) {
      const validFiles = Array.from(files).filter(file => {
        if (!file.type.startsWith('image/')) {
          this.showError('文件类型错误', `${file.name} 不是图片文件`)
          return false
        }
        if (file.size > 5 * 1024 * 1024) {
          this.showError('文件过大', `${file.name} 超过5MB限制`)
          return false
        }
        return true
      })
      
      this.selectedFiles = validFiles
    },
    
    /**
     * 获取文件预览URL
     */
    getFilePreview(file) {
      if (!this.filePreviewUrls.has(file)) {
        this.filePreviewUrls.set(file, URL.createObjectURL(file))
      }
      return this.filePreviewUrls.get(file)
    },
    
    /**
     * 上传图片
     */
    async uploadImages() {
      if (this.selectedFiles.length === 0) return
      
      this.uploading = true
      
      try {
        let successCount = 0
        
        for (const file of this.selectedFiles) {
          const formData = new FormData()
          formData.append('image', file)
          formData.append('business_type', this.uploadImageType)
          
          const response = await fetch(API_ENDPOINTS.IMAGE.UPLOAD, {
            method: 'POST',
            headers: { Authorization: `Bearer ${getToken()}` },
            body: formData
          })
          
          const result = await response.json()
          if (result.success) successCount++
        }
        
        alert(`✅ 成功上传 ${successCount}/${this.selectedFiles.length} 张图片`)
        
        // 清理
        bootstrap.Modal.getInstance(this.$refs.uploadModal).hide()
        this.selectedFiles = []
        this.filePreviewUrls.clear()
        
        // 重新加载
        this.loadImageData()
      } catch (error) {
        console.error('上传失败:', error)
        this.showError('上传失败', error.message)
      } finally {
        this.uploading = false
      }
    },
    
    // ==================== 图片操作方法 ====================
    
    /**
     * 显示图片详情
     */
    async showImageDetail(image) {
      this.globalLoading = true
      
      try {
        const response = await apiRequest(API.buildURL(API_ENDPOINTS.IMAGE.DELETE, { id: image.image_id }))
        
        if (response && response.success) {
          this.selectedImage = response.data
          new bootstrap.Modal(this.$refs.imageDetailModal).show()
        } else {
          this.showError('获取详情失败', response?.message || '操作失败')
        }
      } catch (error) {
        console.error('获取图片详情失败:', error)
        this.showError('获取失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 复制图片URL
     */
    copyImageUrl() {
      const input = this.$refs.imageUrlInput
      if (input) {
        input.select()
        document.execCommand('copy')
        alert('✅ URL已复制')
      }
    },
    
    /**
     * 删除图片
     */
    async deleteImage() {
      if (!this.selectedImage) return
      
      if (!confirm('确定要删除这张图片吗？此操作不可恢复。')) return
      
      this.globalLoading = true
      
      try {
        const response = await apiRequest(
          API.buildURL(API_ENDPOINTS.IMAGE.DELETE, { id: this.selectedImage.image_id }),
          { method: 'DELETE' }
        )
        
        if (response && response.success) {
          alert('✅ 删除成功')
          bootstrap.Modal.getInstance(this.$refs.imageDetailModal).hide()
          this.selectedImage = null
          this.loadImageData()
        } else {
          this.showError('删除失败', response?.message || '操作失败')
        }
      } catch (error) {
        console.error('删除失败:', error)
        this.showError('删除失败', error.message)
      } finally {
        this.globalLoading = false
      }
    },
    
    /**
     * 处理图片加载错误
     */
    handleImageError(event) {
      event.target.parentNode.innerHTML = '<div class="image-placeholder"><i class="bi bi-image text-muted" style="font-size: 2rem;"></i></div>'
    },
    
    // ==================== 分页方法 ====================
    
    /**
     * 跳转到指定页
     */
    goToPage(page) {
      if (page < 1 || page > this.totalPages) return
      this.currentPage = page
      this.loadImageData()
    },
    
    /**
     * 获取分页页码数组
     */
    getPaginationPages() {
      const pages = []
      const maxPages = Math.min(this.totalPages, 10)
      
      for (let i = 1; i <= maxPages; i++) {
        pages.push(i)
      }
      
      if (this.totalPages > 10) {
        pages.push('...')
      }
      
      return pages
    },
    
    // ==================== 工具方法 ====================
    
    /**
     * 格式化文件大小
     */
    formatFileSize(bytes) {
      if (!bytes || bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    },
    
    /**
     * 格式化日期时间
     */
    formatDateTime(dateStr) {
      if (!dateStr) return '-'
      return new Date(dateStr).toLocaleString('zh-CN')
    },
    
    /**
     * 显示错误提示
     */
    showError(title, message) {
      alert(`❌ ${title}\n${message}`)
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
  Alpine.data('imageResourcesPage', imageResourcesPage)
})
