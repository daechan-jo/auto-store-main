import * as path from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {CronType} from "@daechanjo/models";


@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly adminEmails: string[];

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      service: this.configService.get<string>('EMAIL_SERVICE'),
      host: this.configService.get<string>('EMAIL_HOST'),
      port: this.configService.get<number>('EMAIL_PORT'),
      secure: this.configService.get<boolean>('EMAIL_SECURE'),
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASSWORD'),
      },
    });
    this.adminEmails = [
      this.configService.get<string>('ADMIN_EMAIL_1')!,
      this.configService.get<string>('ADMIN_EMAIL_2')!,
    ];
  }

  async sendBatchDeletionEmail(
    deletedProducts: any[],
    type: string,
    store: string,
    platformName: string,
  ): Promise<void> {
    try {
      const productListHtml = deletedProducts
        .map(
          (product) =>
            `<li>상품 ID: ${platformName === 'coupang' ? product.sellerProductId : product.originProductNo}<br>상품명: ${product.productName}<br><br></li>`,
        )
        .join('');

      const mailOptions = {
        from: `"Hush-BOT"`,
        to: this.adminEmails,
        subject: `${type}-${store}(${platformName}) 상품 삭제 알림 - 총 ${deletedProducts.length}개 상품`,
        html: `
      <h3>상품 삭제 알림</h3>
      <p>아래 상품들이 삭제되었습니다:</p>
      <ul>
        ${productListHtml}
      </ul>
    `,
      };

      await this.transporter.sendMail(mailOptions);
      console.log('삭제 알림 이메일 발송 성공');
    } catch (error) {
      if (error instanceof Error) console.error('삭제 알림 이메일 발송 실패:', error.message);
    }
  }

  async sendUpdateEmail(
    filePath: string,
    successCount: number,
    failedCount: number,
    store: string,
    smartStore: string,
  ): Promise<void> {
    const totalProducts = successCount + failedCount;
    const mailOptions = {
      from: `"Hush-BOT"`,
      to: this.adminEmails,
      subject: `${CronType.PRICE}-${store}-${smartStore} 자동 상품 가격 업데이트 안내`,
      html: `
        <h3>상품 업데이트 알림</h3>
        <ul>
        	<li><strong>Total:</strong> ${totalProducts}</li>
        	<li><strong>성공:</strong> ${successCount}</li>
        	<li><strong>실패:</strong> ${failedCount}</li>
        </ul>
      `,
      attachments: [
        {
          filename: path.basename(filePath),
          path: filePath,
        },
      ],
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`자동 상품 가격 업데이트 알림 이메일 발송 성공`);
      // fs.unlinkSync(filePath);
    } catch (error) {
      if (error instanceof Error)
        console.error(`자동 상품 가격 업데이트 알림 이메일 발송 실패:`, error.message);
    }
  }

  async sendSuccessOrders(result: any[], store: string) {
    const itemsHtml = result
      .map(
        (order) =>
          `<li>주문번호: ${order.orderId}<br>주문인: ${order.ordererName}<br>수취인: ${order.receiverName}<br>상품: ${order.sellerProductName}<br>옵션: ${order.sellerProductItemName}<br>수량: ${order.shippingCount}<br>유사도: ${order.similarity}<br><br></li>`,
      )
      .join('');

    const mailOptions = {
      from: `"Hush-BOT"`,
      to: this.adminEmails,
      subject: `${CronType.ORDER}-${store} 자동 발주 안내`,
      html: `
        <h3>발주 알림</h3>
        <ul>
          ${itemsHtml}
        </ul>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendFailedOrders(result: any[], store: string, cronId: string) {
    const itemsHtml = result
      .map(
        (order) =>
          `<li>주문번호: ${order.orderId}<br>주문인: ${order.ordererName}<br>수취인: ${order.receiverName}<br>상품코드: ${order.productCode}<br>상품: ${order.sellerProductName}<br>옵션: ${order.sellerProductItemName}<br>수량: ${order.shippingCount}<br>안전번호: ${order.safeNumber}<br>주소: ${order.fullAddress}<br>${JSON.stringify(order.error, null, 2)}<br><br></li>`,
      )
      .join('');

    const mailOptions = {
      from: `"Hush-BOT"`,
      to: this.adminEmails,
      subject: `${CronType.ERROR}${CronType.ORDER}-${store} 자동 발주 실패 안내`,
      html: `
        <h3>발주 실패 알림</h3>
        <ul>
          작업아이디: ${cronId}
          ${itemsHtml}
        </ul>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendErrorMail(cronType: CronType, store: string, cronId: string, message: string) {
    const mailOptions = {
      from: `"Hush-BOT"`,
      to: this.adminEmails,
      subject: `${CronType.ERROR}${cronType}${cronId}-${store} 에러 안내`,
      html: `
        <h3>크론작업 실패 - 확인요망</h3>
        <p>${message}</p>,
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`에러 알림 이메일 발송 성공`);
    } catch (error) {
      if (error instanceof Error) console.error(`에러 알림 이메일 발송 실패:`, error.message);
    }
  }

  async sendSuccessInvoiceUpload(successInvoiceUploads: any[], store: string) {
    const itemsHtml = successInvoiceUploads
      .map(
        (order) =>
          `<li>주문번호: ${order.orderId}<br>수취인: ${order.name}<br>안심번호${order.safeNumber}<br>택배사: ${order.courierName}<br>운송장: ${order.trackingNumber}<br><br></li>`,
      )
      .join('');

    const mailOptions = {
      from: `"Hush-BOT"`,
      to: this.adminEmails,
      subject: `${CronType.SHIPPING}-${store} 운송장 업로드 안내`,
      html: `
        <h3>운송장 업로드 알림</h3>
        <ul>
          ${itemsHtml}
        </ul>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }

  async sendFailedInvoiceUpload(failedInvoiceUploads: any[], store: string) {
    const itemsHtml = failedInvoiceUploads
      .map(
        (order) =>
          `<li>주문번호: ${order.orderId}<br>수취인: ${order.name}<br>안심번호${order.safeNumber}<br>택배사: ${order.courierName}<br>운송장: ${order.trackingNumber}<br></li>, ${JSON.stringify(order.error, null, 2)}`,
      )
      .join('');

    const mailOptions = {
      from: `"Hush-BOT"`,
      to: this.adminEmails,
      subject: `${CronType.ERROR}${CronType.SHIPPING}-${store} 운송장 업로드 실패 안내`,
      html: `
        <h3>운송장 업로드 실패 알림</h3>
        <ul>
          ${itemsHtml}
        </ul>
      `,
    };

    await this.transporter.sendMail(mailOptions);
  }
}
