/**
 * 🔒 权限审计日志系统
 *
 * 功能：
 * 1. 记录权限检查操作（权限审计）
 * 2. 记录权限配置变更（通配符权限滥用检测）
 * 3. 异步写入日志文件（不阻塞业务）
 * 4. 支持轻量级日志查询和分析
 *
 * 创建时间：2025-11-10 北京时间
 * 创建依据：权限检查API实施方案 - P1优先级
 */

const fs = require('fs').promises
const path = require('path')
const BeijingTimeHelper = require('./timeHelper')

/**
 * 权限审计日志类
 * @class PermissionAuditLogger
 */
class PermissionAuditLogger {
  /**
   * 构造函数 - 初始化审计日志系统
   */
  constructor() {
    // 日志文件路径
    this.logDir = path.join(__dirname, '../logs')
    this.permissionCheckLogFile = path.join(this.logDir, 'permission_check_audit.log')
    this.permissionConfigLogFile = path.join(this.logDir, 'permission_config_audit.log')

    // 确保日志目录存在
    this._ensureLogDirectory()

    // 日志统计（用于性能监控）
    this.stats = {
      totalCheckLogs: 0,
      totalConfigLogs: 0,
      writeErrors: 0
    }
  }

  /**
   * 🔐 确保日志目录存在
   * @private
   * @returns {Promise<void>} 创建日志目录
   */
  async _ensureLogDirectory() {
    try {
      await fs.mkdir(this.logDir, { recursive: true })
    } catch (error) {
      console.error('❌ 创建审计日志目录失败:', error.message)
    }
  }

  /**
   * 📝 记录权限检查审计日志
   * @param {Object} data - 权限检查数据
   * @param {number} data.user_id - 用户ID
   * @param {string} data.resource - 资源名称
   * @param {string} data.action - 操作类型
   * @param {boolean} data.has_permission - 是否有权限
   * @param {number} data.role_level - 角色级别（>= 100 为管理员）
   * @param {string} data.ip_address - IP地址
   * @param {string} data.user_agent - 用户代理
   * @param {number} data.batch_count - 批量检查数量（可选）
   * @returns {Promise<void>}
   *
   * 日志格式（JSON Lines格式，每行一个JSON对象）：
   * {"action":"PERMISSION_CHECK","user_id":123,"resource":"lottery","action_type":"participate","has_permission":true,"role_level":0,"ip_address":"127.0.0.1","user_agent":"Mozilla/5.0...","timestamp":"2025-11-10T18:30:00.000+08:00"}
   *
   * 注意：is_admin 字段已移除，使用 role_level >= 100 判断管理员权限
   */
  async logPermissionCheck(data) {
    try {
      const auditLog = {
        action: 'PERMISSION_CHECK', // 操作类型标识
        user_id: data.user_id, // 用户ID
        resource: data.resource, // 资源名称（如lottery、inventory）
        action_type: data.action, // 操作类型（如read、participate）
        has_permission: data.has_permission, // 权限检查结果
        role_level: data.role_level || 0, // 角色级别（>= 100 为管理员）
        ip_address: data.ip_address || 'unknown', // 来源IP地址
        user_agent: data.user_agent || 'unknown', // 用户代理字符串
        timestamp: BeijingTimeHelper.now() // 北京时间时间戳
      }

      // 批量检查时添加额外字段
      if (data.batch_count) {
        auditLog.batch_count = data.batch_count
      }

      // 异步写入日志文件（JSON Lines格式）
      await fs.appendFile(this.permissionCheckLogFile, JSON.stringify(auditLog) + '\n', {
        encoding: 'utf8'
      })

      this.stats.totalCheckLogs++
    } catch (error) {
      this.stats.writeErrors++
      console.error('❌ 权限检查审计日志写入失败:', error.message)
      // 静默失败，不影响业务流程
    }
  }

  /**
   * 📝 记录权限变更审计日志（兼容多种调用方式）
   * @param {Object} data - 权限变更数据
   * @param {number} data.user_id - 用户ID（被操作用户）
   * @param {number} data.operator_id - 操作者ID
   * @param {string} data.change_type - 变更类型（如cache_refresh、role_change等）
   * @param {string} data.old_role - 旧角色
   * @param {string} data.new_role - 新角色
   * @param {string} data.reason - 操作原因
   * @returns {Promise<void>} 异步执行，返回Promise
   */
  async logPermissionChange(data) {
    // 转换为配置变更记录格式
    return this.logPermissionConfig({
      operator_id: data.operator_id,
      target_user_id: data.user_id,
      old_role: data.old_role,
      new_role: data.new_role,
      reason: data.reason || data.change_type || 'unknown',
      ip_address: data.ip_address,
      level: data.level
    })
  }

  /**
   * 🚨 记录权限配置变更审计日志（通配符权限滥用检测）
   * @param {Object} data - 权限配置变更数据
   * @param {number} data.operator_id - 操作者ID
   * @param {number} data.target_user_id - 被操作用户ID
   * @param {string} data.old_role - 旧角色
   * @param {string} data.new_role - 新角色
   * @param {string} data.reason - 操作原因
   * @param {string} data.ip_address - IP地址
   * @param {string} data.level - 日志级别（INFO、WARNING、CRITICAL）
   * @returns {Promise<void>}
   *
   * 日志格式：
   * {"action":"CHANGE_USER_ROLE","operator_id":1,"target_user_id":123,"old_role":"user","new_role":"admin","reason":"用户升级","level":"WARNING","ip_address":"127.0.0.1","timestamp":"2025-11-10T18:30:00.000+08:00"}
   */
  async logPermissionConfig(data) {
    try {
      const auditLog = {
        action: 'CHANGE_USER_ROLE', // 操作类型标识
        operator_id: data.operator_id, // 操作者用户ID
        target_user_id: data.target_user_id, // 被操作的用户ID
        old_role: data.old_role || 'unknown', // 旧角色（如user）
        new_role: data.new_role || 'unknown', // 新角色（如admin）
        reason: data.reason || 'unknown', // 操作原因（如"用户升级"、"权限回收"）
        level: data.level || 'INFO', // 日志级别（INFO、WARNING、CRITICAL）
        ip_address: data.ip_address || 'unknown', // 操作者IP地址
        timestamp: BeijingTimeHelper.now() // 北京时间时间戳
      }

      // 🚨 通配符权限滥用检测（P1优先级）
      if (
        data.new_role === 'admin' ||
        (data.new_permissions && data.new_permissions.includes('*:*'))
      ) {
        auditLog.level = 'WARNING' // 提升日志级别
        auditLog.warning_reason = '授予高危权限（管理员或全局通配符）'
        console.warn(
          `🚨 [安全审计] 用户${data.target_user_id}被授予高危权限: ${data.new_role || '*:*'}`
        )
      }

      // 异步写入日志文件
      await fs.appendFile(this.permissionConfigLogFile, JSON.stringify(auditLog) + '\n', {
        encoding: 'utf8'
      })

      this.stats.totalConfigLogs++
    } catch (error) {
      this.stats.writeErrors++
      console.error('❌ 权限配置审计日志写入失败:', error.message)
      // 静默失败，不影响业务流程
    }
  }

  /**
   * 📊 获取审计日志统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      total_check_logs: this.stats.totalCheckLogs, // 权限检查日志总数
      total_config_logs: this.stats.totalConfigLogs, // 权限配置日志总数
      write_errors: this.stats.writeErrors, // 写入失败次数
      check_log_file: this.permissionCheckLogFile, // 权限检查日志文件路径
      config_log_file: this.permissionConfigLogFile // 权限配置日志文件路径
    }
  }

  /**
   * 🔍 查询最近的权限检查日志（简单实现，生产环境建议使用ELK或Loki）
   * @param {number} limit - 返回记录数量（默认100条）
   * @returns {Promise<Array>} 日志记录数组
   *
   * 注意：此方法仅用于小数据量场景（<10000条日志）
   * 大数据量场景建议使用专业日志分析工具（如ELK、Loki、Grafana）
   */
  async getRecentCheckLogs(limit = 100) {
    try {
      // 读取日志文件
      const content = await fs.readFile(this.permissionCheckLogFile, 'utf8')
      const lines = content.trim().split('\n')

      // 解析最后N条日志
      const recentLines = lines.slice(-limit)
      const logs = recentLines
        .map(line => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(log => log !== null)

      return logs
    } catch (error) {
      if (error.code === 'ENOENT') {
        return [] // 日志文件不存在，返回空数组
      }
      console.error('❌ 读取权限检查日志失败:', error.message)
      throw error
    }
  }

  /**
   * 🔍 查询最近的权限配置日志
   * @param {number} limit - 返回记录数量（默认50条）
   * @returns {Promise<Array>} 日志记录数组
   */
  async getRecentConfigLogs(limit = 50) {
    try {
      const content = await fs.readFile(this.permissionConfigLogFile, 'utf8')
      const lines = content.trim().split('\n')

      const recentLines = lines.slice(-limit)
      const logs = recentLines
        .map(line => {
          try {
            return JSON.parse(line)
          } catch {
            return null
          }
        })
        .filter(log => log !== null)

      return logs
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []
      }
      console.error('❌ 读取权限配置日志失败:', error.message)
      throw error
    }
  }
}

// 导出单例实例
module.exports = new PermissionAuditLogger()
