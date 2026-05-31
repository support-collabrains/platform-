import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FinanceTransaction, FinanceSubscription } from './finance.entity';
import {
  CreateTransactionDto, UpdateTransactionDto,
  CreateSubscriptionDto, UpdateSubscriptionDto, FinanceSummaryDto,
} from './finance.dto';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(FinanceTransaction)
    private readonly txRepo: Repository<FinanceTransaction>,
    @InjectRepository(FinanceSubscription)
    private readonly subRepo: Repository<FinanceSubscription>,
  ) {}

  async getSummary(owner: string): Promise<FinanceSummaryDto> {
    const txs = await this.txRepo.find({
      where: { owner, status: 'approved' },
    });

    const maandMap = new Map<string, { totaal: number; perCategorie: Record<string, number> }>();
    for (const tx of txs) {
      const maand = tx.datum.slice(0, 7);
      if (!maandMap.has(maand)) maandMap.set(maand, { totaal: 0, perCategorie: {} });
      const entry = maandMap.get(maand)!;
      entry.totaal += Number(tx.bedrag);
      entry.perCategorie[tx.categorie] = (entry.perCategorie[tx.categorie] ?? 0) + Number(tx.bedrag);
    }

    const maandTotalen = Array.from(maandMap.entries())
      .map(([maand, data]) => ({ maand, ...data }))
      .sort((a, b) => a.maand.localeCompare(b.maand))
      .slice(-6);

    const subs = await this.subRepo.find({ where: { owner, actief: true } });
    const abonnementenMaandlast = subs.reduce((sum, s) => {
      const factor = s.interval === 'jaarlijks' ? 1/12 : s.interval === 'kwartaal' ? 1/3 : 1;
      return sum + Number(s.bedrag) * factor;
    }, 0);

    const pendingCount = await this.txRepo.count({ where: { owner, status: 'pending' } });

    return {
      maandTotalen,
      abonnementenMaandlast: Math.round(abonnementenMaandlast * 100) / 100,
      actieveAbonnementen: subs.length,
      pendingCount,
    };
  }

  async getTransactions(owner: string, status?: string, categorie?: string) {
    const where: Record<string, unknown> = { owner };
    if (status) where['status'] = status;
    if (categorie) where['categorie'] = categorie;
    return this.txRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async createTransaction(owner: string, dto: CreateTransactionDto) {
    return this.txRepo.save({ ...dto, owner, source: 'manual', status: 'approved' });
  }

  async updateTransaction(owner: string, id: string, dto: UpdateTransactionDto) {
    const tx = await this.txRepo.findOne({ where: { owner, id } });
    if (!tx) return null;
    if (dto.status === 'approved' && tx.type === 'abonnement') {
      const exists = await this.subRepo.findOne({ where: { owner, transactionId: id } });
      if (!exists) {
        await this.subRepo.save({
          owner,
          transactionId: id,
          naam: dto.leverancier ?? tx.leverancier,
          bedrag: dto.bedrag ?? tx.bedrag,
          interval: 'maandelijks',
          volgendeBetaaldatum: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          opzegtermijnDagen: 30,
          actief: true,
        });
      }
    }
    await this.txRepo.update({ id, owner }, dto);
    return this.txRepo.findOne({ where: { id, owner } });
  }

  async deleteTransaction(owner: string, id: string) {
    return this.txRepo.delete({ id, owner });
  }

  async getSubscriptions(owner: string) {
    return this.subRepo.find({ where: { owner }, order: { volgendeBetaaldatum: 'ASC' } });
  }

  async createSubscription(owner: string, dto: CreateSubscriptionDto) {
    return this.subRepo.save({ ...dto, owner, actief: true });
  }

  async updateSubscription(owner: string, id: string, dto: UpdateSubscriptionDto) {
    await this.subRepo.update({ id, owner }, dto);
    return this.subRepo.findOne({ where: { id, owner } });
  }

  async deleteSubscription(owner: string, id: string) {
    return this.subRepo.delete({ id, owner });
  }
}
