/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import Fastify, { FastifyInstance } from 'fastify';
import { registerSystemRoutes } from '../systemRoutes';

describe('systemRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    await registerSystemRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('GET /system/state returns RUNNING status', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/system/state' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('RUNNING');
  });

  it('POST /system/stop transitions state and returns 204', async () => {
    const stopResp = await fastify.inject({ method: 'POST', url: '/system/stop' });
    expect(stopResp.statusCode).toBe(204);

    const stateResp = await fastify.inject({ method: 'GET', url: '/system/state' });
    expect(stateResp.statusCode).toBe(200);
    const body = JSON.parse(stateResp.body);
    expect(['PREPARING_TO_SHUTDOWN', 'READY_TO_SHUTDOWN']).toContain(body.status);
  });

  it('POST /system/stop returns 409 on second call', async () => {
    const first = await fastify.inject({ method: 'POST', url: '/system/stop' });
    expect(first.statusCode).toBe(204);

    const second = await fastify.inject({ method: 'POST', url: '/system/stop' });
    expect(second.statusCode).toBe(409);
  });
});
