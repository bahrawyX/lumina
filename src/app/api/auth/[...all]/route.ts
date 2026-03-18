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

function isMicrosoftSignInPath(url: URL): boolean {
	return url.pathname.endsWith("/sign-in/microsoft");
}

function buildMicrosoftSocialSignInRequest(request: Request): Request {
	const url = new URL(request.url);
	url.pathname = url.pathname.replace(/\/sign-in\/microsoft$/, "/sign-in/social");

	const callbackURL = new URL(request.url).searchParams.get("callbackURL") ?? `${url.origin}/`;
	const headers = new Headers(request.headers);
	headers.set("content-type", "application/json");

	return new Request(url.toString(), {
		method: "POST",
		headers,
		body: JSON.stringify({
			provider: "microsoft",
			callbackURL,
		}),
	});
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => {
	const url = new URL(request.url);
	if (isMicrosoftSignInPath(url)) {
		return handlers.POST(buildMicrosoftSocialSignInRequest(request));
	}
	return handlers.GET(normalizeSessionAlias(request));
};

export const POST = (request: Request) => {
	const url = new URL(request.url);
	if (isMicrosoftSignInPath(url)) {
		return handlers.POST(buildMicrosoftSocialSignInRequest(request));
	}
	return handlers.POST(request);
};
export const PATCH = handlers.PATCH;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
