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

/**
 * OAuth/SCM Unauthorized Exception
 *
 * Thrown when accessing private SCM repositories without proper authentication
 * Based on: org.eclipse.che.api.factory.server.scm.exception.ScmUnauthorizedException
 */
export class UnauthorizedException extends Error {
  public readonly statusCode: number = 401;
  public readonly oauthProvider: string;
  public readonly oauthVersion: string;
  public readonly authenticateUrl: string;

  constructor(
    message: string,
    oauthProvider: string,
    oauthVersion: string = '2.0',
    authenticateUrl: string,
  ) {
    super(message);
    this.name = 'UnauthorizedException';
    this.oauthProvider = oauthProvider;
    this.oauthVersion = oauthVersion;
    this.authenticateUrl = authenticateUrl;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, UnauthorizedException);
    }
  }

  /**
   * Convert to API response format
   * Matches the Java implementation's response structure
   */
  toJSON() {
    return {
      errorCode: this.statusCode,
      message: this.message,
      attributes: {
        oauth_provider: this.oauthProvider,
        oauth_version: this.oauthVersion,
        oauth_authentication_url: this.authenticateUrl,
      },
    };
  }
}

/**
 * Helper function to build OAuth authentication URL
 *
 * Based on: BitbucketPersonalAccessTokenFetcher.getLocalAuthenticateUrl()
 */
export function buildOAuthAuthenticateUrl(
  apiEndpoint: string,
  oauthProvider: string,
  scope: string = 'repository',
  requestMethod: string = 'POST',
  signatureMethod: string = 'rsa',
): string {
  const params = new URLSearchParams({
    oauth_provider: oauthProvider,
    scope,
    request_method: requestMethod,
    signature_method: signatureMethod,
  });

  // Ensure apiEndpoint doesn't end with slash and add /api prefix
  const baseUrl = apiEndpoint.endsWith('/') ? apiEndpoint.slice(0, -1) : apiEndpoint;
  return `${baseUrl}/api/oauth/authenticate?${params.toString()}`;
}

/**
 * Detect OAuth provider from repository URL
 */
export function detectOAuthProvider(repositoryUrl: string): string {
  const url = repositoryUrl.toLowerCase();

  if (url.includes('github.com') || url.includes('github')) {
    return 'github';
  }
  if (url.includes('gitlab.com') || url.includes('gitlab')) {
    return 'gitlab';
  }
  if (url.includes('bitbucket.org') || url.includes('bitbucket')) {
    return 'bitbucket';
  }
  if (url.includes('azure.com') || url.includes('visualstudio.com')) {
    return 'azure-devops';
  }

  return 'unknown';
}

/**
 * Check if HTTP status indicates authentication is required
 */
export function isAuthenticationError(statusCode: number): boolean {
  return statusCode === 401 || statusCode === 403;
}
