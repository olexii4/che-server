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

import { GitlabApiClient } from '../GitlabApiClient';
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

describe('GitlabApiClient', () => {
  let client: GitlabApiClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockAxiosInstance = {
      get: jest.fn(),
    };

    (axiosInstanceNoCert.create as jest.Mock).mockReturnValue(mockAxiosInstance);
    (axiosInstance.create as jest.Mock).mockReturnValue(mockAxiosInstance);

    client = new GitlabApiClient();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default URL for public GitLab', () => {
      const client = new GitlabApiClient();
      expect(client.getScmServerUrl()).toBe(GitlabApiClient.GITLAB_API_SERVER);
      expect(client.getApiServerUrl()).toBe(`${GitlabApiClient.GITLAB_API_SERVER}/api/v4`);
    });

    it('should handle self-hosted GitLab', () => {
      const client = new GitlabApiClient('https://gitlab.example.com');
      expect(client.getScmServerUrl()).toBe('https://gitlab.example.com');
      expect(client.getApiServerUrl()).toBe('https://gitlab.example.com/api/v4');
    });

    it('should remove trailing slash', () => {
      const client = new GitlabApiClient('https://gitlab.example.com/');
      expect(client.getScmServerUrl()).toBe('https://gitlab.example.com');
    });
  });

  describe('getUser', () => {
    it('should get user with valid token', async () => {
      const mockUser = {
        id: 123,
        username: 'john.smith',
        email: 'john@example.com',
        name: 'John Smith',
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
        data: { message: 'Unauthorized' },
      });

      await expect(client.getUser('invalid')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getPersonalAccessTokenInfo', () => {
    it('should get PAT info with valid token', async () => {
      const mockPATInfo = {
        id: 1,
        name: 'test-token',
        revoked: false,
        created_at: '2024-01-01T00:00:00.000Z',
        scopes: ['api', 'read_user'],
        user_id: 123,
        active: true,
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: mockPATInfo,
      });

      const patInfo = await client.getPersonalAccessTokenInfo('token1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/personal_access_tokens/self', {
        headers: {
          Authorization: 'Bearer token1',
        },
      });
      expect(patInfo).toEqual(mockPATInfo);
      expect(patInfo?.scopes).toContain('api');
    });

    it('should return null for 204', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 204,
      });

      const patInfo = await client.getPersonalAccessTokenInfo('token');
      expect(patInfo).toBeNull();
    });
  });

  describe('isConnected', () => {
    it('should return true for gitlab.com', () => {
      const client = new GitlabApiClient();
      expect(client.isConnected('https://gitlab.com')).toBe(true);
      expect(client.isConnected('https://gitlab.com/')).toBe(true);
    });

    it('should return true for matching self-hosted', () => {
      const client = new GitlabApiClient('https://gitlab.example.com');
      expect(client.isConnected('https://gitlab.example.com')).toBe(true);
    });

    it('should return false for different URLs', () => {
      const client = new GitlabApiClient();
      expect(client.isConnected('https://github.com')).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle 404 errors', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 404,
        data: { message: 'Not found' },
      });

      await expect(client.getUser('token')).rejects.toThrow(SCM_API_ERRORS.NOT_FOUND);
    });

    it('should handle 400 errors', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 400,
        data: { message: 'Bad request' },
      });

      await expect(client.getUser('token')).rejects.toThrow(SCM_API_ERRORS.BAD_REQUEST);
    });

    it('should handle network errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(client.getUser('token')).rejects.toThrow(SCM_API_ERRORS.COMMUNICATION);
    });
  });
});
