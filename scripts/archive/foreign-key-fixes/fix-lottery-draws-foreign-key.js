/**
 * 修复lottery_draws表的重复外键约束
 * 问题：lottery_draws表有3个重复的user_id外键
 * 解决：删除重复外键，保留一个正确的
 *
 * 创建时间：2025年10月10日
 */

require('dotenv').config()
const { sequelize } = require('../models')

async function main () {
  console.log('🔧 修复lottery_draws表的重复外键约束')
  console.log(`📅 执行时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  console.log()

  try {
    await sequelize.authenticate()
    console.log('✅ 数据库连接成功\n')

    // 查看当前外键状态
    const [currentFK] = await sequelize.query(`
      SELECT 
        rc.CONSTRAINT_NAME,
        rc.DELETE_RULE,
        rc.UPDATE_RULE
      FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND rc.TABLE_NAME = kcu.TABLE_NAME
      WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
        AND kcu.TABLE_NAME = 'lottery_draws'
        AND kcu.COLUMN_NAME = 'user_id'
      ORDER BY rc.CONSTRAINT_NAME
    `)

    console.log('📋 当前lottery_draws.user_id的外键约束:')
    currentFK.forEach((fk, index) => {
      console.log(`   ${index + 1}. ${fk.CONSTRAINT_NAME}`)
      console.log(`      DELETE: ${fk.DELETE_RULE}, UPDATE: ${fk.UPDATE_RULE}`)
    })
    console.log()

    if (currentFK.length > 1) {
      console.log(`⚠️  发现 ${currentFK.length} 个重复的外键约束，需要清理\n`)

      // 临时禁用外键检查
      console.log('⚙️  临时禁用外键检查...')
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')

      // 删除所有外键
      for (const fk of currentFK) {
        console.log(`🔧 删除外键: ${fk.CONSTRAINT_NAME}`)
        await sequelize.query(`ALTER TABLE lottery_draws DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`)
      }

      // 创建新的正确外键
      console.log('\n🔧 创建新的外键约束...')
      await sequelize.query(`
        ALTER TABLE lottery_draws
        ADD CONSTRAINT fk_lottery_draws_user_id
        FOREIGN KEY (user_id) REFERENCES users(user_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
      `)
      console.log('✅ 新外键创建成功: ON DELETE CASCADE, ON UPDATE CASCADE')

      // 恢复外键检查
      console.log('\n⚙️  恢复外键检查...')
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
    } else if (currentFK.length === 1) {
      console.log('✅ 没有重复外键\n')

      // 检查当前规则
      const fk = currentFK[0]
      if (fk.UPDATE_RULE !== 'CASCADE' || fk.DELETE_RULE !== 'CASCADE') {
        console.log('⚙️  临时禁用外键检查...')
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')

        console.log(`🔧 删除外键: ${fk.CONSTRAINT_NAME}`)
        await sequelize.query(`ALTER TABLE lottery_draws DROP FOREIGN KEY ${fk.CONSTRAINT_NAME}`)

        console.log('🔧 创建新外键...')
        await sequelize.query(`
          ALTER TABLE lottery_draws
          ADD CONSTRAINT ${fk.CONSTRAINT_NAME}
          FOREIGN KEY (user_id) REFERENCES users(user_id)
          ON DELETE CASCADE
          ON UPDATE CASCADE
        `)
        console.log('✅ 外键规则已更新')

        console.log('⚙️  恢复外键检查...')
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
      } else {
        console.log('✅ 外键规则已经正确，无需修改')
      }
    }

    // 验证修复结果
    console.log('\n' + '='.repeat(60))
    console.log('🔍 验证修复结果')
    console.log('='.repeat(60))

    const [newFK] = await sequelize.query(`
      SELECT 
        rc.CONSTRAINT_NAME,
        rc.DELETE_RULE,
        rc.UPDATE_RULE
      FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
      JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
        ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND rc.TABLE_NAME = kcu.TABLE_NAME
      WHERE rc.CONSTRAINT_SCHEMA = DATABASE()
        AND kcu.TABLE_NAME = 'lottery_draws'
        AND kcu.COLUMN_NAME = 'user_id'
      ORDER BY rc.CONSTRAINT_NAME
    `)

    console.log('\n修复后的外键约束:')
    newFK.forEach((fk, index) => {
      console.log(`   ${index + 1}. ${fk.CONSTRAINT_NAME}`)
      console.log(`      DELETE: ${fk.DELETE_RULE}, UPDATE: ${fk.UPDATE_RULE}`)

      const deleteOK = fk.DELETE_RULE === 'CASCADE'
      const updateOK = fk.UPDATE_RULE === 'CASCADE'

      if (deleteOK && updateOK) {
        console.log('      ✅ 规则正确')
      } else {
        console.log('      ⚠️  规则需要调整')
      }
    })

    if (newFK.length === 1 && newFK[0].DELETE_RULE === 'CASCADE' && newFK[0].UPDATE_RULE === 'CASCADE') {
      console.log('\n✅ 修复成功！lottery_draws.user_id外键规则已正确配置')
    } else {
      console.log('\n⚠️  修复可能未完全成功，请检查')
    }

    console.log('\n' + '='.repeat(60))
    process.exit(0)
  } catch (error) {
    console.error('\n❌ 修复失败:', error.message)
    console.error('错误详情:', error)

    // 确保恢复外键检查
    try {
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
    } catch (e) {
      // 忽略
    }

    process.exit(1)
  }
}

main()
