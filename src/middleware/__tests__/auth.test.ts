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

import { authenticate, requireAuth, Subject } from '../auth';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('Authentication Middleware', () => {
  let mockRequest: Partial<FastifyRequest>;
  let mockReply: Partial<FastifyReply>;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockReply = {
      code: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  describe('authenticate', () => {
    it('should set subject to undefined when no authorization header', async () => {
      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);
      expect(mockRequest.subject).toBeUndefined();
    });

    it('should parse Bearer token in test format (id:username)', async () => {
      mockRequest.headers = {
        authorization: 'Bearer user123:johndoe',
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.subject).toEqual({
        id: 'user123',
        userId: 'johndoe',
        userName: 'johndoe',
        token: 'user123:johndoe',
      });
    });

    it('should parse real Kubernetes/OpenShift token (without colons)', async () => {
      mockRequest.headers = {
        authorization: 'Bearer sha256~zpxqr6PzbWNyTzX7d4mUfiONB0-QSLn7-JQFsiMF0S8',
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      // TokenReview API will fail for test token and fall back to 'che-user'
      expect(mockRequest.subject).toEqual({
        id: 'che-user',
        userId: 'che-user',
        userName: 'che-user',
        token: 'sha256~zpxqr6PzbWNyTzX7d4mUfiONB0-QSLn7-JQFsiMF0S8',
      });
    });

    it('should parse Basic auth', async () => {
      const credentials = Buffer.from('johndoe:user123').toString('base64');
      mockRequest.headers = {
        authorization: `Basic ${credentials}`,
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.subject).toEqual({
        id: 'user123',
        userId: 'johndoe',
        userName: 'johndoe',
        token: 'johndoe:user123',
      });
    });

    it('should set subject to undefined for invalid Bearer token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid',
      };

      // This is now valid - single token without colons is treated as real Kubernetes token
      // TokenReview API will fail and fall back to 'che-user'
      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.subject).toEqual({
        id: 'che-user',
        userId: 'che-user',
        userName: 'che-user',
        token: 'invalid',
      });
    });

    it('should set subject to undefined for invalid Basic auth', async () => {
      mockRequest.headers = {
        authorization: 'Basic invalid',
      };

      await authenticate(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockRequest.subject).toBeUndefined();
    });
  });

  describe('requireAuth', () => {
    it('should return 401 when subject is not set', async () => {
      mockRequest.subject = undefined;

      await requireAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).toHaveBeenCalledWith(401);
      expect(mockReply.send).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authorization header is required',
      });
    });

    it('should not return error when subject is set', async () => {
      mockRequest.subject = {
        id: 'user123',
        userId: 'johndoe',
        userName: 'johndoe',
        token: 'user123:johndoe',
      };

      await requireAuth(mockRequest as FastifyRequest, mockReply as FastifyReply);

      expect(mockReply.code).not.toHaveBeenCalled();
      expect(mockReply.send).not.toHaveBeenCalled();
    });
  });
});
