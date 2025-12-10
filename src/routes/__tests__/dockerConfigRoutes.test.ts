/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import Fastify, { FastifyInstance } from 'fastify';
import { registerDockerConfigRoutes } from '../dockerConfigRoutes';

jest.mock('../../helpers/getKubernetesClient', () => ({
  getKubeConfig: jest.fn().mockReturnValue({ makeApiClient: jest.fn() }),
}));

const mockRead = jest.fn();
jest.mock('../../services/DockerConfigService', () => ({
  DockerConfigService: jest.fn().mockImplementation(() => ({
    read: mockRead,
    update: jest.fn(),
  })),
}));

describe('dockerConfigRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    fastify.decorate('authenticate', async (request: any) => {
      request.subject = { userId: 'admin', userName: 'admin', token: 'mock-token' };
    });
    fastify.decorate('requireAuth', async () => {});
    await registerDockerConfigRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  it('GET /namespace/:namespace/dockerconfig returns docker config', async () => {
    mockRead.mockResolvedValue('{}');
    const response = await fastify.inject({ method: 'GET', url: '/namespace/admin-che/dockerconfig' });
    expect(response.statusCode).toBe(200);
  });
});
