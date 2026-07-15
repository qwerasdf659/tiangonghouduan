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
) ENGINE=InnoDB AUTO_INCREMENT=86 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DIY款式模板表（管理端配置，前端根据模板参数渲染设计器）';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `diy_templates`
--

LOCK TABLES `diy_templates` WRITE;
/*!40000 ALTER TABLE `diy_templates` DISABLE KEYS */;
INSERT INTO `diy_templates` VALUES
(1,191,'{\"shape\": \"circle\", \"radius_x\": 120, \"radius_y\": 120, \"bead_count\": 18}',1,'2026-03-31 19:40:59','2026-04-08 23:07:38','DT26033100000154','经典串珠手链','draft',1,'{\"margin\": 10, \"default_diameter\": 8, \"allowed_diameters\": [6, 8, 10, 12]}','{\"default_size\": \"M\", \"size_options\": [{\"label\": \"S\", \"display\": \"小号 (约15cm)\", \"radius_x\": 95, \"radius_y\": 95, \"bead_count\": 14}, {\"label\": \"M\", \"display\": \"中号 (约17cm)\", \"radius_x\": 120, \"radius_y\": 120, \"bead_count\": 18}, {\"label\": \"L\", \"display\": \"大号 (约19cm)\", \"radius_x\": 140, \"radius_y\": 140, \"bead_count\": 22}]}','{\"max_beads\": 24, \"min_beads\": 12}','[]',NULL,NULL,NULL),
(2,192,'{\"shape\": \"ellipse\", \"radius_x\": 160, \"radius_y\": 100, \"bead_count\": 24}',2,'2026-03-31 19:41:11','2026-04-08 23:07:38','DT26033100000279','锁骨项链','draft',1,'{\"margin\": 8, \"default_diameter\": 6, \"allowed_diameters\": [6, 8]}','{\"default_size\": \"M\", \"size_options\": [{\"label\": \"S\", \"display\": \"短款 (约38cm)\", \"radius_x\": 130, \"radius_y\": 80, \"bead_count\": 20}, {\"label\": \"M\", \"display\": \"中款 (约45cm)\", \"radius_x\": 160, \"radius_y\": 100, \"bead_count\": 24}, {\"label\": \"L\", \"display\": \"长款 (约55cm)\", \"radius_x\": 190, \"radius_y\": 120, \"bead_count\": 30}]}','{\"max_beads\": 36, \"min_beads\": 18}','[]',NULL,NULL,NULL),
(40,194,'{\"shape\": \"slots\", \"background_width\": 800, \"slot_definitions\": [{\"x\": 0.5, \"y\": 0.638, \"label\": \"槽位1\", \"width\": 0.623, \"height\": 0.498, \"slot_id\": \"slot_1\", \"required\": false, \"rotation\": 0, \"allowed_shapes\": [\"circle\", \"ellipse\"], \"allowed_group_codes\": []}], \"background_height\": 1000}',0,'2026-04-09 00:12:40','2026-04-22 16:41:37','DT26040900004093','吊坠01','draft',1,'{\"margin\": 10, \"default_diameter\": 10, \"allowed_diameters\": [8]}',NULL,'{\"max_beads\": 24, \"min_beads\": 12}','[]',NULL,NULL,NULL),
(65,194,'{\"shape\": \"slots\", \"background_width\": 800, \"slot_definitions\": [{\"x\": 0.533, \"y\": 0.641, \"label\": \"槽位1\", \"width\": 0.632, \"height\": 0.505, \"slot_id\": \"slot_1\", \"required\": false, \"rotation\": 0, \"allowed_shapes\": [\"circle\", \"ellipse\"], \"render_diameter\": null, \"allowed_diameters\": [], \"allowed_group_codes\": []}], \"background_height\": 1000}',0,'2026-04-28 07:49:52','2026-07-10 06:47:37','DT260428000065D5','项链12','published',1,'{\"margin\": 10, \"default_diameter\": 10, \"allowed_diameters\": [8]}',NULL,'{\"max_beads\": 24, \"min_beads\": 12}','[]',NULL,NULL,NULL);
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

-- Dump completed on 2026-07-10 18:10:57
