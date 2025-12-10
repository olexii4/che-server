/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import Fastify, { FastifyInstance } from 'fastify';
import { registerSshKeysRoutes } from '../sshKeysRoutes';

jest.mock('../../helpers/getKubernetesClient', () => ({
  getKubeConfig: jest.fn().mockReturnValue({ makeApiClient: jest.fn() }),
}));

const mockList = jest.fn();
jest.mock('../../services/SSHKeysService', () => ({
  SSHKeysService: jest.fn().mockImplementation(() => ({
    list: mockList,
    add: jest.fn(),
    delete: jest.fn(),
  })),
}));

describe('sshKeysRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    fastify.decorate('authenticate', async (request: any) => {
      request.subject = { userId: 'admin', userName: 'admin', token: 'mock-token' };
    });
    fastify.decorate('requireAuth', async () => {});
    await registerSshKeysRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  it('GET /namespace/:namespace/ssh-key returns SSH keys', async () => {
    mockList.mockResolvedValue([{ name: 'my-key', keyPub: 'ssh-rsa AAAA...' }]);
    const response = await fastify.inject({ method: 'GET', url: '/namespace/admin-che/ssh-key' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toHaveLength(1);
  });
});
