-- Recurring working hours for doctors. Day numbering follows JavaScript:
-- 0 = Sunday through 6 = Saturday.
CREATE TABLE doctor_weekly_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (start_time < end_time),
  UNIQUE (doctor_id, day_of_week, start_time, end_time)
);

CREATE INDEX idx_doctor_weekly_schedules_doctor_day
  ON doctor_weekly_schedules (doctor_id, day_of_week);

-- A patient must not be placed in the same doctor's active queue twice.
CREATE UNIQUE INDEX uniq_active_queue_patient_doctor
  ON queue_entries (patient_id, doctor_id)
  WHERE status IN ('waiting', 'in_progress');
