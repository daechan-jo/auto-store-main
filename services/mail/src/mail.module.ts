
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MailController } from './api/mail.controller';
import { MailService } from './core/mail.service';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: '/Users/daechanjo/codes/project/auto-store/.env',
		}),
	],
	controllers: [MailController],
	providers: [MailService],
})
export class MailModule {}
