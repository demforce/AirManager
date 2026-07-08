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

  it('documents 401/403/422/500 error responses on the booking calendar endpoint (story 7.2, AC 1)', () => {
    const calendarBookings = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>)[
      '/api/v1/bookings/calendar'
    ]?.['get'];
    expect(Object.keys(calendarBookings?.responses ?? {}).sort()).toEqual(['200', '401', '403', '422', '500']);
  });

  it('produces valid JSON (round-trips through JSON.stringify/parse)', () => {
    expect(() => JSON.parse(JSON.stringify(doc))).not.toThrow();
  });
});
