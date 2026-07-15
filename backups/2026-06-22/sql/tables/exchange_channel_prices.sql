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
-- Table structure for table `exchange_channel_prices`
--

DROP TABLE IF EXISTS `exchange_channel_prices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `exchange_channel_prices` (
  `id` bigint NOT NULL AUTO_INCREMENT COMMENT '主键',
  `sku_id` bigint NOT NULL COMMENT '关联SKU',
  `cost_asset_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '支付的材料资产类型（如 red_shard）',
  `cost_amount` bigint NOT NULL COMMENT '需要的数量（如 10）',
  `original_amount` bigint DEFAULT NULL COMMENT '原价（划线价）',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否在兑换渠道上架',
  `publish_at` datetime DEFAULT NULL COMMENT '定时上架',
  `unpublish_at` datetime DEFAULT NULL COMMENT '定时下架',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_exchange_price_sku_asset` (`sku_id`,`cost_asset_code`),
  KEY `idx_exchange_price_enabled` (`is_enabled`),
  CONSTRAINT `exchange_channel_prices_ibfk_1` FOREIGN KEY (`sku_id`) REFERENCES `exchange_item_skus` (`sku_id`)
) ENGINE=InnoDB AUTO_INCREMENT=501 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换渠道定价（Layer 2，管理SKU在兑换商城的材料资产价格）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exchange_channel_prices`
--

LOCK TABLES `exchange_channel_prices` WRITE;
/*!40000 ALTER TABLE `exchange_channel_prices` DISABLE KEYS */;
INSERT INTO `exchange_channel_prices` VALUES
(6,6,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-21 02:26:22','2026-03-21 02:26:22'),
(7,7,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-21 02:26:22','2026-03-21 02:26:22'),
(116,116,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 05:58:50','2026-03-23 05:58:50'),
(118,118,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 05:59:06','2026-03-23 05:59:06'),
(120,120,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 06:00:28','2026-03-23 06:00:28'),
(122,122,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 06:00:45','2026-03-23 06:00:45'),
(124,124,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:05:09','2026-03-23 08:05:09'),
(126,126,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:05:25','2026-03-23 08:05:25'),
(128,128,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:06:33','2026-03-23 08:06:33'),
(130,130,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:06:49','2026-03-23 08:06:49'),
(132,132,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:09:42','2026-03-23 08:09:42'),
(134,134,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:09:58','2026-03-23 08:09:58'),
(136,136,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:14:03','2026-03-23 08:14:03'),
(137,137,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:14:10','2026-03-23 08:14:10'),
(139,139,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:14:26','2026-03-23 08:14:26'),
(141,141,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:14:40','2026-03-23 08:14:40'),
(143,143,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:16:29','2026-03-23 08:16:29'),
(145,145,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:17:50','2026-03-23 08:17:50'),
(146,146,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:17:50','2026-03-23 08:17:50'),
(148,148,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:18:00','2026-03-23 08:18:00'),
(151,151,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:18:17','2026-03-23 08:18:17'),
(154,154,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:18:30','2026-03-23 08:18:30'),
(157,157,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:19:11','2026-03-23 08:19:11'),
(160,160,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:19:38','2026-03-23 08:19:38'),
(163,163,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:21:26','2026-03-23 08:21:26'),
(165,165,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:24:13','2026-03-23 08:24:13'),
(166,166,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:24:14','2026-03-23 08:24:14'),
(167,167,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:25:01','2026-03-23 08:25:01'),
(168,168,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:25:02','2026-03-23 08:25:02'),
(170,170,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:25:29','2026-03-23 08:25:29'),
(172,172,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:30:08','2026-03-23 08:30:08'),
(173,173,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:30:08','2026-03-23 08:30:08'),
(175,175,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:30:30','2026-03-23 08:30:30'),
(177,177,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:31:31','2026-03-23 08:31:31'),
(179,179,'red_core_shard',100,NULL,1,NULL,NULL,'2026-03-23 08:31:40','2026-03-23 08:31:40'),
(184,184,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:35:04','2026-03-23 08:35:04'),
(187,187,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 08:36:28','2026-03-23 08:36:28'),
(192,192,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 09:24:17','2026-03-23 09:24:17'),
(199,199,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 09:35:03','2026-03-23 09:35:03'),
(204,204,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 09:35:41','2026-03-23 09:35:41'),
(209,209,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 09:38:14','2026-03-23 09:38:14'),
(212,212,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 09:40:43','2026-03-23 09:40:43'),
(217,217,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-23 09:44:01','2026-03-23 09:44:01'),
(226,226,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-24 02:05:20','2026-03-24 02:05:20'),
(231,231,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-24 02:10:48','2026-03-24 02:10:48'),
(236,236,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-24 02:18:53','2026-03-24 02:18:53'),
(239,239,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-24 04:31:29','2026-03-24 04:31:29'),
(242,242,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-24 04:33:15','2026-03-24 04:33:15'),
(253,253,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-24 04:38:01','2026-03-24 04:38:01'),
(260,260,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-24 04:43:59','2026-03-24 04:43:59'),
(265,265,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-24 04:44:13','2026-03-24 04:44:13'),
(270,270,'red_core_shard',10,NULL,1,NULL,NULL,'2026-03-24 05:01:04','2026-03-24 05:01:04'),
(281,281,'red_core_shard',10,NULL,1,NULL,NULL,'2026-04-10 06:47:41','2026-04-10 06:47:41'),
(284,284,'red_core_shard',10,NULL,1,NULL,NULL,'2026-04-22 11:10:42','2026-04-22 11:10:42'),
(291,291,'red_core_shard',10,NULL,1,NULL,NULL,'2026-04-22 11:28:23','2026-04-22 11:28:23'),
(294,294,'red_core_shard',10,NULL,1,NULL,NULL,'2026-04-22 11:30:56','2026-04-22 11:30:56'),
(301,301,'red_core_shard',10,NULL,1,NULL,NULL,'2026-04-23 00:04:20','2026-04-23 00:04:20'),
(342,342,'red_core_shard',10,NULL,1,NULL,NULL,'2026-06-03 01:58:06','2026-06-03 01:58:06'),
(346,346,'red_core_shard',10,NULL,1,NULL,NULL,'2026-06-03 02:01:54','2026-06-03 02:01:54'),
(402,402,'star_stone',1,NULL,1,NULL,NULL,'2026-06-11 02:33:15','2026-06-11 02:33:15'),
(407,401,'star_stone',500,NULL,1,NULL,NULL,'2026-06-12 00:14:55','2026-06-12 00:14:55'),
(410,403,'star_stone',50,NULL,1,NULL,NULL,'2026-06-12 00:21:30','2026-06-12 00:21:30'),
(496,499,'red_core_shard',100,NULL,1,NULL,NULL,'2026-06-21 04:40:02','2026-06-21 04:40:02'),
(497,500,'red_core_shard',100,NULL,1,NULL,NULL,'2026-06-21 04:40:02','2026-06-21 04:40:02');
/*!40000 ALTER TABLE `exchange_channel_prices` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-06-21 19:08:12
