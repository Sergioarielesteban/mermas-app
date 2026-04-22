'use client';

import { useParams } from 'next/navigation';
import React from 'react';
import EscandalloRecipeEditorClient from '@/components/escandallos/EscandalloRecipeEditorClient';

export default function EscandalloRecetaEditarPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';

  if (!id) {
    return <p className="text-sm text-zinc-600">Identificador no válido.</p>;
  }

  return <EscandalloRecipeEditorClient recipeId={id} />;
}
