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
-- Table structure for table `user_behavior_tracks`
--

DROP TABLE IF EXISTS `user_behavior_tracks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_behavior_tracks` (
  `user_behavior_track_id` bigint NOT NULL,
  `user_id` int NOT NULL COMMENT '用户ID',
  `behavior_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '行为类型（如 login, lottery_draw, consumption, exchange, purchase）',
  `behavior_action` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '行为动作（如 create, submit, complete, cancel）',
  `behavior_target` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '行为目标类型（如 lottery_campaign, product, item_instance）',
  `behavior_target_id` bigint DEFAULT NULL COMMENT '行为目标ID',
  `behavior_data` json DEFAULT NULL COMMENT '行为详情数据（如抽奖结果、消费金额、兑换商品等）',
  `behavior_result` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '行为结果（如 success, failed, pending）',
  `behavior_session_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '用户行为会话ID（关联同一次会话内的多个行为记录）',
  `device_info` json DEFAULT NULL COMMENT '设备信息（如 {"platform": "wechat", "device": "iPhone"}）',
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'IP地址',
  `behavior_time` datetime NOT NULL COMMENT '行为发生时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_behavior_track_id`),
  KEY `idx_behavior_tracks_user` (`user_id`),
  KEY `idx_behavior_tracks_type` (`behavior_type`),
  KEY `idx_behavior_tracks_time` (`behavior_time`),
  KEY `idx_behavior_tracks_user_type` (`user_id`,`behavior_type`),
  KEY `idx_behavior_tracks_session` (`behavior_session_id`),
  CONSTRAINT `user_behavior_tracks_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户行为轨迹表（记录用户关键行为，用于轨迹分析）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_behavior_tracks`
--

LOCK TABLES `user_behavior_tracks` WRITE;
/*!40000 ALTER TABLE `user_behavior_tracks` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_behavior_tracks` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:54
