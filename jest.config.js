/**
 * Jest测试框架配置
 * 配置测试环境、路径、覆盖率、Mock等
 * 创建时间：2025年01月21日
 */

module.exports = {
  // 测试环境
  testEnvironment: 'node',

  // 测试文件匹配模式
  testMatch: ['**/tests/**/*.test.js', '**/tests/**/*.spec.js'],

  // 忽略的测试文件
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/',
    '/tests/helpers/',
    // 🔧 tests/shared 下为测试工具/套件实现（可被其他测试 require），不是可执行用例；避免 Jest 因“空测试文件”直接 fail
    '/tests/shared/',
    '/tests/backup-20251112/', // 忽略备份目录,避免测试重复执行
    '/tests/temp/', // 忽略临时目录
    '/tests/manual/', // 忽略手动测试目录
    '/tests/stress/' // 压力测试单独运行（npm run test:stress），避免默认测试超时
  ],

  // 设置文件
  // - jest.setup.js：负责全局测试数据初始化（global.testData），作为所有测试用例的单一真相源
  // - tests/helpers/test-setup.js：测试工具与通用断言（不含mock数据）
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js', '<rootDir>/tests/helpers/test-setup.js'],

  // 模块路径映射
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@models/(.*)$': '<rootDir>/models/$1',
    '^@services/(.*)$': '<rootDir>/services/$1',
    '^@utils/(.*)$': '<rootDir>/utils/$1',
    '^@routes/(.*)$': '<rootDir>/routes/$1'
  },

  // 收集覆盖率的文件
  collectCoverageFrom: [
    'services/**/*.js',
    'models/**/*.js',
    'utils/**/*.js',
    'routes/**/*.js',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/coverage/**',
    '!**/migrations/**',
    '!**/seeders/**'
  ],

  // 覆盖率阈值
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70
    },
    './services/': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  // 覆盖率报告格式
  coverageReporters: ['text', 'text-summary', 'html', 'lcov', 'json'],

  // 覆盖率输出目录
  coverageDirectory: 'coverage',

  // 测试超时时间（毫秒）
  testTimeout: 30000,

  // 并发测试数量
  maxConcurrency: 5,

  // 详细输出
  verbose: true,

  // 静默模式（只显示错误）
  silent: false,

  // 清除Mock
  clearMocks: true,
  restoreMocks: true,

  // 模块文件扩展名
  moduleFileExtensions: ['js', 'json', 'node'],

  // 转换忽略模式
  transformIgnorePatterns: ['/node_modules/(?!(uuid)/)'],

  // 全局设置
  globals: {
    NODE_ENV: 'test'
  },

  // 测试结果处理器
  testResultsProcessor: undefined,

  // 错误时退出
  bail: false,

  // 强制退出
  forceExit: true,

  // 检测打开的句柄
  detectOpenHandles: true

  // 🚨 测试质量检查配置 - 通过npm scripts运行
  // reporters配置在npm scripts中通过单独的质量检查命令运行
}
