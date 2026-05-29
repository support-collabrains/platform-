// Covers: AuditService.log (defaults for target/metadata), getForUser (ordered DESC, take param), getAll (ordered DESC, take param)

import { AuditService } from './audit.service';
import { AuditEvent } from './audit.entity';
import { Repository } from 'typeorm';

function makeRepo(): jest.Mocked<Repository<AuditEvent>> {
  const created = {} as AuditEvent;
  return {
    create: jest.fn().mockReturnValue(created),
    save: jest.fn().mockResolvedValue(created),
    find: jest.fn().mockResolvedValue([]),
  } as unknown as jest.Mocked<Repository<AuditEvent>>;
}

describe('AuditService', () => {
  let service: AuditService;
  let repo: jest.Mocked<Repository<AuditEvent>>;

  beforeEach(() => {
    repo = makeRepo();
    service = new AuditService(repo);
  });

  describe('log()', () => {
    it('creates and saves an event with actor, action, target, metadata', async () => {
      await service.log('alice', 'user.create', 'bob', { role: 'admin' });
      expect(repo.create).toHaveBeenCalledWith({
        actor: 'alice',
        action: 'user.create',
        target: 'bob',
        metadata: { role: 'admin' },
      });
      expect(repo.save).toHaveBeenCalled();
    });

    it('defaults target to null when not provided', async () => {
      await service.log('alice', 'login');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ target: null }),
      );
    });

    it('defaults metadata to null when not provided', async () => {
      await service.log('alice', 'login');
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: null }),
      );
    });
  });

  describe('getForUser()', () => {
    it('queries by actor, orders DESC, limits to 20 by default', async () => {
      await service.getForUser('alice');
      expect(repo.find).toHaveBeenCalledWith({
        where: { actor: 'alice' },
        order: { createdAt: 'DESC' },
        take: 20,
      });
    });

    it('respects custom take value', async () => {
      await service.getForUser('alice', 5);
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });
  });

  describe('getAll()', () => {
    it('orders DESC, limits to 100 by default', async () => {
      await service.getAll();
      expect(repo.find).toHaveBeenCalledWith({
        order: { createdAt: 'DESC' },
        take: 100,
      });
    });

    it('respects custom take value', async () => {
      await service.getAll(50);
      expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });
  });
});
