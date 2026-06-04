export type UserRole = 'admin' | 'collaborator';
export type MonthStatus = 'open' | 'planning' | 'closed';
export type PaymentType = 'credit_card' | 'debit';
export type IncomeCategory = 'Sueldo' | 'Freelance' | 'Bono' | 'Otros';

export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
}

export interface Household {
  id: string;
  name: string;
  created_by: string | null;
  invite_code: string;
  billing_cycle_start_day: number;
  holder_1_name: string;
  holder_2_name: string;
  account_1_name: string;
  account_2_name: string;
  account_joint_name: string;
  holders?: string[];
  accounts?: any[];
  created_at: string;
}

export interface HouseholdMember {
  household_id: string;
  user_id: string;
  role: UserRole;
  joined_at: string;
  profiles?: Profile;
}

export interface ExpenseCategory {
  id: string;
  household_id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  budget_limit: number | null;
  created_at: string;
}

export interface Month {
  id: string;
  household_id: string;
  year: number;
  month: number;
  status: MonthStatus;
  created_at: string;
}

export interface Income {
  id: string;
  month_id: string;
  description: string;
  amount: number;
  date: string;
  account: string;
  category: IncomeCategory | null;
  is_estimated: boolean;
  is_recurring?: boolean;
  created_by: string | null;
  created_at: string;
  profiles?: Profile;
}

export interface Expense {
  id: string;
  month_id: string;
  description: string;
  amount: number;
  date: string;
  account: string;
  holder: string;
  category_id: string;
  is_planned: boolean;
  notes: string | null;
  is_recurring?: boolean;
  created_by: string | null;
  installment_id?: string | null;
  installment_number?: number | null;
  adjustment_note?: string | null;
  created_at: string;
  expense_categories?: ExpenseCategory;
  profiles?: Profile;
  is_reconciled?: boolean;
  has_explicit_debited?: boolean;
  has_explicit_pending?: boolean;
}

export interface Installment {
  id: string;
  household_id: string;
  description: string;
  total_amount: number;
  num_installments: number;
  amount_per_installment: number;
  payment_type: PaymentType;
  account: string;
  first_debit_day?: number;
  first_debit_month: number;
  first_debit_year: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface UnplannedExpense {
  id: string;
  household_id: string;
  month_id: string;
  description: string;
  amount: number;
  date: string;
  account: string;
  holder: string;
  category: string | null;
  created_by: string | null;
  created_at: string;
  profiles?: Profile;
}

export interface SavingsConfig {
  household_id: string;
  initial_balance: number;
  updated_at: string;
}

// Tipo compuesto para la visualización del resumen mensual
export interface MonthlySummary {
  month: Month;
  incomes: Income[];
  expenses: Expense[];
  unplannedExpenses: UnplannedExpense[];
  projectedInstallments: Array<{
    installment: Installment;
    installmentNumber: number;
    amount: number;
    isOverridden: boolean;
    actualExpense?: Expense;
  }>;
}
