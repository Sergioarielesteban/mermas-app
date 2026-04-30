'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import React, { useCallback, useMemo, useState } from 'react';
import {
  BarChart3,
  Calculator,
  BookOpen,
  CalendarDays,
  ChefHat,
  ClipboardList,
  Factory,
  ListChecks,
  LogOut,
  Menu,
  MessageCircle,
  ShieldCheck,
  UtensilsCrossed,
  X,
  KeyRound,
  RefreshCcw,
  ShoppingCart,
  Package,
  Lock,
  Soup,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { canAccessCocinaCentralModule, canPlaceCentralSupplyOrder } from '@/lib/cocina-central-permissions';
import PullToRefreshPedidos from '@/components/PullToRefreshPedidos';
import { canAccessPedidos } from '@/lib/pedidos-access';
import { formatLocalHeaderName } from '@/lib/local-display-name';
import Logo from '@/components/Logo';
import NotificationBell from '@/components/notifications/NotificationBell';
import DemoModeBanner from '@/components/DemoModeBanner';
import RoleRouteGate from '@/components/RoleRouteGate';
import {
  canAccessChat,
  canAccessComidaPersonal,
  canAccessCocinaCentral,
  canAccessCuentaSeguridad,
  canAccessEscandallos,
  canAccessFinanzas,
  canAccessInventario,
  canAccessPedidosByRole,
} from '@/lib/app-role-permissions';
import { getModuleAccess } from '@/lib/canAccessModule';
import { APP_MODULE_HOME, getAppNavBreadcrumb, getParentRoute } from '@/lib/app-navigation';

type NavItemNote = { kind: 'note'; text: string };
type NavItemLink = {
  href?: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
  blocked?: boolean;
  blockedText?: string;
};
type NavItem = NavItemNote | NavItemLink;

const NAV_ITEMS: NavItem[] = [{ href: '/dashboard', label: 'Mermas', Icon: BookOpen }];

function titleForPath(pathname: string | null) {
  if (!pathname) return 'Mermas';
  if (pathname === '/panel' || pathname.startsWith('/panel/')) return 'Panel de control';
  if (pathname === '/' || pathname.startsWith('/dashboard')) return 'Mermas';
  if (pathname.startsWith('/productos')) return 'Productos del registro';
  if (pathname.startsWith('/resumen')) return 'Resumen';
  if (pathname.startsWith('/pedidos-cocina/historial')) return 'Mis pedidos a central';
  if (pathname.startsWith('/pedidos-cocina')) return 'Pedir a cocina central';
  if (pathname.startsWith('/finanzas')) return 'Finanzas';
  if (pathname.startsWith('/pedidos')) return 'Pedidos';
  if (pathname.startsWith('/checklist')) {
    if (pathname === '/checklist') return 'Check list';
    if (pathname.startsWith('/checklist/ejecutar')) return 'Ejecutar checklist';
    if (pathname.startsWith('/checklist/listas')) return 'Mis listas';
    if (pathname.startsWith('/checklist/historial')) return 'Historial checklist';
    if (pathname.startsWith('/checklist/correr')) return 'Check list en curso';
    return 'Check list';
  }
  if (pathname.startsWith('/servicio')) {
    if (pathname.startsWith('/servicio/produccion')) return 'Producción (servicio)';
    if (pathname.includes('/platos/nuevo')) return 'Nuevo plato';
    if (pathname.includes('/platos/') && pathname.includes('/editar')) return 'Editar plato';
    if (pathname.startsWith('/servicio/plato')) return 'Plato';
    return 'Servicio';
  }
  if (pathname.startsWith('/produccion')) {
    if (pathname === '/produccion') return 'Producción';
    if (pathname.startsWith('/produccion/ejecutar')) return 'Lista del día';
    if (pathname.startsWith('/produccion/planes')) return 'Plantillas';
    if (pathname.startsWith('/produccion/historial')) return 'Historial producción';
    if (pathname.startsWith('/produccion/correr')) return 'Lista en curso';
    return 'Producción';
  }
  if (pathname.startsWith('/inventario')) return 'Inventario';
  if (pathname.startsWith('/escandallos/recetas/nuevo')) return 'Nueva receta';
  if (pathname.startsWith('/escandallos/recetas/bases')) return 'Bases y elaborados';
  if (pathname.startsWith('/escandallos/recetas/') && pathname.endsWith('/editar')) return 'Editor de receta';
  if (pathname.startsWith('/escandallos/recetas')) return 'Libro de recetas';
  if (pathname.startsWith('/escandallos')) return 'Escandallos';
  if (pathname.startsWith('/cocina-central')) {
    if (pathname === '/cocina-central') return 'Cocina central';
    if (pathname === '/cocina-central/produccion/nueva') return 'Nueva orden de producción';
    if (pathname === '/cocina-central/produccion/manual') return 'Registro manual de lote';
    if (pathname === '/cocina-central/produccion/recetas/nueva') return 'Nueva fórmula de producción';
    if (pathname === '/cocina-central/produccion/recetas') return 'Fórmulas de producción';
    if (pathname.startsWith('/cocina-central/produccion/recetas/')) return 'Fórmula de producción';
    if (
      pathname.startsWith('/cocina-central/produccion/') &&
      pathname !== '/cocina-central/produccion/nueva' &&
      pathname !== '/cocina-central/produccion/manual'
    ) {
      return 'Detalle de producción';
    }
    if (pathname.startsWith('/cocina-central/produccion')) return 'Producción central';
    if (pathname.startsWith('/cocina-central/lotes')) return 'Lotes';
    if (pathname.startsWith('/cocina-central/etiquetas')) return 'Etiqueta';
    if (pathname.startsWith('/cocina-central/entregas')) return 'Entregas';
    if (pathname.startsWith('/cocina-central/recepciones')) return 'Recepciones';
    if (pathname.startsWith('/cocina-central/escanear')) return 'Escanear QR';
    if (pathname.startsWith('/cocina-central/lote')) return 'Lote';
    if (pathname.startsWith('/cocina-central/pedidos-sedes')) return 'Pedidos de sedes';
    if (pathname.startsWith('/cocina-central/catalogo-sedes')) return 'Catálogo sedes';
    if (pathname.startsWith('/cocina-central/inventario-interno')) return 'Inventario interno';
    return 'Cocina central';
  }
  if (pathname.startsWith('/personal/mi')) return 'Mi espacio';
  if (pathname.startsWith('/personal/manual-normas')) return 'Manual y normas';
  if (pathname.startsWith('/personal')) return 'Horarios';
  if (pathname.startsWith('/comida-personal')) return 'Consumo interno';
  if (pathname.startsWith('/chat')) return 'Chat del local';
  if (pathname.startsWith('/superadmin/locales')) return 'Panel global de locales';
  if (pathname.startsWith('/cuenta')) return 'Cuenta y seguridad';
  if (pathname === '/appcc') return 'APPCC';
  if (pathname.startsWith('/appcc/temperaturas')) return 'Registros de temperatura';
  if (pathname.startsWith('/appcc/historial')) return 'Historial';
  if (pathname.startsWith('/appcc/equipos')) return 'Equipos frío';
  if (pathname.startsWith('/appcc/aceite/registro')) return 'Aceite';
  if (pathname.startsWith('/appcc/aceite/historial')) return 'Historial aceite';
  if (pathname.startsWith('/appcc/aceite/equipos')) return 'Freidoras';
  if (pathname.startsWith('/appcc/aceite')) return 'Aceite';
  if (pathname.startsWith('/appcc/carta-alergenos/matriz')) return 'Matriz alérgenos';
  if (pathname.startsWith('/appcc/carta-alergenos/incidencias')) return 'Incidencias alérgenos';
  if (pathname.startsWith('/appcc/carta-alergenos/productos')) return 'Fichas ingrediente';
  if (pathname.startsWith('/appcc/carta-alergenos/')) return 'Detalle alérgenos';
  if (pathname.startsWith('/appcc/carta-alergenos')) return 'Carta y alérgenos';
  if (pathname.startsWith('/appcc/limpieza/registro')) return 'Limpieza';
  if (pathname.startsWith('/appcc/limpieza/historial')) return 'Historial limpieza';
  if (pathname.startsWith('/appcc/limpieza/tareas')) return 'Tareas limpieza';
  if (pathname.startsWith('/appcc/limpieza')) return 'Limpieza APPCC';
  if (pathname.startsWith('/appcc')) return 'APPCC';
  return 'Mermas';
}

function roleLabel(role: 'admin' | 'manager' | 'staff' | null): string {
  if (role === 'admin') return 'Admin';
  if (role === 'manager') return 'Manager';
  return 'Staff';
}

function planLabel(plan: 'OPERATIVO' | 'CONTROL' | 'PRO'): string {
  if (plan === 'OPERATIVO') return 'Operativo';
  if (plan === 'CONTROL') return 'Control';
  return 'PRO';
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPlanningFullBleed =
    pathname === '/personal/planificacion' || pathname?.startsWith('/personal/planificacion/');
  const [open, setOpen] = useState(false);
  const [confirmLogoutOpen, setConfirmLogoutOpen] = useState(false);
  const {
    email,
    displayName,
    loginUsername,
    logout,
    localId,
    localCode,
    localName,
    profileReady,
    profileRole,
    isCentralKitchen,
    plan,
    isSuperadmin,
    superadminViewingLocalId,
    clearSuperadminLocal,
  } = useAuth();
  const showCocinaCentral = profileReady && canAccessCocinaCentralModule(profileRole);
  const showPedidosCocina = profileReady && canPlaceCentralSupplyOrder(isCentralKitchen, localId);
  const localLabel = formatLocalHeaderName(localName ?? localCode) ?? localName ?? localCode;
  const sessionLabel = (displayName?.trim() || loginUsername?.trim() || null) ?? 'Usuario';
  const sessionRoleLabel = roleLabel(profileRole);
  const showPedidos = canAccessPedidos(localCode, email, localName, localId);

  const title = useMemo(() => titleForPath(pathname), [pathname]);
  const navItems = useMemo<NavItem[]>(() => {
    const role = profileRole ?? 'staff';
    const isBlockedByPlan = (module: Parameters<typeof getModuleAccess>[1]) => {
      if (!profileReady || !profileRole) return false;
      return !getModuleAccess({ plan, role: profileRole }, module).allowed;
    };
    const core: NavItem[] = showPedidos && canAccessPedidosByRole(role)
      ? [...NAV_ITEMS, { href: '/pedidos', label: 'Pedidos', Icon: ShoppingCart, blocked: isBlockedByPlan('pedidos') }]
      : [...NAV_ITEMS];
    const finanzas: NavItem[] =
      showPedidos && canAccessFinanzas(role)
        ? [{
            href: '/finanzas',
            label: 'Finanzas',
            Icon: BarChart3,
            blocked: isBlockedByPlan('finanzas'),
            blockedText: 'Disponible en plan superior',
          }]
        : [];
    const mid: NavItem[] = [
      { href: '/appcc', label: 'APPCC', Icon: ShieldCheck, blocked: isBlockedByPlan('appcc') },
      { href: '/checklist', label: 'Check list', Icon: ListChecks, blocked: isBlockedByPlan('checklist') },
      { href: '/servicio', label: 'Servicio', Icon: Soup, blocked: isBlockedByPlan('servicio') },
      { href: '/produccion', label: 'Producción', Icon: Factory, blocked: isBlockedByPlan('produccion') },
    ];
    const inv: NavItem[] = canAccessInventario(role)
      ? [{ href: '/inventario', label: 'Inventario', Icon: ClipboardList, blocked: isBlockedByPlan('inventario') }]
      : [];
    const esc: NavItem[] = canAccessEscandallos(role)
      ? [{ href: '/escandallos', label: 'Escandallos', Icon: Calculator, blocked: isBlockedByPlan('escandallos') }]
      : [];
    /** Comida + personal justo tras producción (flujo cocina / turno). */
    const comidaYHorarios: NavItem[] = [
      ...(canAccessComidaPersonal(role)
        ? [{ href: '/comida-personal', label: 'Consumo interno', Icon: UtensilsCrossed, blocked: isBlockedByPlan('comida_personal') }]
        : []),
      { href: '/personal', label: 'Horarios', Icon: CalendarDays, blocked: isBlockedByPlan('personal') },
    ];
    const chat: NavItem[] =
      canAccessChat(role) ? [{ href: '/chat', label: 'Chat', Icon: MessageCircle, blocked: isBlockedByPlan('chat') }] : [];
    const cuenta: NavItem[] = canAccessCuentaSeguridad(role)
      ? [{ href: '/cuenta/seguridad', label: 'Cuenta y seguridad', Icon: KeyRound }]
      : [];
    const cocina: NavItem[] =
      showCocinaCentral && canAccessCocinaCentral(role)
        ? [{ href: '/cocina-central', label: 'Cocina central', Icon: ChefHat, blocked: isBlockedByPlan('cocina_central') }]
        : [];
    const pedirCentral: NavItem[] = showPedidosCocina
      ? [{ href: '/pedidos-cocina', label: 'Pedir a central', Icon: Package }]
      : [];
    return [
      ...core,
      ...finanzas,
      ...mid,
      ...comidaYHorarios,
      ...inv,
      ...esc,
      ...chat,
      ...cuenta,
      ...cocina,
      ...pedirCentral,
    ];
  }, [showPedidos, showPedidosCocina, showCocinaCentral, profileReady, profileRole, plan]);

  const confirmAndLogout = () => setConfirmLogoutOpen(true);

  const goHierarchyBack = useCallback(() => {
    router.push(getParentRoute(pathname));
  }, [router, pathname]);

  const exitToModuleHome = useCallback(() => {
    router.push(APP_MODULE_HOME);
  }, [router]);

  const navBreadcrumb = useMemo(() => getAppNavBreadcrumb(pathname), [pathname]);

  /**
   * Recuperación fuerte: sin desregistrar el SW, `/_next/static/` sigue en cache-first y puedes quedarte
   * con JS viejo aunque el servidor ya tenga otro deploy. Borra todas las cachés del origen y quita el SW.
   */
  const refreshApp = () => {
    void (async () => {
      try {
        if ('serviceWorker' in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
        if (typeof caches !== 'undefined') {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {
        /* ignore */
      }
      window.location.reload();
    })();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <DemoModeBanner />
      {confirmLogoutOpen ? (
        <>
          <button
            type="button"
            aria-hidden
            onClick={() => setConfirmLogoutOpen(false)}
            className="fixed inset-0 z-[70] bg-black/45"
            tabIndex={-1}
          />
          <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto px-4 py-8">
            <div className="my-auto w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl ring-1 ring-zinc-200">
              <p className="text-sm font-extrabold text-zinc-900">Confirmar cierre de sesión</p>
              <p className="mt-1 text-sm text-zinc-600">¿Seguro que quieres cerrar sesión?</p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmLogoutOpen(false)}
                  className="h-10 flex-1 rounded-xl border border-zinc-300 bg-white px-3 text-sm font-bold text-zinc-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmLogoutOpen(false);
                    void logout();
                  }}
                  className="h-10 flex-1 rounded-xl bg-[#D32F2F] px-3 text-sm font-bold text-white"
                >
                  Cerrar sesión
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <header
        className={[
          'sticky top-0 z-40 shrink-0 shadow-lg print:hidden',
          'border-b border-[#b32020] bg-gradient-to-r from-[#B91C1C] to-[#D32F2F]',
        ].join(' ')}
      >
        <div className="mx-auto flex min-h-14 w-full max-w-full items-center gap-3 px-3 py-2 sm:max-w-2xl sm:px-4 md:max-w-4xl md:px-5 lg:max-w-5xl">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white/95 hover:bg-white/10 active:scale-[0.99]"
            aria-label="Abrir menú"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="min-w-0 flex-1 pr-1">
            <h1 className="line-clamp-2 text-sm font-extrabold uppercase leading-tight tracking-wide text-white sm:line-clamp-1">
              {title}
            </h1>
            {localId && localLabel ? (
              <p className="line-clamp-1 text-[10px] font-semibold uppercase tracking-wider text-white/85">
                {localLabel}
              </p>
            ) : null}
          </div>
          <NotificationBell />
          <button
            type="button"
            onClick={refreshApp}
            className="grid h-10 w-10 place-items-center rounded-xl text-white/95 hover:bg-white/10 active:scale-[0.99]"
            aria-label="Actualizar app"
            title="Actualizar app"
          >
            <RefreshCcw className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={confirmAndLogout}
            className="grid h-10 w-10 place-items-center rounded-xl text-white/95 hover:bg-white/10 active:scale-[0.99]"
            aria-label="Cerrar sesión"
            title="Cerrar sesión"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Backdrop */}
      <button
        type="button"
        aria-hidden={!open}
        onClick={() => setOpen(false)}
        className={[
          'fixed inset-0 z-50 bg-black/40 transition-opacity print:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
        tabIndex={-1}
      />

      {/* Drawer */}
      <aside
        className={[
          'fixed left-0 top-0 z-[60] flex h-[calc(100dvh-max(5.5rem,env(safe-area-inset-bottom)))] w-[84%] max-w-[320px] flex-col overflow-hidden bg-white shadow-2xl transition-transform print:hidden',
          open ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        aria-label="Menú lateral"
      >
        <div className="shrink-0 border-b border-zinc-200 bg-zinc-50/95">
          <div className="flex h-7 shrink-0 items-center justify-end px-1.5 pt-0.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100/90"
              aria-label="Cerrar menú"
            >
              <X className="h-[17px] w-[17px]" />
            </button>
          </div>
          <div className="px-2 pb-1.5 text-center">
            <div
              className="mx-auto flex min-h-0 max-h-[70px] w-full items-center justify-center overflow-hidden p-0"
              aria-hidden
            >
              <Logo variant="sidebar" className="select-none drop-shadow-sm" alt="" role="presentation" />
            </div>
            <p className="mb-2 mt-1 text-[0.8125rem] font-semibold leading-tight tracking-wide text-zinc-600">
              Gestión operativa
            </p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-1">
          {navItems.map((item) => {
            if ('kind' in item && item.kind === 'note') {
              return (
                <p
                  key={item.text}
                  className="mx-1 mb-2 rounded-xl bg-amber-50/90 px-3 py-2 text-[11px] font-medium leading-snug text-amber-950 ring-1 ring-amber-100"
                >
                  {item.text}
                </p>
              );
            }
            const entry = item as NavItemLink;
            const Icon = entry.Icon;
            if (entry.comingSoon || !entry.href) {
              return (
                <div
                  key={entry.label}
                  className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-500 ring-1 ring-zinc-200"
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    <span className="min-w-0 truncate">{entry.label}</span>
                  </span>
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    Próximamente
                  </span>
                </div>
              );
            }
            const isActive =
              entry.href === '/dashboard'
                ? pathname === '/dashboard' || pathname === '/'
                : entry.href === '/appcc'
                  ? pathname === '/appcc' || pathname?.startsWith('/appcc/')
                  : entry.href === '/checklist'
                    ? pathname === '/checklist' || pathname?.startsWith('/checklist/')
                    : entry.href === '/produccion'
                      ? pathname === '/produccion' || pathname?.startsWith('/produccion/')
                      : entry.href === '/escandallos'
                        ? pathname === '/escandallos' || pathname?.startsWith('/escandallos/')
                        : entry.href === '/cuenta/seguridad'
                          ? pathname === '/cuenta/seguridad' || pathname?.startsWith('/cuenta/')
                          : entry.href === '/cocina-central'
                            ? pathname === '/cocina-central' || pathname?.startsWith('/cocina-central/')
                            : pathname === entry.href || pathname?.startsWith(`${entry.href}/`);
            const targetHref = entry.blocked ? '/planes' : entry.href;

            return (
              <Link
                key={entry.href}
                href={targetHref}
                onClick={() => setOpen(false)}
                className={[
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[0.9375rem] font-semibold leading-snug transition-all',
                  entry.blocked ? 'opacity-55' : '',
                  isActive
                    ? 'bg-[#D32F2F]/10 text-[#D32F2F] shadow-sm ring-1 ring-[#D32F2F]/25'
                    : 'text-zinc-800 hover:bg-zinc-100',
                ].join(' ')}
              >
                <Icon className="h-[1.35rem] w-[1.35rem] shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{entry.label}</span>
                  {entry.blocked ? (
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                      {entry.blockedText ?? 'Disponible en plan superior'}
                    </span>
                  ) : null}
                </span>
                {entry.blocked ? <Lock className="h-4 w-4 shrink-0 text-zinc-500" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 px-3 pb-2 pt-1.5">
          <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/70 px-2.5 py-2">
            <div className="min-w-0 space-y-0.5 text-xs leading-tight">
              <p className="truncate font-semibold text-zinc-700">
                {sessionLabel} · {sessionRoleLabel}
              </p>
              <p className="truncate text-zinc-500">{localLabel || `Plan ${planLabel(plan)}`}</p>
            </div>
            {isSuperadmin ? (
              <Link
                href="/superadmin/locales"
                onClick={() => setOpen(false)}
                className="mt-1.5 flex w-full items-center justify-center rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
              >
                Panel global de locales
              </Link>
            ) : null}
            {isSuperadmin && superadminViewingLocalId ? (
              <button
                type="button"
                onClick={() => {
                  void clearSuperadminLocal();
                  setOpen(false);
                }}
                className="mt-1.5 flex w-full items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-900 hover:bg-amber-100"
              >
                Salir de simulación de local
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                confirmAndLogout();
                setOpen(false);
              }}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100"
            >
              <LogOut className="h-3.5 w-3.5" />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </aside>

      <main
        className={[
          'min-h-0 w-full flex-1 overflow-y-auto overscroll-contain pt-0 pb-5 md:pb-6',
          isPlanningFullBleed
            ? 'px-1 sm:px-2 md:px-2 lg:px-2'
            : 'mx-auto max-w-full px-4 sm:max-w-2xl sm:px-5 md:max-w-4xl md:px-6 lg:max-w-5xl lg:px-8',
        ].join(' ')}
      >
        {pathname !== '/panel' && !pathname?.startsWith('/panel/') ? (
          <div
            className={[
              'back-button-wrapper mt-1.5 mb-3 space-y-2 print:hidden',
              isPlanningFullBleed
                ? '-mx-1 px-1 sm:-mx-2 sm:px-2 md:-mx-2 md:px-2 lg:-mx-2 lg:px-2'
                : '-mx-4 px-4 sm:-mx-5 sm:px-5 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8',
            ].join(' ')}
          >
            <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:items-stretch">
              <button
                type="button"
                onClick={goHierarchyBack}
                className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300/90 bg-white px-3 py-2 text-sm font-bold text-zinc-800 shadow-[0_1px_0_rgba(0,0,0,0.04)] ring-1 ring-zinc-200/70 hover:bg-zinc-50 active:scale-[0.99]"
              >
                <span aria-hidden className="text-base leading-none">
                  ←
                </span>
                Volver
              </button>
              <button
                type="button"
                onClick={exitToModuleHome}
                className="flex min-h-10 flex-1 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-zinc-800 ring-1 ring-zinc-200/80 hover:bg-zinc-100 active:scale-[0.99]"
              >
                Salir del módulo
              </button>
            </div>
            {navBreadcrumb ? (
              <p className="text-center text-[11px] leading-snug text-zinc-600">
                <Link
                  href={navBreadcrumb.parentHref}
                  className="font-semibold text-[#B91C1C] underline-offset-2 hover:underline"
                >
                  ← {navBreadcrumb.parentLabel}
                </Link>
                <span className="mx-1.5 text-zinc-400" aria-hidden>
                  /
                </span>
                <span className="font-medium text-zinc-800">{navBreadcrumb.currentLabel}</span>
              </p>
            ) : null}
          </div>
        ) : null}
        <PullToRefreshPedidos>
          <RoleRouteGate>{children}</RoleRouteGate>
        </PullToRefreshPedidos>
      </main>
    </div>
  );
}

