export function canAccessPedidos(localCode: string | null | undefined, email?: string | null) {
  void email;
  return (localCode ?? '').toUpperCase() === 'MATARO';
}

