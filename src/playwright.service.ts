import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
	Browser,
	BrowserContext,
	Page,
	chromium,
	firefox,
	webkit,
	BrowserType
} from 'playwright';

/**
 * 브라우저 유형을 정의하는 타입
 */
export type BrowserOption = 'chromium' | 'firefox' | 'webkit';

interface PageInfo {
	page: Page;
	contextId: string;
}

/**
 * Playwright 브라우저 및 페이지 관리 서비스
 *
 * 이 서비스는 다음과 같은 기능을 제공합니다
 * - 다양한 브라우저 엔진(Chromium, Firefox, WebKit) 지원
 * - 단일 브라우저 인스턴스 초기화 및 관리
 * - 여러 브라우저 컨텍스트(세션) 관리
 * - 각 컨텍스트 내의 페이지 생성 및 관리
 * - 로그인 자동화 등 자주 사용되는 브라우저 작업 처리
 */
@Injectable()
export class PlaywrightService {
	// 단일 브라우저 인스턴스를 저장하는 변수
	private browser!: Browser;

	// 사용 중인 브라우저 유형
	private browserType!: BrowserType;

	// 브라우저 초기화 상태를 추적하는 플래그
	private isInitialized = false;

	// 페이지 ID를 키로 사용하여 페이지 객체를 저장하는 맵
	private pagePool: Map<string, PageInfo> = new Map();

	// 컨텍스트 ID를 키로 사용하여 브라우저 컨텍스트 객체를 저장하는 맵
	private contextPool: Map<string, BrowserContext> = new Map();

	// 설정 값들을 저장할 속성
	private shouldUseHeadless: boolean = true;
	private selectedBrowserOption: BrowserOption = 'chromium';


	/**
	 * PlaywrightManager 생성자
	 *
	 * @param configService - 환경 변수 및 설정 값에 접근하기 위한 NestJS ConfigService
	 */
	constructor(private readonly configService: ConfigService) {}

	/**
	 * 브라우저 설정을 저장합니다. 실제 브라우저는 초기화하지 않습니다.
	 *
	 * @param headless - headless 모드 여부 (true: headless, false: 브라우저 UI 표시)
	 * @param browserOption - 사용할 브라우저 유형 ('chromium', 'firefox', 'webkit')
	 */
	setConfig(headless: boolean = true, browserOption: BrowserOption = 'chromium'): void {
		this.shouldUseHeadless = headless;
		this.selectedBrowserOption = browserOption;
		console.log(`브라우저 설정 저장: headless=${headless}, 브라우저 타입=${browserOption}`);
	}

	/**
	 * 설정된 값으로 Playwright 브라우저 인스턴스를 초기화합니다.
	 *
	 * @returns 초기화된 브라우저 인스턴스
	 */
	async initializeBrowser(): Promise<Browser> {
		// 이미 초기화되어 있는 경우, 브라우저 유형이 다르면 닫고 새로 생성
		if (this.isInitialized) {
			const currentBrowserName = this.browser.browserType().name();
			if (currentBrowserName !== this.selectedBrowserOption) {
				await this.closeAll();
				this.isInitialized = false;
			} else {
				// 이미 같은 타입의 브라우저가 초기화되어 있으면 기존 브라우저 반환
				console.log(`이미 초기화된 브라우저 재사용: 타입=${currentBrowserName}`);
				return this.browser;
			}
		}

		// 초기화되지 않았거나 새 브라우저 유형이 요청된 경우 브라우저 생성
		if (!this.isInitialized) {
			// 요청된 브라우저 유형에 따라 적절한 브라우저 인스턴스 생성
			switch (this.selectedBrowserOption) {
				case 'firefox':
					this.browserType = firefox;
					break;
				case 'webkit':
					this.browserType = webkit;
					break;
				case 'chromium':
				default:
					this.browserType = chromium;
					break;
			}

			// 브라우저 인스턴스 생성
			this.browser = await this.browserType.launch({
				headless: this.shouldUseHeadless,
				args: [
					'--no-sandbox',
					'--disable-setuid-sandbox',
					'--disable-web-security',
					'--disable-features=IsolateOrigins,site-per-process',
				],
				timeout: 0,
			});

			const browserId = Date.now().toString();
			console.log(`브라우저 인스턴스 생성: ID=${browserId}, 타입=${this.selectedBrowserOption}, Headless=${this.shouldUseHeadless}`);
			(this.browser as any)._instanceId = browserId;
		}

		this.isInitialized = true;
		return this.browser;
	}

	/**
	 * 기존 init 메서드와의 호환성을 위한 메서드
	 * 설정을 저장하고 브라우저를 초기화합니다.
	 */
	async init(headless: boolean = true, browserOption: BrowserOption = 'chromium'): Promise<Browser> {
		this.setConfig(headless, browserOption);
		return this.initializeBrowser();
	}

	/**
	 * 지정된 ID로 브라우저 컨텍스트를 가져오거나 생성합니다.
	 * 컨텍스트는 독립된 쿠키, 세션, 캐시를 가지는 브라우저 세션입니다.
	 *
	 * @param contextId - 가져오거나 생성할 컨텍스트의 고유 ID
	 * @returns 브라우저 컨텍스트 객체
	 * @throws 컨텍스트 생성 실패 시 에러 발생
	 */
	async getOrCreateContext(contextId: string): Promise<BrowserContext> {
		// 브라우저가 초기화되지 않은 경우 먼저 초기화
		if (!this.isInitialized) {
			await this.initializeBrowser();
		}

		// 요청된 ID의 컨텍스트가 없는 경우 새로 생성
		if (!this.contextPool.has(contextId)) {
			// Playwright에서는 newContext() 메소드 사용
			const context = await this.browser.newContext({
				viewport: { width: 1366, height: 768 },
				userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.60 Safari/537.36',
			});

			// 브라우저 지문을 피하기 위한 추가 스크립트 (WebKit의 경우 특히 유용)
			await context.addInitScript(() => {
				// WebDriver 속성 제거
				Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

				// 하드웨어 동시실행 값 설정
				Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

				// 언어 설정
				Object.defineProperty(navigator, 'language', { get: () => 'ko-KR' });

				// 플러그인 목록 수정
				Object.defineProperty(navigator, 'plugins', {
					get: () => {
						return {
							length: 5,
							// 필요한 경우 여기에 더 자세한 플러그인 에뮬레이션 추가
						};
					}
				});
			});

			this.contextPool.set(contextId, context); // 새 컨텍스트를 풀에 저장
		}

		// 컨텍스트 가져오기
		const context = this.contextPool.get(contextId);

		// 컨텍스트가 여전히 없는 경우 (생성 실패) 에러 발생
		if (!context) {
			throw new Error(`Failed to create or get context with ID: ${contextId}`);
		}

		return context;
	}

	/**
	 * 지정된 컨텍스트 내에 새 페이지를 생성합니다.
	 *
	 * @param contextId - 페이지가 속할 컨텍스트의 ID
	 * @param pageId - 생성할 페이지의 고유 ID
	 * @returns 생성된 페이지 객체
	 */
	async createPage(contextId: string, pageId: string): Promise<Page> {
		// 지정된 ID의 컨텍스트 가져오기 (없으면 생성)
		const context = await this.getOrCreateContext(contextId);

		// 컨텍스트 내에 새 페이지 생성
		const page = await context.newPage();

		// 페이지를 풀에 저장
		this.pagePool.set(pageId, {page, contextId});

		// JavaScript 타임아웃 이벤트 처리를 개선
		await page.route('**/*', async (route) => {
			// 대부분의 요청을 정상적으로 계속 진행
			await route.continue();
		}, { times: 1 });  // 첫 번째 탐색에서만 적용

		return page;
	}

	/**
	 * 지정된 ID의 페이지를 가져옵니다.
	 *
	 * @param pageId - 가져올 페이지의 ID
	 * @returns 페이지 객체 또는 해당 ID의 페이지가 없는 경우 null
	 */
	async getPage(pageId: string): Promise<Page | null> {
		const pageInfo =  this.pagePool.get(pageId);
		return pageInfo?.page || null; // 페이지가 없으면 null 반환
	}

	/**
	 * 지정된 ID의 페이지를 닫고 풀에서 제거합니다.
	 *
	 * @param pageId - 해제할 페이지의 ID
	 */
	async releasePage(pageId: string) {
		const pageInfo = this.pagePool.get(pageId);
		if (pageInfo) {
			// 페이지 닫기 시도
			await pageInfo.page.close().catch((err) => console.error(`Error closing page ${pageId}:`, err));
			// 성공 여부와 관계없이 풀에서 제거
			this.pagePool.delete(pageId);
		}
	}

	/**
	 * 지정된 ID의 컨텍스트와 그 안의 모든 페이지를 해제합니다.
	 *
	 * @param contextId - 해제할 컨텍스트의 ID
	 */
	async releaseContext(contextId: string) {
		const context = this.contextPool.get(contextId);
		if (context) {
			// 해당 컨텍스트에 속한 모든 페이지를 찾아 해제
			for (const [pageId, pageInfo] of this.pagePool.entries()) {
				// 페이지가 이 컨텍스트에 속하는지 확인
				try {
					if (pageInfo.page.context() === context) {
						await this.releasePage(pageId);
					}
				} catch (error) {
					console.error(`Error comparing browser contexts for page ${pageId}:`, error);
					// 오류 발생 시 안전하게 페이지 닫기
					await this.releasePage(pageId);
				}
			}

			// 컨텍스트 자체를 닫고 풀에서 제거
			await context
				.close()
				.catch((err) => console.error(`Error closing context ${contextId}:`, err));
			this.contextPool.delete(contextId);
		}
	}

	/**
	 * 모든 페이지와 컨텍스트를 닫고 브라우저 인스턴스를 종료합니다.
	 */
	async closeAll() {
		// 모든 페이지 해제
		for (const pageId of this.pagePool.keys()) {
			await this.releasePage(pageId);
		}

		// 모든 컨텍스트 해제
		for (const contextId of this.contextPool.keys()) {
			await this.releaseContext(contextId);
		}

		// 브라우저 종료
		if (this.browser) {
			await this.browser.close();
			this.isInitialized = false; // 초기화 상태 재설정
		}
	}

	/**
	 * 안전하게 웹페이지를 탐색하는 함수
	 *
	 * @param {Page} page - Playwright Page 객체
	 * @param {string} url - 탐색할 URL
	 * @returns {Promise<Response|null>} - 페이지 응답 객체 또는 네비게이션 실패 시 null
	 * @throws {Error} - 네비게이션 타임아웃 또는 다른 탐색 관련 오류 발생시
	 *
	 * @description
	 * 이 함수는 다음 4단계를 통해 안정적인 페이지 탐색을 보장합니다:
	 * 1. 이전 페이지 활동이 완전히 종료될 때까지 대기
	 * 2. 새 URL로 네비게이션 시작 (최대 60초 타임아웃)
	 * 3. 네트워크 요청이 안정화될 때까지 대기 (최대 10초, 실패시 진행)
	 * 4. 페이지 렌더링이 완료될 때까지 대기 (최대 10초, 실패시 진행)
	 *
	 * @example
	 * try {
	 *   const response = await navigateSafely(page, 'https://example.com');
	 *   if (response && response.ok()) {
	 *     console.log('페이지 로드 성공');
	 *   }
	 * } catch (error) {
	 *   console.error('탐색 실패:', error);
	 * }
	 */
	async navigateSafely(page: Page, url: string) {
		// 1. 이전 페이지 활동 완전히 종료 대기
		await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));

		try {
			// 2. 네비게이션 시작
			const response = await page.goto(url, {
				timeout: 60000,
				waitUntil: 'domcontentloaded' // 먼저 DOM이 로드되기만 기다림
			});

			// 3. 네트워크 안정화 확인
			await page.waitForLoadState('networkidle', { timeout: 10000 })
				.catch(() => console.log('네트워크 안정화 대기 건너뜀'));

			// 4. 페이지 렌더링 확인
			await page.waitForFunction(() =>
				document.readyState === 'complete', { timeout: 10000 })
				.catch(() => console.log('렌더링 완료 대기 건너뜀'));

			return response;
		} catch (error: any) {
			console.error(`네비게이션 오류: ${error.message}`);
			throw error;
		}
	}

	/**
	 * 온채널 사이트에 로그인합니다.
	 *
	 * @param store - 스토어 식별자
	 * @param contextId - 페이지가 속할 컨텍스트의 ID
	 * @param pageId - 사용할 페이지의 ID
	 * @param browserOption - 사용할 브라우저 유형 (선택적)
	 * @returns 로그인된 페이지 객체
	 */
	async loginToOnchSite(
		store: string,
		contextId: string,
		pageId: string,
		browserOption: BrowserOption = 'chromium'
	): Promise<Page> {
		let page: Page;

		try {
			// 브라우저가 초기화되지 않았거나 다른 브라우저 유형이 요청된 경우 초기화
			if (!this.isInitialized || (this.browser.browserType().name() !== browserOption)) {
				await this.init(true, browserOption);
			}

			const existingPage = await this.getPage(pageId);

			if (existingPage && !existingPage.isClosed()) {
				// 페이지가 존재하고 열려 있으면 그대로 사용
				page = existingPage;
				console.log(`Using existing page with ID: ${pageId}`);
			} else {
				// 페이지가 없거나 닫혔으면, 요청된 컨텍스트 ID로 새 페이지 생성
				console.log(`Creating new page with ID: ${pageId} in context: ${contextId}`);
				page = await this.createPage(contextId, pageId);
			}

			// 스토어에 따라 적절한 계정 정보 가져오기
			const onchEmail =
				store === 'linkedout'
					? this.configService.get<string>('ON_CHANNEL_EMAIL')!
					: this.configService.get<string>('ON_CHANNEL_EMAIL')!;
			const onchPassword =
				store === 'linkedout'
					? this.configService.get<string>('ON_CHANNEL_PASSWORD')!
					: this.configService.get<string>('ON_CHANNEL_PASSWORD')!;

			// 온채널 로그인 페이지로 이동
			await page.goto('https://www.onch3.co.kr/login/login_web.php', { timeout: 60000, waitUntil: 'networkidle' });

			// 이메일과 비밀번호 입력
			await page.fill('input[placeholder="온채널 또는 통합계정 아이디"]', onchEmail);
			await page.fill('input[placeholder="비밀번호 입력"]', onchPassword);

			// 로그인 버튼 클릭
			await page.click('button[name="login"]');

			await page.waitForLoadState('networkidle')

			return page;
		} catch (error: any) {
			console.error(`로그인 실패: ${error instanceof Error ? error.message : String(error)}`);
			throw new Error(
				`온채널 로그인 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * 쿠팡 판매자 사이트에 로그인합니다.
	 * 제공된 컨텍스트 ID와 페이지 ID를 사용하여 페이지를 가져오거나 생성합니다.
	 *
	 * @param contextId - 사용할 또는 생성할 브라우저 컨텍스트의 ID
	 * @param pageId - 사용할 또는 생성할 페이지의 ID
	 * @param browserOption - 사용할 브라우저 유형 (선택적)
	 * @returns 로그인된 페이지 객체
	 * @throws 페이지 생성이나 로그인 과정에서 오류 발생 시 에러
	 */
	async loginToCoupangSite(
		contextId: string,
		pageId: string,
		browserOption: BrowserOption = 'chromium'
	): Promise<Page> {
		let page: Page;

		try {
			// 브라우저가 초기화되지 않았거나 다른 브라우저 유형이 요청된 경우 초기화
			if (!this.isInitialized || (this.browser.browserType().name() !== browserOption)) {
				await this.init(true, browserOption);
			}

			// 먼저 해당 ID의 페이지가 이미 존재하는지 확인
			const existingPage = await this.getPage(pageId);

			if (existingPage && !existingPage.isClosed()) {
				// 페이지가 존재하고 열려 있으면 그대로 사용
				page = existingPage;
				console.log(`Using existing page with ID: ${pageId}`);
			} else {
				// 페이지가 없거나 닫혔으면, 요청된 컨텍스트 ID로 새 페이지 생성
				console.log(`Creating new page with ID: ${pageId} in context: ${contextId}`);
				page = await this.createPage(contextId, pageId);
			}

			// 쿠팡 판매자 로그인 페이지로 이동
			await page.goto(
				'https://xauth.coupang.com/auth/realms/seller/protocol/openid-connect/auth?response_type=code&client_id=wing&redirect_uri=https%3A%2F%2Fwing.coupang.com%2Fsso%2Flogin?returnUrl%3D%252F&state=ec02db23-2738-48a2-b15e-81d22b32be64&login=true&scope=openid',
				{
					waitUntil: 'networkidle', // Playwright에서는 'networkidle'
					timeout: 60000, // 60초 대기 제한
				},
			);

			// 현재 페이지가 로그인 페이지인지 확인
			const isLoginPage = await page.evaluate(() => {
				return !!document.querySelector('.cp-loginpage__bg');
			});

			// 이미 로그인된 상태인 경우
			if (!isLoginPage) {
				console.log('이미 쿠팡에 로그인되어 있습니다.');
				return page; // 로그인 페이지가 아니면 이미 로그인 상태로 간주
			}

			console.log('쿠팡 로그인 진행 중...');
			// 로그인 필요한 경우
			// 사용자 이름과 비밀번호 입력
			await page.fill('#username', this.configService.get<string>('COUPANG_EMAIL')!);
			await page.fill('#password', this.configService.get<string>('COUPANG_PASSWORD')!);

			// 엔터 키 누르기 (로그인 버튼 클릭 대신)
			await page.keyboard.press('Enter');

			await page.waitForLoadState('networkidle')
			console.log('쿠팡 로그인 완료');

			return page;
		} catch (error) {
			console.error(`쿠팡 로그인 실패: ${error instanceof Error ? error.message : String(error)}`);
			throw new Error(
				`쿠팡 로그인 중 오류 발생: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	async getBrowserInfo(): Promise<object> {
		if (!this.isInitialized) {
			return { status: 'not_initialized' };
		}

		try {
			const contexts = this.browser.contexts().length;
			const browserType = this.browser.browserType().name();
			const isConnected = !this.browser.isConnected(); // 연결 상태 체크

			return {
				status: 'initialized',
				browserType,
				contexts,
				isConnected,
				contextIds: Array.from(this.contextPool.keys()),
				pageIds: Array.from(this.pagePool.keys())
			};
		} catch (error) {
			return {
				status: 'error',
				message: error instanceof Error ? error.message : String(error)
			};
		}
	}

	/**
	 * 병렬 처리를 위한 여러 페이지를 생성합니다
	 *
	 * @param store - 스토어 식별자 (페이지 ID 생성에 사용)
	 * @param cronId - 크론 작업 식별자 (페이지 ID 생성에 사용)
	 * @param concurrentCount - 생성할 총 페이지 수 (기본값: 2)
	 * @returns 생성된 페이지 배열
	 */
	async createParallelPages(
		store: string,
		cronId: string,
		concurrentCount: number = 2,
	): Promise<Page[]> {
		const pages: Page[] = [];
		const contextId = `context-${store}-${cronId}`;


		for (let i = 0; i < concurrentCount; i++) {
			const pageId = `page-${store}-${cronId}-${i+1}`;
			const existingPage = await this.getPage(pageId);
			const pageInfo = this.pagePool.get(pageId);

			if (existingPage && pageInfo && pageInfo.contextId === contextId) {
				// 기존 페이지가 있고 동일한 컨텍스트에 속해 있으면 재사용
				pages.push(existingPage);
			} else {
				// 페이지가 없거나 다른 컨텍스트에 속해 있으면 새로 생성
				const newPage = await this.createPage(contextId, pageId);
				pages.push(newPage);
			}
		}

		return pages;
	}

	/**
	 * 병렬 처리를 위해 데이터 배열을 여러 청크로 분할합니다
	 *
	 * @param items - 분할할 아이템 배열
	 * @param chunkCount - 분할할 청크 수
	 * @returns 분할된 청크 배열
	 */
	splitIntoChunks<T>(items: T[], chunkCount: number): T[][] {
		const chunkSize = Math.ceil(items.length / chunkCount);
		const chunks: T[][] = [];

		for (let i = 0; i < items.length; i += chunkSize) {
			chunks.push(items.slice(i, i + chunkSize));
		}

		return chunks;
	}

	/**
	 * 데이터 아이템을 병렬로 처리합니다
	 *
	 * @param pages - 사용할 페이지 배열
	 * @param items - 처리할 데이터 아이템 배열
	 * @param processItemFn - 각 아이템을 처리하는 함수
	 * @param batchSize - 한 번에 처리할 배치 크기 (기본값: 50)
	 * @param onBatchComplete - 배치 처리 완료 시 호출할 콜백 함수
	 * @param onProgress - 진행 상황 업데이트 시 호출할 콜백 함수
	 * @returns 처리 결과 (성공 및 실패 카운트)
	 */
	async processItemsInParallel<T, R>(
		pages: Page[],
		items: T[],
		processItemFn: (page: Page, item: T) => Promise<R>,
		batchSize: number = 50,
		onBatchComplete?: (batchResults: R[]) => Promise<void>,
		onProgress?: (completed: number, total: number) => void
	): Promise<{ successCount: number; failCount: number; results: R[] }> {
		// 아이템을 청크로 분할
		const chunks = this.splitIntoChunks(items, pages.length);
		const totalItems = items.length;

		let successCount = 0;
		let failCount = 0;
		const allResults: R[] = [];

		// 각 페이지별로 병렬 처리
		await Promise.all(
			chunks.map(async (chunk, pageIndex) => {
				const page = pages[pageIndex];
				const localBatch: R[] = [];

				for (const item of chunk) {
					try {
						// 아이템 처리
						const result = await processItemFn(page, item);
						localBatch.push(result);
						allResults.push(result);

						// 배치 크기에 도달하면 배치 처리 완료 콜백 호출
						if (localBatch.length >= batchSize && onBatchComplete) {
							await onBatchComplete([...localBatch]);
							localBatch.length = 0;
						}

						// 진행 상황 업데이트
						successCount++;
						if (onProgress) {
							onProgress(successCount + failCount, totalItems);
						}
					} catch (error) {
						failCount++;
						console.error(`아이템 처리 중 오류 발생:`, error);

						if (onProgress) {
							onProgress(successCount + failCount, totalItems);
						}
					}
				}

				// 남은 배치 처리
				if (localBatch.length > 0 && onBatchComplete) {
					await onBatchComplete([...localBatch]);
				}
			})
		);

		return { successCount, failCount, results: allResults };
	}
}