import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('doc_documents')
export class DocDocument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  paperlessId: number;

  @Column()
  owner: string;

  @Column()
  title: string;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('doc_notifications')
export class DocNotification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  documentId: string;

  @Column()
  phone: string;

  @Column({ nullable: true, type: 'varchar' })
  sentTimestamp: string | null;

  @Column({ default: 'pending' })
  status: string;

  @CreateDateColumn()
  createdAt: Date;
}

@Entity('doc_summaries')
export class DocSummary {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  documentId: string;

  @Column('text')
  content: string;

  @Column({ default: 'mistral' })
  modelUsed: string;

  @CreateDateColumn()
  generatedAt: Date;
}
