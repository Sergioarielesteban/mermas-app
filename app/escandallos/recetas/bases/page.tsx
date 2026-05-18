import { redirect } from 'next/navigation';

/** Bases y elaboraciones: sección en /escandallos. */
export default function EscandallosBasesRedirectPage() {
  redirect('/escandallos?bases=1');
}
