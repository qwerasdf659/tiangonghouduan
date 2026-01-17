'use strict'

/**
 * BaseStage - Stage 基类
 *
 * 职责：
 * 1. 定义 Stage 的标准接口
 * 2. 提供通用的日志、错误处理、耗时统计功能
 * 3. 确保所有 Stage 遵循统一的执行规范
 *
 * 设计原则：
 * - 每个 Stage 只做一件事（单一职责）
 * - Stage 之间通过 context 传递数据
 * - 只有 SettleStage 可以执行写操作（Single Writer Principle）
 *
 * @module services/UnifiedLotteryEngine/pipeline/stages/BaseStage
 * @author 统一抽奖架构重构
 * @since 2026-01-18
 */

const { logger } = require('../../../../utils/logger')

/**
 * Stage 基类
 */
class BaseStage {
  /**
   * 创建 Stage 实例
   *
   * @param {string} stage_name - Stage 名称
   * @param {Object} options - 配置选项
   * @param {boolean} options.is_writer - 是否为写操作 Stage（默认false）
   * @param {boolean} options.required - 是否为必需 Stage（默认true）
   * @param {boolean} options.enable_logging - 是否启用日志（默认true）
   */
  constructor(stage_name, options = {}) {
    this.stage_name = stage_name
    this.options = {
      is_writer: false,
      required: true,
      enable_logging: true,
      ...options
    }
  }

  /**
   * 执行 Stage（子类必须实现）
   *
   * @param {Object} context - 执行上下文
   * @returns {Promise<Object>} Stage 执行结果
   * @abstract
   */
  async execute(context) {
    throw new Error(`Stage ${this.stage_name} must implement execute(context) method`)
  }

  /**
   * 验证上下文（子类可覆盖）
   *
   * @param {Object} context - 执行上下文
   * @returns {Object} 验证结果 { valid: boolean, errors: string[] }
   */
  validateContext(context) {
    const errors = []

    // 基础验证
    if (!context) {
      errors.push('context is required')
    }

    if (!context.user_id) {
      errors.push('context.user_id is required')
    }

    if (!context.campaign_id) {
      errors.push('context.campaign_id is required')
    }

    return {
      valid: errors.length === 0,
      errors: errors
    }
  }

  /**
   * 创建成功结果
   *
   * @param {Object} data - 结果数据
   * @param {Object} options - 额外选项
   * @returns {Object} 标准化的成功结果
   */
  success(data = {}, options = {}) {
    return {
      success: true,
      stage: this.stage_name,
      data: data,
      should_skip_remaining: options.should_skip_remaining || false,
      skip_reason: options.skip_reason || null,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 创建失败结果
   *
   * @param {string} message - 错误消息
   * @param {string} code - 错误代码
   * @param {Object} details - 错误详情
   * @returns {Object} 标准化的失败结果
   */
  failure(message, code = 'STAGE_ERROR', details = {}) {
    return {
      success: false,
      stage: this.stage_name,
      error: {
        message: message,
        code: code,
        details: details
      },
      timestamp: new Date().toISOString()
    }
  }

  /**
   * 创建错误对象
   *
   * @param {string} message - 错误消息
   * @param {string} code - 错误代码
   * @param {boolean} fatal - 是否为致命错误
   * @returns {Error} 带有额外属性的错误对象
   */
  createError(message, code = 'STAGE_ERROR', fatal = false) {
    const error = new Error(message)
    error.code = code
    error.stage = this.stage_name
    error.fatal = fatal
    return error
  }

  /**
   * 记录日志
   *
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  log(level, message, data = {}) {
    if (!this.options.enable_logging) return

    const log_data = {
      stage: this.stage_name,
      ...data
    }

    if (logger && typeof logger[level] === 'function') {
      logger[level](`[Stage:${this.stage_name}] ${message}`, log_data)
    } else {
      console.log(`[${level.toUpperCase()}] [Stage:${this.stage_name}] ${message}`, log_data)
    }
  }

  /**
   * 获取上下文中的数据（带默认值）
   *
   * @param {Object} context - 执行上下文
   * @param {string} key - 数据键
   * @param {*} default_value - 默认值
   * @returns {*} 数据值或默认值
   */
  getContextData(context, key, default_value = null) {
    if (!context || !context.stage_results) {
      return default_value
    }

    // 支持点号分隔的路径，如 'LoadCampaignStage.data.campaign'
    const parts = key.split('.')
    let value = context.stage_results

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part]
      } else {
        return default_value
      }
    }

    return value
  }

  /**
   * 设置上下文数据
   *
   * @param {Object} context - 执行上下文
   * @param {string} key - 数据键
   * @param {*} value - 数据值
   */
  setContextData(context, key, value) {
    if (!context) return

    if (!context.stage_data) {
      context.stage_data = {}
    }

    context.stage_data[key] = value
  }

  /**
   * 获取 Stage 信息
   *
   * @returns {Object} Stage 信息
   */
  getInfo() {
    return {
      name: this.stage_name,
      is_writer: this.options.is_writer,
      required: this.options.required
    }
  }
}

module.exports = BaseStage

