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

  afterEach(async () => { await fastify.close(); });

  it('GET /system/state returns RUNNING status', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/system/state' });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('RUNNING');
  });
});
