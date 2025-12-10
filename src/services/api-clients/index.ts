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
 * SCM API Clients
 *
 * Provides HTTP clients for interacting with SCM provider APIs
 * (GitHub, GitLab, Bitbucket, Azure DevOps)
 */

export { GithubApiClient } from './GithubApiClient';
export { GitlabApiClient } from './GitlabApiClient';
export { BitbucketApiClient } from './BitbucketApiClient';
export { AzureDevOpsApiClient } from './AzureDevOpsApiClient';

// Re-export models for convenience
export type {
  GithubUser,
  GithubPullRequest,
  GitlabUser,
  GitlabPersonalAccessTokenInfo,
  BitbucketUser,
  BitbucketEmail,
  AzureDevOpsUser,
  AzureDevOpsUserProfile,
  AzureDevOpsTokenResponse,
  ScmApiClient,
} from '../../models/ScmApiModels';

export { SCM_API_ERRORS } from '../../models/ScmApiModels';
