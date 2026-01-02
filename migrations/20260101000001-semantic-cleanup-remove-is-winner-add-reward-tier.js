/**
 * 数据库迁移：抽奖业务语义清理 - 删除is_winner，新增reward_tier
 *
 * 迁移说明：
 * - 符合《抽奖业务语义与口径统一规范》V4.0
 * - 删除"未中奖"语义体系：is_winner字段、empty类型、相关索引
 * - 新增"奖励档位"语义体系：reward_tier字段
 *
 * 业务背景：
 * - 每次抽奖100%从奖品池选择一个奖品（没有"不进入奖品池"的逻辑）
 * - 抽奖结果只讨论"抽到了什么（及其价值层级）"，不讨论"中没中"
 * - 统一对外承诺："每次必得奖励"
 *
 * 变更内容：
 * 1. 删除 is_winner 字段及3个相关索引
 * 2. 新增 reward_tier 字段（奖励档位）
 * 3. 为 reward_tier 添加3个索引
 * 4. 修改 prize_type 枚举（移除 empty）
 * 5. 回填现有记录的 reward_tier 值
 *
 * 注意事项：
 * - 脏数据清理已按规范要求完成（87条is_winner=0的记录）
 * - 此迁移不可逆（破坏性变更），请确保已备份
 *
 * 创建时间：2026-01-01
 * 影响表：lottery_draws
 */

'use strict'

module.exports = {
  /**
   * 执行迁移：语义清理
   */
  up: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🎯 开始执行抽奖业务语义清理迁移...')
      console.log('📋 规范版本：V4.0 - 删除"未中奖"语义，统一为"奖励档位"')

      // ========== 步骤1：先添加新字段 reward_tier ==========
      console.log('\n📌 步骤1：添加 reward_tier 字段...')

      // 检查字段是否已存在
      const [existingColumns] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_draws'
         AND COLUMN_NAME = 'reward_tier'`,
        { transaction }
      )

      if (existingColumns.length === 0) {
        await queryInterface.addColumn(
          'lottery_draws',
          'reward_tier',
          {
            type: Sequelize.STRING(32),
            allowNull: false,
            defaultValue: 'mid', // 默认中档，后续回填
            comment: '奖励档位code（配置驱动，如 low/mid/high 或 tier_1..tier_n）',
            after: 'prize_value'
          },
          { transaction }
        )
        console.log('✅ reward_tier 字段添加成功')
      } else {
        console.log('⏭️ reward_tier 字段已存在，跳过添加')
      }

      // ========== 步骤2：基于 prize_value_points 回填 reward_tier ==========
      console.log('\n📌 步骤2：回填现有记录的 reward_tier 值...')
      console.log('   规则：low(0-299) / mid(300-699) / high(700+)')

      // 使用 prize_value_points 进行档位判断
      await queryInterface.sequelize.query(
        `UPDATE lottery_draws SET reward_tier = CASE
          WHEN prize_value_points IS NULL OR prize_value_points < 300 THEN 'low'
          WHEN prize_value_points >= 300 AND prize_value_points < 700 THEN 'mid'
          ELSE 'high'
        END`,
        { transaction }
      )

      // 统计回填结果
      const [[tierStats]] = await queryInterface.sequelize.query(
        `SELECT
          SUM(CASE WHEN reward_tier = 'low' THEN 1 ELSE 0 END) as low_count,
          SUM(CASE WHEN reward_tier = 'mid' THEN 1 ELSE 0 END) as mid_count,
          SUM(CASE WHEN reward_tier = 'high' THEN 1 ELSE 0 END) as high_count,
          COUNT(*) as total
        FROM lottery_draws`,
        { transaction }
      )
      console.log(`✅ reward_tier 回填完成：`)
      console.log(`   - low档位: ${tierStats.low_count} 条`)
      console.log(`   - mid档位: ${tierStats.mid_count} 条`)
      console.log(`   - high档位: ${tierStats.high_count} 条`)
      console.log(`   - 总计: ${tierStats.total} 条`)

      // ========== 步骤3：添加 reward_tier 索引 ==========
      console.log('\n📌 步骤3：添加 reward_tier 索引...')

      // 检查并添加索引
      const indexesToAdd = [
        { name: 'idx_reward_tier', fields: ['reward_tier'] },
        { name: 'idx_user_reward_tier', fields: ['user_id', 'reward_tier'] },
        { name: 'idx_created_reward_tier', fields: ['created_at', 'reward_tier'] }
      ]

      for (const idx of indexesToAdd) {
        const [existing] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM lottery_draws WHERE Key_name = '${idx.name}'`,
          { transaction }
        )
        if (existing.length === 0) {
          await queryInterface.addIndex('lottery_draws', idx.fields, {
            name: idx.name,
            transaction
          })
          console.log(`✅ 索引 ${idx.name} 添加成功`)
        } else {
          console.log(`⏭️ 索引 ${idx.name} 已存在，跳过`)
        }
      }

      // ========== 步骤4：删除 is_winner 相关索引 ==========
      console.log('\n📌 步骤4：删除 is_winner 相关索引...')

      const isWinnerIndexes = [
        'idx_records_is_winner',
        'idx_lottery_records_lottery_winner',
        'idx_lottery_records_time_winner',
        'idx_campaign_result', // campaign_id, is_winner 复合索引
        'idx_result_time' // is_winner, created_at 复合索引
      ]

      for (const idxName of isWinnerIndexes) {
        const [existing] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM lottery_draws WHERE Key_name = '${idxName}'`,
          { transaction }
        )
        if (existing.length > 0) {
          await queryInterface.removeIndex('lottery_draws', idxName, { transaction })
          console.log(`✅ 索引 ${idxName} 删除成功`)
        } else {
          console.log(`⏭️ 索引 ${idxName} 不存在，跳过`)
        }
      }

      // ========== 步骤5：删除 is_winner 字段 ==========
      console.log('\n📌 步骤5：删除 is_winner 字段...')

      const [isWinnerColumn] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_draws'
         AND COLUMN_NAME = 'is_winner'`,
        { transaction }
      )

      if (isWinnerColumn.length > 0) {
        await queryInterface.removeColumn('lottery_draws', 'is_winner', { transaction })
        console.log('✅ is_winner 字段删除成功')
      } else {
        console.log('⏭️ is_winner 字段已不存在，跳过')
      }

      // ========== 步骤6：修改 prize_type 枚举（移除 empty） ==========
      console.log('\n📌 步骤6：修改 prize_type 枚举（移除 empty）...')

      // 检查当前枚举值
      const [[currentEnum]] = await queryInterface.sequelize.query(
        `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_draws'
         AND COLUMN_NAME = 'prize_type'`,
        { transaction }
      )

      if (currentEnum && currentEnum.COLUMN_TYPE.includes('empty')) {
        // 先将 empty 类型更新为 null 或其他有效类型
        await queryInterface.sequelize.query(
          `UPDATE lottery_draws SET prize_type = NULL WHERE prize_type = 'empty'`,
          { transaction }
        )
        console.log('✅ 已将 prize_type=empty 的记录置为 NULL')

        // 修改枚举定义（移除 empty）
        await queryInterface.changeColumn(
          'lottery_draws',
          'prize_type',
          {
            type: Sequelize.ENUM(
              'points',
              'coupon',
              'physical',
              'virtual',
              'service',
              'product',
              'special'
            ),
            allowNull: true,
            comment: '奖品类型（已移除empty）'
          },
          { transaction }
        )
        console.log('✅ prize_type 枚举已更新（移除 empty）')
      } else {
        console.log('⏭️ prize_type 枚举已是正确状态，跳过')
      }

      // ========== 步骤7：验证迁移结果 ==========
      console.log('\n📌 步骤7：验证迁移结果...')

      // 验证 is_winner 字段已删除
      const [isWinnerCheck] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_draws'
         AND COLUMN_NAME = 'is_winner'`,
        { transaction }
      )

      if (isWinnerCheck.length === 0) {
        console.log('✅ 验证通过：is_winner 字段已删除')
      } else {
        throw new Error('验证失败：is_winner 字段仍存在')
      }

      // 验证 reward_tier 字段存在
      const [rewardTierCheck] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_draws'
         AND COLUMN_NAME = 'reward_tier'`,
        { transaction }
      )

      if (rewardTierCheck.length === 1) {
        console.log('✅ 验证通过：reward_tier 字段存在')
      } else {
        throw new Error('验证失败：reward_tier 字段不存在')
      }

      await transaction.commit()
      console.log('\n🎉 抽奖业务语义清理迁移执行成功！')
      console.log('📝 已完成：')
      console.log('   - 删除 is_winner 字段及相关索引')
      console.log('   - 新增 reward_tier 字段及索引')
      console.log('   - 修改 prize_type 枚举（移除 empty）')
      console.log('   - 回填所有记录的 reward_tier 值')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 迁移执行失败:', error.message)
      throw error
    }
  },

  /**
   * 回滚迁移（注意：此迁移为破坏性变更，回滚会丢失数据）
   */
  down: async (queryInterface, Sequelize) => {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      console.log('🔄 开始回滚抽奖业务语义清理迁移...')
      console.log('⚠️ 警告：此为破坏性回滚，is_winner 数据无法恢复')

      // 1. 恢复 is_winner 字段
      const [isWinnerColumn] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_draws'
         AND COLUMN_NAME = 'is_winner'`,
        { transaction }
      )

      if (isWinnerColumn.length === 0) {
        await queryInterface.addColumn(
          'lottery_draws',
          'is_winner',
          {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true, // 默认中奖（新语义下所有抽奖都是"中奖"）
            comment: '是否中奖（已恢复，仅作兼容用途）',
            after: 'remaining_guarantee'
          },
          { transaction }
        )
        console.log('✅ is_winner 字段已恢复')

        // 基于 reward_tier 回填 is_winner（所有档位都算中奖）
        await queryInterface.sequelize.query(`UPDATE lottery_draws SET is_winner = 1`, {
          transaction
        })
        console.log('✅ is_winner 已回填为 1（新语义：每次必得奖励）')
      }

      // 2. 恢复 is_winner 相关索引
      const isWinnerIndexes = [
        { name: 'idx_records_is_winner', fields: ['is_winner'] },
        { name: 'idx_campaign_result', fields: ['campaign_id', 'is_winner'] },
        { name: 'idx_result_time', fields: ['is_winner', 'created_at'] }
      ]

      for (const idx of isWinnerIndexes) {
        const [existing] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM lottery_draws WHERE Key_name = '${idx.name}'`,
          { transaction }
        )
        if (existing.length === 0) {
          await queryInterface.addIndex('lottery_draws', idx.fields, {
            name: idx.name,
            transaction
          })
          console.log(`✅ 索引 ${idx.name} 已恢复`)
        }
      }

      // 3. 删除 reward_tier 索引
      const rewardTierIndexes = [
        'idx_reward_tier',
        'idx_user_reward_tier',
        'idx_created_reward_tier'
      ]
      for (const idxName of rewardTierIndexes) {
        const [existing] = await queryInterface.sequelize.query(
          `SHOW INDEX FROM lottery_draws WHERE Key_name = '${idxName}'`,
          { transaction }
        )
        if (existing.length > 0) {
          await queryInterface.removeIndex('lottery_draws', idxName, { transaction })
          console.log(`✅ 索引 ${idxName} 已删除`)
        }
      }

      // 4. 删除 reward_tier 字段
      const [rewardTierColumn] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'lottery_draws'
         AND COLUMN_NAME = 'reward_tier'`,
        { transaction }
      )

      if (rewardTierColumn.length > 0) {
        await queryInterface.removeColumn('lottery_draws', 'reward_tier', { transaction })
        console.log('✅ reward_tier 字段已删除')
      }

      // 5. 恢复 prize_type 枚举（添加 empty）
      await queryInterface.changeColumn(
        'lottery_draws',
        'prize_type',
        {
          type: Sequelize.ENUM(
            'points',
            'coupon',
            'physical',
            'virtual',
            'service',
            'product',
            'special',
            'empty'
          ),
          allowNull: true,
          comment: '奖品类型（已恢复 empty）'
        },
        { transaction }
      )
      console.log('✅ prize_type 枚举已恢复（添加 empty）')

      await transaction.commit()
      console.log('\n🎉 回滚执行成功！')
    } catch (error) {
      await transaction.rollback()
      console.error('\n❌ 回滚执行失败:', error.message)
      throw error
    }
  }
}
