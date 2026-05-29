// Covers: createPending, confirmPending (skip null / assign seq), cancelPending, hasPending,
// listOpen, markDone, getTicketsForUser, listAll, updateTicket, deleteTicket,
// i18n strings (nl/de/en all 8 functions), nextSeq (no prior / with prior)

import { TicketsService } from './tickets.service';
import { SignalTicket } from './ticket.entity';
import { AuditService } from '../audit/audit.service';
import { Repository } from 'typeorm';

function makeRepo(): jest.Mocked<Pick<Repository<SignalTicket>, 'create' | 'save' | 'findOne' | 'find' | 'count' | 'remove' | 'createQueryBuilder'>> {
  return {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    count: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<SignalTicket>>;
}

function makeAudit(): jest.Mocked<AuditService> {
  return { log: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<AuditService>;
}

describe('TicketsService', () => {
  let service: TicketsService;
  let repo: jest.Mocked<Repository<SignalTicket>>;
  let audit: jest.Mocked<AuditService>;

  beforeEach(() => {
    repo = makeRepo();
    audit = makeAudit();
    service = new TicketsService(repo as unknown as Repository<SignalTicket>, audit);
  });

  // ── createPending ──────────────────────────────────────────────────────────

  describe('createPending()', () => {
    it('saves ticket with status pending_confirm', async () => {
      const t = { id: '1', owner: 'alice', phone: '+31', title: 'Fix bug', status: 'pending_confirm' } as SignalTicket;
      repo.create.mockReturnValue(t);
      repo.save.mockResolvedValue(t);
      const result = await service.createPending('alice', '+31', 'Fix bug');
      expect(repo.create).toHaveBeenCalledWith({ owner: 'alice', phone: '+31', title: 'Fix bug', status: 'pending_confirm' });
      expect(result.status).toBe('pending_confirm');
    });
  });

  // ── confirmPending ─────────────────────────────────────────────────────────

  describe('confirmPending()', () => {
    it('returns null when no pending ticket for phone', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.confirmPending('+31')).toBeNull();
    });

    it('assigns next sequential seq number and sets status open', async () => {
      const ticket = { id: 't1', owner: 'alice', phone: '+31', title: 'T', status: 'pending_confirm', seq: 0 } as SignalTicket;
      repo.findOne.mockResolvedValue(ticket);
      const qb = { select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue({ max: 2 }) };
      repo.createQueryBuilder.mockReturnValue(qb as unknown as ReturnType<Repository<SignalTicket>['createQueryBuilder']>);
      const saved = { ...ticket, seq: 3, status: 'open' } as SignalTicket;
      repo.save.mockResolvedValue(saved);
      const result = await service.confirmPending('+31');
      expect(result?.seq).toBe(3);
      expect(result?.status).toBe('open');
      expect(audit.log).toHaveBeenCalledWith('alice', 'ticket.create', 't1', expect.any(Object));
    });

    it('uses seq 1 when no prior tickets exist for owner', async () => {
      const ticket = { id: 't1', owner: 'alice', phone: '+31', title: 'T', status: 'pending_confirm', seq: 0 } as SignalTicket;
      repo.findOne.mockResolvedValue(ticket);
      const qb = { select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getRawOne: jest.fn().mockResolvedValue({ max: null }) };
      repo.createQueryBuilder.mockReturnValue(qb as unknown as ReturnType<Repository<SignalTicket>['createQueryBuilder']>);
      const saved = { ...ticket, seq: 1, status: 'open' } as SignalTicket;
      repo.save.mockResolvedValue(saved);
      const result = await service.confirmPending('+31');
      expect(result?.seq).toBe(1);
    });
  });

  // ── cancelPending ──────────────────────────────────────────────────────────

  describe('cancelPending()', () => {
    it('returns false when no pending ticket exists', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.cancelPending('+31')).toBe(false);
    });

    it('sets status cancelled and logs audit', async () => {
      const ticket = { id: 't1', owner: 'alice', phone: '+31', title: 'T', status: 'pending_confirm' } as SignalTicket;
      repo.findOne.mockResolvedValue(ticket);
      repo.save.mockResolvedValue({ ...ticket, status: 'cancelled' } as SignalTicket);
      expect(await service.cancelPending('+31')).toBe(true);
      expect(audit.log).toHaveBeenCalledWith('alice', 'ticket.cancel', 't1', expect.any(Object));
    });
  });

  // ── hasPending ─────────────────────────────────────────────────────────────

  describe('hasPending()', () => {
    it('returns true when count > 0', async () => {
      repo.count.mockResolvedValue(1);
      expect(await service.hasPending('+31')).toBe(true);
    });

    it('returns false when count is 0', async () => {
      repo.count.mockResolvedValue(0);
      expect(await service.hasPending('+31')).toBe(false);
    });
  });

  // ── listOpen ───────────────────────────────────────────────────────────────

  describe('listOpen()', () => {
    it('queries by owner and status open, orders by seq ASC', async () => {
      repo.find.mockResolvedValue([]);
      await service.listOpen('alice');
      expect(repo.find).toHaveBeenCalledWith({ where: { owner: 'alice', status: 'open' }, order: { seq: 'ASC' } });
    });
  });

  // ── markDone ───────────────────────────────────────────────────────────────

  describe('markDone()', () => {
    it('returns null when ticket not found', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.markDone('alice', 1)).toBeNull();
    });

    it('sets status done and logs audit', async () => {
      const ticket = { id: 't1', owner: 'alice', seq: 1, title: 'T', status: 'open' } as SignalTicket;
      repo.findOne.mockResolvedValue(ticket);
      const saved = { ...ticket, status: 'done' } as SignalTicket;
      repo.save.mockResolvedValue(saved);
      const result = await service.markDone('alice', 1);
      expect(result?.status).toBe('done');
      expect(audit.log).toHaveBeenCalledWith('alice', 'ticket.done', 't1', expect.any(Object));
    });
  });

  // ── getTicketsForUser ──────────────────────────────────────────────────────

  describe('getTicketsForUser()', () => {
    it('returns open tickets ordered by seq ASC', async () => {
      repo.find.mockResolvedValue([]);
      await service.getTicketsForUser('alice');
      expect(repo.find).toHaveBeenCalledWith({ where: { owner: 'alice', status: 'open' }, order: { seq: 'ASC' } });
    });
  });

  // ── listAll ────────────────────────────────────────────────────────────────

  describe('listAll()', () => {
    it('returns open and pending_confirm tickets', async () => {
      repo.find.mockResolvedValue([]);
      await service.listAll();
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: [{ status: 'open' }, { status: 'pending_confirm' }] }),
      );
    });
  });

  // ── updateTicket ───────────────────────────────────────────────────────────

  describe('updateTicket()', () => {
    it('returns false when ticket not found', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.updateTicket('t1', 'alice', 'done')).toBe(false);
    });

    it('updates status and returns true', async () => {
      const ticket = { id: 't1', owner: 'alice', status: 'open' } as SignalTicket;
      repo.findOne.mockResolvedValue(ticket);
      repo.save.mockResolvedValue({ ...ticket, status: 'done' } as SignalTicket);
      expect(await service.updateTicket('t1', 'alice', 'done')).toBe(true);
    });
  });

  // ── deleteTicket ───────────────────────────────────────────────────────────

  describe('deleteTicket()', () => {
    it('returns false when ticket not found', async () => {
      repo.findOne.mockResolvedValue(null);
      expect(await service.deleteTicket('t1', 'alice')).toBe(false);
    });

    it('removes ticket and returns true', async () => {
      const ticket = { id: 't1', owner: 'alice' } as SignalTicket;
      repo.findOne.mockResolvedValue(ticket);
      repo.remove.mockResolvedValue(ticket);
      expect(await service.deleteTicket('t1', 'alice')).toBe(true);
      expect(repo.remove).toHaveBeenCalledWith(ticket);
    });
  });

  // ── i18n ───────────────────────────────────────────────────────────────────

  describe('i18n()', () => {
    it('nl: created() contains /taak and ✅', () => {
      const msg = service.i18n('nl').created('Do something');
      expect(msg.toLowerCase()).toContain('taak');
      expect(msg).toContain('✅');
    });

    it('de: created() contains Aufgabe and ✅', () => {
      const msg = service.i18n('de').created('Do something');
      expect(msg.toLowerCase()).toContain('aufgabe');
      expect(msg).toContain('✅');
    });

    it('en: created() contains task and ✅', () => {
      const msg = service.i18n('en').created('Do something');
      expect(msg.toLowerCase()).toContain('task');
      expect(msg).toContain('✅');
    });

    it('each language exposes all 8 message functions', () => {
      const keys = ['created', 'confirmed', 'cancelled', 'noPending', 'listHeader', 'listEmpty', 'listItem', 'markedDone', 'notFound'];
      for (const lang of ['nl', 'de', 'en'] as const) {
        const t = service.i18n(lang);
        for (const key of keys) {
          expect(typeof (t as Record<string, unknown>)[key]).toBe('function');
        }
      }
    });
  });
});
