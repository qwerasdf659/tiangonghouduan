'use strict'

/**
 * 用户分群条件构建器 — 字段白名单与运算符注册表
 *
 * 业务职责：
 * - 控制运营在条件构建器中可选择的字段（安全白名单）
 * - 定义每种运算符的求值逻辑
 * - 为前端 UI 提供字段/运算符元数据
 *
 * 安全策略：
 * - 仅暴露 User 模型中安全可公开的字段
 * - 不暴露 mobile、密码等敏感字段
 * - 每个字段限定可用的运算符类型
 */

/** 可选字段（从 User 模型中挑选，安全可暴露） */
const SEGMENT_FIELDS = {
  created_at: {
    label: '注册时间',
    type: 'date',
    operators: ['days_within', 'days_exceed']
  },
  last_active_at: {
    label: '最后活跃时间',
    type: 'date',
    operators: ['days_within', 'days_exceed']
  },
  history_total_points: {
    label: '历史总积分',
    type: 'number',
    operators: ['gte', 'lte', 'eq', 'between']
  },
  user_level: {
    label: '用户等级',
    type: 'enum',
    options: ['normal', 'vip', 'merchant'],
    operators: ['eq', 'neq', 'in']
  },
  consecutive_fail_count: {
    label: '连续未中奖次数',
    type: 'number',
    operators: ['gte', 'lte', 'eq']
  }
}

/** 运算符定义（含求值函数） */
const SEGMENT_OPERATORS = {
  days_within: {
    label: '距今 ≤ N 天',
    value_type: 'number',
    value_hint: '天数',
    evaluate: (fieldValue, value) => {
      if (!fieldValue) return false
      const daysDiff = (Date.now() - new Date(fieldValue).getTime()) / 86400000
      return daysDiff <= value
    }
  },
  days_exceed: {
    label: '距今 > N 天',
    value_type: 'number',
    value_hint: '天数',
    evaluate: (fieldValue, value) => {
      if (!fieldValue) return false
      const daysDiff = (Date.now() - new Date(fieldValue).getTime()) / 86400000
      return daysDiff > value
    }
  },
  gte: {
    label: '≥',
    value_type: 'number',
    evaluate: (fieldValue, value) => (fieldValue || 0) >= value
  },
  lte: {
    label: '≤',
    value_type: 'number',
    evaluate: (fieldValue, value) => (fieldValue || 0) <= value
  },
  eq: {
    label: '等于',
    value_type: 'auto',
    evaluate: (fieldValue, value) => fieldValue === value
  },
  neq: {
    label: '不等于',
    value_type: 'auto',
    evaluate: (fieldValue, value) => fieldValue !== value
  },
  in: {
    label: '属于',
    value_type: 'array',
    evaluate: (fieldValue, value) => Array.isArray(value) && value.includes(fieldValue)
  },
  between: {
    label: '在范围内',
    value_type: 'range',
    value_hint: '[最小值, 最大值]',
    evaluate: (fieldValue, value) => {
      const v = fieldValue || 0
      return Array.isArray(value) && v >= value[0] && v <= value[1]
    }
  }
}

/**
 * 获取前端可用的字段注册表（含运算符元数据）
 * @returns {Object} { fields, operators }
 */
function getFieldRegistry() {
  const fields = {}
  for (const [key, field] of Object.entries(SEGMENT_FIELDS)) {
    fields[key] = {
      label: field.label,
      type: field.type,
      operators: field.operators.map(opKey => ({
        key: opKey,
        ...SEGMENT_OPERATORS[opKey],
        evaluate: undefined
      })),
      ...(field.options ? { options: field.options } : {})
    }
  }
  return { fields, operators: Object.keys(SEGMENT_OPERATORS) }
}

/**
 * 组合注册表对象（供 SegmentRuleService / segment_rules 等引用 SEGMENT_FIELD_REGISTRY.fields / .operators）
 */
const SEGMENT_FIELD_REGISTRY = {
  fields: SEGMENT_FIELDS,
  operators: SEGMENT_OPERATORS
}

module.exports = {
  SEGMENT_FIELDS,
  SEGMENT_OPERATORS,
  SEGMENT_FIELD_REGISTRY,
  getFieldRegistry
}
