/**
 * Copyright (c) 2021-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import dotenv from 'dotenv';
import { authenticate, requireAuth } from './middleware/auth';
import { registerNamespaceRoutes } from './routes/namespaceRoutes';
import { registerFactoryRoutes } from './routes/factoryRoutes';
import { registerOAuthRoutes } from './routes/oauthRoutes';
import { registerScmRoutes } from './routes/scmRoutes';
import { registerClusterInfoRoutes } from './routes/clusterInfoRoutes';
import { registerClusterConfigRoutes } from './routes/clusterConfigRoutes';
import { registerServerConfigRoutes } from './routes/serverConfigRoutes';
import { registerDevWorkspaceRoutes } from './routes/devworkspaceRoutes';
import { registerDevWorkspaceTemplateRoutes } from './routes/devworkspaceTemplateRoutes';
import { registerDevWorkspaceResourcesRoutes } from './routes/devworkspaceResourcesRoutes';
import { registerDevWorkspaceClusterRoutes } from './routes/devworkspaceClusterRoutes';
import { registerPodsRoutes } from './routes/podsRoutes';
import { registerEventsRoutes } from './routes/eventsRoutes';
import { registerEditorsRoutes } from './routes/editorsRoutes';
import { registerUserProfileRoutes } from './routes/userProfileRoutes';
import { registerSshKeysRoutes } from './routes/sshKeysRoutes';
import { registerPersonalAccessTokenRoutes } from './routes/personalAccessTokenRoutes';
import { registerGitConfigRoutes } from './routes/gitConfigRoutes';
import { registerDockerConfigRoutes } from './routes/dockerConfigRoutes';
import { registerWorkspacePreferencesRoutes } from './routes/workspacePreferencesRoutes';
import { registerGettingStartedSampleRoutes } from './routes/gettingStartedSampleRoutes';
import { registerAirGapSampleRoutes } from './routes/airgapSampleRoutes';
import { registerSystemRoutes } from './routes/systemRoutes';
import { registerWebSocketRoutes } from './routes/websocketRoutes';
import { registerDataResolverRoutes } from './routes/dataResolverRoutes';
import { setupSwagger } from './config/swagger';
import { logger } from './utils/logger';
import { exec } from 'child_process';
import websocketPlugin from '@fastify/websocket';
import { CheClusterService } from './services/CheClusterService';

// Load environment variables
dotenv.config();

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport:
      process.env.NODE_ENV === 'development'
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
});

// Use CHE_PORT if available (set by Che Operator)
const PORT = Number(process.env.CHE_PORT || process.env.PORT) || 8080;
// Always bind to 0.0.0.0 in containers
// Note: CHE_HOST is the external hostname, not the bind address
// Use CHE_BIND_ADDRESS or BIND_ADDRESS to override bind address
const HOST = process.env.CHE_BIND_ADDRESS || process.env.BIND_ADDRESS || '0.0.0.0';

// Register plugins and routes
async function start() {
  try {
    // Register CORS FIRST - must be before any routes for proper OPTIONS handling
    await fastify.register(fastifyCors, {
      origin: true, // Allow all origins (Eclipse Che Gateway will be proxying)
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'gap-auth',
        'Accept',
        'Origin',
        'X-Requested-With',
        'X-Forwarded-Proto',
        'X-Forwarded-Host',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers',
      ],
      exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length'],
      maxAge: 86400, // 24 hours - cache preflight responses
      preflightContinue: false, // Don't pass OPTIONS to route handlers
      optionsSuccessStatus: 204, // Return 204 for successful OPTIONS
      strictPreflight: false, // Be lenient with preflight requests
      hideOptionsRoute: true, // Hide automatic OPTIONS routes from schema
    });

    // Register authentication hooks as decorators
    fastify.decorate('authenticate', authenticate);
    fastify.decorate('requireAuth', requireAuth);

    // Register WebSocket plugin
    await fastify.register(websocketPlugin);

    // Setup Swagger/OpenAPI documentation
    await setupSwagger(fastify);

    // Health check endpoint (hidden from Swagger)
    fastify.get(
      '/health',
      {
        schema: {
          hide: true,
          tags: ['health'],
          summary: 'Health check',
          description: 'Check if the API is running',
          response: {
            200: {
              description: 'Service is healthy',
              type: 'object',
              properties: {
                status: { type: 'string' },
                timestamp: { type: 'string' },
              },
            },
          },
        },
      },
      async (request, reply) => {
        return reply.code(200).send({
          status: 'ok',
          timestamp: new Date().toISOString(),
        });
      },
    );

    // Register route modules with /api prefix (matches Java implementation)
    await fastify.register(
      async apiInstance => {
        // Root API endpoint - returns API info (no auth required for CORS preflight, hidden from Swagger)
        apiInstance.get(
          '/',
          {
            schema: {
              hide: true,
              tags: ['api'],
              summary: 'API root endpoint',
              description: 'Returns API information and available endpoints',
              response: {
                200: {
                  description: 'API information',
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    version: { type: 'string' },
                    implementation: { type: 'string' },
                    docs: { type: 'string' },
                  },
                },
              },
            },
          },
          async (request, reply) => {
            return reply.code(200).send({
              name: 'Eclipse Che Server API',
              version: '7.x',
              implementation: 'Node.js/Fastify',
              docs: '/api/docs',
            });
          },
        );

        await registerNamespaceRoutes(apiInstance);
        await registerFactoryRoutes(apiInstance);
        await registerOAuthRoutes(apiInstance);
        await registerScmRoutes(apiInstance);
        await registerDataResolverRoutes(apiInstance);
        await registerClusterInfoRoutes(apiInstance);
        await registerClusterConfigRoutes(apiInstance);
        await registerServerConfigRoutes(apiInstance);
        await registerDevWorkspaceRoutes(apiInstance);
        await registerDevWorkspaceTemplateRoutes(apiInstance);
        await registerDevWorkspaceResourcesRoutes(apiInstance);
        await registerDevWorkspaceClusterRoutes(apiInstance);
        await registerPodsRoutes(apiInstance);
        await registerEventsRoutes(apiInstance);
        await registerEditorsRoutes(apiInstance);
        await registerUserProfileRoutes(apiInstance);
        await registerSshKeysRoutes(apiInstance);
        await registerPersonalAccessTokenRoutes(apiInstance);
        await registerGitConfigRoutes(apiInstance);
        await registerDockerConfigRoutes(apiInstance);
        await registerWorkspacePreferencesRoutes(apiInstance);
        await registerGettingStartedSampleRoutes(apiInstance);
        await registerAirGapSampleRoutes(apiInstance);
        await registerSystemRoutes(apiInstance);
        await registerWebSocketRoutes(apiInstance);
      },
      { prefix: '/api' },
    );

    // Health check endpoints for Kubernetes (hidden from Swagger)
    fastify.get('/healthz', { schema: { hide: true } }, async (request, reply) => {
      return reply.code(200).send({ status: 'ok' });
    });

    fastify.get('/readyz', { schema: { hide: true } }, async (request, reply) => {
      return reply.code(200).send({ status: 'ready' });
    });

    fastify.get('/livez', { schema: { hide: true } }, async (request, reply) => {
      return reply.code(200).send({ status: 'alive' });
    });

    // Global error handler
    fastify.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
      fastify.log.error(error);

      reply.status(error.statusCode || 500).send({
        error: error.name || 'Internal Server Error',
        message: error.message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      });
    });

    // 404 handler
    fastify.setNotFoundHandler((request, reply) => {
      reply.status(404).send({
        error: 'Not Found',
        message: `Route ${request.method} ${request.url} not found`,
      });
    });

    // Start the server
    await fastify.listen({ port: PORT, host: HOST });

    logger.info(`Che Server swagger is running on "http://localhost:${PORT}/swagger".`);
    logger.info(`\n🚀 Eclipse Che Next API Server (Fastify) is running on port ${PORT}`);
    
    // Initialize CheClusterService AFTER server starts (async, non-blocking)
    // This allows health checks to succeed while we load the CheCluster CR in the background
    setTimeout(async () => {
      try {
        const cheClusterService = CheClusterService.getInstance();
        await cheClusterService.initialize();
        logger.info('CheClusterService initialized successfully');
      } catch (error) {
        logger.warn({ error }, 'Failed to initialize CheClusterService, will use fallback configuration from environment variables');
      }
    }, 100); // Small delay to ensure server is fully ready
    logger.info(`\n📚 API Documentation:`);
    logger.info(`   Swagger UI: http://localhost:${PORT}/swagger`);
    logger.info(`   OpenAPI JSON: http://localhost:${PORT}/swagger/json`);
    logger.info(`   OpenAPI YAML: http://localhost:${PORT}/swagger/yaml`);
    logger.info(`\n🔗 Endpoints:`);
    logger.info(`\n   Cluster & Server Config:`);
    logger.info(`   GET  http://localhost:${PORT}/api/cluster-info`);
    logger.info(`   GET  http://localhost:${PORT}/api/cluster-config`);
    logger.info(`   GET  http://localhost:${PORT}/api/server-config`);
    logger.info(`\n   Kubernetes Namespace:`);
    logger.info(`   POST http://localhost:${PORT}/api/kubernetes/namespace/provision`);
    logger.info(`   GET  http://localhost:${PORT}/api/kubernetes/namespace`);
    logger.info(`\n   DevWorkspace Management:`);
    logger.info(`   GET  http://localhost:${PORT}/api/namespace/:namespace/devworkspaces`);
    logger.info(`   POST http://localhost:${PORT}/api/namespace/:namespace/devworkspaces`);
    logger.info(`   GET  http://localhost:${PORT}/api/namespace/:namespace/devworkspacetemplates`);
    logger.info(`   POST http://localhost:${PORT}/api/devworkspace-resources`);
    logger.info(`\n   Monitoring & Info:`);
    logger.info(`   GET  http://localhost:${PORT}/api/namespace/:namespace/pods`);
    logger.info(`   GET  http://localhost:${PORT}/api/namespace/:namespace/events`);
    logger.info(`   GET  http://localhost:${PORT}/api/editors`);
    logger.info(`   GET  http://localhost:${PORT}/api/editors/devfile?che-editor=<id>`);
    logger.info(`\n   User:`);
    logger.info(`   GET  http://localhost:${PORT}/api/user/id`);
    logger.info(`   GET  http://localhost:${PORT}/api/userprofile/:namespace`);
    logger.info(`\n   Factory Resolver:`);
    logger.info(`   POST http://localhost:${PORT}/api/factory/resolver`);
    logger.info(`   POST http://localhost:${PORT}/api/factory/token/refresh`);
    logger.info(`\n   OAuth:`);
    logger.info(`   GET  http://localhost:${PORT}/api/oauth`);
    logger.info(`   GET  http://localhost:${PORT}/api/oauth/token`);
    logger.info(`   DELETE http://localhost:${PORT}/api/oauth/token`);
    logger.info(`   GET  http://localhost:${PORT}/api/oauth/authenticate`);
    logger.info(`   GET  http://localhost:${PORT}/api/oauth/callback`);
    logger.info(`\n   SCM & Data:`);
    logger.info(`   GET  http://localhost:${PORT}/api/scm/resolve`);
    logger.info(`   POST http://localhost:${PORT}/api/data/resolver`);
    logger.info(`\n   Health:`);
    logger.info(`   GET  http://localhost:${PORT}/health\n`);
  } catch (err) {
    fastify.log.error(err);
    console.error('Error starting server:', err);

    // Close the server properly before exiting
    try {
      await fastify.close();
      logger.info('Server closed after startup error');
    } catch (closeErr) {
      logger.error({ error: closeErr }, 'Error closing server');
    }

    process.exit(1);
  }
}

// Track if shutdown is already in progress
let isShuttingDown = false;

// Handle shutdown gracefully
const shutdown = (signal: string) => {
  if (isShuttingDown) {
    logger.info({ signal }, 'Shutdown already in progress, ignoring signal');
    return;
  }

  isShuttingDown = true;
  logger.info(`\nReceived ${signal}, shutting down gracefully...`);

  // Close the server
  fastify
    .close()
    .then(() => {
      // Using exec for simple commands
      exec('lsof -ti tcp:8080 | xargs kill', (error, stdout, stderr) => {
        if (error) {
          logger.error({ error }, `exec error`);
          return;
        }
        if (stdout) logger.info({ stdout }, `exec stdout`);
        if (stderr) logger.error({ stderr }, `exec stderr`);
      });
      logger.info('Server closed successfully');
      process.exit(0);
    })
    .catch(err => {
      logger.error({ error: err }, 'Error during shutdown');
      process.exit(1);
    });

  // Force exit after 5 seconds if graceful shutdown fails
  const forceExitTimer = setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 5000);

  // Unref the timer so it doesn't prevent Node.js from exiting if shutdown completes
  forceExitTimer.unref();
};

// Handle different signals
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGUSR2', () => shutdown('SIGUSR2')); // Nodemon uses SIGUSR2

// Uncaught exception handler
process.on('uncaughtException', err => {
  logger.error(
    {
      error: err,
      message: err?.message || 'No message',
      stack: err?.stack || 'No stack trace',
      type: typeof err,
      stringified: JSON.stringify(err),
    },
    'Uncaught exception - DETAILED',
  );
  
  // Don't shutdown on empty errors - they're likely handled elsewhere
  if (!err || (typeof err === 'object' && Object.keys(err).length === 0)) {
    logger.warn('Ignoring uncaught exception with empty error object');
    return;
  }
  
  shutdown('uncaughtException');
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error(
    {
      reason,
      reasonType: typeof reason,
      reasonStringified: JSON.stringify(reason),
      promise,
    },
    'Unhandled rejection - DETAILED',
  );
  
  // Don't shutdown on empty rejections
  if (!reason || (typeof reason === 'object' && Object.keys(reason).length === 0)) {
    logger.warn('Ignoring unhandled rejection with empty reason');
    return;
  }
  
  shutdown('unhandledRejection');
});

// Start the application
start();

export default fastify;
