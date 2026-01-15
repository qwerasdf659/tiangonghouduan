'use strict'

/**
 * 数据库迁移：用户风控配置表和挂牌白名单
 *
 * 迁移目的：
 * 1. 添加 allowed_listing_assets 配置（挂牌白名单，与结算白名单分离）
 * 2. 为 users 表添加 user_level 字段（用户等级唯一权威来源）
 * 3. 创建 user_risk_profiles 表（用户风控配置，JSON 可扩展版）
 * 4. 预置等级配置数据（normal/vip/merchant 三个等级的 JSON 阈值）
 *
 * 关联文档：
 * - docs/交易市场多币种扩展功能-待办清单-2026-01-14.md
 *
 * 核心决策（来源：2026-01-14 产品决策）：
 * - 双白名单机制：
 *   - allowed_listing_assets: 控制新挂牌时可选的定价币种
 *   - allowed_settlement_assets: 控制订单结算时可用的币种（已存在）
 * - 用户等级：normal（普通用户）、vip（VIP用户）、merchant（商户）
 * - 风控阈值：每用户+每币种的日限次/日限额，存储在 JSON 字段中
 * - fail-closed 策略：Redis 不可用时拒绝所有风控相关操作
 *
 * @version 1.0.0
 * @date 2026-01-14
 */

module.exports = {
  /**
   * 执行迁移：添加用户风控配置和挂牌白名单
   *
   * @param {object} queryInterface - Sequelize QueryInterface 实例
   * @param {object} Sequelize - Sequelize 构造函数（用于数据类型）
   * @returns {Promise<void>}
   */
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🚀 [迁移开始] 用户风控配置和挂牌白名单...')

      // ============================================
      // 步骤1：添加 allowed_listing_assets 配置
      // ============================================
      console.log('📌 步骤1: 添加 allowed_listing_assets 配置（挂牌白名单）...')

      // 检查是否已存在
      const [existingListingAssets] = await queryInterface.sequelize.query(
        `SELECT setting_id FROM system_settings WHERE setting_key = 'allowed_listing_assets'`,
        { transaction }
      )

      if (existingListingAssets.length === 0) {
        await queryInterface.bulkInsert(
          'system_settings',
          [
            {
              category: 'marketplace',
              setting_key: 'allowed_listing_assets',
              setting_value: '["DIAMOND","red_shard"]',
              value_type: 'json',
              description: '交易市场挂牌允许的定价币种白名单（JSON数组格式，与结算白名单分离）',
              is_visible: 1,
              is_readonly: 0,
              created_at: new Date(),
              updated_at: new Date()
            }
          ],
          { transaction }
        )
        console.log('  ✅ 已添加: allowed_listing_assets')
      } else {
        console.log('  ⏭️ 已存在: allowed_listing_assets')
      }

      // ============================================
      // 步骤2：为 users 表添加 user_level 字段
      // ============================================
      console.log('📌 步骤2: 为 users 表添加 user_level 字段...')

      // 检查字段是否已存在
      const [existingUserLevel] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'user_level'`,
        { transaction }
      )

      if (existingUserLevel.length === 0) {
        await queryInterface.addColumn(
          'users',
          'user_level',
          {
            type: Sequelize.ENUM('normal', 'vip', 'merchant'),
            allowNull: false,
            defaultValue: 'normal',
            comment: '用户等级（normal-普通用户，vip-VIP用户，merchant-商户）'
          },
          { transaction }
        )
        console.log('  ✅ 已添加: users.user_level')

        // 添加索引以支持按等级查询
        await queryInterface.addIndex('users', ['user_level'], {
          name: 'idx_users_user_level',
          transaction
        })
        console.log('  ✅ 已添加索引: idx_users_user_level')
      } else {
        console.log('  ⏭️ 已存在: users.user_level')
      }

      // ============================================
      // 步骤3：创建 user_risk_profiles 表
      // ============================================
      console.log('📌 步骤3: 创建 user_risk_profiles 表...')

      // 检查表是否已存在
      const [existingRiskTable] = await queryInterface.sequelize.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user_risk_profiles'`,
        { transaction }
      )

      if (existingRiskTable.length === 0) {
        await queryInterface.createTable(
          'user_risk_profiles',
          {
            // 主键
            risk_profile_id: {
              type: Sequelize.INTEGER.UNSIGNED,
              primaryKey: true,
              autoIncrement: true,
              comment: '风控配置主键ID'
            },

            // 外键：关联用户（可为 NULL，表示等级默认配置）
            // 注意：users.user_id 是 INT（非 UNSIGNED），此处必须匹配
            user_id: {
              type: Sequelize.INTEGER,
              allowNull: true,
              references: {
                model: 'users',
                key: 'user_id'
              },
              onDelete: 'CASCADE',
              onUpdate: 'CASCADE',
              comment: '用户ID（NULL 表示等级默认配置）'
            },

            // 用户等级（用于等级默认配置）
            user_level: {
              type: Sequelize.ENUM('normal', 'vip', 'merchant'),
              allowNull: false,
              defaultValue: 'normal',
              comment: '用户等级（normal/vip/merchant）'
            },

            // 配置类型：user（用户个人配置）或 level（等级默认配置）
            config_type: {
              type: Sequelize.ENUM('user', 'level'),
              allowNull: false,
              defaultValue: 'level',
              comment: '配置类型（user-用户个人配置，level-等级默认配置）'
            },

            // JSON 格式的风控阈值配置
            // 结构示例：
            // {
            //   "DIAMOND": {
            //     "daily_max_listings": 20,
            //     "daily_max_trades": 10,
            //     "daily_max_amount": 100000
            //   },
            //   "red_shard": {
            //     "daily_max_listings": 20,
            //     "daily_max_trades": 10,
            //     "daily_max_amount": 50000
            //   }
            // }
            thresholds: {
              type: Sequelize.JSON,
              allowNull: false,
              defaultValue: {},
              comment: 'JSON格式的风控阈值配置（按币种分组）'
            },

            // 账户冻结状态
            is_frozen: {
              type: Sequelize.BOOLEAN,
              allowNull: false,
              defaultValue: false,
              comment: '账户是否冻结（true-冻结，禁止所有交易）'
            },

            // 冻结原因
            frozen_reason: {
              type: Sequelize.STRING(500),
              allowNull: true,
              comment: '冻结原因（is_frozen=true 时必填）'
            },

            // 冻结时间
            frozen_at: {
              type: Sequelize.DATE,
              allowNull: true,
              comment: '冻结时间'
            },

            // 冻结操作人（注意：users.user_id 是 INT 非 UNSIGNED，此处必须匹配）
            frozen_by: {
              type: Sequelize.INTEGER,
              allowNull: true,
              references: {
                model: 'users',
                key: 'user_id'
              },
              onDelete: 'SET NULL',
              onUpdate: 'CASCADE',
              comment: '冻结操作人ID（管理员）'
            },

            // 备注
            remarks: {
              type: Sequelize.STRING(500),
              allowNull: true,
              comment: '配置备注'
            },

            // 标准时间戳字段
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
            transaction,
            comment: '用户风控配置表：存储用户等级默认配置和个人自定义配置'
          }
        )
        console.log('  ✅ 已创建: user_risk_profiles')

        // 添加索引
        await queryInterface.addIndex('user_risk_profiles', ['user_id'], {
          name: 'idx_user_risk_profiles_user_id',
          transaction
        })

        await queryInterface.addIndex('user_risk_profiles', ['user_level', 'config_type'], {
          name: 'idx_user_risk_profiles_level_type',
          transaction
        })

        await queryInterface.addIndex('user_risk_profiles', ['is_frozen'], {
          name: 'idx_user_risk_profiles_is_frozen',
          transaction
        })

        // 添加唯一约束：等级配置每个等级只能有一条记录
        await queryInterface.addIndex('user_risk_profiles', ['user_level'], {
          name: 'uk_user_risk_profiles_level_default',
          unique: true,
          where: {
            config_type: 'level'
          },
          transaction
        })

        console.log('  ✅ 已添加索引和约束')
      } else {
        console.log('  ⏭️ 已存在: user_risk_profiles')
      }

      // ============================================
      // 步骤4：预置等级配置数据
      // ============================================
      console.log('📌 步骤4: 预置等级配置数据...')

      // 定义三个等级的默认阈值配置
      const levelConfigs = [
        {
          user_id: null,
          user_level: 'normal',
          config_type: 'level',
          thresholds: JSON.stringify({
            DIAMOND: {
              daily_max_listings: 20,
              daily_max_trades: 10,
              daily_max_amount: 100000
            },
            red_shard: {
              daily_max_listings: 20,
              daily_max_trades: 10,
              daily_max_amount: 50000
            }
          }),
          is_frozen: false,
          frozen_reason: null,
          frozen_at: null,
          frozen_by: null,
          remarks: '普通用户默认风控配置',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: null,
          user_level: 'vip',
          config_type: 'level',
          thresholds: JSON.stringify({
            DIAMOND: {
              daily_max_listings: 50,
              daily_max_trades: 30,
              daily_max_amount: 500000
            },
            red_shard: {
              daily_max_listings: 50,
              daily_max_trades: 30,
              daily_max_amount: 200000
            }
          }),
          is_frozen: false,
          frozen_reason: null,
          frozen_at: null,
          frozen_by: null,
          remarks: 'VIP用户默认风控配置',
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          user_id: null,
          user_level: 'merchant',
          config_type: 'level',
          thresholds: JSON.stringify({
            DIAMOND: {
              daily_max_listings: 100,
              daily_max_trades: 50,
              daily_max_amount: 1000000
            },
            red_shard: {
              daily_max_listings: 100,
              daily_max_trades: 50,
              daily_max_amount: 500000
            }
          }),
          is_frozen: false,
          frozen_reason: null,
          frozen_at: null,
          frozen_by: null,
          remarks: '商户默认风控配置',
          created_at: new Date(),
          updated_at: new Date()
        }
      ]

      for (const config of levelConfigs) {
        // 检查是否已存在
        const [existing] = await queryInterface.sequelize.query(
          `SELECT risk_profile_id FROM user_risk_profiles 
           WHERE user_level = ? AND config_type = 'level'`,
          {
            replacements: [config.user_level],
            transaction
          }
        )

        if (existing.length === 0) {
          await queryInterface.bulkInsert('user_risk_profiles', [config], {
            transaction
          })
          console.log(`  ✅ 已添加等级配置: ${config.user_level}`)
        } else {
          console.log(`  ⏭️ 已存在等级配置: ${config.user_level}`)
        }
      }

      // 提交事务
      await transaction.commit()

      console.log('🎉 [迁移完成] 用户风控配置和挂牌白名单已添加')
      console.log('📊 汇总:')
      console.log('  - allowed_listing_assets 配置（挂牌白名单）')
      console.log('  - users.user_level 字段')
      console.log('  - user_risk_profiles 表')
      console.log('  - 3 个等级默认配置（normal/vip/merchant）')
    } catch (error) {
      // 回滚事务
      await transaction.rollback()
      console.error('❌ [迁移失败]', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移：移除用户风控配置和挂牌白名单
   *
   * @param {object} queryInterface - Sequelize QueryInterface 实例
   * @param {object} Sequelize - Sequelize 构造函数
   * @returns {Promise<void>}
   */
  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔙 [回滚开始] 移除用户风控配置和挂牌白名单...')

      // 删除 user_risk_profiles 表
      await queryInterface.dropTable('user_risk_profiles', { transaction })
      console.log('✅ user_risk_profiles 表已删除')

      // 删除 users.user_level 字段
      const [existingUserLevel] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'user_level'`,
        { transaction }
      )

      if (existingUserLevel.length > 0) {
        // 先删除索引
        await queryInterface.removeIndex('users', 'idx_users_user_level', { transaction })
        // 再删除字段
        await queryInterface.removeColumn('users', 'user_level', { transaction })
        console.log('✅ users.user_level 字段已删除')
      }

      // 删除 allowed_listing_assets 配置
      await queryInterface.sequelize.query(
        `DELETE FROM system_settings WHERE setting_key = 'allowed_listing_assets'`,
        { transaction }
      )
      console.log('✅ allowed_listing_assets 配置已删除')

      await transaction.commit()
      console.log('🎉 [回滚完成]')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ [回滚失败]', error.message)
      throw error
    }
  }
}
