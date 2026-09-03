import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiMetricsService } from './ai-metrics.service';
import { QlogService } from '../../../common/qlog/qlog.service';

export type GroqChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type GroqCallResult<T> = {
  data: T;
  source: 'groq' | 'deterministic';
  llmAvailable: boolean;
};

export type GroqPriority = 'critical' | 'high' | 'normal' | 'low';

type GroqChatOptions = { temperature?: number; maxTokens?: number; priority?: GroqPriority };

type GroqChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

type GroqCallOutcome =
  | { ok: true; content: string }
  | { ok: false; retryable: boolean; reason: string; retryAfterMs?: number };

type QueuedTask = {
  priority: GroqPriority;
  seq: number;
  run: () => Promise<void>;
};

const PRIORITY_ORDER: Record<GroqPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Reusable Groq LLM client shared by every agent in ai-supervisor — the ONLY place that ever
 * calls fetch() against Groq (agents must never call fetch directly or implement their own
 * retry). Two public entry points, unchanged for callers:
 * - chat(): free-text completion.
 * - chatJSON<T>(): forces `response_format: json_object` and parses the result.
 * Both return null on any failure (missing key, 429, timeout, network error, invalid JSON,
 * circuit open) so callers keep their existing "fall back to deterministic" pattern — nothing
 * about the calling convention changed, only what happens inside got hardened:
 *   - priority queue (MAX_CONCURRENT=1) with a minimum spacing between requests, so a burst of
 *     agent calls (e.g. one per zone) can't blow the account's tokens-per-minute budget, and a
 *     user-triggered request (priority 'critical'/'high') jumps ahead of routine cron work
 *     ('normal'/'low') already waiting in the queue.
 *   - AbortController-based timeout.
 *   - bounded retry on 429/5xx, honoring the API's `Retry-After` header when present, capped at
 *     GROQ_MAX_RETRIES — never an unbounded loop. Backoff includes jitter so parallel callers
 *     recovering from a shared 429 don't all retry in lockstep.
 *   - circuit breaker: after too many consecutive 429/5xx failures, calls are short-circuited to
 *     an immediate null (no network call) for a cooldown window, then a single trial call decides
 *     whether to fully reopen or re-trip — protects Groq (and callers' latency) during an outage
 *     instead of hammering it while every request runs its full retry budget.
 *   - output tokens capped via GROQ_MAX_OUTPUT_TOKENS so a single call can't itself eat the TPM
 *     budget.
 */
@Injectable()
export class GroqService {
  private readonly logger = new Logger(GroqService.name);
  private readonly apiKey?: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly minIntervalMs: number;
  private readonly maxOutputTokens: number;

  // Circuit breaker config/state. Redis-less and process-local, same as the queue below — this
  // process is the only thing calling Groq, so a distributed breaker would add Redis round-trips
  // to the hot path for no behavioral benefit at the current single-instance scale.
  private readonly circuitFailureThreshold: number;
  private readonly circuitCooldownMs: number;
  private circuitState: CircuitState = 'CLOSED';
  private consecutiveFailures = 0;
  private circuitOpenedAt = 0;

  // Priority queue: a plain sorted array, not a library dependency — MAX_CONCURRENT_GROQ_REQUESTS
  // is effectively always 1 for this workload (see minIntervalMs spacing below), so a full
  // priority-queue package would be overkill. `seq` breaks ties FIFO within the same priority.
  private readonly pending: QueuedTask[] = [];
  private draining = false;
  private seqCounter = 0;
  private lastCallFinishedAt = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly metrics: AiMetricsService,
    @Optional() private readonly qlog?: QlogService,
  ) {
    this.apiKey = this.configService.get<string>('GROQ_API_KEY');
    this.model = this.configService.get<string>('GROQ_MODEL', 'openai/gpt-oss-120b');
    this.timeoutMs = Number(this.configService.get<string>('GROQ_TIMEOUT_MS', '15000'));
    this.maxRetries = Number(this.configService.get<string>('GROQ_MAX_RETRIES', '2'));
    this.minIntervalMs = Number(this.configService.get<string>('GROQ_MIN_INTERVAL_MS', '3000'));
    this.maxOutputTokens = Number(this.configService.get<string>('GROQ_MAX_OUTPUT_TOKENS', '600'));
    this.circuitFailureThreshold = Number(this.configService.get<string>('AI_GROQ_CIRCUIT_FAILURE_THRESHOLD', '4'));
    this.circuitCooldownMs = Number(this.configService.get<string>('AI_GROQ_CIRCUIT_COOLDOWN_MS', '60000'));

    if (!this.apiKey) {
      this.logger.warn(
        'GROQ_API_KEY is not set: ai-supervisor agents will fall back to deterministic/templated output instead of LLM narratives.',
      );
    }
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async chat(messages: GroqChatMessage[], options: GroqChatOptions = {}): Promise<string | null> {
    return this.enqueue(() => this.attemptWithRetry(messages, options, false), options.priority ?? 'normal');
  }

  async chatJSON<T>(messages: GroqChatMessage[], options: GroqChatOptions = {}): Promise<T | null> {
    const raw = await this.enqueue(() => this.attemptWithRetry(messages, options, true), options.priority ?? 'normal');
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch (error) {
      this.logger.error(`Groq JSON response was not valid JSON: ${(error as Error).message}`);
      return null;
    }
  }

  /**
   * Adds a task to the priority queue and (re)starts draining if idle. Every task still passes
   * through the same minIntervalMs spacing as before — priority only changes queue ORDER, never
   * the rate itself, so a flood of 'critical' requests still can't blow the TPM budget.
   */
  private enqueue<T>(task: () => Promise<T>, priority: GroqPriority): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.pending.push({
        priority,
        seq: this.seqCounter++,
        run: async () => {
          try {
            resolve(await task());
          } catch (error) {
            reject(error);
          }
        },
      });
      this.pending.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.seq - b.seq);
      void this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.length > 0) {
        const waitMs = this.minIntervalMs - (Date.now() - this.lastCallFinishedAt);
        if (waitMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        const next = this.pending.shift();
        if (!next) break;
        try {
          await next.run();
        } finally {
          this.lastCallFinishedAt = Date.now();
        }
      }
    } finally {
      this.draining = false;
    }
  }

  /** True if the breaker should short-circuit this call to an immediate fallback (no network call). */
  private isCircuitBlocking(): boolean {
    if (this.circuitState === 'CLOSED') return false;

    if (this.circuitState === 'OPEN') {
      if (Date.now() - this.circuitOpenedAt >= this.circuitCooldownMs) {
        this.setCircuitState('HALF_OPEN');
        return false; // let exactly this one trial call through
      }
      return true;
    }

    // HALF_OPEN: exactly one trial in flight at a time; block any other concurrent caller so the
    // trial's outcome (not a pile-up of parallel retries) is what decides CLOSED vs OPEN.
    return true;
  }

  private setCircuitState(state: CircuitState): void {
    if (state !== this.circuitState) {
      this.logger.warn(`[AI Request Manager] Circuit breaker ${state}`);
    }
    this.circuitState = state;
    this.metrics.recordCircuitBreakerState(state);
  }

  private recordCircuitSuccess(): void {
    this.consecutiveFailures = 0;
    this.setCircuitState('CLOSED');
  }

  private recordCircuitFailure(): void {
    if (this.circuitState === 'HALF_OPEN') {
      this.circuitOpenedAt = Date.now();
      this.setCircuitState('OPEN');
      return;
    }
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.circuitFailureThreshold) {
      this.circuitOpenedAt = Date.now();
      this.setCircuitState('OPEN');
    }
  }

  private async attemptWithRetry(
    messages: GroqChatMessage[],
    options: { temperature?: number; maxTokens?: number },
    jsonMode: boolean,
  ): Promise<string | null> {
    if (!this.apiKey) {
      return null;
    }

    if (this.isCircuitBlocking()) {
      this.logger.warn('[AI Request Manager] Circuit breaker OPEN — skipping Groq call, using fallback');
      this.metrics.incrGroqFallback();
      return null;
    }

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      this.metrics.incrGroqRequest();
      const startedAt = Date.now();
      const outcome = await this.callOnce(messages, options, jsonMode);

      if (outcome.ok === true) {
        this.logger.log(`[Groq] Request completed (attempt ${attempt + 1}/${this.maxRetries + 1})`);
        const duration = Date.now() - startedAt;
        this.metrics.incrGroqSuccess(duration);
        this.recordCircuitSuccess();
        this.qlog?.logAi({
          status: 'completed',
          provider: 'Groq',
          model: this.model,
          durationMs: duration,
          analysisType: jsonMode ? 'chat_json' : 'chat',
        });
        return outcome.content;
      }

      const failure: Extract<GroqCallOutcome, { ok: false }> = outcome;

      if (!failure.retryable || attempt === this.maxRetries) {
        this.logger.warn(
          `[Groq] Falling back to deterministic output after ${attempt + 1} attempt(s): ${failure.reason}`,
        );
        this.metrics.incrGroqFallback();
        this.recordCircuitFailure();
        this.qlog?.logAi({
          status: 'fallback',
          provider: 'Groq',
          model: this.model,
          durationMs: Date.now() - startedAt,
          analysisType: jsonMode ? 'chat_json' : 'chat',
          error: failure.reason,
        });
        return null;
      }

      const delayMs = failure.retryAfterMs ?? this.backoffMs(attempt);
      this.logger.warn(`[Groq] ${failure.reason} — retry ${attempt + 1}/${this.maxRetries} after ${delayMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    return null;
  }

  private backoffMs(attempt: number): number {
    const base = this.minIntervalMs * (attempt + 1) * 2; // retry 1 waits longer than retry 0, no unbounded growth
    const jitter = Math.floor(Math.random() * base * 0.25); // up to +25% so parallel retries don't land in lockstep
    return base + jitter;
  }

  private async callOnce(
    messages: GroqChatMessage[],
    options: { temperature?: number; maxTokens?: number },
    jsonMode: boolean,
  ): Promise<GroqCallOutcome> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      this.logger.log('[Groq] Request queued');
      const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: options.temperature ?? 0.3,
          max_tokens: Math.min(options.maxTokens ?? this.maxOutputTokens, this.maxOutputTokens),
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
        }),
      });

      if (response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : undefined;
        this.logger.warn('[Groq] 429 rate limit reached');
        this.metrics.incrGroq429();
        return { ok: false, retryable: true, reason: '429 rate limit', retryAfterMs };
      }

      if (response.status >= 500) {
        this.metrics.incrGroqError();
        return { ok: false, retryable: true, reason: `${response.status} server error` };
      }

      if (!response.ok) {
        // 4xx other than 429 (bad request, invalid key, model not found, ...) — retrying won't help.
        const errorBody = await response.text();
        this.logger.error(`[Groq] API error ${response.status}: ${errorBody}`);
        this.metrics.incrGroqError();
        return { ok: false, retryable: false, reason: `${response.status} error` };
      }

      const data = (await response.json()) as GroqChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) {
        this.metrics.incrGroqError();
        return { ok: false, retryable: false, reason: 'empty response' };
      }
      return { ok: true, content };
    } catch (error) {
      const isAbort = (error as Error).name === 'AbortError';
      const reason = isAbort ? `timeout after ${this.timeoutMs}ms` : (error as Error).message;
      this.logger.error(`[Groq] Request failed: ${reason}`);
      this.metrics.incrGroqError();
      return { ok: false, retryable: !isAbort, reason };
    } finally {
      clearTimeout(timeout);
    }
  }
}
