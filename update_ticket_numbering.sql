-- ============================================================
-- Ticket ID numbering migration
-- Format: TYYMMDD-NNNN เช่น T260512-0001
-- Running แยกตามวัน, atomic-safe, ไม่วน loop และเกิน 9999 ได้
-- ============================================================

CREATE TABLE IF NOT EXISTS ticket_counters (
  ticket_date DATE PRIMARY KEY,
  last_value BIGINT NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION generate_ticket_id()
RETURNS TRIGGER AS $$
DECLARE
  current_day DATE;
  next_value BIGINT;
BEGIN
  IF NEW.id IS NOT NULL AND NEW.id != '' THEN
    RETURN NEW;
  END IF;

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

DROP TRIGGER IF EXISTS trg_ticket_id ON tickets;

CREATE TRIGGER trg_ticket_id
BEFORE INSERT ON tickets
FOR EACH ROW
WHEN (NEW.id IS NULL OR NEW.id = '')
EXECUTE FUNCTION generate_ticket_id();
