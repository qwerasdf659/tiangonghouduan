// 测试材料系统API端点
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const TEST_USER_MOBILE = '13612227930';
const TEST_VERIFICATION_CODE = '123456';

async function testMaterialSystemAPIs() {
  try {
    console.log('=== 材料系统API测试 ===\n');

    // 1. 登录获取Token
    console.log('1. 登录获取Token...');
    const loginRes = await axios.post(`${BASE_URL}/api/v4/auth/login`, {
      mobile: TEST_USER_MOBILE,
      verification_code: TEST_VERIFICATION_CODE
    });

    if (!loginRes.data.success) {
      throw new Error('登录失败: ' + loginRes.data.message);
    }

    const token = loginRes.data.data.token;
    const userId = loginRes.data.data.user.user_id;
    console.log(`✅ 登录成功，用户ID: ${userId}\n`);

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };

    // 2. 测试管理侧API - 查询资产类型
    console.log('2. 测试查询材料资产类型...');
    const assetTypesRes = await axios.get(`${BASE_URL}/api/v4/admin/material/asset-types`, { headers });
    console.log(`✅ 资产类型数量: ${assetTypesRes.data.data?.length || 0}`);
    if (assetTypesRes.data.data && assetTypesRes.data.data.length > 0) {
      console.log(`   示例: ${assetTypesRes.data.data[0].asset_code} - ${assetTypesRes.data.data[0].display_name}`);
    }
    console.log('');

    // 3. 测试管理侧API - 查询转换规则
    console.log('3. 测试查询材料转换规则...');
    const rulesRes = await axios.get(`${BASE_URL}/api/v4/admin/material/conversion-rules`, { headers });
    console.log(`✅ 转换规则数量: ${rulesRes.data.data?.length || 0}`);
    if (rulesRes.data.data && rulesRes.data.data.length > 0) {
      const rule = rulesRes.data.data[0];
      console.log(`   示例: ${rule.from_asset_code}(${rule.from_amount}) → ${rule.to_asset_code}(${rule.to_amount})`);
    }
    console.log('');

    // 4. 测试用户侧API - 查询用户材料余额
    console.log('4. 测试查询用户材料余额...');
    const balancesRes = await axios.get(`${BASE_URL}/api/v4/material/balances`, { headers });
    console.log(`✅ 用户材料余额记录数: ${balancesRes.data.data?.length || 0}`);
    console.log('');

    // 5. 测试用户侧API - 查询转换规则（用户侧）
    console.log('5. 测试查询转换规则（用户侧）...');
    const userRulesRes = await axios.get(`${BASE_URL}/api/v4/material/conversion-rules`, { headers });
    console.log(`✅ 用户可见转换规则数量: ${userRulesRes.data.data?.length || 0}`);
    console.log('');

    // 6. 测试管理侧API - 查询用户钻石余额
    console.log('6. 测试查询用户钻石余额...');
    try {
      const diamondRes = await axios.get(`${BASE_URL}/api/v4/admin/diamond/users/${userId}/balance`, { headers });
      console.log(`✅ 用户钻石余额: ${diamondRes.data.data?.balance || 0}`);
    } catch (error) {
      if (error.response?.data?.message) {
        console.log(`ℹ️  ${error.response.data.message}`);
      } else {
        throw error;
      }
    }
    console.log('');

    // 7. 测试管理侧API - 查询材料流水
    console.log('7. 测试查询材料流水...');
    const txRes = await axios.get(`${BASE_URL}/api/v4/admin/material/transactions?user_id=${userId}`, { headers });
    console.log(`✅ 材料流水记录数: ${txRes.data.data?.transactions?.length || 0}`);
    console.log('');

    console.log('=== 所有API测试通过 ===\n');
    return true;

  } catch (error) {
    console.error('❌ 测试失败:', error.response?.data || error.message);
    return false;
  }
}

testMaterialSystemAPIs()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('测试执行错误:', error);
    process.exit(1);
  });
