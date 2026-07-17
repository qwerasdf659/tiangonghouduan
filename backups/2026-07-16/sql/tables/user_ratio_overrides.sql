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
-- Table structure for table `user_ratio_overrides`
--

DROP TABLE IF EXISTS `user_ratio_overrides`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_ratio_overrides` (
  `user_ratio_override_id` int NOT NULL AUTO_INCREMENT COMMENT '覆盖记录主键',
  `user_id` int NOT NULL COMMENT '目标用户ID',
  `ratio_key` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '比例类型：points_award_ratio / budget_allocation_ratio / diamond_quota_ratio',
  `ratio_value` decimal(5,2) NOT NULL COMMENT '覆盖比例值（如 2.0 表示消费金额×2.0）',
  `reason` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '覆盖原因（如：双11活动奖励、投诉补偿、VIP关怀）',
  `effective_start` datetime DEFAULT NULL COMMENT '生效开始时间（NULL=立即生效）',
  `effective_end` datetime DEFAULT NULL COMMENT '生效结束时间（NULL=永久生效）',
  `created_by` int DEFAULT NULL COMMENT '操作管理员ID',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_ratio_override_id`),
  UNIQUE KEY `uk_user_ratio` (`user_id`,`ratio_key`),
  KEY `created_by` (`created_by`),
  KEY `idx_user_ratio_user_id` (`user_id`),
  KEY `idx_user_ratio_effective_end` (`effective_end`),
  CONSTRAINT `user_ratio_overrides_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_ratio_overrides_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户消费比例覆盖表（三个消费比例均支持全局+个人两层配置）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_ratio_overrides`
--

LOCK TABLES `user_ratio_overrides` WRITE;
/*!40000 ALTER TABLE `user_ratio_overrides` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_ratio_overrides` ENABLE KEYS */;
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
