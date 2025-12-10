/*
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { FastifyInstance } from 'fastify';
import { WebSocket } from '@fastify/websocket';

import { logger } from '../utils/logger';
import { WebSocketManager } from '../services/WebSocketManager';

/**
 * Register WebSocket routes
 *
 * This implements the WebSocket protocol expected by che-dashboard for real-time updates
 * of devWorkspaces, pods, events, and logs.
 */
export async function registerWebSocketRoutes(fastify: FastifyInstance): Promise<void> {
  const wsManager = new WebSocketManager();

  /**
   * WebSocket /api/websocket
   * Real-time subscriptions to Kubernetes resources
   */
  fastify.get(
    '/websocket',
    { websocket: true },
    (connection: WebSocket, req) => {
      const clientId = Math.random().toString(36).substring(7);
      logger.info({ clientId, url: req.url }, 'WebSocket client connected');

      connection.on('message', async (messageBuffer: Buffer) => {
        try {
          const message = JSON.parse(messageBuffer.toString());
          logger.debug({ clientId, message }, 'WebSocket message received');

          await wsManager.handleMessage(connection, message, req);
        } catch (error) {
          logger.error({ clientId, error }, 'Error handling WebSocket message');
          connection.send(
            JSON.stringify({
              channel: 'error',
              message: {
                eventPhase: 'ERROR',
                status: {
                  message: 'Failed to process message',
                },
              },
            }),
          );
        }
      });

      connection.on('close', () => {
        logger.info({ clientId }, 'WebSocket client disconnected');
        wsManager.handleDisconnect(connection);
      });

      connection.on('error', (error) => {
        logger.error({ clientId, error }, 'WebSocket error');
        wsManager.handleDisconnect(connection);
      });
    },
  );
}

