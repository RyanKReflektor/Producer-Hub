import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

async function getUserRole(request: NextRequest, userId: string): Promise<string | null> {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {},
      },
    }
  )
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single()

  return profile?.role ?? null
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  // Auth callback + password reset - always allow (recovery token is parsed
  // client-side from the URL, so the server won't see a session yet).
  if (pathname === '/auth/callback' || pathname === '/reset-password') {
    return supabaseResponse
  }

  // Login page
  if (pathname === '/login') {
    if (user) {
      const role = await getUserRole(request, user.id)
      if (role === 'contributor') {
        return NextResponse.redirect(new URL('/timesheet', request.url))
      }
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return supabaseResponse
  }

  // All other routes require auth
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const role = await getUserRole(request, user.id)

  // Redirect root
  if (pathname === '/') {
    if (role === 'contributor') {
      return NextResponse.redirect(new URL('/timesheet', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Producer-only routes
  const producerRoutes = ['/dashboard', '/projects', '/people', '/approvals', '/resourcing', '/timeline']
  const isProducerRoute = producerRoutes.some(r => pathname === r || pathname.startsWith(r + '/'))

  if (isProducerRoute && role !== 'producer') {
    return NextResponse.redirect(new URL('/timesheet', request.url))
  }

  // Contributor-only routes
  if ((pathname === '/timesheet' || pathname.startsWith('/timesheet/')) && role !== 'contributor') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
