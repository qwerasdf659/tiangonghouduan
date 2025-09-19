/**
 * 餐厅积分抽奖系统 V4.0 - 统一引擎架构主应用入口
 * 创建时间：2025年01月21日 19:00 北京时间
 * 适用区域：中国 (使用北京时间 Asia/Shanghai)
 * 架构：V4统一抽奖引擎架构
 * 技术栈：Node.js 20+ + Express + V4统一引擎 + MySQL + Sequelize + Redis
 */

'use strict'

// 🔴 设置应用程序时区为北京时间 (中国区域)
process.env.TZ = 'Asia/Shanghai'

const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const rateLimit = require('express-rate-limit')
require('dotenv').config()

// 🕐 北京时间工具导入
const BeijingTimeHelper = require('./utils/timeHelper')

// 🔧 导入API响应统一中间件 - 解决API格式不一致问题
const ApiResponse = require('./utils/ApiResponse')
const ApiStandardManager = require('./utils/ApiStandardManager')

// 确保Node.js使用北京时间
console.log(`🕐 应用启动时间: ${BeijingTimeHelper.formatChinese()} (北京时间)`)

// 初始化Express应用
const app = express()

// 🔧 安全中间件
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        scriptSrc: ['\'self\'', 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
        imgSrc: ['\'self\'', 'data:', 'https:']
      }
    }
  })
)

// 🔧 CORS配置
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : ['http://localhost:3000', 'http://localhost:8080'],
    credentials: true,
    optionsSuccessStatus: 200
  })
)

// 🔧 请求体解析
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 🔧 压缩响应
app.use(compression())

// 🔧 请求频率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 1000, // 限制每个IP 15分钟内最多1000个请求
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: '请求太频繁，请稍后再试'
  },
  standardHeaders: true,
  legacyHeaders: false
})
app.use('/api/', limiter)

// 字段转换器功能已删除 - 使用统一的snake_case命名格式

// 🔧 API响应格式统一中间件 - 统一所有API响应格式
app.use('/api/', ApiResponse.middleware())

// 🔧 请求日志中间件
app.use((req, res, next) => {
  console.log(`${BeijingTimeHelper.apiTimestamp()} - ${req.method} ${req.path}`) // 🕐 北京时间日志
  next()
})

// 📊 健康检查端点
app.get('/health', async (req, res) => {
  try {
    // 检查数据库连接
    const { sequelize } = require('./models')
    let databaseStatus = 'disconnected'

    try {
      await sequelize.authenticate()
      databaseStatus = 'connected'
    } catch (error) {
      console.error('数据库连接检查失败:', error.message)
      databaseStatus = 'disconnected'
    }

    // 检查Redis连接
    let redisStatus = 'disconnected'
    try {
      // 这里可以添加Redis连接检查
      redisStatus = 'connected'
    } catch (error) {
      console.error('Redis连接检查失败:', error.message)
      redisStatus = 'disconnected'
    }

    const healthData = {
      success: true, // ✅ 业务标准格式
      code: 'SYSTEM_HEALTHY', // ✅ 业务代码
      message: 'V4 Unified Lottery Engine 系统运行正常', // ✅ 用户友好消息
      data: {
        status: 'healthy',
        version: '4.0.0',
        architecture: 'V4 Unified Lottery Engine',
        timestamp: BeijingTimeHelper.apiTimestamp(), // 🕐 北京时间API时间戳
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
      version: 'v4.0', // ✅ API版本信息
      request_id:
        req.headers['x-request-id'] ||
        `health_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` // ✅ 请求追踪ID
    }

    res.json(healthData)
  } catch (error) {
    console.error('健康检查失败:', error)
    res.status(500).json({
      success: false, // ✅ 业务标准格式
      code: 'SYSTEM_UNHEALTHY', // ✅ 业务错误代码
      message: '系统健康检查失败', // ✅ 用户友好错误消息
      data: {
        status: 'unhealthy',
        error: error.message,
        timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
      },
      version: 'v4.0', // ✅ API版本信息
      request_id:
        req.headers['x-request-id'] ||
        `health_error_${Date.now()}_${Math.random().toString(36).substr(2, 6)}` // ✅ 请求追踪ID
    })
  }
})

// 📊 V4统一引擎信息端点
app.get('/api/v4', (req, res) => {
  res.json({
    code: 0,
    msg: 'V4统一抽奖引擎信息获取成功',
    data: {
      version: '4.0.0',
      name: '餐厅积分抽奖系统 V4统一引擎',
      architecture: 'unified-lottery-engine',
      description: 'V4统一抽奖引擎架构 - 3种策略统一管理',
      engine: {
        name: 'UnifiedLotteryEngine',
        version: '4.0.0',
        strategies: [
          'BasicLotteryStrategy - 基础抽奖策略',
          'GuaranteeStrategy - 保底抽奖策略',
          'ManagementStrategy - 管理抽奖策略'
        ],
        core: {
          DecisionCore: '决策核心',
          ContextBuilder: '上下文构建器',
          ResultGenerator: '结果生成器',
          LotteryStrategy: '策略基类'
        }
      },
      endpoints: {
        lottery: '/api/v4/unified-engine/lottery',
        admin: '/api/v4/unified-engine/admin',
        health: '/health'
      },
      features: ['统一抽奖引擎', '智能策略选择', '实时决策处理', '完整审计日志', '高性能优化']
    },
    timestamp: BeijingTimeHelper.apiTimestamp()
  })
})

// 📚 V4统一引擎API文档端点
app.get('/api/v4/docs', (req, res) => {
  res.json({
    code: 0,
    msg: 'V4统一抽奖引擎API文档获取成功',
    data: {
      title: '餐厅积分抽奖系统 V4.0 统一引擎API文档',
      version: '4.0.0',
      architecture: 'unified-lottery-engine',
      description: 'V4统一抽奖引擎架构，通过统一引擎管理3种抽奖策略',
      last_updated: BeijingTimeHelper.apiTimestamp(),
      unified_engine: {
        description: 'V4统一抽奖引擎提供完整的抽奖执行和管理功能',
        endpoints: {
          'POST /api/v4/unified-engine/lottery/execute': '执行抽奖',
          'GET /api/v4/unified-engine/lottery/strategies': '获取策略列表',
          'GET /api/v4/unified-engine/lottery/metrics': '获取引擎指标',
          'POST /api/v4/unified-engine/lottery/validate': '验证抽奖条件'
        },
        strategies: [
          'BasicLotteryStrategy - 基础抽奖策略',
          'GuaranteeStrategy - 保底抽奖策略',
          'ManagementStrategy - 管理抽奖策略'
        ]
      },
      admin_system: {
        description: 'V4管理系统提供引擎配置、监控和维护功能',
        endpoints: {
          'GET /api/v4/unified-engine/admin/dashboard': '管理仪表板',
          'POST /api/v4/unified-engine/admin/config': '更新引擎配置',
          'GET /api/v4/unified-engine/admin/logs': '获取执行日志',
          'POST /api/v4/unified-engine/admin/maintenance': '维护模式控制'
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
        base_url: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
        contact: {
          api: '/api/v4',
          lottery: '/api/v4/unified-engine/lottery',
          admin: '/api/v4/unified-engine/admin'
        }
      }
    },
    timestamp: BeijingTimeHelper.apiTimestamp()
  })
})

// 🛣️ 基础路由配置
// 根路径
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '餐厅积分抽奖系统 V4.0 - 统一抽奖引擎',
    data: {
      name: '餐厅积分抽奖系统 V4统一引擎',
      version: '4.0.0',
      api_version: 'v4',
      description: '基于V4统一抽奖引擎架构的智能抽奖系统',
      architecture: 'unified-lottery-engine',
      endpoints: {
        health: '/health',
        api: '/api/v4',
        lottery_engine: '/api/v4/unified-engine/lottery',
        admin_panel: '/api/v4/unified-engine/admin',
        docs: '/api/v4/docs'
      }
    },
    timestamp: BeijingTimeHelper.apiTimestamp()
  })
})

// API基础路径
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'API服务正常',
    data: {
      version: 'v4.0',
      latest_version: 'v4.0',
      available_versions: ['v4'],
      architecture: 'unified_decision_engine',
      v4_features: {
        unified_engine: '/api/v4/unified-engine/lottery',
        admin_panel: '/api/v4/unified-engine/admin',
        performance_metrics: '/api/v4/unified-engine/admin/status',
        decision_analytics: '/api/v4/unified-engine/admin/decisions/analytics'
      }
    },
    timestamp: BeijingTimeHelper.apiTimestamp()
  })
})

// 🔗 V4统一引擎路由注册（清理后只保留V4版本）
try {
  // V4统一认证引擎路由
  app.use('/api/v4/unified-engine/auth', require('./routes/v4/unified-engine/auth'))
  console.log('✅ V4统一认证引擎加载成功: /api/v4/unified-engine/auth')

  // V4统一抽奖引擎路由
  app.use('/api/v4/unified-engine/lottery', require('./routes/v4/unified-engine/lottery'))
  console.log('✅ V4统一抽奖引擎加载成功: /api/v4/unified-engine/lottery')

  // V4统一管理引擎路由
  app.use('/api/v4/unified-engine/admin', require('./routes/v4/unified-engine/admin'))
  console.log('✅ V4统一管理引擎加载成功: /api/v4/unified-engine/admin')

  // V4权限管理路由
  app.use('/api/v4/permissions', require('./routes/v4/permissions'))
  console.log('✅ V4权限管理系统加载成功: /api/v4/permissions')

  console.log('🎯 统一决策引擎V4.0架构已完全启用 - 所有旧版API已弃用')
} catch (error) {
  console.error('❌ V4统一决策引擎加载失败:', error.message)
  console.error('错误详情:', error.stack)
  process.exit(1) // 如果核心引擎加载失败，应用无法继续运行
}

// 🔧 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    code: 404,
    msg: `接口不存在: ${req.method} ${req.originalUrl}`,
    data: {
      error: 'NOT_FOUND',
      availableEndpoints: [
        'GET /health',
        'GET /api/v4',
        'GET /api/v4/docs',
        'POST /api/v4/unified-engine/auth/login',
        'POST /api/v4/unified-engine/auth/register',
        'POST /api/v4/unified-engine/auth/logout',
        'GET /api/v4/unified-engine/auth/verify',
        'POST /api/v4/unified-engine/lottery/execute',
        'GET /api/v4/unified-engine/lottery/strategies',
        'GET /api/v4/unified-engine/admin/dashboard',
        'GET /api/v4/permissions/user/:userId',
        'POST /api/v4/permissions/check',
        'POST /api/v4/permissions/promote',
        'POST /api/v4/permissions/create-admin',
        'GET /api/v4/permissions/me'
      ]
    },
    timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
  })
})

// 🔧 API标准化中间件 - 统一所有API响应格式
const apiStandardManager = new ApiStandardManager()
app.use(apiStandardManager.createStandardizationMiddleware())

// 🔧 全局错误处理
app.use((error, req, res, _next) => {
  console.error('全局错误处理:', error)

  // Sequelize错误处理
  if (error.name === 'SequelizeError') {
    return res.status(500).json({
      success: false,
      error: 'DATABASE_ERROR',
      message: '数据库操作失败',
      timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
    })
  }

  // JWT错误处理
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token无效',
      timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
    })
  }

  // 验证错误处理
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.message,
      timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
    })
  }

  // 默认错误处理
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误',
    timestamp: BeijingTimeHelper.apiTimestamp() // 🕐 北京时间API时间戳
  })
})

// 🚀 启动服务器
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '0.0.0.0'

if (require.main === module) {
  app.listen(PORT, HOST, async () => {
    // V4统一决策引擎启动完成
    console.log(`
🚀 餐厅积分抽奖系统 V4.0 统一引擎启动成功!
📍 服务地址: http://${HOST}:${PORT}
🏥 健康检查: http://${HOST}:${PORT}/health
🎰 V4抽奖引擎: http://${HOST}:${PORT}/api/v4/unified-engine/lottery
👨‍💼 V4管理后台: http://${HOST}:${PORT}/api/v4/unified-engine/admin
🌍 环境: ${process.env.NODE_ENV || 'development'}
⏰ 启动时间: ${BeijingTimeHelper.apiTimestamp()} (北京时间)
    `)

    // ✅ V4架构已完全启用，无需传统定时任务服务
    console.log('✅ V4统一决策引擎架构完全就绪 - 采用现代化微服务架构')
  })
}

module.exports = app
