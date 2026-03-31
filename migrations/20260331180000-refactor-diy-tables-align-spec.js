'use strict'

/**
 * DIY 饰品设计引擎 — 表结构重构迁移
 *
 * 将 diy_templates / diy_works 从早期骨架版升级为文档 8.3 节定义的完整结构：
 *
 * diy_templates 变更：
 *   - name → display_name
 *   - 新增 template_code (UNIQUE)
 *   - 新增 status (draft/published/archived)
 *   - is_active → is_enabled
 *   - bead_size_constraints → bead_rules
 *   - 新增 sizing_rules / capacity_rules
 *   - allowed_materials → material_group_codes
 *   - 新增 preview_media_id / base_image_media_id (FK → media_files)
 *   - 新增 meta (JSON)
 *   - 删除 type / description / pricing_rule
 *
 * diy_works 变更：
 *   - user_id → account_id (FK → accounts)
 *   - name → work_name
 *   - 新增 work_code (UNIQUE)
 *   - beads → design_data
 *   - total_price → total_cost (JSON)
 *   - preview_image_url → preview_media_id (FK → media_files)
 *   - status 枚举改为 draft/frozen/completed/cancelled
 *   - 新增 item_id / idempotency_key / frozen_at / completed_at
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========================================
      // 第 1 部分：重构 diy_templates
      // ========================================

      // 1a. 新增字段
      await queryInterface.addColumn('diy_templates', 'template_code', {
        type: Sequelize.STRING(32),
        allowNull: true, // 先允许 null，回填后改 NOT NULL
        comment: '模板业务编号（OrderNoGenerator 生成，bizCode=DT）'
      }, { transaction })

      await queryInterface.addColumn('diy_templates', 'display_name', {
        type: Sequelize.STRING(200),
        allowNull: true, // 先允许 null，从 name 回填后改 NOT NULL
        comment: '模板展示名称'
      }, { transaction })

      await queryInterface.addColumn('diy_templates', 'status', {
        type: Sequelize.ENUM('draft', 'published', 'archived'),
        allowNull: false,
        defaultValue: 'published',
        comment: '模板生命周期状态'
      }, { transaction })

      await queryInterface.addColumn('diy_templates', 'is_enabled', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: '是否启用（上下架开关）'
      }, { transaction })

      await queryInterface.addColumn('diy_templates', 'bead_rules', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '珠子规则（串珠模式）：{ margin, default_diameter, allowed_diameters[] }'
      }, { transaction })

      await queryInterface.addColumn('diy_templates', 'sizing_rules', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '尺寸规则（串珠模式）：{ default_size, size_options[{ label, bead_count }] }'
      }, { transaction })

      await queryInterface.addColumn('diy_templates', 'capacity_rules', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '容量规则：{ min_beads, max_beads }'
      }, { transaction })

      await queryInterface.addColumn('diy_templates', 'material_group_codes', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '允许的材料分组码数组（关联 asset_group_defs.group_code），空=全部允许'
      }, { transaction })

      await queryInterface.addColumn('diy_templates', 'preview_media_id', {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        comment: '预览图媒体文件ID',
        references: { model: 'media_files', key: 'media_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }, { transaction })

      await queryInterface.addColumn('diy_templates', 'base_image_media_id', {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        comment: '底图媒体文件ID（镶嵌模式必需）',
        references: { model: 'media_files', key: 'media_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }, { transaction })

      await queryInterface.addColumn('diy_templates', 'meta', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '扩展元数据（预留字段）'
      }, { transaction })

      // 1b. 数据回填
      await queryInterface.sequelize.query(
        'UPDATE diy_templates SET display_name = name, is_enabled = is_active',
        { transaction }
      )

      // 回填 bead_rules（从 bead_size_constraints 转换）
      await queryInterface.sequelize.query(`
        UPDATE diy_templates SET bead_rules = JSON_OBJECT(
          'margin', 10,
          'default_diameter', JSON_EXTRACT(bead_size_constraints, '$.default_size'),
          'allowed_diameters', JSON_EXTRACT(bead_size_constraints, '$.allowed_sizes')
        ) WHERE bead_size_constraints IS NOT NULL
      `, { transaction })

      // 回填 material_group_codes（从 allowed_materials 转换）
      // allowed_materials.mode = 'all' → material_group_codes = []（空数组=全部允许）
      await queryInterface.sequelize.query(`
        UPDATE diy_templates SET material_group_codes = JSON_ARRAY()
        WHERE JSON_EXTRACT(allowed_materials, '$.mode') = 'all'
      `, { transaction })

      // 回填 template_code（使用 OrderNoGenerator 格式：DT + YYMMDD + 序列）
      const [templates] = await queryInterface.sequelize.query(
        'SELECT diy_template_id, created_at FROM diy_templates ORDER BY diy_template_id',
        { transaction }
      )
      for (const tpl of templates) {
        const code = `DT260331${String(tpl.diy_template_id % 1000000).padStart(6, '0')}${Math.random().toString(16).slice(2, 4).toUpperCase()}`
        await queryInterface.sequelize.query(
          `UPDATE diy_templates SET template_code = '${code}' WHERE diy_template_id = ${tpl.diy_template_id}`,
          { transaction }
        )
      }

      // 1c. 设置 NOT NULL 约束
      await queryInterface.changeColumn('diy_templates', 'template_code', {
        type: Sequelize.STRING(32),
        allowNull: false,
        comment: '模板业务编号（OrderNoGenerator 生成，bizCode=DT）'
      }, { transaction })

      await queryInterface.changeColumn('diy_templates', 'display_name', {
        type: Sequelize.STRING(200),
        allowNull: false,
        comment: '模板展示名称'
      }, { transaction })

      // 1d. 添加唯一索引
      await queryInterface.addIndex('diy_templates', ['template_code'], {
        unique: true,
        name: 'uk_diy_templates_template_code',
        transaction
      })

      await queryInterface.addIndex('diy_templates', ['status'], {
        name: 'idx_diy_templates_status',
        transaction
      })

      await queryInterface.addIndex('diy_templates', ['is_enabled'], {
        name: 'idx_diy_templates_is_enabled',
        transaction
      })

      // 1e. 删除旧字段
      await queryInterface.removeColumn('diy_templates', 'name', { transaction })
      await queryInterface.removeColumn('diy_templates', 'type', { transaction })
      await queryInterface.removeColumn('diy_templates', 'description', { transaction })
      await queryInterface.removeColumn('diy_templates', 'bead_size_constraints', { transaction })
      await queryInterface.removeColumn('diy_templates', 'allowed_materials', { transaction })
      await queryInterface.removeColumn('diy_templates', 'pricing_rule', { transaction })
      await queryInterface.removeColumn('diy_templates', 'is_active', { transaction })

      // ========================================
      // 第 2 部分：重构 diy_works
      // ========================================

      // 2a. 新增字段
      await queryInterface.addColumn('diy_works', 'work_code', {
        type: Sequelize.STRING(32),
        allowNull: true,
        comment: '作品业务编号（OrderNoGenerator 生成，bizCode=DW）'
      }, { transaction })

      await queryInterface.addColumn('diy_works', 'account_id', {
        type: Sequelize.BIGINT,
        allowNull: true, // 先允许 null，回填后改 NOT NULL
        comment: '所属账户ID',
        references: { model: 'accounts', key: 'account_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      }, { transaction })

      await queryInterface.addColumn('diy_works', 'work_name', {
        type: Sequelize.STRING(200),
        allowNull: true,
        comment: '用户自定义作品名称'
      }, { transaction })

      await queryInterface.addColumn('diy_works', 'design_data', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '核心设计数据（珠子排列/槽位填充方案）'
      }, { transaction })

      await queryInterface.addColumn('diy_works', 'total_cost', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: '总消耗明细 [{ asset_code, amount }]'
      }, { transaction })

      await queryInterface.addColumn('diy_works', 'preview_media_id', {
        type: Sequelize.BIGINT.UNSIGNED,
        allowNull: true,
        comment: '预览图媒体文件ID',
        references: { model: 'media_files', key: 'media_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }, { transaction })

      await queryInterface.addColumn('diy_works', 'item_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        comment: '确认后铸造的物品实例ID',
        references: { model: 'items', key: 'item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }, { transaction })

      await queryInterface.addColumn('diy_works', 'idempotency_key', {
        type: Sequelize.STRING(64),
        allowNull: true,
        comment: '幂等键（防重复提交）'
      }, { transaction })

      await queryInterface.addColumn('diy_works', 'frozen_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '材料冻结时间'
      }, { transaction })

      await queryInterface.addColumn('diy_works', 'completed_at', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: '完成时间（铸造成功）'
      }, { transaction })

      // 2b. 数据回填
      // work_name ← name
      await queryInterface.sequelize.query(
        'UPDATE diy_works SET work_name = name',
        { transaction }
      )

      // design_data ← beads
      await queryInterface.sequelize.query(
        'UPDATE diy_works SET design_data = beads',
        { transaction }
      )

      // total_cost ← total_price（转为 JSON 数组格式）
      await queryInterface.sequelize.query(`
        UPDATE diy_works SET total_cost = CASE
          WHEN total_price IS NOT NULL AND total_price > 0
          THEN JSON_ARRAY(JSON_OBJECT('asset_code', 'DIAMOND', 'amount', total_price))
          ELSE JSON_ARRAY()
        END
      `, { transaction })

      // account_id ← 通过 user_id 查 accounts 表
      await queryInterface.sequelize.query(`
        UPDATE diy_works dw
        JOIN accounts a ON a.user_id = dw.user_id
        SET dw.account_id = a.account_id
      `, { transaction })

      // work_code 回填
      const [works] = await queryInterface.sequelize.query(
        'SELECT diy_work_id, created_at FROM diy_works ORDER BY diy_work_id',
        { transaction }
      )
      for (const w of works) {
        const code = `DW260331${String(w.diy_work_id % 1000000).padStart(6, '0')}${Math.random().toString(16).slice(2, 4).toUpperCase()}`
        await queryInterface.sequelize.query(
          `UPDATE diy_works SET work_code = '${code}' WHERE diy_work_id = ${w.diy_work_id}`,
          { transaction }
        )
      }

      // 2c. 修改 status 枚举（draft/saved/ordered → draft/frozen/completed/cancelled）
      // MySQL 不能直接 ALTER ENUM，需要 MODIFY COLUMN
      // 先把 saved → draft, ordered → completed
      await queryInterface.sequelize.query(
        "UPDATE diy_works SET status = 'draft' WHERE status = 'saved'",
        { transaction }
      )
      await queryInterface.sequelize.query(
        "UPDATE diy_works SET status = 'completed' WHERE status = 'ordered'",
        { transaction }
      )
      await queryInterface.sequelize.query(
        "ALTER TABLE diy_works MODIFY COLUMN status ENUM('draft','frozen','completed','cancelled') NOT NULL DEFAULT 'draft' COMMENT '作品状态：draft草稿/frozen已冻结材料/completed已完成/cancelled已取消'",
        { transaction }
      )

      // 2d. 设置 NOT NULL 约束
      await queryInterface.changeColumn('diy_works', 'account_id', {
        type: Sequelize.BIGINT,
        allowNull: false,
        comment: '所属账户ID',
        references: { model: 'accounts', key: 'account_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      }, { transaction })

      await queryInterface.changeColumn('diy_works', 'work_code', {
        type: Sequelize.STRING(32),
        allowNull: false,
        comment: '作品业务编号（OrderNoGenerator 生成，bizCode=DW）'
      }, { transaction })

      await queryInterface.changeColumn('diy_works', 'work_name', {
        type: Sequelize.STRING(200),
        allowNull: false,
        defaultValue: '我的设计',
        comment: '用户自定义作品名称'
      }, { transaction })

      await queryInterface.changeColumn('diy_works', 'design_data', {
        type: Sequelize.JSON,
        allowNull: false,
        comment: '核心设计数据（珠子排列/槽位填充方案）'
      }, { transaction })

      // 2e. 添加索引
      await queryInterface.addIndex('diy_works', ['work_code'], {
        unique: true,
        name: 'uk_diy_works_work_code',
        transaction
      })

      await queryInterface.addIndex('diy_works', ['account_id', 'status'], {
        name: 'idx_diy_works_account_status',
        transaction
      })

      await queryInterface.addIndex('diy_works', ['idempotency_key'], {
        unique: true,
        name: 'uk_diy_works_idempotency_key',
        where: { idempotency_key: { [Sequelize.Op.ne]: null } },
        transaction
      })

      // 2f. 删除旧字段
      // 先删除旧的 user_id 外键约束
      const [fks] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_NAME = 'diy_works' AND COLUMN_NAME = 'user_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL AND TABLE_SCHEMA = DATABASE()
      `, { transaction })
      for (const fk of fks) {
        await queryInterface.removeConstraint('diy_works', fk.CONSTRAINT_NAME, { transaction })
      }

      // 删除旧的 user_id 索引
      const [idxs] = await queryInterface.sequelize.query(`
        SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
        WHERE TABLE_NAME = 'diy_works' AND COLUMN_NAME = 'user_id'
        AND TABLE_SCHEMA = DATABASE() AND INDEX_NAME != 'PRIMARY'
      `, { transaction })
      for (const idx of idxs) {
        await queryInterface.removeIndex('diy_works', idx.INDEX_NAME, { transaction })
      }

      await queryInterface.removeColumn('diy_works', 'user_id', { transaction })
      await queryInterface.removeColumn('diy_works', 'name', { transaction })
      await queryInterface.removeColumn('diy_works', 'beads', { transaction })
      await queryInterface.removeColumn('diy_works', 'total_price', { transaction })
      await queryInterface.removeColumn('diy_works', 'preview_image_url', { transaction })

      await transaction.commit()
      console.log('✅ DIY 表结构重构迁移完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 迁移失败，已回滚:', error.message)
      throw error
    }
  },

  async down(queryInterface, Sequelize) {
    // 回滚：这是破坏性重构，回滚需要重建旧结构
    // 实际操作中建议从备份恢复
    const transaction = await queryInterface.sequelize.transaction()
    try {
      // 恢复 diy_works 旧字段
      await queryInterface.addColumn('diy_works', 'user_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'user_id' }
      }, { transaction })
      await queryInterface.addColumn('diy_works', 'name', {
        type: Sequelize.STRING(100), allowNull: false, defaultValue: '我的设计'
      }, { transaction })
      await queryInterface.addColumn('diy_works', 'beads', {
        type: Sequelize.JSON, allowNull: false
      }, { transaction })
      await queryInterface.addColumn('diy_works', 'total_price', {
        type: Sequelize.DECIMAL(10, 2), allowNull: true
      }, { transaction })
      await queryInterface.addColumn('diy_works', 'preview_image_url', {
        type: Sequelize.STRING(500), allowNull: true
      }, { transaction })

      // 回填旧字段
      await queryInterface.sequelize.query(
        'UPDATE diy_works dw JOIN accounts a ON a.account_id = dw.account_id SET dw.user_id = a.user_id',
        { transaction }
      )
      await queryInterface.sequelize.query('UPDATE diy_works SET name = work_name, beads = design_data', { transaction })

      // 修改 status 枚举回旧版
      await queryInterface.sequelize.query(
        "ALTER TABLE diy_works MODIFY COLUMN status ENUM('draft','saved','ordered') NOT NULL DEFAULT 'draft'",
        { transaction }
      )

      // 删除新字段
      const newWorkCols = ['work_code', 'account_id', 'work_name', 'design_data', 'total_cost', 'preview_media_id', 'item_id', 'idempotency_key', 'frozen_at', 'completed_at']
      for (const col of newWorkCols) {
        await queryInterface.removeColumn('diy_works', col, { transaction }).catch(() => {})
      }

      // 恢复 diy_templates 旧字段
      await queryInterface.addColumn('diy_templates', 'name', {
        type: Sequelize.STRING(100), allowNull: true
      }, { transaction })
      await queryInterface.addColumn('diy_templates', 'type', {
        type: Sequelize.STRING(30), allowNull: true
      }, { transaction })
      await queryInterface.addColumn('diy_templates', 'description', {
        type: Sequelize.STRING(500), allowNull: true
      }, { transaction })
      await queryInterface.addColumn('diy_templates', 'bead_size_constraints', {
        type: Sequelize.JSON, allowNull: true
      }, { transaction })
      await queryInterface.addColumn('diy_templates', 'allowed_materials', {
        type: Sequelize.JSON, allowNull: true
      }, { transaction })
      await queryInterface.addColumn('diy_templates', 'pricing_rule', {
        type: Sequelize.JSON, allowNull: true
      }, { transaction })
      await queryInterface.addColumn('diy_templates', 'is_active', {
        type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true
      }, { transaction })

      // 回填
      await queryInterface.sequelize.query(
        'UPDATE diy_templates SET name = display_name, is_active = is_enabled',
        { transaction }
      )

      // 删除新字段
      const newTplCols = ['template_code', 'display_name', 'status', 'is_enabled', 'bead_rules', 'sizing_rules', 'capacity_rules', 'material_group_codes', 'preview_media_id', 'base_image_media_id', 'meta']
      for (const col of newTplCols) {
        await queryInterface.removeColumn('diy_templates', col, { transaction }).catch(() => {})
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
