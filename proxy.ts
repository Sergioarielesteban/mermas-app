import { NextResponse, type NextRequest } from 'next/server';
import { APP_MODULE_HOME_PATH, getDisabledModuleForPath } from '@/lib/module-config';

export function proxy(request: NextRequest) {
  const disabledModule = getDisabledModuleForPath(request.nextUrl.pathname);
  if (!disabledModule) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = APP_MODULE_HOME_PATH;
  url.search = '';
  url.hash = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\..*).*)'],
};
