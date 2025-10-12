/**
 * ESLint本地规则插件
 * 加载测试与实现一致性检查规则和时间处理规范规则
 */

const testImplementationConsistency = require('./test-implementation-consistency')
const timeHandlingRules = require('./time-handling-rules')

module.exports = {
  rules: {
    // 测试与实现一致性规则
    'no-business-semantic-mismatch': testImplementationConsistency['no-business-semantic-mismatch'],
    'no-test-lowering-standards': testImplementationConsistency['no-test-lowering-standards'],
    'api-response-consistency': testImplementationConsistency['api-response-consistency'],

    // 时间处理规范规则（2025年10月11日新增）
    'no-direct-date-now': timeHandlingRules['no-direct-date-now'],
    'no-direct-new-date': timeHandlingRules['no-direct-new-date']
  }
}
