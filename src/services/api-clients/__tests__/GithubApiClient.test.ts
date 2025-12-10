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

import { GithubApiClient } from '../GithubApiClient';
import { UnauthorizedException } from '../../../models/UnauthorizedException';
import { SCM_API_ERRORS } from '../../../models/ScmApiModels';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock getCertificateAuthority
jest.mock('../../../helpers/getCertificateAuthority', () => {
  const mockAxiosInstance = {
    get: jest.fn(),
    create: jest.fn(),
  };
  return {
    axiosInstanceNoCert: mockAxiosInstance,
    axiosInstance: mockAxiosInstance,
  };
});

describe('GithubApiClient', () => {
  let client: GithubApiClient;
  let mockAxiosInstance: any;

  beforeEach(() => {
    // Setup mock axios instance
    mockAxiosInstance = {
      get: jest.fn(),
    };

    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

    // Setup getCertificateAuthority mocks
    const { axiosInstanceNoCert } = require('../../../helpers/getCertificateAuthority');
    axiosInstanceNoCert.create = jest.fn().mockReturnValue(mockAxiosInstance);

    client = new GithubApiClient();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default API URL for public GitHub', () => {
      const client = new GithubApiClient();
      expect(client.getApiServerUrl()).toBe(GithubApiClient.GITHUB_API_SERVER);
      expect(client.getScmServerUrl()).toBe(GithubApiClient.GITHUB_SERVER);
    });

    it('should use default API URL for github.com', () => {
      const client = new GithubApiClient('https://github.com');
      expect(client.getApiServerUrl()).toBe(GithubApiClient.GITHUB_API_SERVER);
    });

    it('should use /api/v3 for GitHub Enterprise', () => {
      const client = new GithubApiClient('https://github.enterprise.com');
      expect(client.getApiServerUrl()).toBe('https://github.enterprise.com/api/v3');
      expect(client.getScmServerUrl()).toBe('https://github.enterprise.com');
    });

    it('should handle null server URL', () => {
      const client = new GithubApiClient(null);
      expect(client.getApiServerUrl()).toBe(GithubApiClient.GITHUB_API_SERVER);
    });

    it('should handle empty server URL', () => {
      const client = new GithubApiClient('');
      expect(client.getApiServerUrl()).toBe(GithubApiClient.GITHUB_API_SERVER);
    });
  });

  describe('getUser', () => {
    it('should get user with valid token', async () => {
      const mockUser = {
        id: 123456789,
        login: 'github-user',
        email: 'github-user@acme.com',
        name: 'Github User',
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: mockUser,
      });

      const user = await client.getUser('token1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/user', {
        headers: {
          Authorization: 'token token1',
        },
      });
      expect(user).toEqual(mockUser);
    });

    it('should return null for 204 No Content', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 204,
        data: null,
      });

      const user = await client.getUser('token1');
      expect(user).toBeNull();
    });

    it('should throw UnauthorizedException for 401', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 401,
        data: 'Unauthorized',
      });

      await expect(client.getUser('invalid_token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error for 404', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 404,
        data: 'Not found',
      });

      await expect(client.getUser('token')).rejects.toThrow(SCM_API_ERRORS.NOT_FOUND);
    });

    it('should throw error for 400', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 400,
        data: 'Bad request',
      });

      await expect(client.getUser('token')).rejects.toThrow(SCM_API_ERRORS.BAD_REQUEST);
    });

    it('should handle network errors', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

      await expect(client.getUser('token')).rejects.toThrow(SCM_API_ERRORS.COMMUNICATION);
    });
  });

  describe('getPullRequest', () => {
    it('should get pull request with valid token', async () => {
      const mockPR = {
        id: 1,
        number: 123,
        state: 'open',
        title: 'Test PR',
        head: {
          ref: 'feature-branch',
          sha: 'abc123',
        },
        base: {
          ref: 'main',
          sha: 'def456',
        },
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: mockPR,
      });

      const pr = await client.getPullRequest('123', 'owner', 'repo', 'token1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/repos/owner/repo/pulls/123', {
        headers: {
          Authorization: 'token token1',
        },
      });
      expect(pr).toEqual(mockPR);
    });

    it('should return null for 204', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 204,
      });

      const pr = await client.getPullRequest('123', 'owner', 'repo', 'token');
      expect(pr).toBeNull();
    });
  });

  describe('isConnected', () => {
    it('should return true for github.com', () => {
      const client = new GithubApiClient();
      expect(client.isConnected('https://github.com')).toBe(true);
      expect(client.isConnected('https://github.com/')).toBe(true);
    });

    it('should return true for matching GitHub Enterprise', () => {
      const client = new GithubApiClient('https://github.enterprise.com');
      expect(client.isConnected('https://github.enterprise.com')).toBe(true);
    });

    it('should return false for different URLs', () => {
      const client = new GithubApiClient();
      expect(client.isConnected('https://gitlab.com')).toBe(false);
      expect(client.isConnected('https://bitbucket.org')).toBe(false);
    });

    it('should handle invalid URLs gracefully', () => {
      const client = new GithubApiClient();
      expect(client.isConnected('not-a-url')).toBe(false);
    });
  });
});
