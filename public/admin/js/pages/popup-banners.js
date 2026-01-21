/**
 * 弹窗Banner管理页面脚本
 *
 * @description 管理首页弹窗图片，支持CRUD操作和图片上传
 * @author 开发团队
 * @date 2025-12-22
 */

// ==================== 全局变量 ====================
let currentPage = 1
let pageSize = 12
let totalRecords = 0
let currentBannerId = null
let selectedImageFile = null

// ==================== 页面初始化 ====================
document.addEventListener('DOMContentLoaded', function () {
  // 显示用户信息
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  // 加载统计数据和列表
  loadStatistics()
  loadBanners()

  // 绑定事件
  bindEvents()
})

/**
 * 绑定页面事件
 */
function bindEvents() {
  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // 搜索和筛选
  document.getElementById('searchBtn').addEventListener('click', () => {
    currentPage = 1
    loadBanners()
  })
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadStatistics()
    loadBanners()
  })

  // 筛选器变化
  document.getElementById('filterPosition').addEventListener('change', () => {
    currentPage = 1
    loadBanners()
  })
  document.getElementById('filterStatus').addEventListener('change', () => {
    currentPage = 1
    loadBanners()
  })

  // 回车搜索
  document.getElementById('filterKeyword').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      currentPage = 1
      loadBanners()
    }
  })

  // 新建弹窗按钮
  document.getElementById('addBannerBtn').addEventListener('click', () => {
    resetForm()
    document.getElementById('bannerModalTitle').innerHTML =
      '<i class="bi bi-plus-circle"></i> 新建弹窗'
  })

  // 保存弹窗
  document.getElementById('saveBannerBtn').addEventListener('click', saveBanner)

  // 确认删除
  document.getElementById('confirmDeleteBtn').addEventListener('click', confirmDelete)

  // 跳转类型变化
  document.getElementById('bannerLinkType').addEventListener('change', handleLinkTypeChange)

  // 图片上传
  setupImageUpload()

  // 弹窗列表点击事件委托
  document.getElementById('bannersList').addEventListener('click', handleBannerAction)

  // 从详情编辑
  document.getElementById('editFromViewBtn').addEventListener('click', () => {
    bootstrap.Modal.getInstance(document.getElementById('viewModal')).hide()
    editBanner(currentBannerId)
  })
}

// ==================== 图片上传 ====================

/**
 * 设置图片上传功能
 */
function setupImageUpload() {
  const uploadZone = document.getElementById('uploadZone')
  const imageInput = document.getElementById('imageInput')

  // 点击上传
  uploadZone.addEventListener('click', () => imageInput.click())

  // 拖拽上传
  uploadZone.addEventListener('dragover', e => {
    e.preventDefault()
    uploadZone.classList.add('dragover')
  })

  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover')
  })

  uploadZone.addEventListener('drop', e => {
    e.preventDefault()
    uploadZone.classList.remove('dragover')
    const files = e.dataTransfer.files
    if (files.length > 0) {
      handleImageSelect(files[0])
    }
  })

  // 文件选择
  imageInput.addEventListener('change', e => {
    if (e.target.files.length > 0) {
      handleImageSelect(e.target.files[0])
    }
  })
}

/**
 * 处理图片选择
 * @param {File} file - 图片文件
 */
function handleImageSelect(file) {
  // 验证文件类型
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    showError('文件类型错误', '只支持 JPG、PNG、GIF、WebP 格式')
    return
  }

  // 验证文件大小（5MB）
  if (file.size > 5 * 1024 * 1024) {
    showError('文件过大', '图片大小不能超过 5MB')
    return
  }

  selectedImageFile = file

  // 预览图片
  const reader = new FileReader()
  reader.onload = e => {
    const uploadZone = document.getElementById('uploadZone')
    uploadZone.innerHTML = `
      <img src="${e.target.result}" class="preview-image" alt="预览图片" />
      <p class="small text-muted mt-2 mb-0">${file.name} (${formatFileSize(file.size)})</p>
      <button type="button" class="btn btn-sm btn-outline-danger mt-2" onclick="clearImage(event)">
        <i class="bi bi-x-lg"></i> 移除图片
      </button>
    `
    uploadZone.classList.add('has-image')
  }
  reader.readAsDataURL(file)
}

/**
 * 清除已选图片
 * @param {Event} e - 事件对象
 */
function clearImage(e) {
  e.stopPropagation()
  selectedImageFile = null
  document.getElementById('imageInput').value = ''
  const uploadZone = document.getElementById('uploadZone')
  uploadZone.innerHTML = `
    <i class="bi bi-cloud-arrow-up text-muted" style="font-size: 3rem;"></i>
    <p class="mb-1 text-muted">点击或拖拽上传图片</p>
    <p class="small text-muted mb-0">支持 JPG、PNG、GIF、WebP，最大 5MB</p>
  `
  uploadZone.classList.remove('has-image')
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB'
}

// ==================== 跳转类型处理 ====================

/**
 * 处理跳转类型变化
 */
function handleLinkTypeChange() {
  const linkType = document.getElementById('bannerLinkType').value
  const linkUrlSection = document.getElementById('linkUrlSection')
  const linkUrlInput = document.getElementById('bannerLinkUrl')
  const linkUrlHint = document.getElementById('linkUrlHint')

  if (linkType === 'none') {
    linkUrlSection.style.display = 'none'
    linkUrlInput.removeAttribute('required')
  } else {
    linkUrlSection.style.display = 'block'
    linkUrlInput.setAttribute('required', 'required')

    // 更新提示文字
    const hints = {
      page: '小程序页面示例：/pages/activity/index',
      miniprogram: '其他小程序AppID示例：wx1234567890abcdef',
      webview: 'H5网页地址示例：https://example.com/activity'
    }
    linkUrlHint.textContent = hints[linkType] || ''
  }
}

// ==================== 数据加载 ====================

/**
 * 加载统计数据
 */
async function loadStatistics() {
  try {
    console.log('📊 开始加载统计数据...')
    const response = await apiRequest(API_ENDPOINTS.POPUP_BANNER.STATS)
    console.log('📊 统计API响应:', response)

    // 处理未登录或token失效的情况（apiRequest返回undefined）
    if (!response) {
      console.warn('统计数据加载失败: 未获取到响应（可能是未登录或token失效）')
      setStatisticsError('需要登录')
      return
    }

    if (response.success) {
      // 后端返回 { statistics: {...} }，适配后端数据结构
      const stats = response.data?.statistics || response.data || {}
      console.log('📊 解析的统计数据:', stats)
      
      // 更新统计卡片
      const total = stats.total ?? 0
      const active = stats.active ?? 0
      const inactive = stats.inactive ?? 0
      const home = stats.by_position?.home ?? 0
      
      console.log(`📊 统计值: total=${total}, active=${active}, inactive=${inactive}, home=${home}`)
      
      document.getElementById('statTotal').textContent = formatNumber(total)
      document.getElementById('statActive').textContent = formatNumber(active)
      document.getElementById('statInactive').textContent = formatNumber(inactive)
      document.getElementById('statHome').textContent = formatNumber(home)
      
      console.log('✅ 统计数据更新完成')
    } else {
      console.warn('统计数据加载失败:', response.message)
      setStatisticsError(response.message || '加载失败')
    }
  } catch (error) {
    console.error('❌ 加载统计失败:', error)
    setStatisticsError('请求错误')
  }
}

/**
 * 设置统计数据为错误状态
 * @param {string} message - 错误信息
 */
function setStatisticsError(message) {
  const errorText = `<span class="text-danger" title="${message}">-</span>`
  const elements = ['statTotal', 'statActive', 'statInactive', 'statHome']
  elements.forEach(id => {
    const el = document.getElementById(id)
    if (el) el.innerHTML = errorText
  })
}

/**
 * 从列表数据更新统计（备用方案）
 * 当统计API失败时，可以从列表数据计算统计
 * @param {Array} banners - 弹窗列表
 * @param {number} total - 总数
 */
function updateStatisticsFromList(banners, total) {
  // 如果统计已经正确显示（不是"-"），则跳过
  const statTotalEl = document.getElementById('statTotal')
  const currentValue = statTotalEl?.textContent?.trim()
  
  // 只有当统计显示"-"时才从列表数据更新
  if (currentValue === '-' || currentValue === '') {
    console.log('📊 从列表数据更新统计（备用方案）')
    
    const activeCount = banners.filter(b => b.is_active === true).length
    const inactiveCount = banners.filter(b => b.is_active === false).length
    const homeCount = banners.filter(b => b.position === 'home').length
    
    document.getElementById('statTotal').textContent = formatNumber(total || banners.length)
    document.getElementById('statActive').textContent = formatNumber(activeCount)
    document.getElementById('statInactive').textContent = formatNumber(inactiveCount)
    document.getElementById('statHome').textContent = formatNumber(homeCount)
    
    console.log(`📊 备用统计: total=${total}, active=${activeCount}, inactive=${inactiveCount}, home=${homeCount}`)
  }
}

/**
 * 加载弹窗列表
 */
async function loadBanners() {
  showLoading()

  try {
    const params = new URLSearchParams()
    params.append('page', currentPage)
    params.append('page_size', pageSize)

    const position = document.getElementById('filterPosition').value
    const status = document.getElementById('filterStatus').value
    const keyword = document.getElementById('filterKeyword').value.trim()

    if (position) params.append('position', position)
    if (status) params.append('is_active', status)
    if (keyword) params.append('keyword', keyword)

    const response = await apiRequest(`${API_ENDPOINTS.POPUP_BANNER.LIST}?${params.toString()}`)

    if (response && response.success) {
      const data = response.data
      totalRecords = data.pagination.total
      
      // 从列表数据计算统计（作为备用方案）
      updateStatisticsFromList(data.banners, data.pagination.total)
      
      renderBanners(data.banners)
      renderPagination(data.pagination)
    } else {
      showError('加载失败', response?.message || '获取弹窗列表失败')
    }
  } catch (error) {
    console.error('加载弹窗失败:', error)
    showError('加载失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 渲染弹窗列表
 * @param {Array} banners - 弹窗数组
 */
function renderBanners(banners) {
  const container = document.getElementById('bannersList')

  if (!banners || banners.length === 0) {
    container.innerHTML = `
      <div class="text-center py-5 col-12">
        <i class="bi bi-images text-muted" style="font-size: 4rem;"></i>
        <p class="mt-3 text-muted">暂无弹窗数据</p>
        <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#bannerModal">
          <i class="bi bi-plus-lg"></i> 新建弹窗
        </button>
      </div>
    `
    return
  }

  container.innerHTML = banners
    .map(
      banner => `
    <div class="col-md-4 col-lg-3">
      <div class="card banner-card h-100 position-relative" data-id="${banner.banner_id}">
        <div class="position-relative">
          <img src="${banner.image_url}" class="banner-preview card-img-top" 
               alt="${banner.title}" onerror="this.src='/admin/images/placeholder.png'" />
          <span class="banner-order-badge">${banner.display_order}</span>
          <span class="banner-status-badge badge ${banner.is_active ? 'bg-success' : 'bg-secondary'}">
            ${banner.is_active ? '已启用' : '已禁用'}
          </span>
        </div>
        <div class="card-body">
          <h6 class="card-title text-truncate" title="${banner.title}">${banner.title}</h6>
          <div class="small text-muted">
            <p class="mb-1">
              <i class="bi bi-geo-alt"></i> 
              ${getPositionText(banner.position)}
            </p>
            <p class="mb-1">
              <i class="bi bi-link-45deg"></i> 
              ${getLinkTypeText(banner.link_type)}
            </p>
            <p class="mb-0">
              <i class="bi bi-calendar"></i> 
              ${formatTimeRange(banner.start_time, banner.end_time)}
            </p>
          </div>
        </div>
        <div class="card-footer bg-white border-top-0">
          <div class="btn-group w-100" role="group">
            <button class="btn btn-sm btn-outline-primary" data-action="view" data-id="${banner.banner_id}" title="查看">
              <i class="bi bi-eye"></i>
            </button>
            <button class="btn btn-sm btn-outline-secondary" data-action="edit" data-id="${banner.banner_id}" title="编辑">
              <i class="bi bi-pencil"></i>
            </button>
            <button class="btn btn-sm ${banner.is_active ? 'btn-outline-warning' : 'btn-outline-success'}" 
                    data-action="toggle" data-id="${banner.banner_id}" 
                    title="${banner.is_active ? '禁用' : '启用'}">
              <i class="bi ${banner.is_active ? 'bi-pause' : 'bi-play'}"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" data-action="delete" 
                    data-id="${banner.banner_id}" data-title="${banner.title}" title="删除">
              <i class="bi bi-trash"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `
    )
    .join('')
}

/**
 * 渲染分页
 * @param {Object} pagination - 分页信息
 */
function renderPagination(pagination) {
  document.getElementById('paginationInfo').textContent =
    `共 ${formatNumber(pagination.total)} 条，第 ${pagination.page}/${pagination.total_pages} 页`

  const paginationEl = document.getElementById('pagination')
  const totalPages = pagination.total_pages

  if (totalPages <= 1) {
    paginationEl.innerHTML = ''
    return
  }

  let html = ''

  // 上一页
  html += `
    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${currentPage - 1}">&laquo;</a>
    </li>
  `

  // 页码
  const startPage = Math.max(1, currentPage - 2)
  const endPage = Math.min(totalPages, currentPage + 2)

  for (let i = startPage; i <= endPage; i++) {
    html += `
      <li class="page-item ${i === currentPage ? 'active' : ''}">
        <a class="page-link" href="#" data-page="${i}">${i}</a>
      </li>
    `
  }

  // 下一页
  html += `
    <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
      <a class="page-link" href="#" data-page="${currentPage + 1}">&raquo;</a>
    </li>
  `

  paginationEl.innerHTML = html

  // 绑定分页事件
  paginationEl.querySelectorAll('a[data-page]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault()
      const page = parseInt(e.target.dataset.page)
      if (page >= 1 && page <= totalPages && page !== currentPage) {
        currentPage = page
        loadBanners()
      }
    })
  })
}

// ==================== 操作处理 ====================

/**
 * 处理弹窗操作
 * @param {Event} e - 事件对象
 */
function handleBannerAction(e) {
  const button = e.target.closest('button[data-action]')
  if (!button) return

  const action = button.dataset.action
  const id = parseInt(button.dataset.id)

  switch (action) {
    case 'view':
      viewBanner(id)
      break
    case 'edit':
      editBanner(id)
      break
    case 'toggle':
      toggleBanner(id)
      break
    case 'delete':
      showDeleteConfirm(id, button.dataset.title)
      break
  }
}

/**
 * 查看弹窗详情
 * @param {number} id - 弹窗ID
 */
async function viewBanner(id) {
  showLoading()

  try {
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.POPUP_BANNER.DETAIL, { id }))

    if (response && response.success) {
      currentBannerId = id
      renderViewModal(response.data)
      new bootstrap.Modal(document.getElementById('viewModal')).show()
    } else {
      showError('获取失败', response?.message || '获取弹窗详情失败')
    }
  } catch (error) {
    console.error('查看弹窗失败:', error)
    showError('获取失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 渲染查看详情模态框
 * @param {Object} banner - 弹窗数据
 */
function renderViewModal(banner) {
  const html = `
    <div class="row">
      <div class="col-md-6">
        <img src="${banner.image_url}" class="img-fluid rounded mb-3" alt="${banner.title}" />
      </div>
      <div class="col-md-6">
        <h5 class="mb-3">${banner.title}</h5>
        <table class="table table-sm">
          <tr>
            <td class="text-muted">状态</td>
            <td>
              <span class="badge ${banner.is_active ? 'bg-success' : 'bg-secondary'}">
                ${banner.is_active ? '已启用' : '已禁用'}
              </span>
            </td>
          </tr>
          <tr>
            <td class="text-muted">显示位置</td>
            <td>${getPositionText(banner.position)}</td>
          </tr>
          <tr>
            <td class="text-muted">显示顺序</td>
            <td>${banner.display_order}</td>
          </tr>
          <tr>
            <td class="text-muted">跳转类型</td>
            <td>${getLinkTypeText(banner.link_type)}</td>
          </tr>
          ${
            banner.link_url
              ? `
          <tr>
            <td class="text-muted">跳转链接</td>
            <td class="text-break small">${banner.link_url}</td>
          </tr>
          `
              : ''
          }
          <tr>
            <td class="text-muted">展示时间</td>
            <td>${formatTimeRange(banner.start_time, banner.end_time)}</td>
          </tr>
          <tr>
            <td class="text-muted">创建时间</td>
            <td>${formatDate(banner.created_at)}</td>
          </tr>
          <tr>
            <td class="text-muted">更新时间</td>
            <td>${formatDate(banner.updated_at)}</td>
          </tr>
          ${
            banner.creator
              ? `
          <tr>
            <td class="text-muted">创建者</td>
            <td>${banner.creator.nickname || '-'}</td>
          </tr>
          `
              : ''
          }
        </table>
      </div>
    </div>
  `
  document.getElementById('viewModalBody').innerHTML = html
}

/**
 * 编辑弹窗
 * @param {number} id - 弹窗ID
 */
async function editBanner(id) {
  showLoading()

  try {
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.POPUP_BANNER.DETAIL, { id }))

    if (response && response.success) {
      const banner = response.data
      currentBannerId = id

      // 填充表单
      document.getElementById('bannerId').value = banner.banner_id
      document.getElementById('bannerTitle').value = banner.title
      document.getElementById('bannerPosition').value = banner.position
      document.getElementById('bannerOrder').value = banner.display_order
      document.getElementById('bannerActive').checked = banner.is_active
      document.getElementById('bannerLinkType').value = banner.link_type
      document.getElementById('bannerLinkUrl').value = banner.link_url || ''

      // 时间
      if (banner.start_time) {
        document.getElementById('bannerStartTime').value = formatDateTimeLocal(banner.start_time)
      } else {
        document.getElementById('bannerStartTime').value = ''
      }
      if (banner.end_time) {
        document.getElementById('bannerEndTime').value = formatDateTimeLocal(banner.end_time)
      } else {
        document.getElementById('bannerEndTime').value = ''
      }

      // 处理跳转类型显示
      handleLinkTypeChange()

      // 显示现有图片
      const uploadZone = document.getElementById('uploadZone')
      uploadZone.innerHTML = `
        <img src="${banner.image_url}" class="preview-image" alt="当前图片" />
        <p class="small text-muted mt-2 mb-0">当前图片（上传新图片将替换）</p>
        <button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="clearImage(event)">
          <i class="bi bi-arrow-counterclockwise"></i> 重新上传
        </button>
      `
      uploadZone.classList.add('has-image')

      // 更新模态框标题
      document.getElementById('bannerModalTitle').innerHTML =
        '<i class="bi bi-pencil"></i> 编辑弹窗'

      new bootstrap.Modal(document.getElementById('bannerModal')).show()
    } else {
      showError('获取失败', response?.message || '获取弹窗详情失败')
    }
  } catch (error) {
    console.error('编辑弹窗失败:', error)
    showError('获取失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 切换启用状态
 * @param {number} id - 弹窗ID
 */
async function toggleBanner(id) {
  showLoading()

  try {
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.POPUP_BANNER.TOGGLE, { id }), {
      method: 'PATCH'
    })

    if (response && response.success) {
      showSuccess('操作成功', response.message)
      loadStatistics()
      loadBanners()
    } else {
      showError('操作失败', response?.message || '切换状态失败')
    }
  } catch (error) {
    console.error('切换状态失败:', error)
    showError('操作失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 显示删除确认框
 * @param {number} id - 弹窗ID
 * @param {string} title - 弹窗标题
 */
function showDeleteConfirm(id, title) {
  currentBannerId = id
  document.getElementById('deleteTitle').textContent = title
  new bootstrap.Modal(document.getElementById('deleteModal')).show()
}

/**
 * 确认删除
 */
async function confirmDelete() {
  showLoading()

  try {
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.POPUP_BANNER.UPDATE, { id: currentBannerId }), {
      method: 'DELETE'
    })

    if (response && response.success) {
      bootstrap.Modal.getInstance(document.getElementById('deleteModal')).hide()
      showSuccess('删除成功', '弹窗已删除')
      loadStatistics()
      loadBanners()
    } else {
      showError('删除失败', response?.message || '删除弹窗失败')
    }
  } catch (error) {
    console.error('删除弹窗失败:', error)
    showError('删除失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 保存弹窗
 */
async function saveBanner() {
  const form = document.getElementById('bannerForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  const bannerId = document.getElementById('bannerId').value
  const isEdit = !!bannerId

  // 验证图片
  if (!isEdit && !selectedImageFile) {
    showError('请上传图片', '弹窗图片是必填项')
    return
  }

  // 验证跳转链接
  const linkType = document.getElementById('bannerLinkType').value
  const linkUrl = document.getElementById('bannerLinkUrl').value.trim()
  if (linkType !== 'none' && !linkUrl) {
    showError('请填写跳转链接', '选择跳转类型后，跳转链接是必填项')
    return
  }

  showLoading()

  try {
    const formData = new FormData()
    formData.append('title', document.getElementById('bannerTitle').value.trim())
    formData.append('position', document.getElementById('bannerPosition').value)
    formData.append('display_order', document.getElementById('bannerOrder').value)
    formData.append('is_active', document.getElementById('bannerActive').checked)
    formData.append('link_type', linkType)

    if (linkUrl) {
      formData.append('link_url', linkUrl)
    }

    const startTime = document.getElementById('bannerStartTime').value
    const endTime = document.getElementById('bannerEndTime').value
    if (startTime) formData.append('start_time', startTime)
    if (endTime) formData.append('end_time', endTime)

    if (selectedImageFile) {
      formData.append('image', selectedImageFile)
    }

    const url = isEdit
      ? API.buildURL(API_ENDPOINTS.POPUP_BANNER.UPDATE, { id: bannerId })
      : API_ENDPOINTS.POPUP_BANNER.CREATE
    const method = isEdit ? 'PUT' : 'POST'

    const response = await fetch(url, {
      method: method,
      headers: {
        Authorization: `Bearer ${getToken()}`
      },
      body: formData
    })

    const result = await response.json()

    if (result && result.success) {
      bootstrap.Modal.getInstance(document.getElementById('bannerModal')).hide()
      showSuccess(isEdit ? '更新成功' : '创建成功', result.message)
      resetForm()
      loadStatistics()
      loadBanners()
    } else {
      showError(isEdit ? '更新失败' : '创建失败', result?.message || '操作失败')
    }
  } catch (error) {
    console.error('保存弹窗失败:', error)
    showError('操作失败', error.message)
  } finally {
    hideLoading()
  }
}

/**
 * 重置表单
 */
function resetForm() {
  document.getElementById('bannerForm').reset()
  document.getElementById('bannerId').value = ''
  document.getElementById('bannerActive').checked = true
  document.getElementById('bannerLinkType').value = 'none'
  currentBannerId = null
  selectedImageFile = null

  // 重置图片上传区域
  const uploadZone = document.getElementById('uploadZone')
  uploadZone.innerHTML = `
    <i class="bi bi-cloud-arrow-up text-muted" style="font-size: 3rem;"></i>
    <p class="mb-1 text-muted">点击或拖拽上传图片</p>
    <p class="small text-muted mb-0">支持 JPG、PNG、GIF、WebP，最大 5MB</p>
  `
  uploadZone.classList.remove('has-image')
  document.getElementById('imageInput').value = ''

  // 隐藏跳转链接区域
  document.getElementById('linkUrlSection').style.display = 'none'
}

// ==================== 辅助函数 ====================

/**
 * 获取位置文本
 * @param {string} position - 位置代码
 * @returns {string} 位置文本
 */
function getPositionText(position) {
  const texts = {
    home: '首页',
    profile: '个人中心'
  }
  return texts[position] || position
}

/**
 * 获取跳转类型文本
 * @param {string} linkType - 跳转类型代码
 * @returns {string} 跳转类型文本
 */
function getLinkTypeText(linkType) {
  const texts = {
    none: '无跳转',
    page: '小程序页面',
    miniprogram: '其他小程序',
    webview: 'H5网页'
  }
  return texts[linkType] || linkType
}

/**
 * 格式化时间范围
 * @param {string|null} startTime - 开始时间
 * @param {string|null} endTime - 结束时间
 * @returns {string} 格式化后的时间范围
 */
function formatTimeRange(startTime, endTime) {
  if (!startTime && !endTime) return '永久有效'
  if (startTime && !endTime) return `${formatDate(startTime)} 起`
  if (!startTime && endTime) return `至 ${formatDate(endTime)}`
  return `${formatDate(startTime)} ~ ${formatDate(endTime)}`
}

/**
 * 格式化为 datetime-local 输入格式
 * @param {string} dateStr - 日期字符串
 * @returns {string} datetime-local 格式
 */
function formatDateTimeLocal(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * 显示加载状态
 */
function showLoading() {
  document.getElementById('loadingOverlay').classList.add('show')
}

/**
 * 隐藏加载状态
 */
function hideLoading() {
  document.getElementById('loadingOverlay').classList.remove('show')
}

/**
 * 显示成功提示
 * @param {string} title - 标题
 * @param {string} message - 消息
 */
function showSuccess(title, message) {
  if (typeof ToastUtils !== 'undefined') {
    ToastUtils.success(message || title)
  } else {
    alert(`✅ ${title}\n${message}`)
  }
}

/**
 * 显示错误提示
 * @param {string} title - 标题
 * @param {string} message - 消息
 */
function showError(title, message) {
  if (typeof ToastUtils !== 'undefined') {
    ToastUtils.error(message || title)
  } else {
    alert(`❌ ${title}\n${message}`)
  }
}
