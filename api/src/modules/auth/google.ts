import * as client from "openid-client";
import type { GoogleIdentity } from "./repo.js";

export type GoogleOAuthTransaction = { authorizationUrl: string; state: string; nonce: string; codeVerifier: string };

export type GoogleProvider = {
  callbackUri: string;
  start(): Promise<GoogleOAuthTransaction>;
  complete(input: { callbackUrl: string; state: string; nonce: string; codeVerifier: string }): Promise<GoogleIdentity>;
};

function requiredString(claims: Record<string, unknown>, name: string) {
  const value = claims[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Google ID token is missing ${name}.`);
  return value;
}

// Google's issuer; discovery fetches the /.well-known/openid-configuration document once per process.
const GOOGLE_ISSUER = new URL("https://accounts.google.com");

export function createGoogleProvider(config: { clientId: string; clientSecret: string; redirectUri: string }): GoogleProvider {
  const configuration = client.discovery(GOOGLE_ISSUER, config.clientId, config.clientSecret);

  return {
    callbackUri: config.redirectUri,
    async start() {
      const settings = await configuration;
      const codeVerifier = client.randomPKCECodeVerifier();
      const authorizationUrl = client.buildAuthorizationUrl(settings, {
        redirect_uri: config.redirectUri,
        scope: "openid email profile",
        code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: "S256",
        state: client.randomState(),
        nonce: client.randomNonce(),
      });
      const state = authorizationUrl.searchParams.get("state")!;
      const nonce = authorizationUrl.searchParams.get("nonce")!;
      return { authorizationUrl: authorizationUrl.href, state, nonce, codeVerifier };
    },

    async complete({ callbackUrl, state, nonce, codeVerifier }) {
      const settings = await configuration;
      const tokens = await client.authorizationCodeGrant(settings, new URL(callbackUrl), {
        pkceCodeVerifier: codeVerifier,
        expectedState: state,
        expectedNonce: nonce,
      });
      const claims = tokens.claims() as unknown as Record<string, unknown> | undefined;
      if (!claims) throw new Error("Google response did not include an ID token.");
      return {
        subject: requiredString(claims, "sub"),
        email: requiredString(claims, "email"),
        emailVerified: claims.email_verified === true,
        name: typeof claims.name === "string" ? claims.name : "",
      };
    },
  };
}
