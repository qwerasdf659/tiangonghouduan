/**
 * 餐厅积分抽奖系统 V3.0 - 主应用入口
 * 创建时间：2025年08月22日 22:49 北京时间
 * 适用区域：中国 (使用北京时间 Asia/Shanghai)
 * 架构：分离式微服务架构
 * 技术栈：Node.js 20+ + Express + MySQL + Sequelize + Redis
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

// 确保Node.js使用北京时间
console.log(`🕐 应用启动时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} (北京时间)`)

// 初始化Express应用
const app = express()

// 🔧 安全中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ['\'self\''],
      styleSrc: ['\'self\'', '\'unsafe-inline\''],
      scriptSrc: ['\'self\'', 'https://unpkg.com', 'https://cdn.jsdelivr.net'],
      imgSrc: ['\'self\'', 'data:', 'https:']
    }
  }
}))

// 🔧 CORS配置
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000', 'http://localhost:8080'],
  credentials: true,
  optionsSuccessStatus: 200
}))

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

// 🔧 请求日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`)
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
      code: 0,
      msg: 'V3 Separated Architecture is healthy',
      data: {
        status: 'healthy',
        version: '3.0.0',
        architecture: 'V3 Separated Architecture',
        timestamp: new Date().toISOString(),
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
      }
    }

    res.json(healthData)
  } catch (error) {
    console.error('健康检查失败:', error)
    res.status(500).json({
      code: -1,
      msg: 'Health check failed',
      data: {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      }
    })
  }
})

// 📋 API版本信息端点
app.get('/api/v3', (req, res) => {
  res.json({
    code: 0,
    msg: 'V3 API信息获取成功',
    data: {
      version: '3.0.0',
      name: '餐厅积分抽奖系统',
      architecture: 'separated-microservices',
      description: '分离式微服务架构 - 抽奖、积分、VIP、收集、概率系统',
      systems: {
        points: {
          name: '积分系统',
          endpoint: '/api/v3/points',
          features: ['积分获取', '积分消费', '积分记录', '每日签到']
        },
        lottery: {
          name: '抽奖系统',
          endpoint: '/api/v3/lottery',
          features: ['活动管理', '抽奖执行', '概率控制', '奖品分发']
        },
        vip: {
          name: 'VIP系统',
          endpoint: '/api/v3/vip',
          features: ['VIP等级', '特权管理', '升级条件', '专享奖品']
        },
        collection: {
          name: '收集系统',
          endpoint: '/api/v3/collection',
          features: ['道具收集', '合成系统', '稀有度管理', '收藏展示']
        },
        probability: {
          name: '动态概率系统',
          endpoint: '/api/v3/probability',
          features: ['概率调节', '保底机制', '运气值系统', '概率分析']
        },
        social: {
          name: '社交抽奖系统',
          endpoint: '/api/v3/social',
          features: ['房间创建', '多人抽奖', '分成结算', '实时通知']
        },
        tasks: {
          name: '任务管理系统',
          endpoint: '/api/v3/tasks',
          features: ['任务分配', '进度跟踪', '奖励发放', '成就系统']
        },
        synthesis: {
          name: '高级合成系统',
          endpoint: '/api/v3/synthesis',
          features: ['配方管理', '道具合成', '成功率计算', '经验系统']
        }
      },
      endpoints: {
        auth: '/api/v3/auth',
        lottery: '/api/v3/lottery',
        points: '/api/v3/points',
        vip: '/api/v3/vip',
        collection: '/api/v3/collection',
        probability: '/api/v3/probability',
        admin: '/api/v3/admin',
        analytics: '/api/v3/analytics',
        events: '/api/v3/events',
        social: '/api/v3/social',
        tasks: '/api/v3/tasks',
        synthesis: '/api/v3/synthesis'
      },
      documentation: '/api/v3/docs',
      health: '/health'
    },
    timestamp: new Date().toISOString()
  })
})

// 📚 API文档端点
app.get('/api/v3/docs', (req, res) => {
  res.json({
    code: 0,
    msg: 'V3 API文档获取成功',
    data: {
      title: '餐厅积分抽奖系统 V3.0 API文档',
      version: '3.0.0',
      architecture: 'separated-microservices',
      description: '分离式微服务架构，提供完整的积分抽奖、VIP、收集、概率控制等系统',
      last_updated: new Date().toISOString(),
      points_system: {
        description: '积分系统提供用户积分的获取、消费、记录和管理功能',
        endpoints: {
          'GET /api/v3/points/balance/:userId': '获取用户积分余额',
          'POST /api/v3/points/earn': '积分获取（签到、消费等）',
          'POST /api/v3/points/consume': '积分消费',
          'GET /api/v3/points/history/:userId': '积分记录查询',
          'POST /api/v3/points/daily-signin': '每日签到'
        },
        features: ['积分获取', '积分消费', '积分记录', '每日签到', '积分过期管理']
      },
      lottery_system: {
        description: '抽奖系统提供活动管理、抽奖执行、概率控制等核心功能',
        endpoints: {
          'GET /api/v3/lottery/campaigns': '获取活动列表',
          'POST /api/v3/lottery/draw': '执行抽奖',
          'GET /api/v3/lottery/history/:userId': '抽奖记录',
          'POST /api/v3/lottery/campaigns': '创建活动（管理员）',
          'PUT /api/v3/lottery/campaigns/:id': '更新活动（管理员）'
        },
        features: ['活动管理', '抽奖执行', '概率控制', '奖品分发', '记录统计']
      },
      vip_system: {
        description: 'VIP系统提供用户等级管理、特权控制、升级条件等功能',
        endpoints: {
          'GET /api/v3/vip/status/:userId': '获取VIP状态',
          'POST /api/v3/vip/upgrade': 'VIP升级',
          'GET /api/v3/vip/privileges': '获取VIP特权列表',
          'GET /api/v3/vip/benefits/:userId': '获取VIP福利'
        },
        features: ['VIP等级管理', '特权控制', '升级条件', '专享奖品', '等级福利']
      },
      collection_system: {
        description: '收集系统提供道具收集、合成、稀有度管理等功能',
        endpoints: {
          'GET /api/v3/collection/catalog': '获取收集目录',
          'GET /api/v3/collection/inventory/:userId': '获取用户收藏',
          'POST /api/v3/collection/synthesize': '道具合成',
          'GET /api/v3/collection/progress/:userId': '收集进度'
        },
        features: ['道具收集', '合成系统', '稀有度管理', '收藏展示', '进度跟踪']
      },
      probability_system: {
        description: '动态概率系统提供概率调节、保底机制、运气值管理等功能',
        endpoints: {
          'GET /api/v3/probability/config/:campaignId': '获取概率配置',
          'POST /api/v3/probability/adjust': '调整概率（管理员）',
          'GET /api/v3/probability/luck/:userId': '获取用户运气值',
          'POST /api/v3/probability/guarantee': '触发保底机制'
        },
        features: ['概率调节', '保底机制', '运气值系统', '概率分析', '动态调整']
      },
      social_system: {
        description: '社交抽奖系统提供多人抽奖房间、分成结算等功能',
        endpoints: {
          'POST /api/v3/social/rooms': '创建抽奖房间',
          'POST /api/v3/social/rooms/:roomId/join': '加入房间',
          'GET /api/v3/social/rooms/:roomId': '获取房间信息',
          'POST /api/v3/social/rooms/:roomId/start': '开始抽奖',
          'GET /api/v3/social/stats': '社交抽奖统计'
        },
        features: ['房间创建', '多人抽奖', '分成结算', '实时通知', '房间管理']
      },
      task_system: {
        description: '任务管理系统提供任务分配、进度跟踪、奖励发放等功能',
        endpoints: {
          'GET /api/v3/tasks/user/:userId': '获取用户任务',
          'POST /api/v3/tasks/:taskId/complete': '完成任务',
          'PUT /api/v3/tasks/:taskId/progress': '更新任务进度',
          'GET /api/v3/tasks/statistics': '任务统计',
          'POST /api/v3/tasks/user/:userId/init-daily': '初始化每日任务'
        },
        features: ['任务分配', '进度跟踪', '奖励发放', '成就系统', '每日/周任务']
      },
      authentication: {
        description: '认证系统采用手机号+验证码的方式，支持JWT token认证',
        endpoints: {
          'POST /api/v3/auth/login': '用户登录',
          'POST /api/v3/auth/refresh': '刷新token',
          'POST /api/v3/auth/logout': '用户登出'
        },
        test_credentials: {
          mobile: '13800138000',
          verification_code: '123456',
          note: '开发环境万能验证码'
        }
      },
      admin_system: {
        description: '管理员系统提供后台管理、数据统计、系统配置等功能',
        endpoints: {
          'GET /api/v3/admin/dashboard': '管理员仪表板',
          'GET /api/v3/admin/users': '用户管理',
          'POST /api/v3/admin/campaigns': '活动管理',
          'GET /api/v3/admin/statistics': '系统统计'
        },
        features: ['用户管理', '活动管理', '数据统计', '系统配置', '权限控制']
      }
    },
    timestamp: new Date().toISOString()
  })
})

// 🛣️ 路由配置 - V3版本API
try {
  // 认证路由
  app.use('/api/v3/auth', require('./routes/v3/auth'))

  // 抽奖系统路由
  app.use('/api/v3/lottery', require('./routes/v3/lottery'))

  // 积分系统路由
  app.use('/api/v3/points', require('./routes/v3/points'))

  // VIP系统路由 (新增)
  app.use('/api/v3/vip', require('./routes/v3/vip'))

  // 收集系统路由 (新增)
  app.use('/api/v3/collection', require('./routes/v3/collection'))

  // 动态概率系统路由 (新增)
  app.use('/api/v3/probability', require('./routes/v3/probability'))

  // 管理员路由
  app.use('/api/v3/admin', require('./routes/v3/admin'))

  // 分析系统路由
  app.use('/api/v3/analytics', require('./routes/v3/analytics'))

  // 事件系统路由
  app.use('/api/v3/events', require('./routes/v3/events'))

  // 社交抽奖系统路由 (新增)
  app.use('/api/v3/social', require('./routes/v3/social'))

  // 任务管理系统路由 (新增)
  app.use('/api/v3/tasks', require('./routes/v3/tasks'))

  // 定时调度系统路由 (新增)
  app.use('/api/v3/schedule', require('./routes/v3/schedule'))

  // 高级合成系统路由 (新增)
  app.use('/api/v3/synthesis', require('./routes/v3/synthesis'))

  // 智能推荐路由
  app.use('/api/v3/smart', require('./routes/v3/smart'))

  console.log('✅ 所有V3 API路由加载成功')
} catch (error) {
  console.error('❌ 路由加载失败:', error.message)
  console.error('路径:', error.stack)
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
        'GET /api/v3',
        'GET /api/v3/docs',
        'POST /api/v3/auth/login',
        'GET /api/v3/lottery/campaigns',
        'GET /api/v3/vip/status',
        'GET /api/v3/collection/catalog',
        'GET /api/v3/social/stats',
        'GET /api/v3/tasks/statistics'
      ]
    },
    timestamp: new Date().toISOString()
  })
})

// 🔧 全局错误处理
app.use((error, req, res, _next) => {
  console.error('全局错误处理:', error)

  // Sequelize错误处理
  if (error.name === 'SequelizeError') {
    return res.status(500).json({
      success: false,
      error: 'DATABASE_ERROR',
      message: '数据库操作失败',
      timestamp: new Date().toISOString()
    })
  }

  // JWT错误处理
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'INVALID_TOKEN',
      message: 'Token无效',
      timestamp: new Date().toISOString()
    })
  }

  // 验证错误处理
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    })
  }

  // 默认错误处理
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'development' ? error.message : '服务器内部错误',
    timestamp: new Date().toISOString()
  })
})

// 🚀 启动服务器
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '0.0.0.0'

if (require.main === module) {
  app.listen(PORT, HOST, async () => {
    console.log(`
🚀 餐厅积分抽奖系统 V3.0 启动成功!
📍 服务地址: http://${HOST}:${PORT}
🏥 健康检查: http://${HOST}:${PORT}/health
📚 API文档: http://${HOST}:${PORT}/api/v3
🌍 环境: ${process.env.NODE_ENV || 'development'}
⏰ 启动时间: ${new Date().toISOString()}
    `)

    // 🕐 初始化定时任务调度服务
    try {
      const TimeScheduleService = require('./services/TimeScheduleService')
      const initResult = await TimeScheduleService.initialize()

      if (initResult.success) {
        console.log(`⏰ 定时任务调度服务启动成功，恢复了${initResult.data.recoveredTasks}个任务`)
      } else {
        console.error('⚠️ 定时任务调度服务启动失败:', initResult.message)
      }
    } catch (error) {
      console.error('❌ 初始化定时任务调度服务时发生错误:', error.message)
    }
  })
}

module.exports = app
