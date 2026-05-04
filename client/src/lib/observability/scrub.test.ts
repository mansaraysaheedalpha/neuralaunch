// src/lib/observability/scrub.test.ts
//
// Phase 4's load-bearing gate. Every regex pattern has a must-match
// column AND a must-NOT-match column. Both must pass before the scrub
// wires into Sentry's beforeSend / beforeSendTransaction.

import { describe, it, expect } from 'vitest';
import {
  scrubString,
  stripQueryString,
  isDeniedKey,
  isHealthcheckUrl,
  walkAndScrub,
} from './scrub-patterns';
import { beforeSend, beforeSendTransaction } from './scrub';
import type { Event } from '@sentry/nextjs';

describe('scrub-patterns — regex patterns', () => {
  describe('email', () => {
    const matches = [
      'user@example.com',
      'user+tag@example.com',
      'user.name@sub.domain.co.uk',
      'a@b.co',
    ];
    const nonMatches = ['user@', '@example.com', 'user@example', 'just text'];

    it.each(matches)('catches %s', (s) => {
      expect(scrubString(`prefix ${s} suffix`)).not.toContain(s);
    });
    it.each(nonMatches)('does NOT catch %s', (s) => {
      expect(scrubString(`prefix ${s} suffix`)).toContain(s);
    });
  });

  describe('key prefixes (underscore)', () => {
    const matches = [
      'sk_live_abc123def456',
      'pk_test_abcdef1234567890',
      'sntr_AbCdEfGh1234567890',
      'pdl_sdbx_xxxxxxxxxxxxxxxx',
      'rk_test_abcdef1234567890',
      'whsec_abcdef1234567890',
      'pi_abcdef1234567890',
      'ch_abcdef1234567890',
      'exa_abcdef12345678',
    ];
    const nonMatches = ['sk_', 'sk_short', 'userskname'];

    it.each(matches)('catches %s', (s) => {
      expect(scrubString(s)).toBe('[Filtered]');
    });
    it.each(nonMatches)('does NOT catch %s', (s) => {
      expect(scrubString(s)).toContain(s);
    });
  });

  describe('Anthropic key', () => {
    it('catches sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxx', () => {
      expect(scrubString('sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz')).toContain('[Filtered]');
    });
    it('does NOT catch sk-ant- (too short)', () => {
      expect(scrubString('sk-ant-')).toBe('sk-ant-');
    });
  });

  describe('Inngest signing keys', () => {
    it('catches signkey-prod-xxxxxxxxxxxxxxxx', () => {
      expect(scrubString('signkey-prod-AbCdEfGhIjKlMnOp')).toContain('[Filtered]');
    });
    it('catches signkey-test-xxxxxxxxxxxxxxxx', () => {
      expect(scrubString('signkey-test-AbCdEfGhIjKlMnOp')).toContain('[Filtered]');
    });
    it('does NOT catch signkey-prod-short', () => {
      expect(scrubString('signkey-prod-short')).toContain('signkey-prod-short');
    });
  });

  describe('JWT', () => {
    it('catches a three-segment JWT', () => {
      expect(scrubString('eyJhbGciOi.eyJzdWIi.SflKxwRJ_test_value')).toContain('[Filtered]');
    });
    it('does NOT catch incomplete eyJ', () => {
      expect(scrubString('eyJ')).toBe('eyJ');
    });
  });

  describe('long digit runs', () => {
    it('catches 16-digit credit-card-shaped numbers', () => {
      expect(scrubString('payment 4111111111111111 declined')).toContain('[Filtered]');
    });
    it('catches 15-digit numbers', () => {
      expect(scrubString('id 123456789012345')).toContain('[Filtered]');
    });
    it('does NOT catch US ZIP codes (5 digits)', () => {
      expect(scrubString('zip 94105')).toBe('zip 94105');
    });
    it('does NOT catch US phone numbers (10 digits)', () => {
      expect(scrubString('phone 4155551234')).toBe('phone 4155551234');
    });
    it('does NOT catch dashed phone numbers', () => {
      expect(scrubString('123-456-7890')).toBe('123-456-7890');
    });
    it('does NOT catch port numbers', () => {
      expect(scrubString('localhost:3000')).toBe('localhost:3000');
    });
  });

  describe('SSN', () => {
    it('catches 123-45-6789', () => {
      expect(scrubString('ssn 123-45-6789')).toContain('[Filtered]');
    });
    it('does NOT catch other dashed numbers', () => {
      expect(scrubString('123-456-7890')).toBe('123-456-7890');
    });
  });

  describe('billing entity IDs', () => {
    it('catches cus_<16+ alnum>', () => {
      expect(scrubString('customer cus_01h3z4y5x6w7v8u9 paid')).toContain('[Filtered]');
    });
    it('catches sub_, txn_, adj_, pri_', () => {
      expect(scrubString('sub_01h3z4y5x6w7v8u9')).toContain('[Filtered]');
      expect(scrubString('txn_01h3z4y5x6w7v8u9')).toContain('[Filtered]');
      expect(scrubString('adj_01h3z4y5x6w7v8u9')).toContain('[Filtered]');
      expect(scrubString('pri_01h3z4y5x6w7v8u9')).toContain('[Filtered]');
    });
    it('does NOT catch incomplete cus_', () => {
      expect(scrubString('cus_')).toBe('cus_');
    });
    it('does NOT catch customer_id (no entity-id-suffix)', () => {
      expect(scrubString('customer_id')).toBe('customer_id');
    });
  });
});

describe('scrub-patterns — denylist key matching', () => {
  it('matches credential / secret keys', () => {
    expect(isDeniedKey('password')).toBe(true);
    expect(isDeniedKey('access_token')).toBe(true);
    expect(isDeniedKey('apiKey')).toBe(true);
    expect(isDeniedKey('api_key')).toBe(true);
    expect(isDeniedKey('client_secret')).toBe(true);
    expect(isDeniedKey('authorization')).toBe(true);
    expect(isDeniedKey('cookie')).toBe(true);
  });
  it('matches PII identifier keys', () => {
    expect(isDeniedKey('paddleCustomerId')).toBe(true);
    expect(isDeniedKey('paddle_customer_id')).toBe(true);
    expect(isDeniedKey('customer_id')).toBe(true);
    expect(isDeniedKey('email')).toBe(true);
    expect(isDeniedKey('phone')).toBe(true);
    expect(isDeniedKey('ssn')).toBe(true);
    expect(isDeniedKey('cvv')).toBe(true);
    expect(isDeniedKey('credit_card')).toBe(true);
  });
  it('does NOT match neutral keys', () => {
    expect(isDeniedKey('userId')).toBe(false);
    expect(isDeniedKey('roadmapId')).toBe(false);
    expect(isDeniedKey('createdAt')).toBe(false);
    expect(isDeniedKey('agent.tier')).toBe(false);
    expect(isDeniedKey('tokens.input')).toBe(false);
  });
});

describe('scrub-patterns — stripQueryString', () => {
  it('strips query string and replaces with ?[Filtered]', () => {
    expect(stripQueryString('https://example.com/path?token=abc')).toBe(
      'https://example.com/path?[Filtered]',
    );
  });
  it('preserves URL path when no query string', () => {
    expect(stripQueryString('https://example.com/path')).toBe('https://example.com/path');
  });
  it('handles relative URLs', () => {
    expect(stripQueryString('/api/foo?x=1')).toBe('/api/foo?[Filtered]');
  });
});

describe('scrub-patterns — isHealthcheckUrl', () => {
  it('matches /api/health', () => {
    expect(isHealthcheckUrl('https://example.com/api/health')).toBe(true);
    expect(isHealthcheckUrl('/api/health')).toBe(true);
    expect(isHealthcheckUrl('/api/health?t=1')).toBe(true);
  });
  it('matches /api/discovery/tool-jobs/active', () => {
    expect(isHealthcheckUrl('/api/discovery/tool-jobs/active')).toBe(true);
  });
  it('matches per-job status polls', () => {
    expect(
      isHealthcheckUrl('/api/discovery/roadmaps/abc/tool-jobs/job123/status'),
    ).toBe(true);
  });
  it('does NOT match user-facing routes', () => {
    expect(isHealthcheckUrl('/api/discovery/sessions/abc/turn')).toBe(false);
    expect(isHealthcheckUrl('/api/discovery/roadmaps/abc/coach/prepare')).toBe(false);
    expect(isHealthcheckUrl(undefined)).toBe(false);
  });
});

describe('scrub-patterns — recursive walker', () => {
  it('scrubs nested string values via denylist key', () => {
    const input = { user: { email: 'alice@example.com' }, name: 'Alice' };
    const output = walkAndScrub(input, 0) as typeof input;
    expect(output.user.email).toBe('[Filtered]');
    expect(output.name).toBe('Alice');
  });

  it('scrubs strings that contain PII patterns', () => {
    const input = { description: 'failed for user alice@example.com on retry 3' };
    const output = walkAndScrub(input, 0) as typeof input;
    expect(output.description).toContain('[Filtered]');
    expect(output.description).not.toContain('alice@example.com');
  });

  it('preserves neutral values', () => {
    const input = { count: 42, ok: true, name: null, items: ['a', 'b'] };
    const output = walkAndScrub(input, 0) as typeof input;
    expect(output).toEqual(input);
  });

  it('caps recursion depth without throwing', () => {
    let deep: Record<string, unknown> = { leaf: 'alice@example.com' };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(() => walkAndScrub(deep, 0)).not.toThrow();
  });
});

describe('scrub.ts — beforeSend hook', () => {
  it('drops healthcheck-originated errors', () => {
    const event = {
      request: { url: 'https://example.com/api/health' },
      message: 'health probe failed',
    } as Event;
    expect(beforeSend(event)).toBeNull();
  });

  it('strips query string from request URL', () => {
    const event = {
      request: { url: 'https://example.com/api/foo?token=secret' },
    } as Event;
    const out = beforeSend(event);
    expect(out?.request?.url).toBe('https://example.com/api/foo?[Filtered]');
  });

  it('scrubs PII from event.message', () => {
    const event = { message: 'failure for alice@example.com' } as Event;
    const out = beforeSend(event);
    expect(out?.message).toBe('failure for [Filtered]');
  });

  it('scrubs PII from exception value strings', () => {
    const event = {
      exception: {
        values: [{ value: 'API call failed: sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz' }],
      },
    } as Event;
    const out = beforeSend(event);
    expect(out?.exception?.values?.[0].value).toContain('[Filtered]');
    expect(out?.exception?.values?.[0].value).not.toContain('sk-ant-api03');
  });

  it('scrubs request.data deeply', () => {
    const event = {
      request: {
        url: '/api/discovery/sessions/abc/turn',
        data: { message: 'My idea is to email alice@example.com' },
      },
    } as Event;
    const out = beforeSend(event);
    const data = out?.request?.data as { message: string };
    expect(data.message).toContain('[Filtered]');
  });

  it('strips query string from breadcrumb URLs', () => {
    const event = {
      breadcrumbs: [
        { type: 'http', data: { url: '/api/foo?session=xyz', method: 'GET' } },
      ],
    } as Event;
    const out = beforeSend(event);
    expect(out?.breadcrumbs?.[0].data?.url).toBe('/api/foo?[Filtered]');
  });
});

describe('scrub.ts — beforeSendTransaction hook', () => {
  it('scrubs span.description', () => {
    const event = {
      type: 'transaction',
      spans: [
        {
          op: 'db.query',
          description: "SELECT * FROM users WHERE email='alice@example.com'",
          span_id: '0000000000000001',
          trace_id: '00000000000000000000000000000001',
          start_timestamp: 0,
          data: {},
        } as never,
      ],
    } as Event;
    const out = beforeSendTransaction(event);
    expect(out?.spans?.[0].description).toContain('[Filtered]');
  });

  it('scrubs span.data denylist keys', () => {
    const event = {
      type: 'transaction',
      spans: [
        {
          op: 'http.client',
          description: 'POST /api/foo',
          data: {
            'http.request.body': '{"email":"alice@example.com"}',
            authorization: 'Bearer sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz',
          },
          span_id: '0000000000000001',
          trace_id: '00000000000000000000000000000001',
          start_timestamp: 0,
        } as never,
      ],
    } as Event;
    const out = beforeSendTransaction(event);
    const data = out?.spans?.[0].data as Record<string, unknown>;
    expect(data.authorization).toBe('[Filtered]');
    expect(data['http.request.body']).toContain('[Filtered]');
  });

  it('drops healthcheck transactions defensively', () => {
    const event = {
      type: 'transaction',
      request: { url: '/api/health' },
    } as Event;
    expect(beforeSendTransaction(event)).toBeNull();
  });
});
