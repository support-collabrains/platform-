import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditEvent } from './audit.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEvent)
    private readonly repo: Repository<AuditEvent>,
  ) {}

  async log(
    actor: string,
    action: string,
    target?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await this.repo.save(
      this.repo.create({ actor, action, target: target ?? null, metadata: metadata ?? null }),
    );
  }

  async getForUser(actor: string, take = 20): Promise<AuditEvent[]> {
    return this.repo.find({
      where: { actor },
      order: { createdAt: 'DESC' },
      take,
    });
  }

  async getAll(take = 100): Promise<AuditEvent[]> {
    return this.repo.find({
      order: { createdAt: 'DESC' },
      take,
    });
  }
}
