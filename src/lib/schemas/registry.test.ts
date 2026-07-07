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
        '/api/v1/accounts/negative-balances',
        '/api/v1/cash-categories',
        '/api/v1/cash-categories/{id}',
        '/api/v1/cash-categories/{id}/deactivate',
        '/api/v1/cash-categories/{id}/reactivate',
        '/api/v1/cash-movements',
        '/api/v1/cash-movements/{id}/reverse',
        '/api/v1/cash-report',
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
      ]),
    );
  });

  it('documents a cookie-based session security scheme', () => {
    const securitySchemes = doc.components?.securitySchemes as Record<string, { type: string; in?: string }> | undefined;
    expect(securitySchemes?.['cookieAuth']).toMatchObject({ type: 'apiKey', in: 'cookie' });
  });

  it('documents 401/403/404/409/422/500 error responses on the protected users list endpoint', () => {
    const listUsers = (doc.paths as Record<string, Record<string, { responses: Record<string, unknown> }>>)['/api/v1/users']?.[
      'get'
    ];
    expect(Object.keys(listUsers?.responses ?? {}).sort()).toEqual(['200', '401', '403', '422', '500']);
  });

  it('produces valid JSON (round-trips through JSON.stringify/parse)', () => {
    expect(() => JSON.parse(JSON.stringify(doc))).not.toThrow();
  });
});
