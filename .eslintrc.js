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
    'no-new-func': 'error'
  },

  // 忽略特定文件
  ignorePatterns: ['node_modules/', 'logs/', '*.config.js', 'supervisor/', '.cursor/']
}
