/**
 * 设置超级管理员用户权限脚本
 * 用于恢复用户的超级管理员权限（is_admin: true, is_merchant: true）
 */

const { User } = require('../models');

async function setupAdminUser() {
  try {
    console.log('🔄 开始设置超级管理员用户...');
    
    // 查找或创建测试用户
    const testMobile = '13800000031';
    const [user, created] = await User.findOrCreate({
      where: { mobile: testMobile },
      defaults: {
        mobile: testMobile,
        nickname: '超级管理员',
        total_points: 10000,
        is_admin: true,
        is_merchant: true,
        status: 'active'
      }
    });
    
    if (!created) {
      // 如果用户已存在，更新权限
      await user.update({
        is_admin: true,
        is_merchant: true,
        status: 'active'
      });
      console.log(`✅ 用户权限已更新: ${testMobile}`);
    } else {
      console.log(`✅ 新用户已创建: ${testMobile}`);
    }
    
    // 验证权限
    const updatedUser = await User.findOne({ where: { mobile: testMobile } });
    console.log('👤 用户信息:', {
      user_id: updatedUser.user_id,
      mobile: updatedUser.mobile,
      nickname: updatedUser.nickname,
      is_admin: updatedUser.is_admin,
      is_merchant: updatedUser.is_merchant,
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