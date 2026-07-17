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
-- Table structure for table `diy_works`
--

DROP TABLE IF EXISTS `diy_works`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `diy_works` (
  `diy_work_id` bigint NOT NULL AUTO_INCREMENT COMMENT 'DIY作品ID（自增主键）',
  `diy_template_id` bigint NOT NULL COMMENT '款式模板ID（diy_templates.diy_template_id）',
  `status` enum('draft','frozen','completed','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT '作品状态：draft草稿/frozen已冻结材料/completed已完成/cancelled已取消',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `work_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '作品业务编号（OrderNoGenerator 生成，bizCode=DW）',
  `account_id` bigint DEFAULT NULL COMMENT '所属账户ID',
  `work_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '我的设计' COMMENT '用户自定义作品名称',
  `design_data` json NOT NULL COMMENT '核心设计数据（珠子排列/槽位填充方案）',
  `total_cost` json DEFAULT NULL COMMENT '总消耗明细 [{ asset_code, amount }]',
  `preview_media_id` bigint unsigned DEFAULT NULL COMMENT '预览图媒体文件ID',
  `item_id` bigint DEFAULT NULL COMMENT '确认后铸造的物品实例ID',
  `idempotency_key` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '幂等键（防重复提交）',
  `frozen_at` datetime DEFAULT NULL COMMENT '材料冻结时间',
  `completed_at` datetime DEFAULT NULL COMMENT '完成时间（铸造成功）',
  PRIMARY KEY (`diy_work_id`),
  UNIQUE KEY `uk_diy_works_work_code` (`work_code`),
  UNIQUE KEY `uk_diy_works_idempotency_key` (`idempotency_key`),
  KEY `idx_diy_works_template` (`diy_template_id`),
  KEY `diy_works_item_id_foreign_idx` (`item_id`),
  KEY `idx_diy_works_account_status` (`account_id`,`status`),
  KEY `diy_works_preview_media_id_foreign_idx` (`preview_media_id`),
  CONSTRAINT `diy_works_account_id_foreign_idx` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`account_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `diy_works_ibfk_2` FOREIGN KEY (`diy_template_id`) REFERENCES `diy_templates` (`diy_template_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `diy_works_item_id_foreign_idx` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `diy_works_preview_media_id_foreign_idx` FOREIGN KEY (`preview_media_id`) REFERENCES `media_files` (`media_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=188 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DIY用户作品表（用户保存的设计方案）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `diy_works`
--

LOCK TABLES `diy_works` WRITE;
/*!40000 ALTER TABLE `diy_works` DISABLE KEYS */;
/*!40000 ALTER TABLE `diy_works` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-16  3:11:49
