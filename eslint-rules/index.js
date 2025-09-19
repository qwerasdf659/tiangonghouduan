/**
 * ESLint本地规则插件
 * 加载测试与实现一致性检查规则
 */

const testImplementationConsistency = require('./test-implementation-consistency')

module.exports = {
  rules: {
    'no-business-semantic-mismatch': testImplementationConsistency['no-business-semantic-mismatch'],
    'no-test-lowering-standards': testImplementationConsistency['no-test-lowering-standards'],
    'api-response-consistency': testImplementationConsistency['api-response-consistency']
  }
}
