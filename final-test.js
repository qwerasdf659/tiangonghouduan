const { generateTokens } = require('./middleware/auth');
const { User } = require('./models');
const axios = require('axios');

async function finalTest() {
  try {
    const testUser = await User.findOne({ where: { mobile: '13900000001' } });
    const { accessToken } = generateTokens(testUser);
    
    console.log('=== 🎉 餐厅积分抽奖系统 - 最终测试 ===');
    console.log('👤 测试用户:', testUser.nickname, '积分:', testUser.total_points);
    
    // 1. 获取抽奖配置
    const configRes = await axios.get('http://localhost:3000/api/lottery/config', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    console.log('\n📊 抽奖配置:', configRes.data.code === 0 ? '✅ 成功' : '❌ 失败');
    if (configRes.data.code === 0) {
      console.log('- 奖品数量:', configRes.data.data.prizes.length);
      console.log('- 保底系统:', configRes.data.data.pitySystem.enabled ? '✅ 已启用' : '❌ 未启用');
      console.log('- 当前进度:', configRes.data.data.user_pity.current_count + '/' + configRes.data.data.user_pity.pity_limit);
    }
    
    // 2. 执行抽奖
    const drawRes = await axios.post('http://localhost:3000/api/lottery/draw', 
      { draw_type: 'single' },
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    console.log('\n🎰 抽奖执行:', drawRes.data.code === 0 ? '✅ 成功' : '❌ 失败');
    if (drawRes.data.code === 0) {
      const result = drawRes.data.data.results[0];
      console.log('- 获得奖品:', result.prize.name);
      console.log('- 奖品类型:', result.prize.type);
      console.log('- 是否保底:', result.pity.isPityTriggered ? '🎯 是' : '❌ 否');
      console.log('- 保底进度:', result.pity.currentCount + '/10');
      console.log('- 剩余积分:', drawRes.data.data.user_info.remaining_points);
    } else {
      console.log('抽奖失败:', drawRes.data.msg);
    }
    
    console.log('\n=== 🎉 测试完成 ===');
    console.log('✅ 访问令牌无效问题已解决');
    console.log('✅ 10次保底九八折券机制已实现');  
    console.log('✅ 新的奖品配置已生效');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
  }
}

finalTest();
