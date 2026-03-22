/**
 * Canonical Operation 映射校验（供 pre_start_check / final_quality_check 调用）
 * 数据源：services/IdempotencyService.js 导出的 CANONICAL_OPERATION_MAP
 */

'use strict'

const path = require('path')

/**
 * @returns {Promise<{ valid: boolean, errors?: Array, warnings?: string[], stats?: { mapped_operations: number } }>}
 */
async function verifyCanonicalOperations() {
  const IdempotencyService = require(path.resolve(__dirname, '../../services/IdempotencyService'))
  const map = IdempotencyService.CANONICAL_OPERATION_MAP

  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    return {
      valid: false,
      errors: [{ message: 'CANONICAL_OPERATION_MAP 未导出或不是对象' }],
      warnings: []
    }
  }

  const entries = Object.entries(map)
  const mapped_operations = entries.length

  if (mapped_operations < 1) {
    return {
      valid: false,
      errors: [{ message: 'CANONICAL_OPERATION_MAP 为空' }],
      warnings: [],
      stats: { mapped_operations: 0 }
    }
  }

  const bad = []
  for (const [apiPath, op] of entries) {
    if (typeof op !== 'string' || op.trim() === '') {
      bad.push(apiPath)
    }
  }
  if (bad.length > 0) {
    return {
      valid: false,
      errors: [{
        message: `以下路径缺少合法 canonical 字符串: ${bad.slice(0, 8).join(', ')}${bad.length > 8 ? '…' : ''}`
      }],
      warnings: []
    }
  }

  return {
    valid: true,
    stats: { mapped_operations },
    warnings: []
  }
}

module.exports = { verifyCanonicalOperations }
