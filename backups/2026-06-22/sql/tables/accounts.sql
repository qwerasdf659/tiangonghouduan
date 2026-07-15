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
) ENGINE=InnoDB AUTO_INCREMENT=633 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='账户表（统一用户账户与系统账户）';
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
(5,'user',31,NULL,'active','2025-12-16 01:32:16','2025-12-16 01:32:16'),
(6,'user',10201,NULL,'active','2025-12-16 02:55:38','2025-12-16 02:55:38'),
(7,'user',32,NULL,'active','2025-12-18 00:18:30','2025-12-18 00:18:30'),
(8,'user',10249,NULL,'active','2025-12-18 00:36:45','2025-12-18 00:36:45'),
(9,'user',10250,NULL,'active','2025-12-18 00:36:45','2025-12-18 00:36:45'),
(11,'user',10252,NULL,'active','2025-12-18 00:37:37','2025-12-18 00:37:37'),
(12,'system',NULL,'SYSTEM_RESERVE','active','2025-12-21 03:29:17','2025-12-21 03:29:17'),
(13,'user',9992,NULL,'active','2025-12-22 08:48:34','2025-12-22 08:48:34'),
(14,'user',10011,NULL,'active','2025-12-30 21:41:40','2025-12-30 21:41:40'),
(15,'system',NULL,'SYSTEM_CAMPAIGN_POOL','active','2026-01-04 04:38:58','2026-01-04 04:38:58'),
(16,'user',10845,NULL,'active','2026-01-06 21:46:25','2026-01-06 21:46:25'),
(17,'user',10996,NULL,'active','2026-01-09 08:59:58','2026-01-09 08:59:58'),
(18,'user',10997,NULL,'active','2026-01-09 08:59:58','2026-01-09 08:59:58'),
(19,'user',10998,NULL,'active','2026-01-09 08:59:58','2026-01-09 08:59:58'),
(20,'user',33,NULL,'active','2026-01-09 09:32:59','2026-01-09 09:32:59'),
(21,'user',34,NULL,'active','2026-01-09 09:33:02','2026-01-09 09:33:02'),
(22,'user',35,NULL,'active','2026-01-09 09:36:18','2026-01-09 09:36:18'),
(23,'user',36,NULL,'active','2026-01-09 09:38:51','2026-01-09 09:38:51'),
(24,'user',37,NULL,'active','2026-01-09 09:39:57','2026-01-09 09:39:57'),
(25,'user',11114,NULL,'active','2026-01-21 21:06:09','2026-01-21 21:06:09'),
(26,'user',135,NULL,'active','2026-01-21 21:15:45','2026-01-21 21:15:45'),
(27,'user',11131,NULL,'active','2026-01-23 04:39:22','2026-01-23 04:39:22'),
(28,'user',11132,NULL,'active','2026-01-23 18:03:49','2026-01-23 18:03:49'),
(37,'user',11172,NULL,'active','2026-01-28 20:25:29','2026-01-28 20:25:29'),
(46,'user',11187,NULL,'active','2026-01-28 20:31:51','2026-01-28 20:31:51'),
(47,'user',11188,NULL,'active','2026-01-28 20:32:05','2026-01-28 20:32:05'),
(48,'user',11189,NULL,'active','2026-01-28 20:33:32','2026-01-28 20:33:32'),
(49,'user',11190,NULL,'active','2026-01-28 20:45:31','2026-01-28 20:45:31'),
(54,'user',11198,NULL,'active','2026-01-28 20:49:49','2026-01-28 20:49:49'),
(59,'user',11206,NULL,'active','2026-01-28 21:01:01','2026-01-28 21:01:01'),
(68,'user',11221,NULL,'active','2026-01-28 21:01:50','2026-01-28 21:01:50'),
(77,'user',11236,NULL,'active','2026-01-28 21:24:07','2026-01-28 21:24:07'),
(78,'user',11237,NULL,'active','2026-01-28 22:55:01','2026-01-28 22:55:01'),
(83,'user',11245,NULL,'active','2026-01-28 22:58:36','2026-01-28 22:58:36'),
(88,'user',11254,NULL,'active','2026-01-28 23:17:08','2026-01-28 23:17:08'),
(97,'user',11270,NULL,'active','2026-01-29 00:39:31','2026-01-29 00:39:31'),
(98,'user',11271,NULL,'active','2026-01-29 00:39:34','2026-01-29 00:39:34'),
(103,'user',11279,NULL,'active','2026-01-29 00:55:34','2026-01-29 00:55:34'),
(112,'user',11295,NULL,'active','2026-01-29 01:08:07','2026-01-29 01:08:07'),
(113,'user',11296,NULL,'active','2026-01-29 06:03:41','2026-01-29 06:03:41'),
(122,'user',11333,NULL,'active','2026-01-29 07:24:35','2026-01-29 07:24:35'),
(131,'user',11373,NULL,'active','2026-01-30 20:40:57','2026-01-30 20:40:57'),
(132,'user',11375,NULL,'active','2026-01-30 21:52:51','2026-01-30 21:52:51'),
(133,'user',11377,NULL,'active','2026-01-31 06:01:40','2026-01-31 06:01:40'),
(134,'user',11379,NULL,'active','2026-02-01 20:23:40','2026-02-01 20:23:40'),
(139,'user',11393,NULL,'active','2026-02-02 04:35:34','2026-02-02 04:35:34'),
(140,'user',11394,NULL,'active','2026-02-02 04:38:04','2026-02-02 04:38:04'),
(154,'user',11434,NULL,'active','2026-02-04 04:45:37','2026-02-04 04:45:37'),
(155,'user',11435,NULL,'active','2026-02-04 04:45:49','2026-02-04 04:45:49'),
(164,'user',11460,NULL,'active','2026-02-04 09:03:39','2026-02-04 09:03:39'),
(173,'user',11486,NULL,'active','2026-02-05 18:56:54','2026-02-05 18:56:54'),
(174,'user',11493,NULL,'active','2026-02-15 02:02:39','2026-02-15 02:02:39'),
(175,'user',10001,NULL,'active','2026-02-18 23:39:33','2026-02-18 23:39:33'),
(176,'user',11494,NULL,'active','2026-02-18 23:39:33','2026-02-18 23:39:33'),
(181,'user',11508,NULL,'active','2026-02-19 00:55:44','2026-02-19 00:55:44'),
(186,'user',11522,NULL,'active','2026-02-20 18:14:43','2026-02-20 18:14:43'),
(187,'user',11524,NULL,'active','2026-02-20 21:45:49','2026-02-20 21:45:49'),
(192,'user',11538,NULL,'active','2026-02-21 01:50:42','2026-02-21 01:50:42'),
(197,'user',11552,NULL,'active','2026-02-21 20:06:31','2026-02-21 20:06:31'),
(230,'user',11660,NULL,'active','2026-02-23 17:18:02','2026-02-23 17:18:02'),
(239,'system',NULL,'SYSTEM_EXCHANGE','disabled','2026-02-24 01:47:02','2026-04-06 04:30:00'),
(248,'user',11710,NULL,'active','2026-02-24 03:41:59','2026-02-24 03:41:59'),
(265,'user',11760,NULL,'active','2026-03-02 09:36:52','2026-03-02 09:36:52'),
(266,'user',11762,NULL,'active','2026-03-03 03:58:52','2026-03-03 03:58:52'),
(303,'user',11882,NULL,'active','2026-03-06 15:09:24','2026-03-06 15:09:24'),
(304,'user',11884,NULL,'active','2026-03-06 15:11:36','2026-03-06 15:11:36'),
(309,'user',11898,NULL,'active','2026-03-06 16:01:50','2026-03-06 16:01:50'),
(310,'user',11900,NULL,'active','2026-03-06 17:22:20','2026-03-06 17:22:20'),
(319,'user',11926,NULL,'active','2026-03-09 01:38:37','2026-03-09 01:38:37'),
(320,'user',11927,NULL,'active','2026-03-09 01:38:54','2026-03-09 01:38:54'),
(325,'user',11940,NULL,'active','2026-03-09 05:12:00','2026-03-09 05:12:00'),
(326,'user',11941,NULL,'active','2026-03-10 06:51:45','2026-03-10 06:51:45'),
(327,'user',11942,NULL,'active','2026-03-10 07:20:52','2026-03-10 07:20:52'),
(332,'user',11955,NULL,'active','2026-03-10 09:11:55','2026-03-10 09:11:55'),
(333,'user',11957,NULL,'active','2026-03-14 04:50:11','2026-03-14 04:50:11'),
(342,'user',11983,NULL,'active','2026-03-14 05:19:16','2026-03-14 05:19:16'),
(363,'user',12050,NULL,'active','2026-03-17 08:41:05','2026-03-17 08:41:05'),
(368,'user',12069,NULL,'active','2026-03-17 08:54:39','2026-03-17 08:54:39'),
(377,'user',12090,NULL,'active','2026-03-21 00:53:02','2026-03-21 00:53:02'),
(394,'user',12141,NULL,'active','2026-03-21 07:30:24','2026-03-21 07:30:24'),
(399,'user',12160,NULL,'active','2026-03-21 08:32:57','2026-03-21 08:32:57'),
(404,'user',12174,NULL,'active','2026-03-22 07:14:02','2026-03-22 07:14:02'),
(409,'user',12188,NULL,'active','2026-03-23 00:02:52','2026-03-23 00:02:52'),
(410,'user',12189,NULL,'active','2026-03-23 00:03:23','2026-03-23 00:03:23'),
(419,'user',12216,NULL,'active','2026-03-23 05:59:13','2026-03-23 05:59:13'),
(420,'user',12217,NULL,'active','2026-03-23 06:00:52','2026-03-23 06:00:52'),
(421,'user',12218,NULL,'active','2026-03-23 08:05:31','2026-03-23 08:05:31'),
(422,'user',12219,NULL,'active','2026-03-23 08:06:54','2026-03-23 08:06:54'),
(423,'user',12220,NULL,'active','2026-03-23 08:10:04','2026-03-23 08:10:04'),
(428,'user',12233,NULL,'active','2026-03-23 08:18:44','2026-03-23 08:18:44'),
(433,'user',12246,NULL,'active','2026-03-23 08:23:26','2026-03-23 08:23:26'),
(434,'user',12247,NULL,'active','2026-03-23 08:25:51','2026-03-23 08:25:51'),
(435,'user',12248,NULL,'active','2026-03-23 08:26:35','2026-03-23 08:26:35'),
(436,'user',12249,NULL,'active','2026-03-23 08:29:56','2026-03-23 08:29:56'),
(437,'user',12250,NULL,'active','2026-03-23 08:30:35','2026-03-23 08:30:35'),
(442,'user',12263,NULL,'active','2026-03-23 08:36:33','2026-03-23 08:36:33'),
(443,'user',12265,NULL,'active','2026-03-23 08:43:00','2026-03-23 08:43:00'),
(444,'user',12266,NULL,'active','2026-03-23 09:24:20','2026-03-23 09:24:20'),
(445,'user',12267,NULL,'active','2026-03-23 09:35:48','2026-03-23 09:35:48'),
(446,'user',12268,NULL,'active','2026-03-23 09:36:13','2026-03-23 09:36:13'),
(451,'user',12282,NULL,'active','2026-03-23 09:40:41','2026-03-23 09:40:41'),
(452,'user',12283,NULL,'active','2026-03-23 09:40:48','2026-03-23 09:40:48'),
(453,'user',12284,NULL,'active','2026-03-23 09:45:04','2026-03-23 09:45:04'),
(458,'user',12297,NULL,'active','2026-03-24 02:05:26','2026-03-24 02:05:26'),
(463,'user',12310,NULL,'active','2026-03-24 02:16:57','2026-03-24 02:16:57'),
(464,'user',12311,NULL,'active','2026-03-24 02:19:27','2026-03-24 02:19:27'),
(473,'user',12338,NULL,'active','2026-03-24 04:38:44','2026-03-24 04:38:44'),
(478,'user',12352,NULL,'active','2026-03-24 04:44:34','2026-03-24 04:44:34'),
(479,'user',12353,NULL,'active','2026-03-24 04:44:47','2026-03-24 04:44:47'),
(488,'user',12380,NULL,'active','2026-03-24 05:16:30','2026-03-24 05:16:30'),
(497,'user',12416,NULL,'active','2026-04-10 06:53:28','2026-04-10 06:53:28'),
(498,'user',12418,NULL,'active','2026-04-20 07:59:12','2026-04-20 07:59:12'),
(499,'user',12419,NULL,'active','2026-04-22 11:38:49','2026-04-22 11:38:49'),
(504,'user',12433,NULL,'active','2026-04-22 11:41:27','2026-04-22 11:41:27'),
(509,'user',12447,NULL,'active','2026-04-23 00:04:38','2026-04-23 00:04:38'),
(514,'user',12461,NULL,'active','2026-04-23 02:52:09','2026-04-23 02:52:09'),
(519,'user',12475,NULL,'active','2026-04-23 02:55:53','2026-04-23 02:55:53'),
(524,'user',12489,NULL,'active','2026-04-23 02:59:25','2026-04-23 02:59:25'),
(529,'user',12503,NULL,'active','2026-04-24 03:36:11','2026-04-24 03:36:11'),
(534,'user',12517,NULL,'active','2026-04-24 07:40:44','2026-04-24 07:40:44'),
(543,'user',12548,NULL,'active','2026-04-25 05:41:33','2026-04-25 05:41:33'),
(552,'user',12569,NULL,'active','2026-04-25 06:32:43','2026-04-25 06:32:43'),
(557,'user',12583,NULL,'active','2026-04-25 06:42:20','2026-04-25 06:42:20'),
(562,'user',12597,NULL,'active','2026-04-27 08:49:07','2026-04-27 08:49:07'),
(563,'user',12598,NULL,'active','2026-04-28 17:47:38','2026-04-28 17:47:38'),
(564,'user',12599,NULL,'active','2026-05-14 05:35:31','2026-05-14 05:35:31'),
(565,'user',12600,NULL,'active','2026-05-26 03:48:01','2026-05-26 03:48:01'),
(574,'user',12626,NULL,'active','2026-06-03 00:28:45','2026-06-03 00:28:45'),
(583,'user',12652,NULL,'active','2026-06-03 01:40:44','2026-06-03 01:40:44'),
(588,'user',12668,NULL,'active','2026-06-03 03:07:51','2026-06-03 03:07:51'),
(597,'user',12694,NULL,'active','2026-06-03 03:43:32','2026-06-03 03:43:32'),
(602,'user',12707,NULL,'active','2026-06-05 05:36:08','2026-06-05 05:36:08'),
(603,'user',12708,NULL,'active','2026-06-05 11:09:51','2026-06-05 11:09:51'),
(620,'user',12767,NULL,'active','2026-06-14 23:19:36','2026-06-14 23:19:36');
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

-- Dump completed on 2026-06-21 19:08:07
