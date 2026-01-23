#!/bin/bash
# 临时测试脚本 - 测试管理后台 API
# 完成后应删除

echo "===== 管理后台 API 测试脚本 ====="
echo ""

# 1. 首先检查是否有管理员账号
echo "📊 检查数据库中的管理员用户..."
node -e "
const { sequelize, models } = require('./models');

(async () => {
  try {
    const users = await models.User.findAll({
      where: { 
        role: ['admin', 'super_admin']
      },
      attributes: ['user_id', 'nickname', 'mobile', 'role', 'is_admin'],
      limit: 5
    });
    
    if (users.length === 0) {
      console.log('❌ 未找到管理员用户');
      console.log('');
      console.log('正在检查所有用户...');
      
      const allUsers = await models.User.findAll({
        attributes: ['user_id', 'nickname', 'mobile', 'role', 'is_admin'],
        limit: 10
      });
      
      console.log('前10个用户:', JSON.stringify(allUsers.map(u => u.toJSON()), null, 2));
    } else {
      console.log('✅ 找到 ' + users.length + ' 个管理员用户:');
      users.forEach(u => {
        console.log('   - ID:' + u.user_id + ', 昵称:' + u.nickname + ', 手机:' + u.mobile + ', 角色:' + u.role + ', is_admin:' + u.is_admin);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 查询出错:', error.message);
    process.exit(1);
  }
})();
"

echo ""
echo "📊 测试仪表盘 API（不带认证）..."
echo "GET /api/v4/console/system/dashboard"
curl -s http://localhost:3000/api/v4/console/system/dashboard | python3 -m json.tool 2>/dev/null | head -20

echo ""
echo "📊 测试系统健康检查..."
echo "GET /health"
curl -s http://localhost:3000/health | python3 -m json.tool 2>/dev/null | head -20

echo ""
echo "📊 检查可用的 API 路由..."
echo "GET /api/v4"
curl -s http://localhost:3000/api/v4 | python3 -m json.tool 2>/dev/null | head -30

echo ""
echo "===== 测试完成 ====="
echo "注意：完成调试后请删除此脚本"

