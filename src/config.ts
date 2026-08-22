// Config is parsed and validated once, at module load. A missing or malformed value fails
// here with a clear message rather than surfacing as a confusing 401 on the first request.
function required(name: string, value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error(
      `Missing required environment variable: ${name}. Add it to .env at the project root (Vite only exposes VITE_-prefixed vars to the browser).`,
    );
  }
  return value.trim();
}

const supabaseUrl = required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL);
const publishableKey = required(
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
);

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(supabaseUrl)) {
  throw new Error(`VITE_SUPABASE_URL does not look like a Supabase project URL: ${supabaseUrl}`);
}

// Only the publishable key ever reaches the browser. The service key and the database DSN
// live in Supabase secrets and are readable only inside the edge functions.
export const config = {
  chatEndpoint: `${supabaseUrl.replace(/\/$/, '')}/functions/v1/agent-chat`,
  dataEndpoint: `${supabaseUrl.replace(/\/$/, '')}/functions/v1/airport-data`,
  publishableKey,
} as const;
