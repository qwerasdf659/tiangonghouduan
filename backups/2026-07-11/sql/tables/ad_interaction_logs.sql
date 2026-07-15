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
) ENGINE=InnoDB AUTO_INCREMENT=230 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通用内容交互日志表 — 统一记录弹窗/轮播/公告/广告的展示、点击、关闭等交互事件';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_interaction_logs`
--

LOCK TABLES `ad_interaction_logs` WRITE;
/*!40000 ALTER TABLE `ad_interaction_logs` DISABLE KEYS */;
INSERT INTO `ad_interaction_logs` VALUES
(122,358,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 13:12:39'),
(123,358,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 13:20:07'),
(124,358,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 13:40:15'),
(125,358,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 16:25:23'),
(126,358,12796,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 20:37:51'),
(127,358,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 20:38:03'),
(128,358,12797,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 22:30:36'),
(129,358,12797,16,'click','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 22:31:28'),
(130,358,12797,16,'click','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 22:31:30'),
(131,358,12797,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 22:31:38'),
(132,358,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 22:31:55'),
(133,358,12797,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 22:37:08'),
(134,358,12797,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-22 22:37:17'),
(135,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-25 08:39:28'),
(136,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-25 09:48:51'),
(137,359,12799,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-25 09:49:15'),
(138,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 00:01:52'),
(139,359,12798,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 00:04:08'),
(140,359,12797,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 00:04:55'),
(141,359,12796,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 00:12:01'),
(142,359,12796,16,'click','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 00:17:50'),
(143,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 00:17:54'),
(144,359,12800,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 00:18:41'),
(145,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 00:20:15'),
(146,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 06:17:30'),
(147,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 06:21:00'),
(148,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 06:21:25'),
(149,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 06:26:20'),
(150,359,12801,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 06:59:19'),
(151,359,12801,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 07:00:06'),
(152,359,12802,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 07:01:13'),
(153,359,12798,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 07:02:42'),
(154,359,12798,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 07:04:34'),
(155,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 07:06:46'),
(156,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 11:29:17'),
(157,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 16:32:14'),
(158,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 16:32:54'),
(159,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 16:34:57'),
(160,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 16:35:27'),
(161,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 16:36:00'),
(162,359,12796,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 16:36:08'),
(163,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-26 16:37:21'),
(164,359,12802,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 06:27:13'),
(165,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 06:27:25'),
(166,359,12796,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 06:27:44'),
(167,359,12801,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 06:28:26'),
(168,359,12798,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 06:29:33'),
(169,359,12796,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 06:31:51'),
(170,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 06:32:08'),
(171,359,12796,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 07:29:13'),
(172,359,12796,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 07:30:01'),
(173,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 07:30:45'),
(174,359,12803,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 08:02:18'),
(175,359,12803,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 08:03:19'),
(176,359,12803,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 08:05:22'),
(177,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 23:56:37'),
(178,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-27 23:56:51'),
(179,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 01:52:37'),
(180,359,12803,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 01:54:12'),
(181,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 02:35:07'),
(182,359,12804,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 03:05:46'),
(183,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 03:05:52'),
(184,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 03:05:55'),
(185,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 03:42:50'),
(186,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 04:46:15'),
(187,359,32,16,'click','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 04:46:19'),
(188,359,32,16,'click','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 04:46:19'),
(189,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 04:47:21'),
(190,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 04:48:01'),
(191,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 07:37:22'),
(192,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 07:57:02'),
(193,359,12805,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 07:59:36'),
(194,359,12805,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 08:48:15'),
(195,359,12803,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 09:00:18'),
(196,359,12805,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 09:00:31'),
(197,359,12805,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 14:38:41'),
(198,359,12805,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 20:22:57'),
(199,359,12805,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 20:35:32'),
(200,359,12805,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 20:35:54'),
(201,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 20:45:19'),
(202,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 20:46:03'),
(203,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 20:54:08'),
(204,359,12805,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 20:54:30'),
(205,359,12805,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 21:03:52'),
(206,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 21:05:50'),
(207,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 21:11:30'),
(208,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 22:11:02'),
(209,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 22:33:53'),
(210,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 22:49:16'),
(211,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 22:57:23'),
(212,359,12805,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 23:46:06'),
(213,359,12805,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 23:54:48'),
(214,359,12806,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 23:58:11'),
(215,359,12803,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-28 23:58:28'),
(216,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-29 00:16:30'),
(217,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-29 01:13:32'),
(218,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-29 01:24:21'),
(219,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-29 02:41:13'),
(220,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-29 03:11:55'),
(221,359,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-06-29 06:07:52'),
(222,366,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-07-07 22:03:29'),
(223,366,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-07-08 04:27:28'),
(224,366,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-07-08 04:57:52'),
(225,366,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-07-08 06:26:27'),
(226,366,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-07-08 06:27:11'),
(227,366,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-07-08 22:45:55'),
(228,366,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-07-08 22:46:31'),
(229,366,32,16,'impression','{\"position\": \"lottery\", \"slot_type\": \"top_banner\"}','2026-07-09 02:42:29');
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

-- Dump completed on 2026-07-10 18:10:55
