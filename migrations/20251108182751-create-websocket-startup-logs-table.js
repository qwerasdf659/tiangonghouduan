/**
 * 餐厅积分抽奖系统 V4.0 - 数据库迁移
 *
 * 迁移名称：创建websocket_startup_logs表（WebSocket服务启动日志）
 * 迁移类型：create-table（创建新表）
 * 版本号：v4.1.1
 * 创建时间：2025-11-08
 *
 * 变更说明：
 * 1. 创建websocket_startup_logs表，记录WebSocket服务启动/停止事件
 * 2. 支持uptime运行时长计算（通过start_time字段）
 * 3. 记录服务状态（running/stopped/crashed）
 * 4. 记录峰值连接数和总消息数
 * 5. 支持服务器信息（IP、主机名、进程ID）
 *
 * 业务场景：
 * - 客服聊天系统监控（实时显示在线客服数，合理分配客服资源）
 * - 系统健康检查（监控WebSocket服务是否正常，服务挂了立即告警）
 * - 管理后台仪表板（展示在线用户数、客服数、服务运行时长）
 * - 负载评估决策（当连接数>4000时触发扩容告警）
 * - 服务稳定性监控（uptime<1小时且之前>10小时=频繁重启=服务不稳定）
 * - SLA统计（服务可用性统计，99.5%目标）
 *
 * 设计模式：
 * - 与AdminOperationLog、RoleChangeLog保持一致
 * - 数据持久化：永久保存启动/停止记录
 * - 审计追踪：记录服务启动时间、停止时间、运行时长
 *
 * 依赖关系：
 * - 无依赖（独立表）
 *
 * 影响范围：
 * - 创建websocket_startup_logs表
 * - 需要同步修改ChatWebSocketService服务
 * - 需要同步修改/api/v4/system/chat/ws-status路由
 */

'use strict'

module.exports = {
  /**
   * 执行迁移（up方向）
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始创建websocket_startup_logs表...')

      /*
       * ========================================
       * 第1步：创建websocket_startup_logs表
       * ========================================
       */
      console.log('步骤1：创建表结构')

      await queryInterface.createTable(
        'websocket_startup_logs',
        {
          // 主键
          log_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '日志ID（主键）'
          },

          // 启动信息
          start_time: {
            type: Sequelize.DATE,
            allowNull: false,
            comment: '服务启动时间（北京时间）'
          },
          process_id: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '进程ID（process.pid）'
          },
          server_ip: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '服务器IP地址'
          },
          server_hostname: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '服务器主机名'
          },

          // 状态信息
          status: {
            type: Sequelize.ENUM('running', 'stopped', 'crashed'),
            defaultValue: 'running',
            allowNull: false,
            comment: '服务状态：running-运行中，stopped-正常停止，crashed-异常崩溃'
          },
          stop_time: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '服务停止时间（北京时间）'
          },
          stop_reason: {
            type: Sequelize.STRING(200),
            allowNull: true,
            comment: '停止原因（如：部署、重启、崩溃等）'
          },

          // 运行时长（冗余字段，方便查询）
          uptime_seconds: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '运行时长（秒），stop_time - start_time'
          },

          // 连接统计（停止时记录）
          peak_connections: {
            type: Sequelize.INTEGER,
            defaultValue: 0,
            allowNull: false,
            comment: '峰值连接数（服务运行期间的最大连接数）'
          },
          total_messages: {
            type: Sequelize.BIGINT,
            defaultValue: 0,
            allowNull: false,
            comment: '总消息数（服务运行期间的总消息数）'
          },

          // 审计信息（与AdminOperationLog保持一致）
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '记录创建时间（北京时间）'
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: true,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
            comment: '记录更新时间（服务停止时更新）'
          }
        },
        {
          transaction,
          comment: 'WebSocket服务启动日志表（记录所有启动/停止事件）',
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci'
        }
      )

      console.log('  ✅ 表创建成功: websocket_startup_logs')

      /*
       * ========================================
       * 第2步：创建索引
       * ========================================
       */
      console.log('步骤2：创建索引')

      // 检查索引是否存在的辅助函数
      const createIndexSafely = async (tableName, indexName, fields, options = {}) => {
        try {
          // 查询现有索引
          const [indexes] = await queryInterface.sequelize.query(
            `SHOW INDEX FROM ${tableName} WHERE Key_name = '${indexName}'`,
            { transaction }
          )

          if (indexes && indexes.length > 0) {
            console.log(`  索引已存在，跳过: ${indexName}`)
            return
          }

          // 创建索引
          await queryInterface.addIndex(tableName, fields, {
            ...options,
            name: indexName,
            transaction
          })
          console.log(`  ✅ 索引创建成功: ${indexName}`)
        } catch (error) {
          if (error.message.includes('Duplicate key name')) {
            console.log(`  索引已存在，跳过: ${indexName}`)
          } else {
            throw error
          }
        }
      }

      // 创建索引
      await createIndexSafely('websocket_startup_logs', 'idx_start_time', ['start_time'])

      await createIndexSafely('websocket_startup_logs', 'idx_status', ['status'])

      await createIndexSafely('websocket_startup_logs', 'idx_created_at', ['created_at'])

      await createIndexSafely('websocket_startup_logs', 'idx_process_id', ['process_id'])

      /*
       * ========================================
       * 第3步：验证表结构
       * ========================================
       */
      console.log('步骤3：验证表结构')

      const [tableInfo] = await queryInterface.sequelize.query('DESCRIBE websocket_startup_logs', {
        transaction
      })

      console.log('  ✅ 表结构验证通过，字段数量:', tableInfo.length)

      // 提交事务
      await transaction.commit()
      console.log('✅ 迁移完成: websocket_startup_logs表创建成功')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 迁移失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移（down方向）
   * @param {import('sequelize').QueryInterface} queryInterface - Sequelize查询接口
   * @param {import('sequelize')} Sequelize - Sequelize实例
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('开始回滚websocket_startup_logs表...')

      /*
       * ========================================
       * 删除websocket_startup_logs表
       * ========================================
       */
      await queryInterface.dropTable('websocket_startup_logs', { transaction })
      console.log('  ✅ 表删除成功: websocket_startup_logs')

      // 提交事务
      await transaction.commit()
      console.log('✅ 回滚完成: websocket_startup_logs表已删除')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
