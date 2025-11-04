#!/bin/bash
# 脚本名称: cleanup-old-backups.sh
# 功能描述: 清理过期的scripts备份目录
# 创建时间: 2025年10月30日 21:40:59
# 使用方法: bash scripts/maintenance/cleanup-old-backups.sh

echo "🔍 分析scripts备份目录..."

# 获取当前工作目录
WORKSPACE_ROOT="/home/devbox/project"
cd "$WORKSPACE_ROOT" || exit 1

# 统计当前备份情况
echo ""
echo "📊 当前备份状态:"
echo "================================================================"
du -sh scripts* | sort -h
echo "================================================================"

echo ""
echo "📋 备份详细信息:"
for dir in scripts.backup.*; do
    if [ -d "$dir" ]; then
        file_count=$(find "$dir" -type f | wc -l)
        size=$(du -sh "$dir" | cut -f1)
        modified=$(stat -c %y "$dir" | cut -d' ' -f1,2 | cut -d. -f1)
        echo "  📁 $dir"
        echo "     - 文件数: $file_count"
        echo "     - 大小: $size"
        echo "     - 修改时间: $modified"
    fi
done

echo ""
echo "🤔 清理建议分析..."

# 保守清理策略
echo ""
echo "✅ 推荐清理方案（保守）:"
echo "================================================================"
echo "【保留】"
echo "  ✓ scripts/ (当前工作目录)"
echo "  ✓ scripts.backup.20251030_212742 (今天最新备份 - 完整备份)"
echo ""
echo "【可以删除】"
echo "  ✗ scripts.backup.20251015_203611 (15天前 - 已过时)"
echo "  ✗ scripts.backup.20251015_234558 (15天前 - 已过时)"
echo "  ✗ scripts.backup.20251030_refactor (今天临时备份 - 仅2个文件)"
echo ""
echo "💾 预计释放空间: ~3MB"
echo "================================================================"

echo ""
read -p "❓ 是否执行清理？(yes/no): " confirm

if [ "$confirm" = "yes" ]; then
    echo ""
    echo "🗑️ 开始清理..."
    
    # 删除15天前的备份
    if [ -d "scripts.backup.20251015_203611" ]; then
        echo "  删除: scripts.backup.20251015_203611"
        rm -rf "scripts.backup.20251015_203611"
    fi
    
    if [ -d "scripts.backup.20251015_234558" ]; then
        echo "  删除: scripts.backup.20251015_234558"
        rm -rf "scripts.backup.20251015_234558"
    fi
    
    # 删除今天的临时重构备份（仅2个文件）
    if [ -d "scripts.backup.20251030_refactor" ]; then
        echo "  删除: scripts.backup.20251030_refactor (临时备份)"
        rm -rf "scripts.backup.20251030_refactor"
    fi
    
    echo ""
    echo "✅ 清理完成！"
    echo ""
    echo "📊 清理后状态:"
    echo "================================================================"
    du -sh scripts* | sort -h
    echo "================================================================"
    
    # 验证保留的备份
    echo ""
    echo "🔍 验证保留的备份完整性..."
    if [ -d "scripts.backup.20251030_212742" ]; then
        backup_files=$(find scripts.backup.20251030_212742 -type f | wc -l)
        current_files=$(find scripts -type f | wc -l)
        echo "  ✓ 最新备份文件数: $backup_files"
        echo "  ✓ 当前工作文件数: $current_files"
        
        if [ $backup_files -ge 25 ]; then
            echo "  ✅ 备份完整性验证通过"
        else
            echo "  ⚠️ 警告: 备份文件数量偏少，请检查"
        fi
    fi
    
else
    echo ""
    echo "❌ 用户取消清理操作"
    exit 0
fi

echo ""
echo "💡 建议:"
echo "1. 今后使用Git进行版本管理，而不是手动创建备份目录"
echo "2. 如需备份，使用统一的命名格式: scripts.backup.YYYYMMDD_HHMMSS"
echo "3. 定期清理超过30天的备份"
echo "4. 重要变更前使用Git tag标记版本"

