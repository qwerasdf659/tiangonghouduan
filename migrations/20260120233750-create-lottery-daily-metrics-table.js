'use strict'

/**
 * 迁移文件：创建抽奖日报统计表
 *
 * 基于《抽奖策略引擎监控方案》文档中的日报聚合表设计
 *
 * lottery_daily_metrics 表用于存储按天聚合的抽奖监控指标
 * 从 lottery_hourly_metrics 表汇总计算，保留永久历史数据
 *
 * 核心业务场景：
 * 1. 长期历史数据分析（支持年度对比）
 * 2. 运营日报生成（每日凌晨自动聚合）
 * 3. 活动效果评估（跨天趋势分析）
 *
 * 数据流向：
 * - 写入：定时任务每日凌晨 01:00 从 lottery_hourly_metrics 聚合
 * - 读取：历史报表、长期趋势分析、年度运营总结
 *
 * 设计原则：
 * - 日级粒度，永久保留
 * - 从小时级数据汇总计算
 * - 支持跨活动对比分析
 *
 * 创建时间：2026-01-21
 * 作者：抽奖策略引擎监控方案实施
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始创建 lottery_daily_metrics 日报统计表...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    /**
     * 辅助函数：检查表是否存在
     * @param {string} tableName - 表名
     * @returns {Promise<boolean>} 表是否存在
     */
    async function tableExists(tableName) {
      const [tables] = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME FROM information_schema.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${tableName}'`,
        { transaction }
      )
      return tables.length > 0
    }

    /**
     * 辅助函数：安全添加索引
     * @param {string} tableName - 表名
     * @param {Array<string>} columns - 列名数组
     * @param {Object} options - 索引选项
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
     * @param {string} tableName - 表名
     * @param {Object} options - 约束选项
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

    try {
      console.log('\n📋 [1/3] 创建 lottery_daily_metrics 表...')

      if (await tableExists('lottery_daily_metrics')) {
        console.log('    ⏭️ 表已存在，跳过创建')
      } else {
        await queryInterface.createTable(
          'lottery_daily_metrics',
          {
            /**
             * 日报指标ID - 主键（自增）
             */
            daily_metric_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '日报指标记录ID（自增主键）'
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
             * 统计日期 - 格式: YYYY-MM-DD
             */
            metric_date: {
              type: Sequelize.DATEONLY,
              allowNull: false,
              comment: '统计日期（格式: YYYY-MM-DD，北京时间）'
            },

            // ========== 基础抽奖统计 ==========

            /**
             * 当日总抽奖次数
             */
            total_draws: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '当日总抽奖次数（从小时级汇总）'
            },

            /**
             * 当日唯一用户数
             */
            unique_users: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '当日参与抽奖的唯一用户数'
            },

            // ========== 档位分布统计 ==========

            /**
             * 高价值奖品次数
             */
            high_tier_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '高价值奖品次数（high档位）'
            },

            /**
             * 中价值奖品次数
             */
            mid_tier_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '中价值奖品次数（mid档位）'
            },

            /**
             * 低价值奖品次数
             */
            low_tier_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '低价值奖品次数（low档位）'
            },

            /**
             * 空奖次数
             */
            fallback_tier_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '空奖次数（fallback档位）'
            },

            // ========== 预算相关统计 ==========

            /**
             * 总预算消耗
             */
            total_budget_consumed: {
              type: Sequelize.DECIMAL(20, 2),
              allowNull: false,
              defaultValue: 0,
              comment: '当日总预算消耗（积分）'
            },

            /**
             * 平均单次消耗
             */
            avg_budget_per_draw: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              defaultValue: 0,
              comment: '当日平均单次消耗（积分）'
            },

            /**
             * 总奖品价值发放
             */
            total_prize_value: {
              type: Sequelize.DECIMAL(20, 2),
              allowNull: false,
              defaultValue: 0,
              comment: '当日发放的总奖品价值（积分）'
            },

            // ========== 预算分层分布（B0-B3） ==========

            /**
             * B0 档位用户抽奖次数
             */
            b0_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'B0档位（无预算）用户抽奖次数'
            },

            /**
             * B1 档位用户抽奖次数
             */
            b1_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'B1档位（低预算≤100）用户抽奖次数'
            },

            /**
             * B2 档位用户抽奖次数
             */
            b2_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'B2档位（中预算101-500）用户抽奖次数'
            },

            /**
             * B3 档位用户抽奖次数
             */
            b3_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'B3档位（高预算>500）用户抽奖次数'
            },

            // ========== 体验机制统计 ==========

            /**
             * Pity 触发总次数
             */
            pity_trigger_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'Pity系统（保底）触发总次数'
            },

            /**
             * 反连空触发次数
             */
            anti_empty_trigger_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'AntiEmpty（反连空）触发次数'
            },

            /**
             * 反连高触发次数
             */
            anti_high_trigger_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'AntiHigh（反连高）触发次数'
            },

            /**
             * 运气债务补偿次数
             */
            luck_debt_trigger_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '运气债务补偿触发次数'
            },

            // ========== 计算指标 ==========

            /**
             * 当日空奖率
             */
            empty_rate: {
              type: Sequelize.DECIMAL(5, 4),
              allowNull: false,
              defaultValue: 0,
              comment: '当日空奖率（0.0000-1.0000）'
            },

            /**
             * 当日高价值率
             */
            high_value_rate: {
              type: Sequelize.DECIMAL(5, 4),
              allowNull: false,
              defaultValue: 0,
              comment: '当日高价值率（0.0000-1.0000）'
            },

            /**
             * 平均奖品价值
             */
            avg_prize_value: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              defaultValue: 0,
              comment: '当日平均奖品价值（积分）'
            },

            // ========== 元数据 ==========

            /**
             * 聚合时间戳
             */
            aggregated_at: {
              type: Sequelize.DATE,
              allowNull: false,
              defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
              comment: '聚合计算时间（北京时间）'
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
            comment: '抽奖日报统计表（按日聚合，永久保留，用于长期历史分析）'
          }
        )
        console.log('    ✅ 表 lottery_daily_metrics 创建成功')
      }

      console.log('\n📋 [2/3] 创建索引...')

      // 唯一索引：活动+日期（防止重复聚合）
      await safeAddIndex('lottery_daily_metrics', ['campaign_id', 'metric_date'], {
        name: 'uk_daily_campaign_date',
        unique: true
      })

      // 日期索引（用于时间范围查询）
      await safeAddIndex('lottery_daily_metrics', ['metric_date'], {
        name: 'idx_daily_metrics_date'
      })

      // 活动索引（用于单活动分析）
      await safeAddIndex('lottery_daily_metrics', ['campaign_id'], {
        name: 'idx_daily_metrics_campaign'
      })

      // 空奖率索引（用于异常检测）
      await safeAddIndex('lottery_daily_metrics', ['empty_rate'], {
        name: 'idx_daily_metrics_empty_rate'
      })

      console.log('\n📋 [3/3] 创建外键约束...')

      await safeAddConstraint('lottery_daily_metrics', {
        name: 'fk_daily_metrics_campaign_id',
        fields: ['campaign_id'],
        type: 'foreign key',
        references: {
          table: 'lottery_campaigns',
          field: 'campaign_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })

      // 提交事务
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ lottery_daily_metrics 日报统计表创建完成！')
      console.log('='.repeat(60))
      console.log('\n📊 表功能说明：')
      console.log('  - 数据来源：每日凌晨从 lottery_hourly_metrics 汇总')
      console.log('  - 保留策略：永久保留，支持长期历史分析')
      console.log('  - 核心指标：抽奖次数、Budget Tier 分布、体验机制触发')
      console.log('  - 使用场景：日报生成、年度对比、运营决策')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    console.log('🔄 开始回滚：删除 lottery_daily_metrics 表...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除外键约束
      console.log('\n🗑️ 删除外键约束...')
      try {
        await queryInterface.removeConstraint(
          'lottery_daily_metrics',
          'fk_daily_metrics_campaign_id',
          { transaction }
        )
        console.log('    ✅ 约束 fk_daily_metrics_campaign_id 删除成功')
      } catch (err) {
        console.log(`    ⏭️ 约束删除失败: ${err.message}`)
      }

      // 删除表
      console.log('\n🗑️ 删除表...')
      try {
        await queryInterface.dropTable('lottery_daily_metrics', { transaction })
        console.log('    ✅ 表 lottery_daily_metrics 删除成功')
      } catch (err) {
        console.log(`    ⏭️ 表删除失败: ${err.message}`)
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
