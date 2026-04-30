/**
 * Navegación jerárquica fija: el botón «Volver» usa siempre `getParentRoute` + `router.push`,
 * nunca el historial del navegador.
 */

export const APP_MODULE_HOME = '/panel';

const PATH_LABEL: Record<string, string> = {
  [APP_MODULE_HOME]: 'Módulos',
  '/dashboard': 'Mermas',
  '/resumen': 'Resumen',
  '/productos': 'Productos',
  '/pedidos': 'Pedidos',
  '/pedidos/historial-mes': 'Compras del mes',
  '/pedidos/precios': 'Evolución de precios',
  '/pedidos/proveedores': 'Proveedores',
  '/pedidos/articulos': 'Artículos base',
  '/pedidos/nuevo': 'Nuevo pedido',
  '/pedidos/recepcion': 'Recepción',
  '/pedidos/calendario': 'Calendario',
  '/pedidos/albaranes': 'Albaranes',
  '/pedidos/albaranes/nuevo': 'Nuevo albarán',
  '/cocina-central': 'Cocina central',
  '/cocina-central/recetario': 'Recetario',
  '/cocina-central/lotes': 'Lotes',
  '/cocina-central/produccion': 'Producción',
  '/cocina-central/produccion/recetas': 'Fórmulas',
  '/cocina-central/produccion/nueva': 'Nueva orden',
  '/cocina-central/produccion/manual': 'Registro manual',
  '/cocina-central/entregas': 'Entregas',
  '/cocina-central/entregas/nueva': 'Nueva entrega',
  '/cocina-central/recepciones': 'Recepciones',
  '/cocina-central/escanear': 'Escanear',
  '/cocina-central/pedidos-sedes': 'Pedidos sedes',
  '/cocina-central/catalogo-sedes': 'Catálogo sedes',
  '/cocina-central/inventario-interno': 'Inventario interno',
  '/escandallos': 'Escandallos',
  '/escandallos/recetas': 'Recetas',
  '/escandallos/recetas/nuevo': 'Nueva receta',
  '/escandallos/recetas/bases': 'Bases',
  '/escandallos/centro': 'Centro',
  '/inventario': 'Inventario',
  '/finanzas': 'Finanzas',
  '/checklist': 'Check list',
  '/checklist/ejecutar': 'Ejecutar',
  '/produccion': 'Producción',
  '/produccion/ejecutar': 'Lista del día',
  '/produccion/planes': 'Plantillas',
  '/produccion/historial': 'Historial',
  '/servicio': 'Servicio',
  '/personal': 'Horarios',
  '/comida-personal': 'Consumo interno',
  '/chat': 'Chat',
  '/appcc': 'APPCC',
  '/cuenta/seguridad': 'Cuenta y seguridad',
  '/pedidos-cocina': 'Pedir a central',
  '/pedidos-cocina/historial': 'Historial pedidos',
  '/superadmin/locales': 'Locales',
  '/planes': 'Planes',
};

function normalizePath(pathname: string): string {
  const t = pathname.replace(/\/+$/, '');
  return t || '/';
}

/** Etiqueta corta para breadcrumb; cubre rutas dinámicas con heurísticas. */
export function navLabelForPath(pathname: string): string {
  const path = normalizePath(pathname);
  const fromMap = PATH_LABEL[path];
  if (fromMap) return fromMap;

  if (/^\/cocina-central\/produccion\/recetas\/[^/]+$/.test(path)) return 'Fórmula';
  if (/^\/cocina-central\/produccion\/[^/]+$/.test(path)) return 'Orden';
  if (/^\/cocina-central\/lotes\/[^/]+$/.test(path)) return 'Lote';
  if (/^\/cocina-central\/lote(\/[^/]+)?$/.test(path)) return 'Lote';
  if (/^\/cocina-central\/etiquetas\/[^/]+$/.test(path)) return 'Etiqueta';
  if (/^\/cocina-central\/entregas\/[^/]+$/.test(path)) return 'Entrega';
  if (/^\/cocina-central\/pedidos-sedes\/[^/]+$/.test(path)) return 'Pedido sede';
  if (/^\/pedidos\/albaranes\/[^/]+$/.test(path)) return 'Albarán';
  if (/^\/escandallos\/recetas\/[^/]+\/editar$/.test(path)) return 'Editar receta';
  if (/^\/checklist\/correr\/[^/]+$/.test(path)) return 'Check list';
  if (/^\/produccion\/correr\/[^/]+$/.test(path)) return 'Lista en curso';
  if (/^\/pedidos-cocina\/[^/]+$/.test(path)) return 'Pedido';
  if (/^\/servicio\/plato\/[^/]+$/.test(path)) return 'Plato';
  if (/^\/servicio\/platos\/[^/]+\/editar$/.test(path)) return 'Editar plato';
  if (/^\/servicio\/platos\/nuevo$/.test(path)) return 'Nuevo plato';
  if (/^\/servicio\/produccion$/.test(path)) return 'Producción servicio';

  const segs = path.split('/').filter(Boolean);
  const last = segs[segs.length - 1];
  if (last && /^[0-9a-f-]{8,}$/i.test(last)) return 'Detalle';
  if (last) return last.charAt(0).toUpperCase() + last.slice(1).replace(/-/g, ' ');
  return 'Módulos';
}

export type AppNavBreadcrumb = {
  parentHref: string;
  parentLabel: string;
  currentLabel: string;
};

/**
 * Breadcrumb de un solo salto: padre jerárquico · pantalla actual.
 * En `/panel` u otras raíces sin padre útil, devuelve null.
 */
export function getAppNavBreadcrumb(pathname: string | null): AppNavBreadcrumb | null {
  if (!pathname) return null;
  const path = normalizePath(pathname);
  if (path === APP_MODULE_HOME) return null;
  const parent = getParentRoute(pathname);
  if (parent === path) return null;
  return {
    parentHref: parent,
    parentLabel: navLabelForPath(parent),
    currentLabel: navLabelForPath(path),
  };
}

/**
 * Ruta padre lógica (un nivel hacia arriba en la jerarquía de la app).
 */
export function getParentRoute(pathname: string | null): string {
  if (!pathname) return APP_MODULE_HOME;
  const path = normalizePath(pathname);

  if (path === APP_MODULE_HOME || path === '/' || path === '/login') return APP_MODULE_HOME;

  // —— Pedidos ——
  if (path === '/pedidos/precios') return '/pedidos/historial-mes';
  if (path.startsWith('/pedidos/albaranes/')) {
    if (path === '/pedidos/albaranes/nuevo') return '/pedidos/albaranes';
    return '/pedidos/albaranes';
  }
  if (path.startsWith('/pedidos/') && path !== '/pedidos') return '/pedidos';
  if (path === '/pedidos') return APP_MODULE_HOME;

  // —— Mermas (dashboard / productos / resumen) ——
  if (path === '/resumen' || path === '/productos') return '/dashboard';
  if (path === '/dashboard') return APP_MODULE_HOME;

  // —— Cocina central ——
  if (path === '/cocina-central/recetario') return '/cocina-central';
  if (path.startsWith('/cocina-central/lotes/') && path !== '/cocina-central/lotes') return '/cocina-central/lotes';
  if (path === '/cocina-central/lotes') return '/cocina-central';
  if (path.startsWith('/cocina-central/lote')) return '/cocina-central/lotes';

  if (path === '/cocina-central/produccion/recetas/nueva') return '/cocina-central/produccion/recetas';
  if (/^\/cocina-central\/produccion\/recetas\/[^/]+$/.test(path)) return '/cocina-central/produccion/recetas';
  if (path === '/cocina-central/produccion/recetas') return '/cocina-central/produccion';
  if (path === '/cocina-central/produccion/nueva' || path === '/cocina-central/produccion/manual') {
    return '/cocina-central/produccion';
  }
  if (/^\/cocina-central\/produccion\/[^/]+$/.test(path)) return '/cocina-central/produccion';
  if (path === '/cocina-central/produccion') return '/cocina-central';

  if (path.startsWith('/cocina-central/etiquetas/')) return '/cocina-central/lotes';
  if (path === '/cocina-central/entregas/nueva') return '/cocina-central/entregas';
  if (path.startsWith('/cocina-central/entregas/')) return '/cocina-central/entregas';
  if (path === '/cocina-central/entregas') return '/cocina-central';

  if (
    path.startsWith('/cocina-central/pedidos-sedes/') &&
    path !== '/cocina-central/pedidos-sedes'
  ) {
    return '/cocina-central/pedidos-sedes';
  }

  if (path.startsWith('/cocina-central/') && path !== '/cocina-central') return '/cocina-central';
  if (path === '/cocina-central') return APP_MODULE_HOME;

  // —— Escandallos ——
  if (path.endsWith('/editar') && /^\/escandallos\/recetas\/.+/.test(path)) return '/escandallos/recetas';
  if (path === '/escandallos/recetas/nuevo' || path === '/escandallos/recetas/bases') return '/escandallos/recetas';
  if (path === '/escandallos/recetas') return '/escandallos';
  if (path.startsWith('/escandallos/') && path !== '/escandallos') return '/escandallos';
  if (path === '/escandallos') return APP_MODULE_HOME;

  // —— Checklist / producción local (runs en curso) ——
  if (/^\/checklist\/correr\/[^/]+$/.test(path)) return '/checklist/ejecutar';
  if (/^\/produccion\/correr\/[^/]+$/.test(path)) return '/produccion/ejecutar';

  // —— Pedidos a cocina central ——
  if (/^\/pedidos-cocina\/[^/]+$/.test(path)) return '/pedidos-cocina';
  if (path === '/pedidos-cocina/historial') return '/pedidos-cocina';
  if (path === '/pedidos-cocina') return APP_MODULE_HOME;

  // —— Servicio (platos) ——
  if (/^\/servicio\/platos\/[^/]+\/editar$/.test(path)) return '/servicio';
  if (path === '/servicio/platos/nuevo') return '/servicio';
  if (/^\/servicio\/plato\/[^/]+$/.test(path)) return '/servicio';
  if (path === '/servicio/produccion') return '/servicio';

  // —— Cuenta / superadmin (sin índice intermedio) ——
  if (path.startsWith('/cuenta')) return APP_MODULE_HOME;
  if (path.startsWith('/superadmin')) return APP_MODULE_HOME;

  // —— Fallback: subir un segmento; si queda huérfano, panel ——
  const segs = path.split('/').filter(Boolean);
  if (segs.length <= 1) return APP_MODULE_HOME;
  return `/${segs.slice(0, -1).join('/')}`;
}
