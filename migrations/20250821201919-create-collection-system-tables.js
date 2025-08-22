'use strict'

/**
 * 🔥 收集系统数据库迁移 - 阶段一核心功能
 * 创建时间：2025年08月21日
 * 目标：创建收集册、碎片、用户收集记录表
 * 设计原则：简化数据模型，3个表解决收集功能
 */

module.exports = {
  async up (queryInterface, Sequelize) {
    console.log('📚 开始收集系统数据库迁移...')

    try {
      // 1. 创建收集册表
      await queryInterface.createTable('collection_albums', {
        album_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '收集册唯一标识'
        },
        album_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '收集册名称'
        },
        album_description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '收集册描述'
        },
        total_fragments: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '收集册包含的总碎片数'
        },
        reward_points: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '完成收集册的积分奖励'
        },
        reward_items: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '完成收集册的物品奖励配置'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '收集册是否激活'
        },
        start_time: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '收集册开始时间'
        },
        end_time: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '收集册结束时间'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '更新时间'
        }
      }, {
        comment: '收集册配置表'
      })
      console.log('✅ 创建collection_albums表完成')

      // 2. 创建碎片表
      await queryInterface.createTable('collection_fragments', {
        fragment_id: {
          type: Sequelize.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          comment: '碎片唯一标识'
        },
        album_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '所属收集册ID'
        },
        fragment_name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '碎片名称'
        },
        fragment_description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '碎片描述'
        },
        fragment_image: {
          type: Sequelize.STRING(255),
          allowNull: true,
          comment: '碎片图片URL'
        },
        rarity: {
          type: Sequelize.ENUM('common', 'rare', 'epic', 'legendary'),
          allowNull: false,
          defaultValue: 'common',
          comment: '碎片稀有度'
        },
        drop_rate: {
          type: Sequelize.DECIMAL(5, 3),
          allowNull: false,
          comment: '碎片掉落概率（0.001-1.000）'
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '收集册中的排序'
        },
        is_active: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '碎片是否激活'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '更新时间'
        }
      }, {
        comment: '收集碎片配置表'
      })
      console.log('✅ 创建collection_fragments表完成')

      // 3. 创建用户收集记录表
      await queryInterface.createTable('user_fragments', {
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID'
        },
        fragment_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '碎片ID'
        },
        collected_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
          comment: '收集到的数量'
        },
        first_collected_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '首次收集时间'
        },
        last_collected_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '最后收集时间'
        },
        source_type: {
          type: Sequelize.ENUM('lottery_draw', 'task_reward', 'exchange', 'gift'),
          allowNull: false,
          defaultValue: 'lottery_draw',
          comment: '获取来源类型'
        },
        source_data: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '获取来源详细数据'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '创建时间'
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.NOW,
          comment: '更新时间'
        }
      }, {
        comment: '用户收集记录表'
      })
      console.log('✅ 创建user_fragments表完成')

      // 4. 添加外键约束
      await queryInterface.addConstraint('collection_fragments', {
        fields: ['album_id'],
        type: 'foreign key',
        name: 'fk_fragments_album',
        references: {
          table: 'collection_albums',
          field: 'album_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })
      console.log('✅ 添加碎片-收集册外键约束完成')

      await queryInterface.addConstraint('user_fragments', {
        fields: ['fragment_id'],
        type: 'foreign key',
        name: 'fk_user_fragments_fragment',
        references: {
          table: 'collection_fragments',
          field: 'fragment_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })
      console.log('✅ 添加用户收集-碎片外键约束完成')

      // 5. 添加主键和索引
      await queryInterface.addConstraint('user_fragments', {
        fields: ['user_id', 'fragment_id'],
        type: 'primary key',
        name: 'pk_user_fragments'
      })
      console.log('✅ 添加用户收集记录主键完成')

      // 6. 添加查询优化索引
      await queryInterface.addIndex('collection_albums', ['is_active'], {
        name: 'idx_albums_active'
      })
      await queryInterface.addIndex('collection_fragments', ['album_id', 'rarity'], {
        name: 'idx_fragments_album_rarity'
      })
      await queryInterface.addIndex('user_fragments', ['user_id'], {
        name: 'idx_user_fragments_user'
      })
      await queryInterface.addIndex('user_fragments', ['source_type'], {
        name: 'idx_user_fragments_source'
      })
      console.log('✅ 添加查询优化索引完成')

      console.log('📚 收集系统数据库迁移完成！')
    } catch (error) {
      console.error('❌ 收集系统迁移失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    console.log('🔄 开始回滚收集系统迁移...')

    try {
      // 删除表（会自动删除外键约束和索引）
      await queryInterface.dropTable('user_fragments')
      await queryInterface.dropTable('collection_fragments')
      await queryInterface.dropTable('collection_albums')

      console.log('🔄 收集系统迁移回滚完成')
    } catch (error) {
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
