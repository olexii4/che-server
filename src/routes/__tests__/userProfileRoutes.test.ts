/*
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

import { registerUserProfileRoutes } from '../userProfileRoutes';

// Mock the helpers
jest.mock('../../helpers/getKubernetesClient', () => ({
  getKubeConfig: jest.fn().mockReturnValue({
    makeApiClient: jest.fn(),
  }),
}));

jest.mock('../../helpers/getServiceAccountToken', () => ({
  getServiceAccountToken: jest.fn().mockReturnValue('mock-service-account-token'),
}));

// Mock UserProfileService
jest.mock('../../services/UserProfileService', () => ({
  UserProfileService: jest.fn().mockImplementation(() => ({
    getUserProfile: jest.fn().mockResolvedValue({
      id: 'd4810a4f-169f-4da5-a8e0-d8dff7ecf959',
      username: 'admin',
      email: 'admin@example.com',
    }),
  })),
}));

describe('userProfileRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();

    // Add mock authentication decorators
    fastify.decorate('authenticate', async (request: any) => {
      request.subject = {
        userId: 'admin',
        userName: 'admin',
        token: 'mock-token',
      };
    });
    fastify.decorate('requireAuth', async () => {});

    await registerUserProfileRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('GET /user/id', () => {
    it('should return user ID', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/user/id',
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe('d4810a4f-169f-4da5-a8e0-d8dff7ecf959');
    });
  });

  describe('GET /userprofile/:namespace', () => {
    it('should return user profile for namespace', async () => {
      const response = await fastify.inject({
        method: 'GET',
        url: '/userprofile/admin-che',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        username: 'admin',
        email: 'admin@example.com',
      });
    });
  });
});

