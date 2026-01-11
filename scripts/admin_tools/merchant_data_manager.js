#!/usr/bin/env node
/**
 * 商家数据管理工具
 *
 * 功能：
 * 1. 添加门店 (--add-store)
 * 2. 添加员工绑定 (--add-staff)
 * 3. 查看当前数据状态 (--status)
 * 4. 生成数据模板 (--template)
 *
 * 使用方法：
 *   node scripts/admin_tools/merchant_data_manager.js --status
 *   node scripts/admin_tools/merchant_data_manager.js --template > merchant_data.json
 *   node scripts/admin_tools/merchant_data_manager.js --import merchant_data.json
 *
 * @since 2026-01-12
 * @see docs/商家员工域权限体系升级方案.md
 */

'use strict'

require('dotenv').config()
const { sequelize, Store, StoreStaff, User, Role, UserRole } = require('../../models')
const BeijingTimeHelper = require('../../utils/timeHelper')

/**
 * 商家数据管理器
 */
class MerchantDataManager {
  /**
   * 获取当前数据状态
   */
  static async getStatus() {
    console.log('\n📊 === 商家数据状态报告 ===')
    console.log(`   生成时间: ${BeijingTimeHelper.nowLocale()}`)
    console.log('')

    // 门店统计
    const [storeStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM stores
    `)
    console.log('🏪 门店统计:')
    console.log(`   总数: ${storeStats[0].total}`)
    console.log(`   活跃: ${storeStats[0].active || 0}`)
    console.log(`   停用: ${storeStats[0].inactive || 0}`)
    console.log(`   待审: ${storeStats[0].pending || 0}`)

    // 门店列表
    const [stores] = await sequelize.query(`
      SELECT store_id, store_name, store_code, store_address, status, contact_mobile
      FROM stores
      ORDER BY store_id
    `)
    if (stores.length > 0) {
      console.log('\n   门店列表:')
      stores.forEach(s => {
        console.log(
          `   - [${s.store_id}] ${s.store_name} (${s.store_code || '无编码'}) - ${s.status}`
        )
        console.log(`     地址: ${s.store_address || '未填写'}`)
        console.log(`     联系人: ${s.contact_mobile || '未填写'}`)
      })
    }

    // 员工绑定统计
    const [staffStats] = await sequelize.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN ss.status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN ss.role_in_store = 'manager' THEN 1 ELSE 0 END) as managers,
        SUM(CASE WHEN ss.role_in_store = 'staff' THEN 1 ELSE 0 END) as staff
      FROM store_staff ss
    `)
    console.log('\n👥 员工绑定统计:')
    console.log(`   总数: ${staffStats[0].total}`)
    console.log(`   活跃: ${staffStats[0].active || 0}`)
    console.log(`   店长: ${staffStats[0].managers || 0}`)
    console.log(`   店员: ${staffStats[0].staff || 0}`)

    // 员工详情
    const [staffList] = await sequelize.query(`
      SELECT 
        ss.store_staff_id,
        ss.user_id,
        ss.store_id,
        ss.role_in_store,
        ss.status,
        u.nickname,
        u.mobile,
        s.store_name
      FROM store_staff ss
      JOIN users u ON ss.user_id = u.user_id
      JOIN stores s ON ss.store_id = s.store_id
      ORDER BY ss.store_id, ss.role_in_store DESC
    `)
    if (staffList.length > 0) {
      console.log('\n   员工列表:')
      staffList.forEach(st => {
        const roleLabel = st.role_in_store === 'manager' ? '👔 店长' : '👤 店员'
        console.log(`   - ${st.nickname} (${st.mobile}) - ${roleLabel} @ ${st.store_name}`)
      })
    }

    // 商家角色统计
    const [roleStats] = await sequelize.query(`
      SELECT 
        r.role_name,
        COUNT(ur.user_id) as user_count
      FROM roles r
      LEFT JOIN user_roles ur ON r.role_id = ur.role_id AND ur.is_active = 1
      WHERE r.role_name IN ('merchant_staff', 'merchant_manager', 'store_owner')
      GROUP BY r.role_id, r.role_name
    `)
    console.log('\n🔐 商家角色分布:')
    roleStats.forEach(rs => {
      console.log(`   ${rs.role_name}: ${rs.user_count}人`)
    })

    console.log('\n✅ 状态报告完成')
  }

  /**
   * 生成数据模板
   */
  static generateTemplate() {
    const template = {
      _说明: '请填写真实数据后使用 --import 导入',
      _注意事项: [
        '1. 所有手机号必须是系统已注册用户的手机号',
        '2. store_code 需要唯一',
        '3. 同一用户可以绑定多个门店',
        '4. merchant_id 填写该门店负责人的 user_id'
      ],
      stores: [
        {
          _必填: true,
          store_name: '【请填写】门店名称（如：XX餐厅朝阳店）',
          store_code: '【请填写】门店编码（如：ST001，需唯一）',
          store_address: '【请填写】门店地址（如：北京市朝阳区XX路XX号）',
          contact_name: '【请填写】联系人姓名',
          contact_mobile: '【请填写】联系人手机号',
          region: '【可选】所属区域（如：朝阳区）',
          merchant_mobile: '【请填写】门店负责人手机号（需已注册）'
        }
      ],
      staff_bindings: [
        {
          _必填: true,
          user_mobile: '【请填写】员工手机号（需已注册）',
          store_code: '【请填写】门店编码（需与上面stores中的store_code对应）',
          role_in_store: 'manager 或 staff',
          _说明: 'manager=店长（有审核权限），staff=店员（仅录入权限）'
        }
      ]
    }

    console.log(JSON.stringify(template, null, 2))
  }

  /**
   * 导入数据
   * @param {string} filePath - JSON文件路径
   */
  static async importData(filePath) {
    const fs = require('fs')
    const path = require('path')

    const fullPath = path.resolve(filePath)
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ 文件不存在: ${fullPath}`)
      process.exit(1)
    }

    let data
    try {
      const content = fs.readFileSync(fullPath, 'utf8')
      data = JSON.parse(content)
    } catch (e) {
      console.error(`❌ JSON解析失败: ${e.message}`)
      process.exit(1)
    }

    const transaction = await sequelize.transaction()

    try {
      console.log('\n📝 开始导入商家数据...')

      // 1. 导入门店
      if (data.stores && data.stores.length > 0) {
        console.log('\n🏪 导入门店数据...')
        for (const storeData of data.stores) {
          // 跳过模板说明字段
          if (storeData.store_name.includes('【请填写】')) {
            console.log('   ⚠️ 跳过未填写的模板数据')
            continue
          }

          // 获取 merchant_id
          let merchantId = null
          if (storeData.merchant_mobile) {
            const merchant = await User.findOne({
              where: { mobile: storeData.merchant_mobile },
              transaction
            })
            if (!merchant) {
              console.error(`   ❌ 门店负责人手机号不存在: ${storeData.merchant_mobile}`)
              continue
            }
            merchantId = merchant.user_id
          }

          // 检查编码是否已存在
          const existingStore = await Store.findOne({
            where: { store_code: storeData.store_code },
            transaction
          })
          if (existingStore) {
            console.log(`   ⚠️ 门店编码已存在，跳过: ${storeData.store_code}`)
            continue
          }

          // 创建门店
          await Store.create(
            {
              store_name: storeData.store_name,
              store_code: storeData.store_code,
              store_address: storeData.store_address,
              contact_name: storeData.contact_name,
              contact_mobile: storeData.contact_mobile,
              region: storeData.region || null,
              merchant_id: merchantId,
              status: 'active'
            },
            { transaction }
          )

          console.log(`   ✅ 创建门店: ${storeData.store_name} (${storeData.store_code})`)
        }
      }

      // 2. 导入员工绑定
      if (data.staff_bindings && data.staff_bindings.length > 0) {
        console.log('\n👥 导入员工绑定数据...')

        // 获取 merchant_staff 角色ID
        const merchantStaffRole = await Role.findOne({
          where: { role_name: 'merchant_staff' },
          transaction
        })
        const merchantManagerRole = await Role.findOne({
          where: { role_name: 'merchant_manager' },
          transaction
        })

        for (const staffData of data.staff_bindings) {
          // 跳过模板说明字段
          if (staffData.user_mobile.includes('【请填写】')) {
            console.log('   ⚠️ 跳过未填写的模板数据')
            continue
          }

          // 获取用户
          const user = await User.findOne({
            where: { mobile: staffData.user_mobile },
            transaction
          })
          if (!user) {
            console.error(`   ❌ 用户手机号不存在: ${staffData.user_mobile}`)
            continue
          }

          // 获取门店
          const store = await Store.findOne({
            where: { store_code: staffData.store_code },
            transaction
          })
          if (!store) {
            console.error(`   ❌ 门店编码不存在: ${staffData.store_code}`)
            continue
          }

          // 检查是否已绑定
          const existingBinding = await StoreStaff.findOne({
            where: {
              user_id: user.user_id,
              store_id: store.store_id,
              status: 'active'
            },
            transaction
          })
          if (existingBinding) {
            console.log(
              `   ⚠️ 员工已绑定此门店，跳过: ${staffData.user_mobile} @ ${staffData.store_code}`
            )
            continue
          }

          // 获取该用户在此门店的序列号
          const [maxSeq] = await sequelize.query(
            `
            SELECT COALESCE(MAX(sequence_no), 0) + 1 as next_seq
            FROM store_staff
            WHERE store_id = :storeId
          `,
            {
              replacements: { storeId: store.store_id },
              transaction
            }
          )

          // 创建员工绑定
          await StoreStaff.create(
            {
              user_id: user.user_id,
              store_id: store.store_id,
              sequence_no: maxSeq[0].next_seq,
              role_in_store: staffData.role_in_store || 'staff',
              status: 'active',
              joined_at: new Date()
            },
            { transaction }
          )

          console.log(
            `   ✅ 绑定员工: ${user.nickname} (${staffData.user_mobile}) -> ${store.store_name} [${staffData.role_in_store}]`
          )

          // 为员工分配角色
          const targetRole =
            staffData.role_in_store === 'manager' ? merchantManagerRole : merchantStaffRole
          if (targetRole) {
            const existingRole = await UserRole.findOne({
              where: {
                user_id: user.user_id,
                role_id: targetRole.role_id,
                is_active: true
              },
              transaction
            })

            if (!existingRole) {
              await UserRole.create(
                {
                  user_id: user.user_id,
                  role_id: targetRole.role_id,
                  assigned_by: user.user_id,
                  is_active: true,
                  assigned_at: new Date()
                },
                { transaction }
              )
              console.log(`   ✅ 分配角色: ${targetRole.role_name}`)
            }
          }
        }
      }

      await transaction.commit()
      console.log('\n🎉 商家数据导入完成！')

      // 显示最新状态
      await MerchantDataManager.getStatus()
    } catch (error) {
      await transaction.rollback()
      console.error(`\n❌ 导入失败: ${error.message}`)
      console.error(error.stack)
      process.exit(1)
    }
  }

  /**
   * 添加单个门店（交互式）
   */
  static async addStore(storeData) {
    const transaction = await sequelize.transaction()

    try {
      // 获取 merchant_id
      let merchantId = null
      if (storeData.merchant_mobile) {
        const merchant = await User.findOne({
          where: { mobile: storeData.merchant_mobile },
          transaction
        })
        if (!merchant) {
          throw new Error(`门店负责人手机号不存在: ${storeData.merchant_mobile}`)
        }
        merchantId = merchant.user_id
      }

      // 检查编码唯一性
      if (storeData.store_code) {
        const existing = await Store.findOne({
          where: { store_code: storeData.store_code },
          transaction
        })
        if (existing) {
          throw new Error(`门店编码已存在: ${storeData.store_code}`)
        }
      }

      // 创建门店
      const store = await Store.create(
        {
          store_name: storeData.store_name,
          store_code: storeData.store_code,
          store_address: storeData.store_address,
          contact_name: storeData.contact_name,
          contact_mobile: storeData.contact_mobile,
          region: storeData.region,
          merchant_id: merchantId,
          status: 'active'
        },
        { transaction }
      )

      await transaction.commit()
      console.log(`✅ 门店创建成功: ${store.store_name} (ID: ${store.store_id})`)
      return store
    } catch (error) {
      await transaction.rollback()
      console.error(`❌ 门店创建失败: ${error.message}`)
      throw error
    }
  }

  /**
   * 添加员工绑定
   */
  static async addStaff(userMobile, storeCode, roleInStore = 'staff') {
    const transaction = await sequelize.transaction()

    try {
      // 查找用户
      const user = await User.findOne({
        where: { mobile: userMobile },
        transaction
      })
      if (!user) {
        throw new Error(`用户不存在: ${userMobile}`)
      }

      // 查找门店
      const store = await Store.findOne({
        where: { store_code: storeCode },
        transaction
      })
      if (!store) {
        throw new Error(`门店不存在: ${storeCode}`)
      }

      // 检查是否已绑定
      const existing = await StoreStaff.findOne({
        where: {
          user_id: user.user_id,
          store_id: store.store_id,
          status: 'active'
        },
        transaction
      })
      if (existing) {
        throw new Error(`员工已绑定此门店`)
      }

      // 获取序列号
      const [maxSeq] = await sequelize.query(
        `
        SELECT COALESCE(MAX(sequence_no), 0) + 1 as next_seq
        FROM store_staff
        WHERE store_id = :storeId
      `,
        {
          replacements: { storeId: store.store_id },
          transaction
        }
      )

      // 创建绑定
      const binding = await StoreStaff.create(
        {
          user_id: user.user_id,
          store_id: store.store_id,
          sequence_no: maxSeq[0].next_seq,
          role_in_store: roleInStore,
          status: 'active',
          joined_at: new Date()
        },
        { transaction }
      )

      // 分配角色
      const roleName = roleInStore === 'manager' ? 'merchant_manager' : 'merchant_staff'
      const role = await Role.findOne({ where: { role_name: roleName }, transaction })
      if (role) {
        const existingRole = await UserRole.findOne({
          where: { user_id: user.user_id, role_id: role.role_id, is_active: true },
          transaction
        })
        if (!existingRole) {
          await UserRole.create(
            {
              user_id: user.user_id,
              role_id: role.role_id,
              assigned_by: user.user_id,
              is_active: true,
              assigned_at: new Date()
            },
            { transaction }
          )
        }
      }

      await transaction.commit()
      console.log(`✅ 员工绑定成功: ${user.nickname} -> ${store.store_name} [${roleInStore}]`)
      return binding
    } catch (error) {
      await transaction.rollback()
      console.error(`❌ 员工绑定失败: ${error.message}`)
      throw error
    }
  }
}

/**
 * CLI 入口
 */
async function main() {
  const args = process.argv.slice(2)

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
商家数据管理工具

用法:
  node scripts/admin_tools/merchant_data_manager.js <命令> [选项]

命令:
  --status              查看当前门店/员工数据状态
  --template            生成数据导入模板（JSON格式）
  --import <file.json>  从JSON文件导入数据

示例:
  # 查看当前状态
  node scripts/admin_tools/merchant_data_manager.js --status

  # 生成模板并保存到文件
  node scripts/admin_tools/merchant_data_manager.js --template > merchant_data.json

  # 编辑 merchant_data.json 填写真实数据后导入
  node scripts/admin_tools/merchant_data_manager.js --import merchant_data.json
`)
    process.exit(0)
  }

  try {
    if (args.includes('--status')) {
      await MerchantDataManager.getStatus()
    } else if (args.includes('--template')) {
      MerchantDataManager.generateTemplate()
    } else if (args.includes('--import')) {
      const fileIndex = args.indexOf('--import') + 1
      if (fileIndex >= args.length) {
        console.error('❌ 请指定要导入的JSON文件路径')
        process.exit(1)
      }
      await MerchantDataManager.importData(args[fileIndex])
    } else {
      console.error('❌ 未知命令，使用 --help 查看帮助')
      process.exit(1)
    }
  } catch (error) {
    console.error(`❌ 执行失败: ${error.message}`)
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

// 导出类供其他模块使用
module.exports = MerchantDataManager

// 作为CLI运行
if (require.main === module) {
  main()
}
