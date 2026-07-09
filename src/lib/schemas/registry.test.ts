import { describe, expect, it } from 'vitest';
import { generateOpenApiDocument } from './registry';

describe('generateOpenApiDocument (Story 1.5 Task 2, AC 1)', () => {
  const doc = generateOpenApiDocument();

  it('generates an OpenAPI 3.x document', () => {
    expect(doc.openapi.startsWith('3.')).toBe(true);
    expect(doc.info.title).toBe('AirManager API');
  });

  it('includes every existing endpoint', () => {
    const paths = Object.keys(doc.paths ?? {});
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/v1/health',
        '/api/v1/me',
        '/api/v1/people',
        '/api/v1/people/{id}',
        '/api/v1/people/{id}/archive',
        '/api/v1/people/{id}/unarchive',
        '/api/v1/people/{id}/profiles/pilot',
        '/api/v1/people/{id}/profiles/pilot/deactivate',
        '/api/v1/people/{id}/profiles/student',
        '/api/v1/people/{id}/profiles/student/deactivate',
        '/api/v1/people/{id}/profiles/instructor',
        '/api/v1/people/{id}/profiles/instructor/deactivate',
        '/api/v1/people/{id}/account',
        '/api/v1/people/{id}/account/top-ups',
        '/api/v1/people/{id}/account/movements',
        '/api/v1/people/{id}/account/adjustments',
        '/api/v1/people/{id}/instructor-rates',
        '/api/v1/people/{id}/packages',
        '/api/v1/accounts/negative-balances',
        '/api/v1/cash-categories',
        '/api/v1/cash-categories/{id}',
        '/api/v1/cash-categories/{id}/deactivate',
        '/api/v1/cash-categories/{id}/reactivate',
        '/api/v1/cash-movements',
        '/api/v1/cash-movements/{id}/reverse',
        '/api/v1/cash-report',
        '/api/v1/package-types',
        '/api/v1/package-types/{id}',
        '/api/v1/expiry-types',
        '/api/v1/expiry-types/{id}',
        '/api/v1/flights',
        '/api/v1/flights/{id}/cancel',
        '/api/v1/flights/{id}/correct',
        '/api/v1/aircraft',
        '/api/v1/aircraft/{id}',
        '/api/v1/aircraft/{id}/archive',
        '/api/v1/aircraft/{id}/unarchive',
        '/api/v1/aircraft/{id}/out-of-service',
        '/api/v1/aircraft/{id}/return-to-service',
        '/api/v1/aircraft/{id}/hour-meter-adjustments',
        '/api/v1/aircraft/{id}/rates',
        '/api/v1/users',
        '/api/v1/users/{id}',
        '/api/v1/users/{id}/resend-invite',
        '/api/v1/auth/set-password',
        '/api/v1/auth/forgot-password',
        '/api/v1/people/{id}/expiries',
        '/api/v1/expiries',
        '/api/v1/expiries/{id}',
        '/api/v1/expiries/{id}/proposals',
        '/api/v1/expiry-proposals',
        '/api/v1/expiry-proposals/{id}/decision',
        '/api/v1/jobs/expiry-alerts',
        '/api/v1/bookings',
        '/api/v1/bookings/calendar',
        '/api/v1/bookings/{id}',
        '/api/v1/bookings/{id}/cancel',
        '/api/v1/ppr-requests',
        '/api/v1/ppr-requests/{id}/approve',
        '/api/v1/ppr-requests/{id}/reject',
        '/api/v1/settings/ppr-operating-instructions',
      ]),
    );
  });

  it('documents a cookie-based session security scheme', () => {
    const securitySchemes = doc.components?.securitySchemes as Record<string, { type: string; in?: string }> | undefined;
    expect(securitySchemes?.['cookieAuth']).toMatchObject({ type: 'apiKey', in: 'cookie' });
  });

  it('documents a bearer security scheme for the jobs route (story 6.3, AD-9)', () => {
    const securitySchemes = doc.components?.securitySchemes as Record<string, { type: string; scheme?: string }> | undefined;
    expect(securitySchemes?.['bearerAuth']).toMatchObject({ type: 'http', scheme: 'bearer' });
  });

  it('documents only 401/500 error responses on the jobs route (no session, no RBAC 403)', () => {
    const jobRoute = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>)[
      '/api/v1/jobs/expiry-alerts'
    ]?.['post'];
    expect(Object.keys(jobRoute?.responses ?? {}).sort()).toEqual(['200', '401', '500']);
  });

  it('documents 401/403/404/409/422/500 error responses on the protected users list endpoint', () => {
    const listUsers = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>)['/api/v1/users']?.[
      'get'
    ];
    expect(Object.keys(listUsers?.responses ?? {}).sort()).toEqual(['200', '401', '403', '422', '500']);
  });

  it('documents 401/403/422/500 error responses on the expiry dashboard endpoint (story 6.4)', () => {
    const listExpiries = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>)['/api/v1/expiries']?.[
      'get'
    ];
    expect(Object.keys(listExpiries?.responses ?? {}).sort()).toEqual(['200', '401', '403', '422', '500']);
  });

  it('documents 401/403/404/409/422/500 error responses on the booking creation endpoint (story 7.1, AC 1/2/3)', () => {
    const createBooking = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>)['/api/v1/bookings']?.[
      'post'
    ];
    expect(Object.keys(createBooking?.responses ?? {}).sort()).toEqual(['201', '401', '403', '404', '409', '422', '500']);
  });

  it('documents the CreateBookingResponse envelope { booking, warnings } on the 201 (story 7.4, AC 1/2)', () => {
    const schemas = doc.components?.schemas as Record<string, { properties?: Record<string, unknown> }> | undefined;
    const createBookingResponse = schemas?.['CreateBookingResponse'];
    expect(createBookingResponse?.properties).toHaveProperty('booking');
    expect(createBookingResponse?.properties).toHaveProperty('warnings');
  });

  it('documents blocksBooking on the ExpiryType schema (story 7.4)', () => {
    const schemas = doc.components?.schemas as Record<string, { properties?: Record<string, unknown> }> | undefined;
    expect(schemas?.['ExpiryType']?.properties).toHaveProperty('blocksBooking');
    expect(schemas?.['CreateExpiryTypeRequest']?.properties).toHaveProperty('blocksBooking');
    expect(schemas?.['UpdateExpiryTypeRequest']?.properties).toHaveProperty('blocksBooking');
  });

  it('documents 401/403/422/500 error responses on the booking calendar endpoint (story 7.2, AC 1)', () => {
    const calendarBookings = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>)[
      '/api/v1/bookings/calendar'
    ]?.['get'];
    expect(Object.keys(calendarBookings?.responses ?? {}).sort()).toEqual(['200', '401', '403', '422', '500']);
  });

  it('documents 401/403/404/409/422/500 error responses on the booking edit endpoint (story 7.3, AC 1/2)', () => {
    const updateBooking = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>)[
      '/api/v1/bookings/{id}'
    ]?.['patch'];
    expect(Object.keys(updateBooking?.responses ?? {}).sort()).toEqual(['200', '401', '403', '404', '409', '422', '500']);
  });

  it('documents 401/403/404/409/422/500 error responses on the booking cancel endpoint (story 7.3, AC 1/2)', () => {
    const cancelBooking = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>)[
      '/api/v1/bookings/{id}/cancel'
    ]?.['post'];
    expect(Object.keys(cancelBooking?.responses ?? {}).sort()).toEqual(['200', '401', '403', '404', '409', '422', '500']);
  });

  it('documents 201/422/429/500 responses and NO security requirement on the public PPR endpoint (story 8.1, AC 1/2)', () => {
    const createPprRequest = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown>; security?: unknown[] }>>)[
      '/api/v1/ppr-requests'
    ]?.['post'];
    expect(Object.keys(createPprRequest?.responses ?? {}).sort()).toEqual(['201', '422', '429', '500']);
    expect(createPprRequest?.security).toEqual([]);
  });

  it('documents the CreatePprRequestRequest/PprRequestCreatedResponse schemas including the honeypot field (story 8.1, AC 2)', () => {
    const schemas = doc.components?.schemas as Record<string, { properties?: Record<string, unknown> }> | undefined;
    expect(schemas?.['CreatePprRequestRequest']?.properties).toHaveProperty('website');
    expect(schemas?.['CreatePprRequestRequest']?.properties).toHaveProperty('locale');
    expect(schemas?.['PprRequestCreatedResponse']?.properties).toHaveProperty('status');
  });

  describe('PPR staff approval queue (story 8.2, AC 1/2)', () => {
    it('documents 200/401/403/422/500 on the GET list endpoint, WITH a cookieAuth security requirement (unlike the public POST)', () => {
      const listPprRequests = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown>; security?: unknown[] }>>)[
        '/api/v1/ppr-requests'
      ]?.['get'];
      expect(Object.keys(listPprRequests?.responses ?? {}).sort()).toEqual(['200', '401', '403', '422', '500']);
      expect(listPprRequests?.security).toEqual([{ cookieAuth: [] }]);
    });

    it('documents 200/401/403/404/409/500 on the approve endpoint and references the IdempotencyKey header', () => {
      const approve = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown>; parameters?: Array<{ $ref?: string }> }>>)[
        '/api/v1/ppr-requests/{id}/approve'
      ]?.['post'];
      expect(Object.keys(approve?.responses ?? {}).sort()).toEqual(['200', '401', '403', '404', '409', '500']);
      const refs = (approve?.parameters ?? []).map((param) => param.$ref);
      expect(refs).toContain('#/components/parameters/IdempotencyKey');
    });

    it('documents 200/401/403/404/409/422/500 on the reject endpoint and references the IdempotencyKey header', () => {
      const reject = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown>; parameters?: Array<{ $ref?: string }> }>>)[
        '/api/v1/ppr-requests/{id}/reject'
      ]?.['post'];
      expect(Object.keys(reject?.responses ?? {}).sort()).toEqual(['200', '401', '403', '404', '409', '422', '500']);
      const refs = (reject?.parameters ?? []).map((param) => param.$ref);
      expect(refs).toContain('#/components/parameters/IdempotencyKey');
    });

    it('documents the PprRequest schema with pprNumber/rejectionReason, never submitterIp', () => {
      const schemas = doc.components?.schemas as Record<string, { properties?: Record<string, unknown> }> | undefined;
      const pprRequest = schemas?.['PprRequest'];
      expect(pprRequest?.properties).toHaveProperty('pprNumber');
      expect(pprRequest?.properties).toHaveProperty('rejectionReason');
      expect(pprRequest?.properties).not.toHaveProperty('submitterIp');
    });

    it('documents 200/401/403/500 GET and 200/401/403/422/500 PUT on the operating-instructions settings endpoint', () => {
      const paths = doc.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>;
      const get = paths['/api/v1/settings/ppr-operating-instructions']?.['get'];
      const put = paths['/api/v1/settings/ppr-operating-instructions']?.['put'];
      expect(Object.keys(get?.responses ?? {}).sort()).toEqual(['200', '401', '403', '500']);
      expect(Object.keys(put?.responses ?? {}).sort()).toEqual(['200', '401', '403', '422', '500']);
    });

    it('documents the PprOperatingInstructions schema with it/en', () => {
      const schemas = doc.components?.schemas as Record<string, { properties?: Record<string, unknown> }> | undefined;
      expect(schemas?.['PprOperatingInstructions']?.properties).toHaveProperty('it');
      expect(schemas?.['PprOperatingInstructions']?.properties).toHaveProperty('en');
    });
  });

  it('produces valid JSON (round-trips through JSON.stringify/parse)', () => {
    expect(() => JSON.parse(JSON.stringify(doc))).not.toThrow();
  });

  describe('Idempotency-Key header (story TD-2, AC 7)', () => {
    it('registers a reusable IdempotencyKey header component', () => {
      const parameters = doc.components?.parameters as Record<string, { name?: string; in?: string }> | undefined;
      expect(parameters?.['IdempotencyKey']).toMatchObject({ name: 'Idempotency-Key', in: 'header' });
    });

    it.each([
      ['/api/v1/people/{id}/account/top-ups', 'post'],
      ['/api/v1/people/{id}/account/adjustments', 'post'],
      ['/api/v1/people/{id}/packages', 'post'],
      ['/api/v1/flights', 'post'],
      ['/api/v1/cash-movements', 'post'],
    ] as const)('references the IdempotencyKey header on %s', (path, method) => {
      const route = (doc.paths as Record<string, Record<string, { parameters?: Array<{ $ref?: string }> }>>)[path]?.[method];
      const refs = (route?.parameters ?? []).map((param) => param.$ref);
      expect(refs).toContain('#/components/parameters/IdempotencyKey');
    });

    it.each([
      ['/api/v1/flights/{id}/cancel', 'post'],
      ['/api/v1/flights/{id}/correct', 'post'],
      ['/api/v1/cash-movements/{id}/reverse', 'post'],
    ] as const)('does NOT reference it on the already-idempotent storno/correction endpoint %s (reversalOfId covers it)', (path, method) => {
      const route = (doc.paths as Record<string, Record<string, { parameters?: Array<{ $ref?: string }> }>>)[path]?.[method];
      const refs = (route?.parameters ?? []).map((param) => param.$ref);
      expect(refs).not.toContain('#/components/parameters/IdempotencyKey');
    });
  });
});
