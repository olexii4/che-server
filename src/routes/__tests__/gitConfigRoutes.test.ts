/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import Fastify, { FastifyInstance } from 'fastify';
import { registerGitConfigRoutes } from '../gitConfigRoutes';

jest.mock('../../helpers/getKubernetesClient', () => ({
  getKubeConfig: jest.fn().mockReturnValue({ makeApiClient: jest.fn() }),
}));

const mockRead = jest.fn();
const mockPatch = jest.fn();
jest.mock('../../services/GitConfigService', () => ({
  GitConfigService: jest.fn().mockImplementation(() => ({
    read: mockRead,
    patch: mockPatch,
  })),
}));

describe('gitConfigRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    fastify.decorate('authenticate', async (request: any) => {
      request.subject = { userId: 'admin', userName: 'admin', token: 'mock-token' };
    });
    fastify.decorate('requireAuth', async () => {});
    await registerGitConfigRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  it('GET /namespace/:namespace/gitconfig returns git config', async () => {
    mockRead.mockResolvedValue({ user: { name: 'admin', email: 'admin@test.com' } });
    const response = await fastify.inject({ method: 'GET', url: '/namespace/admin-che/gitconfig' });
    expect(response.statusCode).toBe(200);
  });
});
