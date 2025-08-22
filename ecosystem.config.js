/**
 * PM2进程管理配置文件
 * 餐厅积分抽奖系统 v3.0
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

      // 启动模式
      exec_mode: 'fork', // 单进程模式（开发环境推荐）
      instances: 1, // 进程实例数量

      // 环境变量
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },

      // 生产环境变量
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },

      // 进程管理配置
      watch: false, // 禁用文件监控（避免开发时频繁重启）
      ignore_watch: ['node_modules', 'logs', '*.log'],

      // 日志配置
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

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
  ]
}
