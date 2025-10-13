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

      // 环境变量
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
        // 🕐 时区设置 - 确保所有时间显示为北京时间
        TZ: 'Asia/Shanghai',
        JWT_SECRET:
          'd40eea7e85733495336cd79fa57f20032259d262483732ae0687dbb3ed5eda4eaf0826f20e55f25975686fa9b1cb978509f51819f840758e658ca09029259c2b',
        JWT_REFRESH_SECRET:
          '197f92d1b1a24fba5db3227d2b1f25419499880dd95c332d2904eab13fdfabccfc775391992cf6bee6d5822c56699b59f876d2108dd00d93df1d838b377a01e0',
        JWT_EXPIRES_IN: '2h',
        JWT_REFRESH_EXPIRES_IN: '7d',
        DB_HOST: 'test-db2-mysql.ns-br0za7uc.svc',
        DB_PORT: '3306',
        DB_NAME: 'test-db2',
        DB_USER: 'root',
        DB_PASSWORD: '2rd2qwng',
        DB_TIMEZONE: '+08:00',
        REDIS_URL: 'redis://localhost:6379'
      },

      // 生产环境变量
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      },

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
  ]
}
