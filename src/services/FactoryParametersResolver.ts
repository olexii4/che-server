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

import {
  FactoryMeta,
  FactoryDevfileV2,
  FactoryResolverParams,
  FACTORY_CONSTANTS,
  Link,
} from '../models/FactoryModels';
import * as YAML from 'yamljs';
import { axiosInstanceNoCert } from '../helpers/getCertificateAuthority';
import { logger } from '../utils/logger';

/**
 * Get devfile filenames from configuration
 * Reads from environment variable CHE_FACTORY_DEFAULT_DEVFILE_FILENAMES
 * or uses default values
 *
 * Based on: che.factory.default_devfile_filenames
 */
function getConfiguredDevfileFilenames(): string[] {
  const configValue = process.env.CHE_FACTORY_DEFAULT_DEVFILE_FILENAMES;

  if (configValue) {
    // Split by comma and trim whitespace
    return configValue
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }

  // Default devfile filenames
  return ['devfile.yaml', '.devfile.yaml'];
}

/**
 * Default devfile filenames to look for
 * Based on: che.factory.default_devfile_filenames
 */
export const DEFAULT_DEVFILE_FILENAMES = getConfiguredDevfileFilenames();

/**
 * Factory resolver priority levels
 *
 * Based on: org.eclipse.che.api.factory.server.FactoryResolverPriority
 */
export enum FactoryResolverPriority {
  LOWEST = 0,
  DEFAULT = 5,
  HIGHEST = 10,
}

/**
 * Remote factory URL information
 */
export interface RemoteFactoryUrl {
  providerUrl: string;
  branch?: string;
  devfileFileLocation?: string;
}

/**
 * Interface for factory parameters resolvers
 *
 * Based on: org.eclipse.che.api.factory.server.FactoryParametersResolver
 */
export interface FactoryParametersResolver {
  /**
   * Check if this resolver accepts the given parameters
   */
  accept(parameters: FactoryResolverParams): boolean;

  /**
   * Create factory from parameters
   */
  createFactory(parameters: FactoryResolverParams): Promise<FactoryMeta>;

  /**
   * Parse factory URL to extract information
   */
  parseFactoryUrl(url: string): RemoteFactoryUrl;

  /**
   * Get the SCM provider name (e.g., "github", "gitlab")
   */
  getProviderName(): string;

  /**
   * Get resolver priority
   */
  priority(): FactoryResolverPriority;
}

/**
 * Base factory parameter resolver with common functionality
 *
 * Based on: org.eclipse.che.api.factory.server.BaseFactoryParameterResolver
 */
export abstract class BaseFactoryParameterResolver implements FactoryParametersResolver {
  abstract accept(parameters: FactoryResolverParams): boolean;
  abstract createFactory(parameters: FactoryResolverParams): Promise<FactoryMeta>;
  abstract parseFactoryUrl(url: string): RemoteFactoryUrl;
  abstract getProviderName(): string;

  priority(): FactoryResolverPriority {
    return FactoryResolverPriority.DEFAULT;
  }

  /**
   * Check if authorization should be skipped based on parameters
   */
  protected getSkipAuthorisation(parameters: FactoryResolverParams): boolean {
    // Skip authorization if error_code indicates access_denied
    const errorCode = parameters['error_code'];
    if (errorCode === 'access_denied') {
      return true;
    }
    return false;
  }
}

/**
 * Raw devfile URL factory resolver
 *
 * Based on: org.eclipse.che.api.factory.server.RawDevfileUrlFactoryParameterResolver
 */
export class RawDevfileUrlFactoryParameterResolver extends BaseFactoryParameterResolver {
  /**
   * Check if the URL contains valid YAML/JSON content
   * Similar to Java's containsYaml() method
   */
  private async containsValidDevfile(url: string): Promise<boolean> {
    try {
      // Fetch content from URL using axios
      const response = await axiosInstanceNoCert.get(url, {
        validateStatus: () => true, // Don't throw on any status code
      });
      logger.info(
        { url, status: response.status },
        '+++++++++++++++++++++++++++++++++++ Fetched URL',
      );
      if (response.status !== 200) {
        return false;
      }

      const content =
        typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      if (!content || content.trim().length === 0) {
        return false;
      }

      // Try to parse as YAML/JSON
      let parsed: any;
      try {
        // Try JSON first
        parsed = JSON.parse(content);
      } catch {
        try {
          // Try YAML
          parsed = YAML.parse(content);
        } catch {
          return false;
        }
      }

      // Check if parsed content is not empty and has some structure
      return parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0;
    } catch {
      return false;
    }
  }

  accept(parameters: FactoryResolverParams): boolean {
    const url = parameters[FACTORY_CONSTANTS.URL_PARAMETER_NAME];
    if (!url || typeof url !== 'string') {
      return false;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return false;
    }

    // Note: In the Java implementation, this method is synchronous and fetches content
    // In TypeScript/async world, we can't block in accept(), so we do a simpler check here
    // and validate content in createFactory()

    // For now, check if URL looks like it could contain a devfile
    // (ends with .yaml, .yml, or .json, or contains 'devfile')
    const urlLower = url.toLowerCase();
    const cleanUrl = urlLower.split('?')[0].split('#')[0];

    // Accept if it matches devfile filename patterns or has yaml/json extension
    const hasValidExtension =
      cleanUrl.endsWith('.yaml') ||
      cleanUrl.endsWith('.yml') ||
      cleanUrl.endsWith('.json') ||
      DEFAULT_DEVFILE_FILENAMES.some(filename => cleanUrl.endsWith(filename.toLowerCase()));

    if (!hasValidExtension) {
      logger.warn(
        `URL does not have a valid devfile extension. Expected: .yaml, .yml, .json or ${DEFAULT_DEVFILE_FILENAMES.join(', ')}. Got: ${url}`,
      );
    }

    return hasValidExtension;
  }

  async createFactory(parameters: FactoryResolverParams): Promise<FactoryMeta> {
    const url = parameters[FACTORY_CONSTANTS.URL_PARAMETER_NAME] as string;
    if (!url) {
      throw new Error(FACTORY_CONSTANTS.ERRORS.URL_REQUIRED);
    }

    try {
      // Fetch devfile content from URL (single fetch, similar to Java's URLFileContentProvider)
      const response = await axiosInstanceNoCert.get(url, {
        validateStatus: () => true, // Don't throw on any status code
      });
      if (response.status !== 200) {
        throw new Error(
          `Failed to fetch devfile from ${url}: HTTP ${response.status} ${response.statusText}`,
        );
      }

      const content =
        typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      if (!content || content.trim().length === 0) {
        throw new Error(`Empty content fetched from ${url}`);
      }

      // Parse content as YAML/JSON to create devfile object
      // Similar to Java's DevfileParser.parseYamlRaw()
      let devfile: Record<string, any>;
      try {
        // Try JSON first
        devfile = JSON.parse(content);
      } catch {
        try {
          // Try YAML parsing
          devfile = YAML.parse(content);
          if (!devfile || typeof devfile !== 'object') {
            throw new Error('Invalid YAML structure');
          }
        } catch (yamlError: any) {
          throw new Error(`Failed to parse devfile content as JSON or YAML: ${yamlError.message}`);
        }
      }

      // Validate that devfile has required structure
      if (!devfile.schemaVersion && !devfile.apiVersion) {
        throw new Error('Invalid devfile: missing schemaVersion or apiVersion field');
      }

      // Create factory with devfile v2
      const factory: FactoryDevfileV2 = {
        v: FACTORY_CONSTANTS.CURRENT_VERSION,
        devfile: devfile,
        source: this.extractSourceFromUrl(url),
        name: this.extractNameFromUrl(url),
      };

      return factory;
    } catch (error: any) {
      throw new Error(`Failed to create factory from URL ${url}: ${error.message}`);
    }
  }

  parseFactoryUrl(url: string): RemoteFactoryUrl {
    try {
      const parsedUrl = new URL(url);
      return {
        providerUrl: `${parsedUrl.protocol}//${parsedUrl.host}`,
        devfileFileLocation: url,
      };
    } catch {
      throw new Error(`Invalid factory URL: ${url}`);
    }
  }

  getProviderName(): string {
    return 'raw-url';
  }

  priority(): FactoryResolverPriority {
    return FactoryResolverPriority.HIGHEST;
  }

  private extractNameFromUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      const pathParts = parsedUrl.pathname.split('/').filter(p => p);
      return pathParts[pathParts.length - 1]?.replace(/\.(yaml|yml|json)$/i, '') || 'factory';
    } catch {
      return 'factory';
    }
  }

  private extractSourceFromUrl(url: string): string | undefined {
    try {
      const parsedUrl = new URL(url);
      const pathParts = parsedUrl.pathname.split('/');
      const filename = pathParts[pathParts.length - 1];
      if (filename && filename.match(/\.(yaml|yml|json)$/i)) {
        return filename;
      }
    } catch {
      // ignore
    }
    return undefined;
  }
}

/**
 * SCM Repository URL factory resolver
 *
 * Handles factory creation from SCM repository URLs (GitHub, GitLab, Bitbucket)
 * without requiring the devfile filename in the URL
 *
 * Based on: org.eclipse.che.api.factory.server.github.GithubFactoryParametersResolver
 * and similar GitLab/Bitbucket resolvers
 */
export class ScmRepositoryFactoryResolver extends BaseFactoryParameterResolver {
  /**
   * Check if the URL is a valid SCM repository URL
   */
  accept(parameters: FactoryResolverParams): boolean {
    const url = parameters[FACTORY_CONSTANTS.URL_PARAMETER_NAME];
    if (!url || typeof url !== 'string') {
      return false;
    }

    try {
      // Normalize SSH URLs to HTTPS format before checking
      let normalizedUrl = url;
      if (url.startsWith('git@')) {
        const sshMatch = url.match(/^git@([^:]+):(.+)$/);
        if (sshMatch) {
          const hostname = sshMatch[1];
          const path = sshMatch[2];
          normalizedUrl = `https://${hostname}/${path}`;
        }
      }

      new URL(normalizedUrl);

      // Accept if URL is a known SCM provider and doesn't already end with a devfile filename
      const isScmUrl = this.isScmProviderUrl(normalizedUrl);
      const hasDevfileFilename = this.hasDevfileFilename(normalizedUrl);

      // Accept SCM URLs that don't already have devfile filename
      // (RawDevfileUrlFactoryParameterResolver will handle URLs with devfile filenames)
      return isScmUrl && !hasDevfileFilename;
    } catch {
      return false;
    }
  }

  /**
   * Check if URL is from a known SCM provider
   */
  private isScmProviderUrl(url: string): boolean {
    const lowerUrl = url.toLowerCase();
    return (
      lowerUrl.includes('github.com') ||
      lowerUrl.includes('github') ||
      lowerUrl.includes('gitlab.com') ||
      lowerUrl.includes('gitlab') ||
      lowerUrl.includes('bitbucket.org') ||
      lowerUrl.includes('bitbucket')
    );
  }

  /**
   * Check if URL already ends with a devfile filename
   */
  private hasDevfileFilename(url: string): boolean {
    const urlLower = url.toLowerCase();
    // Remove query string and fragment
    let cleanUrl = urlLower.split('?')[0].split('#')[0];

    // Remove .git suffix if present (common for repository URLs)
    if (cleanUrl.endsWith('.git')) {
      cleanUrl = cleanUrl.substring(0, cleanUrl.length - 4);
    }

    return DEFAULT_DEVFILE_FILENAMES.some(filename =>
      cleanUrl.endsWith('/' + filename.toLowerCase()),
    );
  }

  async createFactory(parameters: FactoryResolverParams): Promise<FactoryMeta> {
    const url = parameters[FACTORY_CONSTANTS.URL_PARAMETER_NAME] as string;
    if (!url) {
      throw new Error(FACTORY_CONSTANTS.ERRORS.URL_REQUIRED);
    }

    // Import here to avoid circular dependency
    const { ScmService } = await import('./ScmFileResolvers');
    const scmService = new ScmService();
    logger.info(
      { url },
      '+++++++++++++++++++++++++++++++++++ Creating factory from SCM repository URL',
    );
    try {
      // Clean URL: remove .git suffix if present
      let cleanUrl = url;
      if (cleanUrl.endsWith('.git')) {
        cleanUrl = cleanUrl.substring(0, cleanUrl.length - 4);
      }

      logger.info({ cleanUrl }, '+++++++++++++++++++++++++++++++++++ Clean URL');
      // Try to fetch devfile from repository (tries all configured filenames)
      // Pass empty string or undefined to trigger automatic devfile detection
      // Extract authorization from parameters if available
      const authorization = parameters.authorization as string | undefined;
      const devfileContent = await scmService.resolveFile(cleanUrl, undefined, authorization);
      logger.info(
        {
          status: devfileContent ? 'FOUND' : 'NOT FOUND',
          contentLength: devfileContent?.length,
        },
        '+++++++++++++++++++++++++++++++++++ Fetched devfile content from SCM',
      );

      // Parse devfile content
      let devfile: Record<string, any>;
      try {
        // Try JSON first
        devfile = JSON.parse(devfileContent);
        logger.info('+++++++++++++++++++++++++++++++++++ Parsed as JSON');
      } catch {
        try {
          // Try YAML parsing
          devfile = YAML.parse(devfileContent);
          logger.info('+++++++++++++++++++++++++++++++++++ Parsed as YAML');
          if (!devfile || typeof devfile !== 'object') {
            throw new Error('Invalid YAML structure');
          }
        } catch (yamlError: any) {
          throw new Error(`Failed to parse devfile content as JSON or YAML: ${yamlError.message}`);
        }
      }

      // Validate that devfile has required structure
      if (!devfile.schemaVersion && !devfile.apiVersion) {
        throw new Error('Invalid devfile: missing schemaVersion or apiVersion field');
      }

      // Detect SCM provider
      const scmProvider = this.detectScmProvider(url);
      const branch = this.extractBranchFromUrl(url);

      // Create factory with devfile v2
      const factory: FactoryDevfileV2 = {
        v: FACTORY_CONSTANTS.CURRENT_VERSION,
        devfile: devfile,
        source: 'devfile.yaml',
        name: this.extractNameFromUrl(url),
        scm_info: {
          clone_url: url,
          scm_provider: scmProvider,
          ...(branch && { branch }),
        },
        links: this.generateFactoryLinks(url),
      };

      return factory;
    } catch (error: any) {
      // Re-throw UnauthorizedException without wrapping it
      // so the route handler can properly detect it and return 401
      const { UnauthorizedException } = await import('../models/UnauthorizedException');
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // If devfile is not found, return a basic factory response instead of error
      // This matches the Java Che Server behavior
      if (
        error.message?.includes('No devfile found') ||
        error.message?.includes('not found in repository') ||
        error.message?.includes('Requested file not found')
      ) {
        logger.info('No devfile found, returning basic factory response');

        const scmProvider = this.detectScmProvider(url);
        const branch = this.extractBranchFromUrl(url);

        // Return basic factory with empty devfile structure
        const factory: FactoryDevfileV2 = {
          source: 'repo',
          v: FACTORY_CONSTANTS.CURRENT_VERSION,
          devfile: {
            schemaVersion: '2.3.0',
          },
          scm_info: {
            clone_url: url,
            scm_provider: scmProvider,
            ...(branch && { branch }),
          },
          links: this.generateFactoryLinks(url),
        };

        return factory;
      }

      // For other errors (parsing, validation, etc.), throw
      throw new Error(`Failed to resolve factory from ${url}: ${error.message}`);
    }
  }

  parseFactoryUrl(url: string): RemoteFactoryUrl {
    try {
      const parsedUrl = new URL(url);
      return {
        providerUrl: `${parsedUrl.protocol}//${parsedUrl.host}`,
        branch: this.extractBranchFromUrl(url),
      };
    } catch {
      throw new Error(`Invalid factory URL: ${url}`);
    }
  }

  getProviderName(): string {
    return 'scm-repository';
  }

  priority(): FactoryResolverPriority {
    // Higher priority than raw URL resolver, so SCM URLs are handled here first
    return FactoryResolverPriority.DEFAULT;
  }

  private extractNameFromUrl(url: string): string {
    try {
      const parsedUrl = new URL(url);
      const pathParts = parsedUrl.pathname.split('/').filter(p => p);

      // For repository URLs, use the repository name
      if (pathParts.length >= 2) {
        let repoName = pathParts[pathParts.length - 1];
        // Remove .git suffix if present
        if (repoName.endsWith('.git')) {
          repoName = repoName.substring(0, repoName.length - 4);
        }
        return repoName;
      }

      return 'factory';
    } catch {
      return 'factory';
    }
  }

  private extractBranchFromUrl(url: string): string | undefined {
    try {
      const parsedUrl = new URL(url);
      const pathParts = parsedUrl.pathname.split('/').filter(p => p);

      // Check for /tree/<branch> or /blob/<branch> pattern (GitHub/GitLab)
      const treeIndex = pathParts.indexOf('tree');
      const blobIndex = pathParts.indexOf('blob');

      if (treeIndex >= 0 && pathParts.length > treeIndex + 1) {
        return pathParts[treeIndex + 1];
      }
      if (blobIndex >= 0 && pathParts.length > blobIndex + 1) {
        return pathParts[blobIndex + 1];
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  private detectScmProvider(url: string): string {
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.includes('github.com')) {
      return 'github';
    }
    if (lowerUrl.includes('gitlab.com') || lowerUrl.includes('gitlab')) {
      return 'gitlab';
    }
    if (lowerUrl.includes('bitbucket.org') || lowerUrl.includes('bitbucket')) {
      return 'bitbucket';
    }
    if (lowerUrl.includes('dev.azure.com') || lowerUrl.includes('visualstudio.com')) {
      return 'azure-devops';
    }

    // Default to generic git
    return 'git';
  }

  private generateFactoryLinks(repositoryUrl: string): Link[] {
    // Get the base URL for API server (from environment)
    // Use CHE_API_ENDPOINT if available, otherwise construct from request
    const apiEndpoint = process.env.CHE_API_ENDPOINT || 'http://localhost:8080';

    const links: Link[] = [];

    // Files to generate links for
    const files = [
      'devfile.yaml',
      '.che/che-editor.yaml',
      '.che/che-theia-plugins.yaml',
      '.vscode/extensions.json',
    ];

    files.forEach(file => {
      links.push({
        rel: `${file} content`,
        href: `${apiEndpoint}/api/scm/resolve?repository=${encodeURIComponent(repositoryUrl)}&file=${encodeURIComponent(file)}`,
        method: 'GET',
      });
    });

    return links;
  }
}
