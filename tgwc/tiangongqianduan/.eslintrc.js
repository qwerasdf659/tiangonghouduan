/**
 * ESLint配置文件 - 天工小程序项目
 *
 * 📋 核心检查规则:
 * - JSDoc注释完整性检查
 * - 函数参数和返回值注释
 * - 代码注释规范检查
 * - 变量遮蔽预防
 *
 * @version 2.0.0
 * @since 2025-10-20
 */

module.exports = {
  // 运行环境
  env: {
    browser: true, // 浏览器全局变量
    es6: true, // ES6语法支持
    node: true // Node.js全局变量
  },

  // 继承推荐规则
  extends: [
    'eslint:recommended' // ESLint推荐规则
  ],

  // 全局变量（微信小程序）
  globals: {
    wx: 'readonly', // 微信小程序全局对象
    App: 'readonly', // 小程序App构造函数
    Page: 'readonly', // 小程序Page构造函数
    Component: 'readonly', // 小程序Component构造函数
    getApp: 'readonly', // 获取App实例
    getCurrentPages: 'readonly', // 获取当前页面栈
    requirePlugin: 'readonly' // 引入插件
  },

  // 解析器选项
  parserOptions: {
    ecmaVersion: 2020, // ES2020语法
    sourceType: 'module' // 使用ES模块
  },

  // 插件配置
  plugins: [
    'jsdoc' // JSDoc注释检查插件
  ],

  // 规则配置
  rules: {
    // ==================== 📝 注释规范检查 ====================

    // ✅ 强制要求JSDoc注释（所有导出的函数和类）
    'require-jsdoc': [
      'warn',
      {
        require: {
          FunctionDeclaration: true, // 函数声明必须有JSDoc
          MethodDefinition: true, // 类方法必须有JSDoc
          ClassDeclaration: true, // 类声明必须有JSDoc
          ArrowFunctionExpression: false, // 箭头函数可选
          FunctionExpression: false // 函数表达式可选
        }
      }
    ],

    // ✅ 验证JSDoc注释格式
    'valid-jsdoc': [
      'warn',
      {
        requireReturn: true, // 要求@returns标签
        requireReturnType: true, // 要求返回值类型
        requireParamDescription: true, // 要求参数描述
        requireReturnDescription: true, // 要求返回值描述
        prefer: {
          // 推荐使用的标签
          arg: 'param',
          argument: 'param',
          return: 'returns'
        },
        preferType: {
          // 推荐的类型名称
          object: 'Object',
          string: 'String',
          number: 'Number',
          boolean: 'Boolean'
        }
      }
    ],

    // ==================== JSDoc插件规则 ====================

    // ✅ 检查@param标签
    'jsdoc/check-param-names': 'warn', // 参数名必须匹配

    // ✅ 检查标签名称
    'jsdoc/check-tag-names': 'warn', // 标签名必须有效

    // ✅ 检查类型定义
    'jsdoc/check-types': 'warn', // 类型定义必须有效

    // ✅ 要求示例代码
    'jsdoc/require-example': 'off', // 建议添加示例，但不强制

    // ✅ 要求参数描述
    'jsdoc/require-param-description': 'warn', // 参数必须有描述

    // ✅ 要求参数类型
    'jsdoc/require-param-type': 'warn', // 参数必须有类型

    // ✅ 要求返回值描述
    'jsdoc/require-returns-description': 'warn', // 返回值必须有描述

    // ✅ 要求返回值类型
    'jsdoc/require-returns-type': 'warn', // 返回值必须有类型

    // ==================== 🚨 变量遮蔽预防 ====================

    // ✅ 禁止变量遮蔽
    'no-shadow': [
      'error',
      {
        builtinGlobals: false, // 不检查内置全局变量
        hoist: 'all', // 检查所有作用域
        allow: [], // 不允许任何例外
        ignoreOnInitialization: false // 初始化时也检查
      }
    ],

    // ✅ 禁止重复导入
    'no-duplicate-imports': 'error',

    // ⚠️ 变量命名规范（警告级别）
    'id-match': [
      'warn',
      '^([a-z][a-zA-Z0-9]*|[A-Z][A-Z0-9_]*|_[a-z][a-zA-Z0-9]*|(api|local|temp|today|yesterday|history|processed|transformed|filtered|formatted|inner|outer|page|prop|response|request)[A-Z][a-zA-Z0-9]*)$',
      {
        properties: false, // 不检查属性名
        onlyDeclarations: true, // 只检查声明
        ignoreDestructuring: true // 忽略解构
      }
    ],

    // ==================== 💡 代码质量检查 ====================

    // ✅ 禁止使用var
    'no-var': 'error',

    // ✅ 强制块级作用域
    'block-scoped-var': 'error',

    // ✅ 禁止标签与变量同名
    'no-label-var': 'error',

    // ✅ 变量声明时必须初始化
    'init-declarations': 'error',

    // ✅ 禁止未使用的变量
    'no-unused-vars': [
      'warn',
      {
        vars: 'all', // 检查所有变量
        args: 'after-used', // 检查使用后的参数
        ignoreRestSiblings: true, // 忽略剩余参数
        argsIgnorePattern: '^_' // 忽略下划线开头的参数
      }
    ],

    // ✅ 禁止console（允许warn和error）
    'no-console': [
      'warn',
      {
        allow: ['warn', 'error', 'log'] // 允许这些方法（开发环境需要）
      }
    ],

    // ✅ 禁止debugger（生产环境）
    'no-debugger': 'warn',

    // ✅ 强制使用分号
    semi: ['error', 'never'], // 微信小程序推荐不使用分号

    // ✅ 强制使用单引号
    quotes: ['error', 'single', { avoidEscape: true }],

    // ✅ 缩进规则
    indent: ['error', 2], // 2空格缩进

    // ✅ 行尾逗号
    'comma-dangle': ['error', 'never'], // 不使用尾随逗号

    // ==================== 🔧 其他推荐规则 ====================

    // ✅ 强制使用===
    eqeqeq: ['error', 'always'],

    // ✅ 禁止多余的分号
    'no-extra-semi': 'error',

    // ✅ 禁止不必要的转义字符
    'no-useless-escape': 'warn',

    // ✅ 要求对象字面量简写语法
    'object-shorthand': ['warn', 'always'],

    // ✅ 箭头函数参数括号
    'arrow-parens': ['error', 'as-needed'],

    // ✅ 强制在代码块中使用一致的大括号风格
    'brace-style': ['error', '1tbs'],

    // ✅ 要求遵循大括号约定
    curly: ['error', 'all']
  },

  // ==================== 🔴 覆盖配置（特定文件） ====================
  overrides: [
    {
      // 测试文件配置
      files: ['**/*.test.js', '**/*.spec.js'],
      rules: {
        'no-console': 'off', // 测试文件允许console
        'require-jsdoc': 'off' // 测试文件可不需要JSDoc
      }
    },
    {
      // 配置文件
      files: ['*.config.js', '.eslintrc.js'],
      rules: {
        'require-jsdoc': 'off' // 配置文件可不需要JSDoc
      }
    }
  ]
}
