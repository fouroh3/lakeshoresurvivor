ALTER TABLE eliminations
  ADD COLUMN draw_method TEXT NOT NULL DEFAULT 'random'
  CHECK (draw_method IN ('random', 'hat'));
