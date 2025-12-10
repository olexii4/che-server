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
  GithubUser,
  GithubPullRequest,
  ScmApiClient,
  SCM_API_ERRORS,
} from '../../models/ScmApiModels';
import { UnauthorizedException } from '../../models/UnauthorizedException';

/**
 * GitHub API Client
 *
 * Handles communication with GitHub API for user data, pull requests, etc.
 * Based on: org.eclipse.che.api.factory.server.github.GithubApiClient
 */
export class GithubApiClient implements ScmApiClient {
  private readonly apiServerUrl: string;
  private readonly scmServerUrl: string;
  private readonly httpClient: AxiosInstance;
  private readonly httpClientWithCert: AxiosInstance;

  public static readonly GITHUB_API_SERVER = 'https://api.github.com';
  public static readonly GITHUB_SERVER = 'https://github.com';
  private static readonly DEFAULT_TIMEOUT = 10000; // 10 seconds

  /**
   * Create a new GitHub API client
   * @param serverUrl GitHub server URL (e.g., 'https://github.com' or 'https://github.enterprise.com')
   */
  constructor(serverUrl?: string | null) {
    // Determine API server URL based on server URL
    if (!serverUrl || serverUrl === '' || serverUrl === GithubApiClient.GITHUB_SERVER) {
      this.apiServerUrl = GithubApiClient.GITHUB_API_SERVER;
      this.scmServerUrl = GithubApiClient.GITHUB_SERVER;
    } else {
      // For GitHub Enterprise: use server/api/v3
      this.scmServerUrl = serverUrl;
      this.apiServerUrl = `${serverUrl}/api/v3`;
    }

    const config = {
      baseURL: this.apiServerUrl,
      timeout: GithubApiClient.DEFAULT_TIMEOUT,
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
      // For other errors, try with certificate validation (for enterprise/self-hosted)
      return await this.httpClientWithCert[method](url, config);
    }
  }

  /**
   * Get GitHub user information
   * @param token OAuth or Personal Access Token
   * @returns GitHub user object
   */
  async getUser(token: string): Promise<GithubUser | null> {
    try {
      const response = await this.makeRequest('get', '/user', {
        headers: {
          Authorization: `token ${token}`,
        },
      });

      this.handleErrorResponse(response);

      if (response.status === 204) {
        return null; // No content
      }

      return response.data as GithubUser;
    } catch (error) {
      throw this.handleError(error, 'Failed to get GitHub user');
    }
  }

  /**
   * Get GitHub pull request information
   * @param pullRequestId Pull request number
   * @param owner Repository owner
   * @param repo Repository name
   * @param token OAuth or Personal Access Token
   * @returns Pull request object
   */
  async getPullRequest(
    pullRequestId: string,
    owner: string,
    repo: string,
    token: string,
  ): Promise<GithubPullRequest | null> {
    try {
      const response = await this.makeRequest(
        'get',
        `/repos/${owner}/${repo}/pulls/${pullRequestId}`,
        {
          headers: {
            Authorization: `token ${token}`,
          },
        },
      );

      this.handleErrorResponse(response);

      if (response.status === 204) {
        return null;
      }

      return response.data as GithubPullRequest;
    } catch (error) {
      throw this.handleError(error, 'Failed to get GitHub pull request');
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

    const errorMessage = typeof response.data === 'string' ? response.data : 'Unrecognised error';

    switch (response.status) {
      case 400:
        throw new Error(`${SCM_API_ERRORS.BAD_REQUEST}: ${errorMessage}`);
      case 401:
        throw new UnauthorizedException(errorMessage, 'github', '2.0', this.buildOAuthUrl());
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
   * Build OAuth authentication URL for GitHub
   */
  private buildOAuthUrl(): string {
    const apiEndpoint = process.env.CHE_API_ENDPOINT || 'http://localhost:8080';
    return `${apiEndpoint}/oauth/authenticate?oauth_provider=github&scope=repo&request_method=POST&signature_method=rsa`;
  }

  /**
   * Get the API server URL
   */
  getApiServerUrl(): string {
    return this.apiServerUrl;
  }

  /**
   * Get the SCM server URL
   */
  getScmServerUrl(): string {
    return this.scmServerUrl;
  }
}
