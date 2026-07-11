import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'

export async function middleware(req: NextRequest) {
  if (!process.env.SESSION_SECRET) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  const SECRET = new TextEncoder().encode(process.env.SESSION_SECRET)
  const token = req.cookies.get('nudge_session')?.value

  if (!token) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  try {
    await jwtVerify(token, SECRET)
    return NextResponse.next()
  } catch {
    return NextResponse.redirect(new URL('/login', req.url))
  }
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
