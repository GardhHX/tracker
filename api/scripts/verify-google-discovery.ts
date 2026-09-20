import assert from "node:assert/strict";
import { createGoogleProvider } from "../src/modules/auth/google.js";

const provider = createGoogleProvider({
  clientId: "dummy-client-id.apps.googleusercontent.com",
  clientSecret: "dummy-secret",
  redirectUri: "http://127.0.0.1:4000/api/v1/auth/google/callback",
});

const transaction = await provider.start();
const url = new URL(transaction.authorizationUrl);
console.log("host:", url.host);
console.log("path:", url.pathname);
console.log("scope:", url.searchParams.get("scope"));
console.log("code_challenge_method:", url.searchParams.get("code_challenge_method"));
console.log("redirect_uri:", url.searchParams.get("redirect_uri"));
console.log("client_id:", url.searchParams.get("client_id"));
console.log("has state/nonce/verifier:", Boolean(transaction.state && transaction.nonce && transaction.codeVerifier));
assert.equal(url.host, "accounts.google.com");
assert.equal(url.searchParams.get("code_challenge_method"), "S256");
assert.ok(transaction.authorizationUrl.includes("accounts.google.com"));
console.log("GOOGLE_DISCOVERY_OK");
