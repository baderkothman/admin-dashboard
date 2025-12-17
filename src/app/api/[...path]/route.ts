import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type HeadersWithGetSetCookie = Headers & {
  getSetCookie?: () => string[];
};

function hopByHopHeader(name: string) {
  const n = name.toLowerCase();
  return (
    n === "connection" ||
    n === "keep-alive" ||
    n === "proxy-authenticate" ||
    n === "proxy-authorization" ||
    n === "te" ||
    n === "trailers" ||
    n === "transfer-encoding" ||
    n === "upgrade"
  );
}

function getPathSegments(req: NextRequest): string[] {
  // Example: /api/login  -> ["login"]
  //          /api/users/5 -> ["users","5"]
  const pathname = req.nextUrl.pathname; // always present
  const rest = pathname.replace(/^\/api\/?/, ""); // remove "/api/"
  if (!rest) return [];
  return rest.split("/").filter(Boolean);
}

async function proxy(req: NextRequest) {
  const API_BASE = process.env.API_PROXY_BASE_URL; // read at runtime

  if (!API_BASE) {
    return NextResponse.json(
      { error: "API_PROXY_BASE_URL is not set" },
      { status: 500 }
    );
  }

  try {
    const incomingUrl = new URL(req.url);

    const segments = getPathSegments(req);
    const targetUrl = new URL(`/api/${segments.join("/")}`, API_BASE);
    targetUrl.search = incomingUrl.search;

    const headers = new Headers(req.headers);
    headers.delete("host");
    headers.delete("content-length");

    const method = req.method.toUpperCase();
    const body =
      method === "GET" || method === "HEAD"
        ? undefined
        : await req.arrayBuffer();

    let upstream: Response;
    try {
      upstream = await fetch(targetUrl.toString(), {
        method,
        headers,
        body,
        redirect: "manual",
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        {
          error: "Upstream API fetch failed",
          target: targetUrl.toString(),
          detail,
        },
        { status: 502 }
      );
    }

    const respHeaders = new Headers();
    upstream.headers.forEach((v, k) => {
      if (!hopByHopHeader(k)) respHeaders.set(k, v);
    });

    const headersWith = upstream.headers as HeadersWithGetSetCookie;
    const setCookies =
      typeof headersWith.getSetCookie === "function"
        ? headersWith.getSetCookie()
        : [];

    const setCookieSingle = upstream.headers.get("set-cookie"); // fallback

    const data = await upstream.arrayBuffer();
    const res = new NextResponse(data, {
      status: upstream.status,
      headers: respHeaders,
    });

    if (setCookies.length) {
      for (const c of setCookies) res.headers.append("set-cookie", c);
    } else if (setCookieSingle) {
      res.headers.append("set-cookie", setCookieSingle);
    }

    return res;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: "Proxy handler error", detail },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return proxy(req);
}
export async function POST(req: NextRequest) {
  return proxy(req);
}
export async function PUT(req: NextRequest) {
  return proxy(req);
}
export async function PATCH(req: NextRequest) {
  return proxy(req);
}
export async function DELETE(req: NextRequest) {
  return proxy(req);
}
export async function OPTIONS(req: NextRequest) {
  return proxy(req);
}
