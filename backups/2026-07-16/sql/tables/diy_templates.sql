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
-- Table structure for table `diy_templates`
--

DROP TABLE IF EXISTS `diy_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `diy_templates` (
  `diy_template_id` bigint NOT NULL AUTO_INCREMENT COMMENT 'DIY款式模板ID（自增主键）',
  `category_id` int NOT NULL COMMENT '所属品类ID（categories.category_id，DIY饰品二级分类）',
  `layout` json NOT NULL COMMENT '排列形状参数 { shape, params }，shape: circle/ellipse/arc/line/slots',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序权重（数字越小越靠前）',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `template_code` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板业务编号（OrderNoGenerator 生成，bizCode=DT）',
  `display_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '模板展示名称',
  `status` enum('draft','published','archived') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'published' COMMENT '模板生命周期状态',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用（上下架开关）',
  `bead_rules` json DEFAULT NULL COMMENT '珠子规则（串珠模式）：{ margin, default_diameter, allowed_diameters[] }',
  `sizing_rules` json DEFAULT NULL COMMENT '尺寸规则（串珠模式）：{ default_size, size_options[{ label, bead_count }] }',
  `capacity_rules` json DEFAULT NULL COMMENT '容量规则：{ min_beads, max_beads }',
  `material_group_codes` json DEFAULT NULL COMMENT '允许的材料分组码数组（关联 asset_group_defs.group_code），空=全部允许',
  `preview_media_id` bigint unsigned DEFAULT NULL COMMENT '预览图媒体文件ID',
  `base_image_media_id` bigint unsigned DEFAULT NULL COMMENT '底图媒体文件ID（镶嵌模式必需）',
  `meta` json DEFAULT NULL COMMENT '扩展元数据（预留字段）',
  PRIMARY KEY (`diy_template_id`),
  UNIQUE KEY `uk_diy_templates_template_code` (`template_code`),
  KEY `idx_diy_templates_category` (`category_id`),
  KEY `idx_diy_templates_active_sort` (`sort_order`),
  KEY `idx_diy_templates_status` (`status`),
  KEY `idx_diy_templates_is_enabled` (`is_enabled`),
  KEY `diy_templates_base_image_media_id_foreign_idx` (`base_image_media_id`),
  KEY `diy_templates_preview_media_id_foreign_idx` (`preview_media_id`),
  CONSTRAINT `diy_templates_base_image_media_id_foreign_idx` FOREIGN KEY (`base_image_media_id`) REFERENCES `media_files` (`media_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `diy_templates_ibfk_1` FOREIGN KEY (`category_id`) REFERENCES `categories` (`category_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `diy_templates_preview_media_id_foreign_idx` FOREIGN KEY (`preview_media_id`) REFERENCES `media_files` (`media_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=163 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DIY款式模板表（管理端配置，前端根据模板参数渲染设计器）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `diy_templates`
--

LOCK TABLES `diy_templates` WRITE;
/*!40000 ALTER TABLE `diy_templates` DISABLE KEYS */;
INSERT INTO `diy_templates` VALUES
(116,191,'{\"shape\": \"circle\"}',1,'2026-07-15 21:03:09','2026-07-15 21:03:09','DT26071500011653','手串','published',1,'{\"margin\": 0, \"default_diameter\": 8, \"allowed_diameters\": []}','{\"default_size\": \"15\", \"size_options\": [{\"label\": \"12\", \"display\": \"手围 12cm（约 16 颗）\", \"bead_count\": 16, \"wrist_size_mm\": 120, \"target_length_mm\": 135}, {\"label\": \"13\", \"display\": \"手围 13cm（约 18 颗）\", \"bead_count\": 18, \"wrist_size_mm\": 130, \"target_length_mm\": 145}, {\"label\": \"14\", \"display\": \"手围 14cm（约 19 颗）\", \"bead_count\": 19, \"wrist_size_mm\": 140, \"target_length_mm\": 155}, {\"label\": \"15\", \"display\": \"手围 15cm（约 20 颗）\", \"bead_count\": 20, \"wrist_size_mm\": 150, \"target_length_mm\": 165}, {\"label\": \"16\", \"display\": \"手围 16cm（约 21 颗）\", \"bead_count\": 21, \"wrist_size_mm\": 160, \"target_length_mm\": 175}, {\"label\": \"17\", \"display\": \"手围 17cm（约 23 颗）\", \"bead_count\": 23, \"wrist_size_mm\": 170, \"target_length_mm\": 185}, {\"label\": \"18\", \"display\": \"手围 18cm（约 24 颗）\", \"bead_count\": 24, \"wrist_size_mm\": 180, \"target_length_mm\": 195}, {\"label\": \"15x2\", \"display\": \"手围 15cm 双圈（约 41 颗）\", \"bead_count\": 41, \"wrist_size_mm\": 150, \"target_length_mm\": 330}, {\"label\": \"15x3\", \"display\": \"手围 15cm 三圈（约 61 颗）\", \"bead_count\": 61, \"wrist_size_mm\": 150, \"target_length_mm\": 495}], \"elastic_margin_mm\": 15}','{\"max_beads\": 0, \"min_beads\": 1}','[\"white\", \"pink\", \"purple\", \"yellow\"]',177,177,NULL),
(117,293,'{\"shape\": \"circle\"}',2,'2026-07-15 21:03:09','2026-07-15 21:03:09','DT2607150001178B','108佛珠','published',1,'{\"margin\": 0, \"default_diameter\": 8, \"allowed_diameters\": []}','{\"default_size\": \"108x8\", \"size_options\": [{\"label\": \"54x8\", \"display\": \"54颗 · 8mm珠\", \"bead_count\": 54, \"target_length_mm\": 432}, {\"label\": \"108x6\", \"display\": \"108颗 · 6mm珠\", \"bead_count\": 108, \"target_length_mm\": 648}, {\"label\": \"108x8\", \"display\": \"108颗 · 8mm珠\", \"bead_count\": 108, \"target_length_mm\": 864}], \"elastic_margin_mm\": 15}','{\"max_beads\": 0, \"min_beads\": 1}','[\"white\", \"pink\", \"purple\", \"yellow\"]',164,164,NULL),
(118,192,'{\"shape\": \"slots\", \"background_width\": 640, \"slot_definitions\": [{\"x\": 0.51, \"y\": 0.672, \"label\": \"主石\", \"width\": 0.15, \"height\": 0.1, \"slot_id\": \"main\", \"required\": true, \"rotation\": 0, \"allowed_shapes\": [], \"render_diameter\": null, \"allowed_diameters\": [], \"allowed_group_codes\": []}], \"background_height\": 960}',3,'2026-07-15 21:03:09','2026-07-15 21:03:09','DT2607150001181B','托帕石项链','published',1,NULL,NULL,NULL,'[\"blue\", \"red\", \"green\"]',165,165,NULL),
(119,193,'{\"shape\": \"slots\", \"background_width\": 640, \"slot_definitions\": [{\"x\": 0.505, \"y\": 0.285, \"label\": \"主石\", \"width\": 0.17, \"height\": 0.113, \"slot_id\": \"main\", \"required\": true, \"rotation\": 0, \"allowed_shapes\": [], \"render_diameter\": null, \"allowed_diameters\": [], \"allowed_group_codes\": []}], \"background_height\": 960}',4,'2026-07-15 21:03:09','2026-07-15 21:03:09','DT26071500011946','主石戒指','published',1,NULL,NULL,NULL,'[\"blue\", \"red\", \"green\"]',167,167,NULL),
(120,194,'{\"shape\": \"slots\", \"background_width\": 640, \"slot_definitions\": [{\"x\": 0.49, \"y\": 0.605, \"label\": \"主石\", \"width\": 0.28, \"height\": 0.187, \"slot_id\": \"main\", \"required\": true, \"rotation\": 0, \"allowed_shapes\": [], \"render_diameter\": null, \"allowed_diameters\": [], \"allowed_group_codes\": []}], \"background_height\": 960}',5,'2026-07-15 21:03:09','2026-07-15 21:03:09','DT260715000120CB','水滴吊坠','published',1,NULL,NULL,NULL,'[\"blue\", \"red\", \"green\"]',166,166,NULL),
(121,291,'{\"shape\": \"slots\", \"background_width\": 512, \"slot_definitions\": [{\"x\": 0.295, \"y\": 0.565, \"label\": \"左耳\", \"width\": 0.24, \"height\": 0.16, \"slot_id\": \"left\", \"required\": true, \"rotation\": 0, \"allowed_shapes\": [], \"render_diameter\": null, \"allowed_diameters\": [], \"allowed_group_codes\": []}, {\"x\": 0.705, \"y\": 0.565, \"label\": \"右耳\", \"width\": 0.24, \"height\": 0.16, \"slot_id\": \"right\", \"required\": true, \"rotation\": 0, \"allowed_shapes\": [], \"render_diameter\": null, \"allowed_diameters\": [], \"allowed_group_codes\": []}], \"background_height\": 768}',6,'2026-07-15 21:03:09','2026-07-15 21:03:09','DT26071500012160','一对耳钉','published',1,NULL,NULL,NULL,'[\"blue\", \"red\", \"green\"]',160,160,NULL),
(122,292,'{\"shape\": \"slots\", \"background_width\": 512, \"slot_definitions\": [{\"x\": 0.502, \"y\": 0.362, \"label\": \"上珠\", \"width\": 0.145, \"height\": 0.097, \"slot_id\": \"top\", \"required\": true, \"rotation\": 0, \"allowed_shapes\": [], \"render_diameter\": null, \"allowed_diameters\": [], \"allowed_group_codes\": []}, {\"x\": 0.499, \"y\": 0.521, \"label\": \"中珠\", \"width\": 0.145, \"height\": 0.097, \"slot_id\": \"middle\", \"required\": true, \"rotation\": 0, \"allowed_shapes\": [], \"render_diameter\": null, \"allowed_diameters\": [], \"allowed_group_codes\": []}, {\"x\": 0.502, \"y\": 0.666, \"label\": \"下珠\", \"width\": 0.145, \"height\": 0.097, \"slot_id\": \"bottom\", \"required\": true, \"rotation\": 0, \"allowed_shapes\": [], \"render_diameter\": null, \"allowed_diameters\": [], \"allowed_group_codes\": []}], \"background_height\": 768}',7,'2026-07-15 21:03:09','2026-07-15 21:03:09','DT2607150001229B','手机链包挂','published',1,NULL,NULL,NULL,'[\"blue\", \"red\", \"green\"]',159,159,NULL);
/*!40000 ALTER TABLE `diy_templates` ENABLE KEYS */;
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
