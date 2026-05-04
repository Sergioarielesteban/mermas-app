import { redirect } from 'next/navigation';

/** La entrada al módulo de aceite va directamente al registro. */
export default function AppccAceitePage() {
  redirect('/appcc/aceite/registro');
}
