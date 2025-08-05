'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('🔄 开始创建exchange_records表并迁移数据...')

    try {
      // 1. 创建新的exchange_records表
      console.log('📋 创建exchange_records表...')

      await queryInterface.createTable('exchange_records', {
        id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '兑换记录唯一ID'
        },
        exchange_id: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '兑换记录业务ID'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        product_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '商品ID'
        },
        product_snapshot: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '商品信息快照JSON'
        },
        quantity: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
          comment: '兑换数量'
        },
        total_points: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '总消耗积分'
        },
        exchange_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          unique: true,
          comment: '兑换码（用户凭证）'
        },
        status: {
          type: Sequelize.ENUM('pending', 'completed', 'used', 'expired', 'cancelled'),
          allowNull: false,
          defaultValue: 'completed',
          comment: '兑换状态'
        },
        space: {
          type: Sequelize.ENUM('lucky', 'premium'),
          allowNull: false,
          comment: '兑换空间'
        },
        exchange_time: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '兑换时间'
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '兑换码过期时间'
        },
        used_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '使用时间'
        },
        client_info: {
          type: Sequelize.STRING(200),
          allowNull: true,
          comment: '客户端信息'
        },
        usage_info: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '使用说明JSON'
        },
        notes: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '备注信息'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW
        }
      }, {
        comment: '兑换记录表 - 记录用户商品兑换信息'
      })

      console.log('✅ exchange_records表创建完成')

      // 2. 创建索引
      console.log('🔄 创建索引...')

      await queryInterface.addIndex('exchange_records', ['user_id'], {
        name: 'idx_exchange_records_user_id'
      })

      await queryInterface.addIndex('exchange_records', ['product_id'], {
        name: 'idx_exchange_records_product_id'
      })

      await queryInterface.addIndex('exchange_records', ['exchange_code'], {
        name: 'idx_exchange_records_exchange_code',
        unique: true
      })

      await queryInterface.addIndex('exchange_records', ['status'], {
        name: 'idx_exchange_records_status'
      })

      await queryInterface.addIndex('exchange_records', ['space'], {
        name: 'idx_exchange_records_space'
      })

      await queryInterface.addIndex('exchange_records', ['exchange_time'], {
        name: 'idx_exchange_records_exchange_time'
      })

      console.log('✅ 索引创建完成')

      // 3. 迁移现有数据（从exchange_orders到exchange_records）
      console.log('🔄 开始数据迁移...')

      const existingOrders = await queryInterface.sequelize.query(
        'SELECT * FROM exchange_orders WHERE status IN ("confirmed", "delivered")',
        { type: Sequelize.QueryTypes.SELECT }
      )

      console.log(`📊 找到 ${existingOrders.length} 条需要迁移的订单数据`)

      for (const order of existingOrders) {
        const exchangeId = `ex_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
        const exchangeCode = `EX${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${Math.random().toString().substr(2, 6)}`

        await queryInterface.sequelize.query(`
          INSERT INTO exchange_records (
            exchange_id, user_id, product_id, product_snapshot,
            quantity, total_points, exchange_code, status,
            space, exchange_time, created_at, updated_at
          ) VALUES (
            :exchange_id, :user_id, :product_id, :product_snapshot,
            :quantity, :total_points, :exchange_code, :status,
            :space, :exchange_time, :created_at, :updated_at
          )
        `, {
          replacements: {
            exchange_id: exchangeId,
            user_id: order.user_id,
            product_id: order.product_id,
            product_snapshot: JSON.stringify({
              name: order.product_name,
              image: order.product_image,
              unit_points: order.unit_points
            }),
            quantity: order.quantity,
            total_points: order.total_points,
            exchange_code: exchangeCode,
            status: order.status === 'delivered' ? 'completed' : 'pending',
            space: 'lucky', // 默认空间
            exchange_time: order.created_at,
            created_at: order.created_at,
            updated_at: order.updated_at
          },
          type: Sequelize.QueryTypes.INSERT
        })
      }

      console.log('✅ 数据迁移完成')

      // 4. 重命名旧表（保留备份）
      await queryInterface.renameTable('exchange_orders', 'exchange_orders_backup')
      console.log('✅ 旧表已重命名为备份表')

      console.log('🎉 Exchange Records表创建和数据迁移完成！')
    } catch (error) {
      console.error('❌ Exchange Records创建失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    console.log('🔄 回滚Exchange Records表...')

    try {
      // 恢复旧表名
      await queryInterface.renameTable('exchange_orders_backup', 'exchange_orders')

      // 删除新表
      await queryInterface.dropTable('exchange_records')

      console.log('✅ Exchange Records表回滚完成')
    } catch (error) {
      console.error('❌ Exchange Records表回滚失败:', error.message)
      throw error
    }
  }
}
