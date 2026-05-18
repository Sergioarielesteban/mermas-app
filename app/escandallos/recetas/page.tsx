import { redirect } from 'next/navigation';

/** El libro de recetas vive en /escandallos (sección desplegable). */
export default function EscandallosRecetasPage() {
  redirect('/escandallos?libro=1');
}
