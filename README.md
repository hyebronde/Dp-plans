# DP Plans · วางแผนไฟและช็อตจากมุมบน

เว็บแอป (PWA) สำหรับช่างภาพและทีมถ่ายทำ ใช้วางผังห้อง ไฟ กล้อง และนักแสดงจากมุมบน ผูกภาพบล็อกช็อตเข้ากับ Shot list แล้วส่งออกให้ทีมงาน
ข้อมูลเก็บในเครื่องผู้ใช้เท่านั้น (IndexedDB) และใช้งานออฟไลน์ได้

เปิดแอป: https://hyebronde.github.io/dp-plans/
(บน iPad / iPhone: Safari → แชร์ → เพิ่มไปยังหน้าจอโฮม)


## ฟีเจอร์
- **หน้าตา Frost Pastel** พื้นฝ้า การ์ดเทาควัน/ครีม/ไล่สี ปุ่มแคปซูล ตัวเลขฟอนต์จุด (Doto) โลโก้ลูกแก้วแสงส้ม-น้ำเงิน
- **วาดห้องแบบแม่เหล็ก:** ปลายผนังดูดติดกัน, ต่อกลางผนังแบบ T, ลากกลับจุดเริ่มเพื่อ "ปิดห้อง ✓", ล็อกมุม 45°/90°, ประตูและหน้าต่างดูดเข้าผนังและหมุนตามแนวผนัง, เฟอร์นิเจอร์ชิดผนัง (เปิด/ปิดได้ในแท็บซีน)
- **ผนัง 2 แบบ:** เส้นทึบ หรือบล็อกแบบ diagram ของ DP
- **ไฟ:** COB/Softbox, Fresnel, Lantern, Panel, Soft panel, Flex mat, Tube, PAR, HMI, Space light, Balloon, Practical พร้อม K, RGB, dimmer, modifier และ**เจล** (CTO/CTB/Green/ND/Deep Blue) ที่เปลี่ยนสีลำแสงตามจริง
- **รุ่นไฟตามขนาดกอง:** เล็ก (amaran, SmallRig, Godox, Nanlite) · กลาง (Aputure STORM/LS/Nova, Nanlux Evoke, Astera, Quasar, Litepanels) · ใหญ่ (ARRI SkyPanel/Orbiter/HMI, Electro Storm, Creamsource, Kino Flo, Mole-Richardson, Balloon) ค้นหาได้
- **กริป:** Diffusion frame, Butterfly/Overhead, Bounce, Neg, Flag/Cutter, Net ตามขนาดจริง (18×24 นิ้ว ถึง 20×20 ฟุต) พร้อมผ้า (¼–Full Grid, Silk, Magic Cloth, Ultrabounce, Muslin, Solid ฯลฯ), Reflector, C-stand, Hazer
- **เล็งไปที่:** ไฟหรือกล้องล็อกทิศตามนักแสดงหรือเฟรม ย้ายแล้วยังเล็งตาม
- **ป้ายแบบ DP:** หน้าที่ · รุ่นในแคปซูลเข้ม · K · W · เจล
- **Ref board ต่อซีน:** แปะภาพเรฟหลายภาพ ดึงพาเลตสีอัตโนมัติ ขีดทิศแสงทับภาพ ภาพหลักขึ้นหัว PDF
- **Shot list** ผูกกับกล้องบนแปลน แนบภาพบล็อก/reference ได้
- **ส่งออก:** PDF breakdown (ภาพเรฟ + พาเลต + แปลน + ช็อต + ไฟ), PNG, ภาพแปลน, CSV สำหรับ Sheets, รายการอุปกรณ์, ไฟล์โปรเจกต์
- Undo/Redo, pinch-zoom, ปุ่มลัด (V W A P M T, R หมุน, ⌘Z, ⌘D, Delete)

ข้อมูลรุ่นไฟมาจากการค้นข้อมูลล่าสุดร่วมกับความรู้เดิม ควรเช็กสเปกกับเว็บผู้ผลิตก่อนใช้จริง

## ไฟล์
- `index.html`: หน้าตาและสไตล์
- `app.js`: ตัวแอปทั้งหมด (ไม่มี dependency และมีตัวสร้าง PDF ในตัว)
- `sw.js`: แคชสำหรับใช้งานออฟไลน์ (scope เฉพาะ `/dp-plans/`)

## แผนต่อไป
- แอป iOS (Swift + Apple RoomPlan) สำหรับสแกนห้องด้วย LiDAR แล้วสร้างแปลนอัตโนมัติ
- จำลองทิศแสงอาทิตย์ตามเวลาและทิศของหน้าต่าง
- แชร์ลิงก์ให้ทีมดู / คอมเมนต์ร่วมกัน
