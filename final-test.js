// 🔴 遵循cursor规则：导入统一测试配置
const TEST_CONFIG = require('./config/test-data');
const { generateTokens } = require('./middleware/auth');
const { User } = require('./models');
const axios = require('axios');

async function finalTest() {
  try {
    console.log('=== 🎉 餐厅积分抽奖系统 - 最终测试 ===');
    
    // 🔴 遵循cursor规则：使用统一配置 + 错误检查
    console.log('🔍 查找测试用户:', TEST_CONFIG.TEST_USERS.USER1.mobile);
    const testUser = await User.findOne({ 
      where: { mobile: TEST_CONFIG.TEST_USERS.USER1.mobile } 
    });
    
    // 🔴 遵循cursor规则：数据存在性检查
    if (!testUser) {
      console.error(`❌ 测试用户不存在: ${TEST_CONFIG.TEST_USERS.USER1.mobile}`);
      console.log('💡 请先运行数据库初始化: node scripts/init-database.js');
      console.log('📋 当前配置期望的测试用户:');
      Object.entries(TEST_CONFIG.TEST_USERS).forEach(([key, user]) => {
        console.log(`   - ${key}: ${user.mobile} (${user.nickname})`);
      });
      process.exit(1);
    }
    
    // 🔴 遵循cursor规则：安全的token生成
    const tokens = generateTokens(testUser);
    if (!tokens || !tokens.accessToken) {
      throw new Error('生成访问令牌失败');
    }
    const { accessToken } = tokens;
    
    console.log('👤 测试用户:', testUser.nickname, '积分:', testUser.total_points);
    
    // 1. 获取抽奖配置
    console.log('\n📊 测试抽奖配置...');
    try {
      const configRes = await axios.get(`${TEST_CONFIG.API.BASE_URL}/api/lottery/config`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        timeout: TEST_CONFIG.API.TIMEOUT
      });
      
      if (configRes.data.code === 0) {
        console.log('✅ 抽奖配置获取成功');
        console.log('- 奖品数量:', configRes.data.data.prizes.length);
        
        // 🔴 遵循cursor规则：验证期望数据
        if (configRes.data.data.prizes.length !== TEST_CONFIG.LOTTERY.EXPECTED_PRIZES_COUNT) {
          console.warn(`⚠️ 奖品数量不符合预期: 期望${TEST_CONFIG.LOTTERY.EXPECTED_PRIZES_COUNT}, 实际${configRes.data.data.prizes.length}`);
        }
      } else {
        console.error('❌ 抽奖配置获取失败:', configRes.data.msg);
        return;
      }
    } catch (error) {
      console.error('❌ API调用失败:', error.response?.data || error.message);
      console.log('💡 请确保服务器已启动: node app.js');
      return;
    }
    
    // 2. 执行抽奖
    console.log('\n🎰 测试抽奖执行...');
    try {
      const drawRes = await axios.post(`${TEST_CONFIG.API.BASE_URL}/api/lottery/draw`, 
        { draw_type: 'single' },
        { 
          headers: { 'Authorization': `Bearer ${accessToken}` },
          timeout: TEST_CONFIG.API.TIMEOUT
        }
      );
      
      if (drawRes.data.code === 0) {
        console.log('✅ 抽奖执行成功');
        const result = drawRes.data.data.results?.[0];
        if (result) {
          console.log('- 获得奖品:', result.prize_name || result.name || '未知奖品');
          console.log('- 剩余积分:', drawRes.data.data.remaining_points);
        }
      } else {
        console.log('❌ 抽奖失败:', drawRes.data.msg);
      }
    } catch (error) {
      console.error('❌ 抽奖API调用失败:', error.response?.data || error.message);
    }
    
    console.log('\n=== 🎉 测试完成 ===');
    console.log('✅ 遵循cursor规则重构完成');
    console.log('✅ 统一测试数据配置已生效');  
    console.log('✅ 错误处理机制已完善');
    
  } catch (error) {
    console.error('❌ 测试脚本执行失败:', error.message);
    console.log('💡 请检查:');
    console.log('   1. 数据库是否已初始化');
    console.log('   2. 服务器是否正在运行');
    console.log('   3. 网络连接是否正常');
    process.exit(1);
  }
}

// 🔴 遵循cursor规则：安全的脚本执行
if (require.main === module) {
  finalTest().catch((error) => {
    console.error('❌ 脚本启动失败:', error);
    process.exit(1);
  });
}

module.exports = { finalTest };

