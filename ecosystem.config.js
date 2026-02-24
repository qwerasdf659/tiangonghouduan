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

      // 启动模式
      exec_mode: 'fork', // 单进程模式（开发环境推荐）
      instances: 1, // 进程实例数量

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

      // 内存管理
      max_memory_restart: '512M', // 内存使用超过512M时重启

      // 错误处理
      kill_timeout: 5000, // 强制杀死超时时间
      listen_timeout: 3000, // 监听超时时间

      // Node.js特定配置
      node_args: '--max-old-space-size=512', // 限制Node.js堆内存

      // 健康检查
      health_check_grace_period: 3000,

      // 合并日志
      merge_logs: true,

      // 时间戳
      time: true
    }
    /*
     * daily-asset-reconciliation 已移除（2026-02-24）
     * 原因：资产对账任务已由 scheduled_tasks.js 内部 cron 统一调度（任务12），
     * 无需在 PM2 独立注册。PM2 独立条目 autorestart:false + cron_restart 的组合
     * 在任务退出后 cron_restart 不会重新触发，导致"始终 stopped"的误导状态。
     */
  ]
}
