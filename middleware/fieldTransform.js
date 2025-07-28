/**
 * Express字段转换中间件
 * 自动处理API请求和响应的字段转换
 * 创建时间：2025年07月28日
 */

const FieldTransformer = require('../utils/FieldTransformer')

// 创建全局转换器实例
const transformer = new FieldTransformer({
  logTransformations: process.env.NODE_ENV === 'development',
  strictMode: process.env.NODE_ENV === 'production'
})

/**
 * API响应字段转换中间件
 * 将数据库格式自动转换为前端格式
 */
function createResponseTransformMiddleware(options = {}) {
  const localTransformer = options.useGlobalTransformer !== false 
    ? transformer 
    : new FieldTransformer(options)
  
  return (req, res, next) => {
    // 保存原始的res.json方法
    const originalJson = res.json.bind(res)
    
    // 重写res.json方法
    res.json = function(data) {
      try {
        if (data && typeof data === 'object') {
          // 检查是否有data字段（标准ApiResponse格式）
          if (data.data !== undefined) {
            data.data = localTransformer.dbToFrontend(data.data)
          } else if (data.success !== undefined) {
            // 处理ApiResponse.success格式
            if (data.data !== undefined) {
              data.data = localTransformer.dbToFrontend(data.data)
            }
          } else {
            // 直接转换整个数据对象
            data = localTransformer.dbToFrontend(data)
          }
          
          if (options.logTransformations && process.env.NODE_ENV === 'development') {
            console.log('✅ API响应数据已自动转换为前端格式')
          }
        }
      } catch (error) {
        console.error('❌ 响应数据转换失败:', error)
        if (options.strictMode) {
          return res.status(500).json({
            success: false,
            code: 500,
            message: '数据转换失败',
            error: {
              code: 'FIELD_TRANSFORM_ERROR',
              message: error.message
            }
          })
        }
      }
      
      return originalJson(data)
    }
    
    next()
  }
}

/**
 * API请求字段转换中间件
 * 将前端格式自动转换为数据库格式
 */
function createRequestTransformMiddleware(options = {}) {
  const localTransformer = options.useGlobalTransformer !== false 
    ? transformer 
    : new FieldTransformer(options)
  
  return (req, res, next) => {
    try {
      // 转换请求体数据
      if (req.body && typeof req.body === 'object') {
        req.body = localTransformer.frontendToDb(req.body)
        
        if (options.logTransformations && process.env.NODE_ENV === 'development') {
          console.log('✅ API请求数据已自动转换为数据库格式')
        }
      }

      // 转换查询参数（可选）
      if (options.transformQuery && req.query) {
        req.query = localTransformer.frontendToDb(req.query)
      }

      // 转换路径参数（可选）
      if (options.transformParams && req.params) {
        req.params = localTransformer.frontendToDb(req.params)
      }
      
    } catch (error) {
      console.error('❌ 请求数据转换失败:', error)
      if (options.strictMode) {
        return res.status(400).json({
          success: false,
          code: 400,
          message: '请求数据格式错误',
          error: {
            code: 'REQUEST_TRANSFORM_ERROR',
            message: error.message
          }
        })
      }
    }
    
    next()
  }
}

/**
 * Sequelize查询结果转换中间件
 * 专门处理数据库查询结果的转换
 */
function transformSequelizeResult(result, options = {}) {
  if (!result) return result
  
  try {
    if (Array.isArray(result)) {
      return transformer.batchTransform(result, 'toFrontend')
    } else {
      return transformer.dbToFrontend(result)
    }
  } catch (error) {
    console.error('❌ Sequelize结果转换失败:', error)
    return result
  }
}

/**
 * 获取转换器统计信息中间件
 */
function getTransformStats(req, res, next) {
  if (req.path === '/api/v2/transform/stats' && req.method === 'GET') {
    const stats = transformer.getStats()
    return res.json({
      success: true,
      code: 200,
      message: '字段转换统计信息',
      data: {
        ...stats,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage()
      }
    })
  }
  next()
}

/**
 * 重置转换器统计信息中间件
 */
function resetTransformStats(req, res, next) {
  if (req.path === '/api/v2/transform/reset' && req.method === 'POST') {
    transformer.resetStats()
    return res.json({
      success: true,
      code: 200,
      message: '字段转换统计信息已重置',
      data: null
    })
  }
  next()
}

module.exports = {
  createResponseTransformMiddleware,
  createRequestTransformMiddleware,
  transformSequelizeResult,
  getTransformStats,
  resetTransformStats,
  transformer
} 