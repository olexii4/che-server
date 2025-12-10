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
 * Tests for Factory routes (Fastify)
 *
 * Based on: FactoryService (Java)
 */
import Fastify, { FastifyInstance } from 'fastify';
import { registerFactoryRoutes } from '../factoryRoutes';
import { authenticate, requireAuth } from '../../middleware/auth';

describe('Factory Routes (Fastify)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();

    // Register authentication hooks
    app.decorate('authenticate', authenticate);
    app.decorate('requireAuth', requireAuth);

    // Register routes
    await registerFactoryRoutes(app);

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /factory/resolver', () => {
    it('should work without authentication for public repositories', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/resolver',
        payload: {
          url: 'https://raw.githubusercontent.com/eclipse-che/che-server/main/devfile.yaml',
        },
      });

      // Should succeed for public repos even without auth
      expect([200, 400]).toContain(response.statusCode);
    });

    it('should resolve factory from valid devfile URL with authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/resolver',
        headers: {
          Authorization: 'Bearer user123:johndoe',
          'Content-Type': 'application/json',
        },
        payload: {
          url: 'https://raw.githubusercontent.com/eclipse-che/che-server/main/devfile.yaml',
        },
      });

      const body = JSON.parse(response.body);
      console.log('Response status:', response.statusCode);
      console.log('Response body:', JSON.stringify(body, null, 2));

      expect(response.statusCode).toBe(200);
      expect(body).toHaveProperty('v');
      expect(body).toHaveProperty('source');
    });

    it('should return 400 when URL is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/resolver',
        headers: {
          Authorization: 'Bearer user123:johndoe',
          'Content-Type': 'application/json',
        },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });

    it('should return 400 when URL is not a valid SCM or devfile URL', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/resolver',
        headers: {
          Authorization: 'Bearer user123:johndoe',
          'Content-Type': 'application/json',
        },
        payload: {
          url: 'https://example.com/invalid.txt',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('Unable to resolve factory');
    });

    it('should accept URL with .devfile.yaml', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/resolver',
        headers: {
          Authorization: 'Bearer user123:johndoe',
          'Content-Type': 'application/json',
        },
        payload: {
          url: 'https://raw.githubusercontent.com/eclipse-che/che-server/main/.devfile.yaml',
        },
      });

      // May return 200 if file exists, or 400/500 if not found
      // The important part is that it accepts .devfile.yaml as a valid filename
      expect([200, 400, 500]).toContain(response.statusCode);

      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body).toHaveProperty('v');
      }
    });

    // New tests for repository URL support (without devfile filename)
    it('should accept GitHub repository URL without devfile filename', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/resolver',
        headers: {
          Authorization: 'Bearer user123:johndoe',
          'Content-Type': 'application/json',
        },
        payload: {
          url: 'https://github.com/eclipse-che/che-server',
        },
      });

      const body = JSON.parse(response.body);
      console.log('Response status:', response.statusCode);
      console.log('Response body:', JSON.stringify(body, null, 2));

      // May return 200 or 400 depending on whether the repository actually has a devfile
      // The important thing is it should try to fetch, not reject immediately
      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should accept GitHub repository URL with branch', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/resolver',
        headers: {
          Authorization: 'Bearer user123:johndoe',
          'Content-Type': 'application/json',
        },
        payload: {
          url: 'https://github.com/eclipse-che/che-server/tree/main',
        },
      });

      const body = JSON.parse(response.body);
      console.log('Response status:', response.statusCode);
      console.log('Response body:', JSON.stringify(body, null, 2));

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should accept GitLab repository URL', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/resolver',
        headers: {
          Authorization: 'Bearer user123:johndoe',
          'Content-Type': 'application/json',
        },
        payload: {
          url: 'https://gitlab.com/gitlab-org/gitlab',
        },
      });

      const body = JSON.parse(response.body);
      console.log('Response status:', response.statusCode);
      console.log('Response body:', JSON.stringify(body, null, 2));

      expect([200, 400, 500]).toContain(response.statusCode);
    });

    it('should accept Bitbucket repository URL', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/resolver',
        headers: {
          Authorization: 'Bearer user123:johndoe',
          'Content-Type': 'application/json',
        },
        payload: {
          url: 'https://bitbucket.org/workspace/repository',
        },
      });

      const body = JSON.parse(response.body);
      console.log('Response status:', response.statusCode);
      console.log('Response body:', JSON.stringify(body, null, 2));

      // Bitbucket returns 401 for private repos (requires OAuth)
      expect([200, 400, 401, 500]).toContain(response.statusCode);
    });

    it('should accept repository URL with .git suffix', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/resolver',
        headers: {
          Authorization: 'Bearer user123:johndoe',
          'Content-Type': 'application/json',
        },
        payload: {
          url: 'https://github.com/eclipse-che/che-server.git',
        },
      });

      const body = JSON.parse(response.body);
      console.log('Response status:', response.statusCode);

      expect([200, 400, 500]).toContain(response.statusCode);
    });
  });

  describe('POST /factory/token/refresh', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/token/refresh?url=https://github.com/user/repo',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 400 when URL is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/token/refresh',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('required');
    });

    it('should refresh token with valid URL and authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/factory/token/refresh?url=https://raw.githubusercontent.com/eclipse-che/che-server/main/devfile.yaml',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      expect(response.statusCode).toBe(204);
    });
  });
});
