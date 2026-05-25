-- Add demographic attributes to personas
-- nationality, age, gender, and languages shape the cultural identity and
-- life story of a persona. languages_json stores proficiency levels.
-- Shape: [{ language: string, level: "native" | "fluent" | "conversational" | "basic" }]

ALTER TABLE personas
  ADD COLUMN nationality    text   NULL,
  ADD COLUMN age            integer NULL,
  ADD COLUMN gender         text   NULL,
  ADD COLUMN languages_json jsonb  NOT NULL DEFAULT '[]'::jsonb;
