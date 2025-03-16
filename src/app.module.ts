import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
	imports: [
		ConfigModule.forRoot({
			isGlobal: true,
			envFilePath: '/Users/daechanjo/codes/project/auto-store/.env',
		}),
	],

})
export class AppModule {}
