# `devplan.md` - ระบบ Customer Complaint & Ticket System (304IP)

## 1. Project Overview (ภาพรวมโครงการ)
โครงการพัฒนาระบบ Web App (Mobile-Friendly) เพื่อทดแทนการบันทึกปัญหาลูกค้าระบบไฟฟ้า (Power), น้ำประปา (Water Supply) และสาธารณูปโภค (Facility) ที่เดิมทำในรูปแบบ Spreadsheet โดยระบบใหม่จะเน้นความรวดเร็วในการเปิด Ticket, การบันทึก Log การทำงานแบบ Real-time นาทีต่อนาที และการออก Dashboard อัตโนมัติ 

**Tech Stack ที่ใช้:**
*   **Frontend (UI/UX Mockup & Dev):** Vibecode (ทำหน้าเว็บและ Mobile View)
*   **Backend & Database:** Supabase (Auth, Postgres DB, Storage สำหรับเก็บรูป)
*   **Hosting:** Vercel

---

## 2. User Roles & Permissions (สิทธิ์การใช้งาน)
ระบบใน Vibecode จะต้องทำ Mockup แยกตาม Role ดังนี้:

1.  **Customer (ลูกค้าบริษัท):** เช่น บริษัท Dynamic, WD, Comform, Xinggaosheng เป็นต้น
    *   สร้าง Ticket ได้เฉพาะหมวด **Water Supply** และ **Facility** เท่านั้น (หมวด Power จะถูกซ่อน)
    *   ดูสถานะงาน ปักหมุดแผนที่ แนบรูป และทำประเมิน (Feedback)
2.  **CRM Team (ทีมลูกค้าสัมพันธ์):** เช่น คุณชลิตา, คุณพิชวัลดา, คุณพัชรากร
    *   สร้างบัญชีลูกค้า และสร้าง QR Code / Link สำหรับลงทะเบียนให้ลูกค้า
    *   เปิด Ticket แทนลูกค้าในกรณีฉุกเฉิน หรือรับเรื่องผ่านช่องทางอื่น (Tel, E-mail, Letter, Line)
    *   เปิด Ticket ภายใน (Internal Ticket) สำหรับหมวด **Power** 
    *   Assign งานให้ทีมหน้างาน
3.  **Technician / Operation (ทีมหน้างาน):** เช่น ทีม Area Inspector (AIS), ทีม Onduty, ทีมดับเพลิง 304IP
    *   รับงาน อัปเดตสถานะ (In Progress -> Resolved)
    *   **พิมพ์ Log เหตุการณ์แบบ Time-stamp** และอัปโหลดรูปผลการแก้ไข
4.  **Admin / Management (ผู้บริหาร):**
    *   ดูแดชบอร์ดสรุปผลภาพรวม (Marketing Report) เช่น กราฟแสดง Cause, Area Impact, Duration

---

## 3. Database Schema Concept (โครงสร้างข้อมูลสำหรับ Supabase)
เตรียม Table พื้นฐานเพื่อเชื่อมต่อกับ Vibecode:

*   **`users`**: เก็บข้อมูลผู้ใช้งานและ Role
*   **`companies`**: เก็บชื่อลูกค้า และพื้นที่ (Area: เช่น IP1, IP2, IP7 Phase 3, IP7 Phase 5, NPS)
*   **`tickets`**: เก็บข้อมูลหลักของตั๋ว
    *   `category`: Power, Water, Facility
    *   `sub_category` (Cause): เช่น Voltage Drop, Blackout, Slowly Water Flowing, Safety: Fire, Waste Water Treatment
    *   `channel`: Tel, E-mail, Letter, Line
    *   `location_lat_lng`: พิกัด Google Maps
    *   `status`: Open, In Progress, Resolved, Closed
*   **`ticket_logs`**: เก็บรายละเอียดการดำเนินงานแต่ละขั้นตอน (สำคัญมากสำหรับงาน Facility)
    *   ตัวอย่างข้อมูล: "เวลา 18.28 น. ทีม Area Inspector ตรวจสอบพบว่ามีไฟไหม้..."
*   **`media`**: เก็บ URL รูปถ่ายจากหน้างาน (อ้างอิง Supabase Storage)

---

## 4. UI Mockup Plan (รายการหน้าจอที่ต้องสร้างใน Vibecode)

**หน้าจอสำหรับ Customer (ลูกค้า)**
*   [ ] **Onboarding / Register Page:** หน้าลงทะเบียนผ่าน URL Parameter (เช่น สแกน QR แล้วระบบรู้เลยว่าเป็นบริษัท Dynamic พื้นที่ IP7 Phase 5)
*   [ ] **Create Ticket (Mobile View):** 
    *   มีปุ่ม "ใช้ตำแหน่งปัจจุบัน" (Current Location) สำหรับ Google Maps
    *   มีปุ่ม "อัปโหลดรูปภาพ"
    *   Dropdown เลือกปัญหา (ไม่มี Power ให้เลือก)
*   [ ] **Ticket Tracking & Feedback:** หน้าดูสถานะและให้ดาวประเมินตอนปิดงาน

**หน้าจอสำหรับ CRM & Technician (หลังบ้านและหน้างาน)**
*   [ ] **CRM Workspace / Ticket Board:** แสดงรายการ Ticket ทั้งหมด สามารถ Filter ตามโซนพื้นที่หรือสถานะได้
*   [ ] **Create Internal Ticket (CRM):** ฟอร์มที่สามารถเลือกช่องทางการติดต่อ (Tel, Line, Email) และสร้างตั๋วระบบไฟฟ้า (Power) ได้
*   [ ] **Resolution Details & Logs (Mobile View สำหรับช่าง):**
    *   มีปุ่ม **"Add Log"** สำหรับบันทึกความคืบหน้าแบบนาทีต่อนาที (ระบบจับเวลา Timestamp อัตโนมัติเมื่อกดบันทึก) เพื่อเก็บ Log เช่น การเรียกรถดับเพลิง หรือการปรับลดวาล์วน้ำเสีย
    *   ปุ่มอัปเดตสถานะเปลี่ยนเป็น Resolved พร้อมช่องแนบรูปถ่าย

**หน้าจอสำหรับ Admin (Dashboard)**
*   [ ] **Marketing Report Dashboard:** สร้างหน้ากราฟสรุปแบบ Real-time เลียนแบบรายงานเดิม
    *   *Pie Chart 1:* Cause of Power interruption (เช่น Animal Fault, Unidentify)
    *   *Pie Chart 2:* Water interruption by Area
    *   *Pie Chart 3:* Type of Complaint (Complain vs Request)

---

## 5. Workflow & Automation Logic (ระบบอัตโนมัติที่ต้องวางแผน)

1.  **Ticket Creation Routing:**
    *   *เงื่อนไข:* ถ้าลูกค้ากดเปิด Ticket ระบบแจ้งเตือนจะวิ่งไปที่ CRM ก่อน
    *   *เงื่อนไข:* ถ้าเป็นเรื่องด่วน (เช่น ไฟไหม้) CRM สามารถกดเปลี่ยนผู้รับผิดชอบ (Response by) โยนให้ทีม Area Inspector ทันที
2.  **Auto-Close Mechanism (SLA/Feedback):**
    *   เมื่อช่างทำงานเสร็จและเปลี่ยนสถานะเป็น `Resolved` ระบบจะเริ่มนับเวลา
    *   ถ้าลูกค้าเข้ามาทำ Feedback -> เปลี่ยนเป็น `Closed`
    *   ถ้าลูกค้าไม่ตอบสนองภายใน **48 ชั่วโมง** (ตั้งค่าได้) -> ระบบจะรัน Automation (Cron Job) เปลี่ยนเป็น `Closed` อัตโนมัติ
3.  **Dynamic Forms (Vibecode Conditionals):**
    *   ถ้า Category = `Power` -> แสดงฟิลด์ `Duration (Min.)`
    *   ถ้า Category = `Facility` -> แสดงฟิลด์ `Contact Person` และเบอร์โทรติดต่อ

---

## 6. Next Steps สำหรับทีมพัฒนา
1.  **Setup Supabase:** สร้าง Project ใหม่, สร้างตาราง (Tables) ตามโครงสร้างข้อ 3, และเปิดใช้งาน Google Auth / Email Auth
2.  **Vibecode UI Design:** เริ่มลากวาง UI Components ตามรายการข้อ 4 โดยเน้น Mobile-first design เนื่องจากทีมช่างและลูกค้าต้องใช้งานหน้างานจริงเป็นหลัก
3.  **API Integration:** เชื่อมต่อ Vibecode เข้ากับ Supabase REST API เพื่อทดสอบการสร้าง Ticket แบบมีรูปภาพและพิกัด GPS
4.  **Deploy Mockup:** นำ Mockup โฮสต์ขึ้น Vercel และทดสอบการยิง Parameter QR Code สำหรับจำลองการ Onboarding ลูกค้า

*** 

**คำแนะนำเพิ่มเติมสำหรับการทำ Mockup:** ใน Vibecode คุณสามารถใช้ Component "Timeline" หรือ "List" มาทำเป็นหน้าแสดง Log ของช่างหน้างานได้เลยครับ เพราะจากข้อมูลเดิม การบันทึกปัญหาอย่างเช่น น้ำเสียล้น (Waste Water Treatment) หรือ ไฟไหม้ (Safety: Fire) จะมีการอัปเดตเวลาถี่ยิบมาก การทำหน้า UI ส่วนนี้ให้กดง่ายพิมพ์ง่ายที่สุด จะตอบโจทย์ Best Practice สำหรับทีมหน้างานครับ