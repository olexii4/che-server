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

import { BitbucketApiClient } from '../BitbucketApiClient';
import { UnauthorizedException } from '../../../models/UnauthorizedException';
import { SCM_API_ERRORS } from '../../../models/ScmApiModels';

// Mock axios instances from getCertificateAuthority
jest.mock('../../../helpers/getCertificateAuthority', () => ({
  axiosInstanceNoCert: {
    create: jest.fn(),
  },
  axiosInstance: {
    create: jest.fn(),
  },
}));

import { axiosInstanceNoCert, axiosInstance } from '../../../helpers/getCertificateAuthority';

describe('BitbucketApiClient', () => {
  let client: BitbucketApiClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      get: jest.fn(),
    };

    (axiosInstanceNoCert.create as jest.Mock).mockReturnValue(mockAxiosInstance);
    (axiosInstance.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    client = new BitbucketApiClient();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default API URL', () => {
      const client = new BitbucketApiClient();
      expect(client.getApiServerUrl()).toBe(BitbucketApiClient.BITBUCKET_API_SERVER);
      expect(client.getScmServerUrl()).toBe(BitbucketApiClient.BITBUCKET_SERVER);
    });

    it('should handle custom API URL', () => {
      const client = new BitbucketApiClient('https://api.bitbucket.example.com');
      expect(client.getApiServerUrl()).toBe('https://api.bitbucket.example.com');
    });

    it('should remove trailing slash', () => {
      const client = new BitbucketApiClient('https://api.bitbucket.org/2.0/');
      expect(client.getApiServerUrl()).toBe('https://api.bitbucket.org/2.0');
    });
  });

  describe('getUser', () => {
    it('should get user with valid token', async () => {
      const mockUser = {
        uuid: '{12345678-1234-1234-1234-123456789abc}',
        username: 'bitbucket-user',
        display_name: 'Bitbucket User',
        account_id: 'account123',
        type: 'user',
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: mockUser,
      });

      const user = await client.getUser('token1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/user', {
        headers: {
          Authorization: 'Bearer token1',
        },
      });
      expect(user).toEqual(mockUser);
    });

    it('should return null for 204', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 204,
      });

      const user = await client.getUser('token');
      expect(user).toBeNull();
    });

    it('should throw UnauthorizedException for 401', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 401,
        data: { error: { message: 'Unauthorized' } },
      });

      await expect(client.getUser('invalid')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getUserEmail', () => {
    it('should get primary email', async () => {
      const mockEmailsResponse = {
        values: [
          {
            is_primary: false,
            is_confirmed: true,
            email: 'secondary@example.com',
            type: 'email',
          },
          {
            is_primary: true,
            is_confirmed: true,
            email: 'primary@example.com',
            type: 'email',
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: mockEmailsResponse,
      });

      const email = await client.getUserEmail('token1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/user/emails', {
        headers: {
          Authorization: 'Bearer token1',
        },
      });
      expect(email).toBe('primary@example.com');
    });

    it('should return null if no primary email', async () => {
      const mockEmailsResponse = {
        values: [
          {
            is_primary: false,
            is_confirmed: true,
            email: 'secondary@example.com',
            type: 'email',
          },
        ],
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: mockEmailsResponse,
      });

      const email = await client.getUserEmail('token');
      expect(email).toBeNull();
    });
  });

  describe('getFileContent', () => {
    it('should get file content from repository', async () => {
      const mockContent = 'schemaVersion: 2.1.0\nmetadata:\n  name: test';

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: mockContent,
      });

      const content = await client.getFileContent(
        'workspace',
        'repo',
        'main',
        'devfile.yaml',
        'token1',
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/repositories/workspace/repo/src/main/devfile.yaml',
        {
          headers: {
            Authorization: 'Bearer token1',
          },
          responseType: 'text',
        },
      );
      expect(content).toBe(mockContent);
    });

    it('should handle paths with special characters', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: 'content',
      });

      await client.getFileContent('workspace', 'repo', 'main', '.che/che-editor.yaml', 'token');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        expect.stringContaining('.che%2Fche-editor.yaml'),
        expect.anything(),
      );
    });
  });

  describe('getTokenScopes', () => {
    it('should get token scopes and username', async () => {
      const mockUser = {
        uuid: '{uuid}',
        username: 'test-user',
        display_name: 'Test User',
        account_id: 'account123',
        type: 'user',
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: mockUser,
        headers: {
          [BitbucketApiClient.BITBUCKET_OAUTH_SCOPES_HEADER]: 'repository, account',
        },
      });

      const result = await client.getTokenScopes('token1');

      expect(result.username).toBe('test-user');
      expect(result.scopes).toEqual(['repository', 'account']);
    });

    it('should handle missing scopes header', async () => {
      const mockUser = {
        uuid: '{uuid}',
        username: 'test-user',
        display_name: 'Test User',
        account_id: 'account123',
        type: 'user',
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: mockUser,
        headers: {},
      });

      const result = await client.getTokenScopes('token1');

      expect(result.username).toBe('test-user');
      expect(result.scopes).toEqual([]);
    });
  });

  describe('isConnected', () => {
    it('should return true for bitbucket.org', () => {
      const client = new BitbucketApiClient();
      expect(client.isConnected('https://bitbucket.org')).toBe(true);
      expect(client.isConnected('https://bitbucket.org/')).toBe(true);
    });

    it('should return false for other URLs', () => {
      const client = new BitbucketApiClient();
      expect(client.isConnected('https://github.com')).toBe(false);
      expect(client.isConnected('https://gitlab.com')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle 404 errors', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 404,
        data: { error: { message: 'Not found' } },
      });

      await expect(client.getUser('token')).rejects.toThrow(SCM_API_ERRORS.NOT_FOUND);
    });

    it('should handle 400 errors', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 400,
        data: { error: { message: 'Bad request' } },
      });

      await expect(client.getUser('token')).rejects.toThrow(SCM_API_ERRORS.BAD_REQUEST);
    });

    it('should handle network errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(client.getUser('token')).rejects.toThrow(SCM_API_ERRORS.COMMUNICATION);
    });
  });
});
