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

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ScmService } from '../services/ScmFileResolvers';
import { UnauthorizedException } from '../models/UnauthorizedException';
import { logger } from '../utils/logger';

/**
 * Register SCM routes
 *
 * Based on: org.eclipse.che.api.factory.server.ScmService
 */
export async function registerScmRoutes(fastify: FastifyInstance): Promise<void> {
  // Initialize service
  const scmResolvers = new ScmService();

  /**
   * GET /scm/resolve
   *
   * Get file content by specific repository URL and filename.
   * Supports both public repositories (no auth) and private repositories (with Bearer token).
   */
  fastify.get(
    '/scm/resolve',
    {
      schema: {
        tags: ['scm'],
        summary: 'Resolve and download file from SCM repository',
        description: `Get file content by specific repository URL and filename. Returns the file as a downloadable attachment.
        
Supports both public and private repositories:
- **Public repositories**: No authentication required
- **Private repositories**: Requires Bearer token in Authorization header

The response includes Content-Disposition header to trigger file download in browsers.

**Example URLs:**

**Devfile from Bitbucket:**
\`\`\`
/scm/resolve?repository=https://oorel@bitbucket.org/oorel/oorel1.git&file=devfile.yaml
\`\`\`

**Che Editor from Bitbucket:**
\`\`\`
/scm/resolve?repository=https://oorel@bitbucket.org/oorel/oorel1.git&file=.che/che-editor.yaml
\`\`\`

**Devfile from GitHub:**
\`\`\`
/scm/resolve?repository=https://github.com/eclipse-che/che-dashboard&file=devfile.yaml
\`\`\`

**VSCode Extensions from GitLab:**
\`\`\`
/scm/resolve?repository=https://gitlab.com/user/project&file=.vscode/extensions.json
\`\`\``,
        security: [{ BearerAuth: [] }, { BasicAuth: [] }],
        querystring: {
          type: 'object',
          required: ['repository', 'file'],
          properties: {
            repository: {
              type: 'string',
              description: `Repository URL. Supported formats:
- **GitHub**: https://github.com/user/repo or https://github.com/user/repo.git
- **GitLab**: https://gitlab.com/user/repo or https://gitlab.com/user/repo.git
- **Bitbucket**: https://bitbucket.org/workspace/repo or https://oorel@bitbucket.org/oorel/oorel1.git
- **GitHub Enterprise**: https://github.enterprise.com/user/repo
- **Self-hosted GitLab**: https://gitlab.example.com/user/repo
- **Direct raw URL**: https://raw.githubusercontent.com/user/repo/main/devfile.yaml`,
            },
            file: {
              type: 'string',
              description: `File path within the repository. Examples:
- **Devfile**: devfile.yaml or .devfile.yaml
- **Che Editor**: .che/che-editor.yaml
- **Che Plugins**: .che/che-theia-plugins.yaml
- **VSCode Extensions**: .vscode/extensions.json
- **Any file**: path/to/any/file.txt`,
            },
          },
        },
        response: {
          200: {
            description:
              'File content successfully retrieved as downloadable attachment. Returns raw file content with Content-Disposition header to trigger browser download.',
            type: 'string',
            headers: {
              'Content-Disposition': {
                type: 'string',
                description: 'attachment; filename="<filename>"',
              },
            },
          },
          400: {
            description: 'Bad Request - Missing or invalid parameters',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          401: {
            description: 'Unauthorized - Authentication required for private repository',
            type: 'object',
            properties: {
              errorCode: { type: 'number' },
              message: { type: 'string' },
              attributes: {
                type: 'object',
                properties: {
                  oauth_provider: { type: 'string' },
                  oauth_version: { type: 'string' },
                  oauth_authentication_url: { type: 'string' },
                },
              },
            },
          },
          404: {
            description: 'File not found in repository',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
          500: {
            description: 'Internal Server Error',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
            },
          },
        },
      },
      // Only authenticate, don't require auth (allows public repo access)
      onRequest: [fastify.authenticate],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get parameters from query
        const query = request.query as any;
        const repository = query.repository as string;
        const file = query.file as string;

        if (!repository) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'Repository parameter is required',
          });
        }

        if (!file) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: 'File parameter is required',
          });
        }

        // Pass Authorization header for private repository access
        const authorizationHeader = request.headers.authorization;
        logger.info(`[scmRoutes] Received request for repository: ${repository}, file: ${file}`);
        logger.info(
          `[scmRoutes] Authorization header present: ${authorizationHeader ? 'YES' : 'NO'}`,
        );
        if (authorizationHeader) {
          logger.info(
            `[scmRoutes] Authorization header value: ${authorizationHeader.substring(0, 20)}...`,
          );
        }

        // Resolve file content (will use auth if provided, work without auth for public repos)
        const content = await scmResolvers.resolveFile(repository, file, authorizationHeader);

        // Extract filename from file path
        const filename = file.split('/').pop() || 'file';

        // Return file as downloadable attachment (like Java implementation)
        return reply
          .header('Content-Disposition', `attachment; filename="${filename}"`)
          .type('application/octet-stream')
          .code(200)
          .send(content);
      } catch (error: any) {
        fastify.log.error('Error resolving SCM file:', error);

        // Check for UnauthorizedException (private repository without auth)
        if (error instanceof UnauthorizedException) {
          return reply.code(401).send(error.toJSON());
        }

        // Check for specific error types
        if (error.message?.includes('required')) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }

        if (error.message?.includes('not found') || error.message?.includes('404')) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Requested file not found in repository',
          });
        }

        if (error.message?.includes('Cannot find suitable file resolver')) {
          return reply.code(400).send({
            error: 'Bad Request',
            message: error.message,
          });
        }

        return reply.code(500).send({
          error: 'Internal Server Error',
          message: error.message || 'Failed to resolve file from SCM repository',
        });
      }
    },
  );
}
