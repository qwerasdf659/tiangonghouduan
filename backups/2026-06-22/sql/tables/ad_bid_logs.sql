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
-- Table structure for table `ad_bid_logs`
--

DROP TABLE IF EXISTS `ad_bid_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_bid_logs` (
  `ad_bid_log_id` bigint NOT NULL AUTO_INCREMENT COMMENT '竞价记录主键（BIGINT）',
  `ad_slot_id` int NOT NULL COMMENT '竞争的广告位 ID',
  `ad_campaign_id` int NOT NULL COMMENT '参与竞价的广告计划 ID',
  `bid_amount_star_stone` int NOT NULL COMMENT '出价（星石）',
  `is_winner` tinyint(1) NOT NULL COMMENT '是否胜出',
  `target_user_id` int DEFAULT NULL COMMENT '目标用户ID（外键→users，未登录匿名访客为 NULL）',
  `lose_reason` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '落选原因：outbid / targeting_mismatch / budget_exhausted',
  `bid_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '竞价时间',
  PRIMARY KEY (`ad_bid_log_id`),
  KEY `idx_abl_slot_time` (`ad_slot_id`,`bid_at`),
  KEY `idx_abl_campaign` (`ad_campaign_id`),
  KEY `idx_abl_user` (`target_user_id`),
  CONSTRAINT `ad_bid_logs_ibfk_1` FOREIGN KEY (`ad_slot_id`) REFERENCES `ad_slots` (`ad_slot_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_bid_logs_ibfk_2` FOREIGN KEY (`ad_campaign_id`) REFERENCES `ad_campaigns` (`ad_campaign_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_bid_logs_ibfk_3` FOREIGN KEY (`target_user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=154 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='竞价记录表 — Phase 4 竞价排名';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_bid_logs`
--

LOCK TABLES `ad_bid_logs` WRITE;
/*!40000 ALTER TABLE `ad_bid_logs` DISABLE KEYS */;
INSERT INTO `ad_bid_logs` VALUES
(130,16,349,0,1,31,NULL,'2026-06-21 07:44:10'),
(131,16,349,0,1,32,NULL,'2026-06-21 07:59:08'),
(132,16,349,0,1,32,NULL,'2026-06-21 08:12:06'),
(133,16,349,0,1,32,NULL,'2026-06-21 08:14:48'),
(134,16,349,0,1,NULL,NULL,'2026-06-21 08:14:48'),
(135,16,349,0,1,NULL,NULL,'2026-06-21 08:15:13'),
(136,16,349,0,1,NULL,NULL,'2026-06-21 08:28:36'),
(137,16,349,0,1,NULL,NULL,'2026-06-21 08:42:22'),
(138,16,349,0,1,NULL,NULL,'2026-06-21 09:10:14'),
(139,16,349,0,1,NULL,NULL,'2026-06-21 09:10:14'),
(140,16,349,0,1,NULL,NULL,'2026-06-21 09:10:14'),
(141,16,349,0,1,NULL,NULL,'2026-06-21 09:10:21'),
(142,16,349,0,1,NULL,NULL,'2026-06-21 09:10:45'),
(143,16,349,0,1,NULL,NULL,'2026-06-21 11:26:11'),
(144,16,349,0,1,NULL,NULL,'2026-06-22 01:33:13'),
(145,16,349,0,1,NULL,NULL,'2026-06-22 01:42:26'),
(146,16,349,0,1,32,NULL,'2026-06-22 01:43:01'),
(147,16,349,0,1,NULL,NULL,'2026-06-22 02:11:14'),
(148,16,349,0,1,32,NULL,'2026-06-22 02:12:35'),
(149,16,349,0,1,NULL,NULL,'2026-06-22 02:34:51'),
(150,16,349,0,1,32,NULL,'2026-06-22 02:36:45'),
(151,16,349,0,1,NULL,NULL,'2026-06-22 02:48:17'),
(152,16,349,0,1,NULL,NULL,'2026-06-22 02:59:39'),
(153,16,349,0,1,32,NULL,'2026-06-22 03:00:13');
/*!40000 ALTER TABLE `ad_bid_logs` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:07
