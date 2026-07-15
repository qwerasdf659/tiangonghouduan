'use strict'

/**
 * 迁移：创建统一资产转换规则表 asset_conversion_rules
 *
 * 背景：
 *   合并 exchange_rates（7条汇率兑换规则）和 material_conversion_rules（2条材料转换规则）
 *   为统一的 asset_conversion_rules 表，消除两套规则体系的技术债务。
 *
 * 操作步骤：
 *   1. 创建 asset_conversion_rules 新表
 *   2. 从 exchange_rates 迁移 7 条规则数据
 *   3. 从 material_conversion_rules 迁移启用的规则数据
 *   4. 迁移 asset_transactions 中的 business_type 前缀
 *   5. 更新 counterpart_account_id（SYSTEM_EXCHANGE → SYSTEM_BURN/SYSTEM_MINT）
 *   6. 重命名旧表为 _bak_* 备份
 *
 * 关联文档：docs/资产转换规则统一方案.md
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('🚀 开始执行资产转换规则统一迁移...')
    console.log('='.repeat(60))

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========================================
      // 第1步：创建 asset_conversion_rules 新表
      // ========================================
      console.log('\n📦 第1步：创建 asset_conversion_rules 表...')

      await queryInterface.createTable('asset_conversion_rules', {
        conversion_rule_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '转换规则ID（主键）'
        },
        from_asset_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '源资产代码（转换输入）：如 red_core_shard'
        },
        to_asset_code: {
          type: Sequelize.STRING(50),
          allowNull: false,
          comment: '目标资产代码（转换输出）：如 star_stone'
        },
        rate_numerator: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '转换比率分子：to_amount = FLOOR(from_amount × rate_numerator ÷ rate_denominator)'
        },
        rate_denominator: {
          type: Sequelize.BIGINT,
          allowNull: false,
          comment: '转换比率分母：使用整数分子/分母避免浮点精度问题'
        },
        rounding_mode: {
          type: Sequelize.ENUM('floor', 'ceil', 'round'),
          allowNull: false,
          defaultValue: 'floor',
          comment: '舍入模式：floor-向下取整（默认） / ceil-向上取整 / round-四舍五入'
        },
        fee_rate: {
          type: Sequelize.DECIMAL(5, 4),
          allowNull: false,
          defaultValue: '0.0000',
          comment: '手续费费率：如 0.0500 = 5%，基于产出计算'
        },
        fee_min_amount: {
          type: Sequelize.BIGINT,
          allowNull: false,
          defaultValue: 0,
          comment: '最低手续费（保底值）'
        },
        fee_asset_code: {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: '手续费资产代码（NULL 表示从产出资产扣除）'
        },
        min_from_amount: {
          type: Sequelize.BIGINT,
          allowNull: false,
          defaultValue: 1,
          comment: '最小转换数量（保护性下限）'
        },
        max_from_amount: {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '最大转换数量（NULL表示无上限）'
        },
        daily_user_limit: {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '每用户每日转换限额（源资产数量，NULL表示无限制）'
        },
        daily_global_limit: {
          type: Sequelize.BIGINT,
          allowNull: true,
          comment: '全局每日转换限额（源资产数量，NULL表示无限制）'
        },
        status: {
          type: Sequelize.ENUM('active', 'paused', 'disabled'),
          allowNull: false,
          defaultValue: 'active',
          comment: '状态：active-生效中 / paused-暂停 / disabled-已禁用'
        },
        priority: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '优先级：同一币对多条规则时，取 priority 最高且生效的规则'
        },
        effective_from: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '生效开始时间（NULL表示立即生效）'
        },
        effective_until: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '生效结束时间（NULL表示永不过期）'
        },
        title: {
          type: Sequelize.STRING(100),
          allowNull: true,
          comment: '规则标题（管理后台展示用）'
        },
        description: {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment: '规则描述'
        },
        display_icon: {
          type: Sequelize.STRING(200),
          allowNull: true,
          comment: '展示图标URL'
        },
        risk_level: {
          type: Sequelize.ENUM('low', 'medium', 'high'),
          allowNull: false,
          defaultValue: 'low',
          comment: '风控等级：low-低风险 / medium-中风险 / high-高风险'
        },
        is_visible: {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: '是否对用户可见（false=仅管理后台可见）'
        },
        created_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '创建人用户ID'
        },
        updated_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          comment: '最后修改人用户ID'
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
      }, {
        charset: 'utf8mb4',
        collate: 'utf8mb4_unicode_ci',
        comment: '统一资产转换规则表 — 合并汇率兑换与材料转换',
        transaction
      })

      // 创建索引（先检查避免重复）
      console.log('  📋 创建索引...')

      await queryInterface.addIndex('asset_conversion_rules',
        ['from_asset_code', 'to_asset_code', 'status'],
        { name: 'idx_acr_pair_status', transaction }
      )

      await queryInterface.addIndex('asset_conversion_rules',
        ['status', 'effective_from', 'effective_until'],
        { name: 'idx_acr_status_effective', transaction }
      )

      await queryInterface.addIndex('asset_conversion_rules',
        ['from_asset_code', 'to_asset_code', 'status', 'priority'],
        { name: 'idx_acr_pair_status_priority', transaction }
      )

      // ========================================
      // 第2步：从 exchange_rates 迁移数据（7条）
      // ========================================
      console.log('\n📦 第2步：从 exchange_rates 迁移 7 条规则...')

      // exchange_rates 表字段：exchange_rate_id, from_asset_code, to_asset_code,
      // rate_numerator, rate_denominator, min_from_amount, max_from_amount,
      // daily_user_limit, daily_global_limit, fee_rate, status, priority,
      // effective_from, effective_until, description, created_by, created_at, updated_at
      // 注意：exchange_rates 没有 title, display_icon, risk_level, is_visible, updated_by, fee_min_amount, fee_asset_code, rounding_mode
      await queryInterface.sequelize.query(`
        INSERT INTO asset_conversion_rules (
          from_asset_code, to_asset_code,
          rate_numerator, rate_denominator,
          rounding_mode, fee_rate, fee_min_amount, fee_asset_code,
          min_from_amount, max_from_amount,
          daily_user_limit, daily_global_limit,
          status, priority,
          effective_from, effective_until,
          title, description, display_icon,
          risk_level, is_visible,
          created_by, updated_by,
          created_at, updated_at
        )
        SELECT
          from_asset_code, to_asset_code,
          rate_numerator, rate_denominator,
          'floor' AS rounding_mode,
          fee_rate,
          0 AS fee_min_amount,
          NULL AS fee_asset_code,
          min_from_amount, max_from_amount,
          daily_user_limit, daily_global_limit,
          status, priority,
          effective_from, effective_until,
          NULL AS title,
          description,
          NULL AS display_icon,
          'low' AS risk_level,
          1 AS is_visible,
          created_by,
          NULL AS updated_by,
          created_at, updated_at
        FROM exchange_rates
        ORDER BY exchange_rate_id
      `, { transaction })

      const [erCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS cnt FROM asset_conversion_rules',
        { transaction }
      )
      console.log(`  ✅ 迁移 exchange_rates 完成，当前 ${erCount[0].cnt} 条规则`)

      // ========================================
      // 第3步：从 material_conversion_rules 迁移启用的规则
      // ========================================
      console.log('\n📦 第3步：从 material_conversion_rules 迁移规则...')

      // material_conversion_rules 表字段：material_conversion_rule_id, from_asset_code, to_asset_code,
      // from_amount, to_amount, effective_at, is_enabled, created_by, created_at, updated_at,
      // min_from_amount, max_from_amount, fee_rate, fee_min_amount, fee_asset_code,
      // title, description, display_icon, risk_level, is_visible, rounding_mode, updated_by
      // 注意：from_amount/to_amount 是整数比，需要转换为 rate_numerator/rate_denominator
      await queryInterface.sequelize.query(`
        INSERT INTO asset_conversion_rules (
          from_asset_code, to_asset_code,
          rate_numerator, rate_denominator,
          rounding_mode, fee_rate, fee_min_amount, fee_asset_code,
          min_from_amount, max_from_amount,
          daily_user_limit, daily_global_limit,
          status, priority,
          effective_from, effective_until,
          title, description, display_icon,
          risk_level, is_visible,
          created_by, updated_by,
          created_at, updated_at
        )
        SELECT
          from_asset_code, to_asset_code,
          to_amount AS rate_numerator,
          from_amount AS rate_denominator,
          COALESCE(rounding_mode, 'floor') AS rounding_mode,
          COALESCE(fee_rate, 0) AS fee_rate,
          COALESCE(fee_min_amount, 0) AS fee_min_amount,
          fee_asset_code,
          COALESCE(min_from_amount, 1) AS min_from_amount,
          max_from_amount,
          NULL AS daily_user_limit,
          NULL AS daily_global_limit,
          CASE WHEN is_enabled = 1 THEN 'active' ELSE 'disabled' END AS status,
          0 AS priority,
          effective_at AS effective_from,
          NULL AS effective_until,
          title, description, display_icon,
          COALESCE(risk_level, 'low') AS risk_level,
          COALESCE(is_visible, 1) AS is_visible,
          created_by, updated_by,
          created_at, updated_at
        FROM material_conversion_rules
        ORDER BY material_conversion_rule_id
      `, { transaction })

      const [totalCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS cnt FROM asset_conversion_rules',
        { transaction }
      )
      console.log(`  ✅ 迁移 material_conversion_rules 完成，当前共 ${totalCount[0].cnt} 条规则`)

      // ========================================
      // 第4步：迁移 asset_transactions 中的 business_type
      // ========================================
      console.log('\n📦 第4步：迁移 business_type 前缀...')

      // 4a. exchange_rate_* → asset_convert_*
      const [erTxResult] = await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET business_type = REPLACE(business_type, 'exchange_rate_', 'asset_convert_')
        WHERE business_type LIKE 'exchange_rate_%'
      `, { transaction })
      console.log(`  ✅ exchange_rate_* → asset_convert_*: ${erTxResult.affectedRows || 0} 笔`)

      // 4b. material_convert_* → asset_convert_*
      const [mcTxResult] = await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET business_type = REPLACE(business_type, 'material_convert_', 'asset_convert_')
        WHERE business_type LIKE 'material_convert_%'
      `, { transaction })
      console.log(`  ✅ material_convert_* → asset_convert_*: ${mcTxResult.affectedRows || 0} 笔`)

      // ========================================
      // 第5步：更新 counterpart_account_id
      // ========================================
      console.log('\n📦 第5步：更新 counterpart_account_id（SYSTEM_EXCHANGE → SYSTEM_BURN/SYSTEM_MINT）...')

      // SYSTEM_EXCHANGE(239) 的 debit 对手方 → SYSTEM_BURN(3)
      const [burnResult] = await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET counterpart_account_id = 3
        WHERE business_type LIKE 'asset_convert_debit%'
          AND counterpart_account_id = 239
      `, { transaction })
      console.log(`  ✅ debit counterpart → SYSTEM_BURN(3): ${burnResult.affectedRows || 0} 笔`)

      // SYSTEM_EXCHANGE(239) 的 credit 对手方 → SYSTEM_MINT(2)
      const [mintResult] = await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET counterpart_account_id = 2
        WHERE business_type LIKE 'asset_convert_credit%'
          AND counterpart_account_id = 239
      `, { transaction })
      console.log(`  ✅ credit counterpart → SYSTEM_MINT(2): ${mintResult.affectedRows || 0} 笔`)

      // ========================================
      // 第6步：重命名旧表为备份
      // ========================================
      console.log('\n📦 第6步：重命名旧表为备份...')

      await queryInterface.renameTable('exchange_rates', '_bak_exchange_rates', { transaction })
      console.log('  ✅ exchange_rates → _bak_exchange_rates')

      await queryInterface.renameTable('material_conversion_rules', '_bak_material_conversion_rules', { transaction })
      console.log('  ✅ material_conversion_rules → _bak_material_conversion_rules')

      // ========================================
      // 第7步：验证数据完整性
      // ========================================
      console.log('\n📦 第7步：验证数据完整性...')

      // 验证1：新表数据条数
      const [finalCount] = await queryInterface.sequelize.query(
        'SELECT COUNT(*) AS cnt FROM asset_conversion_rules',
        { transaction }
      )
      console.log(`  ✅ asset_conversion_rules 总条数: ${finalCount[0].cnt}`)

      // 验证2：不再有旧前缀的 business_type
      const [oldTypes] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS cnt FROM asset_transactions
        WHERE business_type LIKE 'exchange_rate_%' OR business_type LIKE 'material_convert_%'
      `, { transaction })
      if (parseInt(oldTypes[0].cnt) > 0) {
        throw new Error(`❌ 仍有 ${oldTypes[0].cnt} 笔旧前缀流水未迁移`)
      }
      console.log('  ✅ 旧前缀流水已全部迁移')

      // 验证3：SYSTEM_EXCHANGE 不再作为转换对手方
      const [sysExchange] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS cnt FROM asset_transactions
        WHERE business_type LIKE 'asset_convert_%' AND counterpart_account_id = 239
      `, { transaction })
      if (parseInt(sysExchange[0].cnt) > 0) {
        throw new Error(`❌ 仍有 ${sysExchange[0].cnt} 笔流水使用 SYSTEM_EXCHANGE(239) 作为对手方`)
      }
      console.log('  ✅ SYSTEM_EXCHANGE(239) 已不再作为转换对手方')

      await transaction.commit()
      console.log('\n' + '='.repeat(60))
      console.log('✅ 资产转换规则统一迁移完成！')
      console.log('='.repeat(60))

    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  down: async (queryInterface, Sequelize) => {
    console.log('🔄 开始回滚资产转换规则统一迁移...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 恢复旧表名
      await queryInterface.renameTable('_bak_exchange_rates', 'exchange_rates', { transaction })
      await queryInterface.renameTable('_bak_material_conversion_rules', 'material_conversion_rules', { transaction })

      // 恢复 business_type
      await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET business_type = REPLACE(business_type, 'asset_convert_', 'exchange_rate_')
        WHERE business_type LIKE 'asset_convert_%'
          AND idempotency_key LIKE '%exchange%'
      `, { transaction })

      await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET business_type = REPLACE(business_type, 'asset_convert_', 'material_convert_')
        WHERE business_type LIKE 'asset_convert_%'
          AND idempotency_key LIKE '%material%'
      `, { transaction })

      // 恢复 counterpart_account_id
      await queryInterface.sequelize.query(`
        UPDATE asset_transactions
        SET counterpart_account_id = 239
        WHERE business_type LIKE 'exchange_rate_%'
          AND counterpart_account_id IN (2, 3)
      `, { transaction })

      // 删除新表
      await queryInterface.dropTable('asset_conversion_rules', { transaction })

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
