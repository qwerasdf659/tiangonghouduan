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
-- Table structure for table `user_risk_profiles`
--

DROP TABLE IF EXISTS `user_risk_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_risk_profiles` (
  `user_risk_profile_id` int unsigned NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT NULL COMMENT '用户ID（NULL 表示等级默认配置）',
  `user_level` enum('normal','vip','merchant') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'normal' COMMENT '用户等级（normal/vip/merchant）',
  `config_type` enum('user','level') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'level' COMMENT '配置类型（user-用户个人配置，level-等级默认配置）',
  `thresholds` json NOT NULL COMMENT 'JSON格式的风控阈值配置（按币种分组）',
  `is_frozen` tinyint(1) NOT NULL DEFAULT '0' COMMENT '账户是否冻结（true-冻结，禁止所有交易）',
  `frozen_reason` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '冻结原因（is_frozen=true 时必填）',
  `frozen_at` datetime DEFAULT NULL COMMENT '冻结时间',
  `frozen_by` int DEFAULT NULL COMMENT '冻结操作人ID（管理员）',
  `remarks` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '配置备注',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`user_risk_profile_id`),
  UNIQUE KEY `uk_user_risk_profiles_user_config` (`user_id`,`config_type`),
  KEY `frozen_by` (`frozen_by`),
  KEY `idx_user_risk_profiles_user_id` (`user_id`),
  KEY `idx_user_risk_profiles_level_type` (`user_level`,`config_type`),
  KEY `idx_user_risk_profiles_is_frozen` (`is_frozen`),
  CONSTRAINT `user_risk_profiles_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `user_risk_profiles_ibfk_2` FOREIGN KEY (`frozen_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户风控配置表：存储用户等级默认配置和个人自定义配置';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_risk_profiles`
--

LOCK TABLES `user_risk_profiles` WRITE;
/*!40000 ALTER TABLE `user_risk_profiles` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_risk_profiles` ENABLE KEYS */;
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
