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
-- Table structure for table `user_growth_levels`
--

DROP TABLE IF EXISTS `user_growth_levels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_growth_levels` (
  `user_growth_level_id` int NOT NULL AUTO_INCREMENT COMMENT '成长等级定义主键',
  `level_key` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '成长等级业务码（如 bronze/silver/gold/diamond），全局稳定标识',
  `level_name` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '成长等级中文名（如 青铜/白银/黄金/钻石），用于展示',
  `min_history_points` int NOT NULL DEFAULT '0' COMMENT '达到该等级所需的累计积分下限（取 users.history_total_points 比对，含本值）',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '等级排序（由低到高，0 最低）',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '等级状态：active-启用，inactive-停用',
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '等级说明（含会员权益公示口径）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`user_growth_level_id`),
  UNIQUE KEY `uk_user_growth_levels_level_key` (`level_key`),
  KEY `idx_user_growth_levels_status_points` (`status`,`min_history_points`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户成长等级定义表（独立体系，累计积分→等级；抽奖等多功能只读复用）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_growth_levels`
--

LOCK TABLES `user_growth_levels` WRITE;
/*!40000 ALTER TABLE `user_growth_levels` DISABLE KEYS */;
INSERT INTO `user_growth_levels` VALUES
(1,'bronze','青铜',0,0,'active','成长等级最低档（累计积分 0 起）；阈值为起步占位值，需运营确认','2026-06-05 02:06:53','2026-06-05 02:06:53'),
(2,'silver','白银',100000,1,'active','⚠️ 占位阈值 100000，需运营按真实业务规则确认','2026-06-05 02:06:53','2026-06-05 02:06:53'),
(3,'gold','黄金',500000,2,'active','⚠️ 占位阈值 500000，需运营按真实业务规则确认','2026-06-05 02:06:53','2026-06-05 02:06:53'),
(4,'diamond','钻石',2000000,3,'active','⚠️ 占位阈值 2000000，需运营按真实业务规则确认','2026-06-05 02:06:53','2026-06-05 02:06:53');
/*!40000 ALTER TABLE `user_growth_levels` ENABLE KEYS */;
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
