-- Up Migration

CREATE TABLE settlement_transfer_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES trip_members(id) ON DELETE CASCADE,
  from_unit_id UUID NOT NULL REFERENCES settlement_units(id) ON DELETE CASCADE,
  to_unit_id UUID NOT NULL REFERENCES settlement_units(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed_by_member_id UUID REFERENCES trip_members(id),
  reviewed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_pending_transfer_requests ON settlement_transfer_requests (trip_id, member_id) WHERE status = 'pending';
CREATE INDEX idx_transfer_requests_trip ON settlement_transfer_requests(trip_id);

-- Down Migration

DROP INDEX IF EXISTS idx_transfer_requests_trip;
DROP INDEX IF EXISTS idx_pending_transfer_requests;
DROP TABLE IF EXISTS settlement_transfer_requests;
