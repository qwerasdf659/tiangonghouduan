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
-- Table structure for table `ad_interaction_logs`
--

DROP TABLE IF EXISTS `ad_interaction_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_interaction_logs` (
  `ad_interaction_log_id` bigint NOT NULL AUTO_INCREMENT COMMENT '交互日志主键ID',
  `ad_campaign_id` int NOT NULL COMMENT '所属广告计划ID',
  `user_id` int NOT NULL COMMENT '用户ID',
  `ad_slot_id` int DEFAULT NULL COMMENT '广告位ID',
  `interaction_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '交互类型：impression=展示 / click=点击 / close=关闭 / swipe=滑动',
  `extra_data` json DEFAULT NULL COMMENT '异构扩展数据（如 show_duration_ms/close_method/is_manual_swipe 等）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`ad_interaction_log_id`),
  KEY `ad_slot_id` (`ad_slot_id`),
  KEY `idx_ail_campaign` (`ad_campaign_id`),
  KEY `idx_ail_user` (`user_id`),
  KEY `idx_ail_type` (`interaction_type`),
  KEY `idx_ail_created` (`created_at`),
  CONSTRAINT `ad_interaction_logs_ibfk_1` FOREIGN KEY (`ad_campaign_id`) REFERENCES `ad_campaigns` (`ad_campaign_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ad_interaction_logs_ibfk_2` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ad_interaction_logs_ibfk_3` FOREIGN KEY (`ad_slot_id`) REFERENCES `ad_slots` (`ad_slot_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=122 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通用内容交互日志表 — 统一记录弹窗/轮播/公告/广告的展示、点击、关闭等交互事件';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_interaction_logs`
--

LOCK TABLES `ad_interaction_logs` WRITE;
/*!40000 ALTER TABLE `ad_interaction_logs` DISABLE KEYS */;
INSERT INTO `ad_interaction_logs` VALUES
(117,349,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-21 07:59:08'),
(118,349,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 01:43:01'),
(119,349,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 02:12:35'),
(120,349,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 02:36:45'),
(121,349,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 03:00:13');
/*!40000 ALTER TABLE `ad_interaction_logs` ENABLE KEYS */;
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
