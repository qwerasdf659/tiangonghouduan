/**
 * 环境配置管理器
 *
 * @description 统一管理不同环境的配置，提供环境感知能力
 * @file config/environment.js
 * @date 2025-11-23
 *
 * 注意：dotenv只在app.js中加载一次（单一真相源方案）
 * 参考：docs/Devbox单环境统一配置方案.md
 */

const path = require('path')

/**
 * 当前环境
 */
const NODE_ENV = process.env.NODE_ENV || 'development'

/**
 * 环境配置映射
 */
const ENV_CONFIG = {
  development: {
    name: 'development',
    displayName: '开发环境',
    cache: {
      static: {
        enabled: false,
        maxAge: 0,
        etag: false
      },
      api: {
        enabled: true,
        ttl: 300 // 5分钟
      }
    },
    debug: true,
    verbose: true
  },

  staging: {
    name: 'staging',
    displayName: '测试环境',
    cache: {
      static: {
        enabled: true,
        maxAge: '5m',
        etag: true
      },
      api: {
        enabled: true,
        ttl: 600 // 10分钟
      }
    },
    debug: true,
    verbose: false
  },

  production: {
    name: 'production',
    displayName: '生产环境',
    cache: {
      static: {
        enabled: true,
        maxAge: '1h',
        etag: true
      },
      api: {
        enabled: true,
        ttl: 3600 // 1小时
      }
    },
    debug: false,
    verbose: false
  }
}

/**
 * 获取当前环境配置
 *
 * @returns {Object} 当前环境配置对象
 */
function getCurrentConfig() {
  const config = ENV_CONFIG[NODE_ENV]

  if (!config) {
    console.warn(`⚠️ 未知环境: ${NODE_ENV}，使用development配置`)
    return ENV_CONFIG.development
  }

  return config
}

/**
 * 验证环境配置
 *
 * @description 检查必需的环境变量是否存在（单一真相源方案）
 * @throws {Error} 缺少必需环境变量时抛出错误
 * @returns {void} 无返回值，验证失败时直接退出进程
 *
 * Redis配置规范（docs/Devbox单环境统一配置方案.md）：
 * - 统一使用REDIS_URL，不再支持REDIS_HOST/REDIS_PORT
 * - 所有环境必须配置Redis（fail-fast，不允许降级运行）
 * - 检测到旧配置时报错提示删除
 */
function validateConfig() {
  // 必需的环境变量（包含REDIS_URL）
  const required = ['NODE_ENV', 'PORT', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'REDIS_URL']

  const missing = required.filter(key => !process.env[key])

  if (missing.length > 0) {
    console.error('❌ 缺少必需的环境变量:')
    missing.forEach(key => console.error(`   - ${key}`))
    if (missing.includes('REDIS_URL')) {
      console.error('   提示：REDIS_URL格式示例 - redis://localhost:6379')
    }
    process.exit(1)
  }

  // 检测到已废弃的旧配置时报错（不兼容旧写法）
  if (process.env.REDIS_HOST || process.env.REDIS_PORT) {
    console.error('❌ 检测到已废弃的Redis配置:')
    if (process.env.REDIS_HOST) console.error('   - REDIS_HOST（已废弃，请删除）')
    if (process.env.REDIS_PORT) console.error('   - REDIS_PORT（已废弃，请删除）')
    console.error('   请只使用 REDIS_URL 配置Redis连接')
    console.error('   参考：docs/Devbox单环境统一配置方案.md')
    process.exit(1)
  }

  console.log(`✅ 环境配置验证通过: ${getCurrentConfig().displayName}`)
}

/**
 * 获取静态文件缓存配置（express.static options）
 *
 * @description 根据当前环境返回适当的express.static配置
 * @returns {Object} express.static配置对象
 */
function getStaticCacheConfig() {
  const config = getCurrentConfig()
  const staticConfig = config.cache.static

  return {
    index: false,
    maxAge: staticConfig.enabled ? staticConfig.maxAge : 0,
    etag: staticConfig.enabled ? staticConfig.etag : false,
    lastModified: true,
    dotfiles: 'ignore',
    redirect: false,
    setHeaders: (res, filePath) => {
      // 开发环境强制禁用缓存
      if (!staticConfig.enabled) {
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate')
        res.set('Pragma', 'no-cache')
        res.set('Expires', '0')
      }

      // 生产环境对不同文件类型设置不同缓存策略
      if (NODE_ENV === 'production') {
        const ext = path.extname(filePath)

        // HTML文件：短缓存（5分钟）
        if (ext === '.html') {
          res.set('Cache-Control', 'public, max-age=300')
        } else if (ext === '.css' || ext === '.js') {
          // CSS/JS文件：长缓存（1小时）
          res.set('Cache-Control', 'public, max-age=3600')
        } else if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico'].includes(ext)) {
          // 图片文件：超长缓存（1天）
          res.set('Cache-Control', 'public, max-age=86400')
        }
      }
    }
  }
}

/**
 * 打印环境配置信息
 *
 * @description 在控制台输出当前环境的配置详情
 * @returns {void} 无返回值，仅输出信息到控制台
 */
function printConfig() {
  const config = getCurrentConfig()

  console.log('\n' + '='.repeat(50))
  console.log('  环境配置信息')
  console.log('='.repeat(50))
  console.log(`环境: ${config.displayName} (${config.name})`)
  console.log(`端口: ${process.env.PORT}`)
  console.log(`静态文件缓存: ${config.cache.static.enabled ? '启用' : '禁用'}`)

  if (config.cache.static.enabled) {
    console.log(`  - 缓存时长: ${config.cache.static.maxAge}`)
    console.log(`  - ETag: ${config.cache.static.etag ? '启用' : '禁用'}`)
  } else {
    console.log('  - Cache-Control: no-cache, no-store, must-revalidate')
  }

  console.log(`API缓存TTL: ${config.cache.api.ttl}秒`)
  console.log(`调试模式: ${config.debug ? '启用' : '禁用'}`)
  console.log('='.repeat(50) + '\n')
}

module.exports = {
  NODE_ENV,
  ENV_CONFIG,
  getCurrentConfig,
  validateConfig,
  getStaticCacheConfig,
  printConfig,

  // 便捷方法
  isDevelopment: () => NODE_ENV === 'development',
  isStaging: () => NODE_ENV === 'staging',
  isProduction: () => NODE_ENV === 'production'
}
