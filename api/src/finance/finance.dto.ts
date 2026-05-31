import { FinanceCategorie, FinanceInterval, FinanceSource, FinanceStatus, FinanceType } from './finance.entity';

export interface CreateTransactionDto {
  leverancier: string;
  bedrag: number;
  datum: string;
  categorie: FinanceCategorie;
  type: FinanceType;
  notes?: string;
}

export interface UpdateTransactionDto {
  leverancier?: string;
  bedrag?: number;
  datum?: string;
  categorie?: FinanceCategorie;
  status?: FinanceStatus;
  notes?: string;
}

export interface CreateSubscriptionDto {
  naam: string;
  bedrag: number;
  interval: FinanceInterval;
  volgendeBetaaldatum: string;
  opzegtermijnDagen?: number;
  transactionId?: string;
}

export interface UpdateSubscriptionDto {
  naam?: string;
  bedrag?: number;
  interval?: FinanceInterval;
  volgendeBetaaldatum?: string;
  opzegtermijnDagen?: number;
  actief?: boolean;
}

export interface FinanceSummaryDto {
  maandTotalen: Array<{ maand: string; totaal: number; perCategorie: Record<string, number> }>;
  abonnementenMaandlast: number;
  actieveAbonnementen: number;
  pendingCount: number;
}

export interface ExtractedTransaction {
  leverancier: string;
  bedrag: number;
  datum: string;
  categorie: FinanceCategorie;
  type: FinanceType;
  interval?: FinanceInterval;
  opzegtermijn_dagen?: number;
  confidence: number;
}
