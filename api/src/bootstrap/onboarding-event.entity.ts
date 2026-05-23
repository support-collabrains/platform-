import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BootstrapState } from '../common/bootstrap-state.enum';

@Entity('onboarding_events')
export class OnboardingEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 64 })
  state: BootstrapState;

  @Column({ type: 'varchar', length: 64 })
  step: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
