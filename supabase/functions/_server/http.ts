// Deno-only helpers shared by Gather's Edge Functions.
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export type ErrorCode = 'unauthenticated' | 'forbidden' | 'not_found' | 'validation' | 'rate_limited' | 'not_configured' | 'moderation' | 'unknown';

export class HttpError extends Error {
  constructor(public status: number, message: string, public code: ErrorCode = 'unknown') {
    super(message);
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

export function env(name: string, required = true): string {
  const v = Deno.env.get(name) ?? '';
  if (required && !v) throw new HttpError(503, `Server is missing configuration (${name}).`, 'not_configured');
  return v;
}

/** Resolve the calling user from their JWT and return a user-scoped client (RLS applies). */
export async function authenticate(req: Request): Promise<{ user: User; userClient: SupabaseClient; admin: SupabaseClient }> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) throw new HttpError(401, 'Please sign in again.', 'unauthenticated');
  const url = env('SUPABASE_URL');
  const userClient = createClient(url, env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await userClient.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new HttpError(401, 'Your session expired. Please sign in again.', 'unauthenticated');
  const admin = createClient(url, env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  return { user: data.user, userClient, admin };
}

/** Wrap a handler with CORS, JSON errors and safe logging (no request bodies in logs). */
export function serve(handler: (req: Request) => Promise<Response>) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return json({ error: 'Method not allowed', code: 'validation' }, 405);
    try {
      return await handler(req);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message, code: e.code }, e.status);
      console.error('[gather] unhandled error', e instanceof Error ? e.message : e);
      return json({ error: 'Something went wrong on our side. Please try again.', code: 'unknown' }, 500);
    }
  });
}
