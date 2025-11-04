/**
 * 统一日志工具类（Logger）- Winston增强版
 *
 * 业务场景：统一全项目日志管理，替代分散的console输出，提供结构化的日志记录功能
 *
 * 核心功能：
 * - 支持多级别日志：error（错误）、warn（警告）、info（信息）、debug（调试）
 * - 双重输出：控制台（彩色格式）+ 文件（持久化存储）
 * - 文件日志：combined.log（所有级别）、error.log（仅错误）、模块专用日志文件
 * - 使用北京时间（GMT+8）格式记录时间戳
 * - 支持模块化日志器实例（每个模块独立日志文件）
 * - 支持静态便捷方法（快速替换console.log）
 *
 * 日志级别：
 * - error: 0 - 错误级别，记录系统错误和异常
 * - warn: 1 - 警告级别，记录警告信息
 * - info: 2 - 信息级别，记录常规操作信息（默认级别）
 * - debug: 3 - 调试级别，记录详细调试信息（需设置LOG_LEVEL=debug）
 *
 * 文件存储：
 * - logs/combined.log - 所有级别的日志（最大50MB，保留10个文件）
 * - logs/error.log - 仅错误级别日志（最大10MB，保留5个文件）
 * - logs/{module}.log - 模块专用日志文件（最大20MB，保留3个文件）
 *
 * 创建时间：2025年9月22日
 * 最后更新：2025年10月31日
 * @version 4.1.0
 * @enhancement 集成Winston，统一全项目日志管理
 */

const winston = require('winston')
const path = require('path')
const BeijingTimeHelper = require('../../../utils/timeHelper')

/**
 * 统一日志工具类
 * 职责：提供结构化的日志记录功能，替代分散的console输出
 * 设计模式：单例模式（静态方法）+ 工厂模式（create方法）
 */
class Logger {
  /**
   * 构造函数 - 创建日志器实例
   *
   * 业务场景：为特定模块创建专用的日志器实例，日志会写入对应的模块日志文件
   *
   * @param {string} [module='System'] - 模块名称（用于标识日志来源和文件名），默认为'System'
   *
   * @example
   * // 创建抽奖模块日志器
   * const logger = new Logger('LotteryEngine')
   * logger.info('抽奖开始', { userId: 10001 })
   * // 日志会写入logs/lotteryengine.log文件
   */
  constructor (module = 'System') {
    this.module = module
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    }
    this.currentLevel = process.env.LOG_LEVEL === 'debug' ? 3 : 2

    // 初始化Winston实例
    this.winstonLogger = this.createWinstonLogger()
  }

  /**
   * 创建Winston日志器实例（内部方法）
   *
   * 业务场景：初始化Winston日志器，配置控制台和文件双重输出
   *
   * 配置说明：
   * - 控制台输出：彩色格式，实时显示日志
   * - 文件输出：3个文件（combined.log、error.log、模块专用日志文件）
   * - 日志格式：使用北京时间（GMT+8）格式，包含时间戳、级别、模块名、消息和元数据
   * - 文件大小限制：combined.log（50MB）、error.log（10MB）、模块日志（20MB）
   * - 文件保留策略：combined.log（10个文件）、error.log（5个文件）、模块日志（3个文件）
   *
   * @returns {winston.Logger} Winston日志器实例
   *
   * @example
   * // 内部调用，无需直接使用
   * const logger = new Logger('MyModule')
   * // createWinstonLogger()会在构造函数中自动调用
   */
  createWinstonLogger () {
    // 确保logs目录存在
    const logsDir = path.join(process.cwd(), 'logs')

    // 自定义日志格式 - 保持原有北京时间格式
    const customFormat = winston.format.combine(
      winston.format.timestamp({
        format: () => BeijingTimeHelper.nowLocale()
      }),
      winston.format.printf(({ timestamp, level, message, module, ...meta }) => {
        const prefix = `[${timestamp}] ${level.toUpperCase()}[${module || this.module}]:`
        const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta, null, 2)}` : ''
        return `${prefix} ${message}${metaStr}`
      })
    )

    // 控制台格式 - 添加颜色
    const consoleFormat = winston.format.combine(winston.format.colorize(), customFormat)

    return winston.createLogger({
      level: this.getWinstonLevel(),
      format: customFormat,
      transports: [
        // 控制台输出 - 彩色格式
        new winston.transports.Console({
          format: consoleFormat,
          level: this.getWinstonLevel()
        }),

        // 组合日志文件 - 所有级别
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 10,
          format: customFormat
        }),

        // 错误日志文件 - 仅错误
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          format: customFormat
        }),

        // 模块专用日志文件
        new winston.transports.File({
          filename: path.join(logsDir, `${this.module.toLowerCase()}.log`),
          maxsize: 20 * 1024 * 1024, // 20MB
          maxFiles: 3,
          format: customFormat
        })
      ]
    })
  }

  /**
   * 转换内部日志级别到Winston级别（内部方法）
   *
   * 业务场景：将内部数字级别（0-3）转换为Winston字符串级别（error/warn/info/debug）
   *
   * @returns {string} Winston日志级别字符串
   * @returns {string} 'error' - 当currentLevel为0时
   * @returns {string} 'warn' - 当currentLevel为1时
   * @returns {string} 'info' - 当currentLevel为2时
   * @returns {string} 'debug' - 当currentLevel为3时
   * @returns {string} 'info' - 默认值（当currentLevel不在0-3范围内时）
   *
   * @example
   * // 内部调用，无需直接使用
   * const level = this.getWinstonLevel() // 返回：'info'（默认）
   */
  getWinstonLevel () {
    const levelMap = {
      0: 'error',
      1: 'warn',
      2: 'info',
      3: 'debug'
    }
    return levelMap[this.currentLevel] || 'info'
  }

  /**
   * 格式化日志输出（内部方法）- 使用Winston替代console
   *
   * 业务场景：统一格式化日志输出，使用Winston记录日志，保持原有接口兼容性
   *
   * 日志格式：
   * - 时间戳：使用北京时间（GMT+8）格式
   * - 格式：[时间戳] 级别[模块名]: 消息 {元数据JSON}
   * - 元数据：data对象会序列化为JSON字符串追加到日志消息后
   *
   * @param {string} level - 日志级别（'error'/'warn'/'info'/'debug'）
   * @param {string} message - 日志消息内容
   * @param {Object} [data={}] - 日志元数据对象（可选，默认为空对象）
   * @returns {Object} 日志条目对象（包含timestamp、level、module、message和data）
   *
   * @example
   * // 内部调用，无需直接使用
   * const logEntry = this.formatLog('info', '操作成功', { userId: 10001, action: 'lottery' })
   * // 返回：{ timestamp: '2025-10-31 00:14:55', level: 'INFO', module: 'MyModule', message: '操作成功', userId: 10001, action: 'lottery' }
   */
  formatLog (level, message, data = {}) {
    const timestamp = BeijingTimeHelper.nowLocale()
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      module: this.module,
      message,
      ...data
    }

    // 使用Winston输出，替代原有的console.log
    this.winstonLogger[level](message, {
      module: this.module,
      ...data
    })

    return logEntry
  }

  /**
   * 错误级别日志
   *
   * 业务场景：记录系统错误和异常，用于调试和问题追踪
   *
   * 使用场景：
   * - 捕获异常时记录错误信息
   * - API调用失败时记录错误详情
   * - 业务逻辑错误时记录错误原因
   *
   * @param {string} message - 错误消息内容
   * @param {Object} [data={}] - 错误相关数据对象（可选，默认为空对象），如错误堆栈、请求参数等
   * @returns {Object|undefined} 日志条目对象（当日志级别允许时）或undefined（当日志级别不允许时）
   *
   * @example
   * const logger = new Logger('MyModule')
   * logger.error('数据库连接失败', { host: 'localhost', port: 3306, error: err.message })
   * // 输出：[2025-10-31 00:14:55] ERROR[MyModule]: 数据库连接失败 { "host": "localhost", "port": 3306, "error": "..." }
   */
  error (message, data = {}) {
    if (this.currentLevel >= this.levels.error) {
      return this.formatLog('error', message, data)
    }
  }

  /**
   * 警告级别日志
   *
   * 业务场景：记录警告信息，用于提示潜在问题或异常情况
   *
   * 使用场景：
   * - 参数验证失败但可以继续执行时
   * - 资源使用率过高时
   * - 业务规则边缘情况时
   *
   * @param {string} message - 警告消息内容
   * @param {Object} [data={}] - 警告相关数据对象（可选，默认为空对象）
   * @returns {Object|undefined} 日志条目对象（当日志级别允许时）或undefined（当日志级别不允许时）
   *
   * @example
   * const logger = new Logger('MyModule')
   * logger.warn('积分余额不足', { userId: 10001, balance: 50, required: 100 })
   * // 输出：[2025-10-31 00:14:55] WARN[MyModule]: 积分余额不足 { "userId": 10001, "balance": 50, "required": 100 }
   */
  warn (message, data = {}) {
    if (this.currentLevel >= this.levels.warn) {
      return this.formatLog('warn', message, data)
    }
  }

  /**
   * 信息级别日志（默认级别）
   *
   * 业务场景：记录常规操作信息，用于追踪业务流程和操作记录
   *
   * 使用场景：
   * - 业务操作成功时记录操作信息
   * - API请求处理完成时记录请求信息
   * - 重要状态变更时记录状态信息
   *
   * @param {string} message - 信息消息内容
   * @param {Object} [data={}] - 信息相关数据对象（可选，默认为空对象），如操作参数、结果等
   * @returns {Object|undefined} 日志条目对象（当日志级别允许时）或undefined（当日志级别不允许时）
   *
   * @example
   * const logger = new Logger('MyModule')
   * logger.info('用户抽奖成功', { userId: 10001, prizeId: 20001, prizeName: '100积分' })
   * // 输出：[2025-10-31 00:14:55] INFO[MyModule]: 用户抽奖成功 { "userId": 10001, "prizeId": 20001, "prizeName": "100积分" }
   */
  info (message, data = {}) {
    if (this.currentLevel >= this.levels.info) {
      return this.formatLog('info', message, data)
    }
  }

  /**
   * 调试级别日志（需要设置LOG_LEVEL=debug）
   *
   * 业务场景：记录详细调试信息，用于开发和问题排查
   *
   * 使用场景：
   * - 函数调用参数和返回值
   * - 循环和条件判断的中间状态
   * - 性能分析数据
   *
   * 注意：需要在环境变量中设置LOG_LEVEL=debug才能输出调试日志
   *
   * @param {string} message - 调试消息内容
   * @param {Object} [data={}] - 调试相关数据对象（可选，默认为空对象），如变量值、执行时间等
   * @returns {Object|undefined} 日志条目对象（当LOG_LEVEL=debug时）或undefined（当LOG_LEVEL不为debug时）
   *
   * @example
   * // 设置环境变量：export LOG_LEVEL=debug
   * const logger = new Logger('MyModule')
   * logger.debug('执行抽奖算法', { strategy: 'BasicGuaranteeStrategy', prizes: prizes.length })
   * // 输出：[2025-10-31 00:14:55] DEBUG[MyModule]: 执行抽奖算法 { "strategy": "BasicGuaranteeStrategy", "prizes": 8 }
   */
  debug (message, data = {}) {
    if (this.currentLevel >= this.levels.debug) {
      return this.formatLog('debug', message, data)
    }
  }

  /**
   * 静态方法：获取全局日志器实例（单例模式）
   *
   * 业务场景：获取或创建指定模块的全局日志器实例，同一模块的多次调用返回同一个实例
   *
   * 设计模式：单例模式 - 每个模块只有一个日志器实例，避免重复创建
   *
   * @param {string} [module='Global'] - 模块名称（用于标识日志来源和文件名），默认为'Global'
   * @returns {Logger} 日志器实例（如果模块已存在则返回已有实例，否则创建新实例）
   *
   * @example
   * // 第一次调用：创建新实例
   * const logger1 = Logger.getInstance('MyModule')
   * // 第二次调用：返回已有实例
   * const logger2 = Logger.getInstance('MyModule')
   * // logger1 === logger2 为 true
   */
  static getInstance (module = 'Global') {
    if (!Logger.globalInstances) {
      Logger.globalInstances = new Map()
    }

    if (!Logger.globalInstances.has(module)) {
      Logger.globalInstances.set(module, new Logger(module))
    }

    return Logger.globalInstances.get(module)
  }

  /**
   * 静态方法：快速创建日志器（工厂方法）
   *
   * 业务场景：快速创建指定模块的日志器实例，用于替换项目中的console调用
   *
   * 设计模式：工厂模式 - 封装日志器创建逻辑，简化调用方式
   *
   * @param {string} module - 模块名称（用于标识日志来源和文件名）
   * @returns {Logger} 新的日志器实例
   *
   * @example
   * // 在模块中快速创建日志器
   * const logger = Logger.create('LotteryEngine')
   * logger.info('抽奖引擎启动')
   * // 日志会写入logs/lotteryengine.log文件
   */
  static create (module) {
    return new Logger(module)
  }

  /**
   * 静态便捷方法：快速记录信息日志（用于快速替换console.log）
   *
   * 业务场景：提供与console.log类似的便捷接口，快速记录信息日志
   *
   * 注意：此方法使用'QuickLog'模块名，所有调用都会写入logs/quicklog.log文件
   *
   * @param {string} message - 日志消息内容
   * @param {Object} [data={}] - 日志相关数据对象（可选，默认为空对象）
   * @returns {Object|undefined} 日志条目对象（当日志级别允许时）或undefined
   *
   * @example
   * // 快速替换console.log
   * Logger.log('操作完成', { userId: 10001 })
   * // 等同于：Logger.getInstance('QuickLog').info('操作完成', { userId: 10001 })
   */
  static log (message, data = {}) {
    const globalLogger = Logger.getInstance('QuickLog')
    return globalLogger.info(message, data)
  }

  /**
   * 静态便捷方法：快速记录错误日志
   *
   * 业务场景：提供与console.error类似的便捷接口，快速记录错误日志
   *
   * @param {string} message - 错误消息内容
   * @param {Object} [data={}] - 错误相关数据对象（可选，默认为空对象）
   * @returns {Object|undefined} 日志条目对象（当日志级别允许时）或undefined
   *
   * @example
   * Logger.error('操作失败', { error: err.message })
   */
  static error (message, data = {}) {
    const globalLogger = Logger.getInstance('QuickLog')
    return globalLogger.error(message, data)
  }

  /**
   * 静态便捷方法：快速记录警告日志
   *
   * 业务场景：提供与console.warn类似的便捷接口，快速记录警告日志
   *
   * @param {string} message - 警告消息内容
   * @param {Object} [data={}] - 警告相关数据对象（可选，默认为空对象）
   * @returns {Object|undefined} 日志条目对象（当日志级别允许时）或undefined
   *
   * @example
   * Logger.warn('参数异常', { param: 'userId', value: null })
   */
  static warn (message, data = {}) {
    const globalLogger = Logger.getInstance('QuickLog')
    return globalLogger.warn(message, data)
  }

  /**
   * 静态便捷方法：快速记录信息日志
   *
   * 业务场景：提供与console.info类似的便捷接口，快速记录信息日志
   *
   * @param {string} message - 信息消息内容
   * @param {Object} [data={}] - 信息相关数据对象（可选，默认为空对象）
   * @returns {Object|undefined} 日志条目对象（当日志级别允许时）或undefined
   *
   * @example
   * Logger.info('操作成功', { userId: 10001, action: 'lottery' })
   */
  static info (message, data = {}) {
    const globalLogger = Logger.getInstance('QuickLog')
    return globalLogger.info(message, data)
  }
}

module.exports = Logger
