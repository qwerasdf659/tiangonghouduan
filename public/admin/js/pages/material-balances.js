/**
 * 用户材料余额查询页面
 * @description 查询和管理用户的材料/资产余额，包括余额调整功能
 * @created 2026-01-09
 * @version 1.0.0
 */

// ============================================================
// 全局变量
// ============================================================
let currentUserId = null
let assetTypes = []
let adjustBalanceModalInstance
let successToastInstance, errorToastInstance

// ============================================================
// 页面初始化
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
  // 权限检查
  if (!checkAdminPermission()) {
    return
  }

  // 显示用户信息
  const user = getCurrentUser()
  if (user) {
    document.getElementById('welcomeText').textContent = `欢迎，${user.nickname || user.mobile}`
  }

  // 初始化模态框
  adjustBalanceModalInstance = new bootstrap.Modal(document.getElementById('adjustBalanceModal'))

  // 初始化Toast
  successToastInstance = new bootstrap.Toast(document.getElementById('successToast'))
  errorToastInstance = new bootstrap.Toast(document.getElementById('errorToast'))

  // 加载资产类型
  loadAssetTypes()

  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // 搜索表单提交
  document.getElementById('searchForm').addEventListener('submit', handleSearch)

  // 提交调整
  document.getElementById('submitAdjustBtn').addEventListener('click', submitAdjustBalance)
})

// ============================================================
// 资产类型管理
// ============================================================

/**
 * 加载资产类型
 * @returns {Promise<void>}
 */
async function loadAssetTypes() {
  try {
    const response = await apiRequest('/api/v4/console/asset-adjustment/asset-types')
    if (response && response.success) {
      // 后端返回格式: { asset_types: [...], total }
      assetTypes = response.data?.asset_types || []
      populateAssetSelect()
    }
  } catch (error) {
    console.error('加载资产类型失败:', error)
  }
}

/**
 * 填充资产选择框
 */
function populateAssetSelect() {
  const select = document.getElementById('adjustAssetCode')
  const options = assetTypes
    .filter(a => a.is_enabled)
    .map(a => `<option value="${a.asset_code}">${a.display_name} (${a.asset_code})</option>`)
    .join('')

  select.innerHTML = '<option value="">请选择</option>' + options
}

// ============================================================
// 搜索功能
// ============================================================

/**
 * 处理搜索
 * @param {Event} e - 表单提交事件
 * @returns {Promise<void>}
 */
async function handleSearch(e) {
  e.preventDefault()

  const userId = document.getElementById('searchUserId').value.trim()
  const mobile = document.getElementById('searchMobile').value.trim()

  if (!userId && !mobile) {
    showErrorToast('请输入用户ID或手机号')
    return
  }

  // 如果提供了手机号，先通过手机号查询用户ID
  let targetUserId = userId
  if (mobile && !userId) {
    try {
      // ✅ 对齐后端：user-management返回用户列表，取第一个匹配用户
      const userResponse = await apiRequest(
        `/api/v4/console/user-management/users?search=${mobile}`
      )
      if (userResponse && userResponse.success && userResponse.data) {
        const users = userResponse.data.users || userResponse.data
        if (users.length > 0) {
          targetUserId = users[0].user_id
        } else {
          showErrorToast('未找到该手机号对应的用户')
          return
        }
      } else {
        showErrorToast('查询用户失败')
        return
      }
    } catch (error) {
      showErrorToast('查询用户失败：' + error.message)
      return
    }
  }

  // 加载用户材料余额
  await loadUserBalances(targetUserId)
}

// ============================================================
// 数据加载
// ============================================================

/**
 * 加载用户材料余额
 * @param {number|string} userId - 用户ID
 * @returns {Promise<void>}
 */
async function loadUserBalances(userId) {
  currentUserId = userId

  const tbody = document.getElementById('balancesTableBody')
  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">加载中...</span>
        </div>
        <p class="mt-2 text-muted">正在加载数据...</p>
      </td>
    </tr>
  `

  try {
    const response = await apiRequest(`/api/v4/console/asset-adjustment/user/${userId}/balances`)

    if (response && response.success) {
      const { user, balances } = response.data

      // 显示用户信息
      document.getElementById('userId').textContent = user.user_id
      document.getElementById('userNickname').textContent = user.nickname || '未设置'
      document.getElementById('userMobile').textContent = maskPhone(user.mobile) || '-'

      // 显示用户信息区域
      document.getElementById('userInfoSection').style.display = 'block'
      document.getElementById('emptyState').style.display = 'none'

      // 渲染余额列表
      renderBalances(balances)
    } else {
      showErrorToast(response?.message || '查询失败')
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-5 text-danger">
            <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
            <p class="mt-2">查询失败：${response?.message || '未知错误'}</p>
          </td>
        </tr>
      `
    }
  } catch (error) {
    console.error('加载用户余额失败:', error)
    showErrorToast(error.message)
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5 text-danger">
          <i class="bi bi-exclamation-triangle" style="font-size: 2rem;"></i>
          <p class="mt-2">加载失败：${error.message}</p>
        </td>
      </tr>
    `
  }
}

// ============================================================
// 渲染函数
// ============================================================

/**
 * 渲染余额列表
 * @param {Array} balances - 余额数据列表
 */
function renderBalances(balances) {
  const tbody = document.getElementById('balancesTableBody')

  if (balances.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-5">
          <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
          <p class="mt-2 text-muted">该用户暂无材料余额</p>
        </td>
      </tr>
    `
    return
  }

  tbody.innerHTML = balances
    .map(
      balance => `
    <tr>
      <td><code>${balance.asset_code}</code></td>
      <td><strong>${balance.display_name}</strong></td>
      <td><span class="badge bg-info">${balance.group_code || '-'}</span></td>
      <td>
        <span class="badge ${balance.form === 'shard' ? 'bg-warning' : 'bg-primary'}">
          ${getFormLabel(balance.form)}
        </span>
      </td>
      <td>
        <h5 class="mb-0 text-success">${balance.balance}</h5>
      </td>
      <td>
        <span class="text-primary">${balance.visible_value_points || 0} 积分</span>
      </td>
      <td>
        <small>${formatDate(balance.updated_at)}</small>
      </td>
    </tr>
  `
    )
    .join('')
}

// ============================================================
// 余额调整功能
// ============================================================

/**
 * 提交调整余额
 * @returns {Promise<void>}
 */
async function submitAdjustBalance() {
  const form = document.getElementById('adjustBalanceForm')
  if (!form.checkValidity()) {
    form.reportValidity()
    return
  }

  if (!currentUserId) {
    showErrorToast('未选择用户')
    return
  }

  const data = {
    user_id: currentUserId,
    asset_code: document.getElementById('adjustAssetCode').value,
    adjust_type: document.getElementById('adjustType').value,
    amount: parseInt(document.getElementById('adjustAmount').value),
    reason: document.getElementById('adjustReason').value.trim(),
    idempotency_key: `material_adjust_${currentUserId}_${Date.now()}`
  }

  try {
    const submitBtn = document.getElementById('submitAdjustBtn')
    submitBtn.disabled = true
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>提交中...'

    const response = await apiRequest(`/api/v4/console/asset-adjustment/adjust`, {
      method: 'POST',
      body: JSON.stringify(data)
    })

    if (response && response.success) {
      showSuccessToast('调整成功')
      adjustBalanceModalInstance.hide()
      form.reset()
      loadUserBalances(currentUserId)
    } else {
      showErrorToast(response?.message || '调整失败')
    }
  } catch (error) {
    console.error('调整余额失败:', error)
    showErrorToast(error.message)
  } finally {
    const submitBtn = document.getElementById('submitAdjustBtn')
    submitBtn.disabled = false
    submitBtn.innerHTML = '<i class="bi bi-check-lg"></i> 确认调整'
  }
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 获取形态标签
 * @param {string} form - 形态类型
 * @returns {string} 中文标签
 */
function getFormLabel(form) {
  const labels = {
    shard: '碎片',
    crystal: '水晶'
  }
  return labels[form] || form
}

/**
 * 手机号脱敏
 * @param {string} phone - 手机号
 * @returns {string} 脱敏后的手机号
 */
function maskPhone(phone) {
  if (!phone || phone.length !== 11) return phone
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

/**
 * 显示成功提示
 * @param {string} message - 提示消息
 */
function showSuccessToast(message) {
  document.getElementById('successToastBody').textContent = message
  successToastInstance.show()
}

/**
 * 显示错误提示
 * @param {string} message - 错误消息
 */
function showErrorToast(message) {
  document.getElementById('errorToastBody').textContent = message
  errorToastInstance.show()
}
