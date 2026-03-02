'use strict'

/**
 * 迁移：创建 lottery_user_experience_state 表
 *
 * 业务背景：
 * - 该表是 Pity 系统、Anti-Empty Streak、Anti-High Streak 机制的核心数据存储
 * - 模型文件(models/LotteryUserExperienceState.js)已存在但对应的数据库表未创建
 * - 表不存在导致所有体验平滑机制（包括防连续高价值保护）完全失效
 * - 直接影响：用户 13612227930 的 high 档位中奖率达到 64.8%（设计值 5%）
 *
 * 修复影响：
 * - AntiHighStreakHandler 将能正常读取 recent_high_count，防止连续高价值中奖
 * - Pity 系统将能正常追踪 empty_streak，确保连续空奖时的保底触发
 * - 各体验平滑机制恢复工作，抽奖概率回归设计值
 *
 * @version 20260214233008
 * @description 创建 lottery_user_experience_state 表（修复体验平滑机制失效的致命BUG）
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /* ========== 1. 创建表 ========== */
    await queryInterface.createTable('lottery_user_experience_state', {
      /**
       * 状态ID - 自增主键
       */
      lottery_user_experience_state_id: {
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
        comment: '用户ID（外键关联users.user_id）',
        references: {
          model: 'users',
          key: 'user_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },

      /**
       * 活动ID - 外键关联 lottery_campaigns 表
       */
      lottery_campaign_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '抽奖活动ID（外键关联lottery_campaigns.lottery_campaign_id）',
        references: {
          model: 'lottery_campaigns',
          key: 'lottery_campaign_id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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
        comment: '最后一次抽奖档位（high/mid/low/empty）'
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
    }, {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      comment: '用户活动级抽奖体验状态表（Pity/AntiEmpty/AntiHigh）'
    })

    /* ========== 2. 创建索引（检查已有索引避免重复） ========== */
    const [existingIndexes] = await queryInterface.sequelize.query(
      "SHOW INDEX FROM lottery_user_experience_state"
    )
    const existingIndexNames = new Set(existingIndexes.map(i => i.Key_name))

    if (!existingIndexNames.has('uk_user_campaign_experience')) {
      await queryInterface.addIndex('lottery_user_experience_state',
        ['user_id', 'lottery_campaign_id'],
        { unique: true, name: 'uk_user_campaign_experience' }
      )
    }

    if (!existingIndexNames.has('idx_experience_user_id')) {
      await queryInterface.addIndex('lottery_user_experience_state',
        ['user_id'],
        { name: 'idx_experience_user_id' }
      )
    }

    if (!existingIndexNames.has('idx_experience_campaign_id')) {
      await queryInterface.addIndex('lottery_user_experience_state',
        ['lottery_campaign_id'],
        { name: 'idx_experience_campaign_id' }
      )
    }

    if (!existingIndexNames.has('idx_experience_empty_streak')) {
      await queryInterface.addIndex('lottery_user_experience_state',
        ['empty_streak'],
        { name: 'idx_experience_empty_streak' }
      )
    }

    /* ========== 3. 插入现有用户的初始状态（基于历史数据） ========== */
    /*
     * 从 lottery_draws 表汇总现有抽奖数据，为已有用户创建体验状态记录
     * 这样新的抽奖可以基于历史数据正确判断 AntiHigh
     */
    await queryInterface.sequelize.query(`
      INSERT INTO lottery_user_experience_state
        (user_id, lottery_campaign_id, empty_streak, recent_high_count,
         max_empty_streak, total_draw_count, total_empty_count,
         pity_trigger_count, last_draw_at, last_draw_tier, created_at, updated_at)
      SELECT
        ld.user_id,
        ld.lottery_campaign_id,
        /* empty_streak: 从最近一条非空奖记录之后的空奖连续数 */
        0 AS empty_streak,
        /* recent_high_count: 最近10次抽奖中high档位的次数 */
        COALESCE((
          SELECT COUNT(*)
          FROM (
            SELECT reward_tier
            FROM lottery_draws sub
            WHERE sub.user_id = ld.user_id
              AND sub.lottery_campaign_id = ld.lottery_campaign_id
            ORDER BY sub.created_at DESC
            LIMIT 10
          ) recent
          WHERE recent.reward_tier = 'high'
        ), 0) AS recent_high_count,
        /* max_empty_streak: 暂设为0，无法从现有数据精确计算 */
        0 AS max_empty_streak,
        COUNT(*) AS total_draw_count,
        SUM(CASE WHEN ld.reward_tier IN ('fallback', 'unknown') OR ld.prize_value_points = 0 THEN 1 ELSE 0 END) AS total_empty_count,
        SUM(CASE WHEN ld.guarantee_triggered = 1 THEN 1 ELSE 0 END) AS pity_trigger_count,
        MAX(ld.created_at) AS last_draw_at,
        /* 最后一次抽奖的档位 */
        (SELECT sub2.reward_tier
         FROM lottery_draws sub2
         WHERE sub2.user_id = ld.user_id
           AND sub2.lottery_campaign_id = ld.lottery_campaign_id
         ORDER BY sub2.created_at DESC
         LIMIT 1
        ) AS last_draw_tier,
        NOW() AS created_at,
        NOW() AS updated_at
      FROM lottery_draws ld
      GROUP BY ld.user_id, ld.lottery_campaign_id
    `)

    /* ========== 4. 验证数据完整性 ========== */
    const [results] = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS cnt FROM lottery_user_experience_state'
    )
    const count = results[0].cnt
    console.log(`✅ lottery_user_experience_state 表创建成功，已初始化 ${count} 条体验状态记录`)

    /* 验证关键用户（13612227930 = user_id 31）的状态 */
    const [userState] = await queryInterface.sequelize.query(
      'SELECT * FROM lottery_user_experience_state WHERE user_id = 31'
    )
    if (userState.length > 0) {
      console.log(`✅ 用户31体验状态：recent_high_count=${userState[0].recent_high_count}, total_draw_count=${userState[0].total_draw_count}`)
    }
  },

  async down(queryInterface, _Sequelize) {
    await queryInterface.dropTable('lottery_user_experience_state')
    console.log('✅ lottery_user_experience_state 表已删除')
  }
}
