import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const handlers = toNextJsHandler(auth);

function normalizeSessionAlias(request: Request): Request {
	const url = new URL(request.url);
	if (url.pathname.endsWith("/session")) {
		url.pathname = url.pathname.replace(/\/session$/, "/get-session");
		return new Request(url, request);
	}
	return request;
}

/**
 * F5.11: a GET→POST rewrite for `/sign-in/microsoft` used to live here,
 * converting a top-level GET into a synthetic POST to `/sign-in/social`.
 *
 * It was deleted because it was both unreachable and non-functional:
 *
 *   - **Unreachable.** `grep -rn "sign-in/microsoft" src tests scripts` matched
 *     only that route file. Both real call sites use
 *     `authClient.signIn.social` directly.
 *   - **Non-functional.** `signInSocial` sets a `Location` header and returns
 *     `c.json({url, redirect:true})` with status **200**, and browsers do not
 *     follow `Location` on a 200. A top-level GET would have rendered raw JSON
 *     at the user, not redirected them.
 *
 * The POST branch also silently discarded the caller's original body. There was
 * no open redirect — `originCheckMiddleware` validates `callbackURL` against
 * `trustedOrigins`, rejecting `https://evil.com/x`, `javascript:alert(1)` and
 * `//evil.com` alike — but dead code in the auth handler is worth removing on
 * its own, since it is the file least likely to be read carefully before being
 * copied.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => handlers.GET(normalizeSessionAlias(request));
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
