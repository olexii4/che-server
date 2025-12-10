/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import Fastify, { FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { registerWebSocketRoutes } from '../websocketRoutes';

jest.mock('../../services/WebSocketManager', () => ({
  WebSocketManager: jest.fn().mockImplementation(() => ({
    handleMessage: jest.fn(),
    handleDisconnect: jest.fn(),
  })),
}));

describe('websocketRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    fastify = Fastify();
    await fastify.register(fastifyWebsocket);
    await registerWebSocketRoutes(fastify);
    await fastify.ready();
  });

  afterEach(async () => { await fastify.close(); });

  it('should register websocket route at /websocket', () => {
    // Verify the route is registered by checking if it exists in the routes output
    const routes = fastify.printRoutes();
    expect(routes).toContain('websocket');
  });
});
