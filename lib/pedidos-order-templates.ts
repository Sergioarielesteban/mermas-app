import type { SupabaseClient } from '@supabase/supabase-js';
import type { Unit } from '@/lib/types';

const DEMO_TEMPLATES_KEY = (localId: string) => `chefone_pedidos_templates:${localId}`;

export type PedidoOrderTemplateListItem = {
  id: string;
  supplierId: string;
  supplierName: string;
  name: string;
  category: string | null;
  localLabel: string | null;
  isFavorite: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  itemCount: number;
};

export type PedidoOrderTemplateDetail = PedidoOrderTemplateListItem & {
  items: Array<{
    supplierProductId: string | null;
    productName: string;
    unit: Unit;
    quantity: number;
  }>;
};

function isMissingTemplatesTableError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('pedido_templates') &&
    (m.includes('does not exist') || m.includes('schema cache') || m.includes('not found'))
  );
}

type DemoStoredTemplate = {
  id: string;
  supplierId: string;
  supplierName: string;
  name: string;
  category: string | null;
  localLabel: string | null;
  isFavorite: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  items: Array<{ supplierProductId: string | null; productName: string; unit: Unit; quantity: number }>;
};

function readDemoTemplates(localId: string): DemoStoredTemplate[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(DEMO_TEMPLATES_KEY(localId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DemoStoredTemplate[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDemoTemplates(localId: string, rows: DemoStoredTemplate[]) {
  try {
    sessionStorage.setItem(DEMO_TEMPLATES_KEY(localId), JSON.stringify(rows));
  } catch {
    /* ignore */
  }
}

export async function fetchPedidoOrderTemplates(
  supabase: SupabaseClient | null,
  localId: string,
  isDemo: boolean,
): Promise<PedidoOrderTemplateListItem[]> {
  if (isDemo) {
    const rows = readDemoTemplates(localId);
    return rows.map((t) => ({
      id: t.id,
      supplierId: t.supplierId,
      supplierName: t.supplierName,
      name: t.name,
      category: t.category,
      localLabel: t.localLabel,
      isFavorite: t.isFavorite,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      itemCount: t.items.length,
    }));
  }

  if (!supabase) return [];

  const { data, error } = await supabase
    .from('pedido_templates')
    .select(
      `
      id,
      supplier_id,
      name,
      category,
      local_label,
      is_favorite,
      created_at,
      last_used_at,
      pedido_suppliers ( name )
    `,
    )
    .eq('local_id', localId)
    .order('last_used_at', { ascending: false, nullsFirst: false });

  if (error) {
    if (isMissingTemplatesTableError(error.message)) return [];
    throw new Error(error.message);
  }

  const ids = (data ?? []).map((r: { id: string }) => r.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: ci, error: e2 } = await supabase
      .from('pedido_template_items')
      .select('template_id')
      .eq('local_id', localId)
      .in('template_id', ids);
    if (!e2 && ci) {
      for (const row of ci as Array<{ template_id: string }>) {
        counts.set(row.template_id, (counts.get(row.template_id) ?? 0) + 1);
      }
    }
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const sup = row.pedido_suppliers as { name?: string } | { name?: string }[] | null;
    const sn = Array.isArray(sup) ? sup[0]?.name : sup?.name;
    return {
      id: String(row.id),
      supplierId: String(row.supplier_id),
      supplierName: sn?.trim() ? String(sn) : 'Proveedor',
      name: String(row.name),
      category: row.category != null ? String(row.category) : null,
      localLabel: row.local_label != null ? String(row.local_label) : null,
      isFavorite: Boolean(row.is_favorite),
      createdAt: String(row.created_at),
      lastUsedAt: row.last_used_at != null ? String(row.last_used_at) : null,
      itemCount: counts.get(String(row.id)) ?? 0,
    };
  });
}

export async function fetchPedidoOrderTemplateDetail(
  supabase: SupabaseClient | null,
  localId: string,
  templateId: string,
  isDemo: boolean,
): Promise<PedidoOrderTemplateDetail | null> {
  if (isDemo) {
    const rows = readDemoTemplates(localId);
    const t = rows.find((r) => r.id === templateId);
    if (!t) return null;
    return {
      id: t.id,
      supplierId: t.supplierId,
      supplierName: t.supplierName,
      name: t.name,
      category: t.category,
      localLabel: t.localLabel,
      isFavorite: t.isFavorite,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      itemCount: t.items.length,
      items: t.items.map((i) => ({
        supplierProductId: i.supplierProductId,
        productName: i.productName,
        unit: i.unit,
        quantity: i.quantity,
      })),
    };
  }

  if (!supabase) return null;

  const { data: head, error: e1 } = await supabase
    .from('pedido_templates')
    .select(
      `
      id,
      supplier_id,
      name,
      category,
      local_label,
      is_favorite,
      created_at,
      last_used_at,
      pedido_suppliers ( name )
    `,
    )
    .eq('local_id', localId)
    .eq('id', templateId)
    .maybeSingle();

  if (e1) {
    if (isMissingTemplatesTableError(e1.message)) return null;
    throw new Error(e1.message);
  }
  if (!head) return null;

  const { data: lines, error: e2 } = await supabase
    .from('pedido_template_items')
    .select('supplier_product_id, product_name, unit, quantity, sort_order')
    .eq('local_id', localId)
    .eq('template_id', templateId)
    .order('sort_order', { ascending: true });

  if (e2) throw new Error(e2.message);

  const sup = (head as Record<string, unknown>).pedido_suppliers as { name?: string } | { name?: string }[] | null;
  const sn = Array.isArray(sup) ? sup[0]?.name : sup?.name;

  const items = (lines ?? []).map((row: Record<string, unknown>) => ({
    supplierProductId: row.supplier_product_id != null ? String(row.supplier_product_id) : null,
    productName: String(row.product_name),
    unit: String(row.unit) as Unit,
    quantity: Number(row.quantity),
  }));

  return {
    id: String((head as Record<string, unknown>).id),
    supplierId: String((head as Record<string, unknown>).supplier_id),
    supplierName: sn?.trim() ? String(sn) : 'Proveedor',
    name: String((head as Record<string, unknown>).name),
    category: (head as Record<string, unknown>).category != null ? String((head as Record<string, unknown>).category) : null,
    localLabel: (head as Record<string, unknown>).local_label != null ? String((head as Record<string, unknown>).local_label) : null,
    isFavorite: Boolean((head as Record<string, unknown>).is_favorite),
    createdAt: String((head as Record<string, unknown>).created_at),
    lastUsedAt: (head as Record<string, unknown>).last_used_at != null ? String((head as Record<string, unknown>).last_used_at) : null,
    itemCount: items.length,
    items,
  };
}

export async function insertPedidoOrderTemplate(
  supabase: SupabaseClient | null,
  localId: string,
  userId: string | null | undefined,
  input: {
    supplierId: string;
    supplierName: string;
    name: string;
    category?: string | null;
    localLabel?: string | null;
    isFavorite: boolean;
    sourceOrderId?: string | null;
    items: Array<{ supplierProductId: string | null; productName: string; unit: Unit; quantity: number }>;
  },
  isDemo: boolean,
): Promise<string> {
  const trimmedItems = input.items.filter(
    (i) => i.quantity > 0 && (i.supplierProductId != null || i.productName.trim() !== ''),
  );
  if (trimmedItems.length === 0) throw new Error('La plantilla no tiene líneas válidas.');

  if (isDemo) {
    const id = `demo-tpl-${Date.now()}`;
    const rows = readDemoTemplates(localId);
    rows.unshift({
      id,
      supplierId: input.supplierId,
      supplierName: input.supplierName,
      name: input.name.trim(),
      category: input.category?.trim() ? input.category.trim() : null,
      localLabel: input.localLabel?.trim() ? input.localLabel.trim() : null,
      isFavorite: input.isFavorite,
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      items: trimmedItems.map((i) => ({
        supplierProductId: i.supplierProductId,
        productName: i.productName.trim(),
        unit: i.unit,
        quantity: Math.round(i.quantity * 10000) / 10000,
      })),
    });
    writeDemoTemplates(localId, rows);
    return id;
  }

  if (!supabase) throw new Error('Sin conexión con Supabase.');

  const { data: ins, error: e1 } = await supabase
    .from('pedido_templates')
    .insert({
      local_id: localId,
      supplier_id: input.supplierId,
      name: input.name.trim(),
      category: input.category?.trim() ? input.category.trim() : null,
      local_label: input.localLabel?.trim() ? input.localLabel.trim() : null,
      is_favorite: input.isFavorite,
      source_order_id: input.sourceOrderId ?? null,
      created_by: userId ?? null,
    })
    .select('id')
    .single();

  if (e1) {
    if (isMissingTemplatesTableError(e1.message)) {
      throw new Error(
        'Faltan las tablas de plantillas en Supabase. Ejecuta supabase-pedidos-order-templates.sql.',
      );
    }
    throw new Error(e1.message);
  }

  const templateId = String((ins as { id: string }).id);

  const rows = trimmedItems.map((i, idx) => ({
    template_id: templateId,
    local_id: localId,
    supplier_product_id: i.supplierProductId,
    product_name: i.productName.trim(),
    unit: i.unit,
    quantity: Math.round(i.quantity * 10000) / 10000,
    sort_order: idx,
  }));

  const { error: e2 } = await supabase.from('pedido_template_items').insert(rows);
  if (e2) throw new Error(e2.message);

  return templateId;
}

export async function touchPedidoOrderTemplateUsed(
  supabase: SupabaseClient | null,
  localId: string,
  templateId: string,
  isDemo: boolean,
): Promise<void> {
  const now = new Date().toISOString();
  if (isDemo) {
    const rows = readDemoTemplates(localId);
    const idx = rows.findIndex((r) => r.id === templateId);
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], lastUsedAt: now };
      writeDemoTemplates(localId, rows);
    }
    return;
  }

  if (!supabase) return;

  const { error } = await supabase
    .from('pedido_templates')
    .update({ last_used_at: now, updated_at: now })
    .eq('local_id', localId)
    .eq('id', templateId);
  if (error && !isMissingTemplatesTableError(error.message)) throw new Error(error.message);
}
