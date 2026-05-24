import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly apiUrl: string;
  private readonly sender: string;
  private readonly recipient: string;
  private readonly authentikUrl: string;
  private readonly authentikToken: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = config.get('SIGNAL_API_URL') ?? '';
    this.sender = config.get('SIGNAL_SENDER') ?? '';
    this.recipient = config.get('SIGNAL_RECIPIENT') ?? '';
    this.authentikUrl = config.get('AUTHENTIK_URL') ?? '';
    this.authentikToken = config.get('AUTHENTIK_BOOTSTRAP_TOKEN') ?? '';
  }

  async sendToNumber(number: string, message: string): Promise<void> {
    if (!this.apiUrl || !this.sender) return;
    try {
      await axios.post(
        `${this.apiUrl}/v2/send`,
        { message, number: this.sender, recipients: [number] },
        { timeout: 10_000 },
      );
      this.logger.log(`Signal sent to ${number.slice(0, 8)}***: ${message.slice(0, 60)}`);
    } catch (err) {
      const e = err as { response?: { data?: unknown }; message?: string };
      this.logger.warn(`Signal send failed: ${e.response ? JSON.stringify(e.response.data) : e.message}`);
    }
  }

  // Send to the configured admin recipient
  async send(message: string): Promise<void> {
    if (!this.recipient) return;
    await this.sendToNumber(this.recipient, message);
  }

  // Send to all Authentik users who have attributes.phone set
  async sendToUsers(message: string): Promise<void> {
    if (!this.apiUrl || !this.sender || !this.authentikUrl || !this.authentikToken) return;
    const phones = await this.getAuthUserPhones();
    await Promise.all(phones.map((p) => this.sendToNumber(p, message)));
  }

  // Notify the admin recipient AND all users with phones (deduped)
  async broadcast(message: string): Promise<void> {
    await this.send(message);
    const phones = await this.getAuthUserPhones();
    const others = phones.filter((p) => p !== this.recipient);
    await Promise.all(others.map((p) => this.sendToNumber(p, message)));
  }

  async getAuthUserPhones(): Promise<string[]> {
    try {
      const res = await axios.get<{ results: { attributes?: { phone?: string } }[] }>(
        `${this.authentikUrl}/api/v3/core/users/?page_size=100&type=internal`,
        { headers: { Authorization: `Bearer ${this.authentikToken}` }, timeout: 5_000 },
      );
      return res.data.results
        .map((u) => u.attributes?.phone ?? '')
        .filter((p) => p.startsWith('+'));
    } catch {
      return [];
    }
  }
}
