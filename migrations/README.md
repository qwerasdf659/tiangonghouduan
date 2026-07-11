# 数据库迁移目录

## 当前状态（2026-07-11 迁移史重置，技术债务方案 拍板 9）

- **唯一基线**：`20260711090000-baseline-v4.2.0-squashed.js`（133 张业务表的完整 schema）
- 此后所有数据库变更以该基线为起点走标准增量迁移（`npm run migration:create` 规范命名）

## 历史迁移去向

v4.2 基线之前的全部迁移文件（118 条已执行迁移 + 63 个更早的归档文件）已移出 git 主干，存档于：

- `backups/2026-07-11-squash-v4.2/migrations-pre-squash/`（迁移文件本体）
- `backups/2026-07-11-squash-v4.2/schema_dump.sql`（squash 前全库 DDL）
- `backups/2026-07-11-squash-v4.2/sequelize_meta_list.txt`（squash 前 SequelizeMeta 执行记录）

backups/ 目录整体不入 git（.gitignore），如需追溯历史迁移请在服务器本地或对象存储备份中查阅。

## 铁律

1. 所有 DB 变更必须走迁移，紧急 SQL 也必须走迁移
2. 禁止手写 SQL 直接改生产库
3. 禁止 migrations/manual/（已废除）
4. 生产环境永远使用显式定义，不使用 sequelize.sync()
5. 迁移文件需含完整回滚（down）方法与中文变更说明
