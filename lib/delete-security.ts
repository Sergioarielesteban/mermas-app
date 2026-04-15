const DEFAULT_DELETE_PIN = '1234';

export const DELETE_BLOCKED_MERMAS = 'Por seguridad, no se permite borrar registros de mermas.';
export const DELETE_BLOCKED_PEDIDOS = 'Por seguridad, no se permite borrar registros de pedidos.';
export const DELETE_BLOCKED_INVENTARIO = 'Por seguridad, no se permite borrar registros de inventario.';

export function requestDeleteSecurityPin(): boolean {
  if (typeof window === 'undefined') return true;
  const configured =
    (window.localStorage.getItem('chef_one_delete_pin') ?? '').trim() ||
    process.env.NEXT_PUBLIC_DELETE_SECURITY_PIN ||
    DEFAULT_DELETE_PIN;
  const expected = configured.replace(/\D/g, '').slice(0, 4);
  const pin = window.prompt('Ingresa tu clave de seguridad (4 dígitos):', '');
  if (pin == null) return false;
  return pin.trim() === expected;
}
