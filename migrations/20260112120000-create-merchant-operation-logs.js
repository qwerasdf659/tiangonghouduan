'use strict'

/**
 * 商家员工域权限体系升级 - 商家操作审计日志表
 *
 * 迁移脚本：创建 merchant_operation_logs 表
 *
 * 功能说明：
 * - 独立的商家域审计日志表（与 admin_operation_logs 分离）
 * - 记录商家员工的敏感操作（扫码获取用户信息、提交消费记录等）
 * - 支持按门店/员工/时间范围/操作类型筛选
 * - 支持 request_id 全链路追踪
 *
 * 业务场景：
 * - AC4.1: 新建 merchant_operation_logs 表
 * - AC4.2: 消费提交/扫码拿用户信息时，记录审计日志
 * - AC4.3: 后端提供商家操作日志查询 API，支持筛选
 * - AC4.4: 审计日志保留 180 天
 *
 * 创建时间：2026-01-12
 * 依据文档：docs/商家员工域权限体系升级方案.md
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 [Migration] 开始创建 merchant_operation_logs 表...')

      // 1. 创建商家操作审计日志表
      await queryInterface.createTable(
        'merchant_operation_logs',
        {
          // 主键
          merchant_log_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '商家操作日志ID'
          },

          // 操作员信息
          operator_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'users',
              key: 'user_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '操作员ID（商家员工 user_id）'
          },

          // 门店信息
          store_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: {
              model: 'stores',
              key: 'store_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'RESTRICT',
            comment: '门店ID（操作发生的门店）'
          },

          // 操作类型（商家域专用）
          operation_type: {
            type: Sequelize.ENUM(
              'scan_user', // 扫码获取用户信息
              'submit_consumption', // 提交消费记录
              'view_consumption_list', // 查看消费记录列表
              'view_consumption_detail', // 查看消费记录详情
              'staff_login', // 员工登录
              'staff_logout' // 员工登出
            ),
            allowNull: false,
            comment: '操作类型（商家域专用枚举）'
          },

          // 操作动作
          action: {
            type: Sequelize.ENUM(
              'create', // 创建
              'read', // 读取
              'scan' // 扫码
            ),
            allowNull: false,
            defaultValue: 'create',
            comment: '操作动作'
          },

          // 目标用户信息（被扫码的用户）
          target_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: {
              model: 'users',
              key: 'user_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: '目标用户ID（被扫码/被录入消费的用户，可为空）'
          },

          // 关联的消费记录
          related_record_id: {
            type: Sequelize.BIGINT,
            allowNull: true,
            references: {
              model: 'consumption_records',
              key: 'record_id'
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
            comment: '关联的消费记录ID（如适用）'
          },

          // 消费金额（仅 submit_consumption 时有值）
          consumption_amount: {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: true,
            comment: '消费金额（仅提交消费记录时有值）'
          },

          // 操作结果
          result: {
            type: Sequelize.ENUM(
              'success', // 成功
              'failed', // 失败
              'blocked' // 被风控阻断
            ),
            allowNull: false,
            defaultValue: 'success',
            comment: '操作结果'
          },

          // 错误信息（失败时记录）
          error_message: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '错误信息（失败时记录）'
          },

          // 安全信息
          ip_address: {
            type: Sequelize.STRING(45),
            allowNull: true,
            comment: 'IP地址（支持 IPv4 和 IPv6）'
          },

          user_agent: {
            type: Sequelize.STRING(500),
            allowNull: true,
            comment: '用户代理字符串（User-Agent）'
          },

          // 请求追踪
          request_id: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '请求ID（用于全链路追踪）'
          },

          // 幂等键（关联业务操作）
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '幂等键（关联业务操作，如消费提交的幂等键）'
          },

          // 扩展数据
          extra_data: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '扩展数据（JSON 格式，存储其他上下文信息）'
          },

          // 时间字段
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '操作时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '商家操作审计日志表（商家员工域权限体系升级 - 2026-01-12）'
        }
      )

      console.log('✅ [Migration] merchant_operation_logs 表创建成功。')

      // 2. 创建索引
      console.log('📝 [Migration] 开始创建 merchant_operation_logs 索引...')

      // 操作员索引
      await queryInterface.addIndex('merchant_operation_logs', ['operator_id'], {
        name: 'idx_merchant_logs_operator',
        transaction
      })

      // 门店索引
      await queryInterface.addIndex('merchant_operation_logs', ['store_id'], {
        name: 'idx_merchant_logs_store',
        transaction
      })

      // 操作类型索引
      await queryInterface.addIndex('merchant_operation_logs', ['operation_type'], {
        name: 'idx_merchant_logs_operation_type',
        transaction
      })

      // 目标用户索引
      await queryInterface.addIndex('merchant_operation_logs', ['target_user_id'], {
        name: 'idx_merchant_logs_target_user',
        transaction
      })

      // 关联消费记录索引
      await queryInterface.addIndex('merchant_operation_logs', ['related_record_id'], {
        name: 'idx_merchant_logs_related_record',
        transaction
      })

      // 操作结果索引
      await queryInterface.addIndex('merchant_operation_logs', ['result'], {
        name: 'idx_merchant_logs_result',
        transaction
      })

      // 创建时间索引
      await queryInterface.addIndex('merchant_operation_logs', ['created_at'], {
        name: 'idx_merchant_logs_created_at',
        transaction
      })

      // 请求ID索引（全链路追踪）
      await queryInterface.addIndex('merchant_operation_logs', ['request_id'], {
        name: 'idx_merchant_logs_request_id',
        transaction
      })

      // 幂等键索引
      await queryInterface.addIndex('merchant_operation_logs', ['idempotency_key'], {
        name: 'idx_merchant_logs_idempotency_key',
        transaction
      })

      // 复合索引：门店 + 操作员 + 时间（常用查询）
      await queryInterface.addIndex(
        'merchant_operation_logs',
        ['store_id', 'operator_id', 'created_at'],
        {
          name: 'idx_merchant_logs_store_operator_time',
          transaction
        }
      )

      // 复合索引：门店 + 操作类型 + 时间（按门店筛选操作类型）
      await queryInterface.addIndex(
        'merchant_operation_logs',
        ['store_id', 'operation_type', 'created_at'],
        {
          name: 'idx_merchant_logs_store_type_time',
          transaction
        }
      )

      console.log('✅ [Migration] merchant_operation_logs 索引创建完成。')

      await transaction.commit()
      console.log('🎉 [Migration] 迁移 20260112120000-create-merchant-operation-logs 成功提交。')
    } catch (error) {
      await transaction.rollback()
      console.error(
        '❌ [Migration] 迁移 20260112120000-create-merchant-operation-logs 失败回滚:',
        error
      )
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('📝 [Migration] 开始回滚：删除 merchant_operation_logs 表...')

      // 删除表（会自动删除相关索引）
      await queryInterface.dropTable('merchant_operation_logs', { transaction })

      console.log('✅ [Migration] merchant_operation_logs 表已删除。')

      await transaction.commit()
      console.log('🎉 [Migration] 回滚 20260112120000-create-merchant-operation-logs 成功提交。')
    } catch (error) {
      await transaction.rollback()
      console.error(
        '❌ [Migration] 回滚 20260112120000-create-merchant-operation-logs 失败回滚:',
        error
      )
      throw error
    }
  }
}
