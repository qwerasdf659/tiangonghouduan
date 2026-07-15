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
-- Table structure for table `exchange_item_skus`
--

DROP TABLE IF EXISTS `exchange_item_skus`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `exchange_item_skus` (
  `sku_id` bigint NOT NULL AUTO_INCREMENT COMMENT 'SKU ID',
  `exchange_item_id` bigint NOT NULL,
  `sku_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '唯一编码（如 dragon_gem_blue_L）',
  `stock` int NOT NULL DEFAULT '0' COMMENT '统一库存（所有渠道共享）',
  `sold_count` int NOT NULL DEFAULT '0' COMMENT '已售数量',
  `cost_price` decimal(10,2) DEFAULT NULL COMMENT '成本价（人民币）',
  `status` enum('active','inactive') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active' COMMENT '状态',
  `image_id` bigint unsigned DEFAULT NULL COMMENT 'SKU专属图片',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`sku_id`),
  UNIQUE KEY `sku_code` (`sku_code`),
  KEY `idx_product_skus_product_status` (`exchange_item_id`,`status`),
  KEY `idx_product_skus_status_stock` (`status`,`stock`),
  KEY `exchange_item_skus_ibfk_2` (`image_id`),
  CONSTRAINT `exchange_item_skus_ibfk_1` FOREIGN KEY (`exchange_item_id`) REFERENCES `exchange_items` (`exchange_item_id`),
  CONSTRAINT `exchange_item_skus_ibfk_2` FOREIGN KEY (`image_id`) REFERENCES `media_files` (`media_id`)
) ENGINE=InnoDB AUTO_INCREMENT=504 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='统一SKU（EAV 商品中心 Layer 1，替代exchange_item_skus）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exchange_item_skus`
--

LOCK TABLES `exchange_item_skus` WRITE;
/*!40000 ALTER TABLE `exchange_item_skus` DISABLE KEYS */;
INSERT INTO `exchange_item_skus` VALUES
(6,6,'legacy_234_1',31,19,NULL,'active',NULL,0,'2026-03-17 06:36:34','2026-06-15 01:57:08'),
(7,7,'legacy_235_2',297,3,NULL,'active',NULL,0,'2026-03-17 06:36:34','2026-03-23 01:43:51'),
(116,248,'IDEM_TEST_1774216730840',945,55,50.00,'active',NULL,0,'2026-03-23 05:58:50','2026-06-03 03:36:13'),
(118,250,'default_250',50,0,5.00,'inactive',NULL,0,'2026-03-23 05:59:06','2026-03-23 05:59:06'),
(120,252,'IDEM_TEST_1774216828850',998,2,50.00,'active',NULL,0,'2026-03-23 06:00:28','2026-03-23 06:00:34'),
(122,254,'default_254',50,0,5.00,'inactive',NULL,0,'2026-03-23 06:00:45','2026-03-23 06:00:45'),
(124,256,'IDEM_TEST_1774224309302',998,2,50.00,'active',NULL,0,'2026-03-23 08:05:09','2026-03-23 08:05:15'),
(126,258,'default_258',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:05:25','2026-03-23 08:05:25'),
(128,260,'IDEM_TEST_1774224393607',998,2,50.00,'active',NULL,0,'2026-03-23 08:06:33','2026-03-23 08:06:39'),
(130,262,'default_262',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:06:49','2026-03-23 08:06:49'),
(132,264,'IDEM_TEST_1774224582834',998,2,50.00,'active',NULL,0,'2026-03-23 08:09:42','2026-03-23 08:09:48'),
(134,266,'default_266',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:09:58','2026-03-23 08:09:58'),
(136,268,'IDEM_TEST_1774224843840',998,2,50.00,'active',NULL,0,'2026-03-23 08:14:03','2026-03-23 08:14:09'),
(137,269,'IDEM_TEST_1774224850290',998,2,50.00,'active',NULL,0,'2026-03-23 08:14:10','2026-03-23 08:14:16'),
(139,271,'default_271',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:14:26','2026-03-23 08:14:26'),
(141,273,'IDEM_TEST_1774224880108',998,2,50.00,'active',NULL,0,'2026-03-23 08:14:40','2026-03-23 08:14:46'),
(143,275,'default_275',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:16:29','2026-03-23 08:16:29'),
(145,277,'IDEM_TEST_1774225070150',993,7,50.00,'active',NULL,0,'2026-03-23 08:17:50','2026-03-23 08:17:51'),
(146,278,'CONFLICT_TEST_1774225070977',1000,0,50.00,'active',NULL,0,'2026-03-23 08:17:50','2026-03-23 08:17:50'),
(148,280,'default_280',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:18:00','2026-03-23 08:18:00'),
(151,283,'default_283',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:18:17','2026-03-23 08:18:17'),
(154,286,'default_286',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:18:30','2026-03-23 08:18:30'),
(157,289,'default_289',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:19:11','2026-03-23 08:19:11'),
(160,292,'default_292',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:19:38','2026-03-23 08:19:38'),
(163,295,'default_295',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:21:26','2026-03-23 08:21:26'),
(165,297,'IDEM_TEST_1774225453305',993,7,50.00,'active',NULL,0,'2026-03-23 08:24:13','2026-03-23 08:24:15'),
(166,298,'CONFLICT_TEST_1774225454634',1000,0,50.00,'active',NULL,0,'2026-03-23 08:24:14','2026-03-23 08:24:14'),
(167,299,'IDEM_TEST_1774225501302',993,7,50.00,'active',NULL,0,'2026-03-23 08:25:01','2026-03-23 08:25:02'),
(168,300,'CONFLICT_TEST_1774225502245',1000,0,50.00,'active',NULL,0,'2026-03-23 08:25:02','2026-03-23 08:25:02'),
(170,302,'default_302',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:25:29','2026-03-23 08:25:29'),
(172,304,'IDEM_TEST_1774225808032',993,7,50.00,'active',NULL,0,'2026-03-23 08:30:08','2026-03-23 08:30:09'),
(173,305,'CONFLICT_TEST_1774225808970',1000,0,50.00,'active',NULL,0,'2026-03-23 08:30:08','2026-03-23 08:30:08'),
(175,307,'default_307',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:30:30','2026-03-23 08:30:30'),
(177,309,'IDEM_TEST_1774225890996',993,7,50.00,'active',NULL,0,'2026-03-23 08:31:30','2026-03-23 08:31:32'),
(179,311,'IDEM_TEST_1774225900609',993,7,50.00,'active',NULL,0,'2026-03-23 08:31:40','2026-03-23 08:31:42'),
(184,316,'default_316',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:35:04','2026-03-23 08:35:04'),
(187,319,'default_319',50,0,5.00,'inactive',NULL,0,'2026-03-23 08:36:28','2026-03-23 08:36:28'),
(192,324,'default_324',50,0,5.00,'inactive',NULL,0,'2026-03-23 09:24:17','2026-03-23 09:24:17'),
(199,331,'default_331',50,0,5.00,'inactive',NULL,0,'2026-03-23 09:35:03','2026-03-23 09:35:03'),
(204,336,'default_336',50,0,5.00,'inactive',NULL,0,'2026-03-23 09:35:41','2026-03-23 09:35:41'),
(209,341,'default_341',50,0,5.00,'inactive',NULL,0,'2026-03-23 09:38:14','2026-03-23 09:38:14'),
(212,344,'default_344',50,0,5.00,'inactive',NULL,0,'2026-03-23 09:40:43','2026-03-23 09:40:43'),
(217,349,'default_349',50,0,5.00,'inactive',NULL,0,'2026-03-23 09:44:01','2026-03-23 09:44:01'),
(226,358,'default_358',50,0,5.00,'inactive',NULL,0,'2026-03-24 02:05:20','2026-03-24 02:05:20'),
(231,363,'default_363',50,0,5.00,'inactive',NULL,0,'2026-03-24 02:10:48','2026-03-24 02:10:48'),
(236,368,'default_368',50,0,5.00,'inactive',NULL,0,'2026-03-24 02:18:53','2026-03-24 02:18:53'),
(239,371,'default_371',50,0,5.00,'inactive',NULL,0,'2026-03-24 04:31:29','2026-03-24 04:31:29'),
(242,374,'default_374',50,0,5.00,'inactive',NULL,0,'2026-03-24 04:33:15','2026-03-24 04:33:15'),
(253,385,'default_385',50,0,5.00,'inactive',NULL,0,'2026-03-24 04:38:01','2026-03-24 04:38:01'),
(260,392,'default_392',50,0,5.00,'inactive',NULL,0,'2026-03-24 04:43:59','2026-03-24 04:43:59'),
(265,397,'default_397',50,0,5.00,'inactive',NULL,0,'2026-03-24 04:44:13','2026-03-24 04:44:13'),
(270,402,'default_402',50,0,5.00,'inactive',NULL,0,'2026-03-24 05:01:04','2026-03-24 05:01:04'),
(281,413,'default_413',50,0,5.00,'inactive',NULL,0,'2026-04-10 06:47:41','2026-04-10 06:47:41'),
(284,416,'default_416',50,0,5.00,'inactive',NULL,0,'2026-04-22 11:10:42','2026-04-22 11:10:42'),
(291,423,'default_423',50,0,5.00,'inactive',NULL,0,'2026-04-22 11:28:23','2026-04-22 11:28:23'),
(294,426,'default_426',50,0,5.00,'inactive',NULL,0,'2026-04-22 11:30:56','2026-04-22 11:30:56'),
(301,433,'default_433',50,0,5.00,'inactive',NULL,0,'2026-04-23 00:04:20','2026-04-23 00:04:20'),
(342,474,'default_474',50,0,5.00,'inactive',NULL,0,'2026-06-03 01:58:06','2026-06-03 01:58:06'),
(346,478,'default_478',50,0,5.00,'inactive',NULL,0,'2026-06-03 02:01:54','2026-06-03 02:01:54'),
(401,535,'prop_535_default',47,3,0.00,'active',NULL,0,'2026-06-11 02:32:13','2026-06-13 04:06:26'),
(402,536,'prop_536_default',53,2,0.00,'active',NULL,0,'2026-06-11 02:33:15','2026-06-22 02:12:44'),
(403,537,'prop_537_default',49,1,0.00,'active',NULL,0,'2026-06-11 03:20:52','2026-06-13 02:50:06'),
(499,627,'default_627',97,3,0.00,'active',NULL,0,'2026-06-21 04:40:02','2026-06-21 05:54:38'),
(500,628,'default_628',100,0,0.00,'active',NULL,0,'2026-06-21 04:40:02','2026-06-21 04:40:02');
/*!40000 ALTER TABLE `exchange_item_skus` ENABLE KEYS */;
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
