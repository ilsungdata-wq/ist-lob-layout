import { createRemoteJWKSet, jwtVerify } from 'npm:jose@6.1.0';
import { createHandler } from './core.mjs';

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing configuration: ${name}`);
  return value;
}
const issuer = required('REPORTING_OAUTH_ISSUER');
const resource = required('REPORTING_MCP_URL');
const jwksUrl = new URL(required('REPORTING_JWKS_URL'));
if (jwksUrl.protocol !== 'https:') throw new Error('HTTPS JWKS required');
const jwks = createRemoteJWKSet(jwksUrl);
const handler = createHandler({
  resource, issuer,
  supabaseUrl: required('SUPABASE_URL'),
  // Deliberately never use service_role or forward the OAuth token to Supabase.
  anonKey: required('SUPABASE_ANON_KEY'),
  subjects: required('REPORTING_ALLOWED_SUBJECTS').split(',').map(v => v.trim()).filter(Boolean),
}, async (token: string) => {
  const { payload } = await jwtVerify(token, jwks, {
    issuer, audience: resource, algorithms: ['RS256', 'ES256'],
    requiredClaims: ['exp', 'sub', 'iat'],
  });
  return payload;
});
Deno.serve(handler);
