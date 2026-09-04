'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import html2canvas from 'html2canvas'

type ScreenSharingOptions = {
    intervalMs?: number
    quality?: number
    maxScale?: number
    cleanupEvery?: number
    captureMode?: 'viewport' | 'full'
}

export function useScreenSharing(
    enabled: boolean = true,
    options: ScreenSharingOptions = {}
) {
    // Module disabled to prevent Supabase usage overload
    return;
}
