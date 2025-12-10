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
 * GitHub User Model
 */
export interface GithubUser {
  id: number;
  login: string;
  email?: string | null;
  name?: string | null;
  avatar_url?: string;
  html_url?: string;
}

/**
 * GitHub Pull Request Model
 */
export interface GithubPullRequest {
  id: number;
  number: number;
  state: string; // 'open' | 'closed'
  title: string;
  head: {
    ref: string; // branch name
    sha: string; // commit SHA
  };
  base: {
    ref: string;
    sha: string;
  };
}

/**
 * GitLab User Model
 */
export interface GitlabUser {
  id: number;
  username: string;
  email?: string;
  name?: string;
  avatar_url?: string;
  web_url?: string;
}

/**
 * GitLab Personal Access Token Info
 */
export interface GitlabPersonalAccessTokenInfo {
  id: number;
  name: string;
  revoked: boolean;
  created_at: string;
  scopes: string[];
  user_id: number;
  last_used_at?: string | null;
  active: boolean;
  expires_at?: string | null;
}

/**
 * Bitbucket User Model
 */
export interface BitbucketUser {
  uuid: string;
  username: string;
  display_name?: string;
  account_id: string;
  nickname?: string;
  created_on?: string;
  type: string;
  links?: {
    self: { href: string };
    avatar: { href: string };
    html: { href: string };
  };
}

/**
 * Bitbucket Email Model
 */
export interface BitbucketEmail {
  is_primary: boolean;
  is_confirmed: boolean;
  email: string;
  type: string;
}

/**
 * Azure DevOps User Profile
 */
export interface AzureDevOpsUserProfile {
  id: string;
  displayName?: string;
  emailAddress?: string;
  publicAlias?: string;
  coreRevision?: number;
  timeStamp?: string;
  revision?: number;
}

/**
 * Azure DevOps User (alias for consistency with other SCM clients)
 */
export type AzureDevOpsUser = AzureDevOpsUserProfile;

/**
 * Azure DevOps OAuth Token Response
 */
export interface AzureDevOpsTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

/**
 * Base SCM API Client Interface
 */
export interface ScmApiClient {
  /**
   * Get user information from SCM provider
   * @param token OAuth or Personal Access Token
   * @returns User information
   */
  getUser(token: string): Promise<any>;

  /**
   * Check if this client is connected to the given SCM server URL
   * @param scmServerUrl The SCM server URL to check
   * @returns true if connected
   */
  isConnected(scmServerUrl: string): boolean;
}

/**
 * SCM API Error Codes
 */
export const SCM_API_ERRORS = {
  UNAUTHORIZED: 'ScmUnauthorized',
  NOT_FOUND: 'ScmItemNotFound',
  BAD_REQUEST: 'ScmBadRequest',
  COMMUNICATION: 'ScmCommunication',
} as const;
