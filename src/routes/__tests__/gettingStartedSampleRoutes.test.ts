/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import Fastify, { FastifyInstance } from 'fastify';
import { registerGettingStartedSampleRoutes } from '../gettingStartedSampleRoutes';

jest.mock('../../helpers/getServiceAccountToken', () => ({
  getServiceAccountToken: jest.fn().mockReturnValue('mock-token'),
}));

jest.mock('../../helpers/getKubernetesClient', () => ({
  getKubeConfig: jest.fn().mockReturnValue({ makeApiClient: jest.fn() }),
}));

const mockList = jest.fn();
jest.mock('../../services/GettingStartedSamplesService', () => ({
  GettingStartedSamplesService: jest.fn().mockImplementation(() => ({
    list: mockList,
  })),
}));

describe('gettingStartedSampleRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    await registerGettingStartedSampleRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  it('GET /getting-started-sample returns samples', async () => {
    mockList.mockResolvedValue([
      { displayName: 'Python', description: 'Python sample', tags: ['python'], url: 'https://github.com/sample/python' },
    ]);
    const response = await fastify.inject({ method: 'GET', url: '/getting-started-sample' });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toHaveLength(1);
  });

  it('GET /getting-started-sample returns empty array on error', async () => {
    mockList.mockRejectedValue(new Error('Service error'));
    const response = await fastify.inject({ method: 'GET', url: '/getting-started-sample' });
    expect(response.statusCode).toBe(500);
  });
});
