import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('push_subscriptions')
@Index(['username'])
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  username: string;

  @Column({ unique: true })
  endpoint: string;

  @Column({ type: 'jsonb' })
  keys: { p256dh: string; auth: string };

  @CreateDateColumn()
  createdAt: Date;
}
