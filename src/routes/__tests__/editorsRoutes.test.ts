/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import Fastify, { FastifyInstance } from 'fastify';
import { registerEditorsRoutes } from '../editorsRoutes';

jest.mock('../../helpers/getServiceAccountToken', () => ({
  getServiceAccountToken: jest.fn().mockReturnValue('mock-token'),
}));

jest.mock('../../helpers/getKubernetesClient', () => ({
  getKubeConfig: jest.fn().mockReturnValue({ makeApiClient: jest.fn() }),
}));

const mockList = jest.fn();
const mockGet = jest.fn();
jest.mock('../../services/EditorService', () => ({
  EditorService: jest.fn().mockImplementation(() => ({
    list: mockList,
    get: mockGet,
  })),
}));

describe('editorsRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    await registerEditorsRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  it('GET /editors returns list of editors', async () => {
    mockList.mockResolvedValue([{ id: 'che-code', name: 'VS Code' }]);
    const response = await fastify.inject({ method: 'GET', url: '/editors' });
    expect(response.statusCode).toBe(200);
  });
});
