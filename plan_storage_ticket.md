# CRM 304IP — Hybrid Storage Integration & Clean Architectural Pattern
> **สถานะ**: Finalized (ใช้งานจริงบน Production)
> **วัตถุประสงค์**: เอกสารสรุปสถาปัตยกรรมและ Logic ทั้งหมดในการรวมระบบพื้นที่เก็บข้อมูล (Cloudflare R2 + Supabase) เพื่อเป็นแนวทางปฏิบัติที่ดีที่สุด (Best Practices) สำหรับการพัฒนาโปรเจกต์อื่น ๆ ในอนาคต

---

## 📌 1. ปัญหาต้นแบบและการออกแบบสถาปัตยกรรม (The Problem & Architecture)

### 🔴 ปัญหาที่พบในระบบแบบดั้งเดิม (The Classic Problem)
เมื่อผู้ใช้งานเปิดหน้าสร้าง Ticket/แบบฟอร์ม และทำการเลือกรูปภาพหรือวิดีโอเพื่ออัปโหลด:
1. **การอัปโหลดเกิดขึ้นทันทีตอนกรอกฟอร์ม (Client-side Direct Upload)**: ระบบต้องอัปโหลดขึ้น Cloud Storage ทันทีเพื่อให้แสดงเปอร์เซ็นต์ความคืบหน้า (Progress Bar) และแสดงรูปตัวอย่าง (Preview) ได้ลื่นไหล
2. **เกิดปัญหาขยะสะสม (Orphaned Files)**: หากผู้ใช้อัปโหลดไฟล์เสร็จแล้ว แต่สุดท้าย **"กดปิดหน้าต่าง"** หรือ **"เน็ตหลุด"** โดยไม่ได้กดส่งฟอร์ม (Submit) ไฟล์เหล่านั้นจะกลายเป็นไฟล์ขยะค้างอยู่ใน Cloud Storage ตลอดไป สิ้นเปลืองค่าใช้จ่ายและพื้นที่โดยเปล่าประโยชน์

### 🟢 แนวทางแก้ไขที่ดีที่สุด: Option A (Draft Separation + Serverless Copy-on-Submit)
ระบบแบ่งช่วงชีวิตของไฟล์ออกเป็น 2 ช่วงอย่างชัดเจน:
* **ช่วงที่ 1: สถานะชั่วคราว (Draft Phase)**: ไฟล์ถูกอัปโหลดไปเก็บที่โฟลเดอร์ชั่วคราวที่ขึ้นต้นด้วย `drafts/`
* **ช่วงที่ 2: สถานะจริง (Finalized Phase)**: เมื่อกดส่งฟอร์มสำเร็จ Serverless Function จะทำการย้ายไฟล์ (Copy + Delete) ไปยังโฟลเดอร์จริงของ Ticket
* **ช่วงกวาดขยะ (Lifecycle Auto-Sweep)**: ใช้ฟีเจอร์ฟรีของ Cloudflare R2 ในการลบไฟล์ที่คาอยู่ใน `drafts/` ที่มีอายุเกิน 2 วันทิ้งโดยอัตโนมัติ

```mermaid
graph TD
    A[User Selects Files in Form] -->|1. Generate Draft ID| B(draft-yymmdd-xxxx)
    B -->|2. Upload directly via Client| C[R2 Storage: drafts/draft-yymmdd-xxxx/...]
    
    subgraph Submission Flow (Finalization)
        D[User Clicks Submit Form] -->|3. Save Ticket DB| E[Supabase: Create Ticket T260518-0001]
        E -->|4. Trigger Serverless Function| F[Netlify: finalize-attachments]
        F -->|5. Copy S3 Objects| G[R2 Storage: T260518-0001/...]
        F -->|6. Delete Original Drafts| C
        G -->|7. Return Final URLs| H[DB Log Update: media_urls]
    end

    subgraph Auto Cleanup (Cloudflare Policy)
        C -->|Abandoned Drafts > 2 Days| I[R2 Lifecycle Rule: Auto Delete]
    end
    
    style C fill:#ffe3e3,stroke:#ff8080
    style G fill:#d4edda,stroke:#28a745
    style I fill:#f8d7da,stroke:#dc3545
```

---

## 📌 2. รายละเอียด Logic ฝั่ง Client-side (Frontend Best Practices)

### 2.1 การจัดการชื่อโฟลเดอร์ชั่วคราว (Organized Draft Generator)
ระบบไม่ใช้เลขสุ่มยาว ๆ ที่ไม่มีความหมาย แต่ใช้โครงสร้าง **`draft-yymmdd-xxxx`** เพื่อให้ผู้ดูแลระบบมองเห็นและทราบทันทีว่าไฟล์นั้นถูกสร้างขึ้นวันที่เท่าไร:
```typescript
function generateDraftId(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6); // 4-char string
  return `draft-${yy}${mm}${dd}-${rand}`;
}
```

### 2.2 การจำกัดและควบคุมขนาดของวิดีโอ (Video Upload Guardrail)
เพื่อประสิทธิภาพในการรับส่งข้อมูล และควบคุมไม่ให้เกิดการอัปโหลดไฟล์ขนาดใหญ่เกินความจำเป็น:
* **ขนาดสูงสุดต่อไฟล์**: 50MB
* **ความยาวคลิปสูงสุด**: 5 นาที (300 วินาที)

#### 💡 เทคนิคการเช็คความยาววิดีโอก่อนอัปโหลด (HTML5 Dynamic Validation):
การตรวจสอบขนาดไฟล์ทำได้ง่ายผ่าน `file.size` แต่ความยาววิดีโอระบบต้องทำการดึง **Metadata** ของไฟล์คลิปนั้นขึ้นมาพาร์สแบบ Asynchronous ก่อนเริ่มทำการส่งไฟล์จริง:
```typescript
const validateVideoDuration = (file: File): Promise<boolean> => {
  return new Promise((resolve) => {
    if (!file.type.startsWith('video/')) {
      resolve(true); // ข้ามหากไม่ใช่ไฟล์วิดีโอ
      return;
    }

    const videoElement = document.createElement('video');
    videoElement.preload = 'metadata';
    videoElement.src = URL.createObjectURL(file);
    
    videoElement.onloadedmetadata = () => {
      URL.revokeObjectURL(videoElement.src);
      const duration = videoElement.duration;
      console.log(`[Video Valid] Name: ${file.name}, Duration: ${duration}s`);
      resolve(duration <= 300); // ต้องยาวไม่เกิน 5 นาที (300 วินาที)
    };

    videoElement.onerror = () => {
      URL.revokeObjectURL(videoElement.src);
      resolve(false); // ปฏิเสธไฟล์หากเกิดข้อผิดพลาดในการโหลดไฟล์คลิป
    };
  });
};
```

---

## 📌 3. รายละเอียด Logic ฝั่ง Server-side (Serverless Best Practices)

### 3.1 การบังคับจัดเก็บลงพรีฟิกซ์ `drafts/` บน API อัปโหลด
ในฟังก์ชันการสร้าง Presigned URL หรือการอัปโหลดโดยตรง หากระบุปลายทางเป็น `ticketId` ที่ขึ้นต้นด้วยคำว่า `draft-` ระบบจะบังคับป้อนพรีฟิกซ์เป็น `drafts/` ให้อัตโนมัติ:
```typescript
const rawFolder = ticketId ? ticketId.trim() : 'temp';
// หากเป็น Draft ให้ย้ายไปเก็บที่โฟลเดอร์หลัก drafts/ เพื่อเตรียมการลบอัตโนมัติ
const folder = rawFolder.startsWith('draft-') ? `drafts/${rawFolder}` : rawFolder;
const fileName = `${folder}/${randomUUID()}-${Date.now()}.${ext}`;
```

### 3.2 ระบบ Serverless Finalization (`finalize-attachments.ts`)
เมื่อผู้ใช้กดสร้าง Ticket สำเร็จเป็นเรคคอร์ดใน Supabase แล้ว Client จะส่งคำสั่งไปที่ Netlify Function เพื่อทำการย้ายไฟล์ชั่วคราวทั้งหมดไปยังโฟลเดอร์จริงตาม Ticket ID (เช่น `T260518-0001`):

> **กฎเหล็กของ Cloudflare R2**: ในการเชื่อมต่อผ่าน `@aws-sdk/client-s3` จำเป็นต้องระบุตั้งค่า **`forcePathStyle: true`** เสมอ เพื่อหลีกเลี่ยงความล้มเหลวในการแลกเปลี่ยน SSL Handshake บนโดเมนย่อยเฉพาะของ R2

#### 💻 ตัวโค้ดการทำธุรกรรมย้ายไฟล์ในฝั่ง Serverless:
```typescript
import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// 1. ค้นหาไฟล์ทั้งหมดที่เกี่ยวข้องกับ Draft ID นั้น
const listResult = await r2.send(new ListObjectsV2Command({
  Bucket: bucketName,
  Prefix: `drafts/${draftId}/`,
}));

const objects = listResult.Contents || [];
const finalizedUrls: string[] = [];

// 2. วนลูปเพื่อ Copy ไปโฟลเดอร์จริง และ Delete ของชั่วคราวทิ้งทันที
for (const obj of objects) {
  if (!obj.Key) continue;

  const filename = obj.Key.substring(`drafts/${draftId}/`.length);
  if (!filename) continue;

  const targetKey = `${ticketId}/${filename}`;

  // คัดลอกรูปภาพ/วิดีโอ (เกิดที่ data-center ของ R2 โดยตรง เร็วจัดระดับมิลลิวินาที)
  await r2.send(new CopyObjectCommand({
    Bucket: bucketName,
    CopySource: encodeURIComponent(`${bucketName}/${obj.Key}`), // ต้อง URL Encoded เสมอ
    Key: targetKey,
  }));

  // ลบทิ้งต้นทางเพื่อความสะอาดของระบบทันที
  await r2.send(new DeleteObjectCommand({
    Bucket: bucketName,
    Key: obj.Key,
  }));

  finalizedUrls.push(`${publicDomain}/${targetKey}`);
}
```

---

## 📌 4. วิธีการตั้งค่า Object Lifecycle Rule บน Cloudflare R2
เพื่อความยืดหยุ่นในกรณีที่ผู้ใช้งานอัปโหลดไฟล์ค้างไว้ในระบบแล้ว **"ไม่ได้ส่งบิลเข้ามาจริง"** หรืออินเทอร์เน็ตหลุดระหว่างทาง ทำให้ไม่มีการยิงคำสั่ง Finalize จาก Client -> ให้ทำการเปิดนโยบาย Lifecycle Policy บนหลังบ้านของ Cloudflare เพื่อล้างโฟลเดอร์ชั่วคราวทิ้งอัตโนมัติ:

1. เข้าหน้าควบคุม **Cloudflare Console** -> เลือก **R2 Storage**
2. เลือก Bucket: **`crm-304ip-attachments`** -> คลิกแท็บ **Settings**
3. ค้นหาหัวข้อ **Object Lifecycle Rules** -> คลิก **Add Rule**
4. ตั้งค่าเงื่อนไข:
   * **Rule name**: `Purge Temporary Uploads`
   * **Target prefix**: **`drafts/`** *(สิ่งสำคัญสูงสุดคือเครื่องหมาย `/` เพื่อเจาะจงเฉพาะโฟลเดอร์ดราฟต์)*
   * **Action**: **Delete objects**
   * **Age (days)**: **2 day(s)**
5. คลิก **Save rule**

---

## 📌 5. สรุปเช็คลิสต์สำหรับการทำโปรเจกต์ถัดไป (Next Projects Checklist)
หากต้องการนำสถาปัตยกรรมนี้ไปใช้กับโมดูลอัปโหลดไฟล์ในระบบอื่น ๆ สามารถทำตามขั้นตอนนี้ได้ทันที:

* [ ] **Generate Temporary Key**: เมื่อฟอร์มเปิดขึ้นมา ให้สร้างรหัส Draft ID ที่มีโครงสร้างระบุวันที่อย่างชัดเจน (เช่น `draft-yymmdd-xxxx`)
* [ ] **Isolated Prefix Storage**: บังคับให้ไฟล์อัปโหลดระหว่างเขียนฟอร์มไปเก็บไว้ภายใต้ `drafts/{draftId}/`
* [ ] **Pre-upload Validation**: เช็คไซส์ (แนะนำไม่เกิน 10-50MB) และเช็คความยาวไฟล์วิดีโอด้วยเทคนิค HTML5 Metadata (แนะนำไม่เกิน 5 นาที) ก่อนอัปโหลดจริง
* [ ] **Draft Cleanup Policy**: เข้าไปกดเปิด R2 Object Lifecycle Rule บน Cloudflare ครอบพรีฟิกซ์ `drafts/` เพื่อตัดปัญหาไฟล์ขยะสะสม
* [ ] **Atomic Copy-on-Submit**: เมื่อผู้ใช้งานส่งฟอร์มสำเร็จ ให้ทำ Server-Side Copy ย้ายรูปทั้งหมดไปโฟลเดอร์ถาวร แล้วจึงบันทึก URL ใหม่กลับสู่ฐานข้อมูล

> เอกสารนี้เขียนขึ้นเพื่อใช้เป็นหลักฐานและแนวทางการอ้างอิงสถาปัตยกรรมระบบเก็บไฟล์ที่ดีที่สุดขององค์กรอย่างยั่งยืน
