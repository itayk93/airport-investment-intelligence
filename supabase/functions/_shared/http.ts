const DEFAULT_ALLOWED_ORIGINS = [
  'https://airport-investment-intelligence.vercel.app',
  'http://localhost:5173',
];

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get('ALLOWED_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return new Set(configured?.length ? configured : DEFAULT_ALLOWED_ORIGINS);
}

export function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('origin');
  const headers: Record<string, string> = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins().has(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

export function isAllowedOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  return !origin || allowedOrigins().has(origin);
};

export function json(
  body: unknown,
  status = 200,
  req?: Request,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), ...extraHeaders, 'Content-Type': 'application/json' },
  });
}

export function preflight(req: Request): Response {
  if (!isAllowedOrigin(req)) return json({ error: 'Origin not allowed' }, 403, req);
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
