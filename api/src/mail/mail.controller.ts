import {
  Body, Controller, Delete, Get, Headers, HttpCode, Param,
  Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { InternalSecretGuard } from '../users-me/internal-secret.guard';
import { MailImapService } from './mail-imap.service';
import { VacationDto } from './mail.dto';

@Controller('mail')
@UseGuards(InternalSecretGuard)
export class MailController {
  constructor(private readonly imap: MailImapService) {}

  @Get('stats')
  stats(@Headers('x-authentik-username') uid: string) {
    return this.imap.getStats(uid);
  }

  @Get('messages')
  messages(
    @Headers('x-authentik-username') uid: string,
    @Query('folder') folder = 'INBOX',
    @Query('page') page = '1',
    @Query('limit') limit = '25',
  ) {
    return this.imap.getMessages(uid, folder, Number(page), Number(limit));
  }

  @Get('messages/:uid')
  message(
    @Headers('x-authentik-username') authUid: string,
    @Param('uid') msgUid: string,
    @Query('folder') folder = 'INBOX',
  ) {
    return this.imap.getMessage(authUid, folder, Number(msgUid));
  }

  @Post('messages/:uid/seen')
  @HttpCode(204)
  async markSeen(
    @Headers('x-authentik-username') authUid: string,
    @Param('uid') msgUid: string,
    @Query('folder') folder = 'INBOX',
  ) {
    await this.imap.markSeen(authUid, folder, Number(msgUid));
  }

  @Delete('messages/:uid')
  @HttpCode(204)
  async deleteMessage(
    @Headers('x-authentik-username') authUid: string,
    @Param('uid') msgUid: string,
    @Query('folder') folder = 'INBOX',
  ) {
    await this.imap.deleteMessage(authUid, folder, Number(msgUid));
  }

  @Get('vacation')
  vacation(@Headers('x-authentik-username') uid: string) {
    return this.imap.getVacation(uid);
  }

  @Put('vacation')
  setVacation(
    @Headers('x-authentik-username') uid: string,
    @Body() body: VacationDto,
  ) {
    return this.imap.setVacation(uid, body.active, body.subject ?? '', body.body ?? '');
  }
}
