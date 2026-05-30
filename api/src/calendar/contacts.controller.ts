import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { Contact, ContactsService } from './contacts.service';

@Controller('contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Get()
  async getContacts(
    @Headers('x-authentik-username') username: string,
  ): Promise<Contact[]> {
    return this.contacts.getContacts(username ?? 'unknown');
  }

  @Post()
  async createContact(
    @Headers('x-authentik-username') username: string,
    @Body() body: Omit<Contact, 'uid'>,
  ): Promise<{ uid: string }> {
    const uid = await this.contacts.createContact(username ?? 'unknown', body);
    return { uid };
  }
}
