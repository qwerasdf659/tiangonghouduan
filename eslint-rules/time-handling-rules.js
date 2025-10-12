/**
 * ESLint自定义规则 - 时间处理规范
 *
 * 目的：强制使用 BeijingTimeHelper 统一时间处理，防止时区不一致
 * 创建时间：2025年10月11日
 *
 * 规则说明：
 * 1. no-direct-date-now: 禁止直接使用 Date.now()
 * 2. no-direct-new-date: 禁止直接使用 new Date()（除特定文件）
 */

module.exports = {
  /**
   * 规则1：禁止直接使用 Date.now()
   * 应该使用 BeijingTimeHelper.timestamp() 或 generateIdTimestamp()
   */
  'no-direct-date-now': {
    meta: {
      type: 'problem',
      docs: {
        description: '禁止直接使用 Date.now()，应使用 BeijingTimeHelper.timestamp()',
        category: 'Best Practices',
        recommended: true
      },
      messages: {
        useBeijingTimeHelper:
          '❌ 禁止直接使用 Date.now()，请使用 BeijingTimeHelper.timestamp() 或 generateIdTimestamp()'
      },
      schema: []
    },
    create (context) {
      return {
        // 检测 Date.now() 调用
        CallExpression (node) {
          // 检查是否是 Date.now()
          if (
            node.callee.type === 'MemberExpression' &&
            node.callee.object.name === 'Date' &&
            node.callee.property.name === 'now'
          ) {
            // 获取文件名
            const filename = context.getFilename()

            // 排除特定文件
            const excludedFiles = ['timeHelper.js', 'BeijingTimeHelper.js']

            const isExcluded = excludedFiles.some(excluded => filename.includes(excluded))

            if (!isExcluded) {
              context.report({
                node,
                messageId: 'useBeijingTimeHelper'
              })
            }
          }
        }
      }
    }
  },

  /**
   * 规则2：禁止直接使用 new Date()
   * 应该使用 BeijingTimeHelper.createDatabaseTime()
   */
  'no-direct-new-date': {
    meta: {
      type: 'problem',
      docs: {
        description: '禁止直接使用 new Date()，应使用 BeijingTimeHelper.createDatabaseTime()',
        category: 'Best Practices',
        recommended: true
      },
      messages: {
        useBeijingTimeHelper:
          '❌ 禁止直接使用 new Date()，请使用 BeijingTimeHelper.createDatabaseTime() 或其他相应方法'
      },
      schema: [
        {
          type: 'object',
          properties: {
            allowWebSocket: {
              type: 'boolean',
              default: true
            }
          },
          additionalProperties: false
        }
      ]
    },
    create (context) {
      const options = context.options[0] || {}
      const allowWebSocket = options.allowWebSocket !== false

      return {
        // 检测 new Date() 调用
        NewExpression (node) {
          if (node.callee.name === 'Date' && node.arguments.length === 0) {
            const filename = context.getFilename()

            // 排除特定文件
            const excludedFiles = ['timeHelper.js', 'BeijingTimeHelper.js']

            const isExcluded = excludedFiles.some(excluded => filename.includes(excluded))

            if (isExcluded) {
              return
            }

            // 如果允许WebSocket中使用，检查是否在WebSocket相关代码中
            if (allowWebSocket && filename.includes('WebSocket')) {
              // 检查是否用于 .toISOString() 时间戳
              const parent = node.parent
              if (parent.type === 'MemberExpression' && parent.property.name === 'toISOString') {
                // 这是 new Date().toISOString() 用于WebSocket消息时间戳
                // 可以允许，但给出警告
                return
              }
            }

            context.report({
              node,
              messageId: 'useBeijingTimeHelper'
            })
          }
        }
      }
    }
  }
}
