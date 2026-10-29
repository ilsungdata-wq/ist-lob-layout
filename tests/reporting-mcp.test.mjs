import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, TOOLS } from '../supabase/functions/reporting-mcp/core.mjs';
const resource = 'https://example.supabase.co/functions/v1/reporting-mcp';
const config = { resource, issuer: 'https://login.example.com/', supabaseUrl: 'https://example.supabase.co', anonKey: 'public-anon-key', subjects: ['reporter'] };
const claims = { sub: 'reporter', scope: 'reports:read', exp: 4102444800 };
function harness(rows = [], identity = claims, sourceStatus = 200) {
  const calls = [];
  const handler = createHandler(config, async token => { if (token !== 'valid') throw Error(); return identity; }, async (url, options) => {
    calls.push({ url: new URL(url), options });
    return new Response(JSON.stringify(rows), { status: sourceStatus });
  });
  return { calls, handler };
}
function request(method = 'tools/list', params = {}, extra = {}) {
  return new Request(resource, { method: 'POST', headers: { Authorization: 'Bearer valid', 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...extra }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
}
test('unauthorized requests never touch source', async () => {
  const { handler, calls } = harness();
  const response = await handler(request('tools/list', {}, { Authorization: '' }));
  assert.equal(response.status, 401); assert.match(response.headers.get('WWW-Authenticate'), /resource_metadata/); assert.equal(calls.length, 0);
});
test('deny missing scope, non-allowlisted subject and expired token', async () => {
  for (const identity of [{ ...claims, scope: '' }, { ...claims, sub: 'stranger' }, { ...claims, exp: 1 }]) {
    const { handler, calls } = harness([], identity);
    assert.ok([401, 403].includes((await handler(request())).status)); assert.equal(calls.length, 0);
  }
});
test('OAuth metadata is public and contains no keys', async () => {
  const { handler } = harness();
  const r = await handler(new Request(resource + '/.well-known/oauth-protected-resource'));
  const data = await r.json(); assert.equal(data.resource, resource); assert.deepEqual(data.authorization_servers, [config.issuer]); assert.ok(!JSON.stringify(data).includes(config.anonKey));
});
test('unknown paths and hostile origins rejected', async () => {
  const { handler } = harness();
  assert.equal((await handler(new Request(resource + '/other'))).status, 404);
  assert.equal((await handler(request('tools/list', {}, { Origin: 'https://evil.example' }))).status, 403);
});
test('initialize negotiates known versions', async () => {
  const { handler } = harness();
  for (const version of ['2025-06-18', 'unknown']) {
    const data = await (await handler(request('initialize', { protocolVersion: version }))).json();
    assert.equal(data.result.protocolVersion, version === 'unknown' ? '2025-11-25' : version); assert.ok(data.result.capabilities.tools);
  }
});
test('all five tools require OAuth and are read only', async () => {
  assert.equal(TOOLS.length, 5);
  for (const tool of TOOLS) { assert.equal(tool.annotations.readOnlyHint, true); assert.equal(tool.annotations.destructiveHint, false); assert.equal(tool.securitySchemes[0].type, 'oauth2'); }
});
test('published list paginates and never forwards OAuth token upstream', async () => {
  const { handler, calls } = harness(Array.from({ length: 101 }, (_, i) => ({ id: i, lob_summary: { mp: 2 } })));
  const data = await (await handler(request('tools/call', { name: 'list_published_models', arguments: { offset: 100 } }))).json();
  assert.equal(data.result.structuredContent.rows.length, 100); assert.equal(data.result.structuredContent.next_offset, 200);
  assert.equal(calls[0].url.pathname, '/rest/v1/rpc/get_published_workspace'); assert.equal(calls[0].url.searchParams.get('offset'), '100');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer public-anon-key');
});
test('exact model filters encoded as one query value', async () => {
  const { handler, calls } = harness();
  await handler(request('tools/call', { name: 'list_standard_times', arguments: { model_name: 'F731 Main&limit=900' } }));
  assert.equal(calls[0].url.searchParams.get('model_name'), 'eq.F731 Main&limit=900'); assert.equal(calls[0].url.searchParams.get('limit'), '101');
});
test('process pages preserve published revision without returning arbitrary layout blobs', async () => {
  const version = '12345678-1234-1234-1234-123456789abc';
  const { handler, calls } = harness([{ id: version, revision: 3, layout_data: { secretCanvas: 'not returned', processes: Array.from({ length: 105 }, (_, i) => ({ name: 'P' + i })) } }]);
  const data = await (await handler(request('tools/call', { name: 'get_published_processes', arguments: { version_id: version, offset: 100 } }))).json();
  assert.equal(data.result.structuredContent.revision, 3); assert.equal(data.result.structuredContent.rows.length, 5); assert.equal(data.result.structuredContent.next_offset, null); assert.ok(!JSON.stringify(data).includes('secretCanvas'));
  assert.deepEqual(JSON.parse(calls[0].options.body), { p_version_id: version });
});
test('price history flags legacy 100-row source cap', async () => {
  const { handler } = harness(Array.from({ length: 100 }, (_, id) => ({ id })));
  const data = await (await handler(request('tools/call', { name: 'get_price_history', arguments: { product_code: 'GH96-12345A' } }))).json();
  assert.equal(data.result.structuredContent.possibly_truncated, true); assert.equal(data.result.structuredContent.source_limit, 100);
});
test('invalid arguments and write tools cannot reach source', async () => {
  const { handler, calls } = harness();
  for (const params of [{ name: 'apply_st_voc_batch' }, { name: 'list_published_models', arguments: { offset: -1 } }, { name: 'list_published_models', arguments: { sql: 'drop table models' } }, { name: 'get_published_processes', arguments: { version_id: 'bad' } }, { name: 'get_price_history', arguments: {} }]) {
    const data = await (await handler(request('tools/call', params))).json(); assert.equal(data.error.code, -32602);
  }
  assert.equal(calls.length, 0);
});
test('source failure is an error, never an empty successful report', async () => {
  const { handler } = harness({ error: 'private db detail' }, claims, 500);
  const data = await (await handler(request('tools/call', { name: 'list_standard_times' }))).json();
  assert.equal(data.result.isError, true); assert.ok(!JSON.stringify(data).includes('private db detail'));
});
test('transport rejects invalid version, content and accept', async () => {
  const { handler } = harness();
  for (const [header, value, status] of [['MCP-Protocol-Version', 'bad', 400], ['Content-Type', 'text/plain', 415], ['Accept', 'text/html', 406]]) assert.equal((await handler(request('tools/list', {}, { [header]: value }))).status, status);
});
test('notifications accepted without response body', async () => {
  const { handler } = harness(); const req = request();
  const r = await handler(new Request(resource, { method: 'POST', headers: req.headers, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) }));
  assert.equal(r.status, 202); assert.equal(await r.text(), '');
});
test('oversized and malformed JSON rejected', async () => {
  const { handler } = harness();
  for (const [body, status] of [['x'.repeat(17000), 413], ['{', 400], ['[]', 400]]) assert.equal((await handler(new Request(resource, { method: 'POST', headers: request().headers, body }))).status, status);
});
test('missing allowlist fails closed at startup', () => {
  assert.throws(() => createHandler({ ...config, subjects: [] }, async () => claims));
});
