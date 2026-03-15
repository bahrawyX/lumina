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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => handlers.GET(normalizeSessionAlias(request));
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
export const PUT = handlers.PUT;
export const DELETE = handlers.DELETE;
