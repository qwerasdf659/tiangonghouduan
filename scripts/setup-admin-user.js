/**
 * 设置超级管理员用户权限脚本
 * 用于恢复用户的超级管理员权限（is_admin: true）
 */

const { User } = require('../models');

async function setupAdminUser() {
  try {
    console.log('🔄 开始设置超级管理员用户...');
    
    // 设置现有用户为超级管理员（仅使用真实用户）
    const targetMobile = process.argv[2]; // 从命令行参数获取手机号
    
    if (!targetMobile) {
      console.log('❌ 请提供要设置为管理员的用户手机号');
      console.log('使用方法: node scripts/setup-admin-user.js 手机号');
      process.exit(1);
    }
    
    const user = await User.findOne({ where: { mobile: targetMobile } });
    
    if (!user) {
      console.log(`❌ 用户不存在: ${targetMobile}`);
      console.log('请先让用户通过手机号+验证码123456注册登录');
      process.exit(1);
    }
    
    // 设置用户为超级管理员
    await user.update({
      is_admin: true,
      status: 'active'
    });
    console.log(`✅ 用户权限已更新: ${targetMobile}`);
    
    // 验证权限
    const updatedUser = await User.findOne({ where: { mobile: targetMobile } });
    console.log('👤 用户信息:', {
      user_id: updatedUser.user_id,
      mobile: updatedUser.mobile,
      nickname: updatedUser.nickname,
              is_admin: updatedUser.is_admin,
      total_points: updatedUser.total_points,
      status: updatedUser.status,
      is_super_admin: updatedUser.isSuperAdmin()
    });
    
    if (updatedUser.isSuperAdmin()) {
      console.log('🎉 超级管理员权限设置成功！');
    } else {
      console.log('❌ 权限设置可能有问题');
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 设置超级管理员用户失败:', error);
    process.exit(1);
  }
}

setupAdminUser(); 