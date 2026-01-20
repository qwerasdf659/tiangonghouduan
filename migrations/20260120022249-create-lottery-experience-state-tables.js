'use strict'

/**
 * 迁移文件：创建抽奖体验状态表
 *
 * 基于《抽奖模块POINTS与BUDGET_POINTS平衡方案》文档中的数据表设计
 * 创建两个核心状态表：
 * 1. lottery_user_experience_state - 用户活动级体验状态表（Pity/AntiEmpty/AntiHigh）
 * 2. lottery_user_global_state - 用户全局统计表（LuckDebt 运气债务）
 *
 * 业务场景：
 * - 追踪用户在特定活动中的连续空奖次数（empty_streak）
 * - 追踪用户近期高价值奖品获取次数（recent_high_count）
 * - 为 Pity 系统提供触发依据
 * - 为运气债务机制提供历史统计数据
 *
 * 设计原则：
 * - 活动级隔离：每个用户在每个活动有独立的体验状态
 * - 全局统计：跨活动的运气债务需要全局视角
 * - 高频读写：抽奖时需要读取和更新，需要优化索引
 *
 * 创建时间：2026-01-20
 * 作者：抽奖模块策略重构
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始创建抽奖体验状态表...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    /**
     * 辅助函数：安全添加索引（先检查是否存在）
     */
    async function safeAddIndex(tableName, columns, options) {
      try {
        const [indexes] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM \`${tableName}\` WHERE Key_name = '${options.name}'`,
          { transaction }
        )
        if (indexes.length === 0) {
          await queryInterface.addIndex(tableName, columns, { ...options, transaction })
          console.log(`    ✅ 索引 ${options.name} 创建成功`)
        } else {
          console.log(`    ⏭️ 索引 ${options.name} 已存在，跳过`)
        }
      } catch (err) {
        console.log(`    ⚠️ 索引 ${options.name} 创建失败: ${err.message}`)
      }
    }

    /**
     * 辅助函数：安全添加外键约束
     */
    async function safeAddConstraint(tableName, options) {
      try {
        const [constraints] = await queryInterface.sequelize.query(
          `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS 
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}' 
           AND CONSTRAINT_NAME = '${options.name}'`,
          { transaction }
        )
        if (constraints.length === 0) {
          await queryInterface.addConstraint(tableName, { ...options, transaction })
          console.log(`    ✅ 约束 ${options.name} 创建成功`)
        } else {
          console.log(`    ⏭️ 约束 ${options.name} 已存在，跳过`)
        }
      } catch (err) {
        console.log(`    ⚠️ 约束 ${options.name} 创建失败: ${err.message}`)
      }
    }

    /**
     * 辅助函数：检查表是否存在
     */
    async function tableExists(tableName) {
      const [tables] = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}'`,
        { transaction }
      )
      return tables.length > 0
    }

    try {
      // ============================================================
      // 表1：lottery_user_experience_state - 用户活动级体验状态表
      // 作用：追踪用户在特定活动中的抽奖体验状态（Pity/AntiStreak）
      // ============================================================
      console.log('\n📋 [1/2] 创建 lottery_user_experience_state 表...')

      if (await tableExists('lottery_user_experience_state')) {
        console.log('    ⏭️ 表已存在，跳过创建')
      } else {
        await queryInterface.createTable(
          'lottery_user_experience_state',
          {
            /**
             * 状态ID - 主键（自增）
             */
            state_id: {
              type: Sequelize.INTEGER,
              primaryKey: true,
              autoIncrement: true,
              comment: '状态记录ID（自增主键）'
            },

            /**
             * 用户ID - 外键关联 users 表
             */
            user_id: {
              type: Sequelize.INTEGER,
              allowNull: false,
              comment: '用户ID（外键关联users.user_id）'
            },

            /**
             * 活动ID - 外键关联 lottery_campaigns 表
             */
            campaign_id: {
              type: Sequelize.INTEGER,
              allowNull: false,
              comment: '活动ID（外键关联lottery_campaigns.campaign_id）'
            },

            /**
             * 连续空奖次数 - Pity 系统核心指标
             * 每次抽到空奖 +1，抽到非空奖重置为 0
             */
            empty_streak: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '连续空奖次数（Pity系统：每次空奖+1，非空奖重置为0）'
            },

            /**
             * 近期高价值奖品次数 - AntiHigh 核心指标
             * 统计最近 N 次抽奖中获得 high 档位的次数
             */
            recent_high_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '近期高价值奖品次数（AntiHigh：统计窗口内high档位次数）'
            },

            /**
             * 历史最大连续空奖次数 - 用于分析
             */
            max_empty_streak: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '历史最大连续空奖次数（用于分析和优化）'
            },

            /**
             * 总抽奖次数 - 活动维度
             */
            total_draw_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '该活动总抽奖次数'
            },

            /**
             * 总空奖次数 - 活动维度
             */
            total_empty_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '该活动总空奖次数'
            },

            /**
             * Pity 触发次数 - 用于监控
             */
            pity_trigger_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'Pity系统触发次数（用于监控效果）'
            },

            /**
             * 最后一次抽奖时间
             */
            last_draw_at: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '最后一次抽奖时间（北京时间）'
            },

            /**
             * 最后一次抽奖档位
             */
            last_draw_tier: {
              type: Sequelize.STRING(20),
              allowNull: true,
              comment: '最后一次抽奖档位（high/mid/low/fallback）'
            },

            /**
             * 创建时间
             */
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '创建时间（北京时间）'
            },

            /**
             * 更新时间
             */
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
              comment: '更新时间（北京时间）'
            }
          },
          {
            transaction,
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            engine: 'InnoDB',
            comment: '用户活动级抽奖体验状态表（Pity/AntiEmpty/AntiHigh）'
          }
        )
        console.log('    ✅ 表 lottery_user_experience_state 创建成功')
      }

      // 添加索引
      console.log('    📊 创建索引...')

      // 用户+活动唯一索引（核心查询场景）
      await safeAddIndex('lottery_user_experience_state', ['user_id', 'campaign_id'], {
        name: 'uk_user_campaign_experience',
        unique: true
      })

      // 用户索引（查询用户在所有活动的状态）
      await safeAddIndex('lottery_user_experience_state', ['user_id'], {
        name: 'idx_experience_user_id'
      })

      // 活动索引（查询活动所有用户状态）
      await safeAddIndex('lottery_user_experience_state', ['campaign_id'], {
        name: 'idx_experience_campaign_id'
      })

      // 连续空奖次数索引（监控高 empty_streak 用户）
      await safeAddIndex('lottery_user_experience_state', ['empty_streak'], {
        name: 'idx_experience_empty_streak'
      })

      // 添加外键约束
      console.log('    🔗 创建外键约束...')

      await safeAddConstraint('lottery_user_experience_state', {
        name: 'fk_experience_state_user_id',
        fields: ['user_id'],
        type: 'foreign key',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })

      await safeAddConstraint('lottery_user_experience_state', {
        name: 'fk_experience_state_campaign_id',
        fields: ['campaign_id'],
        type: 'foreign key',
        references: {
          table: 'lottery_campaigns',
          field: 'campaign_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })

      // ============================================================
      // 表2：lottery_user_global_state - 用户全局统计表
      // 作用：追踪用户跨活动的全局抽奖统计（LuckDebt 运气债务）
      // ============================================================
      console.log('\n📋 [2/2] 创建 lottery_user_global_state 表...')

      if (await tableExists('lottery_user_global_state')) {
        console.log('    ⏭️ 表已存在，跳过创建')
      } else {
        await queryInterface.createTable(
          'lottery_user_global_state',
          {
            /**
             * 全局状态ID - 主键（自增）
             */
            global_state_id: {
              type: Sequelize.INTEGER,
              primaryKey: true,
              autoIncrement: true,
              comment: '全局状态记录ID（自增主键）'
            },

            /**
             * 用户ID - 唯一（每用户一条记录）
             */
            user_id: {
              type: Sequelize.INTEGER,
              allowNull: false,
              unique: true,
              comment: '用户ID（唯一，外键关联users.user_id）'
            },

            /**
             * 全局总抽奖次数
             */
            global_draw_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '全局总抽奖次数（跨所有活动）'
            },

            /**
             * 全局总空奖次数
             */
            global_empty_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '全局总空奖次数（跨所有活动）'
            },

            /**
             * 历史空奖率 - 运气债务核心指标
             * 计算公式：global_empty_count / global_draw_count
             */
            historical_empty_rate: {
              type: Sequelize.DECIMAL(5, 4),
              allowNull: false,
              defaultValue: 0.0,
              comment: '历史空奖率（0.0000-1.0000，运气债务核心指标）'
            },

            /**
             * 运气债务等级
             * 根据 historical_empty_rate 与系统期望值的偏离计算
             */
            luck_debt_level: {
              type: Sequelize.ENUM('none', 'low', 'medium', 'high'),
              allowNull: false,
              defaultValue: 'none',
              comment: '运气债务等级（none/low/medium/high）'
            },

            /**
             * 运气债务乘数 - 补偿系数
             * 值 > 1.0 表示需要补偿（提高非空奖概率）
             */
            luck_debt_multiplier: {
              type: Sequelize.DECIMAL(4, 2),
              allowNull: false,
              defaultValue: 1.0,
              comment: '运气债务乘数（>1.0表示需补偿，用于提高非空奖概率）'
            },

            /**
             * 全局高价值奖品次数
             */
            global_high_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '全局高价值奖品获取次数（high档位）'
            },

            /**
             * 全局中价值奖品次数
             */
            global_mid_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '全局中价值奖品获取次数（mid档位）'
            },

            /**
             * 全局低价值奖品次数
             */
            global_low_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '全局低价值奖品获取次数（low档位）'
            },

            /**
             * 参与活动数量
             */
            participated_campaigns: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '参与过的活动数量'
            },

            /**
             * 最后一次抽奖时间
             */
            last_draw_at: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '全局最后一次抽奖时间（北京时间）'
            },

            /**
             * 最后一次抽奖活动ID
             */
            last_campaign_id: {
              type: Sequelize.INTEGER,
              allowNull: true,
              comment: '最后一次抽奖的活动ID'
            },

            /**
             * 创建时间
             */
            created_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '创建时间（北京时间）'
            },

            /**
             * 更新时间
             */
            updated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
              comment: '更新时间（北京时间）'
            }
          },
          {
            transaction,
            charset: 'utf8mb4',
            collate: 'utf8mb4_unicode_ci',
            engine: 'InnoDB',
            comment: '用户全局抽奖统计表（LuckDebt运气债务机制）'
          }
        )
        console.log('    ✅ 表 lottery_user_global_state 创建成功')
      }

      // 添加索引
      console.log('    📊 创建索引...')

      // 运气债务等级索引（监控需要补偿的用户）
      await safeAddIndex('lottery_user_global_state', ['luck_debt_level'], {
        name: 'idx_global_state_luck_debt_level'
      })

      // 历史空奖率索引（分析用）
      await safeAddIndex('lottery_user_global_state', ['historical_empty_rate'], {
        name: 'idx_global_state_empty_rate'
      })

      // 最后抽奖时间索引（清理过期数据用）
      await safeAddIndex('lottery_user_global_state', ['last_draw_at'], {
        name: 'idx_global_state_last_draw_at'
      })

      // 添加外键约束
      console.log('    🔗 创建外键约束...')

      await safeAddConstraint('lottery_user_global_state', {
        name: 'fk_global_state_user_id',
        fields: ['user_id'],
        type: 'foreign key',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })

      // ============================================================
      // 提交事务
      // ============================================================
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 抽奖体验状态表创建完成！')
      console.log('='.repeat(60))
      console.log('\n📊 创建的表：')
      console.log('  1. lottery_user_experience_state - 用户活动级体验状态')
      console.log('  2. lottery_user_global_state - 用户全局统计（运气债务）')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('\n❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    console.log('🔄 开始回滚：删除抽奖体验状态表...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除外键约束（先删除约束再删表）
      console.log('\n🗑️ 删除外键约束...')

      const constraintsToRemove = [
        { table: 'lottery_user_experience_state', name: 'fk_experience_state_user_id' },
        { table: 'lottery_user_experience_state', name: 'fk_experience_state_campaign_id' },
        { table: 'lottery_user_global_state', name: 'fk_global_state_user_id' }
      ]

      for (const { table, name } of constraintsToRemove) {
        try {
          await queryInterface.removeConstraint(table, name, { transaction })
          console.log(`    ✅ 约束 ${name} 删除成功`)
        } catch (err) {
          console.log(`    ⏭️ 约束 ${name} 不存在或删除失败: ${err.message}`)
        }
      }

      // 删除表
      console.log('\n🗑️ 删除表...')

      const tablesToDrop = ['lottery_user_experience_state', 'lottery_user_global_state']

      for (const tableName of tablesToDrop) {
        try {
          await queryInterface.dropTable(tableName, { transaction })
          console.log(`    ✅ 表 ${tableName} 删除成功`)
        } catch (err) {
          console.log(`    ⏭️ 表 ${tableName} 不存在或删除失败: ${err.message}`)
        }
      }

      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 回滚完成！')
      console.log('='.repeat(60))
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 回滚失败:', error.message)
      throw error
    }
  }
}


