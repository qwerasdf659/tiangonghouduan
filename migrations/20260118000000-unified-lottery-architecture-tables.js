'use strict'

/**
 * 迁移文件：统一抽奖平台架构 - 新表创建
 *
 * 基于《抽奖平台统一架构设计方案》文档创建的核心表结构
 *
 * 本迁移创建以下表：
 * 1. lottery_tier_rules       - 档位规则表（整数权重制概率配置）
 * 2. lottery_draw_decisions   - 决策快照表（每次抽奖的完整决策记录）
 * 3. lottery_campaign_user_quota - 用户配额表（pool+quota模式下的活动配额）
 * 4. lottery_campaign_quota_grants - 配额发放记录表
 * 5. preset_inventory_debt    - 库存欠账表（预设强发时的系统垫付记录）
 * 6. preset_budget_debt       - 预算欠账表（预设强发时的预算垫付记录）
 * 7. preset_debt_limits       - 欠账上限配置表
 *
 * 设计原则：
 * - 整数权重制：概率使用整数权重（SCALE=1,000,000），避免浮点精度问题
 * - tier_first选奖法：先选档位再选奖品，固定三档位（high/mid/low）
 * - 强一致性：所有写操作在单事务中完成
 * - 可审计性：决策快照记录每次抽奖的完整决策路径
 *
 * 创建时间：2026-01-18
 * 作者：统一抽奖架构重构
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('🚀 开始执行统一抽奖架构迁移...')
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
      // 表1：lottery_tier_rules - 档位规则表
      // 作用：定义活动下各用户分层的档位概率（整数权重制）
      // ============================================================
      console.log('\n📋 创建 lottery_tier_rules 表...')

      await queryInterface.createTable(
        'lottery_tier_rules',
        {
          // 规则ID - 主键
          tier_rule_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '档位规则主键ID'
          },

          // 活动ID - 外键关联lottery_campaigns
          campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '所属活动ID（外键关联lottery_campaigns.campaign_id）'
          },

          // 用户分层标识 - 如"new_user"、"vip"、"default"等
          segment_key: {
            type: Sequelize.STRING(64),
            allowNull: false,
            defaultValue: 'default',
            comment: '用户分层标识（如new_user/vip/default），由SegmentResolver解析获得'
          },

          // 档位名称 - 固定三档位：high/mid/low
          tier_name: {
            type: Sequelize.ENUM('high', 'mid', 'low'),
            allowNull: false,
            comment: '档位名称：high-高档位, mid-中档位, low-低档位（固定三档）'
          },

          // 档位权重 - 整数权重值（三个档位权重之和必须等于SCALE=1,000,000）
          tier_weight: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            comment: '档位权重（整数，三个档位权重之和必须=1000000）'
          },

          // 规则状态
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
            comment: '规则状态：active-启用, inactive-停用'
          },

          // 审计字段
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建人ID（管理员user_id）'
          },

          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '更新人ID（管理员user_id）'
          },

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
          charset: 'utf8mb4',
          collate: 'utf8mb4_0900_ai_ci',
          comment: '抽奖档位规则表 - 定义各分层用户的档位概率（整数权重制）'
        }
      )

      // lottery_tier_rules 索引
      await safeAddIndex(
        'lottery_tier_rules',
        ['campaign_id', 'segment_key', 'tier_name'],
        { name: 'uk_campaign_segment_tier', unique: true }
      )

      await safeAddIndex('lottery_tier_rules', ['campaign_id', 'status'], {
        name: 'idx_tier_rules_campaign_status'
      })

      // lottery_tier_rules 外键
      await safeAddConstraint('lottery_tier_rules', {
        fields: ['campaign_id'],
        type: 'foreign key',
        name: 'fk_tier_rules_campaign_id',
        references: { table: 'lottery_campaigns', field: 'campaign_id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })

      console.log('  ✅ lottery_tier_rules 表创建成功')

      // ============================================================
      // 表2：lottery_draw_decisions - 决策快照表
      // 作用：记录每次抽奖的完整决策路径，用于审计和问题排查
      // ============================================================
      console.log('\n📋 创建 lottery_draw_decisions 表...')

      await queryInterface.createTable(
        'lottery_draw_decisions',
        {
          // 决策ID - 主键
          decision_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '决策记录主键ID'
          },

          // 关联的抽奖记录ID
          draw_id: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '关联的抽奖记录ID（外键关联lottery_draws.draw_id）'
          },

          // 抽奖幂等键 - 与draw_id对应，便于快速查找
          idempotency_key: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '抽奖幂等键（与lottery_draws.idempotency_key对应）'
          },

          // 使用的Pipeline类型
          pipeline_type: {
            type: Sequelize.ENUM('normal', 'preset', 'override'),
            allowNull: false,
            defaultValue: 'normal',
            comment: 'Pipeline类型：normal-普通抽奖, preset-预设发放, override-管理覆盖'
          },

          // 用户分层标识
          segment_key: {
            type: Sequelize.STRING(64),
            allowNull: true,
            comment: '用户分层标识（由SegmentResolver解析获得）'
          },

          // 选中的档位
          selected_tier: {
            type: Sequelize.ENUM('high', 'mid', 'low', 'fallback'),
            allowNull: true,
            comment: '选中的档位（包含fallback保底档位）'
          },

          // 是否触发降档
          tier_downgrade_triggered: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否触发了档位降级（如high无可用奖品降级到mid）'
          },

          // 原始随机数（用于审计验证）
          random_seed: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: true,
            comment: '原始随机数值（0-999999范围，用于审计复现）'
          },

          // 预算提供者类型
          budget_provider_type: {
            type: Sequelize.ENUM('user', 'pool', 'pool_quota', 'none'),
            allowNull: true,
            comment: '预算提供者类型：user-用户预算, pool-活动池, pool_quota-池+配额, none-无预算限制'
          },

          // 预算扣减金额
          budget_deducted: {
            type: Sequelize.INTEGER,
            allowNull: true,
            defaultValue: 0,
            comment: '本次抽奖扣减的预算金额'
          },

          // 是否使用预设奖品
          preset_used: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否使用了预设奖品'
          },

          // 关联的预设ID
          preset_id: {
            type: Sequelize.STRING(50),
            allowNull: true,
            comment: '使用的预设ID（如果是预设发放）'
          },

          // 是否触发系统垫付
          system_advance_triggered: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否触发了系统垫付（库存或预算垫付）'
          },

          // 库存垫付数量
          inventory_debt_created: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '本次产生的库存欠账数量'
          },

          // 预算垫付金额
          budget_debt_created: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            comment: '本次产生的预算欠账金额'
          },

          // 保底机制触发
          guarantee_triggered: {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            comment: '是否触发了保底机制'
          },

          // 保底类型（如果触发）
          guarantee_type: {
            type: Sequelize.ENUM('consecutive', 'probability', 'none'),
            allowNull: false,
            defaultValue: 'none',
            comment: '保底类型：consecutive-连续失败保底, probability-概率保底, none-未触发'
          },

          // 完整的决策上下文（JSON格式，包含所有决策相关数据）
          decision_context: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '完整决策上下文JSON（包含候选奖品列表、权重计算过程等）'
          },

          // 决策时间戳
          decision_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '决策时间戳'
          },

          // 处理耗时（毫秒）
          processing_time_ms: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '决策处理耗时（毫秒）'
          },

          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_0900_ai_ci',
          comment: '抽奖决策快照表 - 记录每次抽奖的完整决策路径用于审计'
        }
      )

      // lottery_draw_decisions 索引
      await safeAddIndex('lottery_draw_decisions', ['draw_id'], {
        name: 'uk_decisions_draw_id', unique: true
      })

      await safeAddIndex('lottery_draw_decisions', ['idempotency_key'], {
        name: 'idx_decisions_idempotency_key'
      })

      await safeAddIndex('lottery_draw_decisions', ['pipeline_type', 'decision_at'], {
        name: 'idx_decisions_pipeline_time'
      })

      await safeAddIndex('lottery_draw_decisions', ['system_advance_triggered', 'decision_at'], {
        name: 'idx_decisions_advance_time'
      })

      // lottery_draw_decisions 外键
      await safeAddConstraint('lottery_draw_decisions', {
        fields: ['draw_id'],
        type: 'foreign key',
        name: 'fk_decisions_draw_id',
        references: { table: 'lottery_draws', field: 'draw_id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })

      console.log('  ✅ lottery_draw_decisions 表创建成功')

      // ============================================================
      // 表3：lottery_campaign_user_quota - 用户配额表
      // 作用：pool+quota模式下追踪每个用户的活动预算配额
      // ============================================================
      console.log('\n📋 创建 lottery_campaign_user_quota 表...')

      await queryInterface.createTable(
        'lottery_campaign_user_quota',
        {
          // 配额ID - 主键
          quota_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '配额记录主键ID'
          },

          // 用户ID
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID（外键关联users.user_id）'
          },

          // 活动ID
          campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '活动ID（外键关联lottery_campaigns.campaign_id）'
          },

          // 配额总额（整数，分值）
          quota_total: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
            comment: '配额总额（整数分值）'
          },

          // 已使用配额
          quota_used: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
            comment: '已使用配额（整数分值）'
          },

          // 剩余配额（冗余字段，便于查询）
          quota_remaining: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
            comment: '剩余配额（quota_total - quota_used，冗余便于查询）'
          },

          // 配额过期时间
          expires_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '配额过期时间（null表示跟随活动结束时间）'
          },

          // 状态
          status: {
            type: Sequelize.ENUM('active', 'exhausted', 'expired'),
            allowNull: false,
            defaultValue: 'active',
            comment: '配额状态：active-正常, exhausted-已耗尽, expired-已过期'
          },

          // 最后使用时间
          last_used_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '最后一次使用配额的时间'
          },

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
          charset: 'utf8mb4',
          collate: 'utf8mb4_0900_ai_ci',
          comment: '用户活动配额表 - pool+quota模式下追踪用户预算配额'
        }
      )

      // lottery_campaign_user_quota 索引
      await safeAddIndex('lottery_campaign_user_quota', ['user_id', 'campaign_id'], {
        name: 'uk_user_campaign_quota', unique: true
      })

      await safeAddIndex('lottery_campaign_user_quota', ['campaign_id', 'status'], {
        name: 'idx_quota_campaign_status'
      })

      await safeAddIndex('lottery_campaign_user_quota', ['user_id', 'status'], {
        name: 'idx_quota_user_status'
      })

      // lottery_campaign_user_quota 外键
      await safeAddConstraint('lottery_campaign_user_quota', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_user_quota_user_id',
        references: { table: 'users', field: 'user_id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })

      await safeAddConstraint('lottery_campaign_user_quota', {
        fields: ['campaign_id'],
        type: 'foreign key',
        name: 'fk_user_quota_campaign_id',
        references: { table: 'lottery_campaigns', field: 'campaign_id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE'
      })

      console.log('  ✅ lottery_campaign_user_quota 表创建成功')

      // ============================================================
      // 表4：lottery_campaign_quota_grants - 配额发放记录表
      // 作用：记录配额的发放来源和金额，便于审计
      // ============================================================
      console.log('\n📋 创建 lottery_campaign_quota_grants 表...')

      await queryInterface.createTable(
        'lottery_campaign_quota_grants',
        {
          // 发放记录ID
          grant_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '配额发放记录主键ID'
          },

          // 关联的配额记录ID
          quota_id: {
            type: Sequelize.BIGINT,
            allowNull: false,
            comment: '关联的配额记录ID（外键关联lottery_campaign_user_quota.quota_id）'
          },

          // 用户ID（冗余，便于查询）
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID（冗余，便于查询）'
          },

          // 活动ID（冗余，便于查询）
          campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '活动ID（冗余，便于查询）'
          },

          // 发放金额
          grant_amount: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            comment: '发放配额金额（整数分值）'
          },

          // 发放来源类型
          grant_source: {
            type: Sequelize.ENUM('initial', 'topup', 'refund', 'compensation', 'admin'),
            allowNull: false,
            comment: '发放来源：initial-初始配额, topup-充值, refund-退款, compensation-补偿, admin-管理员调整'
          },

          // 发放来源ID（如订单ID、退款ID等）
          source_reference_id: {
            type: Sequelize.STRING(100),
            allowNull: true,
            comment: '来源引用ID（如订单ID、退款ID等，用于追溯）'
          },

          // 发放原因/备注
          grant_reason: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '发放原因/备注'
          },

          // 操作人ID
          granted_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '操作人ID（管理员user_id，系统操作为null）'
          },

          // 发放后余额
          balance_after: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            comment: '发放后配额总余额'
          },

          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间'
          }
        },
        {
          transaction,
          charset: 'utf8mb4',
          collate: 'utf8mb4_0900_ai_ci',
          comment: '配额发放记录表 - 记录配额的发放来源和金额'
        }
      )

      // lottery_campaign_quota_grants 索引
      await safeAddIndex('lottery_campaign_quota_grants', ['quota_id'], {
        name: 'idx_grants_quota_id'
      })

      await safeAddIndex('lottery_campaign_quota_grants', ['user_id', 'campaign_id'], {
        name: 'idx_grants_user_campaign'
      })

      await safeAddIndex('lottery_campaign_quota_grants', ['grant_source', 'created_at'], {
        name: 'idx_grants_source_time'
      })

      console.log('  ✅ lottery_campaign_quota_grants 表创建成功')

      // ============================================================
      // 表5：preset_inventory_debt - 库存欠账表
      // 作用：记录预设强发时库存不足的系统垫付，待后续补货清偿
      // ============================================================
      console.log('\n📋 创建 preset_inventory_debt 表...')

      await queryInterface.createTable(
        'preset_inventory_debt',
        {
          // 欠账ID
          debt_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '库存欠账主键ID'
          },

          // 关联的预设ID
          preset_id: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '关联的预设ID（外键关联lottery_presets.preset_id）'
          },

          // 关联的抽奖记录ID
          draw_id: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '关联的抽奖记录ID（外键关联lottery_draws.draw_id）'
          },

          // 奖品ID
          prize_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '欠账奖品ID（外键关联lottery_prizes.prize_id）'
          },

          // 用户ID（收到预设奖品的用户）
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID（收到预设奖品的用户）'
          },

          // 活动ID
          campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '活动ID'
          },

          // 欠账数量
          debt_quantity: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 1,
            comment: '欠账数量（库存垫付数量）'
          },

          // 欠账状态
          status: {
            type: Sequelize.ENUM('pending', 'cleared', 'written_off'),
            allowNull: false,
            defaultValue: 'pending',
            comment: '欠账状态：pending-待清偿, cleared-已清偿, written_off-已核销'
          },

          // 清偿数量
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

          // 清偿方式
          cleared_by_method: {
            type: Sequelize.ENUM('restock', 'manual', 'auto'),
            allowNull: true,
            comment: '清偿方式：restock-补货触发, manual-手动清偿, auto-自动核销'
          },

          // 清偿操作人
          cleared_by_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '清偿操作人ID'
          },

          // 清偿备注
          cleared_notes: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '清偿备注'
          },

          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（欠账产生时间）'
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
          charset: 'utf8mb4',
          collate: 'utf8mb4_0900_ai_ci',
          comment: '预设库存欠账表 - 记录预设强发时的库存垫付'
        }
      )

      // preset_inventory_debt 索引
      await safeAddIndex('preset_inventory_debt', ['preset_id'], {
        name: 'idx_inv_debt_preset'
      })

      await safeAddIndex('preset_inventory_debt', ['prize_id', 'status'], {
        name: 'idx_inv_debt_prize_status'
      })

      await safeAddIndex('preset_inventory_debt', ['campaign_id', 'status'], {
        name: 'idx_inv_debt_campaign_status'
      })

      await safeAddIndex('preset_inventory_debt', ['status', 'created_at'], {
        name: 'idx_inv_debt_status_time'
      })

      // preset_inventory_debt 外键
      await safeAddConstraint('preset_inventory_debt', {
        fields: ['preset_id'],
        type: 'foreign key',
        name: 'fk_inv_debt_preset_id',
        references: { table: 'lottery_presets', field: 'preset_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })

      await safeAddConstraint('preset_inventory_debt', {
        fields: ['draw_id'],
        type: 'foreign key',
        name: 'fk_inv_debt_draw_id',
        references: { table: 'lottery_draws', field: 'draw_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })

      await safeAddConstraint('preset_inventory_debt', {
        fields: ['prize_id'],
        type: 'foreign key',
        name: 'fk_inv_debt_prize_id',
        references: { table: 'lottery_prizes', field: 'prize_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })

      await safeAddConstraint('preset_inventory_debt', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_inv_debt_user_id',
        references: { table: 'users', field: 'user_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })

      console.log('  ✅ preset_inventory_debt 表创建成功')

      // ============================================================
      // 表6：preset_budget_debt - 预算欠账表
      // 作用：记录预设强发时预算不足的系统垫付
      // ============================================================
      console.log('\n📋 创建 preset_budget_debt 表...')

      await queryInterface.createTable(
        'preset_budget_debt',
        {
          // 欠账ID
          debt_id: {
            type: Sequelize.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            comment: '预算欠账主键ID'
          },

          // 关联的预设ID
          preset_id: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '关联的预设ID（外键关联lottery_presets.preset_id）'
          },

          // 关联的抽奖记录ID
          draw_id: {
            type: Sequelize.STRING(50),
            allowNull: false,
            comment: '关联的抽奖记录ID（外键关联lottery_draws.draw_id）'
          },

          // 用户ID
          user_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '用户ID（收到预设奖品的用户）'
          },

          // 活动ID
          campaign_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            comment: '活动ID'
          },

          // 欠账金额
          debt_amount: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            comment: '欠账金额（系统垫付的预算金额，整数分值）'
          },

          // 欠账来源类型
          debt_source: {
            type: Sequelize.ENUM('user_budget', 'pool_budget', 'pool_quota'),
            allowNull: false,
            comment: '欠账来源：user_budget-用户预算, pool_budget-活动池预算, pool_quota-池+配额'
          },

          // 欠账状态
          status: {
            type: Sequelize.ENUM('pending', 'cleared', 'written_off'),
            allowNull: false,
            defaultValue: 'pending',
            comment: '欠账状态：pending-待清偿, cleared-已清偿, written_off-已核销'
          },

          // 已清偿金额
          cleared_amount: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
            comment: '已清偿金额'
          },

          // 清偿时间
          cleared_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '清偿时间'
          },

          // 清偿方式
          cleared_by_method: {
            type: Sequelize.ENUM('topup', 'manual', 'auto'),
            allowNull: true,
            comment: '清偿方式：topup-充值触发, manual-手动清偿, auto-自动核销'
          },

          // 清偿操作人
          cleared_by_user_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '清偿操作人ID'
          },

          // 清偿备注
          cleared_notes: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '清偿备注'
          },

          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
            comment: '创建时间（欠账产生时间）'
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
          charset: 'utf8mb4',
          collate: 'utf8mb4_0900_ai_ci',
          comment: '预设预算欠账表 - 记录预设强发时的预算垫付'
        }
      )

      // preset_budget_debt 索引
      await safeAddIndex('preset_budget_debt', ['preset_id'], {
        name: 'idx_budget_debt_preset'
      })

      await safeAddIndex('preset_budget_debt', ['user_id', 'status'], {
        name: 'idx_budget_debt_user_status'
      })

      await safeAddIndex('preset_budget_debt', ['campaign_id', 'status'], {
        name: 'idx_budget_debt_campaign_status'
      })

      await safeAddIndex('preset_budget_debt', ['status', 'created_at'], {
        name: 'idx_budget_debt_status_time'
      })

      // preset_budget_debt 外键
      await safeAddConstraint('preset_budget_debt', {
        fields: ['preset_id'],
        type: 'foreign key',
        name: 'fk_budget_debt_preset_id',
        references: { table: 'lottery_presets', field: 'preset_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })

      await safeAddConstraint('preset_budget_debt', {
        fields: ['draw_id'],
        type: 'foreign key',
        name: 'fk_budget_debt_draw_id',
        references: { table: 'lottery_draws', field: 'draw_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })

      await safeAddConstraint('preset_budget_debt', {
        fields: ['user_id'],
        type: 'foreign key',
        name: 'fk_budget_debt_user_id',
        references: { table: 'users', field: 'user_id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE'
      })

      console.log('  ✅ preset_budget_debt 表创建成功')

      // ============================================================
      // 表7：preset_debt_limits - 欠账上限配置表
      // 作用：配置各级别的欠账上限，防止系统风险
      // ============================================================
      console.log('\n📋 创建 preset_debt_limits 表...')

      await queryInterface.createTable(
        'preset_debt_limits',
        {
          // 配置ID
          limit_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '欠账上限配置主键ID'
          },

          // 限制级别
          limit_level: {
            type: Sequelize.ENUM('global', 'campaign', 'prize'),
            allowNull: false,
            comment: '限制级别：global-全局, campaign-活动, prize-奖品'
          },

          // 关联ID（根据level不同含义不同）
          reference_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '关联ID：campaign级别为campaign_id，prize级别为prize_id，global级别为null'
          },

          // 库存欠账上限
          inventory_debt_limit: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 100,
            comment: '库存欠账上限数量'
          },

          // 预算欠账上限
          budget_debt_limit: {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 100000,
            comment: '预算欠账上限金额（整数分值）'
          },

          // 状态
          status: {
            type: Sequelize.ENUM('active', 'inactive'),
            allowNull: false,
            defaultValue: 'active',
            comment: '配置状态：active-启用, inactive-停用'
          },

          // 配置说明
          description: {
            type: Sequelize.TEXT,
            allowNull: true,
            comment: '配置说明'
          },

          // 审计字段
          created_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '创建人ID'
          },

          updated_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '更新人ID'
          },

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
          charset: 'utf8mb4',
          collate: 'utf8mb4_0900_ai_ci',
          comment: '欠账上限配置表 - 配置各级别的欠账风险上限'
        }
      )

      // preset_debt_limits 索引
      await safeAddIndex('preset_debt_limits', ['limit_level', 'reference_id'], {
        name: 'uk_debt_limits_level_ref', unique: true
      })

      await safeAddIndex('preset_debt_limits', ['status'], {
        name: 'idx_debt_limits_status'
      })

      console.log('  ✅ preset_debt_limits 表创建成功')

      // ============================================================
      // 插入初始数据：全局欠账上限配置
      // ============================================================
      console.log('\n📋 插入初始数据...')

      await queryInterface.bulkInsert(
        'preset_debt_limits',
        [
          {
            limit_level: 'global',
            reference_id: null,
            inventory_debt_limit: 1000,
            budget_debt_limit: 1000000, // 10000元（分值）
            status: 'active',
            description: '全局默认欠账上限：库存1000件，预算10000元',
            created_by: null,
            updated_by: null,
            created_at: new Date(),
            updated_at: new Date()
          }
        ],
        { transaction }
      )

      console.log('  ✅ 初始化全局欠账上限配置完成')

      // ============================================================
      // 提交事务
      // ============================================================
      await transaction.commit()

      console.log('\n' + '='.repeat(60))
      console.log('✅ 统一抽奖架构迁移执行成功！')
      console.log('='.repeat(60))
      console.log('\n📊 创建摘要:')
      console.log('  - 新表数量: 7')
      console.log('    1. lottery_tier_rules (档位规则表)')
      console.log('    2. lottery_draw_decisions (决策快照表)')
      console.log('    3. lottery_campaign_user_quota (用户配额表)')
      console.log('    4. lottery_campaign_quota_grants (配额发放记录表)')
      console.log('    5. preset_inventory_debt (库存欠账表)')
      console.log('    6. preset_budget_debt (预算欠账表)')
      console.log('    7. preset_debt_limits (欠账上限配置表)')
      console.log('')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移失败:', error.message)
      console.error(error.stack)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    console.log('🔄 开始回滚统一抽奖架构迁移...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 按照依赖关系逆序删除
      await queryInterface.dropTable('preset_debt_limits', { transaction })
      console.log('  ✅ preset_debt_limits 表删除成功')

      await queryInterface.dropTable('preset_budget_debt', { transaction })
      console.log('  ✅ preset_budget_debt 表删除成功')

      await queryInterface.dropTable('preset_inventory_debt', { transaction })
      console.log('  ✅ preset_inventory_debt 表删除成功')

      await queryInterface.dropTable('lottery_campaign_quota_grants', { transaction })
      console.log('  ✅ lottery_campaign_quota_grants 表删除成功')

      await queryInterface.dropTable('lottery_campaign_user_quota', { transaction })
      console.log('  ✅ lottery_campaign_user_quota 表删除成功')

      await queryInterface.dropTable('lottery_draw_decisions', { transaction })
      console.log('  ✅ lottery_draw_decisions 表删除成功')

      await queryInterface.dropTable('lottery_tier_rules', { transaction })
      console.log('  ✅ lottery_tier_rules 表删除成功')

      await transaction.commit()
      console.log('✅ 统一抽奖架构迁移回滚成功')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}

