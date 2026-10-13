-- Per-person settings: time zone (decides what "today" means) and currency for spending.

create table user_settings (
  user_id text primary key references "user"(id) on delete cascade,
  timezone text not null default 'Asia/Kolkata' check (length(timezone) between 1 and 60),
  currency text not null default 'INR' check (currency in ('INR', 'USD', 'EUR', 'GBP')),
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;
create policy user_settings_self on user_settings for all
  using (user_id = app_current_user()) with check (user_id = app_current_user());

grant select, insert, update, delete on all tables in schema public to mybuddy_app;
