import {
  Column, CreateDateColumn, Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type FinanceSource = 'paperless' | 'mail' | 'manual';
export type FinanceStatus = 'pending' | 'approved' | 'rejected';
export type FinanceType = 'eenmalig' | 'abonnement';
export type FinanceInterval = 'maandelijks' | 'kwartaal' | 'jaarlijks';
export type FinanceCategorie =
  | 'Wonen' | 'Boodschappen' | 'Abonnementen'
  | 'Verzekeringen' | 'Transport' | 'Gezondheid' | 'Overig';

export const FINANCE_CATEGORIEEN: FinanceCategorie[] = [
  'Wonen', 'Boodschappen', 'Abonnementen',
  'Verzekeringen', 'Transport', 'Gezondheid', 'Overig',
];

@Entity('finance_transactions')
export class FinanceTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  owner: string;

  @Column({ type: 'varchar', length: 20 })
  source: FinanceSource;

  @Column({ nullable: true })
  sourceRef: string;

  @Column()
  leverancier: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  bedrag: number;

  @Column({ type: 'date' })
  datum: string;

  @Column({ type: 'varchar', length: 30 })
  categorie: FinanceCategorie;

  @Column({ type: 'varchar', length: 20 })
  type: FinanceType;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: FinanceStatus;

  @Column({ nullable: true })
  notes: string;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('finance_subscriptions')
export class FinanceSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  owner: string;

  @Column({ nullable: true })
  transactionId: string;

  @Column()
  naam: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  bedrag: number;

  @Column({ type: 'varchar', length: 20 })
  interval: FinanceInterval;

  @Column({ type: 'date' })
  volgendeBetaaldatum: string;

  @Column({ default: 30 })
  opzegtermijnDagen: number;

  @Column({ default: true })
  actief: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
