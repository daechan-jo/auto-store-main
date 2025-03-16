import { Module,Global } from '@nestjs/common';
import {PlaywrightManager} from "./playwright.service";

@Global()
@Module({
	providers: [PlaywrightManager],
	exports: [PlaywrightManager],
})
export class PlaywrightModule {}
