'use strict'

/**
 * 迁移文件：创建抽奖监控指标表
 *
 * 基于《抽奖模块POINTS与BUDGET_POINTS平衡方案》文档中的监控设计
 *
 * lottery_hourly_metrics 表用于存储按小时聚合的抽奖监控指标
 *
 * 核心业务场景：
 * 1. 实时监控活动健康度（空奖率、高价值率、预算消耗率）
 * 2. 策略效果评估（Pity 触发率、运气债务分布）
 * 3. 异常检测和预警（过高空奖率、预算超支等）
 *
 * 数据流向：
 * - 写入：定时任务每小时聚合一次（建议使用 cron job 或后台任务）
 * - 读取：监控仪表板、运营分析报表
 *
 * 设计原则：
 * - 按小时粒度聚合，避免实时计算压力
 * - 预计算关键指标，支持快速查询
 * - 保留活动维度，支持跨活动对比分析
 *
 * 创建时间：2026-01-20
 * 作者：抽奖模块策略重构
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始创建 lottery_hourly_metrics 监控指标表...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

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

    /**
     * 辅助函数：安全添加索引
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

    try {
      console.log('\n📋 [1/3] 创建 lottery_hourly_metrics 表...')

      if (await tableExists('lottery_hourly_metrics')) {
        console.log('    ⏭️ 表已存在，跳过创建')
      } else {
        await queryInterface.createTable(
          'lottery_hourly_metrics',
          {
            /**
             * 指标ID - 主键（自增）
             */
            metric_id: {
              type: Sequelize.BIGINT,
              primaryKey: true,
              autoIncrement: true,
              comment: '指标记录ID（自增主键）'
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
             * 统计小时 - 格式: YYYY-MM-DD HH:00:00
             */
            hour_bucket: {
              type: Sequelize.DATE,
              allowNull: false,
              comment: '统计小时（格式: YYYY-MM-DD HH:00:00，北京时间）'
            },

            // ========== 基础抽奖统计 ==========

            /**
             * 该小时总抽奖次数
             */
            total_draws: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '该小时总抽奖次数'
            },

            /**
             * 该小时唯一用户数
             */
            unique_users: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '该小时参与抽奖的唯一用户数'
            },

            // ========== 档位分布统计 ==========

            /**
             * 高价值奖品次数（high 档位）
             */
            high_tier_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '高价值奖品次数（high档位）'
            },

            /**
             * 中价值奖品次数（mid 档位）
             */
            mid_tier_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '中价值奖品次数（mid档位）'
            },

            /**
             * 低价值奖品次数（low 档位）
             */
            low_tier_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '低价值奖品次数（low档位）'
            },

            /**
             * 空奖次数（fallback 档位）
             */
            fallback_tier_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '空奖次数（fallback档位）'
            },

            // ========== 预算相关统计 ==========

            /**
             * 总预算消耗（积分）
             */
            total_budget_consumed: {
              type: Sequelize.BIGINT,
              allowNull: false,
              defaultValue: 0,
              comment: '该小时总预算消耗（积分）'
            },

            /**
             * 总奖品价值发放（积分）
             */
            total_prize_value: {
              type: Sequelize.BIGINT,
              allowNull: false,
              defaultValue: 0,
              comment: '该小时发放的总奖品价值（积分）'
            },

            // ========== 预算分层分布（B0-B3） ==========

            /**
             * B0 档位（无预算）用户抽奖次数
             */
            b0_tier_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'B0档位（无预算）用户抽奖次数'
            },

            /**
             * B1 档位（低预算）用户抽奖次数
             */
            b1_tier_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'B1档位（低预算≤100）用户抽奖次数'
            },

            /**
             * B2 档位（中预算）用户抽奖次数
             */
            b2_tier_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'B2档位（中预算101-500）用户抽奖次数'
            },

            /**
             * B3 档位（高预算）用户抽奖次数
             */
            b3_tier_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'B3档位（高预算>500）用户抽奖次数'
            },

            // ========== 体验机制统计 ==========

            /**
             * Pity 系统触发次数
             */
            pity_triggered_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'Pity系统（软保底）触发次数'
            },

            /**
             * AntiEmpty 强制非空次数
             */
            anti_empty_triggered_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'AntiEmpty（反连空）强制非空触发次数'
            },

            /**
             * AntiHigh 档位限制次数
             */
            anti_high_triggered_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: 'AntiHigh（反连高）档位限制触发次数'
            },

            /**
             * 运气债务补偿触发次数
             */
            luck_debt_triggered_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '运气债务补偿触发次数（debt_level > none）'
            },

            // ========== 保底和降级统计 ==========

            /**
             * 保底机制触发次数
             */
            guarantee_triggered_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '保底机制触发次数'
            },

            /**
             * 档位降级触发次数
             */
            tier_downgrade_count: {
              type: Sequelize.INTEGER,
              allowNull: false,
              defaultValue: 0,
              comment: '档位降级触发次数（如high无库存降级到mid）'
            },

            // ========== 计算指标（预计算，加速查询） ==========

            /**
             * 空奖率（fallback_tier_count / total_draws）
             */
            empty_rate: {
              type: Sequelize.DECIMAL(5, 4),
              allowNull: false,
              defaultValue: 0,
              comment: '空奖率（0.0000-1.0000）'
            },

            /**
             * 高价值率（high_tier_count / total_draws）
             */
            high_value_rate: {
              type: Sequelize.DECIMAL(5, 4),
              allowNull: false,
              defaultValue: 0,
              comment: '高价值率（0.0000-1.0000）'
            },

            /**
             * 平均奖品价值
             */
            avg_prize_value: {
              type: Sequelize.DECIMAL(10, 2),
              allowNull: false,
              defaultValue: 0,
              comment: '平均奖品价值（积分）'
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
            comment: '抽奖监控指标表（按小时聚合，用于监控和分析）'
          }
        )
        console.log('    ✅ 表 lottery_hourly_metrics 创建成功')
      }

      console.log('\n📋 [2/3] 创建索引...')

      // 唯一索引：活动+小时（防止重复聚合）
      await safeAddIndex('lottery_hourly_metrics', ['campaign_id', 'hour_bucket'], {
        name: 'uk_campaign_hour',
        unique: true
      })

      // 时间索引（用于时间范围查询）
      await safeAddIndex('lottery_hourly_metrics', ['hour_bucket'], {
        name: 'idx_hourly_metrics_hour'
      })

      // 活动索引（用于单活动分析）
      await safeAddIndex('lottery_hourly_metrics', ['campaign_id'], {
        name: 'idx_hourly_metrics_campaign'
      })

      // 空奖率索引（用于异常检测）
      await safeAddIndex('lottery_hourly_metrics', ['empty_rate'], {
        name: 'idx_hourly_metrics_empty_rate'
      })

      console.log('\n📋 [3/3] 创建外键约束...')

      await safeAddConstraint('lottery_hourly_metrics', {
        name: 'fk_hourly_metrics_campaign_id',
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
      console.log('✅ lottery_hourly_metrics 监控指标表创建完成！')
      console.log('='.repeat(60))
      console.log('\n📊 表功能说明：')
      console.log('  - 基础统计：抽奖次数、用户数、档位分布')
      console.log('  - 预算统计：消耗、发放、BxPx 分层分布')
      console.log('  - 体验机制：Pity、AntiEmpty、AntiHigh、LuckDebt 触发')
      console.log('  - 计算指标：空奖率、高价值率、平均奖品价值（预计算）')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    console.log('🔄 开始回滚：删除 lottery_hourly_metrics 表...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除外键约束
      console.log('\n🗑️ 删除外键约束...')
      try {
        await queryInterface.removeConstraint(
          'lottery_hourly_metrics',
          'fk_hourly_metrics_campaign_id',
          { transaction }
        )
        console.log('    ✅ 约束 fk_hourly_metrics_campaign_id 删除成功')
      } catch (err) {
        console.log(`    ⏭️ 约束删除失败: ${err.message}`)
      }

      // 删除表
      console.log('\n🗑️ 删除表...')
      try {
        await queryInterface.dropTable('lottery_hourly_metrics', { transaction })
        console.log('    ✅ 表 lottery_hourly_metrics 删除成功')
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

