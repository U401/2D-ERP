-- Enable realtime updates for the ingredients table
begin;
  -- Add the ingredients table to the supabase_realtime publication
  alter publication supabase_realtime add table ingredients;
commit;
