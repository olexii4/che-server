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
 * SCM (Source Control Management) models
 *
 * Based on Java interface:
 * - org.eclipse.che.api.factory.server.ScmFileResolver
 */

/**
 * SCM File Resolver interface
 *
 * Defines a resolver that will resolve particular file content in specified SCM repository.
 */
export interface ScmFileResolver {
  /**
   * Resolver acceptance based on the given repository URL
   *
   * @param repository - Repository URL to resolve file
   * @returns true if it will be accepted by the resolver implementation
   */
  accept(repository: string): boolean;

  /**
   * Resolves particular file in the given repository
   *
   * @param repository - Repository URL to resolve file
   * @param filePath - Path to the desired file
   * @param authorization - Optional Authorization header for private repositories
   * @returns Promise resolving to content of the file
   * @throws Error if the given file is absent or other error occurs
   */
  fileContent(repository: string, filePath: string, authorization?: string): Promise<string>;
}

/**
 * SCM Provider types
 */
export enum ScmProviderType {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  BITBUCKET = 'bitbucket',
  AZURE_DEVOPS = 'azure-devops',
  GENERIC = 'generic',
}

/**
 * SCM Repository information
 */
export interface ScmRepository {
  url: string;
  provider: ScmProviderType;
  owner?: string;
  name?: string;
  branch?: string;
}

/**
 * SCM Constants
 */
export const SCM_CONSTANTS = {
  /** Error messages */
  ERRORS: {
    REPOSITORY_REQUIRED: 'Repository parameter is required',
    FILE_REQUIRED: 'File parameter is required',
    NO_RESOLVER: 'Cannot find suitable file resolver for the provided URL',
    FILE_NOT_FOUND: 'Requested file not found in repository',
    FETCH_FAILED: 'Failed to fetch file content from repository',
  },

  /** Default branch names */
  DEFAULT_BRANCHES: ['main', 'master', 'develop'],

  /** File path patterns */
  DEVFILE_PATTERNS: ['devfile.yaml', '.devfile.yaml', 'devfile.yml', '.devfile.yml'],
} as const;
