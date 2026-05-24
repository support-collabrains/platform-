import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly apiUrl: string;
  private readonly sender: string;
  private readonly recipient: string;

  constructor(private readonly config: ConfigService) {
    this.apiUrl = config.get('SIGNAL_API_URL') ?? '';
    this.sender = config.get('SIGNAL_SENDER') ?? '';
    this.recipient = config.get('SIGNAL_RECIPIENT') ?? '';
  }

  async send(message: string): Promise<void> {
    if (!this.apiUrl || !this.sender || !this.recipient) return;

    try {
      await axios.post(
        `${this.apiUrl}/v2/send`,
        { message, number: this.sender, recipients: [this.recipient] },
        { timeout: 10_000 },
      );
      this.logger.log(`Signal sent: ${message.slice(0, 60)}`);
    } catch (err) {
      const e = err as { response?: { data?: unknown }; message?: string };
      this.logger.warn(`Signal send failed: ${e.response ? JSON.stringify(e.response.data) : e.message}`);
    }
  }
}
