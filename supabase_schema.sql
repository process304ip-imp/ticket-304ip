-- ============================================================
-- 304IP CRM-Ticket System — Supabase Schema
-- ============================================================

-- 1. COMPANIES
CREATE TABLE companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  area TEXT NOT NULL,              -- IP1 / IP2 / IP7 Phase 3 / IP7 Phase 5 / NPS
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  registration_link TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. TICKET COUNTERS
-- Ticket ID format: TYYMMDD-NNNN เช่น T260512-0001
-- Running แยกตามวัน, atomic-safe, และไม่ตันที่ 9999 เพราะเลขจะขยายความยาวได้เอง
CREATE TABLE ticket_counters (
  ticket_date DATE PRIMARY KEY,
  last_value BIGINT NOT NULL DEFAULT 0
);

-- 3. TICKETS
CREATE TABLE tickets (
  id TEXT PRIMARY KEY,             -- format: TYYMMDD-NNNN (auto-gen trigger ด้านล่าง)
  type TEXT NOT NULL               -- 'Service Issue' | 'Service Request' | 'Operational Task' | 'Customer Complaint' | 'Customer Request' | 'Internal Ticket'
    CHECK (type IN ('Service Issue', 'Service Request', 'Operational Task', 'Customer Complaint', 'Customer Request', 'Internal Ticket')),
  category TEXT NOT NULL,           -- 'Power' | 'Water Supply' | 'Facility'
    CHECK (category IN ('Power', 'Water Supply', 'Facility')),
  sub_category TEXT,
  channel TEXT                     -- 'Tel' | 'E-mail' | 'Letter' | 'Line' | 'WhatsApp' | 'Walk-in' | 'Customer Portal' | 'QR Portal'
    CHECK (channel IN ('Tel', 'E-mail', 'Letter', 'Line', 'WhatsApp', 'Walk-in', 'Customer Portal', 'QR Portal')),
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  company_name TEXT,               -- snapshot ชื่อบริษัท ณ เวลาเปิด ticket
  area TEXT,
  location_text TEXT,
  lat NUMERIC(10, 6),
  lng NUMERIC(10, 6),
  status TEXT NOT NULL DEFAULT 'Open'
    CHECK (status IN ('Open', 'In Progress', 'Resolved', 'Closed')),
  priority TEXT NOT NULL DEFAULT 'Medium'
    CHECK (priority IN ('Low', 'Medium', 'High', 'Critical')),
  assignee TEXT,
  contact_name TEXT,
  contact_phone TEXT,
  description TEXT,
  duration_min INTEGER,            -- Power only: ระยะเวลาไฟดับ (นาที)
  impact_radius_meters INTEGER,    -- Power only: รัศมีผลกระทบ
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  sla_due_at TIMESTAMPTZ,
  auto_close_at TIMESTAMPTZ,       -- resolved_at + 48h
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE OR REPLACE FUNCTION generate_ticket_id()
RETURNS TRIGGER AS $$
DECLARE
  current_day DATE;
  next_value BIGINT;
BEGIN
  current_day := COALESCE(NEW.created_at, now())::date;

  INSERT INTO ticket_counters (ticket_date, last_value)
  VALUES (current_day, 1)
  ON CONFLICT (ticket_date)
  DO UPDATE SET last_value = ticket_counters.last_value + 1
  RETURNING last_value INTO next_value;

  NEW.id := 'T' || to_char(current_day, 'YYMMDD') || '-' || lpad(next_value::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ticket_id
BEFORE INSERT ON tickets
FOR EACH ROW
WHEN (NEW.id IS NULL OR NEW.id = '')
EXECUTE FUNCTION generate_ticket_id();

-- Auto-set auto_close_at เมื่อ status เปลี่ยนเป็น Resolved
CREATE OR REPLACE FUNCTION set_auto_close()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Resolved' AND OLD.status != 'Resolved' THEN
    NEW.resolved_at := now();
    NEW.auto_close_at := now() + INTERVAL '48 hours';
  ELSIF NEW.status != 'Resolved' THEN
    NEW.auto_close_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_close
BEFORE UPDATE ON tickets
FOR EACH ROW
EXECUTE FUNCTION set_auto_close();

-- 3. TICKET LOGS (Timeline นาทีต่อนาที)
CREATE TABLE ticket_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT now(),
  author_role TEXT                 -- 'customer' | 'crm' | 'technician' | 'admin'
    CHECK (author_role IN ('customer', 'crm', 'technician', 'admin')),
  author_name TEXT,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  status_from TEXT,
  status_to TEXT,
  media_urls TEXT[] DEFAULT '{}'   -- array of Supabase Storage URLs
);

-- 4. TICKET AFFECTED COMPANIES (Power tickets: many-to-many)
CREATE TABLE ticket_affected_companies (
  ticket_id TEXT REFERENCES tickets(id) ON DELETE CASCADE,
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, company_id)
);

-- 5. RESPONSE TEAMS
CREATE TABLE response_teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role_label TEXT,                 -- 'ทีมตรวจสอบพื้นที่' etc.
  status TEXT DEFAULT 'available'
    CHECK (status IN ('available', 'busy', 'offline')),
  area TEXT,
  specialty TEXT                   -- 'Power' | 'Water Supply' | 'Facility' | 'Emergency'
    CHECK (specialty IN ('Power', 'Water Supply', 'Facility', 'Emergency')),
  phone TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. USER PROFILES (ต่อจาก auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  emp_id TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'customer'
    CHECK (role IN ('customer', 'crm', 'technician', 'admin', 'pending')),
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,
  department TEXT,
  phone TEXT,
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active', 'pending', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. TICKET FEEDBACK
CREATE TABLE ticket_feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_category ON tickets(category);
CREATE INDEX idx_tickets_company_id ON tickets(company_id);
CREATE INDEX idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX idx_tickets_auto_close ON tickets(auto_close_at) WHERE status = 'Resolved';
CREATE INDEX idx_tickets_assignee ON tickets(assignee);
CREATE INDEX idx_ticket_logs_ticket_id ON ticket_logs(ticket_id);
CREATE INDEX idx_ticket_logs_timestamp ON ticket_logs(timestamp DESC);
CREATE INDEX idx_user_profiles_company_id ON user_profiles(company_id);
CREATE INDEX idx_user_profiles_emp_id ON user_profiles(emp_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_affected_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_feedback ENABLE ROW LEVEL SECURITY;

-- Helper function: get role ของ user ปัจจุบัน
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_company_id()
RETURNS TEXT AS $$
  SELECT company_id FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION can_access_ticket(ticket_company_id TEXT, ticket_category TEXT, ticket_assignee TEXT)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN get_my_role() IN ('crm', 'admin') THEN true
    WHEN get_my_role() = 'customer' THEN (
      ticket_company_id = get_my_company_id()
      AND ticket_category != 'Power'
    )
    WHEN get_my_role() = 'technician' THEN EXISTS (
      SELECT 1
      FROM user_profiles p
      WHERE p.id = auth.uid()
        AND (
          ticket_assignee = p.full_name
          OR ticket_assignee = p.department
          OR EXISTS (
            SELECT 1
            FROM response_teams rt
            WHERE rt.name = ticket_assignee
              AND (
                p.department IN (rt.id, rt.name, rt.role_label, rt.specialty, rt.area)
                OR p.full_name = rt.name
              )
          )
        )
    )
    ELSE false
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Companies: ทุกคนอ่านได้, แค่ crm/admin เขียนได้
CREATE POLICY "companies_read" ON companies FOR SELECT USING (true);
CREATE POLICY "companies_write" ON companies FOR ALL
  USING (get_my_role() IN ('crm', 'admin'));

-- Tickets: อ่านตาม role
CREATE POLICY "tickets_customer_read" ON tickets FOR SELECT
  USING (can_access_ticket(company_id, category, assignee));

CREATE POLICY "tickets_staff_write" ON tickets FOR INSERT
  WITH CHECK (
    get_my_role() IN ('crm', 'admin')
    OR (
      get_my_role() = 'customer'
      AND category != 'Power'
      AND company_id = get_my_company_id()
    )
  );

CREATE POLICY "tickets_staff_update" ON tickets FOR UPDATE
  USING (
    get_my_role() IN ('crm', 'admin')
    OR (
      get_my_role() = 'technician'
      AND can_access_ticket(company_id, category, assignee)
      AND status != 'Closed'
    )
    OR (
      get_my_role() = 'customer'
      AND company_id = get_my_company_id()
      AND category != 'Power'
      AND status = 'Resolved'
    )
  )
  WITH CHECK (
    get_my_role() IN ('crm', 'admin')
    OR (
      get_my_role() = 'technician'
      AND can_access_ticket(company_id, category, assignee)
      AND status IN ('In Progress', 'Resolved')
    )
    OR (
      get_my_role() = 'customer'
      AND company_id = get_my_company_id()
      AND category != 'Power'
      AND status = 'Closed'
    )
  );

-- Ticket Logs: อ่านได้ถ้าเห็น ticket, เขียนได้ถ้า staff หรือ technician
CREATE POLICY "logs_read" ON ticket_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_logs.ticket_id
        AND can_access_ticket(t.company_id, t.category, t.assignee)
    )
  );
CREATE POLICY "logs_write" ON ticket_logs FOR INSERT
  WITH CHECK (
    get_my_role() IN ('crm', 'admin')
    OR (
      get_my_role() = 'customer'
      AND EXISTS (
        SELECT 1 FROM tickets t
        WHERE t.id = ticket_logs.ticket_id
          AND t.company_id = get_my_company_id()
          AND t.category != 'Power'
      )
    )
    OR (
      get_my_role() = 'technician'
      AND EXISTS (
        SELECT 1 FROM tickets t
        WHERE t.id = ticket_logs.ticket_id
          AND t.status != 'Closed'
          AND can_access_ticket(t.company_id, t.category, t.assignee)
      )
    )
  );

-- Response Teams: ทุกคนอ่านได้
CREATE POLICY "teams_read" ON response_teams FOR SELECT USING (true);
CREATE POLICY "teams_write" ON response_teams FOR ALL
  USING (get_my_role() IN ('crm', 'admin'));

-- User Profiles: แต่ละคนเห็นข้อมูลตัวเอง, admin เห็นทั้งหมด
CREATE POLICY "profiles_self" ON user_profiles FOR SELECT
  USING (
    id = auth.uid()
    OR get_my_role() = 'admin'
    OR (get_my_role() = 'crm' AND role = 'customer')
  );
CREATE POLICY "profiles_insert" ON user_profiles FOR INSERT
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_update" ON user_profiles FOR UPDATE
  USING (id = auth.uid() OR get_my_role() = 'admin');

-- Feedback: customer เขียนได้, staff อ่านได้
CREATE POLICY "feedback_read" ON ticket_feedback FOR SELECT
  USING (
    get_my_role() IN ('crm', 'admin')
    OR submitted_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_feedback.ticket_id
        AND t.company_id = get_my_company_id()
        AND t.category != 'Power'
    )
  );
CREATE POLICY "feedback_write" ON ticket_feedback FOR INSERT
  WITH CHECK (
    get_my_role() = 'customer'
    AND submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_feedback.ticket_id
        AND t.status = 'Resolved'
        AND t.company_id = get_my_company_id()
        AND t.category != 'Power'
    )
  );

-- Affected companies: ทุกคนอ่านได้
CREATE POLICY "affected_read" ON ticket_affected_companies FOR SELECT USING (true);
CREATE POLICY "affected_write" ON ticket_affected_companies FOR ALL
  USING (get_my_role() IN ('crm', 'admin'));

-- ============================================================
-- SEED DATA (optional — ตรงกับ data.ts)
-- ============================================================
INSERT INTO companies (id, name, area, contact_name, phone, email, registration_link) VALUES
  ('dynamic',     'บริษัท Dynamic Manufacturing', 'IP7 Phase 5', 'คุณกิตติพงศ์',  '081-304-7001', 'facility@dynamic.co.th',       'https://304ip.example/register?company=dynamic&area=ip7p5'),
  ('wd',          'บริษัท WD Components',          'IP1',         'คุณศิริพร',      '081-304-7002', 'admin@wd-components.co.th',     'https://304ip.example/register?company=wd&area=ip1'),
  ('comform',     'บริษัท Comform Technology',     'IP2',         'คุณพิชญ์',       '081-304-7003', 'service@comform.co.th',         'https://304ip.example/register?company=comform&area=ip2'),
  ('xinggaosheng','บริษัท Xinggaosheng',            'IP7 Phase 3', 'Mr. Chen Wei',  '081-304-7004', 'ops@xinggaosheng.cn',           'https://304ip.example/register?company=xinggaosheng&area=ip7p3');

INSERT INTO response_teams (id, name, role_label, status, area, specialty, phone) VALUES
  ('AIS',   'Area Inspector (AIS)',  'ทีมตรวจสอบพื้นที่',         'busy',      'IP7 Phase 5', 'Emergency',   '038-304-201'),
  ('WATER', 'Onduty Water Team',     'ทีมระบบน้ำประปา',            'available', 'IP7 Phase 5', 'Water Supply','038-304-202'),
  ('FIRE',  'ทีมดับเพลิง 304IP',    'หน่วยตอบสนองเหตุฉุกเฉิน',   'busy',      'IP1',         'Facility',    '038-304-199'),
  ('POWER', 'Power Operation',       'ทีมระบบไฟฟ้า',              'offline',   'NPS',         'Power',       '038-304-203');

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

CREATE OR REPLACE FUNCTION check_user_exists(email_to_check TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE lower(email) = lower(email_to_check)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION check_user_exists_by_company(cid TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_profiles
    WHERE company_id = cid
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_masked_profile_by_company(cid TEXT)
RETURNS TABLE (
  user_id UUID,
  user_email TEXT,
  user_full_name TEXT,
  masked_phone TEXT
) AS $$
  SELECT
    p.id,
    p.email,
    p.full_name,
    CASE
      WHEN p.phone IS NULL OR length(regexp_replace(p.phone, '[^0-9]', '', 'g')) < 4 THEN ''
      ELSE regexp_replace(p.phone, '[^0-9]', '', 'g')
    END AS masked_phone
  FROM user_profiles p
  WHERE p.company_id = cid
  ORDER BY p.created_at DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ตัวอย่าง Trigger: เมื่อ Ticket ถูกสร้าง ให้แจ้งเตือน CRM
CREATE OR REPLACE FUNCTION notify_new_ticket()
RETURNS TRIGGER AS $$
BEGIN
  -- แจ้งเตือน CRM ทุกคน (สมมติว่าเอา CRM ออกมา)
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

CREATE OR REPLACE FUNCTION notify_ticket_assignment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assignee IS DISTINCT FROM OLD.assignee AND NEW.assignee IS NOT NULL THEN
    INSERT INTO notifications (user_id, title, message, type)
    SELECT p.id,
      'Assigned Ticket: ' || NEW.id,
      'Ticket ' || NEW.id || ' ถูกมอบหมายให้ ' || NEW.assignee,
      'assignment'
    FROM user_profiles p
    WHERE p.role = 'technician'
      AND (
        p.full_name = NEW.assignee
        OR p.department = NEW.assignee
        OR EXISTS (
          SELECT 1
          FROM response_teams rt
          WHERE rt.name = NEW.assignee
            AND p.department IN (rt.id, rt.name, rt.role_label, rt.specialty, rt.area)
        )
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_assignment
AFTER UPDATE OF assignee ON tickets
FOR EACH ROW
EXECUTE FUNCTION notify_ticket_assignment();

CREATE OR REPLACE FUNCTION notify_ticket_resolved()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Resolved' AND OLD.status != 'Resolved' THEN
    INSERT INTO notifications (user_id, title, message, type)
    SELECT p.id,
      'Ticket Resolved: ' || NEW.id,
      'งานของคุณถูกแก้ไขแล้ว กรุณาตรวจสอบและให้ Feedback',
      'update'
    FROM user_profiles p
    WHERE p.role = 'customer'
      AND p.company_id = NEW.company_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_resolved
AFTER UPDATE OF status ON tickets
FOR EACH ROW
EXECUTE FUNCTION notify_ticket_resolved();

CREATE OR REPLACE FUNCTION release_team_when_ticket_closed()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Closed' AND OLD.status != 'Closed' AND NEW.assignee IS NOT NULL THEN
    UPDATE response_teams rt
    SET status = 'available', updated_at = now()
    WHERE rt.name = NEW.assignee
      AND NOT EXISTS (
        SELECT 1
        FROM tickets t
        WHERE t.assignee = NEW.assignee
          AND t.id != NEW.id
          AND t.status != 'Closed'
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_release_team_closed
AFTER UPDATE OF status ON tickets
FOR EACH ROW
EXECUTE FUNCTION release_team_when_ticket_closed();

CREATE OR REPLACE FUNCTION close_resolved_tickets()
RETURNS INTEGER AS $$
DECLARE
  closed_count INTEGER;
BEGIN
  UPDATE tickets
  SET status = 'Closed'
  WHERE status = 'Resolved'
    AND auto_close_at IS NOT NULL
    AND auto_close_at <= now();

  GET DIAGNOSTICS closed_count = ROW_COUNT;
  RETURN closed_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Optional Supabase scheduled job after enabling pg_cron:
-- SELECT cron.schedule('auto-close-resolved-tickets', '*/15 * * * *', 'SELECT close_resolved_tickets();');
