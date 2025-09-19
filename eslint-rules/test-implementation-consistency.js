/**
 * ESLint自定义规则 - 测试与实现一致性检查
 * 防止"测试适配错误实现"问题
 */

module.exports = {
  // 规则: 检测业务语义不匹配
  'no-business-semantic-mismatch': {
    meta: {
      type: 'problem',
      docs: {
        description: '检测业务语义与技术实现不匹配的问题',
        category: 'Possible Errors',
        recommended: true
      },
      fixable: null,
      schema: []
    },

    create (context) {
      // 定义技术术语和业务术语的映射
      const businessTerminology = {
        // 奖品发放状态相关
        completed: {
          business: 'distributed',
          context: '奖品发放',
          message: '奖品发放应使用 "distributed" 而不是 "completed"'
        },
        finished: {
          business: 'completed',
          context: '任务完成',
          message: '任务完成应使用 "completed" 而不是 "finished"'
        },
        done: {
          business: 'finished',
          context: '流程结束',
          message: '流程结束应使用 "finished" 而不是 "done"'
        }
      }

      return {
        // 检查属性赋值
        Property (node) {
          if (node.key.name === 'status' && node.value.type === 'Literal') {
            const statusValue = node.value.value
            const terminology = businessTerminology[statusValue]

            if (terminology) {
              context.report({
                node: node.value,
                message: `${terminology.message}. 当前使用的是技术术语，建议使用业务术语 "${terminology.business}".`
              })
            }
          }
        },

        // 检查ENUM定义
        CallExpression (node) {
          if (node.callee.property && node.callee.property.name === 'ENUM') {
            node.arguments.forEach(arg => {
              if (arg.type === 'Literal' && businessTerminology[arg.value]) {
                const terminology = businessTerminology[arg.value]
                context.report({
                  node: arg,
                  message: `数据库枚举中发现技术术语 "${arg.value}"，在${terminology.context}场景下建议使用业务术语 "${terminology.business}".`
                })
              }
            })
          }
        }
      }
    }
  },

  // 规则: 检测测试标准降低
  'no-test-lowering-standards': {
    meta: {
      type: 'problem',
      docs: {
        description: '检测测试标准被不当降低的情况',
        category: 'Possible Errors',
        recommended: true
      },
      fixable: null,
      schema: []
    },

    create (context) {
      const filename = context.getFilename()

      // 只在测试文件中应用
      if (!filename.includes('test') && !filename.includes('spec')) {
        return {}
      }

      // 危险的测试模式
      const dangerousPatterns = [
        {
          pattern: /toContain\(['"]basic['"]\)/,
          message: '可能在降低测试标准：检查是否应该验证完整的策略名称'
        },
        {
          pattern: /toBe\(['"]completed['"]\)/,
          message: '可能在使用技术术语而非业务术语：检查业务需求中的正确状态名'
        },
        {
          pattern: /expect.*undefined.*toBe\(true\)/,
          message: '危险的测试：允许undefined值可能掩盖实现问题'
        }
      ]

      return {
        // 检查expect调用
        CallExpression (node) {
          if (
            node.callee.name === 'expect' ||
            (node.callee.property && node.callee.property.name === 'expect')
          ) {
            const sourceCode = context.getSourceCode()
            const expectText = sourceCode.getText(node)

            dangerousPatterns.forEach(({ pattern, message }) => {
              if (pattern.test(expectText)) {
                context.report({
                  node,
                  message: `${message}: ${expectText}`
                })
              }
            })
          }
        }
      }
    }
  },

  // 规则: 检测API响应格式不一致
  'api-response-consistency': {
    meta: {
      type: 'problem',
      docs: {
        description: '检测API响应格式不一致的问题',
        category: 'Possible Errors',
        recommended: true
      },
      fixable: null,
      schema: []
    },

    create (context) {
      const filename = context.getFilename()

      // 只在路由文件中应用
      if (!filename.includes('routes/')) {
        return {}
      }

      let hasSuccessFormat = false
      let hasCodeFormat = false

      return {
        // 检查响应对象
        ObjectExpression (node) {
          const properties = node.properties.map(prop => prop.key.name)

          if (properties.includes('success')) {
            hasSuccessFormat = true
          }
          if (properties.includes('code') && properties.includes('msg')) {
            hasCodeFormat = true
          }

          // 如果在同一个文件中混用两种格式，报告错误
          if (hasSuccessFormat && hasCodeFormat) {
            context.report({
              node,
              message:
                'API响应格式不一致：同一文件中同时使用了 {success, message} 和 {code, msg} 格式'
            })
          }
        }
      }
    }
  }
}
