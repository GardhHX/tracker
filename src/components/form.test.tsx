import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GoogleButton } from "./form.js";

test("GoogleButton links to the supplied custom OAuth endpoint without Auth.js preview behavior", () => {
  const html = renderToStaticMarkup(<GoogleButton label="Continue with Google" />);

  assert.match(html, /<a[^>]+href="http:\/\/127\.0\.0\.1:4000\/api\/v1\/auth\/google\/start"/);
  assert.doesNotMatch(html, /Auth\.js|UI preview/);
});
