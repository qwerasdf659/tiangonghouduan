/**
 * Jest配置文件 - 天工小程序项目
 * 
 * @description
 * 微信小程序环境的Jest测试配置
 * 
 * @author 天工小程序团队
 * @since 2025-11-08
 * @version 1.0.0
 */

module.exports = {
  // 测试环境
  testEnvironment: 'node',
  
  // 测试文件匹配模式
  testMatch: [
    '**/test/**/*.spec.js',
    '**/test/**/*.test.js'
  ],
  
  // 覆盖率收集
  collectCoverageFrom: [
    'utils/**/*.js',
    'pages/**/*.js',
    '!utils/index.js', // 排除导出文件
    '!**/node_modules/**',
    '!**/test/**'
  ],
  
  // 覆盖率阈值（强制要求）
  coverageThreshold: {
    global: {
      branches: 60,
      functions: 70,
      lines: 70,
      statements: 70
    },
    // 关键工具函数要求更高覆盖率
    './utils/util.js': {
      branches: 80,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // 覆盖率报告格式
  coverageReporters: [
    'text',        // 终端文本报告
    'text-summary', // 摘要报告
    'html',        // HTML报告（详细）
    'lcov'         // lcov报告（CI集成）
  ],
  
  // 模块路径映射（适配微信小程序）
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^utils/(.*)$': '<rootDir>/utils/$1'
  },
  
  // 全局设置
  globals: {
    wx: {}, // 模拟微信API
    getApp: () => ({}), // 模拟getApp
    getCurrentPages: () => [] // 模拟getCurrentPages
  },
  
  // 忽略的路径
  testPathIgnorePatterns: [
    '/node_modules/',
    '/miniprogram_npm/'
  ],
  
  // 转换器（如果需要）
  transform: {},
  
  // 详细输出
  verbose: true,
  
  // 失败后继续（查看所有失败项）
  bail: false,
  
  // 测试超时（毫秒）
  testTimeout: 10000
}

