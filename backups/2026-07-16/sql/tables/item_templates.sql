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
-- Table structure for table `item_templates`
--

DROP TABLE IF EXISTS `item_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `item_templates` (
  `item_template_id` bigint NOT NULL AUTO_INCREMENT COMMENT '物品模板ID（主键）',
  `template_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板代码（唯一业务标识）：如 prize_iphone_15_pro',
  `item_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '物品类型：对应 item_instances.item_type',
  `rarity_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '稀有度代码（外键 → rarity_defs.rarity_code）',
  `display_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '显示名称（UI展示）',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '物品描述',
  `reference_price_points` decimal(10,2) DEFAULT '0.00' COMMENT '参考价格（积分）：用于估值和建议定价',
  `is_tradable` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否允许交易上架',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `meta` json DEFAULT NULL COMMENT '扩展元数据（JSON格式）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `primary_media_id` bigint unsigned DEFAULT NULL COMMENT '主图片媒体ID（冗余缓存）：由 MediaService 自动维护',
  `max_edition` int DEFAULT NULL COMMENT '限量总数上限（运营设置，超过后拒绝铸造）',
  `category_id` int DEFAULT NULL,
  `value_tier` enum('low','mid','high') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'low' COMMENT '价值档位（运营配置）：low-日常物碎片直兑 / mid-中档轻门槛 / high-高档复合门槛',
  PRIMARY KEY (`item_template_id`),
  UNIQUE KEY `template_code` (`template_code`),
  KEY `idx_item_templates_item_type` (`item_type`),
  KEY `idx_item_templates_rarity_code` (`rarity_code`),
  KEY `idx_item_templates_tradable_enabled` (`is_tradable`,`is_enabled`),
  KEY `fk_item_templates_category` (`category_id`),
  KEY `idx_item_templates_value_tier` (`value_tier`),
  KEY `item_templates_primary_media_id_foreign_idx` (`primary_media_id`),
  CONSTRAINT `fk_item_templates_category` FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `item_templates_ibfk_2` FOREIGN KEY (`rarity_code`) REFERENCES `rarity_defs` (`rarity_code`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `item_templates_primary_media_id_foreign_idx` FOREIGN KEY (`primary_media_id`) REFERENCES `media_files` (`media_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=281 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物品模板表（Item Templates - 不可叠加物品模板定义）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `item_templates`
--

LOCK TABLES `item_templates` WRITE;
/*!40000 ALTER TABLE `item_templates` DISABLE KEYS */;
INSERT INTO `item_templates` VALUES
(2,'voucher_50_yuan','voucher','common','50元优惠券','可用于餐厅消费抵扣的50元优惠券',50.00,0,1,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,NULL,3,'low'),
(3,'voucher_discount_10','voucher','uncommon','9折优惠券','餐厅消费可享受9折优惠',80.00,0,1,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,NULL,3,'low'),
(4,'voucher_discount_20','voucher','rare','8折优惠券','餐厅消费可享受8折优惠',150.00,0,1,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,NULL,3,'low'),
(6,'food_set_meal_single','voucher','common','单人套餐券','单人精选套餐兑换券',88.00,0,1,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,NULL,2,'low'),
(8,'food_set_meal_family','voucher','rare','家庭套餐券','4人家庭套餐兑换券',298.00,0,1,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,NULL,2,'low'),
(9,'electronics_wireless_earbuds','product','rare','无线蓝牙耳机','高品质无线蓝牙耳机',500.00,0,1,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,NULL,1,'low'),
(10,'electronics_portable_charger','product','uncommon','移动电源','10000mAh 大容量移动电源',200.00,0,1,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,NULL,1,'low'),
(11,'electronics_smartphone','product','legendary','智能手机','最新款智能手机大奖',5000.00,0,1,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,NULL,1,'low'),
(12,'gift_card_100','voucher','uncommon','100元礼品卡','通用100元购物礼品卡',100.00,0,0,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,NULL,4,'low'),
(13,'gift_card_200','voucher','rare','200元礼品卡','通用200元购物礼品卡',200.00,0,0,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,NULL,4,'low'),
(14,'gift_card_500','voucher','epic','500元礼品卡','通用500元购物礼品卡',500.00,0,0,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,NULL,4,'low'),
(15,'home_kitchen_set','product','rare','厨房用品套装','精品厨房用品四件套',300.00,0,1,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,NULL,5,'low'),
(16,'home_towel_set','product','common','毛巾礼盒','高品质纯棉毛巾礼盒',100.00,0,1,NULL,'2026-01-15 07:42:21','2026-06-04 23:24:17',NULL,100,5,'low'),
(164,'legacy_coupon_88_discount','voucher','uncommon','八八折',NULL,0.00,0,1,NULL,'2026-03-21 03:08:40','2026-06-04 23:24:17',NULL,NULL,NULL,'low'),
(165,'legacy_points_100','voucher','common','100积分',NULL,100.00,0,1,NULL,'2026-03-21 03:08:40','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(166,'legacy_food_dessert','product','common','甜品1份',NULL,20.00,0,1,NULL,'2026-03-21 03:08:40','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(167,'legacy_food_vegetables','product','common','青菜1份',NULL,15.00,0,1,NULL,'2026-03-21 03:08:40','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(168,'legacy_jewelry_premium','product','epic','精品首饰一个',NULL,300.00,0,1,NULL,'2026-03-21 03:08:40','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(169,'legacy_food_sashimi_platter','product','legendary','生腌拼盘158',NULL,158.00,0,1,NULL,'2026-03-21 03:08:40','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(170,'legacy_voucher_98_discount','voucher','common','九八折券',NULL,0.00,0,1,NULL,'2026-03-21 04:04:43','2026-06-04 23:24:17',NULL,NULL,NULL,'low'),
(171,'legacy_voucher_test_1','voucher','common','测试优惠券',NULL,0.00,0,0,NULL,'2026-03-21 04:04:43','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(172,'legacy_voucher_test_2','voucher','common','测试优惠券2',NULL,0.00,0,0,NULL,'2026-03-21 04:04:43','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(173,'legacy_voucher_test_3','voucher','common','测试优惠券3',NULL,0.00,0,0,NULL,'2026-03-21 04:04:43','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(174,'legacy_voucher_1','voucher','common','优惠券1',NULL,0.00,0,1,NULL,'2026-03-21 04:04:43','2026-06-04 23:24:17',NULL,NULL,NULL,'low'),
(175,'legacy_voucher_2','voucher','common','优惠券2',NULL,0.00,0,1,NULL,'2026-03-21 04:04:43','2026-06-04 23:24:17',NULL,NULL,NULL,'low'),
(176,'legacy_voucher_test_product','voucher','common','测试商品券',NULL,0.00,0,0,NULL,'2026-03-21 04:04:43','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(177,'legacy_voucher_stress_test','voucher','common','压测商品',NULL,0.00,0,0,NULL,'2026-03-21 04:04:43','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(178,'legacy_voucher_trade_test','voucher','common','交易测试物品',NULL,0.00,0,0,NULL,'2026-03-21 04:04:43','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(179,'legacy_misc_item','voucher','common','历史遗留物品',NULL,0.00,0,0,NULL,'2026-03-21 04:04:43','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(192,'collectible_gem','product','rare','收藏宝石',NULL,500.00,0,1,'{\"attribute_rules\": {\"pattern_id\": {\"max\": 1000, \"min\": 1, \"enabled\": true}, \"quality_score\": {\"enabled\": true, \"distribution\": [{\"max\": 19.99, \"min\": 0, \"grade\": \"微瑕\", \"weight\": 15}, {\"max\": 49.99, \"min\": 20, \"grade\": \"普通\", \"weight\": 35}, {\"max\": 79.99, \"min\": 50, \"grade\": \"良好\", \"weight\": 35}, {\"max\": 94.99, \"min\": 80, \"grade\": \"精良\", \"weight\": 13}, {\"max\": 100, \"min\": 95, \"grade\": \"完美无瑕\", \"weight\": 2}]}}, \"trade_cooldown_days\": 7}','2026-03-22 17:33:53','2026-07-11 01:23:11',NULL,100,8,'low'),
(252,'11112222','virtual','common','1111',NULL,0.00,1,0,'{\"attribute_rules\": {\"pattern_id\": {\"max\": null, \"min\": null, \"enabled\": false}, \"quality_score\": {\"tiers\": [{\"max\": 100, \"min\": 0, \"grade\": \"完美无瑕\", \"weight\": 1}, {\"max\": 100, \"min\": 0, \"grade\": \"精良\", \"weight\": 1}, {\"max\": 100, \"min\": 0, \"grade\": \"良好\", \"weight\": 1}, {\"max\": 100, \"min\": 0, \"grade\": \"普通\", \"weight\": 1}, {\"max\": 100, \"min\": 0, \"grade\": \"微瑕\", \"weight\": 1}], \"enabled\": false}, \"trade_cooldown_days\": 7}}','2026-06-11 02:07:51','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(253,'prop_1781116358297','prop',NULL,'1111','',0.00,0,0,NULL,'2026-06-11 02:32:13','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(254,'prop_1781116420115','prop',NULL,'12222','',0.00,0,0,NULL,'2026-06-11 02:33:15','2026-07-11 01:23:11',NULL,NULL,NULL,'low'),
(255,'prop_1781119277484','prop',NULL,'55555','',0.00,0,0,NULL,'2026-06-11 03:20:52','2026-07-11 01:23:11',NULL,NULL,NULL,'low');
/*!40000 ALTER TABLE `item_templates` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:50
