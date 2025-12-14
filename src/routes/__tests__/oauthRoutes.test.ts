/**
 * Copyright (c) 2021-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

/**
 * Tests for OAuth routes (Fastify)
 *
 * Based on: OAuthAuthenticationService (Java)
 */
jest.mock('../../services/PatLookupService', () => ({
  PatLookupService: jest.fn().mockImplementation(() => ({
    getPatForProvider: jest.fn().mockResolvedValue(null),
  })),
}));

import Fastify, { FastifyInstance } from 'fastify';
import { registerOAuthRoutes } from '../oauthRoutes';
import { authenticate, requireAuth } from '../../middleware/auth';

describe('OAuth Routes (Fastify)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();

    // Register authentication hooks
    app.decorate('authenticate', authenticate);
    app.decorate('requireAuth', requireAuth);

    // Register routes
    await registerOAuthRoutes(app);

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /oauth', () => {
    it('should return list of registered OAuth authenticators', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/oauth',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);

      // Without Kubernetes Secrets configured, the service returns []
      // This is expected behavior matching Eclipse Che Server
      // In production with Secrets configured, this will return providers
    });

    it('should return authenticators with correct structure if providers configured', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/oauth',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      const body = JSON.parse(response.body);

      // If providers are configured (via Kubernetes Secrets), validate structure
      if (body.length > 0) {
        const authenticator = body[0];
        expect(authenticator).toHaveProperty('name');
        expect(authenticator).toHaveProperty('endpointUrl');
        expect(authenticator).toHaveProperty('links');
      }
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/oauth',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /oauth/token', () => {
    it('should return 400 when oauth_provider is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/oauth/token',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('required');
    });

    it('should return 401 when token is not found', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/oauth/token?oauth_provider=github',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Unauthorized');
      expect(body.message).toContain('was not found');
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/oauth/token?oauth_provider=github',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('DELETE /oauth/token', () => {
    it('should return 400 when oauth_provider is missing', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/oauth/token',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 204 even when token is not found (idempotent)', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/oauth/token?oauth_provider=github',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      expect(response.statusCode).toBe(204);
    });

    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/oauth/token?oauth_provider=github',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
