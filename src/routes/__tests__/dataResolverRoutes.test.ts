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
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

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
      mockedAxios.get.mockResolvedValueOnce({
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
      expect(JSON.parse(response.body)).toBe(mockData);
    });

    it('should return data even when upstream returns 404 (proxy behavior)', async () => {
      // The route returns 200 for all upstream responses < 500
      // This is correct CORS proxy behavior - dashboard handles the response
      mockedAxios.get.mockResolvedValueOnce({
        status: 404,
        data: { error: 'Not Found' },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/data/resolver',
        payload: {
          url: 'https://example.com/notfound.yaml',
        },
      });

      // Proxy returns 200 even for 404 upstream - dashboard handles the response
      expect(response.statusCode).toBe(200);
    });

    it('should return 503 for network connection errors', async () => {
      const networkError = new Error('Connection refused');
      (networkError as any).code = 'ECONNREFUSED';
      mockedAxios.get.mockRejectedValueOnce(networkError);

      const response = await app.inject({
        method: 'POST',
        url: '/api/data/resolver',
        payload: {
          url: 'https://unreachable.com/data.yaml',
        },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Service Unavailable');
    });

    it('should return 500 for upstream 5xx errors (thrown as exceptions)', async () => {
      // When validateStatus rejects, axios throws an error
      const serverError = new Error('Request failed with status code 500');
      (serverError as any).response = { status: 500 };
      mockedAxios.get.mockRejectedValueOnce(serverError);

      const response = await app.inject({
        method: 'POST',
        url: '/api/data/resolver',
        payload: {
          url: 'https://example.com/error.yaml',
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Internal Server Error');
    });

    it('should return 400 for invalid request without URL', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/data/resolver',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Timeout');
      (timeoutError as any).code = 'ETIMEDOUT';
      mockedAxios.get.mockRejectedValueOnce(timeoutError);

      const response = await app.inject({
        method: 'POST',
        url: '/api/data/resolver',
        payload: {
          url: 'https://slow.com/data.yaml',
        },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Service Unavailable');
    });

    it('should handle DNS resolution errors', async () => {
      const dnsError = new Error('getaddrinfo ENOTFOUND');
      (dnsError as any).code = 'ENOTFOUND';
      mockedAxios.get.mockRejectedValueOnce(dnsError);

      const response = await app.inject({
        method: 'POST',
        url: '/api/data/resolver',
        payload: {
          url: 'https://nonexistent.invalid/data.yaml',
        },
      });

      expect(response.statusCode).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Service Unavailable');
    });
  });
});
