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
-- Table structure for table `categories`
--

DROP TABLE IF EXISTS `categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `categories` (
  `category_id` int NOT NULL AUTO_INCREMENT COMMENT '品类ID',
  `parent_category_id` int DEFAULT NULL COMMENT '父品类（NULL=顶级）',
  `category_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '品类名称（宝石/数码/服装）',
  `category_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '品类编码（gems/digital/clothing）',
  `level` tinyint NOT NULL DEFAULT '1' COMMENT '层级 1=一级 2=二级 3=三级',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `icon_media_id` bigint unsigned DEFAULT NULL COMMENT '品类图标',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `description` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '品类说明（运营可见）',
  PRIMARY KEY (`category_id`),
  UNIQUE KEY `category_code` (`category_code`),
  KEY `idx_categories_parent` (`parent_category_id`),
  KEY `idx_categories_level_sort` (`level`,`sort_order`),
  KEY `idx_categories_enabled_level` (`is_enabled`,`level`),
  KEY `categories_ibfk_2` (`icon_media_id`),
  CONSTRAINT `categories_ibfk_1` FOREIGN KEY (`parent_category_id`) REFERENCES `categories` (`category_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `categories_ibfk_2` FOREIGN KEY (`icon_media_id`) REFERENCES `media_files` (`media_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=294 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='品类树（EAV 商品中心 Layer 1）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `categories`
--

LOCK TABLES `categories` WRITE;
/*!40000 ALTER TABLE `categories` DISABLE KEYS */;
INSERT INTO `categories` VALUES
(1,NULL,'电子产品','electronics',1,1,0,NULL,'2026-01-15 06:13:47','2026-03-17 06:41:04',NULL),
(2,NULL,'餐饮美食','food_drink',1,2,0,NULL,'2026-01-15 06:13:47','2026-03-17 06:41:04',NULL),
(3,NULL,'优惠券','voucher',1,3,0,NULL,'2026-01-15 06:13:47','2026-03-17 06:41:04',NULL),
(4,NULL,'礼品卡','gift_card',1,4,0,NULL,'2026-01-15 06:13:47','2026-03-17 06:41:04',NULL),
(5,NULL,'家居生活','home_life',1,5,1,NULL,'2026-01-15 06:13:47','2026-03-17 06:41:04',NULL),
(6,NULL,'生活日用','lifestyle',1,20,1,NULL,'2026-02-18 23:36:56','2026-03-17 06:41:04',NULL),
(7,NULL,'美食饮品','food',1,30,1,NULL,'2026-02-18 23:36:56','2026-03-17 06:41:04',NULL),
(8,NULL,'收藏品','collectible',1,50,1,NULL,'2026-02-18 23:36:56','2026-03-17 06:41:04',NULL),
(9,NULL,'其他','other',1,99,1,NULL,'2026-01-15 06:13:47','2026-03-17 06:41:04',NULL),
(86,5,'家居用品','home_goods',2,10,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(87,5,'厨房用品','kitchen',2,20,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(88,6,'个人护理','personal_care',2,10,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(89,6,'户外运动','outdoor',2,20,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(90,7,'餐饮代金券','food_voucher',2,10,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(91,7,'饮品券','drink_voucher',2,20,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(92,7,'休闲零食','snack',2,30,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(93,8,'徽章','badge',2,10,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(94,8,'手办','figurine',2,20,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(95,8,'卡牌','card',2,30,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(96,3,'折扣券','discount_voucher',2,10,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(97,3,'返现券','cashback_voucher',2,20,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(98,1,'手机','phone',2,10,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(99,1,'耳机','headphone',2,20,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(100,1,'穿戴设备','wearable',2,30,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(101,9,'周边商品','merch',2,10,1,NULL,'2026-03-21 00:33:28','2026-03-21 00:33:28',NULL),
(190,NULL,'DIY饰品','DIY_JEWELRY',1,100,1,NULL,'2026-03-31 19:32:12','2026-03-31 19:32:12','DIY饰品设计引擎 - 用户自定义设计珠宝饰品'),
(191,190,'手链','DIY_BRACELET',2,1,1,NULL,'2026-03-31 19:32:12','2026-03-31 19:32:12','DIY手链设计'),
(192,190,'项链','DIY_NECKLACE',2,2,1,NULL,'2026-03-31 19:32:12','2026-03-31 19:32:12','DIY项链设计'),
(193,190,'戒指','DIY_RING',2,3,1,NULL,'2026-03-31 19:32:12','2026-03-31 19:32:12','DIY戒指设计'),
(194,190,'吊坠','DIY_PENDANT',2,4,1,NULL,'2026-03-31 19:32:12','2026-03-31 19:32:12','DIY吊坠设计'),
(291,190,'耳饰','DIY_EARRING',2,5,1,NULL,'2026-07-10 06:47:37','2026-07-10 06:47:37','DIY耳饰设计（镶嵌双槽位款式）'),
(292,190,'手机链包挂','DIY_CHARM',2,6,1,NULL,'2026-07-10 06:47:37','2026-07-10 06:47:37','DIY手机链/包挂设计（镶嵌多珠位或串珠line形状款式）'),
(293,190,'108佛珠','DIY_MALA',2,7,1,NULL,'2026-07-10 06:47:37','2026-07-10 06:47:37','DIY 108佛珠/念珠设计（串珠大围长颗数制款式）');
/*!40000 ALTER TABLE `categories` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-10 18:10:56
