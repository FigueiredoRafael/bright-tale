-- Wave 9.1 of pipeline autopilot wizard: drop projects.auto_advance.
-- Replaced by projects.mode (T-1.2 / T-8.4). All production code paths now
-- read/write `mode`; the boolean column is unused.

alter table projects drop column auto_advance;
