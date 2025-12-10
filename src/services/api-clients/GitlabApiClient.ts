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
import {
  GitlabUser,
  GitlabPersonalAccessTokenInfo,
  ScmApiClient,
  SCM_API_ERRORS,
} from '../../models/ScmApiModels';
import { UnauthorizedException } from '../../models/UnauthorizedException';

/**
 * GitLab API Client
 *
 * Handles communication with GitLab API for user data, projects, etc.
 * Based on: org.eclipse.che.api.factory.server.gitlab.GitlabApiClient
 */
export class GitlabApiClient implements ScmApiClient {
  private readonly apiServerUrl: string;
  private readonly scmServerUrl: string;
  private readonly httpClient: AxiosInstance;
  private readonly httpClientWithCert: AxiosInstance;

  public static readonly GITLAB_API_SERVER = 'https://gitlab.com';
  private static readonly DEFAULT_TIMEOUT = 10000; // 10 seconds

  /**
   * Create a new GitLab API client
   * @param serverUrl GitLab server URL (e.g., 'https://gitlab.com' or 'https://gitlab.example.com')
   */
  constructor(serverUrl?: string | null) {
    // Determine API server URL based on server URL
    if (!serverUrl || serverUrl === '') {
      this.apiServerUrl = GitlabApiClient.GITLAB_API_SERVER;
      this.scmServerUrl = GitlabApiClient.GITLAB_API_SERVER;
    } else {
      // Remove trailing slash
      this.scmServerUrl = serverUrl.replace(/\/$/, '');
      this.apiServerUrl = this.scmServerUrl;
    }

    const config = {
      baseURL: `${this.apiServerUrl}/api/v4`,
      timeout: GitlabApiClient.DEFAULT_TIMEOUT,
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
      // For other errors, try with certificate validation (for self-hosted GitLab)
      return await this.httpClientWithCert[method](url, config);
    }
  }

  /**
   * Get GitLab user information
   * @param token OAuth or Personal Access Token
   * @returns GitLab user object
   */
  async getUser(token: string): Promise<GitlabUser | null> {
    try {
      const response = await this.makeRequest('get', '/user', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      this.handleErrorResponse(response);

      if (response.status === 204) {
        return null; // No content
      }

      return response.data as GitlabUser;
    } catch (error) {
      throw this.handleError(error, 'Failed to get GitLab user');
    }
  }

  /**
   * Get Personal Access Token information
   * @param token Personal Access Token
   * @returns Token information including scopes
   */
  async getPersonalAccessTokenInfo(token: string): Promise<GitlabPersonalAccessTokenInfo | null> {
    try {
      const response = await this.makeRequest('get', '/personal_access_tokens/self', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      this.handleErrorResponse(response);

      if (response.status === 204) {
        return null;
      }

      return response.data as GitlabPersonalAccessTokenInfo;
    } catch (error) {
      throw this.handleError(error, 'Failed to get GitLab PAT info');
    }
  }

  /**
   * Check if this client is connected to the given SCM server URL
   * @param scmServerUrl The SCM server URL to check
   * @returns true if connected
   */
  isConnected(scmServerUrl: string): boolean {
    try {
      const normalizedInput = scmServerUrl.replace(/\/$/, ''); // Remove trailing slash
      const normalizedServer = this.scmServerUrl.replace(/\/$/, '');
      return normalizedInput === normalizedServer;
    } catch (error) {
      return false;
    }
  }

  /**
   * Handle HTTP error responses
   */
  private handleErrorResponse(response: any): void {
    if (response.status >= 200 && response.status < 300) {
      return; // Success
    }

    const errorMessage =
      typeof response.data === 'object' && response.data.message
        ? response.data.message
        : typeof response.data === 'string'
          ? response.data
          : 'Unrecognised error';

    switch (response.status) {
      case 400:
        throw new Error(`${SCM_API_ERRORS.BAD_REQUEST}: ${errorMessage}`);
      case 401:
        throw new UnauthorizedException(errorMessage, 'gitlab', '2.0', this.buildOAuthUrl());
      case 404:
        throw new Error(`${SCM_API_ERRORS.NOT_FOUND}: ${errorMessage}`);
      default:
        throw new Error(
          `${SCM_API_ERRORS.COMMUNICATION}: HTTP ${response.status} - ${errorMessage}`,
        );
    }
  }

  /**
   * Handle axios errors
   */
  private handleError(error: any, context: string): Error {
    if (error instanceof UnauthorizedException) {
      return error;
    }

    if (isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.code === 'ECONNABORTED') {
        return new Error(`${SCM_API_ERRORS.COMMUNICATION}: ${context} - Request timeout`);
      }
      if (axiosError.code === 'ENOTFOUND') {
        return new Error(`${SCM_API_ERRORS.COMMUNICATION}: ${context} - Server not found`);
      }
      return new Error(`${SCM_API_ERRORS.COMMUNICATION}: ${context} - ${axiosError.message}`);
    }

    return new Error(`${SCM_API_ERRORS.COMMUNICATION}: ${context} - ${error.message}`);
  }

  /**
   * Build OAuth authentication URL for GitLab
   */
  private buildOAuthUrl(): string {
    const apiEndpoint = process.env.CHE_API_ENDPOINT || 'http://localhost:8080';
    return `${apiEndpoint}/oauth/authenticate?oauth_provider=gitlab&scope=api&request_method=POST&signature_method=rsa`;
  }

  /**
   * Get the API server URL
   */
  getApiServerUrl(): string {
    return `${this.apiServerUrl}/api/v4`;
  }

  /**
   * Get the SCM server URL
   */
  getScmServerUrl(): string {
    return this.scmServerUrl;
  }
}
