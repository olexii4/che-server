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

import * as k8s from '@kubernetes/client-node';
import { FastifyRequest } from 'fastify';
import { WebSocket } from '@fastify/websocket';

import { getKubeConfig } from '../helpers/getKubernetesClient';
import { logger } from '../utils/logger';

type Channel = 'devWorkspace' | 'event' | 'pod' | 'logs';
type EventPhase = 'ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR';

interface SubscribeMessage {
  method: 'SUBSCRIBE';
  channel: Channel;
  params: {
    namespace: string;
    resourceVersion?: string;
    podName?: string;
    containerName?: string;
  };
}

interface UnsubscribeMessage {
  method: 'UNSUBSCRIBE';
  channel: Channel;
  params: Record<string, never>;
}

interface Subscription {
  channel: Channel;
  namespace: string;
  abort?: AbortController;
  logStream?: NodeJS.ReadableStream;
}

/**
 * WebSocketManager handles WebSocket connections and Kubernetes resource watches
 */
export class WebSocketManager {
  private subscriptions: Map<WebSocket, Subscription[]> = new Map();

  async handleMessage(
    connection: WebSocket,
    message: SubscribeMessage | UnsubscribeMessage,
    req: FastifyRequest,
  ): Promise<void> {
    const token = this.extractToken(req);

    if (message.method === 'SUBSCRIBE') {
      await this.handleSubscribe(connection, message, token);
    } else if (message.method === 'UNSUBSCRIBE') {
      await this.handleUnsubscribe(connection, message);
    }
  }

  private async handleSubscribe(
    connection: WebSocket,
    message: SubscribeMessage,
    token: string | undefined,
  ): Promise<void> {
    const { channel, params } = message;
    const { namespace } = params;

    if (!token) {
      logger.warn('No auth token for WebSocket subscription');
      this.sendError(connection, channel, 'Unauthorized');
      return;
    }

    const kubeConfig = getKubeConfig(token);
    const subscriptions = this.subscriptions.get(connection) || [];

    try {
      switch (channel) {
        case 'devWorkspace':
          await this.subscribeToDevWorkspaces(connection, kubeConfig, namespace);
          break;
        case 'pod':
          await this.subscribeToPods(connection, kubeConfig, namespace);
          break;
        case 'event':
          await this.subscribeToEvents(connection, kubeConfig, namespace);
          break;
        case 'logs':
          if (params.podName) {
            await this.subscribeToLogs(
              connection,
              kubeConfig,
              namespace,
              params.podName,
              params.containerName,
            );
          }
          break;
      }

      subscriptions.push({ channel, namespace });
      this.subscriptions.set(connection, subscriptions);

      logger.info({ channel, namespace }, 'WebSocket subscription added');
    } catch (error) {
      logger.error({ error, channel, namespace }, 'Error subscribing to channel');
      this.sendError(connection, channel, `Failed to subscribe: ${error}`);
    }
  }

  private async handleUnsubscribe(
    connection: WebSocket,
    message: UnsubscribeMessage,
  ): Promise<void> {
    const { channel } = message;
    const subscriptions = this.subscriptions.get(connection) || [];

    // Find and abort subscriptions for this channel
    const updatedSubscriptions = subscriptions.filter((sub) => {
      if (sub.channel === channel) {
        if (sub.abort) {
          sub.abort.abort();
        }
        if (sub.logStream) {
          (sub.logStream as any).destroy();
        }
        return false;
      }
      return true;
    });

    this.subscriptions.set(connection, updatedSubscriptions);
    logger.info({ channel }, 'WebSocket subscription removed');
  }

  handleDisconnect(connection: WebSocket): void {
    const subscriptions = this.subscriptions.get(connection) || [];

    subscriptions.forEach((sub) => {
      if (sub.abort) {
        sub.abort.abort();
      }
      if (sub.logStream) {
        (sub.logStream as any).destroy();
      }
    });

    this.subscriptions.delete(connection);
  }

  private async subscribeToDevWorkspaces(
    connection: WebSocket,
    kubeConfig: k8s.KubeConfig,
    namespace: string,
  ): Promise<void> {
    const customApi = kubeConfig.makeApiClient(k8s.CustomObjectsApi);
    const watch = new k8s.Watch(kubeConfig);
    const abort = new AbortController();

    const subscriptions = this.subscriptions.get(connection) || [];
    subscriptions.push({ channel: 'devWorkspace', namespace, abort });
    this.subscriptions.set(connection, subscriptions);

    const watchPath = `/apis/workspace.devfile.io/v1alpha2/namespaces/${namespace}/devworkspaces`;

    try {
      const watchRequest = await watch.watch(
        watchPath,
        {},
        (phase: string, obj: any) => {
          try {
            // WebSocket.OPEN === 1 (use numeric constant for Node.js ws library)
            if (connection.readyState === 1) {
              connection.send(
                JSON.stringify({
                  channel: 'devWorkspace',
                  message: {
                    eventPhase: phase.toUpperCase() as EventPhase,
                    devWorkspace: obj,
                  },
                }),
              );
            }
          } catch (err) {
            logger.error({ 
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            }, 'Error in devWorkspace watch handler');
          }
        },
        (err: any) => {
          if (err && !abort.signal.aborted) {
            logger.error({ error: err, namespace }, 'DevWorkspace watch error');
            try {
              this.sendError(connection, 'devWorkspace', 'Watch connection closed');
            } catch (e) {
              logger.error({ error: e }, 'Error sending watch error to client');
            }
          }
        },
      );

      // Handle abort signal
      abort.signal.addEventListener('abort', () => {
        try {
          if (watchRequest && typeof (watchRequest as any).abort === 'function') {
            (watchRequest as any).abort();
          }
        } catch (err) {
          logger.error({ error: err }, 'Error aborting watch');
        }
      });
    } catch (error) {
      logger.error({ error, namespace }, 'Failed to start devWorkspace watch');
      // Send error to client but don't throw - permission errors shouldn't crash the server
      try {
        this.sendError(connection, 'devWorkspace', `Failed to start watch: ${error}`);
      } catch (e) {
        logger.error({ error: e }, 'Error sending error to client');
      }
    }
  }

  private async subscribeToPods(
    connection: WebSocket,
    kubeConfig: k8s.KubeConfig,
    namespace: string,
  ): Promise<void> {
    const watch = new k8s.Watch(kubeConfig);
    const abort = new AbortController();

    const subscriptions = this.subscriptions.get(connection) || [];
    subscriptions.push({ channel: 'pod', namespace, abort });
    this.subscriptions.set(connection, subscriptions);

    const watchPath = `/api/v1/namespaces/${namespace}/pods`;

    try {
      const watchRequest = await watch.watch(
        watchPath,
        {},
        (phase: string, obj: any) => {
          try {
            if (connection.readyState === 1) {
              connection.send(
                JSON.stringify({
                  channel: 'pod',
                  message: {
                    eventPhase: phase.toUpperCase() as EventPhase,
                    pod: obj,
                  },
                }),
              );
            }
          } catch (err) {
            logger.error({ 
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            }, 'Error in pod watch handler');
          }
        },
        (err: any) => {
          if (err && !abort.signal.aborted) {
            logger.error({ error: err, namespace }, 'Pod watch error');
            try {
              this.sendError(connection, 'pod', 'Watch connection closed');
            } catch (e) {
              logger.error({ error: e }, 'Error sending watch error to client');
            }
          }
        },
      );

      // Handle abort signal
      abort.signal.addEventListener('abort', () => {
        try {
          if (watchRequest && typeof (watchRequest as any).abort === 'function') {
            (watchRequest as any).abort();
          }
        } catch (err) {
          logger.error({ error: err }, 'Error aborting watch');
        }
      });
    } catch (error) {
      logger.error({ error, namespace }, 'Failed to start pod watch');
      // Send error to client but don't throw - permission errors shouldn't crash the server
      try {
        this.sendError(connection, 'pod', `Failed to start watch: ${error}`);
      } catch (e) {
        logger.error({ error: e }, 'Error sending error to client');
      }
    }
  }

  private async subscribeToEvents(
    connection: WebSocket,
    kubeConfig: k8s.KubeConfig,
    namespace: string,
  ): Promise<void> {
    const watch = new k8s.Watch(kubeConfig);
    const abort = new AbortController();

    const subscriptions = this.subscriptions.get(connection) || [];
    subscriptions.push({ channel: 'event', namespace, abort });
    this.subscriptions.set(connection, subscriptions);

    const watchPath = `/api/v1/namespaces/${namespace}/events`;

    try {
      const watchRequest = await watch.watch(
        watchPath,
        {},
        (phase: string, obj: any) => {
          try {
            if (connection.readyState === 1) {
              connection.send(
                JSON.stringify({
                  channel: 'event',
                  message: {
                    eventPhase: phase.toUpperCase() as EventPhase,
                    event: obj,
                  },
                }),
              );
            }
          } catch (err) {
            logger.error({ 
              error: err instanceof Error ? err.message : String(err),
              stack: err instanceof Error ? err.stack : undefined,
            }, 'Error in event watch handler');
          }
        },
        (err: any) => {
          if (err && !abort.signal.aborted) {
            logger.error({ error: err, namespace }, 'Event watch error');
            try {
              this.sendError(connection, 'event', 'Watch connection closed');
            } catch (e) {
              logger.error({ error: e }, 'Error sending watch error to client');
            }
          }
        },
      );

      // Handle abort signal
      abort.signal.addEventListener('abort', () => {
        try {
          if (watchRequest && typeof (watchRequest as any).abort === 'function') {
            (watchRequest as any).abort();
          }
        } catch (err) {
          logger.error({ error: err }, 'Error aborting watch');
        }
      });
    } catch (error) {
      logger.error({ error, namespace }, 'Failed to start event watch');
      // Send error to client but don't throw - permission errors shouldn't crash the server
      try {
        this.sendError(connection, 'event', `Failed to start watch: ${error}`);
      } catch (e) {
        logger.error({ error: e }, 'Error sending error to client');
      }
    }
  }

  private async subscribeToLogs(
    connection: WebSocket,
    kubeConfig: k8s.KubeConfig,
    namespace: string,
    podName: string,
    containerName?: string,
  ): Promise<void> {
    const log = new k8s.Log(kubeConfig);

    try {
      const logStream = await log.log(
        namespace,
        podName,
        containerName || '',
        process.stdout as any,
        (err: any) => {
          if (err) {
            logger.error({ error: err, namespace, podName }, 'Log stream error');
            this.sendError(connection, 'logs', 'Log stream closed');
          }
        },
        { follow: true, tailLines: 100, pretty: false, timestamps: false },
      );

      const subscriptions = this.subscriptions.get(connection) || [];
      subscriptions.push({ channel: 'logs', namespace, logStream: logStream as any });
      this.subscriptions.set(connection, subscriptions);

      // Pipe logs to WebSocket
      if (logStream && typeof (logStream as any).on === 'function') {
        (logStream as any).on('data', (chunk: Buffer) => {
          if (connection.readyState === 1) {
            connection.send(
              JSON.stringify({
                channel: 'logs',
                message: {
                  eventPhase: 'ADDED',
                  podName,
                  containerName: containerName || '',
                  logs: chunk.toString(),
                },
              }),
            );
          }
        });
      }
    } catch (error) {
      logger.error({ error, namespace, podName }, 'Failed to start log stream');
      // Send error to client but don't throw - permission errors shouldn't crash the server
      this.sendError(connection, 'logs', `Failed to start log stream: ${error}`);
    }
  }

  private sendError(connection: WebSocket, channel: Channel, message: string): void {
    if (connection.readyState === 1) {
      connection.send(
        JSON.stringify({
          channel,
          message: {
            eventPhase: 'ERROR',
            status: {
              message,
            },
          },
        }),
      );
    }
  }

  private extractToken(req: FastifyRequest): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return undefined;
  }
}

