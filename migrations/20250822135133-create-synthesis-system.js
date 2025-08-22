/**
 * 餐厅积分抽奖系统 v3.0 - 高级合成系统数据库迁移
 * 创建合成配方表和合成历史表
 * 创建时间：2025年08月22日
 */

'use strict'

module.exports = {
  async up (queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始创建高级合成系统数据表...')

      // 创建合成配方表
      await queryInterface.createTable('synthesis_recipes', {
        recipe_id: {
          type: Sequelize.STRING(32),
          primaryKey: true,
          comment: '合成配方唯一标识'
        },
        name: {
          type: Sequelize.STRING(100),
          allowNull: false,
          comment: '配方名称'
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true,
          comment: '配方描述'
        },
        category: {
          type: Sequelize.ENUM('basic', 'advanced', 'legendary', 'mythical', 'event'),
          allowNull: false,
          defaultValue: 'basic',
          comment: '配方分类'
        },
        required_level: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
          comment: '需要的合成等级'
        },
        materials: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '合成材料配置 [{item_type, item_id, quantity, rarity}]'
        },
        output_items: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '产出物品配置 [{item_type, item_id, quantity, probability, rarity}]'
        },
        base_success_rate: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false,
          defaultValue: 80.00,
          comment: '基础成功率 (0-100)'
        },
        synthesis_cost: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '合成成本配置 {points: 100, vip_discount: 0.9}',
          defaultValue: {
            points: 0,
            vip_discount: 1.0
          }
        },
        cooldown_seconds: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '合成冷却时间 (秒)'
        },
        status: {
          type: Sequelize.ENUM('active', 'inactive', 'event_only', 'deprecated'),
          allowNull: false,
          defaultValue: 'active',
          comment: '配方状态'
        },
        unlock_conditions: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '解锁条件 {achievements: [], items_collected: [], vip_level: 1}',
          defaultValue: {}
        },
        limitations: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '使用限制 {daily_limit: 5, total_limit: null, user_level_min: 1}',
          defaultValue: {
            daily_limit: null,
            total_limit: null,
            user_level_min: 1
          }
        },
        special_effects: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '特殊效果配置 {critical_chance: 5, bonus_items: [], experience_bonus: 1.0}',
          defaultValue: {
            critical_chance: 0,
            bonus_items: [],
            experience_bonus: 1.0
          }
        },
        sort_order: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 100,
          comment: '显示排序'
        },
        icon: {
          type: Sequelize.STRING(10),
          allowNull: true,
          comment: '配方图标'
        },
        total_synthesis_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '总合成次数统计'
        },
        total_success_count: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '总成功次数统计'
        },
        metadata: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '扩展元数据'
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
        transaction,
        comment: '合成配方表'
      })

      // 创建合成历史表
      await queryInterface.createTable('synthesis_history', {
        history_id: {
          type: Sequelize.STRING(32),
          primaryKey: true,
          comment: '合成历史唯一标识'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '用户ID',
          references: {
            model: 'users',
            key: 'user_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        recipe_id: {
          type: Sequelize.STRING(32),
          allowNull: false,
          comment: '合成配方ID',
          references: {
            model: 'synthesis_recipes',
            key: 'recipe_id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        materials_used: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '使用的材料详情 [{item_type, item_id, quantity, consumed_from_inventory}]'
        },
        result_status: {
          type: Sequelize.ENUM('success', 'failure', 'critical_success', 'partial_success'),
          allowNull: false,
          comment: '合成结果状态'
        },
        success_rate_used: {
          type: Sequelize.DECIMAL(5, 2),
          allowNull: false,
          comment: '实际使用的成功率'
        },
        output_items: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '产出物品详情 [{item_type, item_id, quantity, rarity, added_to_inventory}]'
        },
        special_effects_triggered: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '触发的特殊效果 [{effect_type, effect_value, description}]',
          defaultValue: []
        },
        cost_details: {
          type: Sequelize.JSON,
          allowNull: false,
          comment: '成本详情 {points_spent, vip_discount_applied, total_cost}',
          defaultValue: {
            points_spent: 0,
            vip_discount_applied: 0,
            total_cost: 0
          }
        },
        experience_gained: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '获得的合成经验值'
        },
        user_synthesis_level_before: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '合成前用户合成等级'
        },
        user_synthesis_level_after: {
          type: Sequelize.INTEGER,
          allowNull: false,
          comment: '合成后用户合成等级'
        },
        random_seed: {
          type: Sequelize.STRING(32),
          allowNull: false,
          comment: '随机种子用于结果验证'
        },
        device_info: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '设备信息 {ip_address, user_agent, device_type}',
          defaultValue: {}
        },
        execution_duration_ms: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '合成执行耗时(毫秒)'
        },
        failure_reason: {
          type: Sequelize.STRING(200),
          allowNull: true,
          comment: '失败原因说明'
        },
        bonus_applied: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '应用的加成效果 {vip_bonus, event_bonus, level_bonus}',
          defaultValue: {}
        },
        event_id: {
          type: Sequelize.STRING(32),
          allowNull: true,
          comment: '关联的活动ID (如果是活动期间合成)'
        },
        verification_hash: {
          type: Sequelize.STRING(64),
          allowNull: false,
          comment: '合成结果验证哈希'
        },
        metadata: {
          type: Sequelize.JSON,
          allowNull: true,
          comment: '扩展元数据'
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
        transaction,
        comment: '合成历史表'
      })

      // 创建合成配方表索引
      await queryInterface.addIndex('synthesis_recipes', ['category', 'status'], {
        name: 'idx_synthesis_recipes_category_status',
        transaction
      })

      await queryInterface.addIndex('synthesis_recipes', ['required_level'], {
        name: 'idx_synthesis_recipes_required_level',
        transaction
      })

      await queryInterface.addIndex('synthesis_recipes', ['status', 'sort_order'], {
        name: 'idx_synthesis_recipes_status_sort',
        transaction
      })

      await queryInterface.addIndex('synthesis_recipes', ['base_success_rate'], {
        name: 'idx_synthesis_recipes_success_rate',
        transaction
      })

      // 创建合成历史表索引
      await queryInterface.addIndex('synthesis_history', ['user_id', 'created_at'], {
        name: 'idx_synthesis_history_user_time',
        transaction
      })

      await queryInterface.addIndex('synthesis_history', ['recipe_id', 'result_status'], {
        name: 'idx_synthesis_history_recipe_status',
        transaction
      })

      await queryInterface.addIndex('synthesis_history', ['result_status', 'created_at'], {
        name: 'idx_synthesis_history_status_time',
        transaction
      })

      await queryInterface.addIndex('synthesis_history', ['user_id', 'recipe_id', 'created_at'], {
        name: 'idx_synthesis_history_user_recipe_time',
        transaction
      })

      await queryInterface.addIndex('synthesis_history', ['verification_hash'], {
        name: 'idx_synthesis_history_verification',
        unique: true,
        transaction
      })

      // 为用户表添加合成经验字段
      console.log('🔧 为用户表添加合成经验字段...')

      try {
        await queryInterface.addColumn('users', 'synthesis_experience', {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '合成经验值'
        }, { transaction })
        console.log('✅ 成功添加用户合成经验字段')
      } catch (error) {
        if (error.message.includes('column "synthesis_experience" of relation "users" already exists')) {
          console.log('⚠️ 用户合成经验字段已存在，跳过添加')
        } else {
          throw error
        }
      }

      await transaction.commit()
      console.log('✅ 高级合成系统数据表创建完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 创建高级合成系统数据表失败:', error)
      throw error
    }
  },

  async down (queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔧 开始删除高级合成系统数据表...')

      // 删除外键约束的表要先删除
      await queryInterface.dropTable('synthesis_history', { transaction })
      await queryInterface.dropTable('synthesis_recipes', { transaction })

      // 删除用户表的合成经验字段
      try {
        await queryInterface.removeColumn('users', 'synthesis_experience', { transaction })
        console.log('✅ 成功删除用户合成经验字段')
      } catch (error) {
        console.log('⚠️ 删除用户合成经验字段失败或字段不存在:', error.message)
      }

      await transaction.commit()
      console.log('✅ 高级合成系统数据表删除完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 删除高级合成系统数据表失败:', error)
      throw error
    }
  }
}
