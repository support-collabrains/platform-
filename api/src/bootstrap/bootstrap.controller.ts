import {
  Body,
  Controller,
  Get,
  Post,
  Sse,
  MessageEvent,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Observable, Subject } from 'rxjs';

import { BootstrapService } from './bootstrap.service';
import type { BootstrapEvent } from './bootstrap.service';
import { StartBootstrapDto } from './dto/start-bootstrap.dto';
import { BootstrapState } from '../common/bootstrap-state.enum';

@Controller('bootstrap')
export class BootstrapController {
  private readonly sseSubject = new Subject<MessageEvent>();

  constructor(private readonly bootstrapService: BootstrapService) {}

  @Get('state')
  getState() {
    return {
      state: this.bootstrapService.getState(),
      isReady: this.bootstrapService.isReady(),
      log: this.bootstrapService.getEventLog(),
      config: this.bootstrapService.getConfig(),
    };
  }

  @Post('start')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async startBootstrap(@Body() dto: StartBootstrapDto) {
    if (this.bootstrapService.getState() !== BootstrapState.UNINITIALIZED) {
      throw new BadRequestException(`Bootstrap already in state: ${this.bootstrapService.getState()}`);
    }

    // Fire-and-forget — progress streamed via SSE
    await this.bootstrapService.startBootstrap(dto);

    return { message: 'Bootstrap started. Connect to /bootstrap/events for live progress.' };
  }

  @Post('verify-dns')
  async verifyDns(@Body() body: { primaryDomain: string; mailDomain: string }) {
    try {
      await this.bootstrapService.verifyDNS(body.primaryDomain, body.mailDomain);
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  @Post('verify-ports')
  async verifyPorts(@Body() body: { hostname: string }) {
    try {
      await this.bootstrapService.verifyPorts(body.hostname);
      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  @Sse('events')
  streamEvents(): Observable<MessageEvent> {
    // Replay existing log to new subscriber then stream live events
    const existing = this.bootstrapService.getEventLog().map((e) => ({
      data: e,
    }));

    const subject = new Subject<MessageEvent>();

    // Flush existing events immediately
    for (const event of existing) {
      subject.next(event);
    }

    // Pipe future events
    const subscription = this.sseSubject.subscribe((event) => subject.next(event));

    // Clean up when client disconnects
    return new Observable<MessageEvent>((subscriber) => {
      for (const event of existing) {
        subscriber.next(event);
      }
      const sub = this.sseSubject.subscribe((e) => subscriber.next(e));
      return () => sub.unsubscribe();
    });
  }

  @OnEvent('bootstrap.event')
  handleBootstrapEvent(event: BootstrapEvent) {
    this.sseSubject.next({ data: event });
  }
}
