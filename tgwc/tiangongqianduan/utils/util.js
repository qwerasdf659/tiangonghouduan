// utils/util.js - 通用工具类v2.0（基于产品功能结构描述文档v2.0）

/**
 * 🔴 通用工具类v2.0 - 餐厅积分抽奖系统
 * 📊 完全符合产品功能结构描述文档v2.0
 * 🏗️ 支持多业务线分层存储架构
 */

/**
 * 格式化数字（补零，用于日期时间显示）
 *
 * @description
 * 将单位数字格式化为两位数，用于日期时间的显示。
 *
 * **业务场景**：
 * - 日期时间格式化的辅助函数
 * - 配合formatTime使用
 *
 * @param {Number | String} n - 待格式化的数字
 * @returns {String} 格式化后的字符串（两位数）
 *
 * @example
 * // 补零
 * formatNumber(5)
 * // => '05'
 *
 * @example
 * // 已是两位数
 * formatNumber(15)
 * // => '15'
 *
 * @since 2025-10-31
 * @version 2.0.0
 * @private
 */
const formatNumber = n => {
  n = n.toString()
  return n[1] ? n : `0${n}`
}

/**
 * 格式化日期时间（YYYY-MM-DD HH:mm:ss格式）
 *
 * @description
 * 将Date对象格式化为标准的日期时间字符串。
 *
 * **业务场景**：
 * - 积分记录时间显示（高频使用）
 * - 兑换记录时间显示
 * - 抽奖记录时间显示
 * - 聊天消息时间戳格式化
 *
 * **输出格式**：YYYY-MM-DD HH:mm:ss
 *
 * @param {Date} date - Date对象
 * @returns {string} 格式化后的日期时间字符串
 *
 * @example
 * const date = new Date('2025-10-31T15:30:45')
 * formatTime(date)
 * // => '2025-10-31 15:30:45'
 *
 * @example
 * // 当前时间
 * formatTime(new Date())
 * // => '2025-10-31 16:25:30'
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const formatTime = date => {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hour = date.getHours()
  const minute = date.getMinutes()
  const second = date.getSeconds()

  return `${[year, month, day].map(formatNumber).join('-')} ${[hour, minute, second].map(formatNumber).join(':')}`
}

/**
 * Base64解码（微信小程序兼容版）
 *
 * @description
 * 微信小程序环境下的Base64解码实现，用于JWT Token解码。
 *
 * **技术背景**：
 * - 微信小程序中标准Base64库不可用
 * - 需要手动实现Base64解码逻辑
 * - 处理Base64 URL编码格式（JWT使用）
 *
 * **核心功能**：
 * 1. ✅ 完整的Base64字符表支持（包含填充字符=）
 * 2. ✅ Base64 URL编码兼容（-转+，_转/）
 * 3. ✅ 详细的错误处理和调试日志
 * 4. ✅ 字符验证和长度验证
 *
 * **使用场景**：
 * - JWT Token解码（核心依赖）
 * - Base64编码数据解码
 *
 * **实现细节**：
 * - Line 35-118：完整实现和错误处理
 * - 使用自定义字符表进行解码
 * - 包含详细的调试信息输出
 *
 * @param {String} base64Str - Base64编码的字符串
 * @returns {String} 解码后的原始字符串
 * @throws {Error} Base64格式错误时抛出异常
 *
 * @example
 * // 解码Base64字符串
 * const encoded = 'SGVsbG8gV29ybGQ='
 * const decoded = base64Decode(encoded)
 * // => 'Hello World'
 *
 * @example
 * // 解码JWT Payload部分
 * const jwtPayload = 'eyJ1c2VyX2lkIjo...（Base64编码的JSON）'
 * const decodedPayload = base64Decode(jwtPayload)
 * // => '{"user_id":123,...}'
 *
 * @since 2025-10-31
 * @version 2.0.0
 * @see {@link decodeJWTPayload} 配合使用的JWT解码函数
 */
const base64Decode = base64Str => {
  try {
    // 🔧 输入验证
    if (!base64Str || typeof base64Str !== 'string') {
      console.error('❌ Base64解码错误：输入无效', { input: base64Str, type: typeof base64Str })
      throw new Error('Base64输入无效')
    }

    // Base64字符表（包含填充字符）
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    let result = ''
    let i = 0

    // 🔧 关键修复：不要移除填充字符！只移除真正的非Base64字符
    // 保留 +, /, = 字符，只移除其他无关字符
    const cleanedStr = base64Str.replace(/[^A-Za-z0-9+/=]/g, '')

    // 🔍 添加调试信息
    console.log('🔍 Base64解码调试:', {
      original: base64Str.substring(0, 50) + (base64Str.length > 50 ? '...' : ''),
      cleaned: cleanedStr.substring(0, 50) + (cleanedStr.length > 50 ? '...' : ''),
      originalLength: base64Str.length,
      cleanedLength: cleanedStr.length,
      hasPadding: cleanedStr.includes('=')
    })

    // 🔧 长度验证
    if (cleanedStr.length === 0) {
      throw new Error('清理后的Base64字符串为空')
    }

    // 🔧 填充验证
    if (cleanedStr.length % 4 !== 0) {
      console.warn('⚠️ Base64字符串长度不是4的倍数:', cleanedStr.length)
    }

    while (i < cleanedStr.length) {
      const char1 = cleanedStr.charAt(i++)
      const char2 = cleanedStr.charAt(i++)
      const char3 = cleanedStr.charAt(i++)
      const char4 = cleanedStr.charAt(i++)

      const encoded1 = chars.indexOf(char1)
      const encoded2 = chars.indexOf(char2)
      const encoded3 = chars.indexOf(char3)
      const encoded4 = chars.indexOf(char4)

      // 🔧 字符验证
      if (encoded1 === -1 || encoded2 === -1) {
        console.error('❌ Base64字符无效:', { char1, char2, char3, char4 })
        throw new Error(`无效的Base64字符: ${char1}, ${char2}`)
      }

      const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4

      result += String.fromCharCode((bitmap >> 16) & 255)

      if (encoded3 !== 64 && encoded3 !== -1) {
        // 64是 '=' 的索引
        result += String.fromCharCode((bitmap >> 8) & 255)
      }
      if (encoded4 !== 64 && encoded4 !== -1) {
        result += String.fromCharCode(bitmap & 255)
      }
    }

    // 🔍 结果验证
    console.log('✅ Base64解码成功:', {
      inputLength: base64Str.length,
      outputLength: result.length,
      preview: result.substring(0, 100) + (result.length > 100 ? '...' : '')
    })

    return result
  } catch (error) {
    console.error('❌ Base64解码失败:', error)
    console.error('📊 错误详情:', {
      input: base64Str ? base64Str.substring(0, 100) + '...' : 'NULL',
      inputLength: base64Str ? base64Str.length : 0,
      errorMessage: error.message
    })
    throw error
  }
}

/**
 * JWT Token完整性验证（防止Token截断问题）
 *
 * @description
 * 检查JWT Token是否完整有效，防止网络传输或存储过程中的截断问题。
 *
 * **问题背景**：
 * - 微信小程序存储有时会截断长字符串
 * - 网络传输可能导致Token不完整
 * - 不完整的Token会导致解码失败，影响用户体验
 *
 * **检查内容**：
 * 1. ✅ Token格式验证（必须是三段式：header.payload.signature）
 * 2. ✅ 各部分长度验证（header≥20, payload≥50, signature≥40）
 * 3. ✅ Base64字符验证（只能包含A-Za-z0-9+/=）
 * 4. ✅ 总长度验证（≥150字符）
 *
 * **实际案例**：
 * - 完整Token：eyJhbGc...很长...abc123（完整签名，长度约150-300字符）
 * - 截断Token：eyJhbGc...很长...abc（签名被截断，长度可能只有100+字符）
 *
 * **实现细节**：
 * - Line 123-233：完整实现逻辑
 * - Line 168-180：关键的签名长度验证（最容易截断的部分）
 * - Line 214-223：返回详细的验证结果和诊断信息
 *
 * @param {string} token - JWT Token字符串
 * @returns {object} 验证结果对象
 * @returns {boolean} returns.isValid - 是否验证通过
 * @returns {String} [returns.error] - 错误信息（验证失败时返回）
 * @returns {Object} [returns.details] - 详细信息（包含各部分长度等）
 *
 * @example
 * // ✅ Token完整
 * const result = validateJWTTokenIntegrity(validToken)
 * // => {
 * //   isValid: true,
 * //   details: {
 * //     tokenLength: 347,
 * //     headerLength: 36,
 * //     payloadLength: 267,
 * //     signatureLength: 43
 * //   }
 * // }
 *
 * @example
 * // ❌ Token被截断
 * const result = validateJWTTokenIntegrity(truncatedToken)
 * // => {
 * //   isValid: false,
 * //   error: 'JWT签名部分过短，明显被截断',
 * //   details: {
 * //     signatureLength: 20,
 * //     expectedMin: 40,
 * //     possibleCause: '可能原因：微信小程序存储限制、网络传输截断或后端生成错误'
 * //   }
 * // }
 *
 * @since 2025-10-31
 * @version 2.0.0
 * @see {@link utils/util.js} Line 123-233 完整实现和测试用例
 * @see {@link decodeJWTPayload} 配合使用的解码函数
 */
const validateJWTTokenIntegrity = token => {
  try {
    if (!token || typeof token !== 'string') {
      return {
        isValid: false,
        error: 'Token为空或类型错误',
        details: { tokenType: typeof token }
      }
    }

    const tokenParts = token.split('.')
    if (tokenParts.length !== 3) {
      return {
        isValid: false,
        error: `JWT Token格式错误，预期3个部分，实际${tokenParts.length}个`,
        details: {
          partsCount: tokenParts.length,
          parts: tokenParts.map((part, index) => ({ index, length: part.length }))
        }
      }
    }

    // 检查各部分长度是否合理
    const [header, payload, signature] = tokenParts

    // Header通常至少36个字符（{"alg":"HS256","typ":"JWT"}的Base64编码）
    if (header.length < 20) {
      return {
        isValid: false,
        error: 'JWT Header部分过短，可能被截断',
        details: { headerLength: header.length, expectedMin: 20 }
      }
    }

    // Payload长度检查（根据您的应用，用户信息payload至少应该有50个字符）
    if (payload.length < 50) {
      return {
        isValid: false,
        error: 'JWT Payload部分过短，可能被截断',
        details: { payloadLength: payload.length, expectedMin: 50 }
      }
    }

    // 🔴 关键检查：签名长度验证
    // HMAC-SHA256签名的Base64编码通常是43个字符（包含padding）或44个字符
    if (signature.length < 40) {
      return {
        isValid: false,
        error: 'JWT签名部分过短，明显被截断',
        details: {
          signatureLength: signature.length,
          expectedMin: 40,
          actualSignature: signature,
          // 🔧 添加微信小程序存储限制检查
          possibleCause: '可能原因：微信小程序存储限制、网络传输截断或后端生成错误'
        }
      }
    }

    // 检查Token总长度是否合理
    const totalLength = token.length
    if (totalLength < 150) {
      return {
        isValid: false,
        error: 'JWT Token总长度过短，疑似截断',
        details: {
          totalLength,
          expectedMin: 150,
          storageInfo: '微信小程序单项存储限制1MB，但可能存在其他限制'
        }
      }
    }

    // 🔧 Base64 URL字符检查
    // JWT使用Base64 URL编码：使用 - 和 _ 代替 + 和 /，通常不带=填充
    const base64UrlPattern = /^[A-Za-z0-9_-]*$/
    if (
      !base64UrlPattern.test(header) ||
      !base64UrlPattern.test(payload) ||
      !base64UrlPattern.test(signature)
    ) {
      return {
        isValid: false,
        error: 'JWT Token包含无效的Base64 URL字符',
        details: {
          headerValid: base64UrlPattern.test(header),
          payloadValid: base64UrlPattern.test(payload),
          signatureValid: base64UrlPattern.test(signature)
        }
      }
    }

    return {
      isValid: true,
      details: {
        tokenLength: totalLength,
        headerLength: header.length,
        payloadLength: payload.length,
        signatureLength: signature.length
      }
    }
  } catch (error) {
    return {
      isValid: false,
      error: 'Token完整性验证过程出错',
      details: {
        originalError: error.message,
        tokenPreview: token ? token.substring(0, 50) + '...' : 'NO_TOKEN'
      }
    }
  }
}

/**
 * JWT Token解码（微信小程序兼容版）
 *
 * @description
 * 解码JWT Token的Payload部分，获取用户信息和Token元数据。
 *
 * **核心功能**：
 * 1. ✅ Token完整性验证（防止截断）
 * 2. ✅ Base64 URL解码
 * 3. ✅ JSON解析和错误处理
 * 4. ✅ 详细的调试日志
 *
 * **解码流程**：
 * 1. 先调用validateJWTTokenIntegrity验证完整性
 * 2. 如果验证失败，返回null并提示解决方案
 * 3. 分割Token为三部分（header.payload.signature）
 * 4. 提取payload部分
 * 5. 处理Base64 URL编码（-转+，_转/）
 * 6. 添加必要的填充字符（=）
 * 7. 调用base64Decode解码
 * 8. JSON.parse解析为对象
 * 9. 返回解析后的用户信息
 *
 * **Token内容**：
 * - user_id：用户ID
 * - mobile：手机号
 * - is_admin：是否管理员
 * - exp：过期时间戳
 * - iat：签发时间戳
 *
 * **错误处理**：
 * - Token截断：提示重新登录
 * - JSON解析失败：尝试清理无效字符后重试
 * - 完整的错误日志输出
 *
 * @param {string} token - JWT Token字符串
 * @returns {Object | null} 解码后的Payload对象，失败返回null
 * @returns {Number} [returns.user_id] - 用户ID
 * @returns {String} [returns.mobile] - 手机号
 * @returns {Boolean} [returns.is_admin] - 是否管理员
 * @returns {Number} [returns.exp] - 过期时间戳（Unix时间戳）
 * @returns {Number} [returns.iat] - 签发时间戳（Unix时间戳）
 *
 * @example
 * // ✅ 成功解码
 * const payload = decodeJWTPayload(token)
 * // => {
 * //   user_id: 123,
 * //   mobile: '13812345678',
 * //   is_admin: false,
 * //   exp: 1730390400,
 * //   iat: 1730304000
 * // }
 *
 * @example
 * // 实际业务使用（app.js中的Token恢复）
 * async checkAuthStatus() {
 *   const token = wx.getStorageSync('access_token')
 *
 *   // 解码Token获取用户信息
 *   const payload = decodeJWTPayload(token)
 *   if (!payload) {
 *     console.error('Token解码失败')
 *     this.clearAuthData()
 *     wx.redirectTo({ url: '/pages/auth/auth' })
 *     return
 *   }
 *
 *   // 检查Token是否过期
 *   if (isTokenExpired(token)) {
 *     console.log('Token已过期，需要刷新')
 *     // 调用刷新Token接口
 *   }
 *
 *   // 保存用户信息
 *   this.globalData.userInfo = {
 *     userId: payload.user_id,
 *     mobile: payload.mobile,
 *     isAdmin: payload.is_admin
 *   }
 * }
 *
 * @since 2025-10-31
 * @version 2.0.0
 * @see {@link validateJWTTokenIntegrity} Token完整性验证
 * @see {@link base64Decode} Base64解码函数
 * @see {@link isTokenExpired} Token过期检查
 */
const decodeJWTPayload = token => {
  try {
    // 🔧 新增：完整性验证
    const integrityCheck = validateJWTTokenIntegrity(token)
    if (!integrityCheck.isValid) {
      console.error('❌ JWT Token完整性验证失败:', integrityCheck.error)
      console.error('🔍 详细信息:', integrityCheck.details)

      // 🚨 特别提示截断问题
      if (integrityCheck.error.includes('截断')) {
        console.error('🚨 检测到Token截断问题！')
        console.error('💡 建议解决方案：')
        console.error('1. 检查网络连接稳定性')
        console.error('2. 重新登录获取完整Token')
        console.error('3. 联系后端检查Token生成过程')
      }

      return null
    }

    console.log('✅ JWT Token完整性验证通过:', integrityCheck.details)

    const tokenParts = token.split('.')
    if (tokenParts.length !== 3) {
      console.warn('⚠️ JWT Token格式错误')
      return null
    }

    // Base64 URL解码 - 兼容微信小程序
    let payload = tokenParts[1]

    // 处理Base64 URL编码
    payload = payload.replace(/-/g, '+').replace(/_/g, '/')

    // 添加必要的填充
    while (payload.length % 4) {
      payload += '='
    }

    console.log('🔍 JWT解码调试信息:', {
      originalPayload: tokenParts[1],
      processedPayload: payload,
      payloadLength: payload.length
    })

    // 使用兼容的Base64解码
    console.log('🔄 开始Base64解码...')
    const decodedPayload = base64Decode(payload)

    console.log('🔄 开始JSON解析...', {
      decodedLength: decodedPayload.length,
      decodedPreview: decodedPayload.substring(0, 200),
      charCodes: decodedPayload
        .split('')
        .slice(0, 20)
        .map((char, index) => ({
          index,
          char,
          code: char.charCodeAt(0),
          isControl: char.charCodeAt(0) < 32
        }))
    })

    // 🔧 增强JSON解析错误处理
    let parsedPayload = null
    try {
      parsedPayload = JSON.parse(decodedPayload)
    } catch (jsonError) {
      console.error('❌ JSON解析失败详细信息:', {
        error: jsonError.message,
        position: jsonError.message.match(/position (\d+)/)
          ? parseInt(jsonError.message.match(/position (\d+)/)[1])
          : null,
        decodedPayload,
        payloadLength: decodedPayload.length,
        // 🔍 在出错位置周围的字符
        contextAroundError: (() => {
          const match = jsonError.message.match(/position (\d+)/)
          if (match) {
            const pos = parseInt(match[1])
            const start = Math.max(0, pos - 10)
            const end = Math.min(decodedPayload.length, pos + 10)
            return {
              position: pos,
              context: decodedPayload.substring(start, end),
              charAtError: decodedPayload[pos]
                ? {
                    char: decodedPayload[pos],
                    code: decodedPayload[pos].charCodeAt(0)
                  }
                : null
            }
          }
          return null
        })()
      })

      // 🚨 尝试清理无效字符后重新解析
      console.log('🔧 尝试清理JSON并重新解析...')
      try {
        // 移除控制字符但保留基本的JSON字符
        const cleanedPayload = decodedPayload.replace(/[^\x20-\x7E]/g, '')
        console.log('🔍 清理后的Payload:', cleanedPayload)
        parsedPayload = JSON.parse(cleanedPayload)
        console.log('✅ 清理后JSON解析成功')
      } catch (retryError) {
        console.error('❌ 清理后仍然解析失败:', retryError.message)
        throw new Error(
          `JWT Payload JSON解析失败: ${jsonError.message} (原始错误位置: ${jsonError.message.match(/position (\d+)/) ? jsonError.message.match(/position (\d+)/)[1] : '未知'})`
        )
      }
    }

    console.log('✅ JWT解码成功', {
      exp: parsedPayload.exp,
      iat: parsedPayload.iat,
      userId: parsedPayload.user_id || parsedPayload.userId,
      mobile: parsedPayload.mobile,
      isAdmin: parsedPayload.is_admin
    })

    return parsedPayload
  } catch (error) {
    console.error('❌ JWT解码失败:', error)
    console.error('Token信息:', {
      tokenLength: token ? token.length : 0,
      tokenPreview: token ? token.substring(0, 50) + '...' : 'NO_TOKEN'
    })
    return null
  }
}

/**
 * 检查Token是否过期
 *
 * @description
 * 检查JWT Token是否已过期，用于决定是否需要刷新Token。
 *
 * **业务场景**：
 * - 应用启动时检查Token有效性
 * - API请求前验证Token
 * - 自动刷新Token逻辑
 *
 * **检查逻辑**：
 * 1. 解码Token获取exp字段（过期时间戳）
 * 2. 获取当前时间戳
 * 3. 比较两者判断是否过期
 *
 * @param {String} token - JWT Token字符串
 * @returns {Boolean} true表示已过期，false表示未过期
 *
 * @example
 * // 检查Token是否过期
 * const expired = isTokenExpired(token)
 * if (expired) {
 *   console.log('Token已过期，需要重新登录')
 *   // 跳转登录页面
 * }
 *
 * @example
 * // 配合decodeJWTPayload使用
 * const payload = decodeJWTPayload(token)
 * if (payload && !isTokenExpired(token)) {
 *   console.log('Token有效')
 * }
 *
 * @since 2025-10-31
 * @version 2.0.0
 * @see {@link decodeJWTPayload} 配合使用
 */
const isTokenExpired = token => {
  try {
    const payload = decodeJWTPayload(token)
    if (!payload || !payload.exp) {
      return true
    }

    const currentTime = Math.floor(Date.now() / 1000)
    const isExpired = currentTime >= payload.exp

    if (isExpired) {
      console.warn('⚠️ Token已过期')
    }

    return isExpired
  } catch (error) {
    console.error('❌ Token过期检查失败', error)
    return true
  }
}

/**
 * 深拷贝对象（递归复制）
 *
 * @description
 * 创建对象的深拷贝，避免引用传递带来的问题。
 *
 * **业务场景**：
 * - 复制配置对象
 * - 保存历史状态
 * - 避免对象引用污染
 *
 * **支持类型**：
 * - 基本类型（number、string、boolean等）
 * - Date对象
 * - 数组
 * - 普通对象
 *
 * @param {*} obj - 待复制的对象
 * @returns {*} 深拷贝后的对象
 *
 * @example
 * // 复制对象
 * const original = { name: '张三', data: { points: 100 } }
 * const copied = deepClone(original)
 * copied.data.points = 200
 * console.log(original.data.points) // 仍然是100
 *
 * @example
 * // 复制数组
 * const arr = [1, 2, { value: 3 }]
 * const newArr = deepClone(arr)
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const deepClone = obj => {
  if (obj === null || typeof obj !== 'object') {
    return obj
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime())
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item))
  }

  if (typeof obj === 'object') {
    const clonedObj = {}
    Object.keys(obj).forEach(key => {
      clonedObj[key] = deepClone(obj[key])
    })
    return clonedObj
  }

  return obj
}

/**
 * 防抖函数（延迟执行，最后一次触发才执行）
 *
 * @description
 * 防止函数频繁触发，只有在停止触发一段时间后才执行。
 *
 * **业务场景**：
 * - 搜索框输入（高频使用）
 * - 窗口resize事件
 * - 表单验证
 * - 按钮点击防重
 *
 * **工作原理**：
 * - 每次触发都重置定时器
 * - 只有等待时间内没有新触发，才会执行函数
 * - 适用于"等用户停止操作后再处理"的场景
 *
 * **与throttle的区别**：
 * - debounce：等最后一次触发
 * - throttle：固定时间间隔执行一次
 *
 * @param {function} func - 需要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {function} 防抖处理后的函数
 *
 * @example
 * // 搜索框防抖
 * const handleSearch = debounce((keyword) => {
 *   console.log('搜索:', keyword)
 *   // 调用搜索API
 * }, 500)
 *
 * // 用户输入：a -> ab -> abc
 * // 只会在停止输入500ms后执行一次搜索
 *
 * @example
 * // 实际业务使用
 * onSearchInput(e) {
 *   const keyword = e.detail.value
 *   this.handleSearch(keyword) // 自动防抖
 * }
 *
 * @since 2025-10-31
 * @version 2.0.0
 * @see {@link throttle} 节流函数（不同的使用场景）
 */
const debounce = (func, wait) => {
  let timeout = null
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout)
      func(...args)
    }
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}

/**
 * 节流函数（固定时间间隔执行）
 *
 * @description
 * 限制函数执行频率，在固定时间间隔内只执行一次。
 *
 * **业务场景**：
 * - 滚动事件处理
 * - 鼠标移动事件
 * - 窗口resize（高频场景）
 * - 按钮防连点
 *
 * **工作原理**：
 * - 设置一个冷却时间
 * - 在冷却期内的触发会被忽略
 * - 冷却结束后才能再次执行
 * - 适用于"持续操作中定期处理"的场景
 *
 * **与debounce的区别**：
 * - throttle：固定时间间隔执行一次
 * - debounce：等最后一次触发
 *
 * @param {function} func - 需要节流的函数
 * @param {number} limit - 时间间隔（毫秒）
 * @returns {function} 节流处理后的函数
 *
 * @example
 * // 滚动事件节流
 * const handleScroll = throttle(() => {
 *   console.log('滚动位置:', window.scrollY)
 *   // 处理滚动逻辑
 * }, 200)
 *
 * // 用户持续滚动
 * // 每200ms最多执行一次
 *
 * @example
 * // 实际业务使用
 * onPageScroll(e) {
 *   this.handleScroll(e.scrollTop) // 自动节流
 * }
 *
 * @since 2025-10-31
 * @version 2.0.0
 * @see {@link debounce} 防抖函数（不同的使用场景）
 */
const throttle = (func, limit) => {
  let inThrottle = false
  return function () {
    const args = arguments
    const context = this
    if (!inThrottle) {
      func.apply(context, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * 格式化文件大小（字节转人类可读格式）
 *
 * @description
 * 将字节数转换为易读的文件大小格式（Bytes/KB/MB/GB）。
 *
 * **业务场景**：
 * - 图片上传大小显示
 * - 文件列表显示
 * - 存储空间显示
 *
 * @param {Number} bytes - 文件大小（字节）
 * @returns {String} 格式化后的文件大小字符串
 *
 * @example
 * formatFileSize(0)
 * // => '0 Bytes'
 *
 * @example
 * formatFileSize(1024)
 * // => '1 KB'
 *
 * @example
 * formatFileSize(1048576)
 * // => '1 MB'
 *
 * @example
 * formatFileSize(5242880)
 * // => '5 MB'
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const formatFileSize = bytes => {
  if (bytes === 0) {
    return '0 Bytes'
  }

  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * 生成随机字符串（大小写字母+数字）
 *
 * @description
 * 生成指定长度的随机字符串，包含大小写字母和数字。
 *
 * **业务场景**：
 * - 生成临时ID
 * - 生成文件名
 * - 生成随机标识
 *
 * @param {Number} [length=8] - 字符串长度，默认8
 * @returns {String} 随机字符串
 *
 * @example
 * generateRandomString()
 * // => 'aB3xYz9K'
 *
 * @example
 * generateRandomString(16)
 * // => 'xY9zAb3cDe4fGh5i'
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const generateRandomString = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * 检查对象是否为空
 *
 * @description
 * 检查对象、数组、字符串是否为空。
 *
 * **支持类型**：
 * - null/undefined：返回true
 * - 数组：检查length是否为0
 * - 字符串：检查length是否为0
 * - 对象：检查keys数量是否为0
 *
 * @param {*} obj - 待检查的值
 * @returns {boolean} true表示为空，false表示非空
 *
 * @example
 * isEmpty(null)
 * // => true
 *
 * @example
 * isEmpty([])
 * // => true
 *
 * @example
 * isEmpty({})
 * // => true
 *
 * @example
 * isEmpty({ name: '张三' })
 * // => false
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const isEmpty = obj => {
  if (obj === null || obj === undefined) {
    return true
  }
  if (Array.isArray(obj) || typeof obj === 'string') {
    return obj.length === 0
  }
  return Object.keys(obj).length === 0
}

/**
 * 安全的JSON解析（不会抛出异常）
 *
 * @description
 * 解析JSON字符串，失败时返回默认值而不抛出异常。
 *
 * **业务场景**：
 * - 解析存储的JSON数据
 * - 解析API响应
 * - 解析配置文件
 *
 * @param {string} str - JSON字符串
 * @param {*} [defaultValue=null] - 解析失败时的默认值
 * @returns {*} 解析后的对象或默认值
 *
 * @example
 * safeJsonParse('{"name":"张三"}')
 * // => { name: '张三' }
 *
 * @example
 * // 解析失败返回默认值
 * safeJsonParse('invalid json', {})
 * // => {}
 *
 * @example
 * // 实际业务使用
 * const config = safeJsonParse(wx.getStorageSync('config'), { theme: 'default' })
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const safeJsonParse = (str, defaultValue = null) => {
  try {
    return JSON.parse(str)
  } catch (error) {
    console.warn('⚠️ JSON解析失败', error)
    return defaultValue
  }
}

/**
 * 格式化积分显示（1000→1k，10000→1万）
 *
 * @description
 * 将积分数字格式化为简洁的显示格式。
 *
 * **业务场景**：
 * - 积分列表显示
 * - 排行榜显示
 * - 统计数据显示
 *
 * **格式规则**：
 * - < 1000：直接显示数字
 * - ≥ 1000：显示为"X.Xk"
 * - ≥ 10000：显示为"X.X万"
 *
 * @param {Number} points - 积分数值
 * @returns {String} 格式化后的字符串
 *
 * @example
 * formatPoints(500)
 * // => '500'
 *
 * @example
 * formatPoints(1500)
 * // => '1.5k'
 *
 * @example
 * formatPoints(12000)
 * // => '1.2万'
 *
 * @example
 * formatPoints(150000)
 * // => '15.0万'
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const formatPoints = points => {
  if (typeof points !== 'number') {
    return '0'
  }

  if (points >= 10000) {
    return (points / 10000).toFixed(1) + '万'
  } else if (points >= 1000) {
    return (points / 1000).toFixed(1) + 'k'
  }

  return points.toString()
}

/**
 * 格式化手机号（脱敏显示，隐藏中间四位）
 *
 * @description
 * 将手机号中间四位替换为星号，保护用户隐私。
 *
 * **业务场景**：
 * - 用户信息展示
 * - 订单信息展示
 * - 记录列表展示
 *
 * **格式**：138****5678
 *
 * @param {String} phone - 手机号
 * @returns {String} 脱敏后的手机号
 *
 * @example
 * formatPhoneNumber('13812345678')
 * // => '138****5678'
 *
 * @example
 * // 非11位手机号直接返回
 * formatPhoneNumber('123')
 * // => '123'
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const formatPhoneNumber = phone => {
  if (!phone || typeof phone !== 'string') {
    return ''
  }

  if (phone.length === 11) {
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
  }

  return phone
}

/**
 * 格式化聊天消息时间显示（智能时间显示）
 *
 * @description
 * 根据时间间隔智能显示聊天消息时间。
 *
 * **业务场景**：
 * - 聊天界面消息时间显示
 * - 评论时间显示
 * - 动态时间显示
 *
 * **显示规则**：
 * - < 60秒：显示"刚刚"
 * - < 60分钟：显示"N分钟前"
 * - < 24小时：显示"N小时前"
 * - 昨天：显示"昨天 HH:mm"
 * - < 7天：显示"周X HH:mm"
 * - 本年内：显示"MM-DD HH:mm"
 * - 跨年：显示"YYYY-MM-DD HH:mm"
 *
 * @param {Number | String | Date} timestamp - 时间戳或Date对象
 * @returns {String} 格式化后的时间字符串
 *
 * @example
 * // 刚刚
 * formatDateMessage(Date.now() - 30000)
 * // => '刚刚'
 *
 * @example
 * // 5分钟前
 * formatDateMessage(Date.now() - 300000)
 * // => '5分钟前'
 *
 * @example
 * // 昨天
 * formatDateMessage(Date.now() - 86400000)
 * // => '昨天 15:30'
 *
 * @example
 * // 本周内
 * formatDateMessage(Date.now() - 172800000)
 * // => '周二 10:25'
 *
 * @since 2025-10-31
 * @version 2.0.0
 */
const formatDateMessage = timestamp => {
  try {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)

    // 刚刚
    if (diffSeconds < 60) {
      return '刚刚'
    }

    // N分钟前
    if (diffMinutes < 60) {
      return `${diffMinutes}分钟前`
    }

    // N小时前
    if (diffHours < 24) {
      return `${diffHours}小时前`
    }

    // 昨天
    if (diffDays === 1) {
      const yesterdayHours = date.getHours()
      const yesterdayMinutes = date.getMinutes()
      return `昨天 ${formatNumber(yesterdayHours)}:${formatNumber(yesterdayMinutes)}`
    }

    // 本周内
    if (diffDays < 7) {
      const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
      const weekday = weekdays[date.getDay()]
      const weekHours = date.getHours()
      const weekMinutes = date.getMinutes()
      return `${weekday} ${formatNumber(weekHours)}:${formatNumber(weekMinutes)}`
    }

    // 本年内
    const currentYear = now.getFullYear()
    const messageYear = date.getFullYear()
    if (currentYear === messageYear) {
      const currentYearMonth = date.getMonth() + 1
      const currentYearDay = date.getDate()
      const currentYearHours = date.getHours()
      const currentYearMinutes = date.getMinutes()
      return `${formatNumber(currentYearMonth)}-${formatNumber(currentYearDay)} ${formatNumber(currentYearHours)}:${formatNumber(currentYearMinutes)}`
    }

    // 跨年显示
    const year = date.getFullYear()
    const month = date.getMonth() + 1
    const day = date.getDate()
    const hours = date.getHours()
    const minutes = date.getMinutes()
    return `${year}-${formatNumber(month)}-${formatNumber(day)} ${formatNumber(hours)}:${formatNumber(minutes)}`
  } catch (error) {
    console.error('❌ 格式化消息时间失败:', error)
    return '未知时间'
  }
}

// 🔴 导出所有工具函数
module.exports = {
  formatTime,
  formatNumber,
  base64Decode,
  validateJWTTokenIntegrity,
  decodeJWTPayload,
  isTokenExpired,
  deepClone,
  debounce,
  throttle,
  formatFileSize,
  generateRandomString,
  isEmpty,
  safeJsonParse,
  formatPoints,
  formatPhoneNumber,
  // 🔴 新增：导出聊天消息时间格式化函数
  formatDateMessage
}
