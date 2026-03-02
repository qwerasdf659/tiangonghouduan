'use strict'

/**
 * @migration 策略参数统一迁移 — 从 lottery_campaigns 迁移到 lottery_strategy_config
 *
 * 迁移内容（6 个字段 → 4 个 config_group，共 6 条/活动）：
 * - segment_resolver_version → segment.resolver_version
 * - guarantee_enabled → guarantee.enabled
 * - guarantee_threshold → guarantee.threshold
 * - guarantee_prize_id → guarantee.prize_id
 * - tier_fallback_lottery_prize_id → tier_fallback.prize_id
 * - preset_debt_enabled → preset.debt_enabled
 *
 * 迁移策略：一步到位（插入 config 数据 + 删除 campaigns 原列），同一事务完成
 * 迁移后 lottery_campaigns 从 49 列减至 43 列，每活动 strategy_config 从 24 条增至 30 条
 *
 * @see docs/配置迁移方案.md
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ── 1. 读取现有活动的 6 个字段值 ──
      const [campaigns] = await queryInterface.sequelize.query(
        `SELECT lottery_campaign_id, segment_resolver_version, guarantee_enabled,
                guarantee_threshold, guarantee_prize_id,
                tier_fallback_lottery_prize_id, preset_debt_enabled
         FROM lottery_campaigns`,
        { transaction }
      )

      // ── 2. 批量插入 strategy_config 记录（幂等：跳过已存在的） ──
      for (const campaign of campaigns) {
        const { lottery_campaign_id } = campaign
        const configs = [
          {
            config_group: 'segment',
            config_key: 'resolver_version',
            config_value: JSON.stringify(campaign.segment_resolver_version || 'default'),
            value_type: 'string',
            description: '用户分群版本'
          },
          {
            config_group: 'guarantee',
            config_key: 'enabled',
            config_value: JSON.stringify(!!campaign.guarantee_enabled),
            value_type: 'boolean',
            description: '固定间隔保底开关'
          },
          {
            config_group: 'guarantee',
            config_key: 'threshold',
            config_value: JSON.stringify(campaign.guarantee_threshold || 10),
            value_type: 'number',
            description: '保底触发间隔（每N次）'
          },
          {
            config_group: 'guarantee',
            config_key: 'prize_id',
            config_value: campaign.guarantee_prize_id != null
              ? JSON.stringify(campaign.guarantee_prize_id)
              : 'null',
            value_type: 'number',
            description: '保底指定奖品ID（null=自动选最高档）'
          },
          {
            config_group: 'tier_fallback',
            config_key: 'prize_id',
            config_value: campaign.tier_fallback_lottery_prize_id != null
              ? JSON.stringify(campaign.tier_fallback_lottery_prize_id)
              : 'null',
            value_type: 'number',
            description: '档位降级兜底奖品ID'
          },
          {
            config_group: 'preset',
            config_key: 'debt_enabled',
            config_value: JSON.stringify(!!campaign.preset_debt_enabled),
            value_type: 'boolean',
            description: '预设队列透支开关'
          }
        ]

        for (const cfg of configs) {
          // 幂等检查：如果已存在则跳过
          const [existing] = await queryInterface.sequelize.query(
            `SELECT lottery_strategy_config_id FROM lottery_strategy_config
             WHERE lottery_campaign_id = ? AND config_group = ? AND config_key = ?`,
            {
              replacements: [lottery_campaign_id, cfg.config_group, cfg.config_key],
              transaction
            }
          )

          if (existing.length === 0) {
            await queryInterface.sequelize.query(
              `INSERT INTO lottery_strategy_config
                (lottery_campaign_id, config_group, config_key, config_value, value_type,
                 description, is_active, priority, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 1, 0, NOW(), NOW())`,
              {
                replacements: [
                  lottery_campaign_id,
                  cfg.config_group,
                  cfg.config_key,
                  cfg.config_value,
                  cfg.value_type,
                  cfg.description
                ],
                transaction
              }
            )
          }
        }
      }

      // ── 3. 删除 lottery_campaigns 表的 6 列 ──
      // 先删外键约束（guarantee_prize_id 和 tier_fallback_lottery_prize_id）
      const [fkConstraints] = await queryInterface.sequelize.query(
        `SELECT CONSTRAINT_NAME, COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'lottery_campaigns'
           AND COLUMN_NAME IN ('guarantee_prize_id', 'tier_fallback_lottery_prize_id')
           AND REFERENCED_TABLE_NAME IS NOT NULL`,
        { transaction }
      )

      for (const fk of fkConstraints) {
        await queryInterface.sequelize.query(
          `ALTER TABLE lottery_campaigns DROP FOREIGN KEY \`${fk.CONSTRAINT_NAME}\``,
          { transaction }
        )
      }

      // 逐列删除
      const columnsToRemove = [
        'segment_resolver_version',
        'guarantee_enabled',
        'guarantee_threshold',
        'guarantee_prize_id',
        'tier_fallback_lottery_prize_id',
        'preset_debt_enabled'
      ]

      for (const col of columnsToRemove) {
        await queryInterface.removeColumn('lottery_campaigns', col, { transaction })
      }

      await transaction.commit()
      console.log('✅ 策略参数迁移完成：6 个字段从 lottery_campaigns 迁移到 lottery_strategy_config')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ── 1. 加回 6 列 ──
      await queryInterface.addColumn('lottery_campaigns', 'segment_resolver_version', {
        type: Sequelize.STRING(32),
        allowNull: false,
        defaultValue: 'v1',
        comment: '分层解析器版本号'
      }, { transaction })

      await queryInterface.addColumn('lottery_campaigns', 'guarantee_enabled', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '是否启用固定间隔保底'
      }, { transaction })

      await queryInterface.addColumn('lottery_campaigns', 'guarantee_threshold', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 10,
        comment: '保底触发间隔'
      }, { transaction })

      await queryInterface.addColumn('lottery_campaigns', 'guarantee_prize_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '保底奖品ID'
      }, { transaction })

      await queryInterface.addColumn('lottery_campaigns', 'tier_fallback_lottery_prize_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: null,
        comment: '档位降级兜底奖品ID'
      }, { transaction })

      await queryInterface.addColumn('lottery_campaigns', 'preset_debt_enabled', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: '预设是否允许欠账'
      }, { transaction })

      // ── 2. 从 strategy_config 回填值到 lottery_campaigns ──
      const configGroups = [
        { group: 'segment', key: 'resolver_version', column: 'segment_resolver_version', unquote: true },
        { group: 'guarantee', key: 'enabled', column: 'guarantee_enabled', cast: 'BOOLEAN' },
        { group: 'guarantee', key: 'threshold', column: 'guarantee_threshold', cast: 'INT' },
        { group: 'guarantee', key: 'prize_id', column: 'guarantee_prize_id', cast: 'INT' },
        { group: 'tier_fallback', key: 'prize_id', column: 'tier_fallback_lottery_prize_id', cast: 'INT' },
        { group: 'preset', key: 'debt_enabled', column: 'preset_debt_enabled', cast: 'BOOLEAN' }
      ]

      for (const cfg of configGroups) {
        let valueExpr = 'sc.config_value'
        if (cfg.unquote) {
          valueExpr = 'JSON_UNQUOTE(sc.config_value)'
        } else if (cfg.cast === 'BOOLEAN') {
          valueExpr = "CASE WHEN sc.config_value = 'true' THEN 1 ELSE 0 END"
        } else if (cfg.cast === 'INT') {
          valueExpr = "CASE WHEN sc.config_value = 'null' THEN NULL ELSE CAST(sc.config_value AS SIGNED) END"
        }

        await queryInterface.sequelize.query(
          `UPDATE lottery_campaigns c
           JOIN lottery_strategy_config sc ON c.lottery_campaign_id = sc.lottery_campaign_id
           SET c.\`${cfg.column}\` = ${valueExpr}
           WHERE sc.config_group = ? AND sc.config_key = ? AND sc.is_active = 1`,
          { replacements: [cfg.group, cfg.key], transaction }
        )
      }

      // ── 3. 删除 strategy_config 中的迁移记录 ──
      await queryInterface.sequelize.query(
        `DELETE FROM lottery_strategy_config
         WHERE config_group IN ('segment', 'guarantee', 'tier_fallback', 'preset')`,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 策略参数回滚完成：6 个字段从 lottery_strategy_config 恢复到 lottery_campaigns')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
