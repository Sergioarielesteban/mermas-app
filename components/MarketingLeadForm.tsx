'use client';

import React, { useState } from 'react';

const CONTACT_FALLBACK = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ?? '';

export default function MarketingLeadForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [message, setMessage] = useState('');
  const [hp, setHp] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setErrMsg(null);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phone,
          restaurant_name: restaurantName,
          message,
          _hp: hp,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; code?: string };
      if (res.ok && data.ok) {
        setStatus('ok');
        setName('');
        setEmail('');
        setPhone('');
        setRestaurantName('');
        setMessage('');
        return;
      }
      if (data.code === 'not_configured') {
        setStatus('err');
        setErrMsg(
          CONTACT_FALLBACK
            ? `Por ahora escríbenos a ${CONTACT_FALLBACK} y te respondemos enseguida.`
            : (data.error ?? 'Formulario no disponible.'),
        );
        return;
      }
      setStatus('err');
      setErrMsg(data.error ?? 'No se pudo enviar.');
    } catch {
      setStatus('err');
      setErrMsg('Error de red. Revisa la conexión e inténtalo otra vez.');
    }
  };

  if (status === 'ok') {
    return (
      <div
        className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-5 py-6 text-center shadow-sm"
        role="status"
      >
        <p className="text-base font-bold text-emerald-900">¡Gracias!</p>
        <p className="mt-2 text-sm leading-relaxed text-emerald-800">
          Hemos recibido tus datos. Te contactamos pronto para contarte cómo encaja Chef-One en tu cocina.
        </p>
        <button
          type="button"
          className="mt-4 text-sm font-semibold text-emerald-800 underline decoration-emerald-400 underline-offset-2"
          onClick={() => setStatus('idle')}
        >
          Enviar otra solicitud
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <input
        type="text"
        name="_hp"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-left">
          <span className="text-xs font-semibold text-stone-600">Nombre</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none ring-[#D32F2F]/20 focus:border-[#D32F2F] focus:ring-2"
            placeholder="Tu nombre"
            autoComplete="name"
          />
        </label>
        <label className="block text-left">
          <span className="text-xs font-semibold text-stone-600">
            Email <span className="text-red-600">*</span>
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none ring-[#D32F2F]/20 focus:border-[#D32F2F] focus:ring-2"
            placeholder="tu@restaurante.com"
            autoComplete="email"
          />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-left">
          <span className="text-xs font-semibold text-stone-600">Teléfono</span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none ring-[#D32F2F]/20 focus:border-[#D32F2F] focus:ring-2"
            placeholder="Opcional"
            autoComplete="tel"
          />
        </label>
        <label className="block text-left">
          <span className="text-xs font-semibold text-stone-600">Restaurante / local</span>
          <input
            type="text"
            value={restaurantName}
            onChange={(e) => setRestaurantName(e.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-stone-200 bg-white px-3 text-sm text-stone-900 outline-none ring-[#D32F2F]/20 focus:border-[#D32F2F] focus:ring-2"
            placeholder="Nombre del negocio"
            autoComplete="organization"
          />
        </label>
      </div>
      <label className="block text-left">
        <span className="text-xs font-semibold text-stone-600">¿Qué te gustaría mejorar en cocina?</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="mt-1.5 w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none ring-[#D32F2F]/20 focus:border-[#D32F2F] focus:ring-2"
          placeholder="Pedidos, mermas, APPCC, inventario…"
        />
      </label>
      {errMsg ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-200">{errMsg}</p>
      ) : null}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="h-12 w-full rounded-2xl text-sm font-bold text-white shadow-md transition hover:brightness-105 disabled:opacity-50"
        style={{ backgroundColor: '#D32F2F' }}
      >
        {status === 'sending' ? 'Enviando…' : 'Quiero información'}
      </button>
      <p className="text-center text-[11px] text-stone-500">
        Al enviar aceptas que te contactemos con información sobre Chef-One. No compartimos tus datos con terceros.
      </p>
    </form>
  );
}
