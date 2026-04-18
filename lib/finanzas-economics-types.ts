export type StaffCostPeriodType = 'daily' | 'weekly' | 'monthly';

export type FixedExpenseCategory =
  | 'rent'
  | 'utilities'
  | 'insurance'
  | 'software'
  | 'banking_fees'
  | 'equipment_lease'
  | 'marketing'
  | 'other';

export type FixedExpenseFrequency = 'monthly' | 'quarterly' | 'yearly' | 'one_off';

export type TaxEntryType = 'iva_repercutido' | 'iva_soportado' | 'impuesto_sociedades' | 'otro';

export type SalesDaily = {
  id: string;
  localId: string;
  date: string;
  netSalesEur: number | null;
  taxCollectedEur: number | null;
  ticketsCount: number | null;
  avgTicketEur: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type SalesDailyInsert = {
  localId: string;
  date: string;
  netSalesEur?: number | null;
  taxCollectedEur?: number | null;
  ticketsCount?: number | null;
  notes?: string;
};

export type SalesDailyUpdate = Partial<
  Omit<SalesDailyInsert, 'localId'> & { date?: string }
>;

export type StaffCostsPeriod = {
  id: string;
  localId: string;
  periodType: StaffCostPeriodType;
  periodStart: string;
  periodEnd: string;
  laborHours: number | null;
  laborCostEur: number | null;
  ssCostEur: number | null;
  otherStaffCostEur: number | null;
  totalStaffCostEur: number | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type StaffCostsPeriodInsert = {
  localId: string;
  periodType: StaffCostPeriodType;
  periodStart: string;
  periodEnd: string;
  laborHours?: number | null;
  laborCostEur?: number | null;
  ssCostEur?: number | null;
  otherStaffCostEur?: number | null;
  notes?: string;
};

export type StaffCostsPeriodUpdate = Partial<
  Omit<StaffCostsPeriodInsert, 'localId'> & { periodType?: StaffCostPeriodType }
>;

export type FixedExpense = {
  id: string;
  localId: string;
  name: string;
  category: FixedExpenseCategory;
  amountEur: number;
  frequency: FixedExpenseFrequency;
  active: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type FixedExpenseInsert = {
  localId: string;
  name: string;
  category: FixedExpenseCategory;
  amountEur: number;
  frequency: FixedExpenseFrequency;
  active?: boolean;
  periodStart?: string | null;
  periodEnd?: string | null;
  notes?: string;
};

export type FixedExpenseUpdate = Partial<Omit<FixedExpenseInsert, 'localId'>>;

export type TaxEntry = {
  id: string;
  localId: string;
  date: string;
  taxType: TaxEntryType;
  amountEur: number;
  notes: string;
  createdAt: string;
};

export type TaxEntryInsert = {
  localId: string;
  date: string;
  taxType: TaxEntryType;
  amountEur: number;
  notes?: string;
};

export type TaxEntryUpdate = Partial<Omit<TaxEntryInsert, 'localId'>>;
