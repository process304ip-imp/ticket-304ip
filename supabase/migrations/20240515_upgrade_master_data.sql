-- ============================================================
-- 304IP CRM-Ticket — Master Data & Workflow Upgrade
-- ============================================================

-- 1. MASTER DATA: CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. MASTER DATA: SUB-CATEGORIES
CREATE TABLE IF NOT EXISTS sub_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category_id, name)
);

-- 3. QUICK RESPONSE TEMPLATES
CREATE TABLE IF NOT EXISTS quick_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  template_text TEXT NOT NULL,
  target_status TEXT, -- e.g., 'In Progress', 'Resolved (Tech)'
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. UPDATE TICKETS TABLE
-- เพิ่มสถานะใหม่และฟิลด์สำหรับการหยุด SLA
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check 
  CHECK (status IN ('Open', 'In Progress', 'Resolved (Tech)', 'Resolved (CRM)', 'Closed'));

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS resolved_crm_at TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sub_category_id UUID REFERENCES sub_categories(id) ON DELETE SET NULL;

-- 5. UPDATE FEEDBACK TABLE
ALTER TABLE ticket_feedback ADD COLUMN IF NOT EXISTS fix_quality_score INTEGER CHECK (fix_quality_score BETWEEN 1 AND 5);
ALTER TABLE ticket_feedback ADD COLUMN IF NOT EXISTS service_quality_score INTEGER CHECK (service_quality_score BETWEEN 1 AND 5);
ALTER TABLE ticket_feedback ADD COLUMN IF NOT EXISTS fix_quality_comment TEXT;
ALTER TABLE ticket_feedback ADD COLUMN IF NOT EXISTS service_quality_comment TEXT;

-- 6. RESPONSE TEAMS: REMOVE SPECIALTY CONSTRAINT (To allow dynamic teams)
ALTER TABLE response_teams DROP CONSTRAINT IF EXISTS response_teams_specialty_check;

-- 7. UPDATE NOTIFICATION LOGIC FOR NEW STATUSES
-- (Assuming existing triggers might need updates, but we'll handle them in app logic or refined triggers later)

-- 8. SEED INITIAL MASTER DATA
INSERT INTO categories (name) VALUES 
  ('Power'), 
  ('Water Supply'), 
  ('Facility')
ON CONFLICT (name) DO NOTHING;

-- Seed Sub-categories (Example)
DO $$
DECLARE
  cat_power UUID;
  cat_water UUID;
  cat_facility UUID;
BEGIN
  SELECT id INTO cat_power FROM categories WHERE name = 'Power';
  SELECT id INTO cat_water FROM categories WHERE name = 'Water Supply';
  SELECT id INTO cat_facility FROM categories WHERE name = 'Facility';

  INSERT INTO sub_categories (category_id, name) VALUES
    (cat_power, 'หม้อแปลงระเบิด'),
    (cat_power, 'สายไฟขาด'),
    (cat_water, 'ท่อประปาแตก'),
    (cat_water, 'น้ำไม่ไหล'),
    (cat_facility, 'ไฟถนนดับ'),
    (cat_facility, 'หญ้าขึ้นรก')
  ON CONFLICT DO NOTHING;

  -- Seed Quick Templates
  INSERT INTO quick_templates (category_id, template_text, target_status) VALUES
    (cat_power, 'กำลังประสานงานกับทีมไฟฟ้าเพื่อเข้าตรวจสอบจุดเกิดเหตุ คาดว่าจะถึงภายใน 15 นาที', 'In Progress'),
    (cat_water, 'ซ่อมแซมท่อประปาเรียบร้อยแล้ว เปิดวาล์วน้ำปกติ รบกวนลูกค้าตรวจสอบการไหล', 'Resolved (Tech)');
END $$;

-- 9. RLS POLICIES UPDATE (Enable access for new statuses)
-- We'll need to update the `can_access_ticket` function and existing policies to handle the new statuses.
-- This part is usually complex so we update the main function.

CREATE OR REPLACE FUNCTION set_auto_close()
RETURNS TRIGGER AS $$
BEGIN
  -- เปลี่ยนมาใช้ Resolved (CRM) เป็นตัวเริ่ม auto close
  IF NEW.status = 'Resolved (CRM)' AND OLD.status != 'Resolved (CRM)' THEN
    NEW.resolved_at := now(); -- เก็บไว้ compatibility
    NEW.resolved_crm_at := now();
    NEW.auto_close_at := now() + INTERVAL '48 hours';
  ELSIF NEW.status = 'Closed' THEN
    NEW.auto_close_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
