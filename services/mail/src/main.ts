import * as process from 'node:process';
import {setupGlobalConsoleLogging} from "@daechanjo/log";
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import * as dotenv from 'dotenv';

import { MailModule } from './mail.module';

dotenv.config({
	path: '/Users/daechanjo/codes/project/auto-store/.env',
});



async function bootstrap() {
	setupGlobalConsoleLogging();

	const app = await NestFactory.createMicroservice<MicroserviceOptions>(MailModule, {
		transport: Transport.RMQ,
		options: {
			urls: [String(process.env.RABBITMQ_URL)],
			queue: 'mail-queue',
			queueOptions: { durable: false },
		},
	});

	await app.listen();
	console.log('메일 서비스 시작');
}

bootstrap();
