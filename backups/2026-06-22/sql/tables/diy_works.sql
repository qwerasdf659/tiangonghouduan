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
  KEY `diy_works_preview_media_id_foreign_idx` (`preview_media_id`),
  KEY `diy_works_item_id_foreign_idx` (`item_id`),
  KEY `idx_diy_works_account_status` (`account_id`,`status`),
  CONSTRAINT `diy_works_account_id_foreign_idx` FOREIGN KEY (`account_id`) REFERENCES `accounts` (`account_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `diy_works_ibfk_2` FOREIGN KEY (`diy_template_id`) REFERENCES `diy_templates` (`diy_template_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `diy_works_item_id_foreign_idx` FOREIGN KEY (`item_id`) REFERENCES `items` (`item_id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `diy_works_preview_media_id_foreign_idx` FOREIGN KEY (`preview_media_id`) REFERENCES `media_files` (`media_id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=81 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DIY用户作品表（用户保存的设计方案）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `diy_works`
--

LOCK TABLES `diy_works` WRITE;
/*!40000 ALTER TABLE `diy_works` DISABLE KEYS */;
INSERT INTO `diy_works` VALUES
(32,1,'cancelled','2026-04-08 05:39:28','2026-04-25 05:03:22','DW26040800003201',5,'冻结测试','{\"mode\": \"beading\", \"beads\": [{\"slot_index\": 0, \"material_code\": \"DM26033100001749\"}, {\"slot_index\": 1, \"material_code\": \"DM26033100001749\"}]}','{\"payments\": [{\"amount\": 60, \"asset_code\": \"star_stone\"}], \"price_snapshot\": [{\"price\": 30, \"material_code\": \"blue_crystal_8mm\", \"price_asset_code\": \"star_stone\"}, {\"price\": 30, \"material_code\": \"blue_crystal_8mm\", \"price_asset_code\": \"star_stone\"}]}',NULL,NULL,'diy_save_5_1_1775597968000_4d2d19','2026-04-08 05:39:28',NULL),
(33,1,'cancelled','2026-04-08 05:39:41','2026-04-25 05:03:22','DW26040800003382',5,'完整流程测试','{\"mode\": \"beading\", \"beads\": [{\"slot_index\": 0, \"material_code\": \"DM26033100001749\"}]}','{\"payments\": [{\"amount\": 30, \"asset_code\": \"star_stone\"}], \"price_snapshot\": [{\"price\": 30, \"material_code\": \"blue_crystal_8mm\", \"price_asset_code\": \"star_stone\"}]}',NULL,NULL,'diy_save_5_1_1775597981000_4aebc7','2026-04-08 05:39:41',NULL),
(34,1,'cancelled','2026-04-08 05:41:25','2026-04-25 05:03:22','DW26040800003493',5,'完整流程测试','{\"mode\": \"beading\", \"beads\": [{\"slot_index\": 0, \"material_code\": \"DM26033100001749\"}]}','{\"payments\": [{\"amount\": 30, \"asset_code\": \"star_stone\"}], \"price_snapshot\": [{\"price\": 30, \"material_code\": \"blue_crystal_8mm\", \"price_asset_code\": \"star_stone\"}]}',NULL,NULL,'diy_save_5_1_1775598085000_0e5059','2026-04-08 05:41:25',NULL),
(35,1,'completed','2026-04-08 05:43:02','2026-04-25 05:03:22','DW260408000035D0',5,'完整流程测试','{\"mode\": \"beading\", \"beads\": [{\"slot_index\": 0, \"material_code\": \"DM26033100001749\"}]}','{\"payments\": [{\"amount\": 30, \"asset_code\": \"star_stone\"}], \"price_snapshot\": [{\"price\": 30, \"material_code\": \"blue_crystal_8mm\", \"price_asset_code\": \"star_stone\"}]}',NULL,42096,'diy_save_5_1_1775598182000_170c49','2026-04-08 05:43:02','2026-04-08 05:43:02'),
(37,1,'cancelled','2026-04-08 05:43:53','2026-04-25 05:03:22','DW26040800003770',5,'最终验证','{\"mode\": \"beading\", \"beads\": [{\"slot_index\": 0, \"material_code\": \"DM26033100001749\"}, {\"slot_index\": 1, \"material_code\": \"DM26033100001749\"}]}','{\"payments\": [{\"amount\": 60, \"asset_code\": \"star_stone\"}], \"price_snapshot\": [{\"price\": 30, \"material_code\": \"blue_crystal_8mm\", \"price_asset_code\": \"star_stone\"}, {\"price\": 30, \"material_code\": \"blue_crystal_8mm\", \"price_asset_code\": \"star_stone\"}]}',NULL,NULL,'diy_save_5_1_1775598233000_3e5551','2026-04-08 05:43:53',NULL),
(45,40,'draft','2026-04-09 06:30:16','2026-04-25 05:03:22','DW26040900004567',7,'我的吊坠01','{\"mode\": \"slots\", \"fillings\": {\"slot_1\": {\"material_code\": \"DMMNQ8ZVDZB6I0\"}}}','[]',NULL,NULL,'diy_save_7_40_1775687416000_e3f41a',NULL,NULL),
(48,40,'draft','2026-04-20 08:00:36','2026-04-25 05:03:22','DW2604200000483B',498,'我的吊坠01','{\"mode\": \"slots\", \"fillings\": {\"slot_1\": {\"material_code\": \"phantom_green_8mm\"}}}','[]',NULL,NULL,'diy_save_498_40_1776643236000_071118',NULL,NULL);
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

-- Dump completed on 2026-06-21 19:08:12
