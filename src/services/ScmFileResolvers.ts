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

import { ScmFileResolver, SCM_CONSTANTS } from '../models/ScmModels';
import { UrlParserService } from './UrlParsers';
import { DEFAULT_DEVFILE_FILENAMES } from './FactoryParametersResolver';
import {
  UnauthorizedException,
  buildOAuthAuthenticateUrl,
  isAuthenticationError,
} from '../models/UnauthorizedException';
import { axiosInstance, axiosInstanceNoCert } from '../helpers/getCertificateAuthority';
import { logger } from '../utils/logger';

/**
 * Generic SCM File Resolver
 *
 * Resolves files from any Git-based repository using raw file URLs
 */
export class GenericScmFileResolver implements ScmFileResolver {
  accept(repository: string): boolean {
    try {
      new URL(repository);
      return true;
    } catch {
      return false;
    }
  }

  async fileContent(repository: string, filePath: string, authorization?: string): Promise<string> {
    try {
      // Try to fetch the file directly
      const fileUrl = this.buildFileUrl(repository, filePath);

      const headers: Record<string, string> = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      };
      if (authorization) {
        headers['Authorization'] = authorization;
      }

      const config = {
        headers,
        validateStatus: () => true, // Don't throw on any status code
      };

      let axiosResponse;
      try {
        // Try without certificate validation first (for public URLs)
        axiosResponse = await axiosInstanceNoCert.get(fileUrl, config);
      } catch (error: any) {
        // If 404, don't retry with cert validation
        if (error.response?.status === 404) {
          throw new Error(SCM_CONSTANTS.ERRORS.FILE_NOT_FOUND);
        }
        // For other errors, try with certificate validation
        axiosResponse = await axiosInstance.get(fileUrl, config);
      }

      if (axiosResponse.status !== 200) {
        throw new Error(`HTTP ${axiosResponse.status}: ${axiosResponse.statusText}`);
      }

      return axiosResponse.data;
    } catch (error: any) {
      throw new Error(`${SCM_CONSTANTS.ERRORS.FETCH_FAILED}: ${error.message}`);
    }
  }

  private buildFileUrl(repository: string, filePath: string): string {
    // If repository already includes the file path, return as is
    if (repository.includes(filePath)) {
      return repository;
    }

    // Otherwise append file path
    const baseUrl = repository.endsWith('/') ? repository : `${repository}/`;
    return `${baseUrl}${filePath}`;
  }
}

/**
 * GitHub File Resolver
 *
 * Resolves files from GitHub repositories with automatic devfile filename detection
 *
 * Based on: org.eclipse.che.api.factory.server.github.GithubScmFileResolver
 */
export class GitHubFileResolver implements ScmFileResolver {
  accept(repository: string): boolean {
    return repository.includes('github.com') || repository.includes('github');
  }

  /**
   * Get file content from GitHub repository
   * If filePath is not provided, tries all configured devfile filenames
   */
  async fileContent(
    repository: string,
    filePath?: string,
    authorization?: string,
  ): Promise<string> {
    try {
      // If specific file path is provided, fetch it directly
      if (filePath) {
        return await this.fetchFile(repository, filePath, authorization);
      }

      // Otherwise, try all devfile filenames until one works
      return await this.tryDevfileFilenames(repository, authorization);
    } catch (error: any) {
      // Re-throw UnauthorizedException as-is
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new Error(`${SCM_CONSTANTS.ERRORS.FETCH_FAILED}: ${error.message}`);
    }
  }

  /**
   * Try to fetch devfile using all configured devfile filenames
   * Returns content of the first file that exists
   */
  private async tryDevfileFilenames(repository: string, authorization?: string): Promise<string> {
    const parsedUrl = UrlParserService.parse(repository);

    if (!parsedUrl) {
      throw new Error('Unable to parse repository URL');
    }

    const devfileLocations = parsedUrl.devfileFileLocations();
    const errors: string[] = [];

    for (const location of devfileLocations) {
      try {
        logger.info(`[GitHubFileResolver] Trying to fetch devfile from: ${location.location}`);
        const content = await this.fetchFromUrl(location.location, repository, authorization);
        logger.info(`[GitHubFileResolver] Successfully fetched devfile: ${location.filename}`);
        return content;
      } catch (error: any) {
        // If authentication error, throw immediately (don't try other filenames)
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        errors.push(`${location.filename}: ${error.message}`);
        // Continue to next filename
      }
    }

    throw new Error(
      `No devfile found. Tried: ${devfileLocations.map(l => l.filename).join(', ')}. Errors: ${errors.join('; ')}`,
    );
  }

  /**
   * Fetch specific file from repository
   */
  private async fetchFile(
    repository: string,
    filePath: string,
    authorization?: string,
  ): Promise<string> {
    const parsedUrl = UrlParserService.parse(repository);

    if (!parsedUrl) {
      // Fallback to direct URL construction
      return await this.fetchFromUrl(
        this.buildFallbackRawUrl(repository, filePath),
        repository,
        authorization,
      );
    }

    const rawUrl = parsedUrl.rawFileLocation(filePath);
    return await this.fetchFromUrl(rawUrl, repository, authorization);
  }

  /**
   * Fetch content from URL using axios with try-retry pattern
   * First tries without certificate validation (for public repos)
   * Then retries with certificate validation (for self-signed certs)
   *
   * Similar to GitLab and Bitbucket, GitHub returns 404 for private repositories when accessed without auth
   */
  private async fetchFromUrl(
    url: string,
    repository: string,
    authorization?: string,
  ): Promise<string> {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    };

    if (authorization) {
      headers['Authorization'] = authorization;
    }

    const config = {
      headers,
      validateStatus: () => true, // Don't throw on any status code
    };

    let axiosResponse;
    try {
      // Try without certificate validation first (for public URLs)
      axiosResponse = await axiosInstanceNoCert.get(url, config);
    } catch (error: any) {
      // If 404, check if we should treat it as authentication error
      if (error.response?.status === 404) {
        if (!authorization) {
          // No auth + 404 = might be private repo
          logger.info(
            `[GitHubFileResolver] 404 without authorization - treating as potential private repository`,
          );
          const oauthProvider = 'github';
          const authenticateUrl = buildOAuthAuthenticateUrl(
            process.env.CHE_API_ENDPOINT || 'http://localhost:8080',
            oauthProvider,
            'repo',
            'POST',
            'rsa',
          );
          throw new UnauthorizedException(
            'SCM Authentication required',
            oauthProvider,
            '2.0',
            authenticateUrl,
          );
        }

        // Check if Basic auth was provided - GitHub doesn't support Basic auth, so 404 means auth failed
        if (authorization && authorization.startsWith('Basic ')) {
          logger.info(
            `[GitHubFileResolver] 404 with Basic auth - GitHub requires OAuth token (Bearer), not Basic auth`,
          );
          const oauthProvider = 'github';
          const authenticateUrl = buildOAuthAuthenticateUrl(
            process.env.CHE_API_ENDPOINT || 'http://localhost:8080',
            oauthProvider,
            'repo',
            'POST',
            'rsa',
          );
          throw new UnauthorizedException(
            'SCM Authentication required',
            oauthProvider,
            '2.0',
            authenticateUrl,
          );
        }

        throw new Error(SCM_CONSTANTS.ERRORS.FILE_NOT_FOUND);
      }
      // For other errors, try with certificate validation
      axiosResponse = await axiosInstance.get(url, config);
    }

    if (axiosResponse.status === 404) {
      if (!authorization) {
        // No auth + 404 = might be private repo
        logger.info(
          `[GitHubFileResolver] 404 without authorization - treating as potential private repository`,
        );
        const oauthProvider = 'github';
        const authenticateUrl = buildOAuthAuthenticateUrl(
          process.env.CHE_API_ENDPOINT || 'http://localhost:8080',
          oauthProvider,
          'repo',
          'POST',
          'rsa',
        );
        throw new UnauthorizedException(
          'SCM Authentication required',
          oauthProvider,
          '2.0',
          authenticateUrl,
        );
      }

      // Check if Basic auth was provided - GitHub doesn't support Basic auth, so 404 means auth failed
      if (authorization && authorization.startsWith('Basic ')) {
        logger.info(
          `[GitHubFileResolver] 404 with Basic auth - GitHub requires OAuth token (Bearer), not Basic auth`,
        );
        const oauthProvider = 'github';
        const authenticateUrl = buildOAuthAuthenticateUrl(
          process.env.CHE_API_ENDPOINT || 'http://localhost:8080',
          oauthProvider,
          'repo',
          'POST',
          'rsa',
        );
        throw new UnauthorizedException(
          'SCM Authentication required',
          oauthProvider,
          '2.0',
          authenticateUrl,
        );
      }

      throw new Error(SCM_CONSTANTS.ERRORS.FILE_NOT_FOUND);
    }

    if (axiosResponse.status !== 200) {
      throw new Error(`HTTP ${axiosResponse.status}: ${axiosResponse.statusText}`);
    }

    return axiosResponse.data;
  }

  /**
   * Fallback method to build raw URL (for backward compatibility)
   */
  private buildFallbackRawUrl(repository: string, filePath: string): string {
    const repoUrl = new URL(repository);
    const pathParts = repoUrl.pathname.split('/').filter(p => p);

    if (pathParts.length < 2) {
      throw new Error('Invalid GitHub repository URL');
    }

    const owner = pathParts[0];
    const repo = pathParts[1].replace(/\.git$/, '');
    const branch = pathParts[3] || 'HEAD';

    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
  }
}

/**
 * GitLab File Resolver
 *
 * Resolves files from GitLab repositories with automatic devfile filename detection
 *
 * Based on: org.eclipse.che.api.factory.server.gitlab.GitlabScmFileResolver
 */
export class GitLabFileResolver implements ScmFileResolver {
  accept(repository: string): boolean {
    return repository.includes('gitlab.com') || repository.includes('gitlab');
  }

  /**
   * Get file content from GitLab repository
   * If filePath is not provided, tries all configured devfile filenames
   */
  async fileContent(
    repository: string,
    filePath?: string,
    authorization?: string,
  ): Promise<string> {
    try {
      // If specific file path is provided, fetch it directly
      if (filePath) {
        return await this.fetchFile(repository, filePath, authorization);
      }

      // Otherwise, try all devfile filenames until one works
      return await this.tryDevfileFilenames(repository, authorization);
    } catch (error: any) {
      // Re-throw UnauthorizedException as-is
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new Error(`${SCM_CONSTANTS.ERRORS.FETCH_FAILED}: ${error.message}`);
    }
  }

  /**
   * Try to fetch devfile using all configured devfile filenames
   * Returns content of the first file that exists
   */
  private async tryDevfileFilenames(repository: string, authorization?: string): Promise<string> {
    const parsedUrl = UrlParserService.parse(repository);

    if (!parsedUrl) {
      throw new Error('Unable to parse repository URL');
    }

    const devfileLocations = parsedUrl.devfileFileLocations();
    const errors: string[] = [];

    for (const location of devfileLocations) {
      try {
        logger.info(`[GitLabFileResolver] Trying to fetch devfile from: ${location.location}`);
        const content = await this.fetchFromUrl(location.location, repository, authorization);
        logger.info(`[GitLabFileResolver] Successfully fetched devfile: ${location.filename}`);
        return content;
      } catch (error: any) {
        // If authentication error, throw immediately (don't try other filenames)
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        errors.push(`${location.filename}: ${error.message}`);
        // Continue to next filename
      }
    }

    throw new Error(
      `No devfile found. Tried: ${devfileLocations.map(l => l.filename).join(', ')}. Errors: ${errors.join('; ')}`,
    );
  }

  /**
   * Fetch specific file from repository
   */
  private async fetchFile(
    repository: string,
    filePath: string,
    authorization?: string,
  ): Promise<string> {
    const parsedUrl = UrlParserService.parse(repository);

    if (!parsedUrl) {
      // Fallback to direct URL construction
      return await this.fetchFromUrl(
        this.buildFallbackRawUrl(repository, filePath),
        repository,
        authorization,
      );
    }

    const rawUrl = parsedUrl.rawFileLocation(filePath);
    return await this.fetchFromUrl(rawUrl, repository, authorization);
  }

  /**
   * Fetch content from URL using axios with try-retry pattern
   * First tries without certificate validation (for public repos)
   * Then retries with certificate validation (for self-signed certs)
   *
   * Similar to Bitbucket, GitLab returns 404 for private repositories when accessed without auth
   */
  private async fetchFromUrl(
    url: string,
    repository: string,
    authorization?: string,
  ): Promise<string> {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
    };

    if (authorization) {
      headers['Authorization'] = authorization;
    }

    const config = {
      headers,
      validateStatus: () => true, // Don't throw on any status code
    };

    let axiosResponse;
    try {
      // Try without certificate validation first (for public URLs)
      axiosResponse = await axiosInstanceNoCert.get(url, config);
    } catch (error: any) {
      // If 404, check if we should treat it as authentication error
      if (error.response?.status === 404) {
        if (!authorization) {
          // No auth + 404 = might be private repo
          logger.info(
            `[GitLabFileResolver] 404 without authorization - treating as potential private repository`,
          );
          const oauthProvider = 'gitlab';
          const authenticateUrl = buildOAuthAuthenticateUrl(
            process.env.CHE_API_ENDPOINT || 'http://localhost:8080',
            oauthProvider,
            'api write_repository',
            'POST',
            'rsa',
          );
          throw new UnauthorizedException(
            'SCM Authentication required',
            oauthProvider,
            '2.0',
            authenticateUrl,
          );
        }
        throw new Error(SCM_CONSTANTS.ERRORS.FILE_NOT_FOUND);
      }
      // For other errors, try with certificate validation
      axiosResponse = await axiosInstance.get(url, config);
    }

    if (axiosResponse.status === 404) {
      if (!authorization) {
        // No auth + 404 = might be private repo
        logger.info(
          `[GitLabFileResolver] 404 without authorization - treating as potential private repository`,
        );
        const oauthProvider = 'gitlab';
        const authenticateUrl = buildOAuthAuthenticateUrl(
          process.env.CHE_API_ENDPOINT || 'http://localhost:8080',
          oauthProvider,
          'api write_repository',
          'POST',
          'rsa',
        );
        throw new UnauthorizedException(
          'SCM Authentication required',
          oauthProvider,
          '2.0',
          authenticateUrl,
        );
      }
      throw new Error(SCM_CONSTANTS.ERRORS.FILE_NOT_FOUND);
    }

    if (axiosResponse.status !== 200) {
      throw new Error(`HTTP ${axiosResponse.status}: ${axiosResponse.statusText}`);
    }

    return axiosResponse.data;
  }

  /**
   * Fallback method to build raw URL (for backward compatibility)
   * Uses GitLab API v4 to fetch raw file
   */
  private buildFallbackRawUrl(repository: string, filePath: string): string {
    const repoUrl = new URL(repository);
    const pathParts = repoUrl.pathname.split('/').filter(p => p);

    if (pathParts.length < 2) {
      throw new Error('Invalid GitLab repository URL');
    }

    // Join all path parts to form the project path (supports subgroups)
    let projectPath = pathParts.join('/');
    if (projectPath.endsWith('.git')) {
      projectPath = projectPath.substring(0, projectPath.length - 4);
    }

    const encodedPath = encodeURIComponent(projectPath);
    const encodedFilename = encodeURIComponent(filePath);
    const branch = 'HEAD';

    return `${repoUrl.protocol}//${repoUrl.host}/api/v4/projects/${encodedPath}/repository/files/${encodedFilename}/raw?ref=${branch}`;
  }
}

/**
 * Bitbucket File Resolver
 *
 * Resolves files from Bitbucket repositories with automatic devfile filename detection
 *
 * Based on: org.eclipse.che.api.factory.server.bitbucket.BitbucketScmFileResolver
 */
export class BitbucketFileResolver implements ScmFileResolver {
  private readonly apiEndpoint: string;

  constructor() {
    // Get API endpoint from environment or use default
    this.apiEndpoint = process.env.CHE_API_ENDPOINT || 'http://localhost:8080';
  }

  accept(repository: string): boolean {
    return repository.includes('bitbucket.org');
  }

  /**
   * Get file content from Bitbucket repository
   * If filePath is not provided, tries all configured devfile filenames
   */
  async fileContent(
    repository: string,
    filePath?: string,
    authorization?: string,
  ): Promise<string> {
    logger.info(`[BitbucketFileResolver] ========== fileContent called ==========`);
    logger.info(`[BitbucketFileResolver]   repository: ${repository}`);
    logger.info(`[BitbucketFileResolver]   filePath: ${filePath || '(empty - will try defaults)'}`);
    logger.info(
      `[BitbucketFileResolver]   authorization: ${authorization ? 'provided' : 'not provided'}`,
    );
    if (authorization) {
      logger.info(
        `[BitbucketFileResolver]   authorization value: ${authorization.substring(0, 30)}...`,
      );
    }

    try {
      // If specific file path is provided, fetch it directly
      if (filePath) {
        return await this.fetchFile(repository, filePath, authorization);
      }

      // Otherwise, try all devfile filenames until one works
      return await this.tryDevfileFilenames(repository, authorization);
    } catch (error: any) {
      // Re-throw UnauthorizedException as-is
      if (error instanceof UnauthorizedException) {
        logger.info(`[BitbucketFileResolver] ❌ UnauthorizedException thrown`);
        throw error;
      }
      // Re-throw with original error message (don't add generic prefix)
      logger.info(`[BitbucketFileResolver] ❌ Error thrown: ${error.message}`);
      throw error;
    }
  }

  /**
   * Try to fetch devfile using all configured devfile filenames
   * Returns content of the first file that exists
   *
   * For Bitbucket, if the parsed branch is 'HEAD', we'll also try 'master' and 'main'
   * because Bitbucket doesn't resolve 'HEAD' like GitHub does
   */
  private async tryDevfileFilenames(repository: string, authorization?: string): Promise<string> {
    const parsedUrl = UrlParserService.parse(repository);

    if (!parsedUrl) {
      throw new Error('Unable to parse repository URL');
    }

    // Import BitbucketUrl type for type checking
    const { BitbucketUrl } = require('./UrlParsers');
    const isBitbucketUrl =
      parsedUrl instanceof BitbucketUrl || parsedUrl.providerName === 'bitbucket';

    // Determine which branches to try
    // Bitbucket doesn't resolve HEAD, so try common default branches
    const branchesToTry: string[] = [];
    const currentBranch = parsedUrl.branch || 'HEAD';

    if (isBitbucketUrl && currentBranch === 'HEAD') {
      // Try common default branches for Bitbucket
      branchesToTry.push('master', 'main', 'HEAD');
    } else {
      branchesToTry.push(currentBranch);
    }

    const errors: string[] = [];

    logger.info(
      `[BitbucketFileResolver] Trying ${DEFAULT_DEVFILE_FILENAMES.length} devfile filenames for repository: ${repository}`,
    );
    logger.info(`[BitbucketFileResolver] Authorization provided: ${authorization ? 'YES' : 'NO'}`);
    logger.info(`[BitbucketFileResolver] Branches to try: ${branchesToTry.join(', ')}`);

    // Try each branch
    for (const branch of branchesToTry) {
      logger.info(`[BitbucketFileResolver] Trying branch: ${branch}`);

      // Try each devfile filename with this branch
      for (const filename of DEFAULT_DEVFILE_FILENAMES) {
        try {
          logger.info(
            `[BitbucketFileResolver] Attempting to fetch: ${filename} from branch ${branch}`,
          );

          // Construct raw URL with specific branch
          let rawUrl: string;
          if (isBitbucketUrl && branch !== currentBranch) {
            // For Bitbucket, manually construct URL with different branch
            // Extract components from the original URL
            const urlMatch = repository.match(
              /https?:\/\/[^@]*@?bitbucket\.org\/([^/]+)\/([^/.]+)/,
            );
            if (urlMatch) {
              const workspace = urlMatch[1];
              const repo = urlMatch[2];
              rawUrl = `https://bitbucket.org/${workspace}/${repo}/raw/${branch}/${filename}`;
            } else {
              rawUrl = parsedUrl.rawFileLocation(filename);
            }
          } else {
            rawUrl = parsedUrl.rawFileLocation(filename);
          }

          logger.info(`[BitbucketFileResolver] Raw URL: ${rawUrl}`);
          const content = await this.fetchFromUrl(rawUrl, repository, authorization);
          logger.info(
            `[BitbucketFileResolver] ✅ Successfully fetched ${filename} from branch ${branch} (${content.length} bytes)`,
          );
          return content;
        } catch (error: any) {
          // If authentication error, throw immediately (don't try other filenames)
          if (error instanceof UnauthorizedException) {
            logger.info(`[BitbucketFileResolver] ❌ Authentication required`);
            throw error;
          }
          const errorMsg = error.message || String(error);
          logger.info(
            `[BitbucketFileResolver] ❌ Failed to fetch ${filename} from branch ${branch}: ${errorMsg}`,
          );
          errors.push(`${filename} (${branch}): ${errorMsg}`);
        }
      }
    }

    // None of the combinations worked
    const finalError = `No devfile found. Tried: ${errors.join(', ')}`;
    logger.info(`[BitbucketFileResolver] ❌ ${finalError}`);
    throw new Error(finalError);
  }

  /**
   * Fetch a specific file from Bitbucket repository
   * For Bitbucket, if HEAD branch fails, try master and main as well
   */
  private async fetchFile(
    repository: string,
    filePath: string,
    authorization?: string,
  ): Promise<string> {
    const parsedUrl = UrlParserService.parse(repository);

    if (!parsedUrl) {
      // Fallback to direct URL construction
      return await this.fetchFromUrl(
        this.buildFallbackRawUrl(repository, filePath),
        repository,
        authorization,
      );
    }

    // Import BitbucketUrl type for type checking
    const { BitbucketUrl } = require('./UrlParsers');
    const isBitbucketUrl =
      parsedUrl instanceof BitbucketUrl || parsedUrl.providerName === 'bitbucket';

    const currentBranch = parsedUrl.branch || 'HEAD';

    // For Bitbucket, if the branch is HEAD, try multiple branches
    // because Bitbucket doesn't resolve HEAD like GitHub does
    if (isBitbucketUrl && currentBranch === 'HEAD') {
      const branchesToTry = ['master', 'main', 'HEAD'];
      const errors: string[] = [];

      for (const branch of branchesToTry) {
        try {
          logger.info(
            `[BitbucketFileResolver] fetchFile: Trying branch ${branch} for file ${filePath}`,
          );

          // Extract workspace and repo from URL
          const urlMatch = repository.match(/https?:\/\/[^@]*@?bitbucket\.org\/([^/]+)\/([^/.]+)/);
          if (urlMatch) {
            const workspace = urlMatch[1];
            const repo = urlMatch[2];
            // Use Bitbucket API endpoint for raw file access
            const rawUrl = `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/src/${branch}/${filePath}`;
            return await this.fetchFromUrl(rawUrl, repository, authorization);
          }
        } catch (error: any) {
          // If authentication error, throw immediately
          if (error instanceof UnauthorizedException) {
            throw error;
          }
          // Don't throw on credentials error - might just be wrong branch
          if (!error.message?.includes('Invalid or expired credentials')) {
            errors.push(`${branch}: ${error.message || String(error)}`);
          } else {
            errors.push(`${branch}: credentials invalid or file not found`);
          }
          logger.info(
            `[BitbucketFileResolver] fetchFile: Failed with branch ${branch}: ${error.message}`,
          );
        }
      }

      // All branches failed
      throw new Error(`Failed to fetch ${filePath}: ${errors.join(', ')}`);
    }

    // Not Bitbucket or not HEAD branch - use default behavior
    const rawUrl = parsedUrl.rawFileLocation(filePath);
    return await this.fetchFromUrl(rawUrl, repository, authorization);
  }

  /**
   * Fetch content from URL
   */
  private async fetchFromUrl(
    url: string,
    repository?: string,
    authorization?: string,
  ): Promise<string> {
    // Check if fetch is available
    if (typeof fetch === 'undefined') {
      logger.error(`[BitbucketFileResolver] ERROR: fetch is not defined!`);
      throw new Error('fetch API is not available');
    }

    const headers: Record<string, string> = {};

    // Include Authorization header if provided
    // Bitbucket requires Basic Auth for raw file access, not Bearer tokens
    if (authorization) {
      logger.info(`[BitbucketFileResolver] ===== AUTHORIZATION CONVERSION =====`);
      logger.info(
        `[BitbucketFileResolver] Input authorization: ${authorization.substring(0, 30)}...`,
      );
      logger.info(
        `[BitbucketFileResolver] Starts with 'Bearer ': ${authorization.startsWith('Bearer ')}`,
      );

      // Convert Bearer token to Basic Auth for Bitbucket
      if (authorization.startsWith('Bearer ')) {
        const token = authorization.substring(7); // Remove 'Bearer ' prefix
        logger.info(`[BitbucketFileResolver] Extracted token: ${token.substring(0, 20)}...`);

        // Extract username from repository URL
        let username = 'x-token-auth'; // Default username for app passwords
        if (repository) {
          const match = repository.match(/https?:\/\/([^@]+)@/);
          if (match) {
            username = match[1];
            logger.info(`[BitbucketFileResolver] Extracted username from URL: ${username}`);
          } else {
            logger.info(`[BitbucketFileResolver] No username in URL, using default: ${username}`);
          }
        }

        // Construct Basic Auth: base64(username:token)
        const basicAuthCredentials = Buffer.from(`${username}:${token}`).toString('base64');
        const basicAuth = `Basic ${basicAuthCredentials}`;
        headers['Authorization'] = basicAuth;
        logger.info(`[BitbucketFileResolver] Created Basic Auth for user: ${username}`);
        logger.info(`[BitbucketFileResolver] Basic Auth value: ${basicAuth.substring(0, 30)}...`);
      } else {
        // Already Basic Auth or other format, use as-is
        headers['Authorization'] = authorization;
        logger.info(`[BitbucketFileResolver] Using provided authorization as-is (not Bearer)`);
      }
      logger.info(
        `[BitbucketFileResolver] Final Authorization header: ${headers['Authorization']?.substring(0, 30)}...`,
      );
      logger.info(`[BitbucketFileResolver] Fetching with authorization: ${url}`);
    } else {
      logger.info(`[BitbucketFileResolver] Fetching without authorization: ${url}`);
    }

    try {
      logger.info(`[BitbucketFileResolver] Calling axios with URL: ${url}`);
      logger.info({ headers }, `[BitbucketFileResolver] Headers`);

      const config = {
        headers,
        maxRedirects: 50, // Bitbucket can have many redirects for auth/CDN
        validateStatus: () => true, // Don't throw on any status code
      };

      let axiosResponse;
      try {
        // Try without certificate validation first (for public URLs)
        logger.info(`[BitbucketFileResolver] Trying request without cert validation`);
        axiosResponse = await axiosInstanceNoCert.get(url, config);
        logger.info(`[BitbucketFileResolver] Request without cert validation succeeded`);
      } catch (error: any) {
        // If 404, don't retry with cert validation (file truly doesn't exist or needs auth)
        if (error.response?.status === 404) {
          logger.info(`[BitbucketFileResolver] Got 404, not retrying with cert validation`);
          axiosResponse = error.response;
        } else {
          // For other errors, try with certificate validation (for internal cluster URLs)
          logger.info(
            `[BitbucketFileResolver] Request without cert validation failed (${error.message}), trying with cert validation`,
          );
          axiosResponse = await axiosInstance.get(url, config);
          logger.info(`[BitbucketFileResolver] Request with cert validation succeeded`);
        }
      }

      logger.info(`[BitbucketFileResolver] Axios completed successfully`);
      logger.info(
        `[BitbucketFileResolver] Response status: ${axiosResponse.status} ${axiosResponse.statusText}`,
      );

      // Check for authentication errors (401/403)
      if (isAuthenticationError(axiosResponse.status)) {
        // Whether auth was provided or not, we need OAuth authentication
        // Invalid credentials mean the user needs to re-authenticate
        const oauthProvider = 'bitbucket';
        const authenticateUrl = buildOAuthAuthenticateUrl(
          this.apiEndpoint,
          oauthProvider,
          'repository',
          'POST',
          'rsa',
        );

        const message = authorization
          ? 'SCM Authentication required (invalid or expired credentials)'
          : 'SCM Authentication required';

        logger.info(
          `[BitbucketFileResolver] 401/403 - throwing UnauthorizedException (auth ${authorization ? 'was' : 'was not'} provided)`,
        );

        throw new UnauthorizedException(message, oauthProvider, '2.0', authenticateUrl);
      }

      // Special handling for 404: If no authorization was provided, this might be a private repo
      // Bitbucket returns 404 for private repos (instead of 401) to not reveal repo existence
      if (axiosResponse.status === 404) {
        if (!authorization) {
          // No auth provided and got 404 - might be private repo
          logger.info(
            `[BitbucketFileResolver] 404 without authorization - treating as potential private repository`,
          );
          const oauthProvider = 'bitbucket';
          const authenticateUrl = buildOAuthAuthenticateUrl(
            this.apiEndpoint,
            oauthProvider,
            'repository',
            'POST',
            'rsa',
          );

          throw new UnauthorizedException(
            'SCM Authentication required',
            oauthProvider,
            '2.0',
            authenticateUrl,
          );
        }
        // Auth was provided but still 404 - file really doesn't exist
        throw new Error(SCM_CONSTANTS.ERRORS.FILE_NOT_FOUND);
      }

      if (axiosResponse.status >= 400) {
        // Get response body for better error messages
        const errorBody =
          typeof axiosResponse.data === 'string'
            ? axiosResponse.data
            : JSON.stringify(axiosResponse.data);

        throw new Error(
          `HTTP ${axiosResponse.status}: ${axiosResponse.statusText}${errorBody ? ` - ${errorBody.substring(0, 200)}` : ''}`,
        );
      }

      const content =
        typeof axiosResponse.data === 'string'
          ? axiosResponse.data
          : JSON.stringify(axiosResponse.data);
      logger.info(`[BitbucketFileResolver] Successfully fetched ${content.length} bytes`);
      return content;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      logger.error(`[BitbucketFileResolver] ===== FETCH ERROR =====`);
      logger.error(`[BitbucketFileResolver] URL: ${url}`);
      logger.error(`[BitbucketFileResolver] Error type: ${error.constructor.name}`);
      logger.error(`[BitbucketFileResolver] Error message: ${error.message}`);
      logger.error({ stack: error.stack }, `[BitbucketFileResolver] Error stack`);
      logger.error({ error }, `[BitbucketFileResolver] Full error`);
      throw error;
    }
  }

  /**
   * Fallback method to build raw URL (for backward compatibility)
   * Bitbucket raw file URL format: https://bitbucket.org/<workspace>/<repo>/raw/<branch>/<file>
   */
  private buildFallbackRawUrl(repository: string, filePath: string): string {
    const repoUrl = new URL(repository);
    const pathParts = repoUrl.pathname.split('/').filter(p => p);

    if (pathParts.length < 2) {
      throw new Error('Invalid Bitbucket repository URL');
    }

    // Extract workspace and repository name
    const workspaceId = pathParts[0];
    let repoName = pathParts[1];

    // Remove .git suffix if present
    if (repoName.endsWith('.git')) {
      repoName = repoName.substring(0, repoName.length - 4);
    }

    const branch = 'HEAD';

    // Bitbucket raw file format: https://bitbucket.org/<workspace>/<repo>/raw/<branch>/<file>
    return `${repoUrl.protocol}//${repoUrl.host}/${workspaceId}/${repoName}/raw/${branch}/${filePath}`;
  }
}

/**
 * Azure DevOps File Resolver
 *
 * Resolves files from Azure DevOps repositories with automatic devfile filename detection
 *
 * Based on: org.eclipse.che.api.factory.server.azure.AzureDevOpsScmFileResolver
 *
 * Azure DevOps URLs:
 * - https://dev.azure.com/{organization}/{project}/_git/{repository}
 * - https://{organization}.visualstudio.com/{project}/_git/{repository}
 *
 * Azure DevOps REST API:
 * - https://dev.azure.com/{organization}/{project}/_apis/git/repositories/{repositoryId}/items?path={path}&versionDescriptor.version={branch}&api-version=7.0
 */
export class AzureDevOpsFileResolver implements ScmFileResolver {
  private readonly apiEndpoint: string;

  constructor(apiEndpoint: string = process.env.CHE_API_ENDPOINT || 'http://localhost:8080') {
    this.apiEndpoint = apiEndpoint;
  }

  accept(repository: string): boolean {
    const url = repository.toLowerCase();
    return (
      url.includes('dev.azure.com') || url.includes('visualstudio.com') || url.includes('azure.com')
    );
  }

  /**
   * Get file content from Azure DevOps repository
   * If filePath is not provided, tries all configured devfile filenames
   */
  async fileContent(
    repository: string,
    filePath?: string,
    authorization?: string,
  ): Promise<string> {
    logger.info(`[AzureDevOpsFileResolver] ========== fileContent called ==========`);
    logger.info(`[AzureDevOpsFileResolver]   repository: ${repository}`);
    logger.info(
      `[AzureDevOpsFileResolver]   filePath: ${filePath || '(empty - will try defaults)'}`,
    );
    logger.info(
      `[AzureDevOpsFileResolver]   authorization: ${authorization ? 'provided' : 'not provided'}`,
    );

    try {
      // If specific file path is provided, fetch it directly
      if (filePath) {
        return await this.fetchFile(repository, filePath, authorization);
      }

      // Otherwise, try all devfile filenames until one works
      return await this.tryDevfileFilenames(repository, authorization);
    } catch (error: any) {
      // Re-throw UnauthorizedException as-is
      if (error instanceof UnauthorizedException) {
        logger.info(`[AzureDevOpsFileResolver] ❌ UnauthorizedException thrown`);
        throw error;
      }
      // Re-throw with original error message
      logger.info(`[AzureDevOpsFileResolver] ❌ Error thrown: ${error.message}`);
      throw error;
    }
  }

  /**
   * Try to fetch devfile using all configured devfile filenames
   * Returns content of the first file that exists
   */
  private async tryDevfileFilenames(repository: string, authorization?: string): Promise<string> {
    const errors: string[] = [];

    for (const filename of DEFAULT_DEVFILE_FILENAMES) {
      try {
        logger.info(`[AzureDevOpsFileResolver] Trying devfile: ${filename}`);
        const content = await this.fetchFile(repository, filename, authorization);
        logger.info(`[AzureDevOpsFileResolver] ✅ Found devfile: ${filename}`);
        return content;
      } catch (error: any) {
        // If authentication error, throw immediately (don't try other filenames)
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        errors.push(`${filename}: ${error.message}`);
        logger.info(`[AzureDevOpsFileResolver] ❌ Failed to fetch ${filename}: ${error.message}`);
      }
    }

    // If no devfile found and no authorization, treat as private repo
    if (!authorization) {
      logger.info(
        `[AzureDevOpsFileResolver] No devfile found without authorization - treating as potential private repository`,
      );
      const oauthProvider = 'azure-devops';
      const authenticateUrl = buildOAuthAuthenticateUrl(
        this.apiEndpoint,
        oauthProvider,
        'vso.code', // Azure DevOps scope for Git repo access
        'POST',
        'rsa',
      );
      throw new UnauthorizedException(
        'SCM Authentication required',
        oauthProvider,
        '2.0',
        authenticateUrl,
      );
    }

    throw new Error(
      `${SCM_CONSTANTS.ERRORS.FILE_NOT_FOUND}: Tried all devfile filenames - ${errors.join('; ')}`,
    );
  }

  /**
   * Fetch specific file from Azure DevOps repository
   */
  private async fetchFile(
    repository: string,
    filePath: string,
    authorization?: string,
  ): Promise<string> {
    // Build Azure DevOps API URL
    const rawUrl = this.buildRawUrl(repository, filePath);

    logger.info(`[AzureDevOpsFileResolver] Fetching file from URL: ${rawUrl}`);
    return await this.fetchFromUrl(rawUrl, repository, authorization);
  }

  /**
   * Fetch content from Azure DevOps API
   */
  private async fetchFromUrl(
    url: string,
    repository?: string,
    authorization?: string,
  ): Promise<string> {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      Accept: 'application/json', // Azure DevOps returns JSON
    };

    if (authorization) {
      headers['Authorization'] = authorization;
    }

    const config = {
      headers,
      validateStatus: () => true, // Don't throw on any status code
    };

    let axiosResponse;
    try {
      // Try without certificate validation first (for public URLs)
      axiosResponse = await axiosInstanceNoCert.get(url, config);
    } catch (error: any) {
      logger.info(`[AzureDevOpsFileResolver] First attempt failed: ${error.message}`);
      // Try with certificate validation
      axiosResponse = await axiosInstance.get(url, config);
    }

    logger.info(
      `[AzureDevOpsFileResolver] Response status: ${axiosResponse.status} ${axiosResponse.statusText}`,
    );

    // Check for authentication errors (401/403)
    if (isAuthenticationError(axiosResponse.status)) {
      // Whether auth was provided or not, we need OAuth authentication
      // Invalid credentials mean the user needs to re-authenticate
      const oauthProvider = 'azure-devops';
      const authenticateUrl = buildOAuthAuthenticateUrl(
        this.apiEndpoint,
        oauthProvider,
        'vso.code',
        'POST',
        'rsa',
      );

      const message = authorization
        ? 'SCM Authentication required (invalid or expired credentials)'
        : 'SCM Authentication required';

      logger.info(
        `[AzureDevOpsFileResolver] 401/403 - throwing UnauthorizedException (auth ${authorization ? 'was' : 'was not'} provided)`,
      );

      throw new UnauthorizedException(message, oauthProvider, '2.0', authenticateUrl);
    }

    // Special handling for 404: If no authorization was provided, this might be a private repo
    // Azure DevOps returns 404 for private repos (similar to Bitbucket)
    if (axiosResponse.status === 404) {
      if (!authorization) {
        // No auth provided and got 404 - might be private repo
        logger.info(
          `[AzureDevOpsFileResolver] 404 without authorization - treating as potential private repository`,
        );
        const oauthProvider = 'azure-devops';
        const authenticateUrl = buildOAuthAuthenticateUrl(
          this.apiEndpoint,
          oauthProvider,
          'vso.code',
          'POST',
          'rsa',
        );

        throw new UnauthorizedException(
          'SCM Authentication required',
          oauthProvider,
          '2.0',
          authenticateUrl,
        );
      }
      // Auth was provided but still 404 - file really doesn't exist
      throw new Error(SCM_CONSTANTS.ERRORS.FILE_NOT_FOUND);
    }

    if (axiosResponse.status >= 400) {
      throw new Error(`HTTP ${axiosResponse.status}: ${axiosResponse.statusText}`);
    }

    if (axiosResponse.status !== 200) {
      throw new Error(`HTTP ${axiosResponse.status}: ${axiosResponse.statusText}`);
    }

    return axiosResponse.data;
  }

  /**
   * Build raw URL for Azure DevOps file access
   * Azure DevOps uses API endpoint for file access
   */
  private buildRawUrl(repository: string, filePath: string, branch: string = 'main'): string {
    // Parse Azure DevOps URL
    // Format: https://dev.azure.com/{organization}/{project}/_git/{repository}
    // or: https://{organization}.visualstudio.com/{project}/_git/{repository}

    const url = repository.replace(/\.git$/, '');

    let organization = '';
    let project = '';
    let repo = '';

    if (url.includes('dev.azure.com')) {
      // Format: https://dev.azure.com/{organization}/{project}/_git/{repository}
      const match = url.match(/dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)/);
      if (match) {
        organization = match[1];
        project = match[2];
        repo = match[3];
      }
    } else if (url.includes('visualstudio.com')) {
      // Format: https://{organization}.visualstudio.com/{project}/_git/{repository}
      const match = url.match(/([^.]+)\.visualstudio\.com\/([^/]+)\/_git\/([^/]+)/);
      if (match) {
        organization = match[1];
        project = match[2];
        repo = match[3];
      }
    }

    if (!organization || !project || !repo) {
      throw new Error(`Invalid Azure DevOps URL format: ${repository}`);
    }

    // Azure DevOps REST API endpoint for file content
    // https://dev.azure.com/{organization}/{project}/_apis/git/repositories/{repositoryId}/items?path={path}&versionDescriptor.version={branch}&api-version=7.0
    return `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo}/items?path=/${filePath}&versionDescriptor.version=${branch}&api-version=7.0`;
  }
}

/**
 * SCM Service - Manages SCM file resolution
 *
 * Based on: org.eclipse.che.api.factory.server.ScmService
 */
export class ScmService {
  private resolvers: ScmFileResolver[] = [];

  constructor() {
    // Register default resolvers
    this.registerResolver(new GitHubFileResolver());
    this.registerResolver(new GitLabFileResolver());
    this.registerResolver(new BitbucketFileResolver());
    this.registerResolver(new AzureDevOpsFileResolver());
    // Generic resolver as fallback
    this.registerResolver(new GenericScmFileResolver());
  }

  /**
   * Register a SCM file resolver
   *
   * @param resolver - SCM file resolver to register
   */
  registerResolver(resolver: ScmFileResolver): void {
    this.resolvers.push(resolver);
  }

  /**
   * Resolve file content from repository
   *
   * @param repository - Repository URL
   * @param filePath - Path to file in repository (optional - will try default devfile filenames if empty)
   * @param authorization - Optional Authorization header for private repositories
   * @returns Promise resolving to file content
   * @throws Error if no suitable resolver found or file not accessible
   */
  async resolveFile(
    repository: string,
    filePath?: string,
    authorization?: string,
  ): Promise<string> {
    if (!repository) {
      throw new Error(SCM_CONSTANTS.ERRORS.REPOSITORY_REQUIRED);
    }

    logger.info(`[ScmService] Resolving file for repository: ${repository}, filePath: ${filePath}`);
    logger.info(`[ScmService] Authorization provided: ${authorization ? 'YES' : 'NO'}`);
    if (authorization) {
      logger.info(`[ScmService] Authorization value: ${authorization.substring(0, 20)}...`);
    }

    // Find suitable resolver
    const resolver = this.getScmFileResolver(repository);

    logger.info(`[ScmService] Resolver found: ${resolver.constructor.name}`);
    // Resolve file content
    // If filePath is empty or undefined, the resolver will try default devfile filenames
    return await resolver.fileContent(repository, filePath || '', authorization);
  }

  /**
   * Get suitable SCM file resolver for repository
   *
   * @param repository - Repository URL
   * @returns SCM file resolver
   * @throws Error if no suitable resolver found
   */
  private getScmFileResolver(repository: string): ScmFileResolver {
    for (const resolver of this.resolvers) {
      if (resolver.accept(repository)) {
        return resolver;
      }
    }

    throw new Error(SCM_CONSTANTS.ERRORS.NO_RESOLVER);
  }
}
