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
-- Table structure for table `diy_materials`
--

DROP TABLE IF EXISTS `diy_materials`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8mb4 */;
CREATE TABLE `diy_materials` (
  `diy_material_id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '素材ID（主键）',
  `material_code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '素材编码（唯一，如 yellow_crystal_10mm）',
  `display_name` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '素材显示名称（如"巴西黄水晶"）',
  `material_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '材质名称（如"黄水晶"），用于分类展示',
  `group_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '材料分组编码（对齐 asset_group_defs，如 yellow/blue/red）',
  `diameter` decimal(5,1) NOT NULL COMMENT '直径(mm)，用于容量校验和槽位匹配',
  `shape` enum('circle','ellipse','oval','square','heart','teardrop') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'circle' COMMENT '切割形状，用于镶嵌模式槽位形状匹配',
  `price` decimal(10,2) NOT NULL DEFAULT '0.00' COMMENT '单价（资产单位）',
  `price_asset_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '定价货币资产编码（默认 star_stone 星石）',
  `stock` int NOT NULL DEFAULT '-1' COMMENT '库存数量（-1=无限，0=售罄）',
  `is_stackable` tinyint(1) NOT NULL DEFAULT '1' COMMENT '可叠加标识（同款可多颗）',
  `image_media_id` bigint unsigned DEFAULT NULL COMMENT '素材图片（PNG 透明底）→ media_files.media_id',
  `category_id` int DEFAULT NULL COMMENT '所属分类 → categories.category_id',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '排序权重（越小越靠前）',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT '是否启用',
  `meta` json DEFAULT NULL COMMENT '扩展元数据',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `item_type` enum('beads','accessories','pendants') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'beads' COMMENT '素材大类：beads珠子 / accessories配饰(隔片佛头流苏) / pendants吊坠',
  `material_type` enum('crystal','stone','metal','matte') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'crystal' COMMENT '材质光影档位（前端立体渲染高光参数）：crystal通透水晶/stone玉石奶体/metal金属镜面/matte哑光',
  `five_elements` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '五行属性，逗号分隔多值：metal金/wood木/water水/fire火/earth土（五行雷达图玩法数据源）',
  `weight` decimal(6,1) DEFAULT NULL COMMENT '单颗珠子净重(g)，保留1位小数，仅详情展示',
  `meaning` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '寓意文案（详情弹窗展示，措辞须符合广告法：用"寓意/象征"，禁功效性表述）',
  `energy` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '能量属性文案（如"财富·活力"，软性运营文案）',
  `pairing` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '搭配建议文案（如"搭配白水晶提亮"）',
  `size_length_mm` decimal(5,1) DEFAULT NULL COMMENT '异形珠实物长边(mm)，如跑环14.5；圆珠为空',
  `size_width_mm` decimal(5,1) DEFAULT NULL COMMENT '异形珠实物短边(mm)，如跑环4.5；圆珠为空',
  `bore_orientation` enum('along_length','along_width','none') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'none' COMMENT '穿绳方向：along_length绳穿长轴(管珠) / along_width绳穿短边(药片) / none圆珠',
  PRIMARY KEY (`diy_material_id`),
  UNIQUE KEY `material_code` (`material_code`),
  KEY `idx_diy_materials_group` (`group_code`),
  KEY `idx_diy_materials_category` (`category_id`),
  KEY `idx_diy_materials_diameter` (`diameter`),
  KEY `idx_diy_materials_enabled_sort` (`is_enabled`,`sort_order`),
  KEY `diy_materials_image_media_id_foreign_idx` (`image_media_id`),
  KEY `idx_diy_materials_item_type` (`item_type`),
  CONSTRAINT `diy_materials_image_media_id_foreign_idx` FOREIGN KEY (`image_media_id`) REFERENCES `media_files` (`media_id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=85 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DIY 珠子/宝石素材表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `diy_materials`
--

LOCK TABLES `diy_materials` WRITE;
/*!40000 ALTER TABLE `diy_materials` DISABLE KEYS */;
INSERT INTO `diy_materials` VALUES
(1,'DM26033100000191','巴西黄水晶','黄水晶','yellow',8.0,'circle',32.00,'star_stone',-1,1,NULL,NULL,1,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','earth',0.7,'传统文化中被称为「财富之石」，象征财富与丰盛','财富·丰盛','搭配白水晶，色泽明快更显通透',NULL,NULL,'none'),
(2,'DM260331000002EF','巴西黄水晶','黄水晶','yellow',10.0,'circle',67.00,'star_stone',-1,1,NULL,NULL,2,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','earth',1.4,'传统文化中被称为「财富之石」，象征财富与丰盛','财富·丰盛','搭配白水晶，色泽明快更显通透',NULL,NULL,'none'),
(3,'DM2603310000039C','透体柠檬黄水晶','黄水晶','yellow',8.0,'circle',6.00,'star_stone',-1,1,NULL,NULL,3,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','earth',0.7,'传统文化中被称为「财富之石」，象征财富与丰盛','财富·丰盛','搭配白水晶，色泽明快更显通透',NULL,NULL,'none'),
(4,'DM260331000004F7','透体柠檬黄水晶','黄水晶','yellow',10.0,'circle',12.00,'star_stone',-1,1,NULL,NULL,4,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','earth',1.4,'传统文化中被称为「财富之石」，象征财富与丰盛','财富·丰盛','搭配白水晶，色泽明快更显通透',NULL,NULL,'none'),
(5,'DM26033100000588','透体柠檬黄水晶','黄水晶','yellow',12.0,'circle',19.00,'star_stone',-1,1,NULL,NULL,5,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','earth',2.4,'传统文化中被称为「财富之石」，象征财富与丰盛','财富·丰盛','搭配白水晶，色泽明快更显通透',NULL,NULL,'none'),
(6,'DM26033100000636','黄塔晶','黄水晶','yellow',8.0,'circle',7.00,'star_stone',-1,1,NULL,NULL,6,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','earth',0.7,'传统文化中被称为「财富之石」，象征财富与丰盛','财富·丰盛','搭配白水晶，色泽明快更显通透',NULL,NULL,'none'),
(7,'DM26033100000737','粉水晶','粉水晶','red',8.0,'circle',15.00,'star_stone',-1,1,NULL,NULL,10,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','fire',0.7,'象征温柔与美好情感，寓意人缘和睦','温柔·人缘','搭配紫水晶，粉紫渐变柔美浪漫',NULL,NULL,'none'),
(8,'DM2603310000083F','粉水晶','粉水晶','red',10.0,'circle',28.00,'star_stone',-1,1,NULL,NULL,11,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','fire',1.4,'象征温柔与美好情感，寓意人缘和睦','温柔·人缘','搭配紫水晶，粉紫渐变柔美浪漫',NULL,NULL,'none'),
(9,'DM26033100000984','粉水晶','粉水晶','red',12.0,'circle',45.00,'star_stone',-1,1,NULL,NULL,12,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','fire',2.4,'象征温柔与美好情感，寓意人缘和睦','温柔·人缘','搭配紫水晶，粉紫渐变柔美浪漫',NULL,NULL,'none'),
(10,'DM26033100001061','茶水晶','茶水晶','orange',8.0,'circle',10.00,'star_stone',-1,1,NULL,NULL,20,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','water',0.7,'寓意沉稳踏实，象征安定从容','沉稳·安定','搭配黄水晶，暖色系组合复古耐看',NULL,NULL,'none'),
(11,'DM26033100001162','茶水晶','茶水晶','orange',10.0,'circle',22.00,'star_stone',-1,1,NULL,NULL,21,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','water',1.4,'寓意沉稳踏实，象征安定从容','沉稳·安定','搭配黄水晶，暖色系组合复古耐看',NULL,NULL,'none'),
(12,'DM260331000012A8','绿幽灵水晶','幽灵水晶','green',8.0,'circle',35.00,'star_stone',-1,1,NULL,NULL,30,1,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','wood',0.7,'传统文化中寓意事业兴旺，象征生机盎然','事业·生机','搭配白水晶，绿白相间清新自然',NULL,NULL,'none'),
(13,'DM260331000013A4','绿幽灵水晶','幽灵水晶','green',10.0,'circle',58.00,'star_stone',-1,1,NULL,NULL,31,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','wood',1.4,'传统文化中寓意事业兴旺，象征生机盎然','事业·生机','搭配白水晶，绿白相间清新自然',NULL,NULL,'none'),
(14,'DM26033100001459','紫水晶','紫水晶','purple',8.0,'circle',25.00,'star_stone',-1,1,NULL,NULL,40,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','fire',0.7,'象征智慧与灵感，寓意浪漫高贵','智慧·灵感','搭配粉水晶，粉紫配色浪漫优雅',NULL,NULL,'none'),
(15,'DM26033100001526','紫水晶','紫水晶','purple',10.0,'circle',42.00,'star_stone',-1,1,NULL,NULL,41,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','fire',1.4,'象征智慧与灵感，寓意浪漫高贵','智慧·灵感','搭配粉水晶，粉紫配色浪漫优雅',NULL,NULL,'none'),
(16,'DM2603310000160C','紫水晶','紫水晶','purple',12.0,'circle',68.00,'star_stone',-1,1,NULL,NULL,42,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','fire',2.4,'象征智慧与灵感，寓意浪漫高贵','智慧·灵感','搭配粉水晶，粉紫配色浪漫优雅',NULL,NULL,'none'),
(17,'DM26033100001749','海蓝宝','蓝水晶','blue',8.0,'circle',30.00,'star_stone',-1,1,NULL,NULL,50,1,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','water',0.7,'象征勇气与平静，寓意心境开阔如海','平静·勇气','搭配白水晶，海洋色系清爽宜人',NULL,NULL,'none'),
(18,'DM26033100001817','海蓝宝','蓝水晶','blue',10.0,'circle',55.00,'star_stone',-1,1,NULL,NULL,51,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','water',1.4,'象征勇气与平静，寓意心境开阔如海','平静·勇气','搭配白水晶，海洋色系清爽宜人',NULL,NULL,'none'),
(19,'DM26033100001974','白水晶','白水晶','yellow',8.0,'circle',8.00,'star_stone',-1,1,NULL,NULL,60,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','metal',0.7,'被誉为「水晶之王」，象征纯净与专注','纯净·专注','百搭基础款，可衬托任意主珠色彩',NULL,NULL,'none'),
(20,'DM260331000020D8','白水晶','白水晶','yellow',10.0,'circle',15.00,'star_stone',-1,1,NULL,NULL,61,0,NULL,'2026-03-31 22:16:24','2026-07-10 06:47:37','beads','crystal','metal',1.4,'被誉为「水晶之王」，象征纯净与专注','纯净·专注','百搭基础款，可衬托任意主珠色彩',NULL,NULL,'none'),
(27,'DM26040900002721','绿宝石01','水晶·','green',10.0,'circle',0.00,'star_stone',-1,1,NULL,NULL,0,1,NULL,'2026-04-09 00:13:54','2026-07-10 06:47:37','beads','crystal','wood',1.4,'象征生机与希望，寓意欣欣向荣','生机·希望','搭配白水晶或金属隔片，更显灵动',NULL,NULL,'none');
/*!40000 ALTER TABLE `diy_materials` ENABLE KEYS */;
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
