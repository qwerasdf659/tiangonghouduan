/*
 * .eslintrc.js - 餐厅积分抽奖系统专用ESLint配置
 * 创建时间: 2025年07月29日 20:43:18 UTC
 * 目标: 解决3030个代码质量问题，防止let const等明显语法错误
 */

module.exports = {
  // 环境配置
  env: {
    node: true,
    es2021: true,
    jest: true
  },

  // ignorePatterns 统一在文件底部维护，避免重复定义

  // 继承标准配置
  extends: ['standard'],

  /*
   * 插件配置（本地规则通过npm scripts运行）
   * plugins: ['local-rules'], // 暂时禁用，通过质量检查脚本运行
   */

  // 解析器选项
  parserOptions: {
    ecmaVersion: 2022, // 更新为ES2022以支持类静态字段语法
    sourceType: 'module'
  },

  // 针对餐厅积分抽奖系统的特定规则
  rules: {
    /*
     * 📝 注释规范 - 强制要求中文注释（2025年10月20日新增）
     * 规则：提供任何技术信息时必须添加详细的中文注释
     */
    'require-jsdoc': [
      'error',
      {
        require: {
          FunctionDeclaration: true, // 函数声明必须有注释
          MethodDefinition: true, // 类方法必须有注释
          ClassDeclaration: true, // 类声明必须有注释
          ArrowFunctionExpression: false, // 箭头函数可选（简单回调函数除外）
          FunctionExpression: true // 函数表达式必须有注释
        }
      }
    ],
    'valid-jsdoc': [
      'error',
      {
        requireReturn: true, // 要求@returns标记
        requireReturnType: true, // 要求返回类型
        requireParamType: true, // 要求参数类型
        requireParamDescription: true, // 要求参数描述（强制中文说明）
        requireReturnDescription: true, // 要求返回值描述（强制中文说明）
        prefer: {
          return: 'returns', // 统一使用@returns
          arg: 'param', // 统一使用@param
          argument: 'param'
        },
        preferType: {
          object: 'Object', // 统一类型大小写
          string: 'string',
          number: 'number',
          boolean: 'boolean'
        }
      }
    ],
    'multiline-comment-style': ['error', 'starred-block'], // 强制使用/** */格式的多行注释
    'spaced-comment': [
      'error',
      'always',
      {
        line: {
          markers: ['/', '🔴', '✅', '⚠️', '🔧', '📝'], // 允许特殊标记
          exceptions: ['-', '+', '*', '=']
        },
        block: {
          markers: ['*'], // 允许JSDoc注释
          balanced: true
        }
      }
    ],

    // 🔴 基础语法检查 - 防止let const这类严重错误
    'no-unexpected-multiline': 'error',
    'valid-typeof': 'error',
    'no-unreachable': 'error',
    'no-undef': 'error',
    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }
    ],

    // 🟡 Node.js/Express特定规则
    'no-console': 'off', // 允许console.log用于后端日志
    camelcase: 'off', // 允许下划线命名（数据库字段user_id等）

    // 🔵 Sequelize ORM特定规则
    'no-await-in-loop': 'warn', // 警告循环中的await（性能问题）
    'prefer-const': 'error', // 强制使用const（防止let const错误）

    // 🟢 Promise/异步处理规则
    'no-async-promise-executor': 'error',
    'require-atomic-updates': 'error',
    'no-promise-executor-return': 'error',

    /*
     * 🔷 代码风格规则
     * 'space-before-function-paren': ['error', 'always'], // 禁用：与 Prettier 默认格式化行为冲突
     */
    'space-before-function-paren': 'off',
    quotes: ['error', 'single'],
    semi: ['error', 'never'],
    indent: ['error', 2],
    'no-trailing-spaces': 'error',
    'eol-last': 'error',

    // 🔒 安全相关规则
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',

    // 🚨 测试与实现一致性规则 - 防止"测试适配错误实现"
    'no-business-semantic-mismatch': 'off', // 自定义规则，检测业务语义不匹配
    'no-test-lowering-standards': 'off' // 自定义规则，检测测试标准降低
  },

  // 🎯 自定义规则配置
  overrides: [
    {
      // 测试文件特殊规则
      files: ['tests/**/*.js', '**/*.test.js', '**/*.spec.js'],
      rules: {
        // 测试文件中禁止的模式
        'no-console': 'off', // 测试中允许console用于调试
        'max-len': 'off', // 测试描述可以较长
        'no-magic-numbers': 'off', // 测试中允许魔术数字
        'no-await-in-loop': 'off', // 测试中允许循环中的await
        'no-promise-executor-return': 'off', // 测试中允许Promise executor返回值
        // 🔴 测试代码不强制每个 helper/回调都写 JSDoc（避免阻塞业务开发）
        'require-jsdoc': 'off',
        'valid-jsdoc': 'off',
        // 🔴 测试文件允许局部 unused（不影响业务语义验证）
        'no-unused-vars': 'warn',
        // 🔴 测试文件允许在 beforeAll/afterAll 等场景赋值
        'require-atomic-updates': 'off'
      }
    },
    {
      // 模型文件特殊规则
      files: ['models/**/*.js'],
      rules: {
        camelcase: 'off', // 模型字段允许下划线
        'quote-props': ['error', 'consistent'] // 属性引号一致性
      }
    },
    {
      // 路由文件特殊规则
      files: ['routes/**/*.js'],
      rules: {
        'no-console': 'off', // 路由中允许console用于日志
        'consistent-return': 'error', // 强制一致的返回格式
        // 🔴 V4统一API响应格式规则 - 禁止直接使用res.json()和ApiResponse.send()
        'no-restricted-syntax': [
          'error',
          {
            selector:
              'CallExpression[callee.type=\'MemberExpression\'][callee.object.name=\'res\'][callee.property.name=\'json\']',
            message:
              '❌ 禁止在路由中直接使用res.json()！请使用统一的res.apiSuccess()或res.apiError()方法以确保响应格式一致性。'
          },
          {
            selector:
              'CallExpression[callee.type=\'MemberExpression\'][callee.object.type=\'CallExpression\'][callee.object.callee.property.name=\'status\'][callee.property.name=\'json\']',
            message:
              '❌ 禁止使用res.status().json()！请使用res.apiError(message, code, details, statusCode)方法。'
          },
          {
            selector:
              'CallExpression[callee.object.name=\'ApiResponse\'][callee.property.name=\'send\']',
            message:
              '❌ 禁止使用ApiResponse.send()！请使用res.apiSuccess()等中间件方法以保持代码简洁和一致性。'
          }
        ]
      }
    },
    {
      /**
       * 🔒 服务文件事务边界规则（2026-01-05 事务边界治理）
       *
       * 目的：防止"忘传 transaction"导致脱离事务边界
       * 检查方式：警告直接调用 AssetService 写操作，提醒传递 transaction
       */
      files: ['services/**/*.js'],
      excludedFiles: ['services/AssetService.js', 'services/IdempotencyService.js'],
      rules: {
        'no-restricted-syntax': [
          'warn',
          {
            selector:
              'CallExpression[callee.object.name=\'AssetService\'][callee.property.name=\'changeBalance\']',
            message:
              '⚠️ [事务边界] AssetService.changeBalance() 必须传递 { transaction }！' +
              '请确保调用时传入事务对象，避免脱离事务边界。'
          },
          {
            selector:
              'CallExpression[callee.object.name=\'AssetService\'][callee.property.name=\'freeze\']',
            message:
              '⚠️ [事务边界] AssetService.freeze() 必须传递 { transaction }！' +
              '请确保调用时传入事务对象，避免脱离事务边界。'
          },
          {
            selector:
              'CallExpression[callee.object.name=\'AssetService\'][callee.property.name=\'unfreeze\']',
            message:
              '⚠️ [事务边界] AssetService.unfreeze() 必须传递 { transaction }！' +
              '请确保调用时传入事务对象，避免脱离事务边界。'
          },
          {
            selector:
              'CallExpression[callee.object.name=\'AssetService\'][callee.property.name=\'settleFromFrozen\']',
            message:
              '⚠️ [事务边界] AssetService.settleFromFrozen() 必须传递 { transaction }！' +
              '请确保调用时传入事务对象，避免脱离事务边界。'
          },
          {
            selector:
              'CallExpression[callee.object.name=\'AssetService\'][callee.property.name=\'transferItem\']',
            message:
              '⚠️ [事务边界] AssetService.transferItem() 必须传递 { transaction }！' +
              '请确保调用时传入事务对象，避免脱离事务边界。'
          }
        ]
      }
    }
  ],

  // 忽略特定文件
  /**
   * 忽略目录（ESLint Ignore Patterns）
   *
   * 说明：
   * - `migrations/**` 为 Sequelize 迁移脚本，生成/变更频繁；迁移质量由 `npm run migration:verify` + DB迁移执行保障
   * - 避免迁移脚本的注释/风格差异阻塞核心业务代码的质量检查
   */
  ignorePatterns: [
    'node_modules/',
    'logs/',
    '*.config.js',
    'supervisor/',
    '.cursor/',
    'migrations/**',
    /*
     * 🔴 项目脚本工具（运维/诊断/迁移工具脚本）：不纳入主工程 ESLint 阻塞检查
     * 说明：脚本质量由其独立执行路径（npm scripts）与运行结果保障，避免注释规范导致主链路阻塞
     */
    'scripts/**',
    // 🔴 前端静态资源（不属于后端数据库项目代码质量范围）
    'public/**',
    // 🔴 根目录下的临时手工测试脚本（不纳入主工程 ESLint 阻塞检查）
    'test-*.js',
    'test_*.js'
  ]
}
