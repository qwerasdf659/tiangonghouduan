/**
 * PM2进程管理配置文件
 * 餐厅积分抽奖系统 V4.0统一引擎架构
 * 创建时间：2025年08月10日
 */

module.exports = {
  apps: [
    {
      // 应用名称
      name: 'restaurant-lottery-backend',

      // 启动脚本
      script: 'app.js',

      // 运行目录
      cwd: '/home/devbox/project',

      // 🔧 加载.env文件
      env_file: '.env',

      /*
       * 启动模式（R5/D1 万级并发优化方案B，2026-05-30）
       * - cluster 模式：PM2 自动负载均衡到多核，每个 worker 独立进程
       * - instances: 4（D1 拍板：先 4 观察一两周，稳定后再到 8）
       *   连接安全：4 worker × DB 连接池 20 = 80 连接，远低于 MySQL max_connections=2400
       * - 开 cluster 的安全前提（R1-R4/R6/R11）已全部完成：
       *   R1 定时任务单 worker 守卫（app.js isCronWorker）、R2 抽奖去重走 Redis、
       *   R3 Socket.IO Redis Adapter、R4 配置缓存 30s TTL 收敛、
       *   R6 WebSocket 推送改 room 机制、R11 transports=['websocket'] 免 sticky
       * - 注意：本地 `npm run dev`(nodemon) 仍是单进程 fork，不受此处影响；
       *   cluster 仅在 `npm run pm:start:pm2` 经 PM2 启动时生效
       */
      exec_mode: 'cluster',
      instances: 4,

      // ✅ env 完全清空 - 所有配置只来自 .env 文件（单一真相源）
      // 不保留任何业务配置或默认值，包括 NODE_ENV/PORT/TZ
      // 参考：docs/Devbox单环境统一配置方案.md

      // 进程管理配置
      watch: false, // 禁用文件监控（避免开发时频繁重启）
      ignore_watch: ['node_modules', 'logs', '*.log'],

      // 日志配置 - 使用北京时间
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss [+08:00]', // 🕐 北京时间格式

      // 自动重启配置
      autorestart: true, // 自动重启
      max_restarts: 10, // 最大重启次数
      min_uptime: '10s', // 最小运行时间

      // 内存管理（R5：cluster 下每进程提升到 2048M，充分利用机器内存）
      max_memory_restart: '2048M', // 内存使用超过2048M时重启

      // 错误处理
      kill_timeout: 5000, // 强制杀死超时时间
      listen_timeout: 3000, // 监听超时时间

      /*
       * Node.js 运行时调优（R5/B4）
       * - max-old-space-size=2048：每进程 2GB 堆内存（原 512M）
       * - max-semi-space-size=128：新生代空间 128MB（默认16MB），减少 Minor GC 频率、降低请求延迟抖动
       */
      node_args: '--max-old-space-size=2048 --max-semi-space-size=128',

      // 健康检查
      health_check_grace_period: 3000,

      // 合并日志
      merge_logs: true,

      // 时间戳
      time: true
    },
    /*
     * Redis 守护进程（D3′ 省心档：PM2 自动拉起，2026-05-30）
     * 背景：本 devbox 的 PID 1 是 dumb-init（无 systemd），原 redis 是 `--daemonize yes` 裸跑，
     *      挂掉无人拉起。改由 PM2 统一守护，redis 崩溃后 autorestart 自动重启。
     * 关键：
     * - 前台运行（--daemonize no），PM2 才能监控进程生命周期
     * - appendonly yes：开启 AOF 持久化（数据落 appendonlydir/，已在 .gitignore）
     * - dir 指向项目目录，与现有 dump.rdb/appendonlydir 一致
     * - 仅监听本机 6379，与 .env REDIS_URL=redis://localhost:6379 对齐
     */
    {
      name: 'redis-server',
      script: 'redis-server',
      args: '--port 6379 --dir /home/devbox/project --appendonly yes --appendfsync everysec --daemonize no --loglevel warning',
      cwd: '/home/devbox/project',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_restarts: 20,
      min_uptime: '5s',
      watch: false,
      merge_logs: true,
      time: true,
      out_file: './logs/redis-out.log',
      error_file: './logs/redis-error.log'
    }
    /*
     * daily-asset-reconciliation 已移除（2026-02-24）
     * 原因：资产对账任务已由 scheduled_tasks.js 内部 cron 统一调度（任务12），
     * 无需在 PM2 独立注册。PM2 独立条目 autorestart:false + cron_restart 的组合
     * 在任务退出后 cron_restart 不会重新触发，导致"始终 stopped"的误导状态。
     */
  ]
}
