/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import Fastify, { FastifyInstance } from 'fastify';
import { registerKubeConfigRoutes } from '../kubeConfigRoutes';

jest.mock('../../helpers/getKubernetesClient', () => ({
  getKubeConfig: jest.fn().mockReturnValue({ makeApiClient: jest.fn() }),
}));

const mockInjectKubeConfig = jest.fn();
jest.mock('../../services/KubeConfigService', () => ({
  KubeConfigService: jest.fn().mockImplementation(() => ({
    injectKubeConfig: mockInjectKubeConfig,
  })),
}));

describe('kubeConfigRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    fastify.decorate('authenticate', async (request: any) => {
      request.subject = { userId: 'admin', userName: 'admin', token: 'mock-token' };
    });
    fastify.decorate('requireAuth', async () => {});
    await registerKubeConfigRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  it('POST /namespace/:namespace/devworkspaceId/:devworkspaceId/kubeconfig injects kubeconfig', async () => {
    mockInjectKubeConfig.mockResolvedValue(undefined);
    const response = await fastify.inject({
      method: 'POST',
      url: '/namespace/admin-che/devworkspaceId/workspace123/kubeconfig',
    });
    expect(response.statusCode).toBe(204);
    expect(mockInjectKubeConfig).toHaveBeenCalledWith('admin-che', 'workspace123');
  });

  it('returns 404 when devworkspace not found', async () => {
    mockInjectKubeConfig.mockRejectedValue(new Error('Could not find requested devworkspace'));
    const response = await fastify.inject({
      method: 'POST',
      url: '/namespace/admin-che/devworkspaceId/notfound/kubeconfig',
    });
    expect(response.statusCode).toBe(404);
  });
});
