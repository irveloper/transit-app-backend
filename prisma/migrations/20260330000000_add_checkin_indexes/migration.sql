-- GIST index on check_ins.location for spatial queries
CREATE INDEX idx_check_ins_location ON check_ins USING GIST (location);

-- Composite index on (route_id, created_at DESC) for recent-by-route queries
CREATE INDEX idx_check_ins_route_recent ON check_ins (route_id, created_at DESC);
