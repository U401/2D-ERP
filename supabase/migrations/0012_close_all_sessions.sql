-- Close all open sessions
CREATE OR REPLACE FUNCTION close_all_sessions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_closed_count INTEGER;
BEGIN
  -- Close all open sessions
  UPDATE sessions
  SET status = 'closed', closed_at = NOW()
  WHERE status = 'open';
  
  GET DIAGNOSTICS v_closed_count = ROW_COUNT;
  
  RETURN v_closed_count;
END;
$$;


