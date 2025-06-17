/**
 * Sealos对象存储连接测试脚本
 * 🔴 验证用户提供的真实配置是否正确
 */

require('dotenv').config();
const sealosStorage = require('./services/sealosStorage');

async function testSealosConnection() {
  console.log('🧪 ===== Sealos对象存储连接测试 =====');
  
  try {
    // 1. 测试基本连接
    console.log('\n1️⃣ 测试基本连接...');
    const isConnected = await sealosStorage.testConnection();
    
    if (!isConnected) {
      console.error('❌ Sealos连接失败，请检查配置');
      return false;
    }

    // 2. 获取存储统计
    console.log('\n2️⃣ 获取存储统计信息...');
    try {
      const stats = await sealosStorage.getStorageStats();
      console.log('📊 存储统计:', {
        fileCount: stats.fileCount,
        totalSizeMB: stats.totalSizeMB
      });
    } catch (error) {
      console.log('⚠️ 获取统计信息失败（可能是空桶）:', error.message);
    }

    // 3. 测试文件上传
    console.log('\n3️⃣ 测试文件上传...');
    const testBuffer = Buffer.from('Sealos存储测试文件内容');
    const testFileName = `test_${Date.now()}.txt`;
    
    const uploadUrl = await sealosStorage.uploadImage(
      testBuffer, 
      testFileName,
      'test-folder'
    );
    
    console.log('✅ 测试文件上传成功:', uploadUrl);

    // 4. 测试文件删除
    console.log('\n4️⃣ 测试文件删除...');
    const deleteResult = await sealosStorage.deleteFile(uploadUrl);
    
    if (deleteResult) {
      console.log('✅ 测试文件删除成功');
    } else {
      console.log('⚠️ 测试文件删除失败');
    }

    // 5. 配置信息显示
    console.log('\n📋 当前Sealos配置信息:');
    console.log({
      endpoint: process.env.SEALOS_ENDPOINT,
      internalEndpoint: process.env.SEALOS_INTERNAL_ENDPOINT,
      bucket: process.env.SEALOS_BUCKET,
      accessKey: process.env.SEALOS_ACCESS_KEY,
      secretKey: '***' + process.env.SEALOS_SECRET_KEY?.slice(-4)
    });

    console.log('\n🎉 ===== Sealos存储测试全部通过！ =====');
    return true;

  } catch (error) {
    console.error('\n❌ ===== Sealos存储测试失败 =====');
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
    
    // 提供调试建议
    console.log('\n🔧 调试建议:');
    console.log('1. 检查网络连接是否正常');
    console.log('2. 验证AccessKey和SecretKey是否正确');
    console.log('3. 确认存储桶名称是否存在');
    console.log('4. 检查存储桶权限设置');
    
    return false;
  }
}

// 运行测试
if (require.main === module) {
  testSealosConnection().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = testSealosConnection; 