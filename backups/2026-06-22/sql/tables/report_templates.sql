/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.14-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: dbconn.sealosbja.site    Database: restaurant_points_dev
-- ------------------------------------------------------
-- Server version	8.0.30

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `report_templates`
--

DROP TABLE IF EXISTS `report_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_templates` (
  `report_template_id` int NOT NULL,
  `template_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板编码（唯一标识，如 daily_lottery_summary）',
  `template_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板名称（中文）',
  `template_description` text COLLATE utf8mb4_unicode_ci COMMENT '模板描述',
  `template_type` enum('lottery','consumption','user','inventory','financial','operational','custom') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板类型',
  `category` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '报表分类（用于前端分组显示）',
  `data_source_config` json NOT NULL COMMENT '数据源配置（定义查询的表、字段、关联关系，如 {"tables": ["lottery_draws", "users"], "joins": [...]}）',
  `columns_config` json NOT NULL COMMENT '列配置（定义显示的列、排序、格式化，如 [{"field": "user_id", "label": "用户ID", "type": "number"}]）',
  `filters_config` json DEFAULT NULL COMMENT '筛选条件配置（定义可用的筛选项，如 [{"field": "created_at", "type": "date_range"}]）',
  `aggregation_config` json DEFAULT NULL COMMENT '聚合配置（定义统计和汇总方式，如 {"group_by": ["date"], "sum": ["amount"]}）',
  `chart_config` json DEFAULT NULL COMMENT '图表配置（定义可视化图表，如 {"type": "line", "x_axis": "date", "y_axis": "count"}）',
  `export_formats` json NOT NULL COMMENT '支持的导出格式（数组，如 ["excel", "csv", "pdf"]）',
  `default_export_format` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'excel' COMMENT '默认导出格式',
  `schedule_config` json DEFAULT NULL COMMENT '定时调度配置（如 {"enabled": true, "cron": "0 8 * * *", "recipients": [1, 2, 3]}）',
  `last_generated_at` datetime DEFAULT NULL COMMENT '上次生成时间',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `is_system` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否系统内置模板（内置模板不可删除）',
  `created_by` int DEFAULT NULL COMMENT '创建者ID',
  `updated_by` int DEFAULT NULL COMMENT '最后更新者ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`report_template_id`),
  UNIQUE KEY `template_code` (`template_code`),
  UNIQUE KEY `idx_report_templates_code` (`template_code`),
  KEY `created_by` (`created_by`),
  KEY `updated_by` (`updated_by`),
  KEY `idx_report_templates_type` (`template_type`),
  KEY `idx_report_templates_enabled` (`is_enabled`),
  KEY `idx_report_templates_system` (`is_system`),
  CONSTRAINT `report_templates_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `report_templates_ibfk_2` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='报表模板表（自定义报表配置管理）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_templates`
--

LOCK TABLES `report_templates` WRITE;
/*!40000 ALTER TABLE `report_templates` DISABLE KEYS */;
INSERT INTO `report_templates` VALUES
(1,'daily_lottery_summary','每日抽奖汇总报表','统计每日抽奖次数、中奖情况、预算消耗等关键指标','lottery','运营报表','{\"joins\": [{\"on\": \"lottery_draws.campaign_id = lottery_campaigns.campaign_id\", \"table\": \"lottery_campaigns\"}], \"tables\": [\"lottery_draws\", \"lottery_campaigns\"], \"primary\": \"lottery_draws\"}','[{\"type\": \"date\", \"field\": \"draw_date\", \"label\": \"日期\"}, {\"type\": \"number\", \"field\": \"total_draws\", \"label\": \"抽奖次数\"}, {\"type\": \"number\", \"field\": \"win_count\", \"label\": \"中奖次数\"}, {\"type\": \"percentage\", \"field\": \"win_rate\", \"label\": \"中奖率\"}, {\"type\": \"currency\", \"field\": \"budget_used\", \"label\": \"预算消耗\"}]','[{\"type\": \"date_range\", \"field\": \"created_at\", \"label\": \"日期范围\"}, {\"type\": \"select\", \"field\": \"campaign_id\", \"label\": \"活动\"}]','{\"sum\": [\"budget_used\"], \"count\": [\"draw_id\"], \"group_by\": [\"DATE(created_at)\"]}',NULL,'[\"excel\", \"csv\"]','excel',NULL,NULL,1,1,NULL,NULL,'2026-02-01 02:00:31','2026-02-01 02:00:31'),
(2,'user_activity_report','用户活跃度报表','统计用户登录、抽奖、消费等活跃行为','user','用户分析','{\"tables\": [\"users\", \"lottery_draws\", \"consumption_records\"], \"primary\": \"users\"}','[{\"type\": \"number\", \"field\": \"user_id\", \"label\": \"用户ID\"}, {\"type\": \"string\", \"field\": \"nickname\", \"label\": \"昵称\"}, {\"type\": \"number\", \"field\": \"login_count\", \"label\": \"登录次数\"}, {\"type\": \"number\", \"field\": \"draw_count\", \"label\": \"抽奖次数\"}, {\"type\": \"number\", \"field\": \"consumption_count\", \"label\": \"消费次数\"}, {\"type\": \"datetime\", \"field\": \"last_active_at\", \"label\": \"最后活跃\"}]','[{\"type\": \"date_range\", \"field\": \"created_at\", \"label\": \"注册日期\"}, {\"type\": \"select\", \"field\": \"status\", \"label\": \"用户状态\"}]',NULL,NULL,'[\"excel\", \"csv\"]','excel',NULL,NULL,1,1,NULL,NULL,'2026-02-01 02:00:31','2026-02-01 02:00:31');
/*!40000 ALTER TABLE `report_templates` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:15
