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

/**
 * Swagger/OpenAPI configuration for Fastify
 *
 * Configures @fastify/swagger and @fastify/swagger-ui plugins
 * Using dynamic mode similar to Eclipse Che Dashboard
 */
import { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';

import { logger } from '../utils/logger';

const ROUTE_PREFIX = '/swagger';

type MySchema = {
  headers?: {
    properties?: {
      authorization?: string;
    };
  };
};

/**
 * Register Swagger plugins with Fastify in dynamic mode
 */
export async function setupSwagger(fastify: FastifyInstance): Promise<void> {
  // Dynamically determine server URL from environment or use defaults
  const getServerUrl = (): string => {
    // Priority:
    // 1. CHE_API (from Che Operator) - full URL with /api
    // 2. CHE_API_ENDPOINT - full URL with /api
    // 3. Constructed from CHE_HOST - for OpenShift/Kubernetes
    // 4. Constructed from HOST and PORT - for local development
    if (process.env.CHE_API) {
      return process.env.CHE_API.replace(/\/api\/?$/, '');
    }
    if (process.env.CHE_API_ENDPOINT) {
      return process.env.CHE_API_ENDPOINT.replace(/\/api\/?$/, '');
    }
    if (process.env.CHE_HOST) {
      // CHE_HOST is external hostname (e.g., eclipse-che.apps.xxx.com)
      const protocol = process.env.CHE_INFRA_OPENSHIFT_TLS__ENABLED === 'true' ? 'https' : 'http';
      return `${protocol}://${process.env.CHE_HOST}`;
    }
    // Local development fallback
    const port = process.env.CHE_PORT || process.env.PORT || '8080';
    return `http://localhost:${port}`;
  };

  const serverUrl = getServerUrl();
  const isProduction = process.env.NODE_ENV === 'production';

  await fastify.register(fastifySwagger, {
    mode: 'dynamic',
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Eclipse Che Server API',
        description:
          'API for Eclipse Che Server - Namespace Provisioning, Factory Resolution, and SCM Integration',
        version: '1.0.0',
      },
      servers: [
        {
          url: serverUrl,
          description: isProduction ? 'Production server' : 'Development server',
        },
      ],
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Bearer token authentication',
          },
          BasicAuth: {
            type: 'http',
            scheme: 'basic',
            description: 'Basic authentication',
          },
        },
      },
    },
    hideUntagged: false,
    transform: ({ schema, url }) => {
      const mySchema = schema as MySchema;
      // Remove authorization header from schema to avoid duplication
      if (mySchema?.headers?.properties?.authorization) {
        delete mySchema.headers.properties.authorization;
      }
      return { schema: mySchema, url };
    },
  });

  await fastify.register(fastifySwaggerUi, {
    routePrefix: ROUTE_PREFIX,
    uiConfig: {
      tryItOutEnabled: true,
      validatorUrl: null,
      layout: 'BaseLayout',
      deepLinking: true,
      displayRequestDuration: true,
      filter: true,
      defaultModelsExpandDepth: -1, // Hide example values, show only schemas
      defaultModelExpandDepth: 0, // Don't expand model details by default
      syntaxHighlight: {
        activate: true,
        theme: 'monokai',
      },
    },
  });
}
