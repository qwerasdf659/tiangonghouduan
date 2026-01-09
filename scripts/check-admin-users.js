#!/usr/bin/env node
/**
 * 检查管理员用户
 */

const { User, Role, UserRole } = require('../models');

async function main() {
  try {
    console.log('🔍 查询管理员用户...\n');
    
    // 查询 is_admin = true 的用户
    const adminUsers = await User.findAll({
      where: { is_admin: true },
      limit: 10,
      raw: true,
      attributes: ['user_id', 'mobile', 'nickname', 'is_admin']
    });
    
    if (adminUsers.length > 0) {
      console.log('📋 is_admin=true 的用户:');
      adminUsers.forEach(u => {
        console.log(`  手机: ${u.mobile}, 昵称: ${u.nickname || '无'}`);
      });
    } else {
      console.log('⚠️ 没有找到 is_admin=true 的用户');
    }
    
    // 查询有管理员角色的用户
    console.log('\n📋 查询角色表...');
    const adminRole = await Role.findOne({
      where: { role_name: 'admin' },
      raw: true
    });
    
    if (adminRole) {
      console.log(`  找到admin角色: role_id = ${adminRole.role_id}`);
      
      const userRoles = await UserRole.findAll({
        where: { role_id: adminRole.role_id },
        limit: 10,
        raw: true
      });
      
      if (userRoles.length > 0) {
        console.log(`  有${userRoles.length}个用户拥有admin角色`);
        for (const ur of userRoles) {
          const user = await User.findByPk(ur.user_id, { raw: true, attributes: ['mobile', 'nickname'] });
          if (user) {
            console.log(`    手机: ${user.mobile}, 昵称: ${user.nickname || '无'}`);
          }
        }
      }
    } else {
      console.log('  未找到admin角色');
    }
    
    // 显示前5个用户的信息（用于参考）
    console.log('\n📋 前5个用户（参考）:');
    const allUsers = await User.findAll({
      limit: 5,
      raw: true,
      attributes: ['mobile', 'nickname', 'is_admin']
    });
    allUsers.forEach(u => {
      console.log(`  手机: ${u.mobile}, 昵称: ${u.nickname || '无'}, is_admin: ${u.is_admin}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('错误:', error.message);
    process.exit(1);
  }
}

main();

