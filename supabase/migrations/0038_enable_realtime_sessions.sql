-- Enable realtime updates for the sessions table so admins can receive
-- notifications when a staff member closes their POS session.
begin;
  alter publication supabase_realtime add table sessions;
commit;
