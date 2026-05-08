import type { Unit } from '@/lib/types';

export type SupplierProduct = {
  id: string;
  name: string;
  unit: Unit;
  pricePerUnit: number;
};

export type SupplierCatalog = {
  id: string;
  name: string;
  contact: string;
  products: SupplierProduct[];
};

export const MOCK_SUPPLIERS: SupplierCatalog[] = [
  {
    id: 'prov-frio-mar',
    name: 'FrioMar Distribuciones',
    contact: 'comercial@friomar.test',
    products: [
      { id: 'fm-1', name: 'Langostino Cocido', unit: 'kg', pricePerUnit: 12.4 },
      { id: 'fm-2', name: 'Calamar Troceado', unit: 'kg', pricePerUnit: 8.95 },
      { id: 'fm-3', name: 'Mejillon Cocido', unit: 'kg', pricePerUnit: 5.8 },
    ],
  },
  {
    id: 'prov-panifico',
    name: 'Panifico Horeca',
    contact: 'pedidos@panifico.test',
    products: [
      { id: 'ph-1', name: 'Pan Brioche Burger', unit: 'ud', pricePerUnit: 0.29 },
      { id: 'ph-2', name: 'Baguette Rustica', unit: 'ud', pricePerUnit: 0.58 },
      { id: 'ph-3', name: 'Mollete Andaluz', unit: 'ud', pricePerUnit: 0.43 },
    ],
  },
  {
    id: 'prov-snackmax',
    name: 'SnackMax Cash',
    contact: 'compras@snackmax.test',
    products: [
      { id: 'sm-1', name: 'Nachos Bolsa 500g', unit: 'bolsa', pricePerUnit: 2.3 },
      { id: 'sm-2', name: 'Salsa Cheddar', unit: 'bolsa', pricePerUnit: 1.95 },
      { id: 'sm-3', name: 'Jalapenos Laminados', unit: 'ud', pricePerUnit: 3.15 },
    ],
  },
];

