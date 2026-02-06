/**
 * ESLint自定义规则 - 天工小程序项目
 * 
 * @description
 * 预防性编程规则，避免常见错误模式
 * 
 * @author 天工小程序团队
 * @since 2025-11-08
 * @version 1.0.0
 */

module.exports = {
  rules: {
    /**
     * 规则1：禁止在JWT相关函数中使用标准Base64模式
     * 
     * 背景：JWT必须使用Base64 URL编码（RFC 7519）
     * 问题：使用 /^[A-Za-z0-9+/]*$/ 会拒绝有效的JWT Token
     * 修复：必须使用 /^[A-Za-z0-9_-]*$/
     */
    'no-standard-base64-in-jwt': {
      meta: {
        type: 'problem',
        docs: {
          description: '禁止在JWT处理中使用标准Base64字符集验证',
          category: 'Possible Errors',
          recommended: true
        },
        messages: {
          standardBase64InJWT: '❌ JWT必须使用Base64 URL编码（- 和 _），不能使用标准Base64（+ 和 /）'
        }
      },
      create(context) {
        return {
          // 检查正则表达式字面量
          Literal(node) {
            if (node.regex) {
              const pattern = node.regex.pattern
              const filename = context.getFilename()
              
              // 如果文件名包含jwt/token且使用了标准Base64模式
              if ((filename.includes('jwt') || filename.includes('token') || filename.includes('auth')) &&
                  pattern.includes('[A-Za-z0-9+/]')) {
                context.report({
                  node,
                  messageId: 'standardBase64InJWT',
                  fix(fixer) {
                    // 自动修复：替换为Base64 URL模式
                    const fixedPattern = pattern.replace('[A-Za-z0-9+/]', '[A-Za-z0-9_-]')
                    return fixer.replaceText(node, `/${fixedPattern}/`)
                  }
                })
              }
            }
          }
        }
      }
    },

    /**
     * 规则2：要求关键函数必须有完整性验证
     * 
     * 背景：Token处理函数必须先验证完整性
     * 问题：直接解码未验证的Token可能导致错误
     * 修复：在decodeJWT前必须调用validateJWT
     */
    'require-token-validation': {
      meta: {
        type: 'problem',
        docs: {
          description: '要求Token解码前必须先验证完整性',
          category: 'Best Practices',
          recommended: true
        },
        messages: {
          missingValidation: '⚠️ Token解码前必须先调用 validateJWTTokenIntegrity 验证完整性'
        }
      },
      create(context) {
        return {
          CallExpression(node) {
            // 检测 decodeJWTPayload 调用
            if (node.callee.name === 'decodeJWTPayload' ||
                (node.callee.property && node.callee.property.name === 'decodeJWTPayload')) {
              
              // 检查前面是否有 validateJWTTokenIntegrity 调用
              const ancestors = context.getAncestors()
              let hasValidation = false
              
              for (const ancestor of ancestors) {
                if (ancestor.type === 'BlockStatement') {
                  const statements = ancestor.body
                  for (const stmt of statements) {
                    if (stmt.type === 'ExpressionStatement' &&
                        stmt.expression.type === 'CallExpression' &&
                        (stmt.expression.callee.name === 'validateJWTTokenIntegrity' ||
                         (stmt.expression.callee.property && 
                          stmt.expression.callee.property.name === 'validateJWTTokenIntegrity'))) {
                      hasValidation = true
                      break
                    }
                  }
                }
              }
              
              if (!hasValidation) {
                context.report({
                  node,
                  messageId: 'missingValidation'
                })
              }
            }
          }
        }
      }
    },

    /**
     * 规则3：禁止在工具函数中使用console.log
     * 
     * 背景：工具函数应该纯净，调试信息由调用方控制
     * 问题：过多console.log影响性能和日志可读性
     * 修复：使用统一的日志工具或完全移除
     */
    'no-console-in-utils': {
      meta: {
        type: 'suggestion',
        docs: {
          description: '工具函数中避免使用console.log',
          category: 'Best Practices',
          recommended: true
        },
        messages: {
          consoleInUtils: '⚠️ 工具函数中避免使用console.log，考虑使用统一的日志工具'
        }
      },
      create(context) {
        return {
          CallExpression(node) {
            const filename = context.getFilename()
            
            // 仅检查 utils/ 目录下的文件
            if (filename.includes('utils/') &&
                node.callee.type === 'MemberExpression' &&
                node.callee.object.name === 'console' &&
                node.callee.property.name === 'log') {
              context.report({
                node,
                messageId: 'consoleInUtils'
              })
            }
          }
        }
      }
    },

    /**
     * 规则4：要求Base64相关函数必须有错误处理
     * 
     * 背景：Base64解码可能失败（格式错误、字符集不匹配）
     * 问题：缺少错误处理导致程序崩溃
     * 修复：必须使用try-catch包裹
     */
    'require-base64-error-handling': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Base64操作必须有错误处理',
          category: 'Possible Errors',
          recommended: true
        },
        messages: {
          missingErrorHandling: '❌ Base64操作必须包含try-catch错误处理'
        }
      },
      create(context) {
        return {
          CallExpression(node) {
            const funcName = node.callee.name || 
                           (node.callee.property && node.callee.property.name)
            
            // 检测Base64相关函数调用
            if (funcName && 
                (funcName.includes('base64') || 
                 funcName.includes('Base64') ||
                 funcName === 'atob' || 
                 funcName === 'btoa')) {
              
              // 检查是否在try-catch块中
              const ancestors = context.getAncestors()
              const inTryCatch = ancestors.some(ancestor => 
                ancestor.type === 'TryStatement'
              )
              
              if (!inTryCatch) {
                context.report({
                  node,
                  messageId: 'missingErrorHandling'
                })
              }
            }
          }
        }
      }
    }
  }
}

/**
 * 使用说明
 * 
 * 1. 合并到主配置文件：
 * 
 * // .eslintrc.js
 * const customRules = require('./.eslintrc.custom-rules.js')
 * 
 * module.exports = {
 *   ...existingConfig,
 *   plugins: ['custom-rules'],
 *   rules: {
 *     ...existingConfig.rules,
 *     ...customRules.rules
 *   }
 * }
 * 
 * 2. 运行检查：
 * 
 * npx eslint utils/ --rulesdir .
 * 
 * 3. 自动修复：
 * 
 * npx eslint utils/ --rulesdir . --fix
 */

