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
-- Table structure for table `lottery_alerts`
--

DROP TABLE IF EXISTS `lottery_alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `lottery_alerts` (
  `lottery_alert_id` int NOT NULL AUTO_INCREMENT,
  `lottery_campaign_id` int NOT NULL,
  `alert_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警类型（VARCHAR 存储）：win_rate | budget | inventory | user | system | simulation_bound',
  `severity` enum('info','warning','danger') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警严重程度：info=提示 | warning=警告 | danger=严重',
  `status` enum('active','acknowledged','resolved') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '告警状态：active=待处理 | acknowledged=已确认 | resolved=已解决',
  `rule_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '规则代码（如 RULE_001、WIN_RATE_HIGH）',
  `threshold_value` decimal(10,4) DEFAULT NULL COMMENT '阈值（规则定义的期望值）',
  `actual_value` decimal(10,4) DEFAULT NULL COMMENT '实际值（触发告警时的实际数值）',
  `message` text COLLATE utf8mb4_unicode_ci COMMENT '告警消息（人类可读的描述）',
  `resolved_at` datetime DEFAULT NULL COMMENT '解决时间（北京时间）',
  `resolved_by` int DEFAULT NULL COMMENT '处理人ID（外键，关联 users.user_id）',
  `resolve_notes` text COLLATE utf8mb4_unicode_ci COMMENT '处理备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`lottery_alert_id`),
  KEY `resolved_by` (`resolved_by`),
  KEY `idx_campaign_status` (`lottery_campaign_id`,`status`),
  KEY `idx_status_created` (`status`,`created_at`),
  KEY `idx_alert_type` (`alert_type`),
  KEY `idx_severity` (`severity`),
  CONSTRAINT `lottery_alerts_ibfk_1` FOREIGN KEY (`lottery_campaign_id`) REFERENCES `lottery_campaigns` (`lottery_campaign_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `lottery_alerts_ibfk_2` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=438 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='抽奖系统告警表 - 运营监控专用（独立于商家风控的 risk_alerts）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `lottery_alerts`
--

LOCK TABLES `lottery_alerts` WRITE;
/*!40000 ALTER TABLE `lottery_alerts` DISABLE KEYS */;
INSERT INTO `lottery_alerts` VALUES
(416,1,'simulation_bound','warning','active','sim_bound_high_rate_635',0.0500,0.0000,'{\"metric\":\"high_rate\",\"expected\":0,\"tolerance\":0.05,\"upper_bound\":0.05,\"lower_bound\":0,\"simulation_record_id\":635}',NULL,NULL,NULL,'2026-07-06 03:19:28','2026-07-06 03:19:28'),
(417,1,'simulation_bound','warning','active','sim_bound_empty_rate_635',1.0500,1.0000,'{\"metric\":\"empty_rate\",\"expected\":1,\"tolerance\":0.05,\"upper_bound\":1.05,\"lower_bound\":0.95,\"simulation_record_id\":635}',NULL,NULL,NULL,'2026-07-06 03:19:28','2026-07-06 03:19:28'),
(418,1,'simulation_bound','warning','active','sim_bound_high_rate_638',0.0500,0.0000,'{\"metric\":\"high_rate\",\"expected\":0,\"tolerance\":0.05,\"upper_bound\":0.05,\"lower_bound\":0,\"simulation_record_id\":638}',NULL,NULL,NULL,'2026-07-06 03:38:33','2026-07-06 03:38:33'),
(419,1,'simulation_bound','warning','active','sim_bound_empty_rate_638',1.0500,1.0000,'{\"metric\":\"empty_rate\",\"expected\":1,\"tolerance\":0.05,\"upper_bound\":1.05,\"lower_bound\":0.95,\"simulation_record_id\":638}',NULL,NULL,NULL,'2026-07-06 03:38:33','2026-07-06 03:38:33'),
(420,1,'simulation_bound','warning','active','sim_bound_high_rate_641',0.0500,0.0000,'{\"metric\":\"high_rate\",\"expected\":0,\"tolerance\":0.05,\"upper_bound\":0.05,\"lower_bound\":0,\"simulation_record_id\":641}',NULL,NULL,NULL,'2026-07-06 03:39:07','2026-07-06 03:39:07'),
(421,1,'simulation_bound','warning','active','sim_bound_empty_rate_641',1.0500,1.0000,'{\"metric\":\"empty_rate\",\"expected\":1,\"tolerance\":0.05,\"upper_bound\":1.05,\"lower_bound\":0.95,\"simulation_record_id\":641}',NULL,NULL,NULL,'2026-07-06 03:39:07','2026-07-06 03:39:07'),
(422,1,'simulation_bound','warning','active','sim_bound_high_rate_644',0.0500,0.0000,'{\"metric\":\"high_rate\",\"expected\":0,\"tolerance\":0.05,\"upper_bound\":0.05,\"lower_bound\":0,\"simulation_record_id\":644}',NULL,NULL,NULL,'2026-07-11 01:49:01','2026-07-11 01:49:01'),
(423,1,'simulation_bound','warning','active','sim_bound_empty_rate_644',1.0500,1.0000,'{\"metric\":\"empty_rate\",\"expected\":1,\"tolerance\":0.05,\"upper_bound\":1.05,\"lower_bound\":0.95,\"simulation_record_id\":644}',NULL,NULL,NULL,'2026-07-11 01:49:01','2026-07-11 01:49:01'),
(424,1,'simulation_bound','warning','active','sim_bound_high_rate_647',0.0500,0.0000,'{\"metric\":\"high_rate\",\"expected\":0,\"tolerance\":0.05,\"upper_bound\":0.05,\"lower_bound\":0,\"simulation_record_id\":647}',NULL,NULL,NULL,'2026-07-11 01:49:34','2026-07-11 01:49:34'),
(425,1,'simulation_bound','warning','active','sim_bound_empty_rate_647',1.0500,1.0000,'{\"metric\":\"empty_rate\",\"expected\":1,\"tolerance\":0.05,\"upper_bound\":1.05,\"lower_bound\":0.95,\"simulation_record_id\":647}',NULL,NULL,NULL,'2026-07-11 01:49:34','2026-07-11 01:49:34'),
(426,1,'simulation_bound','warning','active','sim_bound_high_rate_650',0.0500,0.0000,'{\"metric\":\"high_rate\",\"expected\":0,\"tolerance\":0.05,\"upper_bound\":0.05,\"lower_bound\":0,\"simulation_record_id\":650}',NULL,NULL,NULL,'2026-07-11 01:53:31','2026-07-11 01:53:31'),
(427,1,'simulation_bound','warning','active','sim_bound_empty_rate_650',1.0500,1.0000,'{\"metric\":\"empty_rate\",\"expected\":1,\"tolerance\":0.05,\"upper_bound\":1.05,\"lower_bound\":0.95,\"simulation_record_id\":650}',NULL,NULL,NULL,'2026-07-11 01:53:31','2026-07-11 01:53:31'),
(428,1,'simulation_bound','warning','active','sim_bound_high_rate_653',0.0500,0.0000,'{\"metric\":\"high_rate\",\"expected\":0,\"tolerance\":0.05,\"upper_bound\":0.05,\"lower_bound\":0,\"simulation_record_id\":653}',NULL,NULL,NULL,'2026-07-11 02:20:33','2026-07-11 02:20:33'),
(429,1,'simulation_bound','warning','active','sim_bound_empty_rate_653',1.0500,1.0000,'{\"metric\":\"empty_rate\",\"expected\":1,\"tolerance\":0.05,\"upper_bound\":1.05,\"lower_bound\":0.95,\"simulation_record_id\":653}',NULL,NULL,NULL,'2026-07-11 02:20:33','2026-07-11 02:20:33'),
(430,1,'simulation_bound','warning','active','sim_bound_high_rate_656',0.0500,0.0000,'{\"metric\":\"high_rate\",\"expected\":0,\"tolerance\":0.05,\"upper_bound\":0.05,\"lower_bound\":0,\"simulation_record_id\":656}',NULL,NULL,NULL,'2026-07-11 09:07:47','2026-07-11 09:07:47'),
(431,1,'simulation_bound','warning','active','sim_bound_empty_rate_656',1.0500,1.0000,'{\"metric\":\"empty_rate\",\"expected\":1,\"tolerance\":0.05,\"upper_bound\":1.05,\"lower_bound\":0.95,\"simulation_record_id\":656}',NULL,NULL,NULL,'2026-07-11 09:07:47','2026-07-11 09:07:47'),
(432,1,'simulation_bound','warning','active','sim_bound_high_rate_659',0.0500,0.0000,'{\"metric\":\"high_rate\",\"expected\":0,\"tolerance\":0.05,\"upper_bound\":0.05,\"lower_bound\":0,\"simulation_record_id\":659}',NULL,NULL,NULL,'2026-07-11 09:41:02','2026-07-11 09:41:02'),
(433,1,'simulation_bound','warning','active','sim_bound_empty_rate_659',1.0500,1.0000,'{\"metric\":\"empty_rate\",\"expected\":1,\"tolerance\":0.05,\"upper_bound\":1.05,\"lower_bound\":0.95,\"simulation_record_id\":659}',NULL,NULL,NULL,'2026-07-11 09:41:02','2026-07-11 09:41:02'),
(434,1,'simulation_bound','warning','active','sim_bound_high_rate_662',0.0500,0.0000,'{\"metric\":\"high_rate\",\"expected\":0,\"tolerance\":0.05,\"upper_bound\":0.05,\"lower_bound\":0,\"simulation_record_id\":662}',NULL,NULL,NULL,'2026-07-11 10:00:35','2026-07-11 10:00:35'),
(435,1,'simulation_bound','warning','active','sim_bound_empty_rate_662',1.0500,1.0000,'{\"metric\":\"empty_rate\",\"expected\":1,\"tolerance\":0.05,\"upper_bound\":1.05,\"lower_bound\":0.95,\"simulation_record_id\":662}',NULL,NULL,NULL,'2026-07-11 10:00:35','2026-07-11 10:00:35'),
(436,1,'simulation_bound','warning','active','sim_bound_high_rate_665',0.0500,0.0000,'{\"metric\":\"high_rate\",\"expected\":0,\"tolerance\":0.05,\"upper_bound\":0.05,\"lower_bound\":0,\"simulation_record_id\":665}',NULL,NULL,NULL,'2026-07-15 21:28:00','2026-07-15 21:28:00'),
(437,1,'simulation_bound','warning','active','sim_bound_empty_rate_665',1.0500,1.0000,'{\"metric\":\"empty_rate\",\"expected\":1,\"tolerance\":0.05,\"upper_bound\":1.05,\"lower_bound\":0.95,\"simulation_record_id\":665}',NULL,NULL,NULL,'2026-07-15 21:28:00','2026-07-15 21:28:00');
/*!40000 ALTER TABLE `lottery_alerts` ENABLE KEYS */;
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
