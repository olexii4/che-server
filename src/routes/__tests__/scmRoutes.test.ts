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
 * Tests for SCM routes (Fastify)
 *
 * Based on: ScmService (Java)
 */

// Mock axios instances from getCertificateAuthority BEFORE imports
jest.mock('../../helpers/getCertificateAuthority', () => ({
  axiosInstanceNoCert: {
    get: jest.fn(),
  },
  axiosInstance: {
    get: jest.fn(),
  },
}));

import Fastify, { FastifyInstance } from 'fastify';
import { registerScmRoutes } from '../scmRoutes';
import { authenticate, requireAuth } from '../../middleware/auth';
import { axiosInstanceNoCert } from '../../helpers/getCertificateAuthority';

describe('SCM Routes (Fastify)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify();

    // Register authentication hooks
    app.decorate('authenticate', authenticate);
    app.decorate('requireAuth', requireAuth);

    // Register routes
    await registerScmRoutes(app);

    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /scm/resolve', () => {
    it('should return 400 when repository is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scm/resolve?file=devfile.yaml',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('repository');
    });

    it('should return 400 when file is missing', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scm/resolve?repository=https://github.com/user/repo',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('file');
    });

    it('should return 401 without authentication', async () => {
      // Mock axios to return 404, which should trigger UnauthorizedException when no auth provided
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/scm/resolve?repository=https://github.com/user/repo&file=devfile.yaml',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should resolve file from valid URL with authentication', async () => {
      // Mock axios for testing
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValue({
        status: 200,
        data: 'file content here',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/scm/resolve?repository=https://github.com/eclipse-che/che-server&file=devfile.yaml',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('file content here');
      expect(response.headers['content-disposition']).toContain('attachment');
    });

    it('should return 404 when file not found with authorization', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
      });

      const response = await app.inject({
        method: 'GET',
        url: '/scm/resolve?repository=https://github.com/user/repo&file=non-existent.yaml',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.message).toContain('not found');
    });

    it('should handle network errors gracefully', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockRejectedValue(new Error('Network error'));

      const response = await app.inject({
        method: 'GET',
        url: '/scm/resolve?repository=https://github.com/user/repo&file=devfile.yaml',
        headers: {
          Authorization: 'Bearer user123:johndoe',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
    });
  });
});
