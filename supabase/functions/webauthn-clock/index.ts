import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} from "npm:@simplewebauthn/server@9.0.1";
import { isoBase64URL } from "npm:@simplewebauthn/server@9.0.1/helpers";

const rpName = "Coffee Shop ERP";
const rpID = "localhost"; // For local dev. Will need to be the actual domain in prod. Wait, since it's a Tauri app, the rpID should be "localhost" or "tauri.localhost". Let's configure it via client origin.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const action = body.action;

    // We will extract origin and rpID from the request or body
    const origin = req.headers.get("origin") || body.origin || "http://localhost:1420";
    let expectedOrigin = origin;
    // Tauri apps usually use tauri://localhost or http://tauri.localhost or http://localhost:1420
    const rpID = new URL(expectedOrigin).hostname;

    if (action === 'generate-registration') {
      const { user_id, username } = body;
      const userCredentials = await supabaseClient.from('employee_webauthn_credentials').select('credential_id').eq('user_id', user_id);
      
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userID: user_id, // simplewebauthn v9 userID is string
        userName: username,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'preferred',
        },
      });

      // Save challenge
      await supabaseClient.from('employee_webauthn_challenges').insert({
        challenge: options.challenge,
        user_id: user_id,
        expires_at: new Date(Date.now() + 60000).toISOString()
      });

      return new Response(JSON.stringify(options), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    if (action === 'verify-registration') {
      const { user_id, registrationResponse } = body;
      const { data: challenges } = await supabaseClient
        .from('employee_webauthn_challenges')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (!challenges || challenges.length === 0) throw new Error('Challenge not found');
      const expectedChallenge = challenges[0].challenge;

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: registrationResponse,
          expectedChallenge,
          expectedOrigin,
          expectedRPID: rpID,
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
      }

      const { verified, registrationInfo } = verification;
      if (verified && registrationInfo) {
        const { credentialID, credentialPublicKey, counter, credentialDeviceType, credentialBackedUp } = registrationInfo;
        
        // Save to DB
        // credentialPublicKey is Uint8Array, we need to store it as HEX or Base64 so Postgres BYTEA can store it.
        // Actually Supabase JS allows Uint8Array for BYTEA ? No, hex string is safer: `\\x${hex}`
        const pubKeyHex = Array.from(credentialPublicKey).map(b => b.toString(16).padStart(2, '0')).join('');
        
        await supabaseClient.from('employee_webauthn_credentials').insert({
          user_id: user_id,
          credential_id: isoBase64URL.fromBuffer(credentialID),
          public_key: `\\x${pubKeyHex}`,
          counter: counter,
          device_type: credentialDeviceType,
          backed_up: credentialBackedUp
        });
        return new Response(JSON.stringify({ success: true }), { headers: { 'Access-Control-Allow-Origin': '*' } });
      }
      return new Response(JSON.stringify({ success: false }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    if (action === 'generate-authentication') {
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'preferred',
      });
      await supabaseClient.from('employee_webauthn_challenges').insert({
        challenge: options.challenge,
        expires_at: new Date(Date.now() + 60000).toISOString()
      });
      return new Response(JSON.stringify(options), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
    }

    if (action === 'verify-authentication') {
      const { authenticationResponse, admin_uid, store_id } = body;
      const credentialId = authenticationResponse.id; // This is base64url

      const { data: creds } = await supabaseClient
        .from('employee_webauthn_credentials')
        .select('*, user:profiles(username)')
        .eq('credential_id', credentialId)
        .single();
      
      if (!creds) throw new Error('Credential not found');

      // Get latest challenge
      const { data: challenges } = await supabaseClient
        .from('employee_webauthn_challenges')
        .select('*')
        .is('user_id', null)
        .order('created_at', { ascending: false })
        .limit(1);
      
      const expectedChallenge = challenges[0].challenge;

      // public_key is returned as hex string without \x by some pg drivers, or a base64 string.
      // Wait, let's just fetch it as is. If we saved it as \xHEX, Supabase returns it as a hex string `\x...` or just string.
      // Actually, if we use BYTEA, PostgREST returns it as hex string `\x1234...`
      const pubKeyStr = creds.public_key.startsWith('\\x') ? creds.public_key.slice(2) : creds.public_key;
      const pubKeyBytes = new Uint8Array(pubKeyStr.match(/.{1,2}/g).map((byte: string) => parseInt(byte, 16)));

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: authenticationResponse,
          expectedChallenge,
          expectedOrigin,
          expectedRPID: rpID,
          authenticator: {
            credentialID: isoBase64URL.toBuffer(creds.credential_id),
            credentialPublicKey: pubKeyBytes,
            counter: creds.counter,
            transports: creds.transports,
          },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
      }

      if (verification.verified) {
        await supabaseClient.from('employee_webauthn_credentials').update({ counter: verification.authenticationInfo.newCounter }).eq('id', creds.id);

        // CLOCK IN / OUT
        const targetUserId = creds.user_id;
        const targetUsername = creds.user.username;

        const { data: lastEvent } = await supabaseClient
          .from('time_clock_events')
          .select('event_type')
          .eq('user_id', targetUserId)
          .order('occurred_at', { ascending: false })
          .limit(1);

        const isClockedIn = lastEvent && lastEvent[0].event_type === 'clock_in';
        const newEventType = isClockedIn ? 'clock_out' : 'clock_in';

        const { data: eventData, error: eventError } = await supabaseClient
          .from('time_clock_events')
          .insert({
            store_id: store_id,
            user_id: targetUserId,
            event_type: newEventType,
            source: 'biometric',
            created_by: admin_uid
          })
          .select()
          .single();

        if (eventError) throw eventError;

        return new Response(JSON.stringify({ success: true, username: targetUsername, action: newEventType, event_id: eventData.id }), { headers: { 'Access-Control-Allow-Origin': '*' } });
      }

      return new Response(JSON.stringify({ success: false, error: 'Verification failed' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    return new Response('Invalid action', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
  }
});
