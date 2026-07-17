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
) ENGINE=InnoDB AUTO_INCREMENT=175 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='DIY 珠子/宝石素材表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `diy_materials`
--

LOCK TABLES `diy_materials` WRITE;
/*!40000 ALTER TABLE `diy_materials` DISABLE KEYS */;
INSERT INTO `diy_materials` VALUES
(117,'DM26071500011736','净体白水晶','净体白水晶','white',12.0,'circle',15.00,'star_stone',-1,1,177,NULL,1,1,'{\"demo_code\": \"white-jingti-12\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'净化气场，提升专注与灵性，被誉为「水晶之王」。','净化 · 清明','百搭主珠，与紫/粉水晶皆宜',NULL,NULL,'none'),
(118,'DM2607150001189D','净体白水晶','净体白水晶','white',8.0,'circle',5.00,'star_stone',-1,1,177,NULL,2,1,'{\"demo_code\": \"white-jingti-8\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'净化气场，提升专注与灵性，被誉为「水晶之王」。','净化 · 清明','百搭主珠，与紫/粉水晶皆宜',NULL,NULL,'none'),
(119,'DM260715000119F4','奶白晶','奶白晶','white',12.0,'circle',11.00,'star_stone',-1,1,178,NULL,3,1,'{\"demo_code\": \"white-naibai-12\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','stone',NULL,NULL,'温润柔和，助眠安神，适合日常佩戴。','净化 · 清明','百搭主珠，与紫/粉水晶皆宜',NULL,NULL,'none'),
(120,'DM2607150001203A','奶白晶','奶白晶','white',8.0,'circle',4.00,'star_stone',-1,1,178,NULL,4,1,'{\"demo_code\": \"white-naibai-8\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','stone',NULL,NULL,'温润柔和，助眠安神，适合日常佩戴。','净化 · 清明','百搭主珠，与紫/粉水晶皆宜',NULL,NULL,'none'),
(121,'DM260715000121C2','婚纱闪白阿塞','婚纱闪白阿塞','white',12.0,'circle',8.00,'star_stone',-1,1,176,NULL,5,1,'{\"demo_code\": \"white-hunsha-12\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'通透闪耀，象征纯洁与新的开始。','净化 · 清明','百搭主珠，与紫/粉水晶皆宜',NULL,NULL,'none'),
(122,'DM2607150001224B','婚纱闪白阿塞','婚纱闪白阿塞','white',8.0,'circle',4.00,'star_stone',-1,1,176,NULL,6,1,'{\"demo_code\": \"white-hunsha-8\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'通透闪耀，象征纯洁与新的开始。','净化 · 清明','百搭主珠，与紫/粉水晶皆宜',NULL,NULL,'none'),
(123,'DM260715000123FD','白水晶刻面方糖','白水晶刻面方糖','white',9.0,'circle',10.00,'star_stone',-1,1,175,NULL,7,1,'{\"demo_code\": \"white-fangtang-9\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','metal',NULL,NULL,'多切面折射光泽，招财纳福。','净化 · 清明','百搭主珠，与紫/粉水晶皆宜',NULL,NULL,'none'),
(124,'DM2607150001248A','白水晶药片珠','白水晶药片珠','white',8.7,'ellipse',5.00,'star_stone',-1,1,180,NULL,8,1,'{\"demo_code\": \"white-yaopian\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'小巧点缀，平衡整串比例。','净化 · 清明','百搭主珠，与紫/粉水晶皆宜',8.7,3.6,'along_width'),
(125,'DM260715000125A9','白水晶跑环','白水晶跑环','white',14.5,'ellipse',16.00,'star_stone',-1,1,179,NULL,9,1,'{\"demo_code\": \"white-paohuan\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'管珠造型，串联点睛，增添层次。','净化 · 清明','百搭主珠，与紫/粉水晶皆宜',14.5,4.5,'along_length'),
(126,'DM260715000126C3','星光粉晶','星光粉晶','pink',12.0,'circle',28.00,'star_stone',-1,1,169,NULL,10,1,'{\"demo_code\": \"pink-xingguang-12\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'招桃花、旺人缘，柔化人际关系。','爱情 · 人缘','搭配白水晶提亮，或紫水晶添柔',NULL,NULL,'none'),
(127,'DM260715000127A9','星光粉晶','星光粉晶','pink',8.0,'circle',9.00,'star_stone',-1,1,169,NULL,11,1,'{\"demo_code\": \"pink-xingguang-8\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'招桃花、旺人缘，柔化人际关系。','爱情 · 人缘','搭配白水晶提亮，或紫水晶添柔',NULL,NULL,'none'),
(128,'DM260715000128E0','紫粉晶','紫粉晶','pink',12.0,'circle',16.00,'star_stone',-1,1,170,NULL,12,1,'{\"demo_code\": \"pink-zifen-12\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'兼具粉晶与紫晶能量，安抚情绪。','爱情 · 人缘','搭配白水晶提亮，或紫水晶添柔',NULL,NULL,'none'),
(129,'DM26071500012917','紫粉晶','紫粉晶','pink',8.0,'circle',6.00,'star_stone',-1,1,170,NULL,13,1,'{\"demo_code\": \"pink-zifen-8\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'兼具粉晶与紫晶能量，安抚情绪。','爱情 · 人缘','搭配白水晶提亮，或紫水晶添柔',NULL,NULL,'none'),
(130,'DM2607150001303C','蜜桃粉晶','蜜桃粉晶','pink',12.0,'circle',13.00,'star_stone',-1,1,168,NULL,14,1,'{\"demo_code\": \"pink-mitao-12\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','stone',NULL,NULL,'甜美温柔，提升亲和力与自信。','爱情 · 人缘','搭配白水晶提亮，或紫水晶添柔',NULL,NULL,'none'),
(131,'DM26071500013181','蜜桃粉晶','蜜桃粉晶','pink',8.0,'circle',4.00,'star_stone',-1,1,168,NULL,15,1,'{\"demo_code\": \"pink-mitao-8\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','stone',NULL,NULL,'甜美温柔，提升亲和力与自信。','爱情 · 人缘','搭配白水晶提亮，或紫水晶添柔',NULL,NULL,'none'),
(132,'DM26071500013224','乌拉圭紫水晶','乌拉圭紫水晶','purple',12.0,'circle',37.00,'star_stone',-1,1,173,NULL,16,1,'{\"demo_code\": \"purple-wulagui-12\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'开智增慧，助眠安神，色泽浓郁。','智慧 · 安神','搭配白水晶点缀，气质沉静',NULL,NULL,'none'),
(133,'DM260715000133B2','乌拉圭紫水晶','乌拉圭紫水晶','purple',8.0,'circle',12.00,'star_stone',-1,1,173,NULL,17,1,'{\"demo_code\": \"purple-wulagui-8\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'开智增慧，助眠安神，色泽浓郁。','智慧 · 安神','搭配白水晶点缀，气质沉静',NULL,NULL,'none'),
(134,'DM260715000134AE','巴西紫水晶','巴西紫水晶','purple',12.0,'circle',56.00,'star_stone',-1,1,171,NULL,18,1,'{\"demo_code\": \"purple-baxi-12\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'经典紫调，象征智慧与高贵。','智慧 · 安神','搭配白水晶点缀，气质沉静',NULL,NULL,'none'),
(135,'DM26071500013562','巴西紫水晶','巴西紫水晶','purple',8.0,'circle',18.00,'star_stone',-1,1,171,NULL,19,1,'{\"demo_code\": \"purple-baxi-8\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'经典紫调，象征智慧与高贵。','智慧 · 安神','搭配白水晶点缀，气质沉静',NULL,NULL,'none'),
(136,'DM26071500013667','紫水晶跑环','紫水晶跑环','purple',14.5,'ellipse',24.00,'star_stone',-1,1,172,NULL,20,1,'{\"demo_code\": \"purple-paohuan\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'管珠造型，串联提亮整串气质。','智慧 · 安神','搭配白水晶点缀，气质沉静',14.5,4.2,'along_length'),
(137,'DM260715000137E8','薰衣草紫水晶','薰衣草紫水晶','purple',8.0,'circle',8.00,'star_stone',-1,1,174,NULL,21,1,'{\"demo_code\": \"purple-xunyicao-8\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','matte',NULL,NULL,'淡雅浪漫，舒缓压力，助放松。','智慧 · 安神','搭配白水晶点缀，气质沉静',NULL,NULL,'none'),
(138,'DM260715000138F0','暴力黄黄水晶','暴力黄黄水晶','yellow',10.0,'circle',67.00,'star_stone',-1,1,181,NULL,22,1,'{\"demo_code\": \"yellow-baoli-10\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'招正财、聚财气，色泽饱满明亮。','财富 · 活力','搭配白水晶或作点睛主珠',NULL,NULL,'none'),
(139,'DM260715000139A6','暴力黄黄水晶','暴力黄黄水晶','yellow',8.0,'circle',32.00,'star_stone',-1,1,181,NULL,23,1,'{\"demo_code\": \"yellow-baoli-8\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'招正财、聚财气，色泽饱满明亮。','财富 · 活力','搭配白水晶或作点睛主珠',NULL,NULL,'none'),
(140,'DM26071500014019','透体柠檬黄水晶','透体柠檬黄水晶','yellow',12.0,'circle',19.00,'star_stone',-1,1,183,NULL,24,1,'{\"demo_code\": \"yellow-ningmeng-12\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'清透明黄，带来活力与好心情。','财富 · 活力','搭配白水晶或作点睛主珠',NULL,NULL,'none'),
(141,'DM2607150001414A','透体柠檬黄水晶','透体柠檬黄水晶','yellow',8.0,'circle',6.00,'star_stone',-1,1,183,NULL,25,1,'{\"demo_code\": \"yellow-ningmeng-8\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'清透明黄，带来活力与好心情。','财富 · 活力','搭配白水晶或作点睛主珠',NULL,NULL,'none'),
(142,'DM26071500014255','黄塔晶','黄塔晶','yellow',12.0,'circle',20.00,'star_stone',-1,1,182,NULL,26,1,'{\"demo_code\": \"yellow-huangta-12\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'能量聚焦，增强行动力与决断。','财富 · 活力','搭配白水晶或作点睛主珠',NULL,NULL,'none'),
(143,'DM26071500014395','黄塔晶','黄塔晶','yellow',8.0,'circle',7.00,'star_stone',-1,1,182,NULL,27,1,'{\"demo_code\": \"yellow-huangta-8\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'能量聚焦，增强行动力与决断。','财富 · 活力','搭配白水晶或作点睛主珠',NULL,NULL,'none'),
(144,'DM2607150001448E','托帕石·冰湖蓝','托帕石','blue',8.0,'circle',30.00,'star_stone',-1,1,161,NULL,100,1,'{\"demo_code\": \"demo-gem-blue\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'十一月生辰石，象征真挚与好运，蓝调清澈如冰湖。',NULL,NULL,NULL,NULL,'none'),
(145,'DM260715000145F1','粉蓝宝·蔷薇粉','粉蓝宝','red',8.0,'circle',45.00,'star_stone',-1,1,163,NULL,101,1,'{\"demo_code\": \"demo-gem-pink\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'温柔而炽烈的蔷薇色调，寓意浪漫与忠贞。',NULL,NULL,NULL,NULL,'none'),
(146,'DM260715000146D9','沙弗莱·翠绿','沙弗莱','green',8.0,'circle',58.00,'star_stone',-1,1,162,NULL,102,1,'{\"demo_code\": \"demo-gem-green\", \"price_note\": \"占位星石价=演示价(元)向上取整，正式价由运营调整（拍板2）\"}','2026-07-15 21:03:09','2026-07-15 21:03:09','beads','crystal',NULL,NULL,'浓郁翠绿如初夏森林，象征生机与富足。',NULL,NULL,NULL,NULL,'none');
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

-- Dump completed on 2026-07-16  3:11:49
