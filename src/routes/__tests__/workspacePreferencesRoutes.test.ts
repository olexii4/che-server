/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import Fastify, { FastifyInstance } from 'fastify';
import { registerWorkspacePreferencesRoutes } from '../workspacePreferencesRoutes';

jest.mock('../../helpers/getKubernetesClient', () => ({
  getKubeConfig: jest.fn().mockReturnValue({ makeApiClient: jest.fn() }),
}));

const mockGetWorkspacePreferences = jest.fn();
jest.mock('../../services/WorkspacePreferencesService', () => ({
  WorkspacePreferencesService: jest.fn().mockImplementation(() => ({
    getWorkspacePreferences: mockGetWorkspacePreferences,
    removeProviderFromSkipAuthorizationList: jest.fn(),
    addTrustedSource: jest.fn(),
    removeTrustedSources: jest.fn(),
  })),
}));

describe('workspacePreferencesRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    fastify.decorate('authenticate', async (request: any) => {
      request.subject = { userId: 'admin', userName: 'admin', token: 'mock-token' };
    });
    fastify.decorate('requireAuth', async () => {});
    await registerWorkspacePreferencesRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  it('GET /workspace-preferences/namespace/:namespace returns preferences', async () => {
    mockGetWorkspacePreferences.mockResolvedValue({ 'skip-authorisation': [], 'trusted-sources': [] });
    const response = await fastify.inject({ method: 'GET', url: '/workspace-preferences/namespace/admin-che' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)['skip-authorisation']).toEqual([]);
  });
});
