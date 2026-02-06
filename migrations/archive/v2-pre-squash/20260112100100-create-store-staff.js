/**
 * 迁移文件：创建 store_staff 门店员工关系表
 *
 * 决策背景（2026-01-12 商家员工域权限体系升级方案）：
 * - 实现多门店多员工多设备的业务场景
 * - 支持员工与门店的多对多关系（一人可服务多店）
 * - 支持员工在门店内的角色区分（staff/manager）
 * - 支持员工离职/调动的历史记录
 *
 * 表设计要点：
 * 1. 联合唯一索引 (user_id, store_id, sequence_no)：允许同一员工多次关联同一门店
 * 2. sequence_no 自动递增：每次重新入职时自动 +1
 * 3. 触发器确保 status='active' 只能存在一条记录
 * 4. role_in_store 区分门店内职位（staff/manager）
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：创建 store_staff 门店员工关系表')

    // =================================================================
    // 步骤1：创建 store_staff 表
    // =================================================================
    console.log('正在创建 store_staff 表...')

    await queryInterface.createTable(
      'store_staff',
      {
        // 主键
        store_staff_id: {
          type: Sequelize.BIGINT,
          primaryKey: true,
          autoIncrement: true,
          comment: '主键ID（自增）'
        },

        // 用户ID（外键）
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'user_id'
          },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
          comment: '员工用户ID（外键关联 users.user_id）'
        },

        // 门店ID（外键）
        store_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'stores',
            key: 'store_id'
          },
          onDelete: 'RESTRICT',
          onUpdate: 'CASCADE',
          comment: '门店ID（外键关联 stores.store_id）'
        },

        // 序列号（用于支持同一用户多次关联同一门店）
        sequence_no: {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 1,
          comment: '序列号（同一用户在同一门店的第N次入职记录）'
        },

        // 门店内角色
        role_in_store: {
          type: Sequelize.ENUM('staff', 'manager'),
          allowNull: false,
          defaultValue: 'staff',
          comment: '门店内角色：staff=员工，manager=店长'
        },

        // 员工状态
        status: {
          type: Sequelize.ENUM('active', 'inactive', 'pending'),
          allowNull: false,
          defaultValue: 'pending',
          comment: '状态：active=在职，inactive=离职，pending=待审核'
        },

        // 入职时间
        joined_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '入职时间（审核通过后设置）'
        },

        // 离职时间
        left_at: {
          type: Sequelize.DATE,
          allowNull: true,
          comment: '离职时间（离职时设置）'
        },

        // 操作者ID（谁邀请/审批的）
        operator_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'users',
            key: 'user_id'
          },
          onDelete: 'SET NULL',
          onUpdate: 'CASCADE',
          comment: '操作者ID（邀请/审批此员工的用户）'
        },

        // 备注
        notes: {
          type: Sequelize.STRING(500),
          allowNull: true,
          comment: '备注信息'
        },

        // 时间戳
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
        comment: '门店员工关系表（员工-门店多对多，支持历史记录）'
      }
    )

    console.log('✅ store_staff 表创建成功')

    // =================================================================
    // 步骤2：添加索引
    // =================================================================
    console.log('正在添加索引...')

    // 联合唯一索引：确保 (user_id, store_id, sequence_no) 唯一
    await queryInterface.addIndex('store_staff', ['user_id', 'store_id', 'sequence_no'], {
      unique: true,
      name: 'uk_store_staff_user_store_seq'
    })
    console.log('   ✅ uk_store_staff_user_store_seq（唯一索引）')

    // 查询索引：按用户查询所属门店
    await queryInterface.addIndex('store_staff', ['user_id', 'status'], {
      name: 'idx_store_staff_user_status'
    })
    console.log('   ✅ idx_store_staff_user_status')

    // 查询索引：按门店查询员工
    await queryInterface.addIndex('store_staff', ['store_id', 'status'], {
      name: 'idx_store_staff_store_status'
    })
    console.log('   ✅ idx_store_staff_store_status')

    // 查询索引：按状态和角色筛选
    await queryInterface.addIndex('store_staff', ['status', 'role_in_store'], {
      name: 'idx_store_staff_status_role'
    })
    console.log('   ✅ idx_store_staff_status_role')

    // =================================================================
    // 步骤3：创建触发器 - 确保每个 (user_id, store_id) 只有一条 active 记录
    // =================================================================
    console.log('正在创建触发器...')

    // 插入前触发器
    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_store_staff_before_insert
      BEFORE INSERT ON store_staff
      FOR EACH ROW
      BEGIN
        DECLARE active_count INT;
        DECLARE max_seq INT;

        -- 检查是否已有 active 记录
        IF NEW.status = 'active' THEN
          SELECT COUNT(*) INTO active_count
          FROM store_staff
          WHERE user_id = NEW.user_id
            AND store_id = NEW.store_id
            AND status = 'active';

          IF active_count > 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'STORE_STAFF_DUPLICATE_ACTIVE: 该员工在此门店已有在职记录';
          END IF;
        END IF;

        -- 自动计算 sequence_no
        SELECT COALESCE(MAX(sequence_no), 0) + 1 INTO max_seq
        FROM store_staff
        WHERE user_id = NEW.user_id
          AND store_id = NEW.store_id;

        SET NEW.sequence_no = max_seq;
      END
    `)
    console.log('   ✅ trg_store_staff_before_insert')

    // 更新前触发器
    await queryInterface.sequelize.query(`
      CREATE TRIGGER trg_store_staff_before_update
      BEFORE UPDATE ON store_staff
      FOR EACH ROW
      BEGIN
        DECLARE active_count INT;

        -- 如果状态变为 active，检查是否已有其他 active 记录
        IF NEW.status = 'active' AND OLD.status != 'active' THEN
          SELECT COUNT(*) INTO active_count
          FROM store_staff
          WHERE user_id = NEW.user_id
            AND store_id = NEW.store_id
            AND status = 'active'
            AND store_staff_id != NEW.store_staff_id;

          IF active_count > 0 THEN
            SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'STORE_STAFF_DUPLICATE_ACTIVE: 该员工在此门店已有在职记录';
          END IF;
        END IF;
      END
    `)
    console.log('   ✅ trg_store_staff_before_update')

    // =================================================================
    // 步骤4：验证迁移结果
    // =================================================================
    console.log('\n📊 验证迁移结果...')

    const [tableInfo] = await queryInterface.sequelize.query(`
      SELECT
        TABLE_NAME,
        TABLE_COMMENT,
        ENGINE
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'store_staff'
    `)

    if (tableInfo.length > 0) {
      console.log('✅ 表创建成功:')
      console.log(`   - 表名: ${tableInfo[0].TABLE_NAME}`)
      console.log(`   - 注释: ${tableInfo[0].TABLE_COMMENT}`)
      console.log(`   - 引擎: ${tableInfo[0].ENGINE}`)
    } else {
      throw new Error('迁移验证失败：store_staff 表不存在')
    }

    // 验证触发器
    const [triggers] = await queryInterface.sequelize.query(`
      SELECT TRIGGER_NAME
      FROM INFORMATION_SCHEMA.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND EVENT_OBJECT_TABLE = 'store_staff'
    `)
    console.log(`✅ 触发器创建成功: ${triggers.length} 个`)
    triggers.forEach(t => {
      console.log(`   - ${t.TRIGGER_NAME}`)
    })

    // 验证索引
    const [indexes] = await queryInterface.sequelize.query(`
      SHOW INDEX FROM store_staff
      WHERE Key_name != 'PRIMARY'
    `)
    console.log(`✅ 索引创建成功: ${indexes.length} 个`)

    console.log('\n✅ store_staff 门店员工关系表迁移完成')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('📝 开始回滚：删除 store_staff 门店员工关系表')

    // 步骤1：删除触发器
    console.log('正在删除触发器...')
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trg_store_staff_before_insert
    `)
    await queryInterface.sequelize.query(`
      DROP TRIGGER IF EXISTS trg_store_staff_before_update
    `)
    console.log('✅ 触发器已删除')

    // 步骤2：删除表（索引会自动删除）
    console.log('正在删除 store_staff 表...')
    await queryInterface.dropTable('store_staff')
    console.log('✅ store_staff 表已删除')

    // 步骤3：验证回滚结果
    const [verifyResult] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) AS table_exists
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'store_staff'
    `)

    if (Number(verifyResult[0].table_exists) === 0) {
      console.log('✅ 回滚验证成功：store_staff 表已删除')
    } else {
      throw new Error('回滚验证失败：store_staff 表仍然存在')
    }

    console.log('\n✅ store_staff 门店员工关系表回滚完成')
  }
}
