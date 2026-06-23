import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class FacebookCapiService {
  private readonly logger = new Logger(FacebookCapiService.name);
  private readonly pixelId: string | undefined;
  private readonly capiToken: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.pixelId = this.configService.get<string>('FB_PIXEL_ID')?.trim();
    this.capiToken = this.configService.get<string>('FB_CAPI_TOKEN')?.trim();
  }

  private hashSha256(val: string): string {
    return crypto.createHash('sha256').update(val.trim().toLowerCase()).digest('hex');
  }

  private normalizePhone(phone: string): string {
    let clean = phone.replace(/\D/g, ''); // remove non-digits
    if (clean.startsWith('0')) {
      clean = '84' + clean.slice(1);
    }
    return clean;
  }

  async sendPurchaseEvent(
    order: any,
    clientData: { ip?: string; userAgent?: string },
  ): Promise<void> {
    if (!this.pixelId || !this.capiToken) {
      this.logger.warn('Facebook Pixel ID or CAPI Token is not configured. Skipping CAPI event.');
      return;
    }

    try {
      const userData: any = {};

      // 1. Email (if exists)
      if (order.customerEmail) {
        userData.em = [this.hashSha256(order.customerEmail)];
      }

      // 2. Phone
      if (order.customerPhone) {
        userData.ph = [this.hashSha256(this.normalizePhone(order.customerPhone))];
      }

      // 3. Name (split into first and last name if possible for better matching)
      if (order.customerName) {
        const nameParts = order.customerName.trim().split(/\s+/);
        if (nameParts.length > 0) {
          const firstName = nameParts[nameParts.length - 1];
          userData.fn = [this.hashSha256(firstName)];
          
          if (nameParts.length > 1) {
            const lastName = nameParts.slice(0, nameParts.length - 1).join(' ');
            userData.ln = [this.hashSha256(lastName)];
          }
        }
      }

      // 4. IP & User Agent
      if (clientData.ip) {
        userData.client_ip_address = clientData.ip;
      }
      if (clientData.userAgent) {
        userData.client_user_agent = clientData.userAgent;
      }

      // Prepare custom data (contents)
      const contents = (order.items || []).map((item: any) => ({
        id: item.sku || item.productName,
        quantity: item.quantity,
        item_price: Number(item.unitPrice),
      }));

      const payload = {
        data: [
          {
            event_name: 'Purchase',
            event_time: Math.floor(Date.now() / 1000),
            event_id: order.code,
            event_source_url: 'https://dukystore.com/thanh-toan/thanh-cong',
            action_source: 'website',
            user_data: userData,
            custom_data: {
              currency: 'VND',
              value: Number(order.grandTotal),
              content_type: 'product',
              contents,
            },
          },
        ],
      };

      const url = `https://graph.facebook.com/v19.0/${this.pixelId}/events?access_token=${this.capiToken}`;

      this.logger.log(`Sending CAPI Purchase event for order: ${order.code}`);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Failed to send CAPI event. Response status: ${response.status}, body: ${errorText}`);
      } else {
        const responseData = await response.json();
        this.logger.log(`Successfully sent CAPI event. Meta response: ${JSON.stringify(responseData)}`);
      }
    } catch (error) {
      this.logger.error('Error sending Facebook CAPI Purchase event', error);
    }
  }
}
