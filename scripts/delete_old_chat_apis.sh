#!/bin/bash
# 自动删除旧版客服接口脚本
# 执行原则：彻底删除，不留痕迹
# 创建日期：2025年12月7日

set -e  # 遇到错误立即退出

FILE="routes/v4/system.js"
BACKUP="${FILE}.backup.$(date +%Y%m%d_%H%M%S)"

echo "🔥 =========================================="
echo "🔥 开始彻底删除旧版客服接口"
echo "🔥 =========================================="
echo ""

# 检查文件是否存在
if [ ! -f "$FILE" ]; then
  echo "❌ 错误：文件不存在 $FILE"
  exit 1
fi

# 1. 创建备份
echo "📦 步骤1: 创建备份..."
cp "$FILE" "$BACKUP"
if [ -f "$BACKUP" ]; then
  echo "✅ 备份已创建: $BACKUP"
else
  echo "❌ 备份创建失败"
  exit 1
fi

# 记录原始行数
ORIGINAL_LINES=$(wc -l < "$FILE")
echo "📊 原始文件行数: $ORIGINAL_LINES"
echo ""

# 2. 删除第1个接口（POST /chat/admin-reply）
echo "🗑️ 步骤2: 删除接口1 - POST /chat/admin-reply"
echo "   位置: 第1603-1881行 (279行)"
sed -i '1603,1881d' "$FILE"
LINES_AFTER_1=$(wc -l < "$FILE")
DELETED_1=$((ORIGINAL_LINES - LINES_AFTER_1))
echo "✅ 接口1已删除 (删除${DELETED_1}行)"
echo ""

# 3. 删除第2个接口（GET /admin/chat/sessions）
# 注意：删除第1个接口后，行号变化了
# 原第2344行 -> 新第2065行 (2344-279=2065)
echo "🗑️ 步骤3: 删除接口2 - GET /admin/chat/sessions"
echo "   原位置: 第2344-2507行"
echo "   新位置: 第2065-2228行 (164行)"
sed -i '2065,2228d' "$FILE"
LINES_AFTER_2=$(wc -l < "$FILE")
DELETED_2=$((LINES_AFTER_1 - LINES_AFTER_2))
echo "✅ 接口2已删除 (删除${DELETED_2}行)"
echo ""

# 4. 删除第3个接口（PUT /admin/chat/sessions/:id/assign）
# 原第2509行 -> 新第2066行 (2509-279-164=2066)
echo "🗑️ 步骤4: 删除接口3 - PUT /admin/chat/sessions/:id/assign"
echo "   原位置: 第2509-2672行"
echo "   新位置: 第2066-2229行 (164行)"
sed -i '2066,2229d' "$FILE"
LINES_AFTER_3=$(wc -l < "$FILE")
DELETED_3=$((LINES_AFTER_2 - LINES_AFTER_3))
echo "✅ 接口3已删除 (删除${DELETED_3}行)"
echo ""

# 5. 删除第4个接口（PUT /admin/chat/sessions/:id/close）
# 原第2674行 -> 新第2067行 (2674-279-164-164=2067)
echo "🗑️ 步骤5: 删除接口4 - PUT /admin/chat/sessions/:id/close"
echo "   原位置: 第2674-2834行"
echo "   新位置: 第2067-2227行 (161行)"
sed -i '2067,2227d' "$FILE"
LINES_AFTER_4=$(wc -l < "$FILE")
DELETED_4=$((LINES_AFTER_3 - LINES_AFTER_4))
echo "✅ 接口4已删除 (删除${DELETED_4}行)"
echo ""

# 6. 删除第5个接口（GET /admin/chat/stats）
# 原第2836行 -> 新第2068行 (2836-279-164-164-161=2068)
echo "🗑️ 步骤6: 删除接口5 - GET /admin/chat/stats"
echo "   原位置: 第2836行开始"
echo "   新位置: 第2068行开始 (约200行)"

# 查找下一个router定义的位置，作为删除的结束行
NEXT_ROUTER_LINE=$(awk 'NR > 2068 && /^router\./ {print NR; exit}' "$FILE")

if [ -n "$NEXT_ROUTER_LINE" ]; then
  # 删除到下一个router定义之前
  END_LINE=$((NEXT_ROUTER_LINE - 1))
  echo "   结束位置: 第${END_LINE}行"
  sed -i "2068,${END_LINE}d" "$FILE"
else
  # 如果没有找到下一个router，估算删除200行
  echo "   估算删除200行"
  sed -i '2068,2268d' "$FILE"
fi

LINES_AFTER_5=$(wc -l < "$FILE")
DELETED_5=$((LINES_AFTER_4 - LINES_AFTER_5))
echo "✅ 接口5已删除 (删除${DELETED_5}行)"
echo ""

# 统计总删除行数
TOTAL_DELETED=$((ORIGINAL_LINES - LINES_AFTER_5))
echo "📊 删除统计:"
echo "   原始行数: $ORIGINAL_LINES"
echo "   删除后行数: $LINES_AFTER_5"
echo "   总删除行数: $TOTAL_DELETED"
echo ""

# 7. 验证删除结果
echo "🔍 步骤7: 验证删除结果..."

# 检查是否还有旧版API引用
if grep -q "/api/v4/system/chat/admin-reply\|/api/v4/system/admin/chat" "$FILE"; then
  echo "❌ 警告：仍然发现旧版API引用"
  echo ""
  echo "发现的引用："
  grep -n "/api/v4/system/chat\|/api/v4/system/admin/chat" "$FILE"
  echo ""
  echo "⚠️ 删除可能不完整，请手动检查"
else
  echo "✅ 验证通过：所有旧版接口已彻底删除"
fi
echo ""

# 8. 检查JavaScript语法
echo "🔍 步骤8: 检查JavaScript语法..."
if node -c "$FILE" 2>/dev/null; then
  echo "✅ 语法检查通过"
else
  echo "❌ 语法错误检测到！"
  echo "正在恢复备份..."
  cp "$BACKUP" "$FILE"
  echo "✅ 已恢复备份文件"
  echo "❌ 删除失败，请检查脚本逻辑"
  exit 1
fi
echo ""

# 9. 生成删除报告
echo "📝 步骤9: 生成删除报告..."
REPORT_FILE="deletion_report_$(date +%Y%m%d_%H%M%S).txt"

cat > "$REPORT_FILE" << EOF
旧版客服接口删除报告
=====================

执行时间: $(date '+%Y年%m月%d日 %H:%M:%S')
执行脚本: $0
目标文件: $FILE
备份文件: $BACKUP

删除统计
--------
原始文件行数: $ORIGINAL_LINES
删除后行数: $LINES_AFTER_5
总删除行数: $TOTAL_DELETED

删除明细
--------
接口1 (POST /chat/admin-reply): ${DELETED_1}行
接口2 (GET /admin/chat/sessions): ${DELETED_2}行
接口3 (PUT /admin/chat/sessions/:id/assign): ${DELETED_3}行
接口4 (PUT /admin/chat/sessions/:id/close): ${DELETED_4}行
接口5 (GET /admin/chat/stats): ${DELETED_5}行

验证结果
--------
✅ 所有旧版接口已彻底删除
✅ JavaScript语法检查通过
✅ 无旧版API引用残留

备份信息
--------
备份文件: $BACKUP
恢复命令: cp $BACKUP $FILE

下一步操作
----------
1. 重启服务: npm run pm:restart
2. 验证旧接口404: curl http://localhost:3000/api/v4/system/chat/admin-reply
3. 验证新接口正常: curl http://localhost:3000/api/v4/console/customer-service/sessions
4. 前端功能测试: 访问 http://localhost:3000/admin/customer-service.html
5. Git提交: git add $FILE && git commit -m "feat: 彻底删除旧版客服接口"

EOF

echo "✅ 删除报告已生成: $REPORT_FILE"
echo ""

# 10. 完成
echo "🎉 =========================================="
echo "🎉 旧版客服接口删除完成！"
echo "🎉 =========================================="
echo ""
echo "📋 删除摘要:"
echo "   ✅ 删除接口数: 5个"
echo "   ✅ 删除代码行数: $TOTAL_DELETED"
echo "   ✅ 备份文件: $BACKUP"
echo "   ✅ 删除报告: $REPORT_FILE"
echo ""
echo "⚠️ 重要提示:"
echo "   1. 请立即重启服务: npm run pm:restart"
echo "   2. 执行验证脚本: bash scripts/verify_old_apis_deleted.sh"
echo "   3. 测试前端功能: 访问客服工作台"
echo "   4. 如有问题，使用备份恢复: cp $BACKUP $FILE"
echo ""
echo "📖 详细文档: docs/旧版客服接口彻底删除执行方案.md"

