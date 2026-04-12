import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Service worker servido por la app para que cada deploy tenga CACHE_NAME distinto
 * y los navegadores no retengan un sw.js obsoleto como archivo estático.
 */
export async function GET() {
  const cacheId =
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_BUILD_ID ||
    'local';
  const safeId = String(cacheId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'local';

  const script = `const CACHE_NAME='chef-one-${safeId}';
const CORE_ASSETS=['/','/login','/panel','/dashboard','/productos','/resumen','/appcc/temperaturas','/appcc/equipos','/manifest.webmanifest'];
self.addEventListener('message',(e)=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('install',(e)=>{e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(CORE_ASSETS)));});
self.addEventListener('activate',(e)=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',(e)=>{const{request}=e;if(request.method!=='GET')return;const url=new URL(request.url);const html=request.headers.get('accept')?.includes('text/html');
if(url.pathname.startsWith('/api/')){e.respondWith(fetch(request));return;}
if(request.mode==='navigate'||html){e.respondWith(fetch(request).catch(()=>caches.match(request).then(c=>c||caches.match('/'))));return;}
e.respondWith(caches.match(request).then(c=>c||fetch(request).then(r=>{const cl=r.clone();caches.open(CACHE_NAME).then(ch=>ch.put(request,cl));return r;})));});
`;

  return new NextResponse(script, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
      'Service-Worker-Allowed': '/',
    },
  });
}
