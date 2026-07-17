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
-- Table structure for table `accounts`
--

DROP TABLE IF EXISTS `accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `accounts` (
  `account_id` bigint NOT NULL AUTO_INCREMENT COMMENT '账户ID（主键，自增）',
  `account_type` enum('user','system') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '账户类型（Account Type）：user-用户账户（关联真实用户，user_id必填）| system-系统账户（平台运营账户，system_code必填）',
  `user_id` int DEFAULT NULL COMMENT '用户ID（User ID）：当 account_type=user 时必填且唯一；当 account_type=system 时为NULL；外键关联 users.user_id',
  `system_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '系统账户代码（System Code）：当 account_type=system 时必填且唯一；预定义系统账户：SYSTEM_PLATFORM_FEE（平台手续费）、SYSTEM_MINT（系统发放）、SYSTEM_BURN（系统销毁）、SYSTEM_ESCROW（托管/争议）',
  `status` enum('active','disabled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '账户状态（Account Status）：active-活跃（可正常交易）| disabled-禁用（冻结状态，禁止任何交易）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`account_id`),
  UNIQUE KEY `uk_accounts_user_id` (`user_id`),
  UNIQUE KEY `uk_accounts_system_code` (`system_code`),
  KEY `idx_accounts_type_status` (`account_type`,`status`),
  CONSTRAINT `accounts_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=678 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账户表（统一用户账户与系统账户）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `accounts`
--

LOCK TABLES `accounts` WRITE;
/*!40000 ALTER TABLE `accounts` DISABLE KEYS */;
INSERT INTO `accounts` VALUES
(1,'system',NULL,'SYSTEM_PLATFORM_FEE','active','2025-12-16 00:36:41','2025-12-16 00:36:41'),
(2,'system',NULL,'SYSTEM_MINT','active','2025-12-16 00:36:41','2025-12-16 00:36:41'),
(3,'system',NULL,'SYSTEM_BURN','active','2025-12-16 00:36:41','2025-12-16 00:36:41'),
(4,'system',NULL,'SYSTEM_ESCROW','active','2025-12-16 00:36:41','2025-12-16 00:36:41'),
(7,'user',32,NULL,'active','2025-12-18 00:18:30','2025-12-18 00:18:30'),
(12,'system',NULL,'SYSTEM_RESERVE','active','2025-12-21 03:29:17','2025-12-21 03:29:17'),
(15,'system',NULL,'SYSTEM_CAMPAIGN_POOL','active','2026-01-04 04:38:58','2026-01-04 04:38:58'),
(239,'system',NULL,'SYSTEM_EXCHANGE','disabled','2026-02-24 01:47:02','2026-04-06 04:30:00'),
(637,'user',12796,NULL,'active','2026-06-22 07:51:03','2026-06-22 07:51:03'),
(638,'user',12797,NULL,'active','2026-06-22 22:30:35','2026-06-22 22:30:35'),
(639,'user',12798,NULL,'active','2026-06-25 00:36:39','2026-06-25 00:36:39'),
(640,'user',12799,NULL,'active','2026-06-25 00:56:43','2026-06-25 00:56:43'),
(641,'user',12800,NULL,'active','2026-06-26 00:18:41','2026-06-26 00:18:41'),
(642,'user',12801,NULL,'active','2026-06-26 06:59:18','2026-06-26 06:59:18'),
(643,'user',12802,NULL,'active','2026-06-26 07:01:13','2026-06-26 07:01:13'),
(644,'user',12803,NULL,'active','2026-06-27 08:02:17','2026-06-27 08:02:17'),
(645,'user',12804,NULL,'active','2026-06-28 03:05:45','2026-06-28 03:05:45'),
(646,'user',12805,NULL,'active','2026-06-28 07:59:35','2026-06-28 07:59:35'),
(647,'user',12806,NULL,'active','2026-06-28 23:58:10','2026-06-28 23:58:10'),
(648,'user',12807,NULL,'active','2026-07-06 03:35:00','2026-07-06 03:35:00'),
(653,'user',11021,NULL,'active','2026-07-11 01:44:20','2026-07-11 01:44:20'),
(654,'user',12823,NULL,'active','2026-07-11 08:27:43','2026-07-11 08:27:43'),
(655,'user',12825,NULL,'active','2026-07-11 08:51:05','2026-07-11 08:51:05'),
(656,'user',12841,NULL,'active','2026-07-11 09:07:07','2026-07-11 09:07:07'),
(661,'user',12850,NULL,'active','2026-07-11 09:40:26','2026-07-11 09:40:26'),
(666,'user',12859,NULL,'active','2026-07-11 10:00:01','2026-07-11 10:00:01'),
(671,'user',12873,NULL,'active','2026-07-12 00:30:14','2026-07-12 00:30:14'),
(672,'user',12824,NULL,'active','2026-07-12 03:00:01','2026-07-12 03:00:01'),
(673,'user',12874,NULL,'active','2026-07-15 21:27:20','2026-07-15 21:27:20');
/*!40000 ALTER TABLE `accounts` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:47
