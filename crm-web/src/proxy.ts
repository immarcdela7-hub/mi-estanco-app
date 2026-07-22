import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { authSecretKey } from "@/lib/secret";

const COOKIE = "ntl_session";

type Claims = {
  role: "ADMIN" | "PARTNER";
  mustChange: boolean;
};

async function readClaims(req: NextRequest): Promise<Claims | null> {
  const token = req.cookies.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecretKey());
    return payload as unknown as Claims;
  } catch {
    return null;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const claims = await readClaims(req);

  const home = (c: Claims) => (c.role === "ADMIN" ? "/admin" : "/portal");

  if (pathname === "/login") {
    if (claims) {
      return NextResponse.redirect(
        new URL(claims.mustChange ? "/password" : home(claims), req.url)
      );
    }
    return NextResponse.next();
  }

  if (!claims) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (claims.mustChange && pathname !== "/password") {
    return NextResponse.redirect(new URL("/password", req.url));
  }

  if (pathname === "/" || (pathname === "/password" && !claims.mustChange)) {
    return NextResponse.redirect(new URL(home(claims), req.url));
  }

  if (pathname.startsWith("/admin") && claims.role !== "ADMIN") {
    return NextResponse.redirect(new URL("/portal", req.url));
  }
  if (pathname.startsWith("/portal") && claims.role !== "PARTNER") {
    return NextResponse.redirect(new URL("/admin", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/password",
    "/admin/:path*",
    "/portal/:path*",
    "/api/descargas/:path*",
  ],
};
