'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // 创建社交抽奖房间表
    await queryInterface.createTable('social_lottery_rooms', {
      room_id: {
        type: Sequelize.STRING(32),
        primaryKey: true,
        allowNull: false,
        comment: '房间唯一标识'
      },
      creator_user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '创建者用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      campaign_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '抽奖活动ID',
        references: {
          model: 'lottery_campaigns',
          key: 'campaign_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      max_participants: {
        type: Sequelize.INTEGER,
        defaultValue: 5,
        comment: '最大参与人数'
      },
      current_participants: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: '当前参与人数'
      },
      min_contribution: {
        type: Sequelize.INTEGER,
        defaultValue: 100,
        comment: '最小贡献积分'
      },
      total_contribution_points: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: '总贡献积分'
      },
      status: {
        type: Sequelize.ENUM('waiting', 'active', 'completed', 'expired', 'cancelled'),
        defaultValue: 'waiting',
        comment: '房间状态'
      },
      settings: {
        type: Sequelize.JSON,
        comment: '房间设置{auto_start, private_room, invitation_required}'
      },
      draw_results: {
        type: Sequelize.JSON,
        comment: '抽奖结果JSON'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '创建时间'
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '完成时间'
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '过期时间'
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '更新时间'
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: '社交抽奖房间表'
    })

    // 创建社交抽奖参与者表
    await queryInterface.createTable('social_lottery_participants', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      room_id: {
        type: Sequelize.STRING(32),
        allowNull: false,
        comment: '房间ID',
        references: {
          model: 'social_lottery_rooms',
          key: 'room_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '参与者用户ID',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      contribution_points: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: '贡献积分数'
      },
      role: {
        type: Sequelize.ENUM('creator', 'participant'),
        defaultValue: 'participant',
        comment: '角色'
      },
      draw_result: {
        type: Sequelize.JSON,
        comment: '个人抽奖结果JSON'
      },
      draw_completed: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: '是否已完成抽奖'
      },
      joined_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
        comment: '加入时间'
      }
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: '社交抽奖参与者表'
    })

    // 添加索引
    await queryInterface.addIndex('social_lottery_rooms', ['creator_user_id'], {
      name: 'idx_creator'
    })
    await queryInterface.addIndex('social_lottery_rooms', ['campaign_id'], {
      name: 'idx_campaign'
    })
    await queryInterface.addIndex('social_lottery_rooms', ['status'], {
      name: 'idx_status'
    })
    await queryInterface.addIndex('social_lottery_rooms', ['expires_at'], {
      name: 'idx_expires'
    })
    await queryInterface.addIndex('social_lottery_rooms', ['created_at'], {
      name: 'idx_created'
    })

    await queryInterface.addIndex('social_lottery_participants', ['room_id'], {
      name: 'idx_room'
    })
    await queryInterface.addIndex('social_lottery_participants', ['user_id'], {
      name: 'idx_user'
    })
    await queryInterface.addIndex('social_lottery_participants', ['joined_at'], {
      name: 'idx_joined'
    })

    // 添加唯一约束
    await queryInterface.addConstraint('social_lottery_participants', {
      fields: ['room_id', 'user_id'],
      type: 'unique',
      name: 'unique_user_room'
    })
  },

  async down (queryInterface, _Sequelize) {
    // 删除表（按创建顺序相反的顺序删除）
    await queryInterface.dropTable('social_lottery_participants')
    await queryInterface.dropTable('social_lottery_rooms')
  }
}
