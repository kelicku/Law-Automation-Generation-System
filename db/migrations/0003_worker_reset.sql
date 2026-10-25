-- 0003_worker_reset.sql
-- The worker role performs the demo reset (truncate + reseed). Not granted to aiip_app.
grant truncate on all tables in schema public to aiip_worker;
