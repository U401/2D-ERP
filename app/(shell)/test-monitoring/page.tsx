'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function TestMonitoringPage() {
    const [results, setResults] = useState<any>({})
    const [copied, setCopied] = useState(false)
    const supabase = createClient()

    useEffect(() => {
        async function runTests() {
            const testResults: any = {}

            // Test 1: Check if user_presence table exists
            const { data: presenceData, error: presenceError } = await supabase
                .from('user_presence')
                .select('*')
                .limit(1)

            testResults.presenceTableExists = !presenceError
            testResults.presenceError = presenceError?.message
            testResults.presenceData = presenceData

            // Test 2: Check if screen_shares table exists
            const { data: screenData, error: screenError } = await supabase
                .from('screen_shares')
                .select('*')
                .limit(1)

            testResults.screenTableExists = !screenError
            testResults.screenError = screenError?.message
            testResults.screenData = screenData

            // Test 3: Try to insert presence
            const { data: { user } } = await supabase.auth.getUser()
            if (user) {
                const { data: insertData, error: insertError } = await supabase
                    .from('user_presence')
                    .upsert({
                        user_id: user.id,
                        status: 'online',
                        current_page: '/test',
                        last_seen: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    })
                    .select()

                testResults.canInsertPresence = !insertError
                testResults.insertError = insertError?.message
                testResults.insertData = insertData
            }

            // Test 4: Can we enrich presence with profiles? (manual join; no schema relationship required)
            const { data: presenceRows, error: presenceRowsError } = await supabase
                .from('user_presence')
                .select('*')
                .order('updated_at', { ascending: false })
                .limit(10)

            if (presenceRowsError) {
                testResults.canEnrichPresenceWithProfiles = false
                testResults.enrichPresenceError = presenceRowsError?.message
            } else {
                const userIds = (presenceRows || []).map((p: any) => p.user_id).filter(Boolean)
                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles')
                    .select('id, username, role')
                    .in('id', userIds)

                testResults.canEnrichPresenceWithProfiles = !profilesError
                testResults.enrichProfilesError = profilesError?.message
                testResults.enrichedPresence = (presenceRows || []).map((p: any) => ({
                    ...p,
                    profile: profilesData?.find((pr: any) => pr.id === p.user_id) || null,
                }))
            }

            setResults(testResults)
        }

        runTests()
    }, [supabase])

    const monitoringSql = `-- Monitoring setup (user presence + screen sharing)
-- Run this in Supabase Dashboard -> SQL Editor

-- Helper: is_admin
CREATE OR REPLACE FUNCTION public.is_admin(p_uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT role = 'admin' FROM public.profiles WHERE id = p_uid), FALSE);
$$;

-- user_presence
CREATE TABLE IF NOT EXISTS public.user_presence (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'online' CHECK (status IN ('online', 'offline', 'idle')),
  current_page TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_presence_select_self_or_admin" ON public.user_presence;
CREATE POLICY "user_presence_select_self_or_admin"
  ON public.user_presence FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "user_presence_insert_self" ON public.user_presence;
CREATE POLICY "user_presence_insert_self"
  ON public.user_presence FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_presence_update_self" ON public.user_presence;
CREATE POLICY "user_presence_update_self"
  ON public.user_presence FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_presence_delete_admin" ON public.user_presence;
CREATE POLICY "user_presence_delete_admin"
  ON public.user_presence FOR DELETE
  USING (public.is_admin());

-- screen_shares (optional)
CREATE TABLE IF NOT EXISTS public.screen_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  screenshot_data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.screen_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "screen_shares_select_self_or_admin" ON public.screen_shares;
CREATE POLICY "screen_shares_select_self_or_admin"
  ON public.screen_shares FOR SELECT
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "screen_shares_insert_self" ON public.screen_shares;
CREATE POLICY "screen_shares_insert_self"
  ON public.screen_shares FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "screen_shares_delete_admin" ON public.screen_shares;
CREATE POLICY "screen_shares_delete_admin"
  ON public.screen_shares FOR DELETE
  USING (public.is_admin());

-- cleanup_old_screenshots
CREATE OR REPLACE FUNCTION public.cleanup_old_screenshots(p_keep_seconds INTEGER DEFAULT 300)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
BEGIN
  DELETE FROM public.screen_shares
  WHERE created_at < NOW() - make_interval(secs => GREATEST(p_keep_seconds, 0));

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;`

    function handleCopy() {
        navigator.clipboard.writeText(monitoringSql)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8">
            <div className="flex items-center justify-between gap-4 mb-4">
                <h1 className="text-2xl font-bold">Monitoring System Test</h1>
                <button
                    onClick={handleCopy}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                >
                    {copied ? 'Copied!' : 'Copy Monitoring SQL'}
                </button>
            </div>
            <p className="text-sm text-slate-600 mb-6">
                If Online Users is empty, first verify whether the monitoring tables exist. If not, click “Copy Monitoring SQL”
                and run it in Supabase Dashboard → SQL Editor, then reload this page and the Admin dashboard.
            </p>
            <div className="space-y-4">
                <div className="bg-white p-4 rounded-lg border">
                    <h2 className="font-semibold mb-2">Test Results:</h2>
                    <pre className="text-xs bg-slate-50 p-4 rounded overflow-auto">
                        {JSON.stringify(results, null, 2)}
                    </pre>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <h2 className="font-semibold mb-2">Monitoring SQL (for Supabase SQL Editor):</h2>
                    <pre className="text-xs bg-slate-50 p-4 rounded overflow-auto whitespace-pre-wrap">
                        {monitoringSql}
                    </pre>
                </div>
            </div>
        </div>
    )
}
