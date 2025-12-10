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
  BitbucketUser,
  BitbucketEmail,
  ScmApiClient,
  SCM_API_ERRORS,
} from '../../models/ScmApiModels';
import { UnauthorizedException } from '../../models/UnauthorizedException';

/**
 * Bitbucket API Client
 *
 * Handles communication with Bitbucket API for user data, repositories, etc.
 * Based on: org.eclipse.che.api.factory.server.bitbucket.BitbucketApiClient
 */
export class BitbucketApiClient implements ScmApiClient {
  private readonly apiServerUrl: string;
  private readonly scmServerUrl: string;
  private readonly httpClient: AxiosInstance;
  private readonly httpClientWithCert: AxiosInstance;

  public static readonly BITBUCKET_API_SERVER = 'https://api.bitbucket.org/2.0';
  public static readonly BITBUCKET_SERVER = 'https://bitbucket.org';
  public static readonly BITBUCKET_OAUTH_SCOPES_HEADER = 'X-OAuth-Scopes';
  private static readonly DEFAULT_TIMEOUT = 10000; // 10 seconds

  /**
   * Create a new Bitbucket API client
   * @param apiServerUrl Bitbucket API server URL (default: https://api.bitbucket.org/2.0)
   */
  constructor(apiServerUrl?: string | null) {
    // Use default API server if not provided
    this.apiServerUrl =
      apiServerUrl && apiServerUrl !== ''
        ? apiServerUrl.replace(/\/$/, '')
        : BitbucketApiClient.BITBUCKET_API_SERVER;

    this.scmServerUrl = BitbucketApiClient.BITBUCKET_SERVER;

    const config = {
      baseURL: this.apiServerUrl,
      timeout: BitbucketApiClient.DEFAULT_TIMEOUT,
      headers: {
        Accept: 'application/json',
      },
      maxRedirects: 50, // Bitbucket uses many redirects
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
      // For other errors, try with certificate validation (for enterprise Bitbucket)
      return await this.httpClientWithCert[method](url, config);
    }
  }

  /**
   * Get Bitbucket user information
   * @param token OAuth token
   * @returns Bitbucket user object
   */
  async getUser(token: string): Promise<BitbucketUser | null> {
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

      return response.data as BitbucketUser;
    } catch (error) {
      throw this.handleError(error, 'Failed to get Bitbucket user');
    }
  }

  /**
   * Get user email address
   * @param token OAuth token
   * @returns Primary email address
   */
  async getUserEmail(token: string): Promise<string | null> {
    try {
      const response = await this.makeRequest('get', '/user/emails', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      this.handleErrorResponse(response);

      if (response.status === 204) {
        return null;
      }

      const emailsResponse = response.data as { values: BitbucketEmail[] };
      const primaryEmail = emailsResponse.values?.find(email => email.is_primary);

      return primaryEmail?.email || null;
    } catch (error) {
      throw this.handleError(error, 'Failed to get Bitbucket user email');
    }
  }

  /**
   * Get file content from repository
   * @param workspace Workspace ID
   * @param repository Repository name
   * @param source Branch/commit SHA
   * @param path File path
   * @param token OAuth token
   * @returns File content as string
   */
  async getFileContent(
    workspace: string,
    repository: string,
    source: string,
    path: string,
    token: string,
  ): Promise<string> {
    try {
      const encodedPath = encodeURIComponent(path);
      const url = `/repositories/${workspace}/${repository}/src/${source}/${encodedPath}`;

      const response = await this.makeRequest('get', url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        responseType: 'text', // Get as text, not JSON
      });

      this.handleErrorResponse(response);

      return response.data;
    } catch (error) {
      throw this.handleError(error, 'Failed to get file content from Bitbucket');
    }
  }

  /**
   * Get token scopes and username
   * @param token OAuth token
   * @returns Pair of username and scopes array
   */
  async getTokenScopes(token: string): Promise<{ username: string; scopes: string[] }> {
    try {
      const response = await this.makeRequest('get', '/user', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      this.handleErrorResponse(response);

      const user = response.data as BitbucketUser;
      const scopesHeader =
        response.headers[BitbucketApiClient.BITBUCKET_OAUTH_SCOPES_HEADER] ||
        response.headers[BitbucketApiClient.BITBUCKET_OAUTH_SCOPES_HEADER.toLowerCase()];

      const scopes = scopesHeader
        ? scopesHeader
            .split(',')
            .map((s: string) => s.trim())
            .filter((s: string) => s.length > 0)
        : [];

      return {
        username: user.username || user.display_name || '',
        scopes,
      };
    } catch (error) {
      throw this.handleError(error, 'Failed to get Bitbucket token scopes');
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
      typeof response.data === 'object' && response.data.error
        ? response.data.error.message || JSON.stringify(response.data)
        : typeof response.data === 'string'
          ? response.data
          : 'Unrecognised error';

    switch (response.status) {
      case 400:
        throw new Error(`${SCM_API_ERRORS.BAD_REQUEST}: ${errorMessage}`);
      case 401:
        throw new UnauthorizedException(errorMessage, 'bitbucket', '2.0', this.buildOAuthUrl());
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
   * Build OAuth authentication URL for Bitbucket
   */
  private buildOAuthUrl(): string {
    const apiEndpoint = process.env.CHE_API_ENDPOINT || 'http://localhost:8080';
    return `${apiEndpoint}/oauth/authenticate?oauth_provider=bitbucket&scope=repository&request_method=POST&signature_method=rsa`;
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
