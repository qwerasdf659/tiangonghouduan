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
-- Table structure for table `user_ad_tags`
--

DROP TABLE IF EXISTS `user_ad_tags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_ad_tags` (
  `user_ad_tag_id` bigint NOT NULL AUTO_INCREMENT COMMENT '用户标签主键',
  `user_id` int NOT NULL COMMENT '用户 ID',
  `tag_key` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标签键（如 lottery_active_7d / diamond_balance / new_user）',
  `tag_value` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '标签值（如 true / false / 数字字符串）',
  `calculated_at` datetime NOT NULL COMMENT '标签计算时间（凌晨3点定时任务写入）',
  PRIMARY KEY (`user_ad_tag_id`),
  UNIQUE KEY `uk_uat_user_tag` (`user_id`,`tag_key`),
  KEY `idx_uat_tag` (`tag_key`,`tag_value`),
  CONSTRAINT `user_ad_tags_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户行为标签表 — Phase 5 DMP 人群定向';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_ad_tags`
--

LOCK TABLES `user_ad_tags` WRITE;
/*!40000 ALTER TABLE `user_ad_tags` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_ad_tags` ENABLE KEYS */;
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
