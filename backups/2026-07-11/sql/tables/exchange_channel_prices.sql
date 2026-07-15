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
) ENGINE=InnoDB AUTO_INCREMENT=555 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='兑换渠道定价（Layer 2，管理SKU在兑换商城的材料资产价格）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exchange_channel_prices`
--

LOCK TABLES `exchange_channel_prices` WRITE;
/*!40000 ALTER TABLE `exchange_channel_prices` DISABLE KEYS */;
INSERT INTO `exchange_channel_prices` VALUES
(501,504,'star_stone',100,NULL,1,NULL,NULL,'2026-06-22 06:29:06','2026-06-22 06:29:06'),
(520,508,'red_core_shard',1000,NULL,1,NULL,NULL,'2026-06-26 06:18:37','2026-06-26 06:18:37');
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

-- Dump completed on 2026-07-10 18:10:57
