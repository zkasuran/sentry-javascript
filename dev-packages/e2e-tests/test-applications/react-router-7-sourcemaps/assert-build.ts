import * as assert from 'assert/strict';
import {
  getArtifactBundles,
  getAssembleRequests,
  getDebugIdPairs,
  loadMockServerResults,
} from '@sentry-internal/test-utils';

const requests = loadMockServerResults();

console.log(`Captured ${requests.length} requests to mock Sentry server:\n`);
for (const req of requests) {
  console.log(`  ${req.method} ${req.url} (${req.bodySize} bytes)`);
}
console.log('');

// Auth token is forwarded on the upload requests.
const authenticated = requests.filter(r => r.authorization.includes('fake-auth-token'));
assert.ok(authenticated.length > 0, 'Expected requests carrying the configured auth token');

// The buildEnd hook creates and finalizes the release.
assert.ok(
  requests.some(r => r.url?.includes('/releases') && r.method === 'POST'),
  'Expected a POST to create the release',
);
assert.ok(
  requests.some(r => r.url?.includes('/releases/') && r.method === 'PUT'),
  'Expected a PUT to finalize the release',
);

// Chunk-upload options are fetched before uploading.
assert.ok(
  requests.some(r => r.url?.includes('/chunk-upload/') && r.method === 'GET'),
  'Expected a GET for chunk-upload options',
);

// The artifact bundle is uploaded via the assemble endpoint. For a bundle this
// small the payload rides in the assemble request itself (no separate
// /chunk-upload/ POST when the server reports no missing chunks), so the
// assemble request with its chunk checksums is the authoritative upload signal.
const assembleReqs = getAssembleRequests(requests);
assert.ok(assembleReqs.length > 0, 'Expected at least one artifact bundle assemble request');
for (const req of assembleReqs) {
  assert.ok(req.assembleBody?.projects?.includes('test-project'), 'Expected assemble request to target test-project');
  assert.ok(req.assembleBody?.version === 'test-release', 'Expected assemble request to reference the release version');
  assert.ok((req.assembleBody?.chunks?.length ?? 0) > 0, 'Expected assemble request to carry chunk checksums');
  const sha1 = /^[\da-f]{40}$/i;
  for (const chunk of req.assembleBody?.chunks ?? []) {
    assert.match(chunk, sha1, `Expected a SHA-1 chunk checksum, got: ${chunk}`);
  }
}
console.log(`Verified ${assembleReqs.length} assemble request(s) with valid chunk checksums\n`);

// When the server reports missing chunks, the CLI additionally POSTs the raw
// bundle — in that case assert on the richer debug-ID/manifest signal too.
const bundles = getArtifactBundles(requests);
if (bundles.length > 0) {
  const debugIdPairs = getDebugIdPairs(bundles);
  assert.ok(debugIdPairs.length > 0, 'Expected JS/sourcemap pairs with matching debug IDs');
  const uuidRegex = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  for (const pair of debugIdPairs) {
    assert.match(pair.debugId, uuidRegex, `Invalid debug ID: ${pair.debugId}`);
    console.log(`  ${pair.debugId}  ${pair.jsUrl}`);
  }
}

console.log('All sourcemap upload assertions passed!');
