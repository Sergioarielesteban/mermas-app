import { redirect } from 'next/navigation';

/** Ruta histórica: el centro de mando vive ahora en /escandallos. */
export default function EscandallosCentroRedirectPage() {
  redirect('/escandallos');
}
