/**
 * 抽奖API测试脚本
 * 演示如何正确获取和使用访问令牌
 */

const { generateTokens } = require('./middleware/auth');
const { User } = require('./models');
const axios = require('axios');

async function testLotteryAPI() {
  try {
    console.log('=== 🧪 抽奖API测试脚本 ===\n');
    
    // 1. 获取测试用户
    console.log('1️⃣ 获取测试用户...');
    const testUser = await User.findOne({
      where: { mobile: '13900000001' }
    });
    
    if (!testUser) {
      throw new Error('测试用户不存在，请先运行数据库初始化');
    }
    
    console.log(`✅ 测试用户: ${testUser.nickname} (ID: ${testUser.user_id})`);
    console.log(`💰 当前积分: ${testUser.total_points}\n`);
    
    // 2. 生成有效的访问令牌
    console.log('2️⃣ 生成访问令牌...');
    const { accessToken } = generateTokens(testUser);
    console.log(`🔑 访问令牌: ${accessToken.substring(0, 50)}...\n`);
    
    // 3. 测试获取抽奖配置
    console.log('3️⃣ 测试获取抽奖配置...');
    try {
      const configResponse = await axios.get('http://localhost:3000/api/lottery/config', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (configResponse.data.code === 0) {
        console.log('✅ 抽奖配置获取成功');
        console.log(`📊 奖品数量: ${configResponse.data.data.prizes.length}`);
        console.log(`💰 单次抽奖消耗: ${configResponse.data.data.costPerDraw} 积分`);
        
        console.log('\n🎁 奖品列表:');
        configResponse.data.data.prizes.forEach((prize, index) => {
          console.log(`   ${index + 1}. ${prize.name} - 概率: ${(prize.probability * 100)}%`);
        });
      } else {
        console.error('❌ 获取配置失败:', configResponse.data.msg);
      }
    } catch (error) {
      if (error.response) {
        console.error('❌ API调用失败:', error.response.data);
      } else {
        console.error('❌ 网络错误:', error.message);
        console.log('💡 请确保服务器已启动: node app.js');
      }
    }
    
    console.log('\n4️⃣ 测试用令牌说明:');
    console.log('📋 正确的API调用方式:');
    console.log(`curl -X GET "http://localhost:3000/api/lottery/config" \\`);
    console.log(`     -H "Authorization: Bearer ${accessToken.substring(0, 30)}..."`);
    
    console.log('\n🔍 访问令牌无效的常见原因:');
    console.log('1. 使用了错误的令牌格式 (应该是 Bearer + 空格 + 令牌)');
    console.log('2. 令牌已过期 (默认2小时有效期)');
    console.log('3. 令牌签名密钥不匹配');
    console.log('4. 用户账号被禁用或删除');
    console.log('5. 没有传递Authorization头');
    
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  testLotteryAPI().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = { testLotteryAPI }; 