/**
 * 餐厅积分抽奖系统 - 环境变量权威 Schema
 *
 * @description 所有环境变量的"必需性、类型、范围、环境差异"在此统一定义
 * @version 1.0.0
 * @created 2025-12-30
 *
 * 使用方式：
 * - 应用启动、脚本检查、CI 检查都引用同一份 schema
 * - 支持按环境分级（dev 可选、prod 必需）
 *
 * 参考文档：docs/配置管理三层分离与校验统一方案.md
 */

/**
 * 环境变量 Schema 定义
 *
 * Schema 字段说明：
 * - type: 类型（'string' | 'number' | 'boolean' | 'enum'）
 * - required: 是否必需（true | false）
 * - default: 默认值（null 表示不允许默认值，必须显式配置）
 * - allowedValues: 枚举类型的允许值列表
 * - pattern: 字符串格式正则表达式
 * - minLength/maxLength: 字符串长度限制
 * - min/max: 数字范围限制
 * - envDiff: 是否不同环境值不同
 * - description: 配置项说明
 * - production: 生产环境特殊约束（forbiddenValues, minLength, mustDifferFrom）
 */
const CONFIG_SCHEMA = {
  // ===== 运行环境 =====
  NODE_ENV: {
    type: 'enum',
    required: true,
    allowedValues: ['development', 'staging', 'production', 'test'],
    default: null, // 不允许默认值，必须显式配置
    envDiff: false, // 所有环境必须配置
    description: '运行环境标识（development/staging/production）'
  },

  PORT: {
    type: 'number',
    required: true,
    min: 1,
    max: 65535,
    default: 3000, // 允许默认值
    envDiff: false,
    description: 'HTTP 服务端口'
  },

  HOST: {
    type: 'string',
    required: false,
    default: '0.0.0.0',
    envDiff: false,
    description: '监听地址'
  },

  TZ: {
    type: 'string',
    required: true,
    default: 'Asia/Shanghai', // 固定北京时间
    envDiff: false,
    description: '时区设置（固定 Asia/Shanghai）'
  },

  // ===== 数据库配置 =====
  DB_HOST: {
    type: 'string',
    required: true,
    pattern: /^[a-zA-Z0-9.-]+$/,
    envDiff: true, // 不同环境值不同
    description: 'MySQL 数据库主机地址',
    production: {
      forbiddenValues: ['localhost', '127.0.0.1'] // 生产禁止本地
    }
  },

  DB_PORT: {
    type: 'number',
    required: true,
    min: 1,
    max: 65535,
    default: 3306,
    envDiff: true,
    description: 'MySQL 数据库端口'
  },

  DB_NAME: {
    type: 'string',
    required: true,
    minLength: 1,
    envDiff: true,
    description: '数据库名称'
  },

  DB_USER: {
    type: 'string',
    required: true,
    minLength: 1,
    envDiff: true,
    description: '数据库用户名'
  },

  DB_PASSWORD: {
    type: 'string',
    required: true,
    minLength: 1, // 开发环境最短 1 字符
    envDiff: true,
    description: '数据库密码',
    production: {
      minLength: 8, // 生产环境最短 8 字符
      forbiddenValues: ['password', '123456', 'root', 'admin', ''] // 弱密码黑名单
    }
  },

  // ===== Redis 缓存配置 =====
  REDIS_URL: {
    type: 'string',
    required: true,
    pattern: /^rediss?:\/\/.+/, // 必须是 redis:// 或 rediss:// 格式
    envDiff: true,
    description: 'Redis 连接 URL（格式：redis://host:port 或 redis://:password@host:port/db）'
  },

  // ===== JWT 认证配置 =====
  JWT_SECRET: {
    type: 'string',
    required: true,
    minLength: 32, // 强制 32 字符
    envDiff: true,
    description: 'JWT 签名密钥（至少 32 字符）',
    production: {
      forbiddenValues: ['development_secret', 'dev_secret', 'CHANGE_ME_*', 'your_*'] // 占位符黑名单
    }
  },

  JWT_REFRESH_SECRET: {
    type: 'string',
    required: true,
    minLength: 32,
    envDiff: true,
    description: 'JWT 刷新令牌密钥（至少 32 字符）',
    production: {
      mustDifferFrom: ['JWT_SECRET'] // 生产环境必须与 JWT_SECRET 不同
    }
  },

  JWT_EXPIRES_IN: {
    type: 'string',
    required: false,
    default: '2h',
    pattern: /^\d+[smhd]?$/, // 格式：数字+单位（s/m/h/d）
    envDiff: false,
    description: 'JWT Token 有效期（默认 2h）'
  },

  JWT_REFRESH_EXPIRES_IN: {
    type: 'string',
    required: false,
    default: '7d',
    pattern: /^\d+[smhd]?$/,
    envDiff: false,
    description: 'JWT 刷新令牌有效期（默认 7d）'
  },

  // ===== 加密配置 =====
  ENCRYPTION_KEY: {
    type: 'string',
    required: true,
    minLength: 32, // 固定 32 字符
    maxLength: 32,
    envDiff: true,
    description: '数据加密密钥（必须 32 字符）',
    production: {
      forbiddenValues: ['CHANGE_ME_*', 'your_*'] // 占位符黑名单
    }
  },

  // ===== Sealos 对象存储配置 =====
  SEALOS_ENDPOINT: {
    type: 'string',
    required: true,
    minLength: 1,
    envDiff: true,
    description: 'Sealos 对象存储端点',
    production: {
      forbiddenValues: ['CHANGE_ME_*', 'your_*']
    }
  },

  SEALOS_INTERNAL_ENDPOINT: {
    type: 'string',
    required: false, // 可选，仅 Sealos 部署需要
    envDiff: true,
    description: 'Sealos 内网端点（仅 Sealos 部署需要）'
  },

  SEALOS_BUCKET: {
    type: 'string',
    required: true,
    minLength: 1,
    envDiff: true,
    description: 'Sealos 存储桶名称',
    production: {
      forbiddenValues: ['CHANGE_ME_*', 'your_*']
    }
  },

  SEALOS_ACCESS_KEY: {
    type: 'string',
    required: true,
    minLength: 8,
    envDiff: true,
    description: 'Sealos 访问密钥',
    production: {
      forbiddenValues: ['CHANGE_ME_*', 'your_*']
    }
  },

  SEALOS_SECRET_KEY: {
    type: 'string',
    required: true,
    minLength: 8,
    envDiff: true,
    description: 'Sealos 密钥',
    production: {
      forbiddenValues: ['CHANGE_ME_*', 'your_*']
    }
  },

  SEALOS_REGION: {
    type: 'string',
    required: true,
    minLength: 1,
    envDiff: true,
    description: 'Sealos 区域',
    production: {
      forbiddenValues: ['CHANGE_ME_*', 'your_*']
    }
  },

  // ===== 微信小程序配置 =====
  WX_APPID: {
    type: 'string',
    required: true,
    pattern: /^wx[a-z0-9]{16}$/, // 微信 AppID 格式
    envDiff: true,
    description: '微信小程序 AppID'
  },

  WX_SECRET: {
    type: 'string',
    required: true,
    minLength: 32,
    envDiff: true,
    description: '微信小程序 AppSecret'
  },

  // ===== CORS 白名单 =====
  ALLOWED_ORIGINS: {
    type: 'string',
    required: true,
    minLength: 1,
    envDiff: true,
    description: 'CORS 允许的域名列表（逗号分隔）'
  },

  // ===== 日志配置 =====
  LOG_LEVEL: {
    type: 'enum',
    required: false,
    allowedValues: ['debug', 'info', 'warn', 'error'],
    default: null, // 按环境自动决定
    envDiff: true,
    description: '日志级别（debug/info/warn/error）'
  },

  // ===== 性能监控 =====
  ENABLE_POOL_MONITORING: {
    type: 'boolean',
    required: false,
    default: true,
    envDiff: false,
    description: '是否启用连接池监控'
  },

  // ===== 可选配置 =====
  API_BASE_URL: {
    type: 'string',
    required: false,
    envDiff: true,
    description: 'API 基础 URL（可选）'
  },

  WS_PORT: {
    type: 'number',
    required: false,
    min: 1,
    max: 65535,
    default: 10081,
    envDiff: false,
    description: 'WebSocket 端口（可选）'
  },

  DISABLE_RATE_LIMITER: {
    type: 'boolean',
    required: false,
    default: false,
    envDiff: true,
    description: '是否禁用速率限制（仅开发环境可用）'
  },

  // ===== OCR 服务配置（可选） =====
  OCR_PROVIDER: {
    type: 'string',
    required: false,
    envDiff: true,
    description: 'OCR 服务提供商（baidu_ocr 等）'
  },

  OCR_API_KEY: {
    type: 'string',
    required: false,
    envDiff: true,
    description: 'OCR 服务 API Key'
  },

  OCR_SECRET_KEY: {
    type: 'string',
    required: false,
    envDiff: true,
    description: 'OCR 服务 Secret Key'
  },

  // ===== 短信服务配置（生产环境必需） =====
  SMS_PROVIDER: {
    type: 'string',
    required: false, // 开发环境可选，使用万能验证码
    envDiff: true,
    description: '短信服务提供商（aliyun_sms 等）'
  },

  SMS_ACCESS_KEY: {
    type: 'string',
    required: false,
    envDiff: true,
    description: '短信服务访问密钥'
  },

  SMS_SECRET_KEY: {
    type: 'string',
    required: false,
    envDiff: true,
    description: '短信服务密钥'
  },

  SMS_SIGN_NAME: {
    type: 'string',
    required: false,
    envDiff: true,
    description: '短信签名名称'
  },

  SMS_TEMPLATE_CODE: {
    type: 'string',
    required: false,
    envDiff: true,
    description: '短信模板代码'
  }
}

/**
 * 按分类组织的环境变量
 * 用于生成 config.example 模板
 */
const CONFIG_CATEGORIES = {
  运行环境: ['NODE_ENV', 'PORT', 'HOST', 'TZ'],
  数据库配置: ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'],
  缓存配置: ['REDIS_URL'],
  JWT配置: ['JWT_SECRET', 'JWT_REFRESH_SECRET', 'JWT_EXPIRES_IN', 'JWT_REFRESH_EXPIRES_IN'],
  加密配置: ['ENCRYPTION_KEY'],
  对象存储: [
    'SEALOS_ENDPOINT',
    'SEALOS_INTERNAL_ENDPOINT',
    'SEALOS_BUCKET',
    'SEALOS_ACCESS_KEY',
    'SEALOS_SECRET_KEY',
    'SEALOS_REGION'
  ],
  微信小程序: ['WX_APPID', 'WX_SECRET'],
  CORS白名单: ['ALLOWED_ORIGINS'],
  日志配置: ['LOG_LEVEL'],
  性能监控: ['ENABLE_POOL_MONITORING'],
  OCR服务: ['OCR_PROVIDER', 'OCR_API_KEY', 'OCR_SECRET_KEY'],
  短信服务: [
    'SMS_PROVIDER',
    'SMS_ACCESS_KEY',
    'SMS_SECRET_KEY',
    'SMS_SIGN_NAME',
    'SMS_TEMPLATE_CODE'
  ]
}

/**
 * 获取所有必需的环境变量列表
 *
 * @param {string} _targetEnv - 目标环境（development/staging/production）
 * @returns {string[]} 必需的环境变量列表
 */
function getRequiredKeys(_targetEnv = 'development') {
  return Object.entries(CONFIG_SCHEMA)
    .filter(([, schema]) => schema.required)
    .map(([key]) => key)
}

/**
 * 获取所有可选的环境变量列表
 *
 * @returns {string[]} 可选的环境变量列表
 */
function getOptionalKeys() {
  return Object.entries(CONFIG_SCHEMA)
    .filter(([, schema]) => !schema.required)
    .map(([key]) => key)
}

module.exports = {
  CONFIG_SCHEMA,
  CONFIG_CATEGORIES,
  getRequiredKeys,
  getOptionalKeys
}
