// 检查用户角色和权限
const { sequelize, User, Role } = require('./models');

async function checkUserRole() {
  try {
    const user = await User.findOne({
      where: { mobile: '13612227930' },
      include: [{
        model: Role,
        as: 'roles',
        through: { attributes: [] }
      }]
    });

    if (!user) {
      console.log('❌ 用户不存在');
      return;
    }

    console.log('=== 用户信息 ===');
    console.log(`用户ID: ${user.user_id}`);
    console.log(`手机号: ${user.mobile}`);
    console.log(`昵称: ${user.nickname || '未设置'}`);
    console.log('\n=== 角色信息 ===');

    if (user.roles && user.roles.length > 0) {
      user.roles.forEach(role => {
        console.log(`- ${role.role_name} (级别: ${role.role_level})`);
      });
    } else {
      console.log('❌ 该用户没有任何角色');
      console.log('\n💡 需要为该用户添加管理员角色才能访问管理侧API');
    }

  } catch (error) {
    console.error('检查失败:', error.message);
  } finally {
    await sequelize.close();
  }
}

checkUserRole();
