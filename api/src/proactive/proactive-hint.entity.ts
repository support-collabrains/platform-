import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type HintType = 'appointment' | 'deadline' | 'ticket_due';
export type HintSource = 'mail' | 'document' | 'ticket' | 'finance';
export type HintStatus = 'pending' | 'accepted' | 'dismissed';

@Entity('proactive_hints')
export class ProactiveHint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  username: string;

  @Column()
  type: HintType;

  @Column()
  title: string;

  @Column({ type: 'varchar', nullable: true })
  suggestedDate: string | null;

  @Column({ default: 'pending' })
  status: HintStatus;

  @Column()
  source: HintSource;

  @Column({ type: 'varchar', nullable: true })
  sourceRef: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
