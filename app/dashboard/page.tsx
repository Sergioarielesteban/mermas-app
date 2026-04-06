export default function DashboardPage() {
  return (
    <div className="min-h-full bg-zinc-50">
      <div className="bg-[#D32F2F]">
        <div className="mx-auto w-full max-w-md px-4 py-4">
          <h1 className="text-lg font-semibold text-white">Dashboard</h1>
          <p className="mt-1 text-xs text-white/90">Vista general (pendiente)</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-md px-4 py-6">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-200">
          <p className="text-sm font-semibold text-zinc-900">Próximamente</p>
          <p className="mt-1 text-sm text-zinc-600">
            Aquí verás estadísticas y el historial de registros de mermas.
          </p>
        </div>
      </div>
    </div>
  );
}

