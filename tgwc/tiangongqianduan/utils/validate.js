// utils/validate.js - 数据验证工具类v2.0（基于产品功能结构描述文档v2.0）

/**
 * 🔴 数据验证工具类v2.0 - 餐厅积分抽奖系统
 * 📊 完全符合产品功能结构描述文档v2.0
 * 🏗️ 支持多业务线分层存储架构
 * 🔐 包含开发阶段123456万能验证码验证
 */

const { getDevelopmentConfig } = require('../config/env.js')

/**
 * 手机号验证（中国大陆11位手机号）
 *
 * @description
 * 验证中国大陆手机号格式是否正确。
 *
 * **业务场景**：
 * - 用户登录验证（核心功能，每日必用）
 * - 手机号绑定验证
 * - 找回密码验证
 *
 * **验证规则**：
 * - 必须是11位数字
 * - 第一位必须是1
 * - 第二位必须是3-9之间的数字
 * - 自动去除空格和横线
 *
 * @param {string} phone - 待验证的手机号（支持含空格或横线的格式）
 *
 * @returns {Object} 验证结果对象
 * @returns {Boolean} returns.isValid - 是否验证通过
 * @returns {String} returns.message - 验证结果消息
 * @returns {String} [returns.cleanPhone] - 清理后的手机号（仅验证通过时返回）
 *
 * @example
 * // ✅ 正确格式
 * const result = validatePhoneNumber('13812345678')
 * // => { isValid: true, cleanPhone: '13812345678', message: '手机号格式正确' }
 *
 * @example
 * // ✅ 支持空格和横线
 * const result = validatePhoneNumber('138 1234 5678')
 * // => { isValid: true, cleanPhone: '13812345678', message: '手机号格式正确' }
 *
 * @example
 * // ❌ 错误格式 - 长度不足
 * const result = validatePhoneNumber('138123456')
 * // => { isValid: false, message: '请输入正确的手机号格式' }
 *
 * @example
 * // ❌ 空值
 * const result = validatePhoneNumber('')
 * // => { isValid: false, message: '请输入手机号' }
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const validatePhoneNumber = phone => {
  if (!phone || typeof phone !== 'string') {
    return {
      isValid: false,
      message: '请输入手机号'
    }
  }

  // 去除空格和特殊字符
  const cleanPhone = phone.replace(/\s+/g, '').replace(/[-]/g, '')

  // 中国大陆手机号格式验证
  const phoneRegex = /^1[3-9]\d{9}$/

  if (!phoneRegex.test(cleanPhone)) {
    return {
      isValid: false,
      message: '请输入正确的手机号格式'
    }
  }

  return {
    isValid: true,
    cleanPhone,
    message: '手机号格式正确'
  }
}

/**
 * 验证码验证（支持开发环境万能验证码123456）
 *
 * @description
 * 验证6位数字验证码格式。
 *
 * **🔴 特殊说明 - 开发环境万能验证码**：
 * - 开发/测试环境支持万能验证码：`123456`
 * - 无论是普通用户还是管理员都可以使用123456登录
 * - 万能验证码仅用于开发和测试，降低短信成本
 * - 生产环境必须使用真实短信验证码
 * - 通过config/env.js的enableUnifiedAuth配置控制
 *
 * **业务场景**：
 * - 用户手机号登录验证（核心功能，每日必用）
 * - 找回密码验证
 * - 敏感操作二次验证
 *
 * **验证规则**：
 * - 正常验证码：必须是6位数字
 * - 开发环境：123456万能验证码直接通过
 * - 自动去除空格
 *
 * @param {string} code - 验证码（6位数字或万能验证码123456）
 *
 * @returns {object} 验证结果对象
 * @returns {boolean} returns.isValid - 是否验证通过
 * @returns {string} returns.message - 验证结果消息
 * @returns {string} returns.cleanCode - 清理后的验证码
 * @returns {Boolean} [returns.isDevelopmentCode] - 是否为万能验证码（仅开发环境返回）
 *
 * @example
 * // ✅ 开发环境 - 万能验证码
 * const result = validateVerificationCode('123456')
 * // => {
 * //   isValid: true,
 * //   cleanCode: '123456',
 * //   message: '开发阶段万能验证码验证通过',
 * //   isDevelopmentCode: true
 * // }
 *
 * @example
 * // ✅ 正常验证码
 * const result = validateVerificationCode('654321')
 * // => {
 * //   isValid: true,
 * //   cleanCode: '654321',
 * //   message: '验证码格式正确',
 * //   isDevelopmentCode: false
 * // }
 *
 * @example
 * // ❌ 格式错误 - 长度不足
 * const result = validateVerificationCode('12345')
 * // => { isValid: false, message: '验证码应为6位数字' }
 *
 * @example
 * // ❌ 格式错误 - 包含字母
 * const result = validateVerificationCode('12345a')
 * // => { isValid: false, message: '验证码应为6位数字' }
 *
 * @since 2025-10-31
 * @version 2.0.0
 * @see {@link config/env.js} getDevelopmentConfig()配置说明
 */
const validateVerificationCode = code => {
  const devConfig = getDevelopmentConfig()

  if (!code || typeof code !== 'string') {
    return {
      isValid: false,
      message: '请输入验证码'
    }
  }

  // 去除空格
  const cleanCode = code.replace(/\s+/g, '')

  // 🔴 开发阶段：支持123456万能验证码（修正配置检查）
  if (devConfig.enableUnifiedAuth && cleanCode === '123456') {
    return {
      isValid: true,
      cleanCode,
      message: '开发阶段万能验证码验证通过',
      isDevelopmentCode: true
    }
  }

  // 正常验证码格式：6位数字
  const codeRegex = /^\d{6}$/

  if (!codeRegex.test(cleanCode)) {
    return {
      isValid: false,
      message: '验证码应为6位数字'
    }
  }

  return {
    isValid: true,
    cleanCode,
    message: '验证码格式正确',
    isDevelopmentCode: false
  }
}

/**
 * 积分验证（0-999999范围）
 *
 * @description
 * 验证积分数量是否有效，用于兑换和抽奖功能。
 *
 * **业务场景**：
 * - 积分兑换验证（核心功能）
 * - 抽奖扣除积分验证（核心功能）
 * - 积分转账验证
 * - 积分充值验证
 *
 * **验证规则**：
 * - 必须是数字类型或可转换为数字的字符串
 * - 不能为负数
 * - 不能超过999999（系统最大积分限制）
 * - 必须是整数（不支持小数积分）
 *
 * **业务限制**：
 * - 最大积分值：999999（6位数）
 * - 最小积分值：0
 *
 * @param {number | string} points - 待验证的积分数量
 *
 * @returns {Object} 验证结果对象
 * @returns {Boolean} returns.isValid - 是否验证通过
 * @returns {String} returns.message - 验证结果消息
 * @returns {Number} [returns.cleanPoints] - 清理后的积分数值（仅验证通过时返回）
 *
 * @example
 * // ✅ 正常积分
 * const result = validatePoints(1000)
 * // => { isValid: true, cleanPoints: 1000, message: '积分验证通过' }
 *
 * @example
 * // ✅ 字符串格式的积分
 * const result = validatePoints('5000')
 * // => { isValid: true, cleanPoints: 5000, message: '积分验证通过' }
 *
 * @example
 * // ✅ 边界值 - 最大积分
 * const result = validatePoints(999999)
 * // => { isValid: true, cleanPoints: 999999, message: '积分验证通过' }
 *
 * @example
 * // ❌ 超过最大值
 * const result = validatePoints(1000000)
 * // => { isValid: false, message: '积分不能超过999999' }
 *
 * @example
 * // ❌ 负数
 * const result = validatePoints(-100)
 * // => { isValid: false, message: '积分不能为负数' }
 *
 * @example
 * // ❌ 小数
 * const result = validatePoints(100.5)
 * // => { isValid: false, message: '积分必须是整数' }
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const validatePoints = points => {
  if (points === undefined || points === null) {
    return {
      isValid: false,
      message: '请输入积分数量'
    }
  }

  const numPoints = Number(points)

  if (isNaN(numPoints)) {
    return {
      isValid: false,
      message: '积分必须是数字'
    }
  }

  if (numPoints < 0) {
    return {
      isValid: false,
      message: '积分不能为负数'
    }
  }

  if (numPoints > 999999) {
    return {
      isValid: false,
      message: '积分不能超过999999'
    }
  }

  if (!Number.isInteger(numPoints)) {
    return {
      isValid: false,
      message: '积分必须是整数'
    }
  }

  return {
    isValid: true,
    cleanPoints: numPoints,
    message: '积分验证通过'
  }
}

/**
 * 数量验证（1-9999范围）
 *
 * @description
 * 验证商品数量是否有效，用于兑换商品功能。
 *
 * **业务场景**：
 * - 兑换商品数量验证
 * - 批量操作数量验证
 * - 库存数量验证
 *
 * **验证规则**：
 * - 必须是数字类型或可转换为数字的字符串
 * - 必须大于0
 * - 不能超过9999
 * - 必须是整数
 *
 * @param {number | string} quantity - 待验证的数量
 *
 * @returns {Object} 验证结果对象
 * @returns {Boolean} returns.isValid - 是否验证通过
 * @returns {String} returns.message - 验证结果消息
 * @returns {Number} [returns.cleanQuantity] - 清理后的数量值（仅验证通过时返回）
 *
 * @example
 * // ✅ 正常数量
 * const result = validateQuantity(5)
 * // => { isValid: true, cleanQuantity: 5, message: '数量验证通过' }
 *
 * @example
 * // ❌ 数量为0
 * const result = validateQuantity(0)
 * // => { isValid: false, message: '数量必须大于0' }
 *
 * @example
 * // ❌ 超过最大值
 * const result = validateQuantity(10000)
 * // => { isValid: false, message: '数量不能超过9999' }
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const validateQuantity = quantity => {
  if (quantity === undefined || quantity === null) {
    return {
      isValid: false,
      message: '请输入数量'
    }
  }

  const numQuantity = Number(quantity)

  if (isNaN(numQuantity)) {
    return {
      isValid: false,
      message: '数量必须是数字'
    }
  }

  if (numQuantity <= 0) {
    return {
      isValid: false,
      message: '数量必须大于0'
    }
  }

  if (numQuantity > 9999) {
    return {
      isValid: false,
      message: '数量不能超过9999'
    }
  }

  if (!Number.isInteger(numQuantity)) {
    return {
      isValid: false,
      message: '数量必须是整数'
    }
  }

  return {
    isValid: true,
    cleanQuantity: numQuantity,
    message: '数量验证通过'
  }
}

/**
 * 昵称验证（2-20字符，支持中英文数字下划线）
 *
 * @description
 * 验证用户昵称格式是否正确。
 *
 * **业务场景**：
 * - 用户资料修改
 * - 用户注册
 * - 个人信息完善
 *
 * **验证规则**：
 * - 长度：2-20个字符
 * - 支持字符：中文、英文、数字、下划线
 * - 不支持特殊符号和表情符号
 * - 自动去除首尾空格
 *
 * @param {string} nickname - 待验证的昵称
 *
 * @returns {Object} 验证结果对象
 * @returns {Boolean} returns.isValid - 是否验证通过
 * @returns {String} returns.message - 验证结果消息
 * @returns {String} [returns.cleanNickname] - 清理后的昵称（仅验证通过时返回）
 *
 * @example
 * // ✅ 中文昵称
 * const result = validateNickname('张三')
 * // => { isValid: true, cleanNickname: '张三', message: '昵称验证通过' }
 *
 * @example
 * // ✅ 英文昵称
 * const result = validateNickname('User_123')
 * // => { isValid: true, cleanNickname: 'User_123', message: '昵称验证通过' }
 *
 * @example
 * // ❌ 长度不足
 * const result = validateNickname('A')
 * // => { isValid: false, message: '昵称至少需要2个字符' }
 *
 * @example
 * // ❌ 包含特殊字符
 * const result = validateNickname('张三@123')
 * // => { isValid: false, message: '昵称只能包含中文、英文、数字和下划线' }
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const validateNickname = nickname => {
  if (!nickname || typeof nickname !== 'string') {
    return {
      isValid: false,
      message: '请输入昵称'
    }
  }

  // 去除首尾空格
  const cleanNickname = nickname.trim()

  if (cleanNickname.length === 0) {
    return {
      isValid: false,
      message: '昵称不能为空'
    }
  }

  if (cleanNickname.length < 2) {
    return {
      isValid: false,
      message: '昵称至少需要2个字符'
    }
  }

  if (cleanNickname.length > 20) {
    return {
      isValid: false,
      message: '昵称不能超过20个字符'
    }
  }

  // 检查是否包含特殊字符（允许中文、英文、数字、下划线）
  const nicknameRegex = /^[\u4e00-\u9fa5a-zA-Z0-9_]+$/

  if (!nicknameRegex.test(cleanNickname)) {
    return {
      isValid: false,
      message: '昵称只能包含中文、英文、数字和下划线'
    }
  }

  return {
    isValid: true,
    cleanNickname,
    message: '昵称验证通过'
  }
}

/**
 * 图片文件验证（支持JPG/PNG/WEBP，最大20MB）
 *
 * @description
 * 验证上传的图片文件是否符合系统要求。
 *
 * **业务场景**：
 * - 用户头像上传
 * - 商品图片上传
 * - 凭证图片上传
 * - 反馈图片上传
 *
 * **验证规则**：
 * - 文件大小：最大20MB
 * - 支持格式：JPG、JPEG、PNG、WEBP
 * - 文件名长度：最大200字符
 *
 * **存储架构**：
 * - 基于Sealos对象存储规范
 * - 支持多业务线分层存储
 *
 * @param {object} file - 待验证的文件对象
 * @param {string} file.name - 文件名
 * @param {number} file.size - 文件大小（字节）
 * @param {string} file.type - 文件MIME类型
 *
 * @returns {object} 验证结果对象
 * @returns {boolean} returns.isValid - 是否验证通过
 * @returns {String} returns.message - 验证结果消息
 * @returns {Object} [returns.fileInfo] - 文件信息对象（仅验证通过时返回）
 * @returns {String} [returns.fileInfo.name] - 文件名
 * @returns {Number} [returns.fileInfo.size] - 文件大小（字节）
 * @returns {String} [returns.fileInfo.type] - 文件类型
 * @returns {String} [returns.fileInfo.sizeFormatted] - 格式化后的文件大小
 *
 * @example
 * // ✅ 正常图片文件
 * const file = { name: 'avatar.jpg', size: 1048576, type: 'image/jpeg' }
 * const result = validateImageFile(file)
 * // => {
 * //   isValid: true,
 * //   fileInfo: { name: 'avatar.jpg', size: 1048576, type: 'image/jpeg', sizeFormatted: '1.00MB' },
 * //   message: '图片文件验证通过'
 * // }
 *
 * @example
 * // ❌ 文件过大
 * const file = { name: 'big.jpg', size: 25 * 1024 * 1024, type: 'image/jpeg' }
 * const result = validateImageFile(file)
 * // => { isValid: false, message: '图片文件大小不能超过20MB' }
 *
 * @example
 * // ❌ 不支持的格式
 * const file = { name: 'image.bmp', size: 1048576, type: 'image/bmp' }
 * const result = validateImageFile(file)
 * // => { isValid: false, message: '仅支持JPG、PNG、WEBP格式的图片' }
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const validateImageFile = file => {
  if (!file) {
    return {
      isValid: false,
      message: '请选择图片文件'
    }
  }

  // 文件大小限制（20MB = 20 * 1024 * 1024 字节）
  const maxSize = 20 * 1024 * 1024
  if (file.size > maxSize) {
    return {
      isValid: false,
      message: '图片文件大小不能超过20MB'
    }
  }

  // 支持的图片格式（基于Sealos对象存储规范）
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
  if (!allowedTypes.includes(file.type)) {
    return {
      isValid: false,
      message: '仅支持JPG、PNG、WEBP格式的图片'
    }
  }

  // 文件名长度限制
  if (file.name && file.name.length > 200) {
    return {
      isValid: false,
      message: '文件名过长，请重命名后上传'
    }
  }

  return {
    isValid: true,
    fileInfo: {
      name: file.name,
      size: file.size,
      type: file.type,
      sizeFormatted: (file.size / 1024 / 1024).toFixed(2) + 'MB'
    },
    message: '图片文件验证通过'
  }
}

/**
 * 批量验证函数（一次性验证多个字段）
 *
 * @description
 * 批量执行多个验证规则，返回所有验证结果。
 *
 * **业务场景**：
 * - 表单提交前批量验证
 * - 复杂数据验证
 * - 多字段联合验证
 *
 * **验证流程**：
 * 1. 遍历所有验证配置
 * 2. 逐个执行验证器函数
 * 3. 收集所有验证结果
 * 4. 返回第一个错误消息（便于UI显示）
 *
 * @param {Array<object>} validations - 验证配置数组
 * @param {function} validations[].validator - 验证器函数
 * @param {*} validations[].value - 待验证的值
 * @param {string} [validations[].fieldName] - 字段名称（用于结果标识）
 *
 * @returns {object} 验证结果对象
 * @returns {boolean} returns.isValid - 是否全部验证通过
 * @returns {Array<object>} returns.results - 各字段验证结果数组
 * @returns {String} [returns.firstErrorMessage] - 第一个错误消息
 *
 * @example
 * // ✅ 全部验证通过
 * const result = validateBatch([
 *   { validator: validatePhoneNumber, value: '13812345678', fieldName: 'phone' },
 *   { validator: validatePoints, value: 1000, fieldName: 'points' }
 * ])
 * // => {
 * //   isValid: true,
 * //   results: [
 * //     { fieldName: 'phone', isValid: true, message: '手机号格式正确', cleanValue: '13812345678' },
 * //     { fieldName: 'points', isValid: true, message: '积分验证通过', cleanValue: 1000 }
 * //   ],
 * //   firstErrorMessage: null
 * // }
 *
 * @example
 * // ❌ 部分验证失败
 * const result = validateBatch([
 * { validator: validatePhoneNumber, value: '138', fieldName: 'phone' },
 *   { validator: validatePoints, value: 1000, fieldName: 'points' }
 * ])
 * // => {
 * //   isValid: false,
 * //   results: [
 * //     { fieldName: 'phone', isValid: false, message: '请输入正确的手机号格式' },
 * //     { fieldName: 'points', isValid: true, message: '积分验证通过', cleanValue: 1000 }
 * //   ],
 * //   firstErrorMessage: '请输入正确的手机号格式'
 * // }
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const validateBatch = validations => {
  if (!Array.isArray(validations)) {
    return {
      isValid: false,
      results: [],
      firstErrorMessage: '验证配置错误'
    }
  }

  const results = []
  let hasError = false
  let firstErrorMessage = null

  for (const validation of validations) {
    const { validator, value, fieldName } = validation

    if (typeof validator !== 'function') {
      const errorResult = {
        fieldName: fieldName || 'unknown',
        isValid: false,
        message: '验证器配置错误'
      }
      results.push(errorResult)
      hasError = true
      if (!firstErrorMessage) {
        firstErrorMessage = errorResult.message
      }
      continue
    }

    const result = validator(value)
    const fieldResult = {
      fieldName: fieldName || 'unknown',
      isValid: result.isValid,
      message: result.message,
      cleanValue:
        result.cleanValue ||
        result.cleanPhone ||
        result.cleanCode ||
        result.cleanPoints ||
        result.cleanQuantity ||
        result.cleanNickname
    }

    results.push(fieldResult)

    if (!result.isValid) {
      hasError = true
      if (!firstErrorMessage) {
        firstErrorMessage = result.message
      }
    }
  }

  return {
    isValid: !hasError,
    results,
    firstErrorMessage
  }
}

/**
 * 通用验证规则对象（用于FormValidator快速配置）
 *
 * @description
 * 提供常用的验证规则生成器，简化FormValidator的配置过程。
 *
 * **使用场景**：
 * - 配合FormValidator类使用
 * - 快速创建验证规则
 * - 自定义错误消息
 *
 * **可用规则**：
 * - required：必填验证
 * - mobile：手机号验证
 * - length：长度验证
 * - points：积分验证
 * - quantity：数量验证
 *
 * @type {object}
 * @property {function} required - 必填验证规则生成器
 * @property {function} mobile - 手机号验证规则生成器
 * @property {function} length - 长度验证规则生成器
 * @property {function} points - 积分验证规则生成器
 * @property {function} quantity - 数量验证规则生成器
 *
 * @example
 * // 创建表单验证器
 * const validator = new FormValidator({
 *   phone: [commonRules.required(), commonRules.mobile()],
 *   code: [commonRules.required(), commonRules.length(6, '验证码必须是6位')],
 *   points: [commonRules.required(), commonRules.points()]
 * })
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const commonRules = {
  // 必填验证
  required: (message = '此字段不能为空') => {
    return value => {
      if (value === null || value === undefined || value === '') {
        return { isValid: false, message }
      }
      return { isValid: true }
    }
  },

  // 手机号验证
  mobile: (message = '请输入正确的手机号') => {
    return value => {
      const result = validatePhoneNumber(value)
      return {
        isValid: result.isValid,
        message: result.isValid ? '' : message || result.message
      }
    }
  },

  // 长度验证
  length: (expectedLength, message) => {
    return value => {
      if (!value || value.length !== expectedLength) {
        return {
          isValid: false,
          message: message || `长度必须为${expectedLength}位`
        }
      }
      return { isValid: true }
    }
  },

  // 积分验证
  points: (message = '请输入有效的积分数量') => {
    return value => {
      const result = validatePoints(value)
      return {
        isValid: result.isValid,
        message: result.isValid ? '' : message || result.message
      }
    }
  },

  // 数量验证
  quantity: (message = '请输入有效的数量') => {
    return value => {
      const result = validateQuantity(value)
      return {
        isValid: result.isValid,
        message: result.isValid ? '' : message || result.message
      }
    }
  }
}

/**
 * 表单验证器类（面向对象的表单验证解决方案）
 *
 * @description
 * 提供完整的表单验证功能，支持多规则验证、单字段验证。
 *
 * **业务场景**：
 * - 复杂表单验证（登录、注册、兑换等）
 * - 实时字段验证
 * - 批量字段验证
 *
 * **核心特性**：
 * - 支持多规则串联验证
 * - 首个失败规则即停止该字段验证
 * - 提供详细的错误信息
 * - 支持单字段验证和全表单验证
 *
 * @class
 * @param {object} rules - 验证规则配置对象
 *
 * @example
 * // 创建登录表单验证器
 * const loginValidator = new FormValidator({
 *   phone: [commonRules.required(), commonRules.mobile()],
 *   code: [commonRules.required(), commonRules.length(6)]
 * })
 *
 * // 验证表单数据
 * const result = loginValidator.validate({
 *   phone: '13812345678',
 *   code: '123456'
 * })
 *
 * if (result.isValid) {
 *   console.log('验证通过')
 * } else {
 *   console.log('验证失败:', result.errors)
 * }
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
class FormValidator {
  /**
   * 构造函数
   *
   * @param {object} rules - 验证规则配置对象
   * @param {Array<function>|function} rules.fieldName - 字段对应的验证规则（可以是单个函数或函数数组）
   */
  constructor(rules = {}) {
    this.rules = rules
  }

  /**
   * 验证完整表单数据
   *
   * @description
   * 遍历所有字段，执行对应的验证规则。
   *
   * **验证流程**：
   * 1. 遍历所有配置的字段规则
   * 2. 对每个字段执行验证规则
   * 3. 首个失败规则停止该字段后续验证
   * 4. 收集所有字段的错误信息
   *
   * @param {object} formData - 表单数据对象
   * @returns {object} 验证结果对象
   * @returns {boolean} returns.isValid - 是否全部验证通过
   * @returns {object} returns.errors - 错误信息对象（字段名 -> 错误消息）
   *
   * @example
   * // 验证登录表单
   * const formData = { phone: '13812345678', code: '123456' }
   * const result = loginValidator.validate(formData)
   * // => { isValid: true, errors: {} }
   *
   * @example
   * // 验证失败
   * const formData = { phone: '138', code: '' }
   * const result = loginValidator.validate(formData)
   * // => {
   * //   isValid: false,
   * //   errors: {
   * //     phone: '请输入正确的手机号格式',
   * //     code: '此字段不能为空'
   * //   }
   * // }
   */
  validate(formData) {
    const errors = {}
    let isValid = true

    // 遍历所有验证规则
    for (const [fieldName, fieldRules] of Object.entries(this.rules)) {
      const fieldValue = formData[fieldName]

      // 如果字段有多个验证规则
      if (Array.isArray(fieldRules)) {
        for (const rule of fieldRules) {
          if (typeof rule === 'function') {
            const result = rule(fieldValue)
            // 第一个验证失败就停止该字段的后续验证
            if (!result.isValid) {
              errors[fieldName] = result.message
              isValid = false
              break
            }
          }
        }
      } else if (typeof fieldRules === 'function') {
        // 如果字段只有一个验证规则
        const result = fieldRules(fieldValue)
        if (!result.isValid) {
          errors[fieldName] = result.message
          isValid = false
        }
      }
    }

    return {
      isValid,
      errors
    }
  }

  /**
   * 验证单个字段
   *
   * @description
   * 对单个字段执行验证，用于实时验证场景。
   *
   * **使用场景**：
   * - 表单输入时的实时验证
   * - 失焦验证
   * - 动态字段验证
   *
   * @param {string} fieldName - 字段名
   * @param {*} fieldValue - 字段值
   * @returns {object} 验证结果对象
   * @returns {boolean} returns.isValid - 是否验证通过
   * @returns {string} returns.message - 验证消息
   *
   * @example
   * // 实时验证手机号输入
   * const result = loginValidator.validateField('phone', '138')
   * if (!result.isValid) {
   *   console.log('错误提示:', result.message)
   * }
   */
  validateField(fieldName, fieldValue) {
    const fieldRules = this.rules[fieldName]
    if (!fieldRules) {
      return { isValid: true, message: '' }
    }

    // 如果字段有多个验证规则
    if (Array.isArray(fieldRules)) {
      for (const rule of fieldRules) {
        if (typeof rule === 'function') {
          const result = rule(fieldValue)
          if (!result.isValid) {
            return result
          }
        }
      }
    } else if (typeof fieldRules === 'function') {
      // 如果字段只有一个验证规则
      return fieldRules(fieldValue)
    }

    return { isValid: true, message: '' }
  }
}

// 🔴 导出所有验证函数和类
module.exports = {
  // 基础验证函数
  validatePhoneNumber,
  validateVerificationCode,
  validatePoints,
  validateQuantity,
  validateNickname,
  validateImageFile,
  validateBatch,

  // 表单验证相关
  FormValidator,
  commonRules
}
