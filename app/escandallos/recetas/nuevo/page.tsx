import { Suspense } from 'react';
import EscandalloNewRecipeWizard from '@/components/escandallos/EscandalloNewRecipeWizard';

export default function EscandalloNuevaRecetaPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-zinc-600">Cargando asistente…</p>}>
      <EscandalloNewRecipeWizard />
    </Suspense>
  );
}
