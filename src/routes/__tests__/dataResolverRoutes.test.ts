/**
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import Fastify, { FastifyInstance } from 'fastify';
import { registerDataResolverRoutes } from '../dataResolverRoutes';
import { axiosInstanceNoCert, axiosInstance } from '../../helpers/getCertificateAuthority';

// Mock axios instances
jest.mock('../../helpers/getCertificateAuthority');

describe('Data Resolver Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    // Register routes with /api prefix to match production setup
    await app.register(
      async instance => {
        await registerDataResolverRoutes(instance);
      },
      { prefix: '/api' },
    );
    await app.ready();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /api/data/resolver', () => {
    it('should fetch data from external URL successfully', async () => {
      const mockData = 'schemaVersion: 2.1.0\nmetadata:\n  name: test';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: mockData,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/data/resolver',
        payload: {
          url: 'https://raw.githubusercontent.com/test/repo/main/devfile.yaml',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(mockData);
      expect(axiosInstanceNoCert.get).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/test/repo/main/devfile.yaml',
        expect.objectContaining({
          headers: expect.any(Object),
        }),
      );
    });

    it('should fallback to axiosInstance on certificate error', async () => {
      const mockData = 'test data';

      // First call fails with non-404 error
      (axiosInstanceNoCert.get as jest.Mock).mockRejectedValueOnce({
        code: 'CERT_ERROR',
        message: 'Certificate validation failed',
      });

      // Second call with cert validation succeeds
      (axiosInstance.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: mockData,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/data/resolver',
        payload: {
          url: 'https://example.com/data.yaml',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(mockData);
      expect(axiosInstanceNoCert.get).toHaveBeenCalledTimes(1);
      expect(axiosInstance.get).toHaveBeenCalledTimes(1);
    });

    it('should return 404 when resource not found', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockRejectedValueOnce({
        response: {
          status: 404,
          statusText: 'Not Found',
          data: 'Not Found',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/data/resolver',
        payload: {
          url: 'https://example.com/notfound.yaml',
        },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });

    it('should return error status from external server', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockRejectedValueOnce({
        response: {
          status: 500,
          statusText: 'Internal Server Error',
          data: { message: 'Server error' },
        },
        message: 'Request failed',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/data/resolver',
        payload: {
          url: 'https://example.com/error.yaml',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      (axiosInstanceNoCert.get as jest.Mock).mockRejectedValueOnce(networkError);

      const response = await app.inject({
        method: 'POST',
        url: '/api/data/resolver',
        payload: {
          url: 'https://example.com/data.yaml',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('message');
      expect(body.message).toContain('Failed to fetch data from URL');
    });

    it('should return 400 for invalid request without URL', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/data/resolver',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
