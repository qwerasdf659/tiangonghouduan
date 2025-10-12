/**
 * 自定义ESLint规则 - 禁止直接使用时间相关原生方法
 *
 * 目的：强制使用 BeijingTimeHelper 统一时间处理
 * 创建时间：2025年10月11日
 */

module.exports = {
  rules: {
    // 禁止直接使用 new Date()（除了在timeHelper.js中）
    'no-restricted-syntax': [
      'error',
      {
        selector: 'NewExpression[callee.name="Date"]',
        message:
          '❌ 禁止直接使用 new Date()，请使用 BeijingTimeHelper.createDatabaseTime() 或其他相应方法'
      },
      {
        selector: 'MemberExpression[object.name="Date"][property.name="now"]',
        message:
          '❌ 禁止直接使用 Date.now()，请使用 BeijingTimeHelper.timestamp() 或 generateIdTimestamp()'
      }
    ]
  },

  // 排除文件（允许在这些文件中使用原生方法）
  overrides: [
    {
      files: ['utils/timeHelper.js', 'utils/BeijingTimeHelper.js'],
      rules: {
        'no-restricted-syntax': 'off'
      }
    }
  ]
}
