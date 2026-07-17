/*M!999999\- enable the sandbox mode */ 
-- MariaDB dump 10.19  Distrib 10.11.14-MariaDB, for debian-linux-gnu (x86_64)
--
-- Host: test-db-12-mysql.ns-br0za7uc.svc    Database: restaurant_points_dev
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
-- Table structure for table `lottery_campaign_pricing_config`
--

DROP TABLE IF EXISTS `lottery_campaign_pricing_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_campaign_pricing_config` (
  `lottery_campaign_pricing_config_id` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lottery_campaign_id` int NOT NULL,
  `version` int NOT NULL DEFAULT '1' COMMENT '版本号（同一活动递增，支持版本回滚）',
  `pricing_config` json NOT NULL COMMENT '定价配置JSON（draw_buttons数组：count/discount/label/enabled/sort_order）',
  `status` enum('draft','active','scheduled','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '状态：draft-草稿, active-生效中, scheduled-待生效, archived-已归档',
  `effective_at` datetime DEFAULT NULL COMMENT '生效时间（NULL表示立即生效，用于定时生效/AB测试场景）',
  `expired_at` datetime DEFAULT NULL COMMENT '过期时间（NULL表示永不过期，用于限时活动折扣）',
  `created_by` int NOT NULL COMMENT '创建人ID（外键关联users.user_id）',
  `updated_by` int DEFAULT NULL COMMENT '最后修改人ID（外键关联users.user_id）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`lottery_campaign_pricing_config_id`),
  UNIQUE KEY `uk_campaign_version` (`lottery_campaign_id`,`version`),
  KEY `idx_campaign_status` (`lottery_campaign_id`,`status`),
  KEY `idx_campaign_version` (`lottery_campaign_id`,`version`),
  KEY `idx_effective_at` (`effective_at`),
  KEY `idx_status` (`status`),
  KEY `fk_pricing_config_creator` (`created_by`),
  KEY `fk_pricing_config_updater` (`updated_by`),
  CONSTRAINT `fk_pricing_config_campaign` FOREIGN KEY (`lottery_campaign_id`) REFERENCES `lottery_campaigns` (`lottery_campaign_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pricing_config_creator` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_pricing_config_updater` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='活动级定价配置表（可版本化/可回滚/可定时生效）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_campaign_pricing_config`
--

LOCK TABLES `lottery_campaign_pricing_config` WRITE;
/*!40000 ALTER TABLE `lottery_campaign_pricing_config` DISABLE KEYS */;
INSERT INTO `lottery_campaign_pricing_config` VALUES
('pricing_1768782496093_kbh30u',1,1,'{\"draw_buttons\": [{\"count\": 1, \"label\": \"单抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 3, \"label\": \"3连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 3}, {\"count\": 5, \"label\": \"5连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 5}, {\"count\": 10, \"label\": \"10连抽(九折)\", \"enabled\": true, \"discount\": 0.9, \"sort_order\": 10}]}','archived',NULL,NULL,32,NULL,'2026-01-19 08:28:16','2026-06-22 05:38:26'),
('pricing_1768804670373_eumkyz',1,2,'{\"draw_buttons\": [{\"count\": 1, \"label\": \"单抽V2\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 10, \"label\": \"10连抽(85折)\", \"enabled\": true, \"discount\": 0.85, \"sort_order\": 10}]}','archived',NULL,NULL,32,NULL,'2026-01-19 14:37:50','2026-06-22 05:38:26'),
('pricing_1768804733242_q4l5s3',1,3,'{\"draw_buttons\": [{\"count\": 1, \"label\": \"单抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 3, \"label\": \"3连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 3}, {\"count\": 5, \"label\": \"5连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 5}, {\"count\": 10, \"label\": \"10连抽(九折)\", \"enabled\": true, \"discount\": 0.9, \"sort_order\": 10}], \"_rollback_metadata\": {\"rollback_at\": \"2026-01-19T06:38:53.240Z\", \"rollback_by\": 31, \"rollback_reason\": \"测试回滚功能\", \"rollback_from_version\": 1}}','archived',NULL,NULL,32,NULL,'2026-01-19 14:38:53','2026-06-22 05:38:26'),
('pricing_1768804748256_10pndr',1,4,'{\"draw_buttons\": [{\"count\": 1, \"label\": \"单抽定时版\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}]}','draft',NULL,NULL,32,NULL,'2026-01-19 14:39:08','2026-06-22 05:38:26'),
('pricing_1769007667357_cp5agf',1,5,'{\"draw_buttons\": [{\"count\": 1, \"label\": \"单抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 3, \"label\": \"3连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 3}, {\"count\": 5, \"label\": \"5连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 5}, {\"count\": 10, \"label\": \"10连抽(九折)\", \"enabled\": true, \"discount\": 0.9, \"sort_order\": 10}], \"_rollback_metadata\": {\"rollback_at\": \"2026-01-19T06:38:53.240Z\", \"rollback_by\": 31, \"rollback_reason\": \"测试回滚功能\", \"rollback_from_version\": 1}}','archived',NULL,NULL,32,NULL,'2026-01-21 23:01:07','2026-06-22 05:38:26'),
('pricing_1769292509620_0745dd',1,6,'{\"base_cost\": 10, \"draw_buttons\": [{\"count\": 1, \"label\": \"单抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 3, \"label\": \"3连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 3}, {\"count\": 5, \"label\": \"5连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 5}, {\"count\": 10, \"label\": \"10连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 10}]}','archived',NULL,NULL,32,NULL,'2026-01-25 06:08:29','2026-06-22 05:38:26'),
('pricing_1769292851904_ipapxd',1,7,'{\"base_cost\": 10, \"draw_buttons\": [{\"count\": 1, \"label\": \"单抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 3, \"label\": \"3连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 3}, {\"count\": 5, \"label\": \"5连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 5}, {\"count\": 10, \"label\": \"10连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 10}]}','archived',NULL,NULL,32,NULL,'2026-01-25 06:14:11','2026-06-22 05:38:26'),
('pricing_1769292856349_6urrj7',1,8,'{\"base_cost\": 10, \"draw_buttons\": [{\"count\": 1, \"label\": \"单抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 3, \"label\": \"3连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 3}, {\"count\": 5, \"label\": \"5连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 5}, {\"count\": 10, \"label\": \"10连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 10}]}','archived',NULL,NULL,32,NULL,'2026-01-25 06:14:16','2026-06-22 05:38:26'),
('pricing_1769293444633_x6l1dw',1,9,'{\"base_cost\": 10, \"draw_buttons\": [{\"count\": 1, \"label\": \"单抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 3, \"label\": \"3连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 3}, {\"count\": 5, \"label\": \"5连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 5}, {\"count\": 10, \"label\": \"10连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 10}]}','archived',NULL,NULL,32,NULL,'2026-01-25 06:24:04','2026-06-22 05:38:26'),
('pricing_1769351870468_yxf3u1',1,10,'{\"base_cost\": 10, \"draw_buttons\": [{\"count\": 1, \"label\": \"单抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 3, \"label\": \"3连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 3}, {\"count\": 5, \"label\": \"5连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 5}, {\"count\": 10, \"label\": \"10连抽(8折)\", \"enabled\": true, \"discount\": 0.8, \"sort_order\": 10}]}','archived',NULL,NULL,32,NULL,'2026-01-25 22:37:50','2026-06-22 05:38:26'),
('pricing_1771338114178_p732j2',1,11,'{\"base_cost\": 100, \"draw_buttons\": [{\"count\": 1, \"label\": \"单抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 3, \"label\": \"3连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 3}, {\"count\": 5, \"label\": \"5连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 5}, {\"count\": 10, \"label\": \"10连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 10}]}','archived',NULL,NULL,32,NULL,'2026-02-17 22:21:54','2026-06-22 05:38:26'),
('pricing_1771436306775_b0z83e',1,12,'{\"base_cost\": 100, \"draw_buttons\": [{\"count\": 1, \"label\": \"单抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 3, \"label\": \"3连抽(九五折)\", \"enabled\": true, \"discount\": 0.95, \"sort_order\": 3}, {\"count\": 5, \"label\": \"5连抽(九三折)\", \"enabled\": true, \"discount\": 0.93, \"sort_order\": 5}, {\"count\": 10, \"label\": \"10连抽(九折)\", \"enabled\": true, \"discount\": 0.9, \"sort_order\": 10}]}','archived',NULL,NULL,32,NULL,'2026-02-19 01:38:26','2026-06-22 05:38:26'),
('pricing_1771436674750_e2qztp',1,13,'{\"base_cost\": 100, \"draw_buttons\": [{\"count\": 1, \"label\": \"单抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 3, \"label\": \"3连抽(9.5折)\", \"enabled\": true, \"discount\": 0.95, \"sort_order\": 3}, {\"count\": 5, \"label\": \"5连抽(9.3折)\", \"enabled\": true, \"discount\": 0.93, \"sort_order\": 5}, {\"count\": 10, \"label\": \"10连抽(9折)\", \"enabled\": true, \"discount\": 0.9, \"sort_order\": 10}]}','archived',NULL,NULL,32,NULL,'2026-02-19 01:44:34','2026-06-22 05:38:26'),
('pricing_1772788125155_new12',1,14,'{\"base_cost\": 30, \"draw_buttons\": [{\"count\": 1, \"label\": \"单抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 1}, {\"count\": 3, \"label\": \"3连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 3}, {\"count\": 5, \"label\": \"5连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 5}, {\"count\": 10, \"label\": \"10连抽\", \"enabled\": true, \"discount\": 1, \"sort_order\": 10}]}','active',NULL,NULL,32,NULL,'2026-03-06 09:08:45','2026-06-22 05:38:26');
/*!40000 ALTER TABLE `lottery_campaign_pricing_config` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:50
