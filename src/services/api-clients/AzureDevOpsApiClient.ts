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

import { AxiosInstance, AxiosError, isAxiosError } from 'axios';
import { axiosInstance, axiosInstanceNoCert } from '../../helpers/getCertificateAuthority';
import { AzureDevOpsUser, ScmApiClient, SCM_API_ERRORS } from '../../models/ScmApiModels';
import { UnauthorizedException } from '../../models/UnauthorizedException';

/**
 * Azure DevOps API Client
 *
 * Handles communication with Azure DevOps API for user data, projects, repositories, etc.
 * Based on: org.eclipse.che.api.factory.server.azure.devops.AzureDevOpsApiClient
 *
 * Azure DevOps API Documentation:
 * - Profile API: https://learn.microsoft.com/en-us/rest/api/azure/devops/profile/
 * - Git API: https://learn.microsoft.com/en-us/rest/api/azure/devops/git/
 */
export class AzureDevOpsApiClient implements ScmApiClient {
  private readonly apiServerUrl: string;
  private readonly scmServerUrl: string;
  private readonly httpClient: AxiosInstance;
  private readonly httpClientWithCert: AxiosInstance;

  public static readonly AZURE_DEVOPS_API_SERVER = 'https://app.vssps.visualstudio.com';
  public static readonly AZURE_DEVOPS_SERVER = 'https://dev.azure.com';
  public static readonly API_VERSION = '7.0';
  private static readonly DEFAULT_TIMEOUT = 10000; // 10 seconds

  /**
   * Create a new Azure DevOps API client
   * @param serverUrl Azure DevOps server URL (e.g., 'https://dev.azure.com' or custom instance)
   */
  constructor(serverUrl?: string | null) {
    // Determine API server URL based on server URL
    if (!serverUrl || serverUrl === '' || serverUrl === AzureDevOpsApiClient.AZURE_DEVOPS_SERVER) {
      this.apiServerUrl = AzureDevOpsApiClient.AZURE_DEVOPS_API_SERVER;
      this.scmServerUrl = AzureDevOpsApiClient.AZURE_DEVOPS_SERVER;
    } else {
      // For Azure DevOps Server (on-premises)
      this.scmServerUrl = serverUrl.replace(/\/$/, '');
      this.apiServerUrl = this.scmServerUrl;
    }

    const config = {
      baseURL: this.apiServerUrl,
      timeout: AzureDevOpsApiClient.DEFAULT_TIMEOUT,
      headers: {
        Accept: 'application/json',
      },
      maxRedirects: 5,
      validateStatus: () => true, // Handle all status codes manually
    };

    // Create two axios instances: one without cert validation, one with
    this.httpClient = axiosInstanceNoCert.create(config);
    this.httpClientWithCert = axiosInstance.create(config);
  }

  /**
   * Make an HTTP request with fallback to certificate-validated instance
   * Follows che-dashboard pattern: try without cert first, then with cert if needed
   */
  private async makeRequest<T = any>(
    method: 'get' | 'post' | 'put' | 'delete',
    url: string,
    config?: any,
  ): Promise<T> {
    try {
      // Try without certificate validation first (for public APIs)
      return await this.httpClient[method](url, config);
    } catch (error: any) {
      // If 404, don't retry (resource truly doesn't exist)
      if (error.response?.status === 404) {
        throw error;
      }
      // For other errors, try with certificate validation (for on-premises instances)
      return await this.httpClientWithCert[method](url, config);
    }
  }

  /**
   * Get Azure DevOps user information
   * @param token OAuth or Personal Access Token
   * @returns Azure DevOps user object
   */
  async getUser(token: string): Promise<AzureDevOpsUser | null> {
    try {
      // Azure DevOps Profile API endpoint
      const response = await this.makeRequest('get', `/_apis/profile/profiles/me`, {
        params: {
          'api-version': AzureDevOpsApiClient.API_VERSION,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException(
          SCM_API_ERRORS.UNAUTHORIZED,
          'azure-devops',
          '2.0',
          '', // Will be filled by caller
        );
      }

      if (response.status !== 200) {
        throw new Error(`Failed to get user info: ${response.status} ${response.statusText}`);
      }

      const data = response.data;
      return {
        id: data.id,
        displayName: data.displayName,
        emailAddress: data.emailAddress,
        publicAlias: data.publicAlias,
        coreRevision: data.coreRevision,
        timeStamp: data.timeStamp,
        revision: data.revision,
      };
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
          throw new UnauthorizedException(
            SCM_API_ERRORS.UNAUTHORIZED,
            'azure-devops',
            '2.0',
            '', // Will be filled by caller
          );
        }
        throw new Error(`Azure DevOps API error: ${axiosError.message}`);
      }

      throw new Error(`Failed to get Azure DevOps user: ${error.message || String(error)}`);
    }
  }

  /**
   * Get Azure DevOps user by username
   * @param username User's public alias or email
   * @param token OAuth or Personal Access Token
   * @returns Azure DevOps user object
   */
  async getUserByUsername(username: string, token: string): Promise<AzureDevOpsUser | null> {
    try {
      // For Azure DevOps, we typically use the profile API with the current user
      // Username-based lookup is less common, so we'll use the current user endpoint
      return await this.getUser(token);
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new Error(
        `Failed to get Azure DevOps user by username: ${error.message || String(error)}`,
      );
    }
  }

  /**
   * Get the SCM server URL
   * @returns SCM server URL (e.g., 'https://dev.azure.com')
   */
  getServerUrl(): string {
    return this.scmServerUrl;
  }

  /**
   * Get the API server URL
   * @returns API server URL
   */
  getApiServerUrl(): string {
    return this.apiServerUrl;
  }

  /**
   * Check if this client is connected to the given SCM server URL
   * @param scmServerUrl The SCM server URL to check
   * @returns true if connected
   */
  isConnected(scmServerUrl: string): boolean {
    const normalizedUrl = scmServerUrl.replace(/\/$/, '').toLowerCase();
    const normalizedServerUrl = this.scmServerUrl.toLowerCase();
    return (
      normalizedUrl === normalizedServerUrl ||
      normalizedUrl === AzureDevOpsApiClient.AZURE_DEVOPS_SERVER.toLowerCase() ||
      normalizedUrl.includes('dev.azure.com') ||
      normalizedUrl.includes('visualstudio.com')
    );
  }

  /**
   * Check if a token is valid by attempting to get user info
   * @param token OAuth or Personal Access Token
   * @returns true if token is valid, false otherwise
   */
  async isTokenValid(token: string): Promise<boolean> {
    try {
      await this.getUser(token);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get repository information
   * @param organization Organization name
   * @param project Project name
   * @param repository Repository name
   * @param token OAuth or Personal Access Token
   * @returns Repository information
   */
  async getRepository(
    organization: string,
    project: string,
    repository: string,
    token: string,
  ): Promise<any> {
    try {
      const url = `/${organization}/${project}/_apis/git/repositories/${repository}`;
      const response = await this.makeRequest('get', url, {
        params: {
          'api-version': AzureDevOpsApiClient.API_VERSION,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException(SCM_API_ERRORS.UNAUTHORIZED, 'azure-devops', '2.0', '');
      }

      if (response.status === 404) {
        return null;
      }

      if (response.status !== 200) {
        throw new Error(`Failed to get repository: ${response.status} ${response.statusText}`);
      }

      return response.data;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
          throw new UnauthorizedException(SCM_API_ERRORS.UNAUTHORIZED, 'azure-devops', '2.0', '');
        }
        if (axiosError.response?.status === 404) {
          return null;
        }
        throw new Error(`Azure DevOps API error: ${axiosError.message}`);
      }

      throw new Error(`Failed to get repository: ${error.message || String(error)}`);
    }
  }

  /**
   * Get file content from repository
   * @param organization Organization name
   * @param project Project name
   * @param repository Repository name
   * @param path File path
   * @param branch Branch name (optional, defaults to default branch)
   * @param token OAuth or Personal Access Token
   * @returns File content as string
   */
  async getFileContent(
    organization: string,
    project: string,
    repository: string,
    path: string,
    branch: string | null,
    token: string,
  ): Promise<string | null> {
    try {
      const url = `/${organization}/${project}/_apis/git/repositories/${repository}/items`;
      const params: any = {
        'api-version': AzureDevOpsApiClient.API_VERSION,
        path: path,
        includeContent: true,
      };

      if (branch) {
        params.versionDescriptor = JSON.stringify({
          version: branch,
          versionType: 'branch',
        });
      }

      const response = await this.makeRequest('get', url, {
        params,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        throw new UnauthorizedException(SCM_API_ERRORS.UNAUTHORIZED, 'azure-devops', '2.0', '');
      }

      if (response.status === 404) {
        return null;
      }

      if (response.status !== 200) {
        throw new Error(`Failed to get file content: ${response.status} ${response.statusText}`);
      }

      return response.data.content || null;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      if (isAxiosError(error)) {
        const axiosError = error as AxiosError;
        if (axiosError.response?.status === 401 || axiosError.response?.status === 403) {
          throw new UnauthorizedException(SCM_API_ERRORS.UNAUTHORIZED, 'azure-devops', '2.0', '');
        }
        if (axiosError.response?.status === 404) {
          return null;
        }
        throw new Error(`Azure DevOps API error: ${axiosError.message}`);
      }

      throw new Error(`Failed to get file content: ${error.message || String(error)}`);
    }
  }
}
