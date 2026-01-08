/**
 * 图片资源管理页面 - JavaScript逻辑
 * 从image-resources.html提取，遵循前端工程化最佳实践
 */

// ========== 全局变量 ==========
let currentPage = 1
const pageSize = 24
let selectedFiles = []
let currentImageId = null

// ========== 页面初始化 ==========

document.addEventListener('DOMContentLoaded', function () {
  const userInfo = getCurrentUser()
  if (userInfo && userInfo.nickname) {
    document.getElementById('welcomeText').textContent = `欢迎，${userInfo.nickname}`
  }

  document.getElementById('logoutBtn').addEventListener('click', logout)
  document.getElementById('refreshBtn').addEventListener('click', loadImageData)
  document.getElementById('imageTypeFilter').addEventListener('change', loadImageData)
  document.getElementById('statusFilter').addEventListener('change', loadImageData)

  setupUploadZone()
  document.getElementById('submitUploadBtn').addEventListener('click', uploadImages)
  document.getElementById('deleteImageBtn').addEventListener('click', deleteCurrentImage)

  if (!getToken() || !checkAdminPermission()) {
    return
  }

  loadImageData()
})

function setupUploadZone() {
  const zone = document.getElementById('uploadZone')
  const fileInput = document.getElementById('fileInput')

  zone.addEventListener('click', () => fileInput.click())

  zone.addEventListener('dragover', e => {
    e.preventDefault()
    zone.classList.add('dragover')
  })

  zone.addEventListener('dragleave', () => {
    zone.classList.remove('dragover')
  })

  zone.addEventListener('drop', e => {
    e.preventDefault()
    zone.classList.remove('dragover')
    handleFiles(e.dataTransfer.files)
  })

  fileInput.addEventListener('change', e => {
    handleFiles(e.target.files)
  })
}

function handleFiles(files) {
  selectedFiles = Array.from(files).filter(file => {
    if (!file.type.startsWith('image/')) {
      showErrorToast(`${file.name} 不是图片文件`)
      return false
    }
    if (file.size > 5 * 1024 * 1024) {
      showErrorToast(`${file.name} 超过5MB限制`)
      return false
    }
    return true
  })

  if (selectedFiles.length > 0) {
    renderUploadPreview()
    document.getElementById('submitUploadBtn').disabled = false
  }
}

function renderUploadPreview() {
  const container = document.getElementById('uploadPreviewContainer')
  const list = document.getElementById('uploadPreviewList')

  list.innerHTML = selectedFiles
    .map((file, index) => {
      const url = URL.createObjectURL(file)
      return `
      <div class="col-md-3">
        <div class="card">
          <img src="${url}" class="card-img-top" style="height: 100px; object-fit: cover;">
          <div class="card-body p-2">
            <small class="text-truncate d-block">${file.name}</small>
            <small class="text-muted">${formatFileSize(file.size)}</small>
          </div>
        </div>
      </div>
    `
    })
    .join('')

  container.style.display = 'block'
}

async function uploadImages() {
  if (selectedFiles.length === 0) return

  const submitBtn = document.getElementById('submitUploadBtn')
  submitBtn.disabled = true
  submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>上传中...'

  try {
    const imageType = document.getElementById('uploadImageType').value
    let successCount = 0

    for (const file of selectedFiles) {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', imageType)

      const response = await fetch('/api/v4/console/system/images/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData
      })

      const result = await response.json()
      if (result.success) successCount++
    }

    showSuccessToast(`成功上传 ${successCount}/${selectedFiles.length} 张图片`)
    bootstrap.Modal.getInstance(document.getElementById('uploadModal')).hide()
    selectedFiles = []
    document.getElementById('uploadPreviewContainer').style.display = 'none'
    document.getElementById('uploadPreviewList').innerHTML = ''
    loadImageData()
  } catch (error) {
    console.error('上传失败:', error)
    showErrorToast('上传失败：' + error.message)
  } finally {
    submitBtn.disabled = false
    submitBtn.innerHTML = '开始上传'
  }
}

async function loadImageData() {
  showLoading(true)
  const container = document.getElementById('imagesContainer')

  try {
    const imageType = document.getElementById('imageTypeFilter').value
    const status = document.getElementById('statusFilter').value

    const params = new URLSearchParams({ page: currentPage, page_size: pageSize })
    if (imageType) params.append('type', imageType)
    if (status) params.append('status', status)

    const response = await apiRequest(`/api/v4/console/system/images?${params.toString()}`)

    if (response && response.success) {
      const { images, statistics, pagination } = response.data

      document.getElementById('totalImages').textContent = statistics?.total || 0
      document.getElementById('totalSize').textContent = formatFileSize(statistics?.total_size || 0)
      document.getElementById('weeklyUploads').textContent = statistics?.weekly_uploads || 0
      document.getElementById('orphanImages').textContent = statistics?.orphan_count || 0

      renderImages(images || [])
      if (pagination) renderPagination(pagination)
    } else {
      container.innerHTML = `
        <div class="col-12 text-center py-5 text-muted">
          <i class="bi bi-inbox" style="font-size: 3rem;"></i>
          <p class="mt-2">暂无图片</p>
        </div>
      `
    }
  } catch (error) {
    console.error('加载图片失败:', error)
    container.innerHTML = `
      <div class="col-12 text-center py-5 text-danger">
        <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
        <p class="mt-2">加载失败：${error.message}</p>
      </div>
    `
  } finally {
    showLoading(false)
  }
}

function renderImages(images) {
  const container = document.getElementById('imagesContainer')

  if (!images || images.length === 0) {
    container.innerHTML = `
      <div class="col-12 text-center py-5 text-muted">
        <i class="bi bi-inbox" style="font-size: 3rem;"></i>
        <p class="mt-2">暂无图片</p>
      </div>
    `
    return
  }

  container.innerHTML = images
    .map(image => {
      const statusBadge =
        image.status === 'orphan'
          ? '<span class="badge bg-danger position-absolute top-0 end-0 m-1">孤儿</span>'
          : ''

      return `
      <div class="col-md-2 col-sm-4 col-6">
        <div class="card image-card" onclick="showImageDetail(${image.image_id})">
          <div class="position-relative">
            ${
              image.url
                ? `<img src="${image.url}" class="image-preview" alt="${image.file_name}" onerror="this.parentNode.innerHTML='<div class=\\'image-placeholder\\'><i class=\\'bi bi-image text-muted\\' style=\\'font-size: 2rem;\\'></i></div>'">`
                : '<div class="image-placeholder"><i class="bi bi-image text-muted" style="font-size: 2rem;"></i></div>'
            }
            ${statusBadge}
          </div>
          <div class="card-body p-2">
            <small class="text-truncate d-block">${image.file_name || '-'}</small>
            <small class="text-muted">${formatFileSize(image.file_size)}</small>
          </div>
        </div>
      </div>
    `
    })
    .join('')
}

async function showImageDetail(imageId) {
  currentImageId = imageId

  try {
    const response = await apiRequest(`/api/v4/console/system/images/${imageId}`)

    if (response && response.success) {
      const image = response.data.image || response.data

      document.getElementById('detailImagePreview').src = image.url || ''
      document.getElementById('detailFileName').textContent = image.file_name || '-'
      document.getElementById('detailFileType').textContent = image.mime_type || '-'
      document.getElementById('detailFileSize').textContent = formatFileSize(image.file_size)
      document.getElementById('detailUploadTime').textContent = formatDate(image.created_at)
      document.getElementById('detailUsageStatus').textContent =
        image.status === 'orphan' ? '孤儿图片' : '使用中'
      document.getElementById('detailRelatedEntity').textContent = image.related_entity || '-'
      document.getElementById('detailImageUrl').value = image.url || ''

      new bootstrap.Modal(document.getElementById('imageDetailModal')).show()
    }
  } catch (error) {
    console.error('获取图片详情失败:', error)
    showErrorToast('获取详情失败')
  }
}

function copyImageUrl() {
  const input = document.getElementById('detailImageUrl')
  input.select()
  document.execCommand('copy')
  showSuccessToast('URL已复制')
}

async function deleteCurrentImage() {
  if (!currentImageId) return

  if (!confirm('确定要删除这张图片吗？此操作不可恢复。')) {
    return
  }

  try {
    const response = await apiRequest(`/api/v4/console/system/images/${currentImageId}`, {
      method: 'DELETE'
    })

    if (response && response.success) {
      showSuccessToast('删除成功')
      bootstrap.Modal.getInstance(document.getElementById('imageDetailModal')).hide()
      loadImageData()
    } else {
      showErrorToast(response?.message || '删除失败')
    }
  } catch (error) {
    console.error('删除失败:', error)
    showErrorToast('删除失败：' + error.message)
  }
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function renderPagination(pagination) {
  const nav = document.getElementById('paginationNav')
  if (!pagination || pagination.total_pages <= 1) {
    nav.innerHTML = ''
    return
  }

  let html = '<ul class="pagination pagination-sm justify-content-center mb-0">'

  html += `
    <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="goToPage(${currentPage - 1}); return false;">上一页</a>
    </li>
  `

  for (let i = 1; i <= Math.min(pagination.total_pages, 10); i++) {
    html += `
      <li class="page-item ${i === currentPage ? 'active' : ''}">
        <a class="page-link" href="#" onclick="goToPage(${i}); return false;">${i}</a>
      </li>
    `
  }

  html += `
    <li class="page-item ${currentPage === pagination.total_pages ? 'disabled' : ''}">
      <a class="page-link" href="#" onclick="goToPage(${currentPage + 1}); return false;">下一页</a>
    </li>
  `

  html += '</ul>'
  nav.innerHTML = html
}

function goToPage(page) {
  currentPage = page
  loadImageData()
}

function showLoading(show) {
  document.getElementById('loadingOverlay').classList.toggle('show', show)
}

function showSuccessToast(message) {
  if (typeof ToastUtils !== 'undefined') {
    ToastUtils.success(message)
  } else {
    alert(`✅ ${message}`)
  }
}

function showErrorToast(message) {
  if (typeof ToastUtils !== 'undefined') {
    ToastUtils.error(message)
  } else {
    alert(`❌ ${message}`)
  }
}
