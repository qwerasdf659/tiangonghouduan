'use strict'

/**
 * 迁移文件：创建活动级定价配置表
 *
 * 基于《抽奖模块Strategy到Pipeline迁移方案》文档中 Phase 3 的要求
 * 创建 lottery_campaign_pricing_config 表
 *
 * 业务场景：
 * - 支持活动级的连抽定价配置（动态 1-20 次抽奖）
 * - 支持版本化管理（可回滚/可定时生效/多版本）
 * - 支持运营动态调整折扣率（discount）
 * - 作为 PricingStage 的唯一定价真值来源
 *
 * 设计原则：
 * - 定价唯一真值：此表作为运行时定价的唯一来源
 * - 版本化管理：同一活动可有多个版本，通过 status 控制生效
 * - 定时生效：通过 effective_at/expired_at 控制生效时间范围
 * - 审计追溯：记录创建者、修改者、操作时间
 *
 * 创建时间：2026-01-18
 * 作者：统一抽奖架构重构 - Phase 3
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始创建 lottery_campaign_pricing_config 表...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    // 辅助函数：安全添加索引（先检查是否存在）
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

    // 辅助函数：安全添加外键约束（先检查是否存在）
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
      // ============================================================
      // 表：lottery_campaign_pricing_config - 活动级定价配置表
      // 作用：定义活动的连抽定价规则，支持版本化/回滚/定时生效
      // ============================================================
      console.log('\n📋 创建 lottery_campaign_pricing_config 表...')

      await queryInterface.createTable(
        'lottery_campaign_pricing_config',
        {
          /**
           * 配置ID - 主键
           * 格式：pricing_时间戳_随机码（如 pricing_20260118_abc123）
           */
          config_id: {
            type: Sequelize.STRING(50),
            primaryKey: true,
            comment: '配置唯一ID（格式：pricing_时间戳_随机码）'
          },

          /**
           * 活动ID - 外键关联 lottery_campaigns
           */
          campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '活动ID（外键关联lottery_campaigns.campaign_id）'
          },

          /**
           * 版本号 - 同一活动的版本递增
           */
          version: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 1,
            comment: '版本号（同一活动递增，支持版本回滚）'
          },

          /**
           * 定价配置 - JSON 格式
           * 包含 draw_buttons 数组，每个按钮配置 count/discount/label/enabled/sort_order
           *
           * 示例：
           * {
           *   "draw_buttons": [
           *     { "count": 1, "discount": 1.0, "label": "单抽", "enabled": true, "sort_order": 1 },
           *     { "count": 5, "discount": 1.0, "label": "5连抽", "enabled": true, "sort_order": 3 },
           *     { "count": 10, "discount": 0.90, "label": "10连抽 9折", "enabled": true, "sort_order": 4 }
           *   ]
           * }
           */
          pricing_config: {
            type: Sequelize.JSON,
            allowNull: false,
            comment: '定价配置JSON（draw_buttons数组：count/discount/label/enabled/sort_order）'
          },

          /**
           * 配置状态
           * - draft: 草稿，尚未生效
           * - active: 生效中，当前使用的版本
           * - scheduled: 待生效，等待 effective_at 时间到达
           * - archived: 已归档，历史版本
           */
          status: {
            type: Sequelize.ENUM('draft', 'active', 'scheduled', 'archived'),
            allowNull: false,
            defaultValue: 'draft',
            comment: '状态：draft-草稿, active-生效中, scheduled-待生效, archived-已归档'
          },

          /**
           * 生效时间 - 定时生效功能
           * NULL 表示立即生效
           */
          effective_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '生效时间（NULL表示立即生效，用于定时生效/AB测试场景）'
          },

          /**
           * 过期时间 - 限时活动支持
           * NULL 表示永不过期
           */
          expired_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '过期时间（NULL表示永不过期，用于限时活动折扣）'
          },

          /**
           * 创建人ID - 外键关联 users
           */
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '创建人ID（外键关联users.user_id）'
          },

          /**
           * 最后修改人ID - 外键关联 users
           */
          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '最后修改人ID（外键关联users.user_id）'
          },

          /**
           * 创建时间 - 使用北京时间
           */
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（北京时间）'
          },

          /**
           * 更新时间 - 使用北京时间
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
          engine: 'InnoDB',
          charset: 'utf8mb4',
          collate: 'utf8mb4_unicode_ci',
          comment: '活动级定价配置表（可版本化/可回滚/可定时生效）'
        }
      )

      console.log('    ✅ 表结构创建成功')

      // ============================================================
      // 添加索引
      // ============================================================
      console.log('\n🔍 创建索引...')

      // 索引1：活动+状态（查询活动的生效配置）
      await safeAddIndex('lottery_campaign_pricing_config', ['campaign_id', 'status'], {
        name: 'idx_campaign_status'
      })

      // 索引2：活动+版本（按版本排序）
      await safeAddIndex('lottery_campaign_pricing_config', ['campaign_id', 'version'], {
        name: 'idx_campaign_version'
      })

      // 索引3：生效时间（定时任务扫描待生效配置）
      await safeAddIndex('lottery_campaign_pricing_config', ['effective_at'], {
        name: 'idx_effective_at'
      })

      // 索引4：状态（查询所有待处理的草稿/待生效配置）
      await safeAddIndex('lottery_campaign_pricing_config', ['status'], {
        name: 'idx_status'
      })

      // ============================================================
      // 添加唯一约束
      // ============================================================
      console.log('\n🔐 创建唯一约束...')

      // 唯一约束：同一活动同一版本只能有一条记录
      await safeAddConstraint('lottery_campaign_pricing_config', {
        fields: ['campaign_id', 'version'],
        type: 'unique',
        name: 'uk_campaign_version'
      })

      // ============================================================
      // 添加外键约束
      // ============================================================
      console.log('\n🔗 创建外键约束...')

      // 外键1：campaign_id -> lottery_campaigns.campaign_id
      await safeAddConstraint('lottery_campaign_pricing_config', {
        fields: ['campaign_id'],
        type: 'foreign key',
        name: 'fk_pricing_config_campaign',
        references: {
          table: 'lottery_campaigns',
          field: 'campaign_id'
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })

      // 外键2：created_by -> users.user_id
      await safeAddConstraint('lottery_campaign_pricing_config', {
        fields: ['created_by'],
        type: 'foreign key',
        name: 'fk_pricing_config_creator',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })

      // 外键3：updated_by -> users.user_id（可为空）
      await safeAddConstraint('lottery_campaign_pricing_config', {
        fields: ['updated_by'],
        type: 'foreign key',
        name: 'fk_pricing_config_updater',
        references: {
          table: 'users',
          field: 'user_id'
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE'
      })

      await transaction.commit()
      console.log('\n✅ lottery_campaign_pricing_config 表创建成功！')
      console.log('='.repeat(60))
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    console.log('🔄 开始回滚 lottery_campaign_pricing_config 表...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 删除表（会自动删除相关索引和约束）
      await queryInterface.dropTable('lottery_campaign_pricing_config', { transaction })

      await transaction.commit()
      console.log('✅ 回滚成功：lottery_campaign_pricing_config 表已删除')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}


