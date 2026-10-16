-- Meetings: a video call link (Google Meet, or any https link) and calendar-invite bookkeeping.
alter table meetings add column if not exists meet_url text
  check (meet_url is null or (length(meet_url) <= 300 and meet_url ~ '^https://'));
-- Each invite sent raises the sequence, so calendars replace the earlier invite instead of adding a copy.
alter table meetings add column if not exists invite_seq integer not null default 0;
alter table meetings add column if not exists invite_sent_at timestamptz;
