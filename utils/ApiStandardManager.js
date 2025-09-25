/**
 * API标准管理模块 - 解决业务契约不一致问题
 * 创建时间：2025年09月18日
 * 用途：统一API响应格式、解决主体功能文档与实际实现的契约不匹配
 */

const BeijingTimeHelper = require('./timeHelper')

class ApiStandardManager {
  constructor () {
    // API响应格式标准
    this.responseStandards = {
      success: {
        structure: ['success', 'code', 'message', 'data', 'timestamp'],
        required: ['success', 'message'],
        types: {
          success: 'boolean',
          code: 'string',
          message: 'string',
          timestamp: 'string'
        }
      },
      error: {
        structure: ['success', 'error', 'message', 'details', 'timestamp'],
        required: ['success', 'error', 'message'],
        types: {
          success: 'boolean',
          error: 'string',
          message: 'string',
          timestamp: 'string'
        }
      }
    }

    // 注意：积分管理已通过V4统一引擎实现：
    // GET  /api/v4/unified-engine/lottery/points/:userId - 查询积分
    // POST /api/v4/unified-engine/admin/points/adjust - 调整积分
    // 🔥 新增：缺失的业务功能API（需要实现）
    this.missingBusinessAPIs = [
      {
        path: '/api/users/:userId',
        method: 'GET',
        description: '获取用户信息',
        priority: 'MEDIUM',
        businessReason: '前端需要显示用户基本信息'
      }
    ]

    // 业务状态字段标准化配置
    this.businessStatusStandards = {
      lottery_result: {
        field: 'is_winner',
        type: 'boolean',
        description: '是否中奖（业务结果标准）',
        usage: ['LotteryRecord'], // 🗑️ DecisionRecord已删除 - 2025年01月21日
        scenarios: ['抽奖结果判断', '奖品发放条件']
      },
      process_execution: {
        field: 'status',
        type: 'enum',
        values: ['pending', 'completed', 'failed', 'cancelled'],
        description: '流程执行状态（过程标准）',
        usage: ['PointsTransaction', 'ExchangeRecords'],
        scenarios: ['积分交易状态', '兑换流程状态']
      },
      inventory_status: {
        field: 'status',
        type: 'enum',
        values: ['available', 'pending', 'used', 'expired', 'transferred'],
        description: '库存物品状态枚举',
        usage: ['UserInventory'],
        scenarios: ['物品可用性判断', '使用状态追踪']
      },
      prize_queue_status: {
        field: 'status',
        type: 'enum',
        values: ['pending', 'distributed', 'expired', 'cancelled'],
        description: '奖品队列状态（注意：distributed而非completed）',
        usage: ['UserSpecificPrizeQueue'],
        scenarios: ['管理员预设奖品发放', '队列式奖品管理']
      }
    }

    // 业务错误码标准化
    this.businessErrorCodes = {
      // 用户相关错误 (1xxx)
      USER_NOT_FOUND: 1001,
      USER_DISABLED: 1002,
      INSUFFICIENT_POINTS: 1003,

      // 抽奖相关错误 (2xxx)
      LOTTERY_NOT_AVAILABLE: 2001,
      INVALID_STRATEGY: 2002,
      DRAW_LIMIT_EXCEEDED: 2003,
      CAMPAIGN_NOT_FOUND: 2004,
      PRIZE_NOT_AVAILABLE: 2005,

      // 系统错误 (3xxx)
      DATABASE_ERROR: 3001,
      CACHE_ERROR: 3002,
      EXTERNAL_SERVICE_ERROR: 3003,

      // 权限错误 (4xxx)
      UNAUTHORIZED: 4001,
      FORBIDDEN: 4002,
      TOKEN_EXPIRED: 4003,

      // 验证错误 (5xxx)
      VALIDATION_ERROR: 5001,
      INVALID_PARAMS: 5002,
      REQUIRED_FIELD_MISSING: 5003,

      // 业务状态相关错误 (6xxx)
      BUSINESS_STATUS_INVALID: 6001,
      FIELD_NAMING_VIOLATION: 6002,
      STATUS_TRANSITION_INVALID: 6003,

      // 业务契约相关错误 (7xxx)
      API_CONTRACT_MISMATCH: 7001,
      REQUIRED_API_MISSING: 7002,
      PATH_MAPPING_REQUIRED: 7003
    }
  }

  /**
   * 🔥 新增：检查缺失的业务API
   * @returns {Array} 缺失的API列表
   */
  checkMissingBusinessAPIs () {
    console.log('🔍 检查缺失的业务API...')

    const missingAPIs = this.missingBusinessAPIs.filter(api => {
      // 检查优先级为HIGH的API
      return api.priority === 'HIGH'
    })

    if (missingAPIs.length > 0) {
      console.log('❌ 发现缺失的关键业务API:')
      missingAPIs.forEach(api => {
        console.log(`   ${api.method} ${api.path}: ${api.description}`)
        console.log(`      业务原因: ${api.businessReason}`)
      })
    } else {
      console.log('✅ 所有关键业务API已实现')
    }

    return missingAPIs
  }

  /**
   * 🔥 新增：验证业务状态字段标准化
   * @param {object} data - 待验证的数据对象
   * @param {string} context - 业务上下文
   * @returns {object} 验证结果
   */
  validateBusinessStatus (data, context) {
    const standard = this.businessStatusStandards[context]
    if (!standard) {
      return {
        valid: false,
        error: 'UNKNOWN_BUSINESS_CONTEXT',
        message: `未知的业务上下文: ${context}`
      }
    }

    const fieldName = standard.field
    const fieldValue = data[fieldName]

    // 检查字段是否存在
    if (fieldValue === undefined) {
      return {
        valid: false,
        error: 'REQUIRED_FIELD_MISSING',
        message: `缺少必需的业务状态字段: ${fieldName}`,
        expected: standard
      }
    }

    // 验证字段类型
    if (standard.type === 'boolean' && typeof fieldValue !== 'boolean') {
      return {
        valid: false,
        error: 'INVALID_FIELD_TYPE',
        message: `字段 ${fieldName} 类型错误，期望boolean，实际${typeof fieldValue}`,
        expected: standard
      }
    }

    // 验证枚举值
    if (standard.type === 'enum' && !standard.values.includes(fieldValue)) {
      return {
        valid: false,
        error: 'INVALID_ENUM_VALUE',
        message: `字段 ${fieldName} 值无效，期望${standard.values.join('|')}，实际${fieldValue}`,
        expected: standard
      }
    }

    return {
      valid: true,
      message: `业务状态字段 ${fieldName} 验证通过`,
      standard
    }
  }

  /**
   * 标准化API响应格式
   * @param {object} rawResponse - 原始响应数据
   * @param {object} options - 配置选项
   * @returns {object} 标准化后的响应
   */
  standardizeResponse (rawResponse, options = {}) {
    const { type = 'success', message = '操作成功' } = options

    const standardResponse = {
      success: type === 'success',
      code: type === 'success' ? 'SUCCESS' : 'ERROR',
      message,
      data: rawResponse,
      timestamp: BeijingTimeHelper.apiTimestamp()
    }

    return standardResponse
  }

  /**
   * 验证API响应格式是否符合标准
   * @param {object} response - 待验证的响应
   * @param {string} type - 响应类型 (success, error)
   * @returns {object} 验证结果
   */
  validateResponseFormat (response, type = 'success') {
    const standard = this.responseStandards[type]
    if (!standard) {
      return {
        valid: false,
        error: `未知的响应类型: ${type}`
      }
    }

    const missing = standard.required.filter(field => !(field in response))
    const typeErrors = []

    Object.entries(standard.types).forEach(([field, expectedType]) => {
      const validTypes = ['string', 'number', 'boolean', 'object', 'undefined', 'symbol', 'function']
      const typeToCheck = validTypes.includes(expectedType) ? expectedType : 'object'

      let isValidType = false
      const actualType = typeof response[field]

      switch (typeToCheck) {
      case 'string':
        isValidType = actualType === 'string'
        break
      case 'number':
        isValidType = actualType === 'number'
        break
      case 'boolean':
        isValidType = actualType === 'boolean'
        break
      case 'object':
        isValidType = actualType === 'object'
        break
      case 'undefined':
        isValidType = actualType === 'undefined'
        break
      case 'symbol':
        isValidType = actualType === 'symbol'
        break
      case 'function':
        isValidType = actualType === 'function'
        break
      default:
        isValidType = actualType === 'object'
      }

      if (field in response && !isValidType) {
        typeErrors.push(`${field}: 期望${expectedType}，实际${actualType}`)
      }
    })

    return {
      valid: missing.length === 0 && typeErrors.length === 0,
      missing,
      typeErrors,
      message:
        missing.length === 0 && typeErrors.length === 0
          ? 'API响应格式验证通过'
          : '响应格式不符合标准'
    }
  }

  /**
   * 🔧 创建API标准化中间件
   * 业务需求：统一所有API响应格式
   */
  createStandardizationMiddleware () {
    return (req, res, next) => {
      // 为了避免复杂性，这里只是一个占位符
      // 实际的API标准化通过ApiResponse.middleware()实现
      next()
    }
  }
}

module.exports = ApiStandardManager
