#!/bin/bash
# 修复测试文件中的 moment 使用

cd /home/devbox/project

# 测试文件列表
TEST_FILES=(
  "tests/business/premium/api.test.js"
  "tests/business/lottery/preset.test.js"
  "tests/business/inventory/verification.test.js"
  "tests/business/inventory/generate_code.test.js"
  "tests/business/consumption/api.test.js"
  "tests/business/admin/system_api.test.js"
)

echo "🔄 开始修复测试文件中的 moment 使用..."

for file in "${TEST_FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "处理: $file"
    
    # 移除重构提示注释
    sed -i '/⚠️ 重构提示/,+6d' "$file"
    
    # 替换 moment 时间格式化调用
    sed -i "s/moment().tz('Asia\/Shanghai').format('YYYY-MM-DD HH:mm:ss')/BeijingTimeHelper.formatDateTime(new Date())/g" "$file"
    
    echo "✅ 完成: $file"
  else
    echo "⚠️  文件不存在: $file"
  fi
done

echo ""
echo "✅ 测试文件 moment 使用修复完成"

