'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, _Sequelize) {
    console.log('🔧 开始修复User模型积分字段冗余问题...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 步骤1: 检查UserPointsAccount表是否存在
      console.log('📋 步骤1: 检查UserPointsAccount表...')
      const [accountTableExists] = await queryInterface.sequelize.query(
        'SHOW TABLES LIKE \'user_points_accounts\'',
        { transaction }
      )

      if (accountTableExists.length === 0) {
        console.log('❌ UserPointsAccount表不存在，无法迁移数据')
        throw new Error('UserPointsAccount表不存在')
      }

      // 步骤2: 迁移现有积分数据到UserPointsAccount表
      console.log('📋 步骤2: 迁移User表中的积分数据...')

      // 检查是否有User积分数据需要迁移
      const [usersWithPoints] = await queryInterface.sequelize.query(
        `
        SELECT 
          u.user_id,
          u.total_points,
          u.available_points,
          u.used_points,
          upa.account_id
        FROM users u
        LEFT JOIN user_points_accounts upa ON u.user_id = upa.user_id
        WHERE (u.total_points > 0 OR u.available_points > 0 OR u.used_points > 0)
        AND upa.account_id IS NULL
      `,
        { transaction }
      )

      console.log(`🔍 发现${usersWithPoints.length}个用户需要创建积分账户`)

      // 为没有积分账户的用户创建账户
      for (const userData of usersWithPoints) {
        await queryInterface.bulkInsert(
          'user_points_accounts',
          [
            {
              user_id: userData.user_id,
              available_points: userData.available_points || 0,
              total_earned: userData.total_points || 0,
              total_consumed: userData.used_points || 0,
              account_level: 'bronze',
              is_active: true,
              behavior_score: 50.0,
              activity_level: 'medium',
              recommendation_enabled: true,
              created_at: new Date(),
              updated_at: new Date()
            }
          ],
          { transaction }
        )

        console.log(`✅ 为用户${userData.user_id}创建积分账户`)
      }

      // 步骤3: 数据一致性验证
      console.log('📋 步骤3: 验证数据迁移一致性...')
      const [consistencyCheck] = await queryInterface.sequelize.query(
        `
        SELECT COUNT(*) as inconsistent_count
        FROM users u
        INNER JOIN user_points_accounts upa ON u.user_id = upa.user_id
        WHERE u.available_points != upa.available_points
        OR u.total_points != upa.total_earned
        OR u.used_points != upa.total_consumed
      `,
        { transaction }
      )

      if (consistencyCheck[0].inconsistent_count > 0) {
        console.log(`⚠️ 发现${consistencyCheck[0].inconsistent_count}个数据不一致，尝试修复...`)

        // 修复不一致的数据（以UserPointsAccount为准）
        await queryInterface.sequelize.query(
          `
          UPDATE users u
          INNER JOIN user_points_accounts upa ON u.user_id = upa.user_id
          SET 
            u.available_points = upa.available_points,
            u.total_points = upa.total_earned,
            u.used_points = upa.total_consumed
          WHERE u.available_points != upa.available_points
          OR u.total_points != upa.total_earned
          OR u.used_points != upa.total_consumed
        `,
          { transaction }
        )

        console.log('✅ 数据不一致已修复')
      }

      // 步骤4: 删除User表中的冗余积分字段
      console.log('📋 步骤4: 移除User表中的冗余积分字段...')

      // 检查字段是否存在，然后删除
      const userTableInfo = await queryInterface.describeTable('users', { transaction })

      if (userTableInfo.total_points) {
        await queryInterface.removeColumn('users', 'total_points', { transaction })
        console.log('✅ 移除 users.total_points 字段')
      }

      if (userTableInfo.available_points) {
        await queryInterface.removeColumn('users', 'available_points', { transaction })
        console.log('✅ 移除 users.available_points 字段')
      }

      if (userTableInfo.used_points) {
        await queryInterface.removeColumn('users', 'used_points', { transaction })
        console.log('✅ 移除 users.used_points 字段')
      }

      // 步骤5: 验证清理结果
      console.log('📋 步骤5: 验证字段清理结果...')
      const finalTableInfo = await queryInterface.describeTable('users', { transaction })

      const removedFields = []
      if (!finalTableInfo.total_points) removedFields.push('total_points')
      if (!finalTableInfo.available_points) removedFields.push('available_points')
      if (!finalTableInfo.used_points) removedFields.push('used_points')

      console.log(`✅ 成功移除字段: ${removedFields.join(', ')}`)

      await transaction.commit()
      console.log('🎉 User模型积分字段冗余修复完成！')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ Migration失败:', error.message)
      throw error
    }
  },

  async down (queryInterface, Sequelize) {
    console.log('🔄 回滚User模型积分字段修复...')

    const transaction = await queryInterface.sequelize.transaction()

    try {
      // 重新添加积分字段
      console.log('📋 重新添加User表积分字段...')

      await queryInterface.addColumn(
        'users',
        'total_points',
        {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '总积分'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'users',
        'available_points',
        {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '可用积分'
        },
        { transaction }
      )

      await queryInterface.addColumn(
        'users',
        'used_points',
        {
          type: Sequelize.INTEGER,
          defaultValue: 0,
          comment: '已使用积分'
        },
        { transaction }
      )

      // 从UserPointsAccount恢复数据
      console.log('📋 从UserPointsAccount恢复积分数据...')
      await queryInterface.sequelize.query(
        `
        UPDATE users u
        INNER JOIN user_points_accounts upa ON u.user_id = upa.user_id
        SET 
          u.total_points = upa.total_earned,
          u.available_points = upa.available_points,
          u.used_points = upa.total_consumed
      `,
        { transaction }
      )

      await transaction.commit()
      console.log('✅ 回滚完成')
    } catch (error) {
      await transaction.rollback()
      console.error('❌ 回滚失败:', error.message)
      throw error
    }
  }
}
