/**
 * 数据库连接管理器 V4
 * 专门负责数据库连接的建立、维护和监控
 * 从UnifiedDatabaseHelper中拆分的连接管理职责
 * 创建时间：2025年01月21日 北京时间
 */

const { Sequelize } = require('sequelize')

class DatabaseConnectionManager {
  constructor () {
    // 单例模式
    if (DatabaseConnectionManager.instance) {
      return DatabaseConnectionManager.instance
    }

    // 创建Sequelize实例
    this.sequelize = new Sequelize(
      process.env.DB_NAME || 'restaurant_points_dev',
      process.env.DB_USER || 'root',
      process.env.DB_PASSWORD || '',
      {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        dialect: 'mysql',
        timezone: '+08:00', // 北京时间
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000
        },
        define: {
          timestamps: true,
          underscored: true,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      }
    )

    // 连接状态
    this.isConnected = false
    this.connectionPromise = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 3

    DatabaseConnectionManager.instance = this
    console.log('[DatabaseConnectionManager] 初始化完成')
  }

  /**
   * 确保数据库连接
   * @returns {Promise<Sequelize>} 连接的Sequelize实例
   */
  async ensureConnection () {
    if (this.isConnected) {
      return this.sequelize
    }

    if (!this.connectionPromise) {
      this.connectionPromise = this.connect()
    }

    await this.connectionPromise
    return this.sequelize
  }

  /**
   * 连接数据库
   * @returns {Promise<void>}
   */
  async connect () {
    try {
      await this.sequelize.authenticate()
      this.isConnected = true
      this.reconnectAttempts = 0
      console.log(`[DatabaseConnectionManager] 数据库连接成功: ${process.env.DB_NAME}`)
    } catch (error) {
      console.error('[DatabaseConnectionManager] 数据库连接失败:', error.message)
      await this.handleConnectionError(error)
    }
  }

  /**
   * 处理连接错误
   * @param {Error} error 连接错误
   */
  async handleConnectionError (error) {
    this.reconnectAttempts++

    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      console.log(`[DatabaseConnectionManager] 尝试重新连接 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

      // 指数退避重试
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 10000)
      await new Promise(resolve => {
        setTimeout(resolve, delay)
      })

      this.connectionPromise = null
      await this.ensureConnection()
    } else {
      console.error('[DatabaseConnectionManager] 达到最大重连次数，连接失败')
      throw error
    }
  }

  /**
   * 关闭数据库连接
   */
  async disconnect () {
    if (this.sequelize) {
      await this.sequelize.close()
      this.isConnected = false
      this.connectionPromise = null
      console.log('[DatabaseConnectionManager] 数据库连接已关闭')
    }
  }

  /**
   * 获取连接状态
   * @returns {Object} 连接状态信息
   */
  getConnectionStatus () {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      database: process.env.DB_NAME,
      host: process.env.DB_HOST,
      port: process.env.DB_PORT
    }
  }

  /**
   * 测试连接
   * @returns {Promise<boolean>} 连接是否正常
   */
  async testConnection () {
    try {
      await this.sequelize.authenticate()
      return true
    } catch (error) {
      console.error('[DatabaseConnectionManager] 连接测试失败:', error.message)
      return false
    }
  }

  /**
   * 获取Sequelize实例
   * @returns {Sequelize} Sequelize实例
   */
  getSequelize () {
    return this.sequelize
  }
}

// 导出单例实例获取函数
let connectionManager = null

function getConnectionManager () {
  if (!connectionManager) {
    connectionManager = new DatabaseConnectionManager()
  }
  return connectionManager
}

module.exports = {
  DatabaseConnectionManager,
  getConnectionManager
}
