# Storage Migration Plan: Supabase → Cloudflare R2 (Hybrid)
> **โปรเจค:** CRM 304IP Ticket System  
> **Last updated:** 2026-05-18  
> **Status:** Planning  
> **Decision basis:** Real data — 21 files, 14.3 MB, วิดีโอ 1 ไฟล์ = 91% ของพื้นที่  
> **Target deadline:** Implement by end of June 2026 (ก่อนใช้ Supabase Free Tier หมด)

---

## 📊 ทำไมต้องย้าย

### ข้อมูลจริง (18 พ.ค. 2026)

| Metric | ค่าปัจจุบัน | หมายเหตุ |
|---|---|---|
| ไฟล์ทั้งหมด | 21 ไฟล์ / 14.3 MB | ใน bucket `ticket-attachments` |
| **วิดีโอ** | **1 ไฟล์ = 13.0 MB (91%)** | ⚠️ ตัวการหลัก |
| รูปภาพ | 20 ไฟล์ = 1.4 MB | เฉลี่ย ~70 KB/ไฟล์ |
| Supabase Free Tier | 1 GB | |
| ใช้ไปแล้ว | ~14.3 MB (1.4%) | ยังน้อย แต่... |

### ⚠️ ทำไมวิดีโอคือ "time bomb"

```
วิดีโอ 1 ไฟล์ = ~13 MB
ถ้า ticket แนบวิดีโอ 1 ไฟล์/วัน × 30 วัน = ~390 MB/เดือน
Supabase 1 GB Free → หมดใน ~2.5 เดือน
ถ้าเพิ่มขึ้น 2x → หมดใน 6 สัปดาห์ 🔥
```

### เปรียบเทียบต้นทุน

| Storage | ปัจจุบัน | หลัง 1 GB เต็ม |
|---|---|---|
| Supabase | $0 | $25/เดือน (Pro plan) |
| Cloudflare R2 | $0 | **$0 จนถึง 10 GB** → หลังจากนั้น $0.015/GB |
| ประหยัดได้ | — | ≥ $25/เดือน |

---

## 🗺️ สถาปัตยกรรม: Hybrid Mode (Permanent)

```
[ไฟล์เก่า (ก่อน Migration)]    [ไฟล์ใหม่ (หลัง Migration)]
  Supabase Storage                 Cloudflare R2
  bucket: ticket-attachments  →   bucket: crm-304ip-attachments
  supabase.co/storage/v1/...       pub-xxxx.r2.dev/...
         │                               │
         └──────────────┬────────────────┘
                        ↓
          ticket_logs.media_urls (URL array)
          ← ไม่แก้ schema เลย →
```

**หลักการ:** `ticket_logs.media_urls` เก็บแค่ URL string — frontend render ได้ทั้งสองแหล่ง

---

## ⚙️ Tech Stack จริงของโปรเจคนี้

| Layer | Technology |
|---|---|
| Frontend | **Vite + React 19 SPA** |
| Deploy | **Netlify** (ไม่ใช่ Vercel!) → ใช้ Netlify Functions |
| Database | Supabase PostgreSQL (ไม่แตะ) |
| Storage เดิม | Supabase bucket `ticket-attachments` (ปล่อยไว้) |
| Storage ใหม่ | Cloudflare R2 via S3-Compatible API |
| SDK (server-side) | `@aws-sdk/client-s3` ใน **Netlify Functions** เท่านั้น |
| Upload ปัจจุบัน | `api.storage.uploadAttachment()` ใน `src/lib/api.ts` |
| Delete ปัจจุบัน | `api.tickets.delete()` ใน `src/lib/api.ts` |

### โครงสร้างไฟล์ที่เกี่ยวข้อง
```
template/
├── src/
│   └── lib/
│       └── api.ts          ← แก้ uploadAttachment() และ delete()
├── netlify/
│   └── functions/          ← สร้างใหม่: upload-r2.ts, delete-r2.ts
├── .env                    ← เพิ่ม R2 credentials (server-side)
└── netlify.toml            ← เพิ่ม functions directory config
```

---

## 🔄 Scenario Analysis

### Scenario A — Normal Upload (Happy Path)
> ช่าง/CRM แนบรูปหรือวิดีโอใน ticket comment

```
Browser → POST /.netlify/functions/upload-r2 → R2 Bucket
                 ↓ (returns public URL)
          ticket_logs.media_urls = [...existingUrls, newUrl]
                 ↓
          TicketDetails.tsx (render <video> หรือ <img>)
```
✅ Flow เหมือนเดิมทุกอย่าง เปลี่ยนแค่ปลายทาง upload

---

### Scenario B — Upload Failure (R2 Unavailable)
> R2 downtime หรือ network error

**แผน: Fallback to Supabase Storage**
```typescript
try {
  url = await uploadToR2(file, ticketId);         // ลอง R2 ก่อน
} catch (r2Error) {
  console.warn('R2 failed, falling back to Supabase', r2Error);
  url = await uploadToSupabase(file, ticketId);  // fallback อัตโนมัติ
}
```
✅ ผู้ใช้ไม่รู้สึกถึงปัญหา — URL ที่ได้ทั้งสองแหล่งเปิดได้ปกติ

---

### Scenario C — Delete Ticket (Hybrid URLs)
> CRM/Admin ลบ ticket → ต้องลบ media ทั้ง Supabase และ R2

**ปัญหาเดิม:** `api.tickets.delete()` ใช้ `.split('/ticket-attachments/')` 
→ จับแค่ Supabase URL ได้ ไม่รู้จัก R2 URL

**แผน: URL-based routing**
```typescript
function detectStorageProvider(url: string): 'supabase' | 'r2' | 'unknown' {
  if (!url) return 'unknown';
  if (url.includes('supabase.co')) return 'supabase';
  if (url.includes('r2.dev') || url.includes('r2.cloudflarestorage.com')) return 'r2';
  return 'unknown';
}
```

---

### Scenario D — ไฟล์วิดีโอขนาดใหญ่
> ช่างแนบวิดีโอ 100MB+

**แผน:** กำหนด size limit ที่ Netlify Function
- รูปภาพ: ≤ 20 MB (รองรับ `image/jpeg`, `image/png`, `image/webp`, `image/gif`)
- วิดีโอ: ≤ 100 MB (รองรับ `video/mp4`, `video/quicktime`, `video/webm`)
- เกินขีด → Return 400 + message ชัดเจน

> ⚠️ **หมายเหตุ:** Netlify Functions timeout สูงสุด 26 วินาที (background function = 15 นาที)  
> วิดีโอใหญ่มากอาจต้องใช้ **Presigned URL** แทน (Phase 2)

---

### Scenario E — R2 Credentials หมดอายุ/ผิด
> API key ถูก revoke หรือตั้งค่า ENV ผิด

**แผน:**
- `GET /.netlify/functions/upload-r2?health=1` → ทดสอบ R2 connection
- Netlify Logs จะแสดง fallback ที่ผิดปกติ
- Rotate R2 key ผ่าน Cloudflare Dashboard (ไม่กระทบ URL เก่า)

---

### Scenario F — CORS หรือ Public Access ปิดอยู่
> ไฟล์ R2 เปิดไม่ได้จาก browser

**แผน:** ตั้งค่า R2 bucket ก่อน deploy
- Enable **Public Access** บน bucket
- ตั้ง CORS ให้รองรับ Netlify domain: `https://crm-304ip.netlify.app` (และ preview domains)
- Optional: Custom domain `files.304ip.com → R2`

---

## 📅 Implementation Timeline

```
พ.ค. 2026 (ตอนนี้)
│
├── ✅ วิเคราะห์ & วางแผน (เสร็จแล้ว)
│
มิ.ย. 2026 — Week 1-2: Setup & Build
├── ① ตั้งค่า Cloudflare R2 Bucket "crm-304ip-attachments"
├── ② สร้าง netlify/functions/upload-r2.ts
├── ③ สร้าง netlify/functions/delete-r2.ts
├── ④ สร้าง src/lib/r2-upload.ts (client wrapper)
├── ⑤ แก้ api.storage.uploadAttachment() — R2 first + fallback
├── ⑥ แก้ api.tickets.delete() — รองรับ hybrid URL
│
มิ.ย. 2026 — Week 3: Staging Test
├── ⑦ Deploy ไป Netlify Preview branch
├── ⑧ ทดสอบ upload รูปจริง / วิดีโอจริง / fallback
├── ⑨ ตรวจสอบ URL rendering ทุก media type
│
มิ.ย. 2026 — Week 4: Production Cutover
├── ⑩ Enable R2 ใน production
├── ⑪ Monitor Netlify Logs 48 ชั่วโมงแรก
├── ⑫ ตรวจสอบ Cloudflare R2 dashboard
│
ก.ค. 2026 — Post-migration
├── ⑬ ไฟล์เก่าใน Supabase: ปล่อยไว้ (Hybrid permanent)
└── ⑭ Supabase usage หยุดเพิ่ม → คงที่ที่ ~14.3 MB ตลอด
```

---

## 🔧 Step-by-Step Implementation

### Step 1: Cloudflare R2 Setup

1. Cloudflare Dashboard → **R2** → **Create bucket**
2. ตั้งชื่อ: `crm-304ip-attachments`
3. Enable **Public Access** → copy URL (`pub-xxxx.r2.dev`)
4. **Manage R2 API Tokens** → Create token
   - Permissions: `Object Read & Write`
   - Scope: เฉพาะ bucket `crm-304ip-attachments`
5. บันทึก: `Account ID`, `Access Key ID`, `Secret Access Key`

---

### Step 2: Environment Variables

เพิ่มใน Netlify Dashboard → Site Settings → Environment Variables:

```env
R2_ACCOUNT_ID="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
R2_ACCESS_KEY_ID="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
R2_SECRET_ACCESS_KEY="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
R2_BUCKET_NAME="crm-304ip-attachments"
R2_PUBLIC_DOMAIN="https://pub-xxxx.r2.dev"
```

> ⚠️ ห้ามใส่ prefix `VITE_` — ตัวแปรเหล่านี้ใช้ใน server-side เท่านั้น  
> (ป้องกัน secret key ถูก bundle ไปใน frontend)

---

### Step 3: ตั้งค่า netlify.toml

```toml
[build]
  publish = "template/dist"
  command = "npm run build"

[build.environment]
  NODE_VERSION = "20"

[functions]
  directory = "template/netlify/functions"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

---

### Step 4: Install Package

```bash
cd template
npm install @aws-sdk/client-s3
```

---

### Step 5: สร้าง `netlify/functions/upload-r2.ts`

```typescript
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

// รองรับ CRM ticket: รูป + วิดีโอ
const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'video/webm',
];
const MAX_SIZE_IMAGE = 20 * 1024 * 1024;   // 20 MB
const MAX_SIZE_VIDEO = 100 * 1024 * 1024;  // 100 MB

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Parse multipart (ใช้ busboy หรือ parse-multipart-data)
  // รับ: file buffer, mimeType, originalName, ticketId (folder)

  // Validate type
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported file type' }) };
  }

  // Validate size
  const maxSize = mimeType.startsWith('video/') ? MAX_SIZE_VIDEO : MAX_SIZE_IMAGE;
  if (fileBuffer.length > maxSize) {
    return { statusCode: 400, body: JSON.stringify({ error: 'File too large' }) };
  }

  // Generate filename: {ticketId}/{uuid}-{timestamp}.{ext}
  const ext = originalName.split('.').pop();
  const fileName = `${ticketId}/${randomUUID()}-${Date.now()}.${ext}`;

  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: fileName,
    Body: fileBuffer,
    ContentType: mimeType,
  }));

  const url = `${process.env.R2_PUBLIC_DOMAIN}/${fileName}`;
  return { statusCode: 200, body: JSON.stringify({ url }) };
};
```

---

### Step 6: สร้าง `netlify/functions/delete-r2.ts`

```typescript
import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const handler = async (event: any) => {
  if (event.httpMethod !== 'DELETE') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { url } = JSON.parse(event.body);
  const fileName = url.replace(`${process.env.R2_PUBLIC_DOMAIN}/`, '');

  await r2.send(new DeleteObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: fileName,
  }));

  return { statusCode: 200, body: JSON.stringify({ success: true }) };
};
```

---

### Step 7: สร้าง `src/lib/r2-upload.ts`

```typescript
// Client-side wrapper — ไม่มี AWS SDK ที่นี่
export async function uploadToR2(file: File, ticketId: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('ticketId', ticketId);

  const res = await fetch('/.netlify/functions/upload-r2', {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'R2 upload failed');
  }

  const { url } = await res.json();
  return url;
}

export async function deleteFromR2(url: string): Promise<void> {
  await fetch('/.netlify/functions/delete-r2', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}
```

---

### Step 8: แก้ไข `src/lib/api.ts`

#### 8a. `api.storage.uploadAttachment()` — R2 first + Fallback

```typescript
import { uploadToR2 } from './r2-upload';

storage: {
  async uploadAttachment(ticketId: string, file: File): Promise<string> {
    // TRY R2 FIRST
    try {
      const url = await uploadToR2(file, ticketId);
      console.log('[Upload] provider: r2', url);
      return url;
    } catch (r2Error) {
      console.warn('[Upload] R2 failed, falling back to Supabase:', r2Error);
    }

    // FALLBACK: Supabase Storage (logic เดิม)
    const fileExt = file.name.split('.').pop();
    const fileName = `${ticketId}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const { error } = await supabase.storage
      .from('ticket-attachments')
      .upload(fileName, file);
    if (error) throw error;

    const { data: { publicUrl } } = supabase.storage
      .from('ticket-attachments')
      .getPublicUrl(fileName);

    console.log('[Upload] provider: supabase (fallback)', publicUrl);
    return publicUrl;
  }
}
```

#### 8b. `api.tickets.delete()` — รองรับ Hybrid URL

```typescript
// Helper: ตรวจว่าไฟล์อยู่ที่ไหน
function detectStorageProvider(url: string): 'supabase' | 'r2' | 'unknown' {
  if (!url) return 'unknown';
  if (url.includes('supabase.co')) return 'supabase';
  if (url.includes('r2.dev') || url.includes('r2.cloudflarestorage.com')) return 'r2';
  return 'unknown';
}

// ใน api.tickets.delete():
async delete(id: string) {
  const { data: logs } = await supabase
    .from('ticket_logs')
    .select('media_urls')
    .eq('ticket_id', id);

  const supabasePaths: string[] = [];
  const r2Urls: string[] = [];

  if (logs) {
    logs.forEach(log => {
      (log.media_urls || []).forEach((url: string) => {
        const provider = detectStorageProvider(url);
        if (provider === 'supabase') {
          const parts = url.split('/ticket-attachments/');
          if (parts.length > 1) supabasePaths.push(parts[1]);
        } else if (provider === 'r2') {
          r2Urls.push(url);
        }
      });
    });
  }

  // ลบไฟล์ Supabase
  if (supabasePaths.length > 0) {
    await supabase.storage.from('ticket-attachments').remove(supabasePaths);
  }

  // ลบไฟล์ R2
  for (const url of r2Urls) {
    await fetch('/.netlify/functions/delete-r2', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }).catch(err => console.warn('[Delete] R2 delete failed:', url, err));
  }

  // ลบ logs และ ticket
  await supabase.from('ticket_logs').delete().eq('ticket_id', id);
  const { error } = await supabase.from('tickets').delete().eq('id', id);
  if (error) throw error;
}
```

---

## 🔀 Cut-off Strategy (Zero Downtime)

```
Feature Flag ใน .env:

VITE_STORAGE_PROVIDER = "supabase"      ← ค่าปัจจุบัน
VITE_STORAGE_PROVIDER = "r2+fallback"  ← R2 + Supabase fallback (แนะนำช่วงแรก)
VITE_STORAGE_PROVIDER = "r2"           ← Full R2 cutover
```

**ขั้นตอน cutover:**
1. Deploy code ใหม่ (มี R2 logic แต่ยัง disabled)
2. ตั้ง `VITE_STORAGE_PROVIDER=r2+fallback` ใน Netlify
3. Monitor 48 ชม — ถ้า fallback rate < 1% → success
4. เปลี่ยนเป็น `VITE_STORAGE_PROVIDER=r2` (full cutover)
5. ไม่มี step "ย้ายไฟล์เก่า" — hybrid ตลอดไป

---

## 🛡️ Security & Best Practices

### Security
- ✅ R2 Secret Key อยู่ใน Netlify Env เท่านั้น (server-side only)
- ✅ ไม่ใช้ prefix `VITE_` กับ R2 credentials
- ✅ R2 token scope จำกัดเฉพาะ bucket `crm-304ip-attachments`
- ✅ Validate file type และ size ที่ Netlify Function ก่อนส่ง R2
- ✅ Generate filename ด้วย UUID (ป้องกัน path traversal)
- ✅ จัดกลุ่มไฟล์ตาม `ticketId` (เหมือนโครงสร้างเดิม)
- ✅ ตั้ง R2 CORS policy จำกัดเฉพาะ Netlify domain

### Reliability
- ✅ Fallback to Supabase ถ้า R2 ล้มเหลว
- ✅ Log ทุก upload/fallback event (ตรวจสอบได้ใน Netlify Logs)
- ✅ Health check endpoint (`/.netlify/functions/upload-r2?health=1`)
- ✅ Delete ที่ R2 ล้มเหลวจะ `console.warn` ไม่ throw (ป้องกัน ticket ลบไม่ได้)

### Cost Control
- ✅ ไม่ลบไฟล์เก่าใน Supabase (~14.3 MB — ปลอดภัย)
- ✅ ตั้ง Cloudflare R2 Usage Alert ที่ 8 GB (80% free tier)
- ✅ Optional: ตั้ง lifecycle rule ลบไฟล์เก่ากว่า 3 ปีอัตโนมัติ

---

## ✅ Files to Create / Modify

| ไฟล์ | Action | Priority |
|---|---|---|
| `netlify/functions/upload-r2.ts` | สร้างใหม่ | 🔴 Critical |
| `netlify/functions/delete-r2.ts` | สร้างใหม่ | 🔴 Critical |
| `src/lib/r2-upload.ts` | สร้างใหม่ | 🔴 Critical |
| `src/lib/api.ts` | แก้ `uploadAttachment()` + `delete()` | 🔴 Critical |
| `netlify.toml` | เพิ่ม `[functions]` config | 🟡 Required |
| `package.json` | เพิ่ม `@aws-sdk/client-s3` | 🟡 Required |
| Netlify Env Vars | เพิ่ม R2 credentials (5 ตัว) | 🔴 Critical |
| `vercel.json` | — ไม่ต้องแก้ (ใช้ Netlify ไม่ใช่ Vercel) | ✅ N/A |
| `vite.config.ts` | — ไม่ต้องแก้ | ✅ OK |

---

## 🚦 Go / No-Go Checklist ก่อน Cutover

- [ ] R2 bucket `crm-304ip-attachments` สร้างแล้ว, Public Access เปิด
- [ ] CORS ตั้งค่าสำหรับ Netlify domain แล้ว
- [ ] Netlify Env Vars ทั้ง 5 ตัวตั้งค่าแล้ว (prod + preview)
- [ ] `netlify.toml` อัปเดต `[functions]` directory แล้ว
- [ ] ทดสอบ upload รูปภาพจริงบน preview branch
- [ ] ทดสอบ upload วิดีโอ mp4 จริงบน preview branch
- [ ] ทดสอบ fallback (จำลอง R2 error)
- [ ] ทดสอบ delete ticket ที่มีไฟล์ R2
- [ ] ทดสอบ delete ticket ที่มีไฟล์ Supabase (legacy)
- [ ] URL ของ R2 เปิดได้จาก browser โดยตรง (ทั้งรูปและวิดีโอ)
- [ ] Netlify Logs ไม่มี unhandled error
- [ ] Cloudflare R2 dashboard แสดง ops count ถูกต้อง

---

*Plan version 3.0 — Adapted for CRM 304IP Ticket System*  
*Stack: Vite + React 19 SPA + Netlify Functions + Cloudflare R2*  
*Based on real data: 21 files / 14.3 MB / video = 91% of storage*  
*Key difference from HRBP plan: Netlify (not Vercel), video support critical, bucket = ticket-attachments*