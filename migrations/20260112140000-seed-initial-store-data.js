/**
 * 迁移文件：初始化测试门店数据
 *
 * 业务背景（2026-01-12 商家员工域权限体系升级方案）：
 * - 门店隔离体系需要至少一个门店存在
 * - 用于开发测试环境验证商家扫码录入流程
 *
 * 创建的测试数据：
 * 1. 一家测试门店（总店）
 * 2. 将测试用户（user_id=31）绑定为门店店长
 *
 * 注意：
 * - 此迁移仅用于开发/测试环境
 * - 生产环境的门店数据应通过管理后台录入
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md
 */

'use strict'

module.exports = {
  up: async (queryInterface, Sequelize) => {
    console.log('📝 开始迁移：初始化测试门店数据')

    // =================================================================
    // 步骤1：检查是否已有门店数据
    // =================================================================
    const [existingStores] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count FROM stores
    `)

    if (existingStores[0].count > 0) {
      console.log(`✅ 门店表已有 ${existingStores[0].count} 条数据，跳过初始化`)
      return
    }

    // =================================================================
    // 步骤2：获取测试用户ID
    // =================================================================
    const [testUsers] = await queryInterface.sequelize.query(`
      SELECT user_id, mobile, nickname
      FROM users
      WHERE mobile = '13612227930'
      LIMIT 1
    `)

    if (testUsers.length === 0) {
      console.log('⚠️ 测试用户（13612227930）不存在，跳过门店数据初始化')
      console.log('   请先创建测试用户后再运行此迁移')
      return
    }

    const testUserId = testUsers[0].user_id
    console.log(`   测试用户: user_id=${testUserId}, nickname=${testUsers[0].nickname}`)

    // =================================================================
    // 步骤3：创建测试门店
    // =================================================================
    console.log('正在创建测试门店...')

    await queryInterface.sequelize.query(
      `
      INSERT INTO stores (
        store_name,
        store_code,
        store_address,
        contact_name,
        contact_mobile,
        province_code,
        province_name,
        city_code,
        city_name,
        district_code,
        district_name,
        street_code,
        street_name,
        status,
        merchant_id,
        notes,
        created_at,
        updated_at
      ) VALUES (
        '测试餐厅总店',
        'ST20260112001',
        '北京市海淀区中关村大街1号',
        '管理员',
        '13612227930',
        '11',
        '北京市',
        '1101',
        '北京市',
        '110108',
        '海淀区',
        '110108001',
        '海淀街道',
        'active',
        :merchantId,
        '开发测试用门店，用于验证商家扫码录入流程',
        NOW(),
        NOW()
      )
    `,
      {
        replacements: {
          merchantId: testUserId
        }
      }
    )

    console.log('✅ 成功创建测试门店')

    // 获取新创建的门店ID
    const [newStore] = await queryInterface.sequelize.query(`
      SELECT store_id, store_name, store_code
      FROM stores
      WHERE store_code = 'ST20260112001'
    `)

    if (newStore.length === 0) {
      throw new Error('门店创建失败：无法获取新门店ID')
    }

    const storeId = newStore[0].store_id
    console.log(`   门店ID: ${storeId}`)

    // =================================================================
    // 步骤4：将测试用户绑定为门店店长
    // =================================================================
    console.log('正在将测试用户绑定为门店店长...')

    // 检查是否已有绑定
    const [existingStaff] = await queryInterface.sequelize.query(
      `
      SELECT * FROM store_staff
      WHERE user_id = :userId AND store_id = :storeId
    `,
      {
        replacements: {
          userId: testUserId,
          storeId: storeId
        }
      }
    )

    if (existingStaff.length > 0) {
      console.log('✅ 员工绑定已存在，跳过')
    } else {
      await queryInterface.sequelize.query(
        `
        INSERT INTO store_staff (
          user_id,
          store_id,
          role_in_store,
          status,
          joined_at,
          created_at,
          updated_at
        ) VALUES (
          :userId,
          :storeId,
          'manager',
          'active',
          NOW(),
          NOW(),
          NOW()
        )
      `,
        {
          replacements: {
            userId: testUserId,
            storeId: storeId
          }
        }
      )

      console.log('✅ 成功将测试用户绑定为门店店长')
    }

    // =================================================================
    // 步骤5：为测试用户添加 merchant_manager 角色
    // =================================================================
    console.log('正在为测试用户添加 merchant_manager 角色...')

    // 获取 merchant_manager 角色ID
    const [merchantManagerRole] = await queryInterface.sequelize.query(`
      SELECT role_id, role_name
      FROM roles
      WHERE role_name = 'merchant_manager'
    `)

    if (merchantManagerRole.length === 0) {
      console.log('⚠️ merchant_manager 角色不存在，跳过角色绑定')
    } else {
      const roleId = merchantManagerRole[0].role_id

      // 检查是否已有角色绑定
      const [existingUserRole] = await queryInterface.sequelize.query(
        `
        SELECT * FROM user_roles
        WHERE user_id = :userId AND role_id = :roleId
      `,
        {
          replacements: {
            userId: testUserId,
            roleId: roleId
          }
        }
      )

      if (existingUserRole.length > 0) {
        console.log('✅ 用户已有 merchant_manager 角色，跳过')
      } else {
        await queryInterface.sequelize.query(
          `
          INSERT INTO user_roles (
            user_id,
            role_id,
            assigned_by,
            is_active,
            assigned_at,
            created_at,
            updated_at
          ) VALUES (
            :userId,
            :roleId,
            :assignedBy,
            1,
            NOW(),
            NOW(),
            NOW()
          )
        `,
          {
            replacements: {
              userId: testUserId,
              roleId: roleId,
              assignedBy: testUserId
            }
          }
        )

        console.log('✅ 成功为测试用户添加 merchant_manager 角色')
      }
    }

    // =================================================================
    // 步骤6：验证迁移结果
    // =================================================================
    console.log('\n📊 验证迁移结果...')

    const [storeCount] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count FROM stores WHERE status = 'active'
    `)
    console.log(`   门店数量: ${storeCount[0].count}`)

    const [staffCount] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count FROM store_staff WHERE status = 'active'
    `)
    console.log(`   员工绑定数量: ${staffCount[0].count}`)

    const [userRolesCount] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) as count
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.role_id
      WHERE ur.is_active = 1 AND r.role_name IN ('merchant_staff', 'merchant_manager')
    `)
    console.log(`   商家角色绑定数量: ${userRolesCount[0].count}`)

    console.log('\n✅ 测试门店数据初始化迁移完成')
  },

  down: async (queryInterface, Sequelize) => {
    console.log('📝 开始回滚：删除测试门店数据')

    // 获取测试用户ID
    const [testUsers] = await queryInterface.sequelize.query(`
      SELECT user_id FROM users WHERE mobile = '13612227930' LIMIT 1
    `)

    if (testUsers.length > 0) {
      const testUserId = testUsers[0].user_id

      // 删除 merchant_manager 角色绑定
      console.log('正在删除 merchant_manager 角色绑定...')
      await queryInterface.sequelize.query(
        `
        DELETE FROM user_roles
        WHERE user_id = :userId
          AND role_id IN (SELECT role_id FROM roles WHERE role_name = 'merchant_manager')
      `,
        {
          replacements: { userId: testUserId }
        }
      )

      // 删除员工绑定
      console.log('正在删除员工绑定...')
      await queryInterface.sequelize.query(
        `
        DELETE FROM store_staff WHERE user_id = :userId
      `,
        {
          replacements: { userId: testUserId }
        }
      )
    }

    // 删除测试门店
    console.log('正在删除测试门店...')
    await queryInterface.sequelize.query(`
      DELETE FROM stores WHERE store_code = 'ST20260112001'
    `)

    console.log('\n✅ 测试门店数据回滚完成')
  }
}
