/**
 * 字段转换配置文件
 * 餐厅积分抽奖系统 - Field Transform Configuration
 * 创建时间：2025年1月21日
 * 使用模型：Claude Sonnet 4
 */

module.exports = {
  development: {
    enableFieldTransform: true,
    enableDebugLog: true,
    enableCompatibilityMode: true,
    logTransformations: true,
    cacheTransformations: true,
    performanceMonitoring: true,
    slowTransformationThreshold: 10 // 开发环境设置更低的阈值来发现性能问题
  },
  
  test: {
    enableFieldTransform: true,
    enableDebugLog: false,
    enableCompatibilityMode: true,
    logTransformations: false,
    cacheTransformations: true,
    performanceMonitoring: false,
    slowTransformationThreshold: 50
  },
  
  production: {
    enableFieldTransform: true,
    enableDebugLog: false,
    enableCompatibilityMode: false,  // 生产环境完全切换，不需要兼容模式
    logTransformations: false,
    cacheTransformations: true,      // 生产环境启用缓存提升性能
    performanceMonitoring: true,     // 生产环境监控性能
    slowTransformationThreshold: 50 // 超过50ms记录日志
  }
}; 