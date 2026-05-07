'use client';

/**
 * Los navegadores no permiten fijar impresora/medida por código (solo window.print()).
 * Este bloque explica cómo guardar un preajuste en el sistema para no reconfigurar cada vez.
 */
export default function LabelPrintSetupTip() {
  return (
    <details className="no-print rounded-2xl border border-zinc-200 bg-zinc-50/90 px-3 py-2 text-[11px] leading-relaxed text-zinc-600">
      <summary className="cursor-pointer select-none font-bold text-zinc-800">
        Menos clics cada vez (impresora y tamaño de etiqueta)
      </summary>
      <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2">
        <p>
          Por seguridad, la web <strong>no puede</strong> elegir sola la impresora ni el tamaño del rollo. Solo se abre el
          cuadro de impresión. Para no repetir todo:
        </p>
        <ul className="list-disc space-y-1.5 pl-4">
          <li>
            <strong className="text-zinc-800">macOS</strong>: Ajustes del sistema → Impresoras y escáneres → tu Brother como{' '}
            <strong>predeterminada</strong>. La primera vez, en Imprimir configura el papel (p. ej. 62×29 mm personalizado),
            márgenes <strong>Ninguno</strong> y desactiva cabeceras/pies del navegador. Luego en el menú <strong>Preajustes</strong>{' '}
            → <strong>Guardar como preajuste actual…</strong> (por ejemplo «ChefOne 62×29»). Más tarde solo eliges ese
            preajuste.
          </li>
          <li>
            <strong className="text-zinc-800">Windows</strong>: Configuración → Bluetooth e impresoras → impresora por
            defecto. Clic derecho en la Brother → <strong>Preferencias de impresión</strong> y deja el tamaño de etiqueta fijado
            en el driver.
          </li>
        </ul>
        <p className="text-zinc-500">
          Atajo: <kbd className="rounded border border-zinc-300 bg-white px-1">⌘</kbd>+<kbd className="rounded border border-zinc-300 bg-white px-1">P</kbd> (Mac) o{' '}
          <kbd className="rounded border border-zinc-300 bg-white px-1">Ctrl</kbd>+<kbd className="rounded border border-zinc-300 bg-white px-1">P</kbd> (Windows).
        </p>
      </div>
    </details>
  );
}
