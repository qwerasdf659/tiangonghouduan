#!/bin/bash

# 清除可能冲突的环境变量
unset DB_HOST
unset DB_PORT
unset DB_NAME
unset DB_USER
unset DB_PASSWORD

# 加载.env文件
if [ -f .env ]; then
  echo "📄 加载.env文件..."
  export $(grep -v '^#' .env | grep -v '^$' | xargs)
  echo "✅ 环境变量已加载"
  echo "📊 数据库配置:"
  echo "  DB_HOST: $DB_HOST"
  echo "  DB_PORT: $DB_PORT"
  echo "  DB_NAME: $DB_NAME"
  echo "  DB_USER: $DB_USER"
fi

# 启动服务
node app.js
