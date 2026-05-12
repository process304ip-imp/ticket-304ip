-- ============================================================
-- 5. NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_self_read" ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "notifications_self_update" ON notifications FOR UPDATE
  USING (user_id = auth.uid());
  
CREATE POLICY "notifications_staff_insert" ON notifications FOR INSERT
  WITH CHECK (get_my_role() IN ('crm', 'admin'));

-- ตัวอย่าง Trigger: เมื่อ Ticket ถูกสร้าง ให้แจ้งเตือน CRM
CREATE OR REPLACE FUNCTION notify_new_ticket()
RETURNS TRIGGER AS $$
BEGIN
  -- แจ้งเตือน CRM ทุกคน
  INSERT INTO notifications (user_id, title, message, type)
  SELECT id, 'New Ticket: ' || NEW.id, 'มีตั๋วใหม่ถูกเปิดจาก ' || NEW.company_name, 'update'
  FROM user_profiles WHERE role = 'crm';
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_ticket
AFTER INSERT ON tickets
FOR EACH ROW
EXECUTE FUNCTION notify_new_ticket();
