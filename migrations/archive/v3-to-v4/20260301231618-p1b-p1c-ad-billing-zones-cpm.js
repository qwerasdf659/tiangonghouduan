'use strict'

/**
 * P1b+P1c 合并迁移：广告计费闭环 + 商圈分区 + CPM 计费 + 调价触发
 *
 * P1b 变更：
 * - （无 schema 变更，坑位锁定和竞价排名在代码层实现）
 *
 * P1c 变更：
 * 1. CREATE TABLE ad_target_zones（地域定向）
 * 2. CREATE TABLE ad_zone_groups（联合广告组）
 * 3. CREATE TABLE ad_zone_group_members（联合组成员）
 * 4. ad_slots ADD COLUMN zone_id / slot_category / cpm_price_diamond
 * 5. CREATE TABLE ad_price_adjustment_logs（调价历史记录）
 * 6. system_configs INSERT ad_price_adjustment_trigger 配置
 * 7. ad_target_zones INSERT 全站兜底区域
 *
 * @see docs/广告位定价方案-实施差距分析.md 第五步 & 第六步
 */

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // ========== 1. CREATE TABLE ad_target_zones ==========
      const [t1] = await queryInterface.sequelize.query(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ad_target_zones'",
        { transaction }
      )
      if (t1.length === 0) {
        await queryInterface.createTable('ad_target_zones', {
          zone_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '地域定向ID'
          },
          zone_type: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '地域类型：district=商圈, region=区域'
          },
          zone_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '地域名称（如"望京商圈"、"朝阳区"）'
          },
          priority: {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 10,
            comment: '匹配优先级（越小越优先，运营可调）'
          },
          parent_zone_id: {
            type: Sequelize.INTEGER,
            allowNull: true,
            references: { model: 'ad_target_zones', key: 'zone_id' },
            onDelete: 'SET NULL',
            comment: '上级区域ID（商圈→区域的父子关系）'
          },
          geo_scope: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '覆盖范围（关联门店列表、行政区划ID 等）'
          },
          status: {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'active',
            comment: '状态：active=启用, inactive=停用'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        }, { transaction, comment: '广告地域定向表（商圈 + 区域两级分类）' })
      }

      // ========== 2. CREATE TABLE ad_zone_groups ==========
      const [t2] = await queryInterface.sequelize.query(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ad_zone_groups'",
        { transaction }
      )
      if (t2.length === 0) {
        await queryInterface.createTable('ad_zone_groups', {
          group_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            comment: '联合广告组ID'
          },
          group_name: {
            type: Sequelize.STRING(100),
            allowNull: false,
            comment: '联合组名称'
          },
          pricing_mode: {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'sum',
            comment: '定价方式：sum=成员单价之和, discount=总和×折扣, fixed=固定价'
          },
          discount_rate: {
            type: Sequelize.DECIMAL(3, 2),
            allowNull: false,
            defaultValue: 1.00,
            comment: '折扣率（pricing_mode=discount 时使用）'
          },
          fixed_price: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '固定联合价（pricing_mode=fixed 时使用）'
          },
          status: {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'active',
            comment: '状态：active/inactive'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          updated_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
          }
        }, { transaction, comment: '联合广告组（多地域打包投放）' })
      }

      // ========== 3. CREATE TABLE ad_zone_group_members ==========
      const [t3] = await queryInterface.sequelize.query(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ad_zone_group_members'",
        { transaction }
      )
      if (t3.length === 0) {
        await queryInterface.createTable('ad_zone_group_members', {
          ad_zone_group_member_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          group_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_zone_groups', key: 'group_id' },
            onDelete: 'CASCADE',
            comment: '所属联合组ID'
          },
          zone_id: {
            type: Sequelize.INTEGER,
            allowNull: false,
            references: { model: 'ad_target_zones', key: 'zone_id' },
            onDelete: 'CASCADE',
            comment: '关联地域ID'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          }
        }, { transaction, comment: '联合广告组成员关联表' })

        await queryInterface.addIndex('ad_zone_group_members', ['group_id', 'zone_id'], {
          unique: true,
          name: 'uk_group_zone',
          transaction
        })
      }

      // ========== 4. ad_slots 新增字段 ==========
      const [adSlotCols] = await queryInterface.sequelize.query(
        'SHOW COLUMNS FROM ad_slots', { transaction }
      )
      const colSet = new Set(adSlotCols.map(c => c.Field))

      if (!colSet.has('zone_id')) {
        await queryInterface.addColumn('ad_slots', 'zone_id', {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'ad_target_zones', key: 'zone_id' },
          onDelete: 'SET NULL',
          comment: '绑定地域ID（NULL=全站级别广告位）',
          after: 'floor_price_override'
        }, { transaction })
      }

      if (!colSet.has('slot_category')) {
        await queryInterface.addColumn('ad_slots', 'slot_category', {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'display',
          comment: '广告位大类：display=展示广告（按天/竞价）, feed=信息流广告（CPM）',
          after: 'zone_id'
        }, { transaction })
      }

      if (!colSet.has('cpm_price_diamond')) {
        await queryInterface.addColumn('ad_slots', 'cpm_price_diamond', {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: '每千次曝光价格（钻石），仅 slot_category=feed 时使用',
          after: 'slot_category'
        }, { transaction })
      }

      // ========== 5. CREATE TABLE ad_price_adjustment_logs ==========
      const [t5] = await queryInterface.sequelize.query(
        "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ad_price_adjustment_logs'",
        { transaction }
      )
      if (t5.length === 0) {
        await queryInterface.createTable('ad_price_adjustment_logs', {
          ad_price_adjustment_log_id: {
            type: Sequelize.INTEGER,
            primaryKey: true,
            autoIncrement: true
          },
          trigger_type: {
            type: Sequelize.STRING(20),
            allowNull: false,
            comment: '触发类型：dau_shift=DAU区间变化, manual=运营手动调整'
          },
          old_coefficient: {
            type: Sequelize.DECIMAL(10, 4),
            allowNull: true,
            comment: '调价前的 DAU 系数'
          },
          new_coefficient: {
            type: Sequelize.DECIMAL(10, 4),
            allowNull: true,
            comment: '调价后的 DAU 系数'
          },
          affected_slots: {
            type: Sequelize.JSON,
            allowNull: true,
            comment: '受影响的广告位列表（JSON 数组）'
          },
          status: {
            type: Sequelize.STRING(20),
            allowNull: false,
            defaultValue: 'pending',
            comment: '状态：pending=待确认, confirmed=已确认, rejected=已拒绝, applied=已执行'
          },
          confirmed_by: {
            type: Sequelize.INTEGER,
            allowNull: true,
            comment: '确认操作人ID'
          },
          created_at: {
            type: Sequelize.DATE,
            allowNull: false,
            defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
          },
          applied_at: {
            type: Sequelize.DATE,
            allowNull: true,
            comment: '实际执行时间'
          }
        }, { transaction, comment: '广告调价历史记录表' })
      }

      // ========== 6. system_configs INSERT 调价触发配置 ==========
      const triggerConfigs = [
        {
          config_key: 'ad_price_adjustment_trigger',
          config_value: JSON.stringify({
            enabled: false,
            consecutive_days: 7,
            advance_notice_days: 7,
            auto_apply: false
          }),
          config_category: 'ad_pricing',
          description: '分阶段调价触发器配置：DAU 连续 N 天进入新区间后触发调价建议'
        }
      ]

      for (const cfg of triggerConfigs) {
        const [existingCfg] = await queryInterface.sequelize.query(
          'SELECT system_config_id FROM system_configs WHERE config_key = ?',
          { replacements: [cfg.config_key], transaction }
        )
        if (existingCfg.length === 0) {
          await queryInterface.sequelize.query(
            `INSERT INTO system_configs (config_key, config_value, config_category, description, created_at, updated_at)
             VALUES (?, ?, ?, ?, NOW(), NOW())`,
            { replacements: [cfg.config_key, cfg.config_value, cfg.config_category, cfg.description], transaction }
          )
        }
      }

      // ========== 7. 插入全站兜底区域 ==========
      const [existingZone] = await queryInterface.sequelize.query(
        "SELECT zone_id FROM ad_target_zones WHERE zone_name = '全站'",
        { transaction }
      )
      if (existingZone.length === 0) {
        await queryInterface.sequelize.query(
          `INSERT INTO ad_target_zones (zone_type, zone_name, priority, status, created_at, updated_at)
           VALUES ('region', '全站', 999, 'active', NOW(), NOW())`,
          { transaction }
        )
      }

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  },

  async down(queryInterface, _Sequelize) {
    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 回滚调价配置
      await queryInterface.sequelize.query(
        "DELETE FROM system_configs WHERE config_key = 'ad_price_adjustment_trigger'",
        { transaction }
      )

      // 回滚 ad_slots 新增字段
      const [cols] = await queryInterface.sequelize.query('SHOW COLUMNS FROM ad_slots', { transaction })
      const colNames = new Set(cols.map(c => c.Field))
      for (const col of ['cpm_price_diamond', 'slot_category', 'zone_id']) {
        if (colNames.has(col)) {
          await queryInterface.removeColumn('ad_slots', col, { transaction })
        }
      }

      // 回滚表
      await queryInterface.dropTable('ad_price_adjustment_logs', { transaction }).catch(() => {})
      await queryInterface.dropTable('ad_zone_group_members', { transaction }).catch(() => {})
      await queryInterface.dropTable('ad_zone_groups', { transaction }).catch(() => {})
      await queryInterface.dropTable('ad_target_zones', { transaction }).catch(() => {})

      await transaction.commit()
    } catch (error) {
      await transaction.rollback()
      throw error
    }
  }
}
