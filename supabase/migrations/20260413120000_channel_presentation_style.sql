-- F2-048 — Presentation style on channels.
-- Drives video production: talking_head usa cues de delivery,
-- voiceover/faceless usa prosa limpa pronta pra ElevenLabs.

alter table public.channels
  add column presentation_style text not null default 'talking_head'
    check (presentation_style in ('talking_head', 'voiceover', 'mixed'));
