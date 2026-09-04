-- Enable realtime for activity_logs table so admin dashboard auto-updates
alter publication supabase_realtime add table activity_logs;

-- Also ensure REPLICA IDENTITY FULL is set so UPDATE/DELETE events contain old row data
alter table activity_logs replica identity full;
