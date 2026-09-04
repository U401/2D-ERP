import { startRegistration } from "@simplewebauthn/browser";
import { createClient } from "@/lib/supabase/client";

export async function registerFingerprint(userId: string, username: string) {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { success: false, error: 'Not authenticated' };

    const SUPABASE_PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

    // 1. Get registration options from our edge function
    const optionsResp = await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/webauthn-clock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ action: 'generate-registration', user_id: userId, username })
    });
    
    if (!optionsResp.ok) throw new Error('Failed to fetch registration options');
    const options = await optionsResp.json();

    // 2. Pass options to browser authenticator
    let attResp;
    try {
      attResp = await startRegistration({ optionsJSON: options });
    } catch (error: any) {
      if (error.name === 'InvalidStateError') {
        return { success: false, error: 'Error: Authenticator was probably already registered by user' };
      }
      if (error.name === 'NotAllowedError') {
        return { success: false, error: 'Fingerprint scan was cancelled.' };
      }
      return { success: false, error: error.message };
    }

    // 3. Send response back to edge function for verification
    const verificationResp = await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/webauthn-clock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ action: 'verify-registration', user_id: userId, registrationResponse: attResp })
    });

    const verificationJSON = await verificationResp.json();
    if (verificationJSON && verificationJSON.success) {
      return { success: true };
    } else {
      return { success: false, error: verificationJSON.error || 'Verification failed' };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

import { startAuthentication } from "@simplewebauthn/browser";

export async function authenticateFingerprint(storeId: string) {
  try {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { success: false, error: 'Not authenticated' };

    const SUPABASE_PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

    // 1. Get authentication options
    const optionsResp = await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/webauthn-clock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ action: 'generate-authentication' })
    });
    
    if (!optionsResp.ok) throw new Error('Failed to fetch authentication options');
    const options = await optionsResp.json();

    // 2. Pass options to browser authenticator
    let attResp;
    try {
      attResp = await startAuthentication({ optionsJSON: options });
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        return { success: false, error: 'Fingerprint scan was cancelled.' };
      }
      return { success: false, error: error.message };
    }

    // 3. Send response back to edge function for verification
    const verificationResp = await fetch(`${SUPABASE_PROJECT_URL}/functions/v1/webauthn-clock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ 
        action: 'verify-authentication', 
        authenticationResponse: attResp,
        admin_uid: session.user.id,
        store_id: storeId
      })
    });

    const verificationJSON = await verificationResp.json();
    if (verificationJSON && verificationJSON.success) {
      return verificationJSON;
    } else {
      return { success: false, error: verificationJSON.error || 'Verification failed' };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
