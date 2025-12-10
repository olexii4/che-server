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

import { AzureDevOpsApiClient } from '../AzureDevOpsApiClient';
import { UnauthorizedException } from '../../../models/UnauthorizedException';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock isAxiosError
const mockIsAxiosError = jest.fn();
jest.mock('axios', () => ({
  ...jest.requireActual('axios'),
  isAxiosError: (...args: any[]) => mockIsAxiosError(...args),
}));

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

describe('AzureDevOpsApiClient', () => {
  let client: AzureDevOpsApiClient;
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

    client = new AzureDevOpsApiClient();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should use default API URL for public Azure DevOps', () => {
      const client = new AzureDevOpsApiClient();
      expect(client.getApiServerUrl()).toBe(AzureDevOpsApiClient.AZURE_DEVOPS_API_SERVER);
      expect(client.getServerUrl()).toBe(AzureDevOpsApiClient.AZURE_DEVOPS_SERVER);
    });

    it('should use default API URL for dev.azure.com', () => {
      const client = new AzureDevOpsApiClient('https://dev.azure.com');
      expect(client.getApiServerUrl()).toBe(AzureDevOpsApiClient.AZURE_DEVOPS_API_SERVER);
    });

    it('should use custom URL for Azure DevOps Server (on-premises)', () => {
      const client = new AzureDevOpsApiClient('https://azuredevops.company.com');
      expect(client.getApiServerUrl()).toBe('https://azuredevops.company.com');
      expect(client.getServerUrl()).toBe('https://azuredevops.company.com');
    });

    it('should handle null server URL', () => {
      const client = new AzureDevOpsApiClient(null);
      expect(client.getApiServerUrl()).toBe(AzureDevOpsApiClient.AZURE_DEVOPS_API_SERVER);
    });

    it('should handle empty server URL', () => {
      const client = new AzureDevOpsApiClient('');
      expect(client.getApiServerUrl()).toBe(AzureDevOpsApiClient.AZURE_DEVOPS_API_SERVER);
    });
  });

  describe('getUser', () => {
    it('should get user with valid token', async () => {
      const mockUser = {
        id: 'user-id-123',
        displayName: 'Azure User',
        emailAddress: 'azure-user@example.com',
        publicAlias: 'azure-user',
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: mockUser,
      });

      const user = await client.getUser('token1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/_apis/profile/profiles/me', {
        params: {
          'api-version': AzureDevOpsApiClient.API_VERSION,
        },
        headers: {
          Authorization: 'Bearer token1',
        },
      });

      expect(user).toEqual(mockUser);
    });

    it('should throw UnauthorizedException for 401 response', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(client.getUser('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for 403 response', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 403,
        statusText: 'Forbidden',
      });

      await expect(client.getUser('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw error for non-200 response', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.getUser('token1')).rejects.toThrow(
        'Failed to get user info: 500 Internal Server Error',
      );
    });

    it('should handle axios errors with 401 status', async () => {
      // Create a proper axios error structure
      const axiosError = {
        message: 'Request failed',
        isAxiosError: true,
        response: {
          status: 401,
        },
        toJSON: () => ({}),
      };

      // Mock isAxiosError to return true
      mockIsAxiosError.mockReturnValue(true);

      // Mock the fallback to throw the same error
      mockAxiosInstance.get.mockRejectedValueOnce(axiosError).mockRejectedValueOnce(axiosError);

      await expect(client.getUser('token1')).rejects.toThrow(UnauthorizedException);
    });

    it('should handle axios errors without response', async () => {
      const axiosError = {
        message: 'Network error',
        isAxiosError: true,
      };

      // Mock isAxiosError to return true
      mockIsAxiosError.mockReturnValue(true);

      mockAxiosInstance.get.mockRejectedValueOnce(axiosError).mockRejectedValueOnce(axiosError);

      await expect(client.getUser('token1')).rejects.toThrow('Azure DevOps API error');
    });
  });

  describe('getUserByUsername', () => {
    it('should get user by username', async () => {
      const mockUser = {
        id: 'user-id-123',
        displayName: 'Azure User',
        emailAddress: 'azure-user@example.com',
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: mockUser,
      });

      const user = await client.getUserByUsername('azure-user', 'token1');

      expect(user).toEqual(mockUser);
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 401,
      });

      await expect(client.getUserByUsername('azure-user', 'invalid-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('isConnected', () => {
    it('should return true for dev.azure.com', () => {
      const client = new AzureDevOpsApiClient('https://dev.azure.com');
      expect(client.isConnected('https://dev.azure.com')).toBe(true);
    });

    it('should return true for URLs containing dev.azure.com', () => {
      const client = new AzureDevOpsApiClient();
      expect(client.isConnected('https://dev.azure.com/myorg')).toBe(true);
    });

    it('should return true for URLs containing visualstudio.com', () => {
      const client = new AzureDevOpsApiClient();
      expect(client.isConnected('https://myorg.visualstudio.com')).toBe(true);
    });

    it('should return true for matching custom server URL', () => {
      const client = new AzureDevOpsApiClient('https://azuredevops.company.com');
      expect(client.isConnected('https://azuredevops.company.com')).toBe(true);
    });

    it('should return false for non-matching URL', () => {
      const client = new AzureDevOpsApiClient();
      expect(client.isConnected('https://github.com')).toBe(false);
    });

    it('should handle trailing slashes', () => {
      const client = new AzureDevOpsApiClient('https://dev.azure.com/');
      expect(client.isConnected('https://dev.azure.com')).toBe(true);
    });
  });

  describe('isTokenValid', () => {
    it('should return true for valid token', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: { id: 'user-id' },
      });

      const result = await client.isTokenValid('valid-token');

      expect(result).toBe(true);
    });

    it('should return false for invalid token', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 401,
      });

      const result = await client.isTokenValid('invalid-token');

      expect(result).toBe(false);
    });
  });

  describe('getRepository', () => {
    it('should get repository with valid credentials', async () => {
      const mockRepo = {
        id: 'repo-id',
        name: 'my-repo',
        url: 'https://dev.azure.com/org/project/_apis/git/repositories/my-repo',
      };

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: mockRepo,
      });

      const repo = await client.getRepository('org', 'project', 'my-repo', 'token1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/org/project/_apis/git/repositories/my-repo',
        {
          params: {
            'api-version': AzureDevOpsApiClient.API_VERSION,
          },
          headers: {
            Authorization: 'Bearer token1',
          },
        },
      );

      expect(repo).toEqual(mockRepo);
    });

    it('should return null for 404 response', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 404,
      });

      const repo = await client.getRepository('org', 'project', 'non-existent', 'token1');

      expect(repo).toBeNull();
    });

    it('should throw UnauthorizedException for 401 response', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 401,
      });

      await expect(
        client.getRepository('org', 'project', 'my-repo', 'invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getFileContent', () => {
    it('should get file content with valid credentials', async () => {
      const mockContent = 'File content here';

      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: { content: mockContent },
      });

      const content = await client.getFileContent(
        'org',
        'project',
        'my-repo',
        'path/to/file.txt',
        'main',
        'token1',
      );

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/org/project/_apis/git/repositories/my-repo/items',
        expect.objectContaining({
          params: expect.objectContaining({
            'api-version': AzureDevOpsApiClient.API_VERSION,
            path: 'path/to/file.txt',
            includeContent: true,
          }),
          headers: {
            Authorization: 'Bearer token1',
          },
        }),
      );

      expect(content).toBe(mockContent);
    });

    it('should include branch in request when specified', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 200,
        data: { content: 'content' },
      });

      await client.getFileContent('org', 'project', 'my-repo', 'file.txt', 'develop', 'token1');

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        '/org/project/_apis/git/repositories/my-repo/items',
        expect.objectContaining({
          params: expect.objectContaining({
            versionDescriptor: JSON.stringify({
              version: 'develop',
              versionType: 'branch',
            }),
          }),
        }),
      );
    });

    it('should return null for 404 response', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 404,
      });

      const content = await client.getFileContent(
        'org',
        'project',
        'my-repo',
        'non-existent.txt',
        null,
        'token1',
      );

      expect(content).toBeNull();
    });

    it('should throw UnauthorizedException for 401 response', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        status: 401,
      });

      await expect(
        client.getFileContent('org', 'project', 'my-repo', 'file.txt', null, 'invalid-token'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
