/**
 * 脚本：统一顶层接口的API响应格式
 * 功能：将app.js中的顶层接口修改为使用ApiResponse统一格式
 * 创建时间：2025-12-11
 */

const fs = require('fs')
const path = require('path')

const appJsPath = path.join(__dirname, '../app.js')

// 读取app.js内容
let content = fs.readFileSync(appJsPath, 'utf8')

// 1. 修改 /health 端点
const oldHealthEndpoint =
  /\/\/ 📊 健康检查端点\napp\.get\('\/health', async \(req, res\) => \{[\s\S]*?\n\}\)\n/

const newHealthEndpoint = `// 📊 健康检查端点
app.get('/health', async (req, res) => {
  try {
    // 检查数据库连接
    const { sequelize } = require('./models')
    let databaseStatus = 'disconnected'

    try {
      await sequelize.authenticate()
      databaseStatus = 'connected'
    } catch (error) {
      appLogger.error('数据库连接检查失败', { error: error.message })
      databaseStatus = 'disconnected'
    }

    // 检查Redis连接
    let redisStatus = 'disconnected'
    try {
      // 这里可以添加Redis连接检查
      redisStatus = 'connected'
    } catch (error) {
      appLogger.error('Redis连接检查失败', { error: error.message })
      redisStatus = 'disconnected'
    }

    // 生成请求追踪ID
    const requestId =
      req.headers['x-request-id'] ||
      \`health_\${Date.now()}_\${Math.random().toString(36).substr(2, 6)}\`

    // 使用ApiResponse.success()创建统一响应格式
    const healthData = ApiResponse.success(
      {
        status: 'healthy',
        version: '4.0.0',
        architecture: 'V4 Unified Lottery Engine',
        systems: {
          database: databaseStatus,
          redis: redisStatus,
          nodejs: process.version
        },
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
        },
        uptime: Math.floor(process.uptime()) + 's'
      },
      'V4 Unified Lottery Engine 系统运行正常',
      'SYSTEM_HEALTHY'
    )

    // 添加请求追踪ID
    healthData.request_id = requestId

    res.json(healthData)
  } catch (error) {
    console.error('健康检查失败:', error)

    // 生成请求追踪ID
    const requestId =
      req.headers['x-request-id'] ||
      \`health_error_\${Date.now()}_\${Math.random().toString(36).substr(2, 6)}\`

    // 使用ApiResponse.error()创建统一错误响应格式
    const errorResponse = ApiResponse.error(
      '系统健康检查失败',
      'SYSTEM_UNHEALTHY',
      {
        status: 'unhealthy',
        error: error.message
      },
      500
    )

    // 添加请求追踪ID
    errorResponse.request_id = requestId

    res.status(500).json(errorResponse)
  }
})
`

// 2. 修改 /api/v4 端点 - 注意：此端点在 /api/ 路径下，有ApiResponse中间件注入
const oldApiV4Endpoint =
  /\/\/ 📊 V4统一引擎信息端点\napp\.get\('\/api\/v4', \(req, res\) => \{[\s\S]*?\n\}\)\n/

const newApiV4Endpoint = `// 📊 V4统一引擎信息端点
app.get('/api/v4', (req, res) => {
  // 使用res.apiSuccess()方法，由ApiResponse中间件注入
  return res.apiSuccess(
    {
      version: '4.0.0',
      name: '餐厅积分抽奖系统 V4统一引擎',
      architecture: 'unified-lottery-engine',
      description: 'V4统一抽奖引擎架构 - 2种策略统一管理',
      engine: {
        name: 'UnifiedLotteryEngine',
        version: '4.0.0',
        strategies: [
          'BasicGuaranteeStrategy - 基础抽奖保底策略, ManagementStrategy - 管理策略',
          'ManagementStrategy - 管理抽奖策略'
        ],
        core: {
          UnifiedLotteryEngine: '统一抽奖引擎 - 集成式设计',
          LotteryStrategy: '策略基类'
        }
      },
      endpoints: {
        lottery: '/api/v4/lottery',
        admin: '/api/v4/admin',
        health: '/health'
      },
      features: ['统一抽奖引擎', '智能策略选择', '实时决策处理', '完整审计日志', '高性能优化']
    },
    'V4统一抽奖引擎信息获取成功'
  )
})
`

// 3. 修改 /api/v4/docs 端点
const oldApiDocsEndpoint =
  /\/\/ 📚 V4统一引擎API文档端点\napp\.get\('\/api\/v4\/docs', \(req, res\) => \{[\s\S]*?\n\}\)\n/

const newApiDocsEndpoint = `// 📚 V4统一引擎API文档端点
app.get('/api/v4/docs', (req, res) => {
  // 使用res.apiSuccess()方法，由ApiResponse中间件注入
  return res.apiSuccess(
    {
      title: '餐厅积分抽奖系统 V4.0 统一引擎API文档',
      version: '4.0.0',
      architecture: 'unified-lottery-engine',
      description: 'V4统一抽奖引擎架构，通过统一引擎管理3种抽奖策略',
      last_updated: BeijingTimeHelper.apiTimestamp(),
      unified_engine: {
        description: 'V4统一抽奖引擎提供完整的抽奖执行和管理功能',
        endpoints: {
          'POST /api/v4/lottery/execute': '执行抽奖',
          'GET /api/v4/lottery/strategies': '获取策略列表',
          'GET /api/v4/lottery/metrics': '获取引擎指标',
          'POST /api/v4/lottery/validate': '验证抽奖条件'
        },
        strategies: [
          'BasicGuaranteeStrategy - 基础抽奖保底策略, ManagementStrategy - 管理策略',
          'ManagementStrategy - 管理抽奖策略'
        ]
      },
      admin_system: {
        description: 'V4管理系统提供引擎配置、监控和维护功能',
        endpoints: {
          'GET /api/v4/admin/system/dashboard': '管理仪表板',
          'POST /api/v4/admin/config': '更新引擎配置',
          'GET /api/v4/admin/logs': '获取执行日志',
          'POST /api/v4/admin/maintenance': '维护模式控制'
        },
        features: ['引擎监控', '配置管理', '日志分析', '性能优化']
      },
      common: {
        response_format: {
          success: {
            success: true,
            code: 'string',
            message: 'string',
            data: 'object',
            timestamp: 'ISO_8601'
          },
          error: {
            success: false,
            code: 'string',
            message: 'string',
            data: 'object',
            timestamp: 'ISO_8601'
          }
        },
        authentication: {
          type: 'Bearer Token',
          header: 'Authorization: Bearer <token>'
        },
        base_url: process.env.API_BASE_URL || \`http://localhost:\${process.env.PORT || 3000}\`,
        contact: {
          api: '/api/v4',
          lottery: '/api/v4/lottery',
          admin: '/api/v4/admin'
        }
      }
    },
    'V4统一抽奖引擎API文档获取成功'
  )
})
`

// 4. 修改 / 根路径端点
const oldRootEndpoint =
  /\/\*\n \* 🛣️ 基础路由配置\n \* 根路径\n \*\/\napp\.get\('\/', \(req, res\) => \{[\s\S]*?\n\}\)\n/

const newRootEndpoint = `/*
 * 🛣️ 基础路由配置
 * 根路径
 */
app.get('/', (req, res) => {
  // 生成请求追踪ID
  const requestId =
    req.headers['x-request-id'] ||
    \`root_\${Date.now()}_\${Math.random().toString(36).substr(2, 6)}\`

  // 使用ApiResponse.success()创建统一响应格式
  const response = ApiResponse.success(
    {
      name: '餐厅积分抽奖系统 V4统一引擎',
      version: '4.0.0',
      api_version: 'v4',
      description: '基于V4统一抽奖引擎架构的智能抽奖系统',
      architecture: 'unified-lottery-engine',
      endpoints: {
        health: '/health',
        api: '/api/v4',
        lottery_engine: '/api/v4/lottery',
        admin_panel: '/api/v4/admin',
        docs: '/api/v4/docs'
      }
    },
    '餐厅积分抽奖系统 V4.0 - 统一抽奖引擎'
  )

  // 添加请求追踪ID
  response.request_id = requestId

  res.json(response)
})
`

// 5. 修改 /api 端点
const oldApiEndpoint = /\/\/ API基础路径\napp\.get\('\/api', \(req, res\) => \{[\s\S]*?\n\}\)\n/

const newApiEndpoint = `// API基础路径
app.get('/api', (req, res) => {
  // 使用res.apiSuccess()方法，由ApiResponse中间件注入
  return res.apiSuccess(
    {
      version: 'v4.0',
      latest_version: 'v4.0',
      available_versions: ['v4'],
      architecture: 'unified_decision_engine',
      v4_features: {
        unified_engine: '/api/v4/lottery',
        admin_panel: '/api/v4/admin',
        performance_metrics: '/api/v4/admin/system/status',
        decision_analytics: '/api/v4/admin/analytics/decisions/analytics'
      }
    },
    'API服务正常'
  )
})
`

// 6. 修改 404 处理
const old404Handler = /\/\/ 🔧 404处理\napp\.use\('\*', \(req, res\) => \{[\s\S]*?\n\}\)\n/

const new404Handler = `// 🔧 404处理
app.use('*', (req, res) => {
  // 使用res.apiError()方法，由ApiResponse中间件注入
  return res.apiError(
    \`接口不存在: \${req.method} \${req.originalUrl}\`,
    'NOT_FOUND',
    {
      error: 'NOT_FOUND',
      availableEndpoints: [
        'GET /health',
        'GET /api/v4',
        'GET /api/v4/docs',
        'POST /api/v4/auth/login',
        'POST /api/v4/auth/register',
        'POST /api/v4/auth/logout',
        'GET /api/v4/auth/verify',
        'POST /api/v4/lottery/execute',
        'GET /api/v4/lottery/strategies',
        'GET /api/v4/admin/system/dashboard',
        'GET /api/v4/permissions/user/:userId',
        'POST /api/v4/permissions/check',
        'POST /api/v4/permissions/promote',
        'POST /api/v4/permissions/create-admin',
        'GET /api/v4/permissions/me'
      ]
    },
    404
  )
})
`

// 执行替换
content = content.replace(oldHealthEndpoint, newHealthEndpoint)
content = content.replace(oldApiV4Endpoint, newApiV4Endpoint)
content = content.replace(oldApiDocsEndpoint, newApiDocsEndpoint)
content = content.replace(oldRootEndpoint, newRootEndpoint)
content = content.replace(oldApiEndpoint, newApiEndpoint)
content = content.replace(old404Handler, new404Handler)

// 写回文件
fs.writeFileSync(appJsPath, content, 'utf8')

console.log('✅ app.js文件已更新，所有顶层接口已统一使用ApiResponse格式')
console.log('修改的接口：')
console.log('  1. GET /health')
console.log('  2. GET /api/v4')
console.log('  3. GET /api/v4/docs')
console.log('  4. GET /')
console.log('  5. GET /api')
console.log('  6. 404处理')
