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

import { DEFAULT_DEVFILE_FILENAMES } from './FactoryParametersResolver';
import { logger } from '../utils/logger';

/**
 * Devfile location information
 *
 * Based on: org.eclipse.che.api.factory.server.urlfactory.RemoteFactoryUrl.DevfileLocation
 */
export interface DevfileLocation {
  filename: string;
  location: string;
}

/**
 * Remote factory URL base interface
 *
 * Based on: org.eclipse.che.api.factory.server.urlfactory.RemoteFactoryUrl
 */
export interface RemoteFactoryUrl {
  providerName: string;
  providerUrl: string;
  branch?: string;
  devfileFilenames: string[];

  /**
   * Get list of devfile locations to try
   */
  devfileFileLocations(): DevfileLocation[];

  /**
   * Build raw file URL for a specific filename
   */
  rawFileLocation(filename: string): string;
}

/**
 * GitHub URL parser and handler
 *
 * Based on: org.eclipse.che.api.factory.server.github.GithubUrl
 * and org.eclipse.che.api.factory.server.github.AbstractGithubURLParser
 */
export class GithubUrl implements RemoteFactoryUrl {
  providerName = 'github';
  providerUrl: string;
  serverUrl: string;
  username: string;
  repository: string;
  branch: string;
  latestCommit?: string;
  devfileFilenames: string[];

  constructor(
    serverUrl: string,
    username: string,
    repository: string,
    branch: string = 'HEAD',
    devfileFilenames: string[] = DEFAULT_DEVFILE_FILENAMES,
  ) {
    this.serverUrl = serverUrl;
    this.providerUrl = serverUrl;
    this.username = username;
    this.repository = repository;
    this.branch = branch;
    this.devfileFilenames = devfileFilenames;
  }

  /**
   * Get list of devfile locations to try
   * Implements the Java method: List<DevfileLocation> devfileFileLocations()
   */
  devfileFileLocations(): DevfileLocation[] {
    return this.devfileFilenames.map(filename => ({
      filename,
      location: this.rawFileLocation(filename),
    }));
  }

  /**
   * Build raw file URL for a specific filename
   * Implements the Java method: String rawFileLocation(String fileName)
   */
  rawFileLocation(filename: string): string {
    const branchName = this.latestCommit || this.branch || 'HEAD';

    // Build raw.githubusercontent.com URL for github.com
    // or <server>/raw/<user>/<repo>/<branch>/<file> for GitHub Enterprise
    if (this.serverUrl === 'https://github.com') {
      return `https://raw.githubusercontent.com/${this.username}/${this.repository}/${branchName}/${filename}`;
    } else {
      // GitHub Enterprise Server
      return `${this.serverUrl}/raw/${this.username}/${this.repository}/${branchName}/${filename}`;
    }
  }

  /**
   * Parse GitHub URL and extract components
   *
   * Based on: AbstractGithubURLParser.parse()
   */
  static parse(
    url: string,
    devfileFilenames: string[] = DEFAULT_DEVFILE_FILENAMES,
  ): GithubUrl | null {
    try {
      // Convert SSH URL to HTTPS if needed (git@github.com:user/repo.git -> https://github.com/user/repo.git)
      let normalizedUrl = url;
      if (url.startsWith('git@')) {
        logger.info(`[GithubUrl.parse] Converting SSH URL to HTTPS: ${url}`);
        // Match pattern: git@hostname:user/repo.git
        const sshMatch = url.match(/^git@([^:]+):(.+)$/);
        if (sshMatch) {
          const hostname = sshMatch[1];
          const path = sshMatch[2];
          normalizedUrl = `https://${hostname}/${path}`;
          logger.info(`[GithubUrl.parse] Normalized URL: ${normalizedUrl}`);
        }
      }

      const urlObj = new URL(normalizedUrl);

      // Check if it's a GitHub URL
      if (!normalizedUrl.includes('github.com') && !normalizedUrl.includes('github')) {
        return null;
      }

      // Extract path components
      const pathParts = urlObj.pathname.split('/').filter(p => p);

      if (pathParts.length < 2) {
        return null;
      }

      const username = pathParts[0];
      let repository = pathParts[1];

      // Remove .git suffix if present
      if (repository.endsWith('.git')) {
        repository = repository.substring(0, repository.length - 4);
      }

      // Extract branch if present in URL (e.g., /tree/branch-name or /blob/branch-name)
      let branch = 'HEAD';
      if (pathParts.length >= 4 && (pathParts[2] === 'tree' || pathParts[2] === 'blob')) {
        branch = pathParts[3];
      }

      const serverUrl = `${urlObj.protocol}//${urlObj.host}`;

      return new GithubUrl(serverUrl, username, repository, branch, devfileFilenames);
    } catch (error) {
      logger.error({ error }, 'Error parsing GitHub URL');
      return null;
    }
  }
}

/**
 * GitLab URL parser and handler
 *
 * Based on: org.eclipse.che.api.factory.server.gitlab.GitlabUrl
 * and org.eclipse.che.api.factory.server.gitlab.AbstractGitlabUrlParser
 */
export class GitlabUrl implements RemoteFactoryUrl {
  providerName = 'gitlab';
  providerUrl: string;
  hostName: string;
  port?: string;
  scheme: string;
  subGroups: string;
  project: string;
  branch: string;
  devfileFilenames: string[];

  constructor(
    scheme: string,
    hostName: string,
    subGroups: string,
    branch: string = 'HEAD',
    port?: string,
    devfileFilenames: string[] = DEFAULT_DEVFILE_FILENAMES,
  ) {
    this.scheme = scheme;
    this.hostName = hostName;
    this.port = port;
    this.subGroups = subGroups;
    this.branch = branch;
    this.devfileFilenames = devfileFilenames;

    // Extract project name (last component of subGroups)
    const subGroupsItems = subGroups.split('/');
    this.project = subGroupsItems[subGroupsItems.length - 1];

    // Build provider URL
    this.providerUrl = `${scheme}://${hostName}${port ? ':' + port : ''}`;
  }

  /**
   * Get list of devfile locations to try
   * Implements the Java method: List<DevfileLocation> devfileFileLocations()
   */
  devfileFileLocations(): DevfileLocation[] {
    return this.devfileFilenames.map(filename => ({
      filename,
      location: this.rawFileLocation(filename),
    }));
  }

  /**
   * Build raw file URL for a specific filename
   * Implements the Java method: String rawFileLocation(String fileName)
   *
   * GitLab API: /api/v4/projects/<url-encoded-path>/repository/files/<url-encoded-file>/raw?ref=<branch>
   */
  rawFileLocation(filename: string): string {
    const encodedPath = encodeURIComponent(this.subGroups);
    const encodedFilename = encodeURIComponent(filename);
    const ref = this.branch || 'HEAD';

    return `${this.providerUrl}/api/v4/projects/${encodedPath}/repository/files/${encodedFilename}/raw?ref=${ref}`;
  }

  /**
   * Parse GitLab URL and extract components
   *
   * Based on: AbstractGitlabUrlParser.parse()
   */
  static parse(
    url: string,
    devfileFilenames: string[] = DEFAULT_DEVFILE_FILENAMES,
  ): GitlabUrl | null {
    try {
      // Convert SSH URL to HTTPS if needed (git@gitlab.com:user/repo.git -> https://gitlab.com/user/repo.git)
      let normalizedUrl = url;
      if (url.startsWith('git@')) {
        logger.info(`[GitlabUrl.parse] Converting SSH URL to HTTPS: ${url}`);
        const sshMatch = url.match(/^git@([^:]+):(.+)$/);
        if (sshMatch) {
          const hostname = sshMatch[1];
          const path = sshMatch[2];
          normalizedUrl = `https://${hostname}/${path}`;
          logger.info(`[GitlabUrl.parse] Normalized URL: ${normalizedUrl}`);
        }
      }

      const urlObj = new URL(normalizedUrl);

      // Check if it's a GitLab URL
      if (!normalizedUrl.includes('gitlab.com') && !normalizedUrl.includes('gitlab')) {
        return null;
      }

      const scheme = urlObj.protocol.replace(':', '');
      const hostName = urlObj.hostname;
      const port = urlObj.port || undefined;

      // Extract path components
      let pathname = urlObj.pathname;
      if (pathname.startsWith('/')) {
        pathname = pathname.substring(1);
      }
      if (pathname.endsWith('/')) {
        pathname = pathname.substring(0, pathname.length - 1);
      }

      // Remove .git suffix if present
      if (pathname.endsWith('.git')) {
        pathname = pathname.substring(0, pathname.length - 4);
      }

      // Extract branch if present (e.g., /-/tree/branch-name)
      let branch = 'HEAD';
      let subGroups = pathname;

      const treeIndex = pathname.indexOf('/-/tree/');
      if (treeIndex > 0) {
        subGroups = pathname.substring(0, treeIndex);
        branch = pathname.substring(treeIndex + 8); // Length of '/-/tree/'
      }

      return new GitlabUrl(scheme, hostName, subGroups, branch, port, devfileFilenames);
    } catch (error) {
      logger.error({ error }, 'Error parsing GitLab URL');
      return null;
    }
  }
}

/**
 * Bitbucket URL parser and handler
 *
 * Based on: org.eclipse.che.api.factory.server.bitbucket.BitbucketUrl
 */
export class BitbucketUrl implements RemoteFactoryUrl {
  providerName = 'bitbucket';
  providerUrl: string;
  serverUrl: string;
  workspace: string;
  repository: string;
  branch: string;
  devfileFilenames: string[];

  constructor(
    serverUrl: string,
    workspace: string,
    repository: string,
    branch: string = 'HEAD',
    devfileFilenames: string[] = DEFAULT_DEVFILE_FILENAMES,
  ) {
    this.serverUrl = serverUrl;
    this.providerUrl = serverUrl;
    this.workspace = workspace;
    this.repository = repository;
    this.branch = branch;
    this.devfileFilenames = devfileFilenames;
  }

  devfileFileLocations(): DevfileLocation[] {
    return this.devfileFilenames.map(filename => ({
      filename,
      location: this.rawFileLocation(filename),
    }));
  }

  /**
   * Build raw file URL for Bitbucket using the API
   * Format: https://api.bitbucket.org/2.0/repositories/<workspace>/<repo>/src/<branch>/<file>
   */
  rawFileLocation(filename: string): string {
    const branchName = this.branch || 'HEAD';
    // Use the Bitbucket API endpoint for raw file access
    return `https://api.bitbucket.org/2.0/repositories/${this.workspace}/${this.repository}/src/${branchName}/${filename}`;
  }

  static parse(
    url: string,
    devfileFilenames: string[] = DEFAULT_DEVFILE_FILENAMES,
  ): BitbucketUrl | null {
    try {
      // Convert SSH URL to HTTPS if needed (git@bitbucket.org:workspace/repo.git -> https://bitbucket.org/workspace/repo.git)
      let normalizedUrl = url;
      if (url.startsWith('git@')) {
        logger.info(`[BitbucketUrl.parse] Converting SSH URL to HTTPS: ${url}`);
        const sshMatch = url.match(/^git@([^:]+):(.+)$/);
        if (sshMatch) {
          const hostname = sshMatch[1];
          const path = sshMatch[2];
          normalizedUrl = `https://${hostname}/${path}`;
          logger.info(`[BitbucketUrl.parse] Normalized URL: ${normalizedUrl}`);
        }
      }

      const urlObj = new URL(normalizedUrl);

      logger.info(`[BitbucketUrl.parse] Parsing URL: ${normalizedUrl}`);
      logger.info(
        {
          protocol: urlObj.protocol,
          hostname: urlObj.hostname,
          host: urlObj.host,
          username: urlObj.username,
          pathname: urlObj.pathname,
        },
        `[BitbucketUrl.parse] URL object`,
      );

      if (!normalizedUrl.includes('bitbucket.org') && !normalizedUrl.includes('bitbucket')) {
        return null;
      }

      const pathParts = urlObj.pathname.split('/').filter(p => p);

      if (pathParts.length < 2) {
        logger.info(`[BitbucketUrl.parse] Not enough path parts: ${pathParts.length}`);
        return null;
      }

      const workspace = pathParts[0];
      let repository = pathParts[1];

      if (repository.endsWith('.git')) {
        repository = repository.substring(0, repository.length - 4);
      }

      let branch = 'HEAD';
      if (pathParts.length >= 4 && pathParts[2] === 'src') {
        branch = pathParts[3];
      }

      // Ensure serverUrl does NOT include username (use hostname instead of host)
      const serverUrl = `${urlObj.protocol}//${urlObj.hostname}`;

      logger.info(
        {
          serverUrl,
          workspace,
          repository,
          branch,
          devfileFilenames,
        },
        `[BitbucketUrl.parse] Parsed components`,
      );

      const bitbucketUrl = new BitbucketUrl(
        serverUrl,
        workspace,
        repository,
        branch,
        devfileFilenames,
      );

      // Test raw URL construction
      const testRawUrl = bitbucketUrl.rawFileLocation('devfile.yaml');
      logger.info(`[BitbucketUrl.parse] Test raw URL for devfile.yaml: ${testRawUrl}`);

      return bitbucketUrl;
    } catch (error) {
      logger.error({ error }, '[BitbucketUrl.parse] Error parsing Bitbucket URL');
      return null;
    }
  }
}

/**
 * URL Parser Service
 * Attempts to parse various SCM URLs and return appropriate URL handler
 */
export class UrlParserService {
  /**
   * Parse URL and return appropriate handler
   * Tries GitHub, GitLab, Bitbucket in order
   */
  static parse(
    url: string,
    devfileFilenames: string[] = DEFAULT_DEVFILE_FILENAMES,
  ): RemoteFactoryUrl | null {
    // Try GitHub
    const githubUrl = GithubUrl.parse(url, devfileFilenames);
    if (githubUrl) {
      return githubUrl;
    }

    // Try GitLab
    const gitlabUrl = GitlabUrl.parse(url, devfileFilenames);
    if (gitlabUrl) {
      return gitlabUrl;
    }

    // Try Bitbucket
    const bitbucketUrl = BitbucketUrl.parse(url, devfileFilenames);
    if (bitbucketUrl) {
      return bitbucketUrl;
    }

    return null;
  }
}
