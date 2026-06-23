import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS. Only use server-side and only for
// operations where the caller has already validated access through normal RLS.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
