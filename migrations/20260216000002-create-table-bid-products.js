'use strict'

/**
 * 数据库迁移：创建 bid_products 竞价商品表
 *
 * 业务背景（臻选空间/幸运空间/竞价功能 — 后端实施方案）：
 * - 竞价功能核心表，管理竞价活动（关联 exchange_items）
 * - 7态状态机：pending → active → ended → settled/settlement_failed/no_bid，含 cancelled
 * - 支持一物一拍（代码层校验 active/pending 仅一个，决策11）
 * - 预留 batch_no 字段用于未来多批次竞价扩展
 *
 * 状态机流转（决策15 + 决策16）：
 * - pending → active（到达 start_time，定时任务自动激活）
 * - active → ended（到达 end_time，定时任务检测）
 * - ended → settled（有出价，结算完成）
 * - ended → settlement_failed（有出价，结算异常）
 * - ended → no_bid（无出价，流拍）
 * - pending/active → cancelled（管理员取消）
 *
 * @see docs/臻选空间-幸运空间-竞价功能-后端实施方案.md §3.2
 * @date 2026-02-16
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('📦 [迁移] 开始：创建 bid_products 竞价商品表...')

    await queryInterface.createTable(
      'bid_products',
      {
        // 主键
        bid_product_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '竞价商品ID（自增主键）'
        },

        // 关联兑换商品
        exchange_item_id: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '关联兑换商品ID（exchange_items.exchange_item_id）',
          references: {
            model: 'exchange_items',
            key: 'exchange_item_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },

        // 竞价价格配置
        start_price: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '起拍价（材料资产数量）'
        },
        price_asset_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          defaultValue: 'DIAMOND',
          comment: '竞价使用的资产类型（禁止 POINTS/BUDGET_POINTS，见决策1）'
        },
        current_price: {
          type: Sequelize.BIGINT,
          allowNull: false,
          defaultValue: 0,
          comment: '当前最高出价（冗余字段，提升查询性能）'
        },
        min_bid_increment: {
          type: Sequelize.BIGINT,
          allowNull: false,
          defaultValue: 10,
          comment: '最小加价幅度'
        },

        // 竞价时间控制
        start_time: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: '竞价开始时间'
        },
        end_time: {
          type: Sequelize.DATE,
          allowNull: false,
          comment: '竞价结束时间'
        },

        // 中标信息
        winner_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          defaultValue: null,
          comment: '中标用户ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        winner_bid_id: {
          type: Sequelize.BIGINT,
          allowNull: true,
          defaultValue: null,
          comment: '中标出价记录ID（bid_records.bid_record_id）'
        },

        // 状态机（7态，见决策6 + 决策16）
        status: {
          type: Sequelize.ENUM(
            'pending',
            'active',
            'ended',
            'cancelled',
            'settled',
            'settlement_failed',
            'no_bid'
          ),
          allowNull: false,
          defaultValue: 'pending',
          comment:
            '竞价状态：pending=待开始, active=进行中, ended=已结束待结算, cancelled=已取消, settled=已结算, settlement_failed=结算失败, no_bid=流拍'
        },

        // 出价统计
        bid_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '总出价次数'
        },

        // 批次号（预留扩展，决策11）
        batch_no: {
          type: Sequelize.STRING(50),
          allowNull: true,
          defaultValue: null,
          comment: '批次号（预留字段，未来多批次竞价扩展用）'
        },

        // 创建人（管理员）
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '创建人（管理员用户ID）',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT'
        },

        // 时间戳
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
          comment: '更新时间'
        }
      },
      {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '竞价商品表（臻选空间/幸运空间竞价功能，7态状态机）'
      }
    )

    // ====== 创建索引 ======
    console.log('  📋 创建索引...')

    // 查询进行中竞价（定时任务高频查询）
    await queryInterface.addIndex('bid_products', ['status', 'end_time'], {
      name: 'idx_bid_products_status_end'
    })

    // 关联查询
    await queryInterface.addIndex('bid_products', ['exchange_item_id'], {
      name: 'idx_bid_products_exchange_item'
    })

    // 一物一拍约束辅助索引（代码层校验 active/pending 只能存在一个）
    await queryInterface.addIndex('bid_products', ['exchange_item_id', 'status'], {
      name: 'idx_bid_products_item_status'
    })

    // 按批次查询（预留）
    await queryInterface.addIndex('bid_products', ['exchange_item_id', 'batch_no'], {
      name: 'idx_bid_products_item_batch'
    })

    // pending 竞价自动激活查询
    await queryInterface.addIndex('bid_products', ['status', 'start_time'], {
      name: 'idx_bid_products_status_start'
    })

    console.log('✅ [迁移] 完成：bid_products 竞价商品表已创建（含 5 个索引）')
  },

  async down(queryInterface) {
    console.log('📦 [回滚] 开始：删除 bid_products 竞价商品表...')
    await queryInterface.dropTable('bid_products')
    console.log('✅ [回滚] 完成：bid_products 已删除')
  }
}


