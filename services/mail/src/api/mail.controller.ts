import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';

import { MailService } from '../core/mail.service';

@Controller()
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @MessagePattern('mail-queue')
  async handleMailMessage(message: any): Promise<void> {
    const { pattern, payload } = message;
    console.log(`송신 패턴: ${pattern}\npayload: ${payload}`);

    switch (pattern) {
      case 'sendBatchDeletionEmail':
        await this.mailService.sendBatchDeletionEmail(
          payload.deletedProducts,
          payload.type,
          payload.store,
          payload.platformName,
        );
        break;

      case 'sendUpdateEmail':
        await this.mailService.sendUpdateEmail(
          payload.filePath,
          payload.successCount,
          payload.filedCount,
          payload.store,
          payload.smartStore,
        );
        break;

      case 'sendSuccessOrders':
        await this.mailService.sendSuccessOrders(payload.result, payload.store);
        break;

      case 'sendFailedOrders':
        await this.mailService.sendFailedOrders(payload.result, payload.store, payload.cronId);
        break;

      case 'sendErrorMail':
        await this.mailService.sendErrorMail(
          payload.cronType,
          payload.store,
          payload.cronId,
          payload.message,
        );
        break;

      case 'sendSuccessInvoiceUpload':
        await this.mailService.sendSuccessInvoiceUpload(
          payload.successInvoiceUploads,
          payload.store,
        );
        break;

      case 'sendFailedInvoiceUpload':
        await this.mailService.sendFailedInvoiceUpload(payload.failedInvoiceUploads, payload.store);
        break;

      default:
        console.error(`알 수 없는 패턴 유형: ${pattern}`);
    }
  }
}
