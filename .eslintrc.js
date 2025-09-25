// .eslintrc.js - 餐厅积分抽奖系统专用ESLint配置
// 创建时间: 2025年07月29日 20:43:18 UTC
// 目标: 解决3030个代码质量问题，防止let const等明显语法错误

module.exports = {
  // 环境配置
  env: {
    node: true,
    es2021: true,
    jest: true
  },

  // 继承标准配置
  extends: ['standard'],

  // 插件配置（本地规则通过npm scripts运行）
  // plugins: ['local-rules'], // 暂时禁用，通过质量检查脚本运行

  // 解析器选项
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module'
  },

  // 针对餐厅积分抽奖系统的特定规则
  rules: {
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

    // 🔷 代码风格规则
    'space-before-function-paren': ['error', 'always'],
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
        'no-console': 'warn', // 测试中允许console但建议使用专门的断言
        'max-len': ['warn', { code: 120 }], // 测试描述可以较长
        'no-magic-numbers': 'off' // 测试中允许魔术数字
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
        // 🔴 V4统一API响应格式规则 - 禁止直接使用res.json()
        'no-restricted-syntax': [
          'error',
          {
            selector: 'CallExpression[callee.type=\'MemberExpression\'][callee.object.name=\'res\'][callee.property.name=\'json\']',
            message: '❌ 禁止在路由中直接使用res.json()！请使用统一的res.apiSuccess()或res.apiError()方法以确保响应格式一致性。'
          },
          {
            selector: 'CallExpression[callee.type=\'MemberExpression\'][callee.object.type=\'CallExpression\'][callee.object.callee.property.name=\'status\'][callee.property.name=\'json\']',
            message: '❌ 禁止使用res.status().json()！请使用res.apiError(message, code, details, statusCode)方法。'
          }
        ]
      }
    }
  ],

  // 忽略特定文件
  ignorePatterns: ['node_modules/', 'logs/', '*.config.js', 'supervisor/', '.cursor/']
}
