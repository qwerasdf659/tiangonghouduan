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
-- Table structure for table `ad_creatives`
--

DROP TABLE IF EXISTS `ad_creatives`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `ad_creatives` (
  `ad_creative_id` int NOT NULL AUTO_INCREMENT COMMENT '广告素材主键',
  `ad_campaign_id` int NOT NULL COMMENT '所属广告计划 ID',
  `title` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '素材标题',
  `link_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '跳转链接',
  `link_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT '跳转类型：none / page / miniprogram / webview',
  `review_status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending' COMMENT '审核状态：pending / approved / rejected',
  `review_note` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '审核备注',
  `reviewed_by` int DEFAULT NULL COMMENT '审核管理员 ID',
  `reviewed_at` datetime DEFAULT NULL COMMENT '审核时间',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `content_type` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'image' COMMENT '内容类型：image=图片 / text=纯文字',
  `text_content` text COLLATE utf8mb4_unicode_ci COMMENT '文字内容（content_type=text 时使用，原 SystemAnnouncement.content）',
  `display_mode` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '显示模式：wide/horizontal/square/tall/slim/full_image（原 PopupBanner 的 6 种显示模式）',
  `primary_media_id` bigint unsigned DEFAULT NULL COMMENT '主图片媒体ID（冗余缓存）：由 MediaService 自动维护',
  PRIMARY KEY (`ad_creative_id`),
  KEY `reviewed_by` (`reviewed_by`),
  KEY `idx_acr_campaign` (`ad_campaign_id`),
  KEY `idx_acr_review` (`review_status`),
  KEY `ad_creatives_primary_media_id_foreign_idx` (`primary_media_id`),
  CONSTRAINT `ad_creatives_ibfk_1` FOREIGN KEY (`ad_campaign_id`) REFERENCES `ad_campaigns` (`ad_campaign_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `ad_creatives_ibfk_2` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ad_creatives_primary_media_id_foreign_idx` FOREIGN KEY (`primary_media_id`) REFERENCES `media_files` (`media_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=359 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='广告素材表 — Phase 3 素材审核';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ad_creatives`
--

LOCK TABLES `ad_creatives` WRITE;
/*!40000 ALTER TABLE `ad_creatives` DISABLE KEYS */;
INSERT INTO `ad_creatives` VALUES
(344,358,'1号',NULL,'none','approved',NULL,NULL,NULL,'2026-06-22 13:07:17','2026-06-22 13:07:17','image',NULL,NULL,NULL),
(345,359,'11',NULL,'none','approved',NULL,NULL,NULL,'2026-06-25 08:08:17','2026-06-25 08:08:17','image',NULL,NULL,126),
(352,366,'121',NULL,'none','approved',NULL,NULL,NULL,'2026-07-07 03:48:02','2026-07-07 03:48:02','image',NULL,NULL,126);
/*!40000 ALTER TABLE `ad_creatives` ENABLE KEYS */;
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
