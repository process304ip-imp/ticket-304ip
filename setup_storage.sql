-- ============================================================
-- STORAGE BUCKET: ticket-attachments
-- ============================================================

-- สร้าง Bucket ใหม่
INSERT INTO storage.buckets (id, name, public) 
VALUES ('ticket-attachments', 'ticket-attachments', true)
ON CONFLICT (id) DO NOTHING;

-- อนุญาตให้ทุกคนสามารถดูไฟล์ใน Bucket นี้ได้
CREATE POLICY "ticket-attachments_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'ticket-attachments');

-- อนุญาตให้เฉพาะผู้ใช้งานที่เข้าสู่ระบบแล้ว (authenticated) สามารถอัปโหลดไฟล์ได้
CREATE POLICY "ticket-attachments_insert"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'ticket-attachments' AND auth.role() = 'authenticated');

-- ============================================================
