/**
 * 天工商户营销平台 V4.0 - 统一引擎架构主应用入口
 * 适用区域：中国 (使用北京时间 Asia/Shanghai)
 * 架构：V4统一抽奖引擎架构
 * 技术栈：Node.js 20+ + Express + V4统一引擎 + MySQL + Sequelize + Redis
 *
 * 装配式入口（2026-07-11 bootstrap 化，技术债务方案 7.4-7）：
 * app.js 只负责装配顺序，各职责域拆分至 bootstrap/ 模块：
 * - bootstrap/middleware.js  安全/限流/解析中间件链
 * - bootstrap/health.js      /ready /health /api/v4 元数据端点 + 管理后台静态托管
 * - bootstrap/routes.js      18 个 V4 业务域挂载 + 404 + 全局错误处理
 * - bootstrap/jobs.js        定时任务与连接池监控（cluster 单 worker 防重）
 * - bootstrap/websocket.js   socket.io 初始化 + 优雅关闭
 */

'use strict'

//  设置应用程序时区为北京时间 (中国区域)
process.env.TZ = 'Asia/Shanghai'

const express = require('express')

/**
 * dotenv配置：所有环境统一禁止 override（单一真相源方案）
 * 优先级模型：PM2 env_file 注入 > .env 补齐（跨环境一致、可预测）
 */
require('dotenv').config()
console.log(` [${process.env.NODE_ENV || 'unknown'}] 环境变量已加载，配置源：.env 文件`)

//  配置校验（统一 fail-fast 模式）
const { validateConfig } = require('./config/environment')
/**
 * 配置校验架构升级（2025-12-30 配置管理三层分离方案）
 * - 所有环境统一 fail-fast（移除 development 的 try/catch 忽略）
 * - 校验逻辑统一到 ConfigValidator（基于 CONFIG_SCHEMA 权威定义）
 * - 避免"开发能跑、生产炸"的环境差异问题
 */
validateConfig(true) // failFast=true，所有环境遇错即退出

//  北京时间工具导入
const BeijingTimeHelper = require('./utils/timeHelper')

//  统一日志系统导入
const logger = require('./utils/logger')
const appLogger = logger

// bootstrap 装配模块
const { mountBaseMiddleware } = require('./bootstrap/middleware')
const { mountHealthAndMeta } = require('./bootstrap/health')
const { mountDomainRoutes } = require('./bootstrap/routes')
const { startTimeoutServices, startCronJobs, startPoolMonitoring } = require('./bootstrap/jobs')
const { initializeWebSocket, registerGracefulShutdown } = require('./bootstrap/websocket')

// 确保Node.js使用北京时间
appLogger.info('应用启动', {
  start_time: BeijingTimeHelper.formatChinese(),
  timezone: 'Asia/Shanghai',
  node_version: process.version
})

// 初始化Express应用
const app = express()

//  信任代理配置 - Sealos部署环境必需
app.set('trust proxy', true)

/*
 * ========================================
 * 装配顺序（顺序即契约，禁止调整）：
 * 1. 基础中间件链（安全/CORS/解析/限流/维护模式/超时）
 * 2. 健康检查与元信息端点 + 管理后台静态托管（须在 API 域之前）
 * 3. V4 业务域路由 + 404 + 全局错误处理
 * ========================================
 */
mountBaseMiddleware(app)
mountHealthAndMeta(app)
mountDomainRoutes(app)

/**
 *  应用初始化流程（同步阻塞模式）
 *
 * 初始化顺序：
 * 1. Service层初始化（ServiceManager 注册表 + 超时扫描服务）
 * 2. 关键 SystemSettings 启动预检（阻塞式，失败即退出）
 * 3. 审计操作类型 ENUM 一致性校验
 * 4. 审计日志 target_type 一致性校验
 * 5. DisplayNameService 中文显示名称服务初始化
 * 6. 冷启动预热（DB 连接池 + Redis + 高频配置缓存）
 *
 * @returns {Promise<void>} 无返回值，初始化失败时直接退出进程
 */
async function initializeApp() {
  // 步骤1：初始化 Service 层
  try {
    const models = require('./models')
    const { initializeServices } = require('./services')
    const services = initializeServices(models)

    // 将Service容器和Models添加到app实例中，供路由使用
    app.locals.services = services
    app.locals.models = models

    // 注入 ServiceManager 到共享中间件（消除降级 require）
    const { setServiceManager } = require('./routes/v4/console/shared/middleware')
    setServiceManager(services)

    appLogger.info('Service层初始化完成', {
      services: Array.from(services.getAllServices().keys())
    })

    // 审核链/售后申诉超时扫描服务（cluster 单 worker 防重，详见 bootstrap/jobs.js）
    startTimeoutServices()

    // 运行时自检：打印连接池配置
    const pool = models.sequelize.connectionManager.pool
    if (pool && pool._factory) {
      appLogger.info('数据库连接池配置', {
        source: 'config/database.js',
        max: pool._factory.max || 0,
        min: pool._factory.min || 0,
        acquire: pool._factory.acquireTimeoutMillis || 0,
        idle: pool.idleTimeoutMillis || 0,
        evict: pool.reapIntervalMillis || 0,
        note: '单一配置源 - 禁止其他地方自建连接池'
      })
    }
  } catch (error) {
    appLogger.error('Service层初始化失败', { error: error.message })
    process.exit(1)
  }

  // 步骤2：关键 SystemSettings 启动预检（同步阻塞）
  try {
    const { validateCriticalSettings } = require('./config/system-settings-validator')
    await validateCriticalSettings() //  使用 await 确保同步阻塞
    appLogger.info(' SystemSettings 启动预检通过')
  } catch (error) {
    // 预检器内部已经 process.exit(1)，这里仅作日志记录
    appLogger.error('SystemSettings 启动预检失败', { error: error.message })
    // 确保进程退出
    process.exit(1)
  }

  // 步骤3：审计操作类型 ENUM 一致性校验（审计整合方案 V4.5.0 决策）
  try {
    const { validateDbEnumConsistency } = require('./constants/AuditOperationTypes')
    const { sequelize } = app.locals.models // 从已注入的 models 获取 sequelize
    const enumResult = await validateDbEnumConsistency(sequelize)

    if (!enumResult.valid) {
      appLogger.error(' 审计操作类型 ENUM 一致性校验失败', {
        missing: enumResult.missing,
        extra: enumResult.extra,
        solution: '请执行数据库迁移: npx sequelize-cli db:migrate'
      })
      // ENUM 不一致会导致审计日志写入失败，强制退出
      process.exit(1)
    }

    if (enumResult.skipped) {
      appLogger.warn(' 审计操作类型 ENUM 校验跳过（表或列不存在）')
    } else {
      appLogger.info(' 审计操作类型 ENUM 一致性校验通过')
    }
  } catch (error) {
    appLogger.warn('审计 ENUM 校验出错（非致命）', { error: error.message })
    // 校验函数内部已记录详细错误，不阻断启动
  }

  // 步骤4：审计日志 target_type 一致性校验（P0-5 实施 - 2026-01-09）
  try {
    const { validateTargetTypeConsistency } = require('./constants/AuditTargetTypes')
    const { sequelize } = app.locals.models
    const targetTypeResult = await validateTargetTypeConsistency(sequelize)

    if (!targetTypeResult.valid) {
      appLogger.error(' 审计日志 target_type 一致性校验失败', {
        unknown: targetTypeResult.unknown,
        stats: targetTypeResult.stats,
        solution: '请检查 constants/AuditTargetTypes.js 中的 AUDIT_TARGET_TYPES 定义'
      })
      /*
       * target_type 不一致可能导致审计追溯问题，但不强制退出
       * 仅记录错误，运维人员根据情况处理
       */
    } else if (targetTypeResult.warning) {
      appLogger.warn(' target_type 存在可规范化的值，建议执行数据迁移', {
        unknown: targetTypeResult.unknown
      })
    } else if (targetTypeResult.skipped) {
      appLogger.info('ℹ target_type 校验跳过（表为空）')
    } else {
      appLogger.info(' 审计日志 target_type 一致性校验通过', {
        total_types: targetTypeResult.stats?.total_types,
        total_records: targetTypeResult.stats?.total_records
      })
    }
  } catch (error) {
    appLogger.warn('target_type 校验出错（非致命）', { error: error.message })
  }

  // 步骤5：DisplayNameService 初始化（中文显示名称系统 V4.7 - 2026-01-22）
  try {
    const DisplayNameService = require('./services/DisplayNameService')
    await DisplayNameService.initialize()
    appLogger.info(' DisplayNameService 中文显示名称服务初始化完成')
  } catch (error) {
    appLogger.error('DisplayNameService 初始化失败（非致命）', { error: error.message })
    // 显示名称服务初始化失败不阻断启动，降级为使用内存缓存或直接数据库查询
  }

  // 步骤6：冷启动预热 — 预建 DB 连接池 + Redis 连接 + 高频配置缓存
  /*
   * 背景：Sealos DevBox 容器休眠唤醒后，首个用户请求需等待连接池建立，
   *       导致微信小程序 wx.request 15s 超时。预热确保第一个请求到达时
   *       DB/Redis 连接已就绪，app_theme 等高频配置已在 Redis 缓存中。
   */
  try {
    const { sequelize } = require('./models')
    const { isRedisHealthy } = require('./utils/UnifiedRedisClient')

    // 6a. 预建 DB 连接池（sequelize.authenticate 会触发连接池创建）
    await sequelize.authenticate()
    appLogger.info('冷启动预热: DB 连接池已建立')

    // 6b. 确认 Redis 连接就绪
    const redisReady = await isRedisHealthy()
    appLogger.info('冷启动预热: Redis 连接状态', { ready: redisReady })

    // 6c. 预热高频系统配置到 Redis 缓存（app_theme 是小程序每次启动必调的接口）
    const AdminSystemService = require('./services/AdminSystemService')
    const themeConfig = await AdminSystemService.getConfigValue('app_theme')
    appLogger.info('冷启动预热: app_theme 配置已缓存', {
      theme: themeConfig?.theme || 'default'
    })
  } catch (error) {
    // 预热失败不阻断启动 — 首个请求会触发懒加载，只是慢一点
    appLogger.warn('冷启动预热部分失败（非致命，首个请求将触发懒加载）', {
      error: error.message
    })
  }
}

/*
 *  测试环境自动初始化 ServiceManager
 * 问题：测试通过 require('app') 加载时，initializeApp() 不会被调用
 * 解决：检测测试环境并自动初始化 Service 层
 */
if (process.env.NODE_ENV === 'test' && !app.locals.services) {
  try {
    const models = require('./models')
    const { initializeServices } = require('./services')
    const services = initializeServices(models)
    app.locals.services = services
    app.locals.models = models
    appLogger.info(' 测试环境 Service 层自动初始化完成', {
      services: Array.from(services.getAllServices().keys())
    })
  } catch (error) {
    appLogger.error(' 测试环境 Service 层初始化失败', { error: error.message })
  }
}

//  启动服务器
const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '0.0.0.0'

if (require.main === module) {
  //  使用http.createServer创建服务器实例（支持WebSocket）
  const http = require('http')
  const server = http.createServer(app)

  /*
   * B5（万级并发优化方案B，2026-05-31）：HTTP Keep-Alive 调优
   * - keepAliveTimeout=65000：空闲长连接保持 65 秒，必须大于上游 Nginx 默认 keepalive_timeout(60s)，
   *   避免「Nginx 复用了一条后端已主动关闭的连接」引发的偶发 502。
   * - headersTimeout=66000：略大于 keepAliveTimeout，防止 Node 在等待请求头阶段提前判定超时。
   * 作用：cluster 多 worker 高并发下减少 TCP 三次握手开销、降低 P99 抖动；对前端契约无任何影响。
   */
  server.keepAliveTimeout = 65000
  server.headersTimeout = 66000

  //  先执行初始化（包含预检），再启动服务器监听
  initializeApp()
    .then(() => {
      server.listen(PORT, HOST, async () => {
        console.log(' [DEBUG] 服务器启动监听完成')

        //  初始化聊天WebSocket服务（socket.io 挂载到 HTTP server）
        initializeWebSocket(server)

        //  初始化定时任务（cluster 单 worker 防重，详见 bootstrap/jobs.js）
        startCronJobs()

        //  连接池持续监控（每 60s 打点 + 阈值告警，ENABLE_POOL_MONITORING=false 可关）
        startPoolMonitoring()

        // V4统一决策引擎启动完成
        appLogger.info('天工商户营销平台V4.0统一引擎启动成功', {
          host: HOST,
          port: PORT,
          environment: process.env.NODE_ENV || 'development',
          start_time: BeijingTimeHelper.apiTimestamp(),
          endpoints: {
            health: `http://${HOST}:${PORT}/health`,
            ready: `http://${HOST}:${PORT}/ready`,
            lottery: `http://${HOST}:${PORT}/api/v4/lottery`,
            admin: `http://${HOST}:${PORT}/api/v4/console`,
            websocket: `ws://${HOST}:${PORT}/socket.io`
          }
        })

        //  优雅关闭处理（SIGTERM/SIGINT，WebSocket 停止事件落库）
        registerGracefulShutdown()
      })
    })
    .catch(error => {
      appLogger.error('应用初始化失败', { error: error.message })
      process.exit(1)
    })
}

module.exports = app
