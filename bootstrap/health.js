/**
 * 健康检查与元信息端点装配（bootstrap 模块，2026-07-11 自 app.js 拆分，纯搬移不改行为）
 *
 * 端点清单：
 * - GET /ready          就绪探针（DB+Redis 均就绪才 200，Sealos readiness probe）
 * - GET /health         存活探针（真实检查 DB/Redis，degraded 状态仍返回 200）
 * - GET /api/v4         V4统一引擎信息
 * - GET /api/v4/docs    API文档元数据
 * - GET /               根路径服务信息
 * - GET /api            API版本信息
 * - /admin/*            Web管理后台静态文件托管（admin/dist Vite 构建输出）
 *
 * @module bootstrap/health
 */

'use strict'

const path = require('path')
const express = require('express')
const BeijingTimeHelper = require('../utils/timeHelper')
const appLogger = require('../utils/logger')
const { getRequestId } = require('./request-id')

/**
 * 装配健康检查、元信息端点与管理后台静态托管
 *
 * @param {Object} app - Express 应用实例
 * @returns {void}
 */
function mountHealthAndMeta(app) {
  /**
   * 就绪探针端点 — Sealos Ingress readiness probe
   *
   * 与 /health（存活探针）的区别：
   * - /health：进程存活即返回 200（liveness）
   * - /ready：DB 连接池 + Redis 均就绪才返回 200（readiness）
   *
   * Sealos 配置 readiness probe 指向此端点后，
   * 容器冷启动期间不会将流量转发到尚未初始化完成的进程，
   * 从而避免微信小程序 wx.request timeout。
   */
  app.get('/ready', async (req, res) => {
    try {
      const { sequelize } = require('../models')
      const { isRedisHealthy } = require('../utils/UnifiedRedisClient')

      // 并行检查 DB 和 Redis
      const [dbOk, redisOk] = await Promise.all([
        sequelize
          .authenticate()
          .then(() => true)
          .catch(() => false),
        isRedisHealthy().catch(() => false)
      ])

      if (dbOk && redisOk) {
        return res.status(200).json({
          ready: true,
          checks: { database: 'connected', redis: 'connected' },
          timestamp: BeijingTimeHelper.apiTimestamp()
        })
      }

      // 任一依赖未就绪 → 503，Sealos 不转发流量
      return res.status(503).json({
        ready: false,
        checks: {
          database: dbOk ? 'connected' : 'disconnected',
          redis: redisOk ? 'connected' : 'disconnected'
        },
        timestamp: BeijingTimeHelper.apiTimestamp()
      })
    } catch (error) {
      appLogger.error('就绪探针检查异常', { error: error.message })
      return res.status(503).json({
        ready: false,
        error: error.message,
        timestamp: BeijingTimeHelper.apiTimestamp()
      })
    }
  })

  //  健康检查端点（真实检查所有依赖服务，禁止占位实现）
  app.get('/health', async (req, res) => {
    try {
      // 检查数据库连接
      const { sequelize } = require('../models')
      let databaseStatus = 'disconnected'

      try {
        await sequelize.authenticate()
        databaseStatus = 'connected'
      } catch (error) {
        appLogger.error('数据库连接检查失败', { error: error.message })
        databaseStatus = 'disconnected'
      }

      // 检查Redis连接（真实检查 - P0修复）
      let redisStatus = 'disconnected'
      try {
        const { isRedisHealthy } = require('../utils/UnifiedRedisClient')
        const redisHealthy = await isRedisHealthy()
        redisStatus = redisHealthy ? 'connected' : 'disconnected'
      } catch (error) {
        appLogger.error('Redis连接检查失败', { error: error.message })
        redisStatus = 'disconnected'
      }

      // 计算整体状态（degraded模式 - P0修复）
      const overallStatus =
        databaseStatus === 'connected' && redisStatus === 'connected' ? 'healthy' : 'degraded'

      const healthCode = overallStatus === 'healthy' ? 'SYSTEM_HEALTHY' : 'SYSTEM_DEGRADED'

      const healthData = {
        success: true, //  业务标准格式
        code: healthCode, //  业务代码（根据整体状态）
        message:
          overallStatus === 'healthy'
            ? 'V4 Unified Lottery Engine 系统运行正常'
            : 'V4 Unified Lottery Engine 系统降级运行', //  用户友好消息
        data: {
          status: overallStatus,
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
        timestamp: BeijingTimeHelper.apiTimestamp(), //  顶层 timestamp（监控标准）
        version: 'v4.0', //  API版本信息
        request_id: getRequestId(req) //  请求追踪ID
      }

      res.json(healthData)
    } catch (error) {
      appLogger.error('健康检查失败', { error: error.message, stack: error.stack })
      res.status(500).json({
        success: false, //  业务标准格式
        code: 'SYSTEM_UNHEALTHY', //  业务错误代码
        message: '系统健康检查失败', //  用户友好错误消息
        data: {
          status: 'unhealthy',
          error: error.message
        },
        timestamp: BeijingTimeHelper.apiTimestamp(), //  顶层 timestamp
        version: 'v4.0', //  API版本信息
        request_id: getRequestId(req) //  请求追踪ID
      })
    }
  })

  //  V4统一引擎信息端点
  app.get('/api/v4', (req, res) => {
    return res.apiSuccess(
      {
        version: '4.0.0',
        name: '天工商户营销平台 V4.6统一引擎',
        architecture: 'unified-lottery-pipeline',
        description: 'V4.6统一抽奖引擎架构 - Pipeline 模式统一管理',
        engine: {
          name: 'UnifiedLotteryEngine',
          version: '4.6.0',
          /**
           * V4.6 Phase 5：原 3 条管线已合并为 1 条统一管线
           * 决策来源由 LoadDecisionSourceStage 在管线内判断
           */
          pipelines: ['NormalDrawPipeline - 统一抽奖管线（Phase 5 合并）'],
          decision_sources: ['normal', 'preset'], // 决策来源类型（override 暗箱干预已于 2026-06-04 合规下线）
          core: {
            UnifiedLotteryEngine: '统一抽奖引擎 - Pipeline 设计',
            DrawOrchestrator: '管线编排器',
            LoadDecisionSourceStage: '决策来源判断 Stage'
          }
        },
        endpoints: {
          lottery: '/api/v4/lottery',
          admin: '/api/v4/console',
          health: '/health'
        },
        features: ['统一抽奖引擎', '智能策略选择', '实时决策处理', '完整审计日志', '高性能优化']
      },
      'V4统一抽奖引擎信息获取成功',
      'ENGINE_INFO_SUCCESS'
    )
  })

  //  V4统一引擎API文档端点
  app.get('/api/v4/docs', (req, res) => {
    return res.apiSuccess(
      {
        title: '天工商户营销平台 V4.0 统一引擎API文档',
        version: '4.0.0',
        architecture: 'unified-lottery-engine-v4.6-pipeline',
        description: 'V4.6统一抽奖引擎架构，使用 Pipeline 管线模式替代 Strategy 策略模式',
        last_updated: BeijingTimeHelper.apiTimestamp(),
        unified_engine: {
          description: 'V4.6统一抽奖引擎通过 DrawOrchestrator 编排 Pipeline 管线执行抽奖',
          endpoints: {
            'POST /api/v4/lottery/draw': '执行抽奖（Pipeline模式）',
            'GET /api/v4/lottery/strategies': '获取管线列表',
            'GET /api/v4/lottery/metrics': '获取引擎指标',
            'POST /api/v4/lottery/validate': '验证抽奖条件'
          },
          pipelines: ['NormalDrawPipeline - 统一抽奖管线'],
          decision_sources: ['normal', 'preset'],
          orchestrator: 'DrawOrchestrator - 管线编排器'
        },
        admin_system: {
          description: 'V4管理系统提供引擎配置、监控和维护功能',
          endpoints: {
            'GET /api/v4/console/system/dashboard': '管理仪表板',
            'POST /api/v4/console/config': '更新引擎配置',
            'GET /api/v4/console/logs': '获取执行日志',
            'POST /api/v4/console/maintenance': '维护模式控制'
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
            lottery: '/api/v4/lottery',
            admin: '/api/v4/console'
          }
        }
      },
      'V4统一抽奖引擎API文档获取成功',
      'API_DOCS_SUCCESS'
    )
  })

  //  基础路由配置：根路径
  app.get('/', (req, res) => {
    res.json({
      success: true,
      message: '天工商户营销平台 V4.0 - 统一回馈引擎',
      data: {
        name: '天工商户营销平台 V4统一引擎',
        version: '4.0.0',
        api_version: 'v4',
        description: '天工商户营销平台 - 消费回馈与积分服务平台',
        architecture: 'unified-lottery-engine',
        endpoints: {
          health: '/health',
          api: '/api/v4',
          lottery_engine: '/api/v4/lottery',
          admin_panel: '/api/v4/console',
          docs: '/api/v4/docs'
        }
      },
      timestamp: BeijingTimeHelper.apiTimestamp()
    })
  })

  // API基础路径
  app.get('/api', (req, res) => {
    return res.apiSuccess(
      {
        version: 'v4.0',
        latest_version: 'v4.0',
        available_versions: ['v4'],
        architecture: 'unified_decision_engine',
        v4_features: {
          unified_engine: '/api/v4/lottery',
          admin_panel: '/api/v4/console',
          performance_metrics: '/api/v4/console/system/status',
          decision_analytics: '/api/v4/console/analytics/decisions/analytics'
        }
      },
      'API服务正常',
      'API_OK'
    )
  })

  /**
   * 托管管理后台静态文件（Vite 构建输出）
   *
   * 路径映射：
   * - /admin/dashboard.html → admin/dist/dashboard.html
   * - /admin/assets/main.js → admin/dist/assets/main.js
   *
   *  必须在API路由注册之前配置，避免路由冲突
   */
  app.use(
    '/admin',
    express.static(path.join(__dirname, '../admin/dist'), {
      index: false, // 禁用默认首页，避免冲突
      maxAge: 0, // 禁用缓存，更新立即生效
      etag: false, // 禁用ETag
      lastModified: true, // 启用Last-Modified
      dotfiles: 'ignore', // 忽略隐藏文件
      redirect: false, // 禁用目录重定向
      setHeaders: (res, _filePath) => {
        // 强制不缓存，确保每次都获取最新文件
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.set('Pragma', 'no-cache')
        res.set('Expires', '0')
      }
    })
  )

  /**
   * 管理后台根路径重定向到登录页
   */
  app.get('/admin', (req, res) => {
    res.redirect(301, '/admin/login.html')
  })

  appLogger.info(' Web管理后台静态文件托管已配置', {
    mount: '/admin',
    directory: 'admin/dist',
    cache: 'no-cache'
  })
}

module.exports = { mountHealthAndMeta }
