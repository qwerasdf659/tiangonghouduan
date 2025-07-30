const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const compression = require('compression')
const rateLimit = require('express-rate-limit')

// 数据库连接
const { sequelize } = require('./models')

// 路由
const authRouter = require('./routes/v2/auth')
const resourcesRouter = require('./routes/v2/resources')
const lotteryRouter = require('./routes/v2/lottery')
const exchangeRouter = require('./routes/v2/exchange')
const tradeRouter = require('./routes/v2/trade')
const uploadsRouter = require('./routes/v2/uploads')

// 工具类和中间件
const ApiResponse = require('./utils/ApiResponse')
const { requireAdmin } = require('./middleware/auth')
const {
  createResponseTransformMiddleware,
  createRequestTransformMiddleware,
  getTransformStats,
  resetTransformStats
} = require('./middleware/fieldTransform')

// 创建Express应用
const app = express()

// 全局中间件配置
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ['\'self\''],
        styleSrc: ['\'self\'', '\'unsafe-inline\''],
        scriptSrc: ['\'self\''],
        imgSrc: ['\'self\'', 'data:', 'https:']
      }
    }
  })
)

app.use(compression())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

// CORS配置
const corsOptions = {
  origin: function (origin, callback) {
    // 开发环境允许所有来源
    if (process.env.NODE_ENV === 'development') {
      callback(null, true)
      return
    }

    // 生产环境配置允许的域名
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true)
    } else {
      callback(new Error('CORS策略不允许此来源'))
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'User-Agent']
}

app.use(cors(corsOptions))

// 速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: process.env.NODE_ENV === 'development' ? 1000 : 300, // 开发环境宽松限制
  message: {
    error: {
      message: '请求过于频繁，请稍后再试',
      code: 'TOO_MANY_REQUESTS',
      retryAfter: 900 // 15分钟
    }
  },
  standardHeaders: true,
  legacyHeaders: false
})

app.use('/api/v2', limiter)

// 字段转换中间件 - 自动处理前后端字段映射
app.use(
  createResponseTransformMiddleware({
    logTransformations: process.env.NODE_ENV === 'development',
    strictMode: process.env.NODE_ENV === 'production'
  })
)
app.use(
  createRequestTransformMiddleware({
    logTransformations: process.env.NODE_ENV === 'development',
    strictMode: process.env.NODE_ENV === 'production'
  })
)

// 字段转换统计信息端点
app.use(getTransformStats)
app.use(resetTransformStats)

// 请求日志中间件
app.use((req, res, next) => {
  const startTime = Date.now()

  // 记录请求信息
  console.log(
    `📝 ${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip} - UA: ${req.get('User-Agent')?.slice(0, 100) || 'Unknown'}`
  )

  // 记录响应信息
  res.on('finish', () => {
    const duration = Date.now() - startTime
    const statusEmoji = res.statusCode >= 400 ? '❌' : res.statusCode >= 300 ? '⚠️' : '✅'
    console.log(`${statusEmoji} ${res.statusCode} - ${req.method} ${req.path} - ${duration}ms`)
  })

  next()
})

// 健康检查端点
app.get('/health', (req, res) => {
  res.json(
    ApiResponse.success(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        architecture: 'multi-business-layered-storage',
        database:
          sequelize.connectionManager.getConnection() !== null ? 'connected' : 'disconnected',
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        }
      },
      'Service is healthy'
    )
  )
})

// 临时调试端点
app.get('/debug-auth', async (req, res) => {
  const authHeader = req.headers.authorization
  const token = authHeader && authHeader.split(' ')[1]

  console.log('=== 调试认证过程 ===')
  console.log('Authorization Header:', authHeader)
  console.log('Extracted Token:', token ? token.substring(0, 50) + '...' : 'None')

  if (!token) {
    return res.json({ error: 'No token provided' })
  }

  const jwt = require('jsonwebtoken')
  const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production'

  console.log('JWT_SECRET in app:', JWT_SECRET)

  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    console.log('Token验证成功:', decoded)
    res.json({ success: true, decoded })
  } catch (error) {
    console.log('Token验证失败:', error.message)
    res.json({ error: error.message })
  }
})

// 配置检查端点
app.get('/debug-config', (req, res) => {
  const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_change_in_production'
  res.json({
    jwt_secret: JWT_SECRET,
    jwt_secret_length: JWT_SECRET.length,
    node_env: process.env.NODE_ENV,
    all_env: Object.keys(process.env).filter(key => key.includes('JWT'))
  })
})

// API版本信息
app.get('/api/v2', (req, res) => {
  res.json(
    ApiResponse.success(
      {
        version: '2.0.0',
        title: '餐厅积分抽奖系统 - 后端存储架构 v2.0',
        description:
          '全新的多业务线分层存储架构，支持lottery、exchange、trade、uploads四大业务模块',
        features: [
          '统一图片资源管理',
          '智能分层存储',
          '多业务线支持',
          '自动缩略图生成',
          '批量操作支持',
          'RESTful API设计',
          '完整的权限控制'
        ],
        endpoints: {
          resources: '/api/v2/resources',
          lottery: '/api/v2/lottery',
          exchange: '/api/v2/exchange',
          trade: '/api/v2/trade',
          uploads: '/api/v2/uploads',
          health: '/health',
          docs: '/api/v2/docs'
        },
        authentication: 'JWT Bearer Token',
        supportedBusinessTypes: ['lottery', 'exchange', 'trade', 'uploads'],
        storageLayers: ['hot', 'standard', 'archive']
      },
      'API v2.0 Information'
    )
  )
})

// 挂载路由
app.use('/api/v2/auth', authRouter)
app.use('/api/v2/resources', resourcesRouter)
app.use('/api/v2/lottery', lotteryRouter)
app.use('/api/v2/exchange', exchangeRouter)
app.use('/api/v2/trade', tradeRouter)
app.use('/api/v2/uploads', uploadsRouter)

// 管理员专用路由
app.get('/api/v2/admin/overview', requireAdmin, async (req, res) => {
  try {
    // 获取系统概览信息
    const { ImageResources } = require('./models')

    // 并行查询统计信息
    const [totalResources, businessStats, storageStats, recentUploads] = await Promise.all([
      ImageResources.count({ where: { status: 'active' } }),

      ImageResources.findAll({
        attributes: [
          'business_type',
          [sequelize.fn('COUNT', sequelize.col('resource_id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('file_size')), 'total_size']
        ],
        where: { status: 'active' },
        group: ['business_type'],
        raw: true
      }),

      ImageResources.findAll({
        attributes: [
          'storage_layer',
          [sequelize.fn('COUNT', sequelize.col('resource_id')), 'count'],
          [sequelize.fn('SUM', sequelize.col('file_size')), 'total_size']
        ],
        where: { status: 'active' },
        group: ['storage_layer'],
        raw: true
      }),

      ImageResources.findAll({
        where: { status: 'active' },
        order: [['created_at', 'DESC']],
        limit: 10,
        attributes: [
          'resource_id',
          'business_type',
          'category',
          'original_filename',
          'file_size',
          'created_at'
        ]
      })
    ])

    res.json(
      ApiResponse.success(
        {
          overview: {
            totalResources: parseInt(totalResources),
            businessStats,
            storageStats
          },
          recentUploads,
          systemInfo: {
            version: '2.0.0',
            nodeVersion: process.version,
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
          }
        },
        '系统概览信息获取成功'
      )
    )
  } catch (error) {
    console.error('❌ 获取系统概览失败:', error.message)
    res
      .status(500)
      .json(ApiResponse.error('获取系统概览失败', 'GET_OVERVIEW_FAILED', error.message))
  }
})

// API文档端点（简化版）
app.get('/api/v2/docs', (req, res) => {
  const docs = {
    title: '餐厅积分抽奖系统 API v2.0 文档',
    version: '2.0.0',
    baseUrl: `${req.protocol}://${req.get('host')}/api/v2`,

    authentication: {
      type: 'Bearer Token',
      header: 'Authorization: Bearer <token>',
      description: '通过用户登录接口获取JWT令牌'
    },

    endpoints: {
      resources: {
        'POST /resources': '创建图片资源（文件上传）',
        'POST /resources/batch': '批量上传图片资源',
        'GET /resources': '查询图片资源列表',
        'GET /resources/:resourceId': '获取单个资源详情',
        'PUT /resources/:resourceId': '更新资源信息',
        'DELETE /resources/:resourceId': '删除资源（软删除）',
        'GET /resources/reviews/pending': '获取待审核资源列表（管理员）',
        'POST /resources/reviews/batch': '批量审核资源（管理员）',
        'GET /resources/stats/storage': '获取存储统计信息（管理员）'
      },

      lottery: {
        'GET /lottery/prizes/:prizeId': '获取特定奖品的图片资源',
        'POST /lottery/prizes/:prizeId/images': '为特定奖品上传图片（管理员）',
        'GET /lottery/wheels': '获取转盘相关图片资源',
        'POST /lottery/wheels/upload': '上传转盘背景或装饰图片（管理员）',
        'GET /lottery/banners': '获取抽奖活动横幅图片',
        'POST /lottery/banners/upload': '上传抽奖活动横幅（管理员）',
        'GET /lottery/results': '获取抽奖结果展示图片',
        'PUT /lottery/images/:resourceId/activate': '激活/停用抽奖相关图片（管理员）',
        'GET /lottery/stats': '获取抽奖业务图片统计（管理员）'
      },

      exchange: {
        'GET /exchange/products/:productId': '获取特定商品的图片资源',
        'POST /exchange/products/:productId/images': '为特定商品上传图片（管理员）',
        'GET /exchange/categories': '获取兑换分类图片',
        'POST /exchange/categories/upload': '上传分类图片（管理员）',
        'GET /exchange/promotions': '获取促销活动图片',
        'PUT /exchange/images/:resourceId/activate': '激活/停用兑换相关图片（管理员）',
        'GET /exchange/stats': '获取兑换业务图片统计（管理员）'
      },

      trade: {
        'GET /trade/items/:itemId': '获取特定交易物品的图片资源',
        'POST /trade/items/:itemId/images': '为特定交易物品上传图片',
        'GET /trade/banners': '获取交易横幅图片',
        'POST /trade/banners/upload': '上传交易横幅图片（管理员）',
        'GET /trade/transactions': '获取交易记录相关图片',
        'PUT /trade/images/:resourceId/activate': '激活/停用交易相关图片（管理员）',
        'GET /trade/stats': '获取交易业务图片统计（管理员）'
      },

      uploads: {
        'POST /uploads/submit': '用户提交图片审核',
        'GET /uploads/my-submissions': '获取当前用户的提交记录',
        'GET /uploads/pending-reviews': '获取待审核图片列表（管理员）',
        'POST /uploads/review/:resourceId': '审核单个图片（管理员）',
        'POST /uploads/batch-review': '批量审核图片（管理员）',
        'GET /uploads/review-history': '获取审核历史（管理员）',
        'GET /uploads/stats': '获取上传审核统计（管理员）',
        'DELETE /uploads/:resourceId': '删除用户上传的图片'
      }
    },

    businessTypes: {
      lottery: '抽奖业务 - 奖品、转盘、横幅、抽奖结果图片',
      exchange: '兑换业务 - 商品、分类、促销图片',
      trade: '交易业务 - 商品、横幅、交易记录图片',
      uploads: '用户上传 - 消费小票审核图片'
    },

    storageStrategy: {
      hot: '热存储 - 新上传和活跃资源，快速访问',
      standard: '标准存储 - 中期存储，平衡性能和成本',
      archive: '归档存储 - 长期存储，低成本'
    },

    examples: {
      uploadFile: {
        method: 'POST',
        url: '/api/v2/resources',
        headers: {
          Authorization: 'Bearer <your-jwt-token>',
          'Content-Type': 'multipart/form-data'
        },
        body: {
          image: '<file>',
          businessType: 'lottery',
          category: 'prizes',
          contextId: '1',
          isActive: 'true',
          priority: 'high'
        }
      },

      queryResources: {
        method: 'GET',
        url: '/api/v2/resources?businessType=lottery&category=prizes&limit=20&page=1',
        headers: {
          Authorization: 'Bearer <your-jwt-token>'
        }
      }
    }
  }

  res.json(ApiResponse.success(docs, 'API文档'))
})

// 404 处理
app.use('*', (req, res) => {
  res
    .status(404)
    .json(
      ApiResponse.notFound(`接口不存在: ${req.method} ${req.originalUrl}`, 'ENDPOINT_NOT_FOUND')
    )
})

// 全局错误处理中间件
app.use(ApiResponse.errorHandler())

// 数据库连接和服务启动
async function startServer () {
  try {
    console.log('🔄 开始启动服务器...')

    // 测试数据库连接
    console.log('🔄 测试数据库连接...')
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功')

    // 同步数据库模型（临时禁用以快速启动）
    // eslint-disable-next-line no-constant-condition
    if (false && process.env.NODE_ENV === 'development') {
      console.log('🔄 同步数据库模型...')
      await sequelize.sync({ alter: false }) // 不强制修改表结构
      console.log('✅ 数据库模型同步完成')

      // 初始化业务配置
      console.log('🔄 初始化业务配置...')
      try {
        const { BusinessConfigs } = require('./models')
        await BusinessConfigs.initializeDefaultConfigs()
        console.log('✅ 业务配置初始化完成')
      } catch (configError) {
        console.warn('⚠️ 业务配置初始化失败，继续启动:', configError.message)
      }
    }

    // 启动HTTP服务器
    console.log('🔄 启动HTTP服务器...')
    const PORT = process.env.PORT || 3000
    const server = app.listen(PORT, () => {
      console.log('🚀 餐厅积分抽奖系统 v2.0 启动成功!')
      console.log(`📡 服务地址: http://localhost:${PORT}`)
      console.log(`📚 API文档: http://localhost:${PORT}/api/v2/docs`)
      console.log(`❤️ 健康检查: http://localhost:${PORT}/health`)
      console.log('🏗️ 架构版本: 多业务线分层存储架构 v2.0')
      console.log(`🌍 运行环境: ${process.env.NODE_ENV || 'development'}`)
      console.log(`💾 Node.js版本: ${process.version}`)
    })

    // 优雅关闭处理
    process.on('SIGTERM', async () => {
      console.log('📴 收到SIGTERM信号，开始优雅关闭...')

      server.close(async () => {
        console.log('🔌 HTTP服务器已关闭')

        try {
          await sequelize.close()
          console.log('🗄️ 数据库连接已关闭')
          process.exit(0)
        } catch (error) {
          console.error('❌ 关闭数据库连接失败:', error)
          process.exit(1)
        }
      })
    })

    process.on('SIGINT', async () => {
      console.log('📴 收到SIGINT信号，开始优雅关闭...')

      server.close(async () => {
        console.log('🔌 HTTP服务器已关闭')

        try {
          await sequelize.close()
          console.log('🗄️ 数据库连接已关闭')
          process.exit(0)
        } catch (error) {
          console.error('❌ 关闭数据库连接失败:', error)
          process.exit(1)
        }
      })
    })

    return server
  } catch (error) {
    console.error('❌ 服务启动失败:', error)
    console.error('❌ 错误堆栈:', error.stack)
    process.exit(1)
  }
}

// 如果直接运行此文件，则启动服务器
if (require.main === module) {
  startServer()
}

module.exports = { app, startServer }
