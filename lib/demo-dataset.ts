import { DEMO_LOCAL_ID } from '@/lib/demo-mode';
import type {
  EscandalloLine,
  EscandalloProcessedProduct,
  EscandalloRawProduct,
  EscandalloRecipe,
} from '@/lib/escandallos-supabase';
import type { PedidoOrder, PedidoSupplier, PedidoStatus } from '@/lib/pedidos-supabase';
import type { MermaMotiveKey, MermaRecord, Product, Unit } from '@/lib/types';
import type { RentabilidadRecipeAnalisis } from '@/lib/finanzas-rentabilidad-escandallo';

const iso = (d: string) => `${d}T10:00:00.000Z`;

export function getDemoPedidoOrders(): PedidoOrder[] {
  const sid = 'demo-supplier-1';
  return [
    {
      id: 'demo-order-1',
      supplierId: sid,
      supplierName: 'Cárnicas del Vallès',
      status: 'received' as PedidoStatus,
      notes: 'Pedido demo semanal',
      createdAt: iso('2026-04-10'),
      sentAt: iso('2026-04-11'),
      receivedAt: iso('2026-04-12'),
      deliveryDate: '2026-04-12',
      items: [
        {
          id: 'demo-oi-1',
          supplierProductId: 'demo-sp-1',
          productName: 'PECHUGA POLLO',
          unit: 'kg',
          quantity: 12,
          receivedQuantity: 12,
          pricePerUnit: 6.45,
          vatRate: 0.1,
          lineTotal: Math.round(12 * 6.45 * 100) / 100,
        },
        {
          id: 'demo-oi-2',
          supplierProductId: 'demo-sp-2',
          productName: 'BACON LONCHAS',
          unit: 'ud',
          quantity: 8,
          receivedQuantity: 8,
          pricePerUnit: 8.95,
          vatRate: 0.1,
          lineTotal: Math.round(8 * 8.95 * 100) / 100,
        },
      ],
      total: 0,
    },
    {
      id: 'demo-order-2',
      supplierId: 'demo-supplier-2',
      supplierName: 'Frutas García',
      status: 'sent' as PedidoStatus,
      notes: '',
      createdAt: iso('2026-04-14'),
      sentAt: iso('2026-04-14'),
      items: [
        {
          id: 'demo-oi-3',
          supplierProductId: 'demo-sp-3',
          productName: 'TOMATE PERA',
          unit: 'kg',
          quantity: 25,
          receivedQuantity: 0,
          pricePerUnit: 1.85,
          vatRate: 0.1,
          lineTotal: Math.round(25 * 1.85 * 100) / 100,
        },
      ],
      total: 0,
    },
  ].map((o) => ({
    ...o,
    total: Math.round(o.items.reduce((s, i) => s + i.lineTotal, 0) * 100) / 100,
  })) as PedidoOrder[];
}

/** Catálogo demo para la pantalla «Nuevo pedido» (sin Supabase). */
export function getDemoPedidoSuppliers(): PedidoSupplier[] {
  return [
    {
      id: 'demo-supplier-1',
      name: 'Cárnicas del Vallès',
      contact: '+34600000001',
      deliveryCycleWeekdays: [1, 3, 5],
      deliveryExceptionDates: [],
      products: [
        {
          id: 'demo-sp-1',
          name: 'PECHUGA POLLO',
          unit: 'kg',
          pricePerUnit: 6.45,
          unitsPerPack: 1,
          recipeUnit: null,
          vatRate: 0.1,
          parStock: 20,
          isActive: true,
        },
        {
          id: 'demo-sp-2',
          name: 'BACON LONCHAS',
          unit: 'ud',
          pricePerUnit: 8.95,
          unitsPerPack: 1,
          recipeUnit: null,
          vatRate: 0.1,
          parStock: 10,
          isActive: true,
        },
      ],
    },
    {
      id: 'demo-supplier-2',
      name: 'Frutas García',
      contact: '+34600000002',
      deliveryCycleWeekdays: [2, 4, 6],
      deliveryExceptionDates: [],
      products: [
        {
          id: 'demo-sp-3',
          name: 'TOMATE PERA',
          unit: 'kg',
          pricePerUnit: 1.85,
          unitsPerPack: 1,
          recipeUnit: null,
          vatRate: 0.1,
          parStock: 30,
          isActive: true,
        },
      ],
    },
  ];
}

export function getDemoMermasStore(): { products: Product[]; mermas: MermaRecord[] } {
  const products: Product[] = [
    {
      id: 'demo-p-1',
      name: 'Hamburguesa smash',
      unit: 'racion' as Unit,
      pricePerUnit: 2.85,
      createdAt: iso('2026-01-01'),
    },
    {
      id: 'demo-p-2',
      name: 'Patatas bravas',
      unit: 'racion' as Unit,
      pricePerUnit: 0.95,
      createdAt: iso('2026-01-01'),
    },
    {
      id: 'demo-p-3',
      name: 'Tarta queso',
      unit: 'ud' as Unit,
      pricePerUnit: 3.2,
      createdAt: iso('2026-01-01'),
    },
  ];
  const mermas: MermaRecord[] = [
    {
      id: 'demo-m-1',
      productId: 'demo-p-1',
      quantity: 4,
      motiveKey: 'se-quemo' as MermaMotiveKey,
      notes: 'Plancha demasiado alta — demo',
      occurredAt: iso('2026-04-12'),
      costEur: 11.4,
      createdAt: iso('2026-04-12'),
    },
    {
      id: 'demo-m-2',
      productId: 'demo-p-2',
      quantity: 6,
      motiveKey: 'error-cocina' as MermaMotiveKey,
      notes: 'Doble salida por error de comanda',
      occurredAt: iso('2026-04-13'),
      costEur: 5.7,
      createdAt: iso('2026-04-13'),
    },
    {
      id: 'demo-m-3',
      productId: 'demo-p-3',
      quantity: 2,
      motiveKey: 'mal-estado' as MermaMotiveKey,
      notes: 'Cliente devolvió por textura',
      occurredAt: iso('2026-04-11'),
      costEur: 6.4,
      createdAt: iso('2026-04-11'),
    },
  ];
  return { products, mermas };
}

export type DemoEscandalloPack = {
  recipes: EscandalloRecipe[];
  linesByRecipe: Record<string, EscandalloLine[]>;
  rawProducts: EscandalloRawProduct[];
  processed: EscandalloProcessedProduct[];
};

export function getDemoEscandalloPack(): DemoEscandalloPack {
  const rid1 = 'demo-recipe-1';
  const rid2 = 'demo-recipe-2';
  const rawProducts: EscandalloRawProduct[] = [
    {
      id: 'demo-sp-1',
      supplierId: 'demo-supplier-1',
      supplierName: 'Cárnicas del Vallès',
      name: 'Carne smash 90g',
      unit: 'ud',
      pricePerUnit: 0.78,
      unitsPerPack: 1,
      recipeUnit: null,
    },
    {
      id: 'demo-sp-bun',
      supplierId: 'demo-supplier-1',
      supplierName: 'Cárnicas del Vallès',
      name: 'Pan brioche burger',
      unit: 'ud',
      pricePerUnit: 0.56,
      unitsPerPack: 1,
      recipeUnit: null,
    },
    {
      id: 'demo-sp-3',
      supplierId: 'demo-supplier-2',
      supplierName: 'Frutas García',
      name: 'Tomate pera',
      unit: 'kg',
      pricePerUnit: 1.85,
      unitsPerPack: 1,
      recipeUnit: null,
    },
  ];
  const recipes: EscandalloRecipe[] = [
    {
      id: rid1,
      localId: DEMO_LOCAL_ID,
      name: 'Smash burger clásica',
      notes: '',
      yieldQty: 1,
      yieldLabel: 'ración',
      isSubRecipe: false,
      saleVatRatePct: 10,
      salePriceGrossEur: 12.9,
      posArticleCode: 'D042',
      createdAt: iso('2026-01-15'),
      updatedAt: iso('2026-04-01'),
    },
    {
      id: rid2,
      localId: DEMO_LOCAL_ID,
      name: 'Ensalada tomate burrata',
      notes: '',
      yieldQty: 1,
      yieldLabel: 'ración',
      isSubRecipe: false,
      saleVatRatePct: 10,
      salePriceGrossEur: 11.5,
      posArticleCode: 'D018',
      createdAt: iso('2026-02-01'),
      updatedAt: iso('2026-04-01'),
    },
  ];
  const linesByRecipe: Record<string, EscandalloLine[]> = {
    [rid1]: [
      {
        id: 'demo-ln-1',
        localId: DEMO_LOCAL_ID,
        recipeId: rid1,
        sourceType: 'raw',
        rawSupplierProductId: 'demo-sp-1',
        processedProductId: null,
        subRecipeId: null,
        label: 'Carne smash',
        qty: 2,
        unit: 'ud',
        manualPricePerUnit: null,
        sortOrder: 0,
        createdAt: iso('2026-01-15'),
      },
      {
        id: 'demo-ln-2',
        localId: DEMO_LOCAL_ID,
        recipeId: rid1,
        sourceType: 'raw',
        rawSupplierProductId: 'demo-sp-bun',
        processedProductId: null,
        subRecipeId: null,
        label: 'Pan',
        qty: 1,
        unit: 'ud',
        manualPricePerUnit: null,
        sortOrder: 1,
        createdAt: iso('2026-01-15'),
      },
    ],
    [rid2]: [
      {
        id: 'demo-ln-3',
        localId: DEMO_LOCAL_ID,
        recipeId: rid2,
        sourceType: 'raw',
        rawSupplierProductId: 'demo-sp-3',
        processedProductId: null,
        subRecipeId: null,
        label: 'Tomate',
        qty: 0.12,
        unit: 'kg',
        manualPricePerUnit: null,
        sortOrder: 0,
        createdAt: iso('2026-02-01'),
      },
    ],
  };
  return { recipes, linesByRecipe, rawProducts, processed: [] };
}

/** Filas estáticas para la vista Rentabilidad en demo (sin recalcular motor). */
export function getDemoRentabilidadRows(): RentabilidadRecipeAnalisis[] {
  return [
    {
      recipeId: 'demo-recipe-1',
      name: 'Smash burger clásica',
      posArticleCode: 'D042',
      categoria: 'Platos',
      isSubRecipe: false,
      yieldQty: 1,
      yieldLabel: 'ración',
      saleGrossEur: 12.9,
      saleNetEur: 11.73,
      costTheoreticalTotalEur: 2.12,
      costTheoreticalPerYieldEur: 2.12,
      costRealTotalEur: 2.38,
      costRealPerYieldEur: 2.38,
      costDeviationEurPerYield: 0.26,
      costDeviationPct: 12.3,
      marginTheoreticalGrossEur: 9.61,
      marginRealGrossEur: 9.35,
      marginTheoreticalPct: 81.9,
      marginRealPct: 79.7,
      foodCostPctTheoretical: 18.1,
      foodCostPctReal: 20.3,
      lineCount: 2,
    },
    {
      recipeId: 'demo-recipe-2',
      name: 'Ensalada tomate burrata',
      posArticleCode: 'D018',
      categoria: 'Ensaladas',
      isSubRecipe: false,
      yieldQty: 1,
      yieldLabel: 'ración',
      saleGrossEur: 11.5,
      saleNetEur: 10.45,
      costTheoreticalTotalEur: 0.22,
      costTheoreticalPerYieldEur: 0.22,
      costRealTotalEur: 0.26,
      costRealPerYieldEur: 0.26,
      costDeviationEurPerYield: 0.04,
      costDeviationPct: 18.2,
      marginTheoreticalGrossEur: 10.23,
      marginRealGrossEur: 10.19,
      marginTheoreticalPct: 97.9,
      marginRealPct: 97.5,
      foodCostPctTheoretical: 2.1,
      foodCostPctReal: 2.5,
      lineCount: 1,
    },
  ];
}
