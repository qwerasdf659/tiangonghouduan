#!/bin/bash
###############################################################################
# Redis持久化配置脚本
# 餐厅积分抽奖系统 - 运维工具
# 创建时间：2025年11月24日 北京时间
# 用途：配置Redis持久化策略（RDB + AOF）
###############################################################################

set -e  # 遇到错误立即退出

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 Redis持久化配置工具"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📅 执行时间: $(TZ='Asia/Shanghai' date '+%Y年%m月%d日 %H:%M:%S %Z')"
echo ""

# 检查Redis是否运行
check_redis() {
  echo "🔍 检查Redis服务状态..."
  if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis服务正常运行"
    return 0
  else
    echo "❌ Redis服务未运行"
    echo "请先启动Redis: redis-server --daemonize yes"
    return 1
  fi
}

# 显示当前配置
show_current_config() {
  echo ""
  echo "📊 当前持久化配置:"
  echo "───────────────────────────────────────"
  
  echo "🔹 RDB配置:"
  redis-cli CONFIG GET save | awk '{if(NR%2==0) printf "   save %s\n", $0}'
  redis-cli CONFIG GET dbfilename | awk 'NR==2 {printf "   dbfilename %s\n", $0}'
  redis-cli CONFIG GET dir | awk 'NR==2 {printf "   dir %s\n", $0}'
  
  echo ""
  echo "🔹 AOF配置:"
  redis-cli CONFIG GET appendonly | awk 'NR==2 {printf "   appendonly %s\n", $0}'
  redis-cli CONFIG GET appendfsync | awk 'NR==2 {printf "   appendfsync %s\n", $0}'
  redis-cli CONFIG GET appendfilename | awk 'NR==2 {printf "   appendfilename %s\n", $0}'
  
  echo ""
  echo "🔹 混合持久化:"
  redis-cli CONFIG GET aof-use-rdb-preamble | awk 'NR==2 {printf "   aof-use-rdb-preamble %s\n", $0}'
  
  echo "───────────────────────────────────────"
}

# 推荐配置
recommend_config() {
  echo ""
  echo "💡 推荐配置方案:"
  echo "───────────────────────────────────────"
  echo "🟢 开发环境（默认RDB）:"
  echo "   - RDB快照：每900秒/300秒/60秒保存"
  echo "   - AOF：关闭（可选）"
  echo "   - 适用：本地开发、测试环境"
  echo ""
  echo "🟡 生产环境（RDB + AOF）:"
  echo "   - RDB快照：保持默认"
  echo "   - AOF：启用，everysec同步"
  echo "   - 混合持久化：启用（Redis 4.0+）"
  echo "   - 适用：生产环境，数据重要"
  echo "───────────────────────────────────────"
}

# 配置生产环境持久化
configure_production() {
  echo ""
  echo "🔧 配置生产环境持久化（RDB + AOF）..."
  echo ""
  
  # 1. 启用AOF
  echo "1️⃣ 启用AOF持久化..."
  redis-cli CONFIG SET appendonly yes
  echo "   ✅ appendonly yes"
  
  # 2. 设置同步策略
  echo "2️⃣ 设置AOF同步策略（everysec）..."
  redis-cli CONFIG SET appendfsync everysec
  echo "   ✅ appendfsync everysec"
  
  # 3. 启用混合持久化（如果Redis版本支持）
  echo "3️⃣ 启用混合持久化..."
  if redis-cli CONFIG SET aof-use-rdb-preamble yes > /dev/null 2>&1; then
    echo "   ✅ aof-use-rdb-preamble yes"
  else
    echo "   ⚠️ 当前Redis版本不支持混合持久化"
  fi
  
  # 4. 设置AOF重写参数
  echo "4️⃣ 配置AOF自动重写..."
  redis-cli CONFIG SET auto-aof-rewrite-percentage 100 > /dev/null 2>&1
  redis-cli CONFIG SET auto-aof-rewrite-min-size 67108864 > /dev/null 2>&1  # 64MB
  echo "   ✅ AOF自动重写已配置"
  
  echo ""
  echo "✅ 生产环境持久化配置完成"
}

# 配置开发环境持久化
configure_development() {
  echo ""
  echo "🔧 配置开发环境持久化（默认RDB）..."
  echo ""
  
  # 保持默认RDB配置，关闭AOF
  echo "1️⃣ 确认RDB配置..."
  redis-cli CONFIG SET save "900 1 300 10 60 10000" > /dev/null 2>&1
  echo "   ✅ RDB快照已配置"
  
  echo "2️⃣ AOF持久化..."
  if [ "$(redis-cli CONFIG GET appendonly | awk 'NR==2')" = "yes" ]; then
    read -p "   当前AOF已启用，是否关闭？(y/N) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      redis-cli CONFIG SET appendonly no
      echo "   ✅ 已关闭AOF"
    else
      echo "   ℹ️ 保持AOF启用"
    fi
  else
    echo "   ✅ AOF未启用（符合开发环境）"
  fi
  
  echo ""
  echo "✅ 开发环境持久化配置完成"
}

# 保存配置到redis.conf
save_to_config_file() {
  local config_file="/etc/redis/redis.conf"
  
  echo ""
  read -p "🔒 是否将配置保存到redis.conf文件（需要sudo）? (y/N) " -n 1 -r
  echo ""
  
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "⚠️ 配置仅在内存中生效，Redis重启后会恢复原配置"
    echo "💡 建议：稍后手动编辑 $config_file"
    return 0
  fi
  
  if [ ! -w "$config_file" ]; then
    echo "❌ 无权限写入 $config_file"
    echo "请使用 sudo 运行此脚本，或手动编辑配置文件"
    return 1
  fi
  
  echo "📝 保存配置到 $config_file ..."
  redis-cli CONFIG REWRITE
  echo "✅ 配置已保存"
}

# 验证持久化配置
verify_config() {
  echo ""
  echo "🔍 验证持久化配置..."
  echo "───────────────────────────────────────"
  
  # 检查AOF状态
  local aof_enabled=$(redis-cli CONFIG GET appendonly | awk 'NR==2')
  if [ "$aof_enabled" = "yes" ]; then
    echo "✅ AOF持久化：已启用"
    
    # 检查AOF文件
    local aof_dir=$(redis-cli CONFIG GET dir | awk 'NR==2')
    local aof_file=$(redis-cli CONFIG GET appendfilename | awk 'NR==2')
    local aof_path="$aof_dir/$aof_file"
    
    if [ -f "$aof_path" ]; then
      local aof_size=$(du -h "$aof_path" | cut -f1)
      echo "   📂 AOF文件: $aof_path ($aof_size)"
    else
      echo "   📂 AOF文件: $aof_path (将在下次写入时创建)"
    fi
  else
    echo "ℹ️ AOF持久化：未启用"
  fi
  
  # 检查RDB状态
  local rdb_dir=$(redis-cli CONFIG GET dir | awk 'NR==2')
  local rdb_file=$(redis-cli CONFIG GET dbfilename | awk 'NR==2')
  local rdb_path="$rdb_dir/$rdb_file"
  
  if [ -f "$rdb_path" ]; then
    local rdb_size=$(du -h "$rdb_path" | cut -f1)
    local rdb_time=$(redis-cli LASTSAVE)
    local rdb_date=$(date -d @$rdb_time '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "N/A")
    echo "✅ RDB快照：已启用"
    echo "   📂 RDB文件: $rdb_path ($rdb_size)"
    echo "   ⏰ 最后保存: $rdb_date"
  else
    echo "ℹ️ RDB快照：配置已启用，文件将在满足条件时创建"
  fi
  
  echo "───────────────────────────────────────"
}

# 手动触发持久化
manual_persist() {
  echo ""
  read -p "💾 是否立即执行一次手动持久化？(y/N) " -n 1 -r
  echo ""
  
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    return 0
  fi
  
  echo "💾 执行手动持久化..."
  
  # 执行BGSAVE（后台保存RDB）
  echo "   🔸 执行RDB快照（BGSAVE）..."
  redis-cli BGSAVE > /dev/null 2>&1
  sleep 2
  
  # 如果AOF启用，执行BGREWRITEAOF
  local aof_enabled=$(redis-cli CONFIG GET appendonly | awk 'NR==2')
  if [ "$aof_enabled" = "yes" ]; then
    echo "   🔸 执行AOF重写（BGREWRITEAOF）..."
    redis-cli BGREWRITEAOF > /dev/null 2>&1
  fi
  
  echo "✅ 手动持久化已触发（后台执行）"
}

# 显示持久化监控命令
show_monitoring_commands() {
  echo ""
  echo "📊 持久化监控命令:"
  echo "───────────────────────────────────────"
  echo "# 查看持久化信息"
  echo "redis-cli INFO persistence"
  echo ""
  echo "# 查看最后RDB保存时间"
  echo "redis-cli LASTSAVE"
  echo ""
  echo "# 查看AOF重写状态"
  echo "redis-cli INFO replication | grep aof"
  echo ""
  echo "# 手动触发RDB保存"
  echo "redis-cli BGSAVE"
  echo ""
  echo "# 手动触发AOF重写"
  echo "redis-cli BGREWRITEAOF"
  echo "───────────────────────────────────────"
}

# 主菜单
main_menu() {
  while true; do
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "请选择操作："
    echo "  1) 查看当前配置"
    echo "  2) 配置生产环境持久化（RDB + AOF）"
    echo "  3) 配置开发环境持久化（仅RDB）"
    echo "  4) 验证配置"
    echo "  5) 手动触发持久化"
    echo "  6) 显示监控命令"
    echo "  0) 退出"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    read -p "请输入选项 [0-6]: " choice
    
    case $choice in
      1) show_current_config ;;
      2) 
        configure_production
        save_to_config_file
        verify_config
        ;;
      3) 
        configure_development
        save_to_config_file
        verify_config
        ;;
      4) verify_config ;;
      5) manual_persist ;;
      6) show_monitoring_commands ;;
      0) 
        echo ""
        echo "👋 退出配置工具"
        exit 0
        ;;
      *) 
        echo "❌ 无效选项，请重新选择"
        ;;
    esac
  done
}

# 主程序
main() {
  # 检查Redis服务
  if ! check_redis; then
    exit 1
  fi
  
  # 显示当前配置
  show_current_config
  
  # 显示推荐配置
  recommend_config
  
  # 进入菜单
  main_menu
}

# 执行主程序
main

