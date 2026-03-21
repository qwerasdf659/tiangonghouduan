/**
 * 环境变量校验 Schema
 *
 * @description 定义所有环境变量的类型、必需性、默认值和校验规则
 * @file config/schema.js
 *
 * 被 config/validator.js 引用，用于应用启动时的配置完整性校验
 */

/** 配置分类 */
const CONFIG_CATEGORIES = {
  server: '服务器配置',
  database: '数据库配置',
  auth: '认证配置',
  redis: 'Redis配置',
  storage: '对象存储配置',
  wechat: '微信配置',
  sms: '短信配置'
}

/**
 * 环境变量 Schema 定义
 *
 * 每个 key 对应一个 .env 变量，schema 包含：
 * - required: 是否必需
 * - type: 'string' | 'number' | 'boolean'
 * - category: 所属分类（用于分组展示）
 * - description: 中文说明
 * - default: 默认值（仅用于生成模板，不会自动填充）
 * - min/max: 数字类型的范围限制
 * - pattern: 正则校验（可选）
 */
const CONFIG_SCHEMA = {
  // ── 服务器配置 ──
  NODE_ENV: {
    required: true,
    type: 'string',
    category: 'server',
    description: '运行环境',
    default: 'development'
  },
  PORT: {
    required: true,
    type: 'number',
    category: 'server',
    description: 'HTTP 服务端口',
    default: '3000',
    min: 1,
    max: 65535
  },
  TZ: {
    required: false,
    type: 'string',
    category: 'server',
    description: '时区（北京时间）',
    default: 'Asia/Shanghai'
  },

  // ── 数据库配置 ──
  DB_HOST: {
    required: true,
    type: 'string',
    category: 'database',
    description: 'MySQL 主机地址'
  },
  DB_PORT: {
    required: true,
    type: 'number',
    category: 'database',
    description: 'MySQL 端口',
    default: '3306',
    min: 1,
    max: 65535
  },
  DB_USER: {
    required: true,
    type: 'string',
    category: 'database',
    description: 'MySQL 用户名'
  },
  DB_PASSWORD: {
    required: true,
    type: 'string',
    category: 'database',
    description: 'MySQL 密码'
  },
  DB_NAME: {
    required: true,
    type: 'string',
    category: 'database',
    description: '数据库名称',
    default: 'restaurant_points_dev'
  },

  // ── 认证配置 ──
  JWT_SECRET: {
    required: true,
    type: 'string',
    category: 'auth',
    description: 'JWT 签名密钥（≥32字符）'
  },
  JWT_REFRESH_SECRET: {
    required: false,
    type: 'string',
    category: 'auth',
    description: 'JWT 刷新令牌密钥'
  },
  JWT_EXPIRES_IN: {
    required: false,
    type: 'string',
    category: 'auth',
    description: 'JWT 过期时间',
    default: '2h'
  },
  ENCRYPTION_KEY: {
    required: false,
    type: 'string',
    category: 'auth',
    description: '加密密钥（32字符）'
  },

  // ── Redis 配置 ──
  REDIS_URL: {
    required: true,
    type: 'string',
    category: 'redis',
    description: 'Redis 连接 URL',
    default: 'redis://localhost:6379'
  },

  // ── Sealos 对象存储 ──
  SEALOS_ENDPOINT: {
    required: false,
    type: 'string',
    category: 'storage',
    description: 'Sealos 对象存储外部端点'
  },
  SEALOS_BUCKET: {
    required: false,
    type: 'string',
    category: 'storage',
    description: 'Sealos 存储桶名称'
  },
  SEALOS_ACCESS_KEY: {
    required: false,
    type: 'string',
    category: 'storage',
    description: 'Sealos AccessKey'
  },
  SEALOS_SECRET_KEY: {
    required: false,
    type: 'string',
    category: 'storage',
    description: 'Sealos SecretKey'
  },

  // ── 微信配置 ──
  WX_APPID: {
    required: false,
    type: 'string',
    category: 'wechat',
    description: '微信小程序 AppID'
  },
  WX_SECRET: {
    required: false,
    type: 'string',
    category: 'wechat',
    description: '微信小程序 AppSecret'
  }
}

module.exports = { CONFIG_SCHEMA, CONFIG_CATEGORIES }
