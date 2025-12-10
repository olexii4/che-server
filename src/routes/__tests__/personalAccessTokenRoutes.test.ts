/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import Fastify, { FastifyInstance } from 'fastify';
import { registerPersonalAccessTokenRoutes } from '../personalAccessTokenRoutes';

jest.mock('../../helpers/getKubernetesClient', () => ({
  getKubeConfig: jest.fn().mockReturnValue({ makeApiClient: jest.fn() }),
}));

const mockListTokens = jest.fn();
jest.mock('../../services/PersonalAccessTokenService', () => ({
  PersonalAccessTokenService: jest.fn().mockImplementation(() => ({
    listPersonalAccessTokens: mockListTokens,
    addPersonalAccessToken: jest.fn(),
    updatePersonalAccessToken: jest.fn(),
    deletePersonalAccessToken: jest.fn(),
  })),
}));

describe('personalAccessTokenRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    fastify.decorate('authenticate', async (request: any) => {
      request.subject = { userId: 'admin', userName: 'admin', token: 'mock-token' };
    });
    fastify.decorate('requireAuth', async () => {});
    await registerPersonalAccessTokenRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  it('GET /namespace/:namespace/personal-access-token returns tokens', async () => {
    mockListTokens.mockResolvedValue([{ tokenName: 'github-token', cheUserId: 'admin' }]);
    const response = await fastify.inject({ method: 'GET', url: '/namespace/admin-che/personal-access-token' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toHaveLength(1);
  });
});
