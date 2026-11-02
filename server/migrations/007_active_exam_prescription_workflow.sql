-- Link outputs of an active examination to its queue entry without changing
-- historical records created before Version 2 refinement.
ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS queue_entry_id UUID REFERENCES queue_entries(id) ON DELETE SET NULL;

ALTER TABLE prescription_images
  ADD COLUMN IF NOT EXISTS queue_entry_id UUID REFERENCES queue_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS instructions_image_path TEXT,
  ADD COLUMN IF NOT EXISTS investigations_image_path TEXT;

ALTER TABLE patient_investigations
  ADD COLUMN IF NOT EXISTS queue_entry_id UUID REFERENCES queue_entries(id) ON DELETE SET NULL;

ALTER TABLE attachments
  ADD COLUMN IF NOT EXISTS investigation_id UUID REFERENCES patient_investigations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prescriptions_queue_entry ON prescriptions(queue_entry_id);
CREATE INDEX IF NOT EXISTS idx_prescription_images_queue_entry ON prescription_images(queue_entry_id);
CREATE INDEX IF NOT EXISTS idx_patient_investigations_queue_entry ON patient_investigations(queue_entry_id);
CREATE INDEX IF NOT EXISTS idx_attachments_investigation ON attachments(investigation_id);
