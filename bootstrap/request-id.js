/**
 * 统一 request_id 获取逻辑（bootstrap 共享工具）
 *
 * 与 ApiResponse.middleware 兼容：
 * - /api/*：优先使用 ApiResponse.middleware 注入的 req.id
 * - 非 /api/*（如 /health、404 处理器）：使用请求头或本地生成
 *
 * @module bootstrap/request-id
 */

'use strict'

const crypto = require('crypto')

/**
 * 获取请求追踪ID
 * @param {Object} req - Express请求对象
 * @returns {string} 请求ID
 */
function getRequestId(req) {
  return (
    req.id ||
    req.headers['x-request-id'] ||
    req.headers['request-id'] ||
    `req_${crypto.randomUUID()}`
  )
}

module.exports = { getRequestId }
