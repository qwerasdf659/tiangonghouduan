'use strict'

/**
 * 创建 preset_inventory_debt 表
 * 业务职责：记录预设发放时因库存不足产生的欠账
 * 
 * 核心规则（DR-02）：
 * - 预设发放不可驳回，即使库存不足也要先发放
 * - 产生的欠账需要运营人员在后台补货清偿
 * - 欠账存在期间不影响活动状态
 * 
 * 创建时间：2026-02-02
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // 检查表是否已存在
    const tableExists = await queryInterface.showAllTables()
    if (tableExists.includes('preset_inventory_debt')) {
      console.log('✅ preset_inventory_debt 表已存在，跳过创建')
      return
    }

    await queryInterface.createTable('preset_inventory_debt', {
      // 主键ID
      preset_inventory_debt_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        autoIncrement: true,
        comment: '库存欠账主键ID'
      },

      // 关联的预设ID
      lottery_preset_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '关联的预设ID（外键关联lottery_presets.lottery_preset_id）'
      },

      // 关联的抽奖记录ID
      lottery_draw_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: '关联的抽奖记录ID（外键关联lottery_draws.lottery_draw_id）'
      },

      // 奖品ID
      lottery_prize_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '欠账奖品ID（外键关联lottery_prizes.lottery_prize_id）',
        references: {
          model: 'lottery_prizes',
          key: 'lottery_prize_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // 用户ID（收到预设奖品的用户）
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '用户ID（收到预设奖品的用户）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // 活动ID
      lottery_campaign_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '活动ID',
        references: {
          model: 'lottery_campaigns',
          key: 'lottery_campaign_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },

      // 欠账数量
      debt_quantity: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 1,
        comment: '欠账数量（库存垫付数量）'
      },

      // 欠账状态：pending-待清偿, cleared-已清偿, written_off-已核销
      status: {
        type: Sequelize.ENUM('pending', 'cleared', 'written_off'),
        allowNull: false,
        defaultValue: 'pending',
        comment: '欠账状态：pending-待清偿, cleared-已清偿, written_off-已核销'
      },

      // 已清偿数量
      cleared_quantity: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0,
        comment: '已清偿数量'
      },

      // 清偿时间
      cleared_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '清偿时间'
      },

      // 清偿方式：restock-补货触发, manual-手动清偿, auto-自动核销
      cleared_by_method: {
        type: Sequelize.ENUM('restock', 'manual', 'auto'),
        allowNull: true,
        comment: '清偿方式：restock-补货触发, manual-手动清偿, auto-自动核销'
      },

      // 清偿操作人ID
      cleared_by_user_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '清偿操作人ID',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },

      // 清偿备注
      cleared_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: '清偿备注'
      },

      // 创建时间
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
        comment: '创建时间'
      },

      // 更新时间
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        comment: '更新时间'
      }
    }, {
      comment: '预设库存欠账表 - 记录预设发放时库存不足的系统垫付'
    })

    // 创建索引
    await queryInterface.addIndex('preset_inventory_debt', ['lottery_preset_id'], {
      name: 'idx_inv_debt_preset'
    })

    await queryInterface.addIndex('preset_inventory_debt', ['lottery_prize_id', 'status'], {
      name: 'idx_inv_debt_prize_status'
    })

    await queryInterface.addIndex('preset_inventory_debt', ['lottery_campaign_id', 'status'], {
      name: 'idx_inv_debt_campaign_status'
    })

    await queryInterface.addIndex('preset_inventory_debt', ['status', 'created_at'], {
      name: 'idx_inv_debt_status_created'
    })

    console.log('✅ preset_inventory_debt 表创建成功')
  },

  async down(queryInterface) {
    await queryInterface.dropTable('preset_inventory_debt')
    console.log('✅ preset_inventory_debt 表已删除')
  }
}

