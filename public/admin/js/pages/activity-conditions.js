/**
 * 活动条件配置页面
 * @description 配置抽奖活动的参与条件
 * @author Admin
 * @created 2026-01-09
 */

// ============================================
// 全局变量
// ============================================

let conditionCounter = 0
let currentActivityCode = null
let currentActivityData = null // 保存当前选中活动的完整数据

// 条件类型配置
const CONDITION_TYPES = {
  user_points: {
    label: '用户积分',
    operators: ['>=', '<=', '>', '<', '='],
    valueType: 'number',
    placeholder: '如：100',
    defaultMessage: '您的积分不足，快去消费获取积分吧！'
  },
  user_type: {
    label: '用户类型',
    operators: ['=', 'in'],
    valueType: 'select',
    options: ['normal', 'vip', 'svip', 'admin'],
    placeholder: '选择用户类型',
    defaultMessage: '此活动仅限特定用户类型参与'
  },
  registration_days: {
    label: '注册天数',
    operators: ['>=', '<=', '>', '<'],
    valueType: 'number',
    placeholder: '如：30',
    defaultMessage: '注册满30天后才能参与'
  },
  consecutive_fail_count: {
    label: '连续未中奖次数',
    operators: ['>=', '<=', '='],
    valueType: 'number',
    placeholder: '如：10',
    defaultMessage: '连续未中奖次数不足，继续努力吧！'
  }
}

// ============================================
// 页面初始化
// ============================================

document.addEventListener('DOMContentLoaded', function () {
  // 权限检查
  if (!checkAdminPermission()) return

  // 显示用户信息
  const user = getCurrentUser()
  if (user) {
    document.getElementById('welcomeText').textContent = `欢迎，${user.nickname || user.mobile}`
  }

  // 退出登录
  document.getElementById('logoutBtn').addEventListener('click', logout)

  // 活动选择变更事件（解决CSP内联事件限制）
  document.getElementById('activitySelect').addEventListener('change', loadActivityConditions)

  // 添加条件按钮事件
  document.getElementById('addConditionBtn').addEventListener('click', function () {
    addCondition()
  })

  // 保存配置按钮事件
  document.getElementById('saveConditionsBtn').addEventListener('click', saveConditions)

  // 清空条件按钮事件
  document.getElementById('clearAllConditionsBtn').addEventListener('click', clearAllConditions)

  // 加载活动列表
  loadActivities()
})

// ============================================
// 活动列表加载
// ============================================

/**
 * 缓存活动列表数据（用于后续查找）
 */
let activitiesCache = []

/**
 * 加载活动列表
 * 调用后端API: GET /api/v4/lottery/campaigns
 * 注意: 此API默认只返回status='active'的活动，管理后台需要查看所有状态
 */
async function loadActivities() {
  try {
    // 获取所有状态的活动（不传status参数让后端返回所有）
    const response = await apiRequest(`${API_ENDPOINTS.LOTTERY_CAMPAIGNS.LIST}?status=`)
    if (response && response.success && response.data) {
      // 缓存活动数据
      activitiesCache = response.data

      const select = document.getElementById('activitySelect')
      select.innerHTML = '<option value="">-- 请选择活动 --</option>'

      response.data.forEach(activity => {
        const option = document.createElement('option')
        option.value = activity.campaign_code
        option.dataset.campaignId = activity.campaign_id
        // 保存完整的活动数据到option
        option.dataset.activityData = JSON.stringify(activity)

        const statusText =
          activity.status === 'active'
            ? '进行中'
            : activity.status === 'draft'
              ? '草稿'
              : activity.status === 'paused'
                ? '已暂停'
                : '已结束'
        option.textContent = `${activity.campaign_name} (${statusText})`
        select.appendChild(option)
      })
    }
  } catch (error) {
    console.error('加载活动列表失败:', error)
    alert('加载活动列表失败，请刷新页面重试')
  }
}

/**
 * 加载活动条件
 * 修正：使用正确的后端API
 * - 活动基本信息：从缓存中获取（已在loadActivities时加载）
 * - 活动条件配置：调用 GET /api/v4/activities/:code/conditions
 */
async function loadActivityConditions() {
  const select = document.getElementById('activitySelect')
  const campaignCode = select.value
  if (!campaignCode) {
    clearConditionsUI()
    currentActivityData = null
    return
  }

  currentActivityCode = campaignCode

  try {
    // 从缓存中获取活动基本信息
    const selectedOption = select.options[select.selectedIndex]
    let activityBasicInfo = null

    if (selectedOption.dataset.activityData) {
      activityBasicInfo = JSON.parse(selectedOption.dataset.activityData)
    } else {
      // 如果没有缓存，从activitiesCache中查找
      activityBasicInfo = activitiesCache.find(a => a.campaign_code === campaignCode)
    }

    // 显示活动状态
    if (activityBasicInfo) {
      const statusMap = { active: '进行中', draft: '草稿', paused: '已暂停', completed: '已结束' }
      document.getElementById('activityStatus').value =
        statusMap[activityBasicInfo.status] || activityBasicInfo.status
    }

    // 调用正确的API获取活动条件配置
    // 后端API: GET /api/v4/activities/:idOrCode/conditions
    const response = await apiRequest(API.buildURL(API_ENDPOINTS.LOTTERY_CAMPAIGNS.CONDITIONS, { code: campaignCode }))

    if (response && response.success && response.data) {
      const conditionData = response.data
      currentActivityData = conditionData

      clearConditionsUI()

      const conditions = conditionData.participation_conditions || {}
      const messages = conditionData.condition_error_messages || {}

      if (Object.keys(conditions).length > 0) {
        Object.entries(conditions).forEach(([type, rule]) => {
          addCondition(type, rule.operator, rule.value, messages[type])
        })
      }
      updatePreview()
    } else {
      // API返回成功但没有数据，说明没有配置条件
      clearConditionsUI()
      updatePreview()
    }
  } catch (error) {
    console.error('加载活动条件失败:', error)
    // 如果是404错误，可能是活动没有配置条件，不需要报错
    if (error.message && error.message.includes('404')) {
      clearConditionsUI()
      updatePreview()
    } else {
      alert('加载活动条件失败: ' + error.message)
    }
  }
}

// ============================================
// 条件管理
// ============================================

/**
 * 添加条件
 * 注意：使用addEventListener绑定事件，避免CSP内联脚本限制
 */
function addCondition(presetType = '', presetOperator = '', presetValue = '', presetMessage = '') {
  conditionCounter++
  const id = conditionCounter
  const container = document.getElementById('conditionsContainer')
  const conditionRow = document.createElement('div')
  conditionRow.className = 'condition-row'
  conditionRow.id = `condition-${id}`

  const defaultType = presetType || 'user_points'
  const defaultOperator = presetOperator || '>='

  // 不使用内联事件处理器，改为使用data属性存储id
  conditionRow.innerHTML = `
    <div class="row g-2">
      <div class="col-md-3">
        <label class="form-label small">条件类型</label>
        <select class="form-control form-control-sm condition-type-select" id="type-${id}" data-condition-id="${id}">
          ${Object.entries(CONDITION_TYPES)
            .map(
              ([key, config]) => `
            <option value="${key}" ${key === defaultType ? 'selected' : ''}>${config.label}</option>
          `
            )
            .join('')}
        </select>
      </div>
      <div class="col-md-2">
        <label class="form-label small">运算符</label>
        <select class="form-control form-control-sm condition-operator-select" id="operator-${id}" data-condition-id="${id}"></select>
      </div>
      <div class="col-md-2">
        <label class="form-label small">条件值</label>
        <div id="value-container-${id}"></div>
      </div>
      <div class="col-md-4">
        <label class="form-label small">不满足时的提示语</label>
        <input type="text" class="form-control form-control-sm condition-message-input" id="message-${id}"
               placeholder="如：您的积分不足100分"
               value="${presetMessage || CONDITION_TYPES[defaultType].defaultMessage}"
               data-condition-id="${id}">
      </div>
      <div class="col-md-1 d-flex align-items-end">
        <button class="btn btn-sm btn-outline-danger w-100 condition-remove-btn" data-condition-id="${id}">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    </div>
  `

  container.appendChild(conditionRow)

  // 绑定事件监听器（避免CSP限制）
  const typeSelect = document.getElementById(`type-${id}`)
  const operatorSelect = document.getElementById(`operator-${id}`)
  const messageInput = document.getElementById(`message-${id}`)
  const removeBtn = conditionRow.querySelector('.condition-remove-btn')

  typeSelect.addEventListener('change', function () {
    updateConditionUI(id)
  })

  operatorSelect.addEventListener('change', function () {
    updatePreview()
  })

  messageInput.addEventListener('change', function () {
    updatePreview()
  })

  removeBtn.addEventListener('click', function () {
    removeCondition(id)
  })

  updateConditionUI(id, presetOperator, presetValue)
  updatePreview()
}

/**
 * 更新条件UI
 * 注意：使用addEventListener绑定事件，避免CSP内联脚本限制
 */
function updateConditionUI(id, presetOperator = '', presetValue = '') {
  const typeSelect = document.getElementById(`type-${id}`)
  const type = typeSelect.value
  const config = CONDITION_TYPES[type]

  const operatorSelect = document.getElementById(`operator-${id}`)
  operatorSelect.innerHTML = config.operators
    .map(
      op => `
    <option value="${op}" ${op === presetOperator ? 'selected' : ''}>${op}</option>
  `
    )
    .join('')

  const valueContainer = document.getElementById(`value-container-${id}`)
  if (config.valueType === 'number') {
    valueContainer.innerHTML = `
      <input type="number" class="form-control form-control-sm condition-value-input" id="value-${id}"
             placeholder="${config.placeholder}"
             value="${presetValue || ''}"
             data-condition-id="${id}">
    `
  } else if (config.valueType === 'select') {
    const isMultiple = operatorSelect.value === 'in'
    if (isMultiple) {
      valueContainer.innerHTML = `
        <select class="form-control form-control-sm condition-value-input" id="value-${id}" multiple data-condition-id="${id}">
          ${config.options
            .map(
              opt => `
            <option value="${opt}" ${Array.isArray(presetValue) && presetValue.includes(opt) ? 'selected' : ''}>${opt}</option>
          `
            )
            .join('')}
        </select>
      `
    } else {
      valueContainer.innerHTML = `
        <select class="form-control form-control-sm condition-value-input" id="value-${id}" data-condition-id="${id}">
          ${config.options
            .map(
              opt => `
            <option value="${opt}" ${opt === presetValue ? 'selected' : ''}>${opt}</option>
          `
            )
            .join('')}
        </select>
      `
    }
  }

  // 绑定值输入框的change事件（避免CSP限制）
  const valueInput = document.getElementById(`value-${id}`)
  if (valueInput) {
    valueInput.addEventListener('change', function () {
      updatePreview()
    })
  }

  const messageInput = document.getElementById(`message-${id}`)
  if (
    !messageInput.value ||
    messageInput.value === CONDITION_TYPES[typeSelect.dataset.prevType]?.defaultMessage
  ) {
    messageInput.value = config.defaultMessage
  }
  typeSelect.dataset.prevType = type
  updatePreview()
}

/**
 * 删除条件
 */
function removeCondition(id) {
  const row = document.getElementById(`condition-${id}`)
  if (row) {
    row.remove()
    updatePreview()
  }
}

/**
 * 清空所有条件
 */
function clearAllConditions() {
  if (confirm('确定要清空所有条件吗？')) {
    clearConditionsUI()
    updatePreview()
  }
}

/**
 * 清空条件UI
 */
function clearConditionsUI() {
  document.getElementById('conditionsContainer').innerHTML = ''
  conditionCounter = 0
  document.getElementById('conditionPreview').innerHTML = '暂无条件配置'
}

// ============================================
// 预览和提交
// ============================================

/**
 * 更新预览
 */
function updatePreview() {
  const conditions = collectConditions()
  const previewDiv = document.getElementById('conditionPreview')

  if (
    conditions.participation_conditions &&
    Object.keys(conditions.participation_conditions).length > 0
  ) {
    let html = '<div class="alert alert-info mb-0">'
    html += '<strong>参与此活动需要满足以下所有条件：</strong><ul class="mb-0 mt-2">'

    Object.entries(conditions.participation_conditions).forEach(([type, rule]) => {
      const config = CONDITION_TYPES[type]
      let valueDisplay = rule.value
      if (Array.isArray(rule.value)) {
        valueDisplay = rule.value.join('、')
      }
      html += `<li><strong>${config.label}</strong> <span class="badge bg-secondary">${rule.operator}</span> ${valueDisplay}</li>`
    })

    html += '</ul></div>'
    previewDiv.innerHTML = html
  } else {
    previewDiv.innerHTML = '<div class="text-muted">暂无条件配置（所有用户均可参与）</div>'
  }
}

/**
 * 收集条件数据
 */
function collectConditions() {
  const participation_conditions = {}
  const condition_error_messages = {}

  document.querySelectorAll('.condition-row').forEach(row => {
    const id = row.id.replace('condition-', '')
    const type = document.getElementById(`type-${id}`).value
    const operator = document.getElementById(`operator-${id}`).value
    const valueElement = document.getElementById(`value-${id}`)
    const message = document.getElementById(`message-${id}`).value

    let value
    if (valueElement.tagName === 'SELECT' && valueElement.multiple) {
      value = Array.from(valueElement.selectedOptions).map(opt => opt.value)
    } else {
      value = valueElement.value
      if (!isNaN(value) && value !== '') {
        value = Number(value)
      }
    }

    participation_conditions[type] = { operator, value }
    condition_error_messages[type] = message
  })

  return { participation_conditions, condition_error_messages }
}

/**
 * 保存条件配置
 */
async function saveConditions() {
  if (!currentActivityCode) {
    alert('请先选择活动')
    return
  }

  const conditions = collectConditions()

  if (Object.keys(conditions.participation_conditions).length === 0) {
    if (!confirm('未配置任何条件，这意味着所有用户都可以参与此活动。确定要保存吗？')) {
      return
    }
  }

  try {
    const response = await apiRequest(
      API.buildURL(API_ENDPOINTS.LOTTERY_CAMPAIGNS.CONFIGURE_CONDITIONS, { code: currentActivityCode }),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conditions)
      }
    )

    if (response && response.success) {
      alert('✅ 条件配置保存成功！')
    } else {
      alert('保存失败: ' + (response?.message || '未知错误'))
    }
  } catch (error) {
    console.error('保存条件失败:', error)
    if (error.message.includes('403') || error.message.includes('权限')) {
      alert('保存失败: 您没有管理员权限，请联系系统管理员')
    } else if (error.message.includes('404')) {
      alert('保存失败: 活动不存在，请刷新页面重试')
    } else {
      alert('保存失败: ' + error.message)
    }
  }
}
