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
-- Table structure for table `decoration_sku`
--

DROP TABLE IF EXISTS `decoration_sku`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `decoration_sku` (
  `decoration_sku_id` int NOT NULL AUTO_INCREMENT COMMENT '装饰SKU主键',
  `decoration_code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '装饰业务码（唯一稳定标识）',
  `decoration_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '装饰名称（展示用）',
  `decoration_type` enum('avatar_frame','bubble','theme','title','badge_visual') COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '装饰类型：头像框/气泡/主题/称号/视觉徽章（纯 UI 展示）',
  `rarity_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '品质分级（仅视觉差异，零数值）：关联 rarity_defs.rarity_code',
  `decoration_season_id` int DEFAULT NULL COMMENT '所属赛季（NULL=常驻），FK→decoration_season',
  `set_code` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '套装归属码（同套装集齐可额外展示效果，NULL=不属套装）',
  `is_limited` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否限定款（限时供应，绝版机制）',
  `price_star_stone` int NOT NULL DEFAULT '0' COMMENT '明码标价（星石数量）；严禁抽取/开箱获得',
  `validity_days` int DEFAULT NULL COMMENT '有效期天数（NULL=永久；>0=限时装饰，购买后 N 天到期）',
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '装饰预览图 URL',
  `status` enum('draft','on_sale','off_sale') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '上架状态：draft-草稿 on_sale-在售 off_sale-下架',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '展示排序',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间（北京时间）',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间（北京时间）',
  PRIMARY KEY (`decoration_sku_id`),
  UNIQUE KEY `uk_decoration_sku_code` (`decoration_code`),
  KEY `idx_decoration_sku_status_sort` (`status`,`sort_order`),
  KEY `idx_decoration_sku_season` (`decoration_season_id`),
  CONSTRAINT `decoration_sku_ibfk_1` FOREIGN KEY (`decoration_season_id`) REFERENCES `decoration_season` (`decoration_season_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='装饰SKU表（纯展示零数值，星石明码标价，禁止抽取/开箱）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `decoration_sku`
--

LOCK TABLES `decoration_sku` WRITE;
/*!40000 ALTER TABLE `decoration_sku` DISABLE KEYS */;
/*!40000 ALTER TABLE `decoration_sku` ENABLE KEYS */;
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
