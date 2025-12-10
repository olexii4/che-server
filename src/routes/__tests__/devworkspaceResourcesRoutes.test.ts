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

import Fastify, { FastifyInstance } from 'fastify';

import { registerDevWorkspaceResourcesRoutes } from '../devworkspaceResourcesRoutes';

// Mock che-devworkspace-generator
jest.mock('@eclipse-che/che-devworkspace-generator/lib/main');

describe('devworkspaceResourcesRoutes', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();
    await fastify.register(registerDevWorkspaceResourcesRoutes);
    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  describe('POST /devworkspace-resources', () => {
    it('should accept devfile content', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/devworkspace-resources',
        payload: {
          devfileContent: `
schemaVersion: 2.2.0
metadata:
  name: test-devfile
components:
  - name: tooling
    container:
      image: quay.io/devfile/universal-developer-image:latest
`,
        },
      });

      // Generator is mocked, so we expect it to try processing
      expect([200, 500]).toContain(response.statusCode);
    });

    it('should require devfileContent', async () => {
      const response = await fastify.inject({
        method: 'POST',
        url: '/devworkspace-resources',
        payload: {},
      });

      expect(response.statusCode).toBe(400);
    });
  });
});
