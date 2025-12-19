#!/bin/bash
# 修复 Logger 使用方式：从 new Logger() 改为直接使用 logger

cd /home/devbox/project

echo "🔄 开始修复 Logger 使用方式..."

# 查找所有使用 new Logger() 的文件
FILES=$(grep -rl "new Logger(" --include="*.js" . | grep -v node_modules | grep -v backups | grep -v scripts/refactor)

COUNT=0
for file in $FILES; do
  echo "处理: $file"
  
  # 替换模式：
  # const logger = new Logger('XXX') → const logger = require('../utils/logger').logger
  # const _logger = new Logger('XXX') → const _logger = require('../utils/logger').logger
  
  # 计算相对路径深度
  depth=$(echo "$file" | tr -cd '/' | wc -c)
  relative_path=""
  for ((i=1; i<depth; i++)); do
    relative_path="../$relative_path"
  done
  relative_path="${relative_path}utils/logger"
  
  # 执行替换
  sed -i "s/const logger = new Logger([^)]*)/const logger = require('$relative_path').logger/g" "$file"
  sed -i "s/const _logger = new Logger([^)]*)/const _logger = require('$relative_path').logger/g" "$file"
  sed -i "s/const appLogger = new Logger([^)]*)/const appLogger = require('$relative_path').logger/g" "$file"
  
  ((COUNT++))
done

echo ""
echo "✅ 已处理 $COUNT 个文件"
echo "🔍 验证修复结果..."

# 验证是否还有 new Logger( 的使用
REMAINING=$(grep -r "new Logger(" --include="*.js" . | grep -v node_modules | grep -v backups | wc -l)

if [ $REMAINING -eq 0 ]; then
  echo "✅ 所有 Logger 使用已修复"
else
  echo "⚠️  仍有 $REMAINING 处需要手动检查"
  grep -r "new Logger(" --include="*.js" . | grep -v node_modules | grep -v backups | head -10
fi


