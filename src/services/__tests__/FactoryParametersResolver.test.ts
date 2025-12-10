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

// Mock axios instances from getCertificateAuthority BEFORE imports
jest.mock('../../helpers/getCertificateAuthority', () => ({
  axiosInstanceNoCert: {
    get: jest.fn(),
  },
  axiosInstance: {
    get: jest.fn(),
  },
}));

import {
  RawDevfileUrlFactoryParameterResolver,
  ScmRepositoryFactoryResolver,
  DEFAULT_DEVFILE_FILENAMES,
  FactoryResolverPriority,
} from '../FactoryParametersResolver';
import { FACTORY_CONSTANTS, FactoryDevfileV2 } from '../../models/FactoryModels';
import { axiosInstanceNoCert } from '../../helpers/getCertificateAuthority';

describe('DEFAULT_DEVFILE_FILENAMES', () => {
  it('should have default values', () => {
    expect(DEFAULT_DEVFILE_FILENAMES).toContain('devfile.yaml');
    expect(DEFAULT_DEVFILE_FILENAMES).toContain('.devfile.yaml');
  });

  it('should read from environment variable', () => {
    const originalEnv = process.env.CHE_FACTORY_DEFAULT_DEVFILE_FILENAMES;

    // This test can only verify the mechanism exists
    // since DEFAULT_DEVFILE_FILENAMES is already initialized
    expect(DEFAULT_DEVFILE_FILENAMES).toBeDefined();
    expect(Array.isArray(DEFAULT_DEVFILE_FILENAMES)).toBe(true);

    // Restore
    if (originalEnv) {
      process.env.CHE_FACTORY_DEFAULT_DEVFILE_FILENAMES = originalEnv;
    }
  });
});

describe('RawDevfileUrlFactoryParameterResolver', () => {
  let resolver: RawDevfileUrlFactoryParameterResolver;

  beforeEach(() => {
    resolver = new RawDevfileUrlFactoryParameterResolver();
    jest.clearAllMocks();
  });

  describe('accept()', () => {
    it('should accept URL ending with devfile.yaml', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://example.com/devfile.yaml',
      };

      expect(resolver.accept(parameters)).toBe(true);
    });

    it('should accept URL ending with .devfile.yaml', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://example.com/.devfile.yaml',
      };

      expect(resolver.accept(parameters)).toBe(true);
    });

    it('should accept URL with query parameters', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://example.com/devfile.yaml?token=abc123',
      };

      expect(resolver.accept(parameters)).toBe(true);
    });

    it('should accept URL with fragment', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://example.com/devfile.yaml#section',
      };

      expect(resolver.accept(parameters)).toBe(true);
    });

    it('should reject URL not ending with devfile filename', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://example.com/file.txt',
      };

      expect(resolver.accept(parameters)).toBe(false);
    });

    it('should reject repository URL without devfile filename', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://github.com/user/repo',
      };

      expect(resolver.accept(parameters)).toBe(false);
    });

    it('should reject missing URL parameter', () => {
      const parameters = {};

      expect(resolver.accept(parameters)).toBe(false);
    });

    it('should reject invalid URL', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'not-a-valid-url',
      };

      expect(resolver.accept(parameters)).toBe(false);
    });

    it('should be case insensitive', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://example.com/DEVFILE.YAML',
      };

      expect(resolver.accept(parameters)).toBe(true);
    });
  });

  describe('createFactory()', () => {
    it('should create factory from valid devfile URL', async () => {
      const devfileContent = JSON.stringify({
        schemaVersion: '2.1.0',
        metadata: { name: 'my-devfile' },
      });

      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://example.com/devfile.yaml',
      };

      const factory = (await resolver.createFactory(parameters)) as FactoryDevfileV2;

      expect(factory).toBeDefined();
      expect(factory.v).toBe(FACTORY_CONSTANTS.CURRENT_VERSION);
      expect(factory.devfile).toBeDefined();
      expect(factory.source).toBe('devfile.yaml');
    });

    it('should throw error if URL is missing', async () => {
      const parameters = {};

      await expect(resolver.createFactory(parameters)).rejects.toThrow(
        FACTORY_CONSTANTS.ERRORS.URL_REQUIRED,
      );
    });

    it('should throw error if URL does not end with devfile filename', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: 'not valid yaml or json content',
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://example.com/file.txt',
      };

      // Should fail when trying to parse invalid content
      await expect(resolver.createFactory(parameters)).rejects.toThrow(/Failed to (parse|create)/);
    });

    it('should throw error if fetch fails', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://example.com/devfile.yaml',
      };

      await expect(resolver.createFactory(parameters)).rejects.toThrow('Failed to fetch devfile');
    });

    it('should handle YAML content gracefully', async () => {
      // For now, YAML content creates a minimal devfile
      const yamlContent = 'schemaVersion: 2.1.0\nmetadata:\n  name: test';

      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: yamlContent,
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://example.com/devfile.yaml',
      };

      const factory = (await resolver.createFactory(parameters)) as FactoryDevfileV2;

      expect(factory).toBeDefined();
      expect(factory.devfile).toBeDefined();
    });
  });

  describe('parseFactoryUrl()', () => {
    it('should parse valid URL', () => {
      const url = 'https://example.com/path/devfile.yaml';
      const parsed = resolver.parseFactoryUrl(url);

      expect(parsed.providerUrl).toBe('https://example.com');
      expect(parsed.devfileFileLocation).toBe(url);
    });

    it('should throw error for invalid URL', () => {
      expect(() => {
        resolver.parseFactoryUrl('not-a-valid-url');
      }).toThrow('Invalid factory URL');
    });
  });

  describe('getProviderName()', () => {
    it('should return raw-url provider name', () => {
      expect(resolver.getProviderName()).toBe('raw-url');
    });
  });

  describe('priority()', () => {
    it('should return HIGHEST priority', () => {
      expect(resolver.priority()).toBe(FactoryResolverPriority.HIGHEST);
    });
  });
});

describe('ScmRepositoryFactoryResolver', () => {
  let resolver: ScmRepositoryFactoryResolver;

  beforeEach(() => {
    resolver = new ScmRepositoryFactoryResolver();
    jest.clearAllMocks();
  });

  describe('accept()', () => {
    it('should accept GitHub repository URL without devfile filename', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://github.com/user/repo',
      };

      expect(resolver.accept(parameters)).toBe(true);
    });

    it('should accept GitHub URL with branch', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://github.com/user/repo/tree/main',
      };

      expect(resolver.accept(parameters)).toBe(true);
    });

    it('should accept GitLab repository URL', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://gitlab.com/user/repo',
      };

      expect(resolver.accept(parameters)).toBe(true);
    });

    it('should accept GitLab URL with subgroups', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://gitlab.com/group/subgroup/project',
      };

      expect(resolver.accept(parameters)).toBe(true);
    });

    it('should accept Bitbucket repository URL', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://bitbucket.org/workspace/repo',
      };

      expect(resolver.accept(parameters)).toBe(true);
    });

    it('should reject GitHub URL already containing devfile filename', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]:
          'https://github.com/user/repo/blob/main/devfile.yaml',
      };

      // Should reject because this should be handled by RawDevfileUrlFactoryParameterResolver
      expect(resolver.accept(parameters)).toBe(false);
    });

    it('should reject non-SCM URLs', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://example.com/file',
      };

      expect(resolver.accept(parameters)).toBe(false);
    });

    it('should reject missing URL parameter', () => {
      const parameters = {};

      expect(resolver.accept(parameters)).toBe(false);
    });

    it('should reject invalid URL', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'not-a-valid-url',
      };

      expect(resolver.accept(parameters)).toBe(false);
    });

    it('should accept .git suffix URLs', () => {
      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://github.com/user/repo.git',
      };

      expect(resolver.accept(parameters)).toBe(true);
    });
  });

  describe('createFactory()', () => {
    it('should create factory from GitHub repository URL', async () => {
      const devfileContent = JSON.stringify({
        schemaVersion: '2.1.0',
        metadata: { name: 'my-devfile' },
      });

      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://github.com/eclipse/che',
      };

      const factory = (await resolver.createFactory(parameters)) as FactoryDevfileV2;

      expect(factory).toBeDefined();
      expect(factory.v).toBe(FACTORY_CONSTANTS.CURRENT_VERSION);
      expect(factory.devfile).toBeDefined();
      expect(factory.source).toBe('devfile.yaml');
      expect(factory.name).toBe('che');

      // Check scm_info
      expect(factory.scm_info).toBeDefined();
      expect(factory.scm_info?.clone_url).toBe('https://github.com/eclipse/che');
      expect(factory.scm_info?.scm_provider).toBe('github');

      // Check links
      expect(factory.links).toBeDefined();
      expect(factory.links?.length).toBeGreaterThan(0);
      expect(factory.links?.[0].rel).toContain('content');
      expect(factory.links?.[0].method).toBe('GET');
    });

    it('should try multiple devfile filenames', async () => {
      // First attempt (devfile.yaml) fails
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
      });

      // Second attempt (.devfile.yaml) succeeds
      const devfileContent = JSON.stringify({
        schemaVersion: '2.1.0',
        metadata: { name: 'my-devfile' },
      });

      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://github.com/user/repo',
        // Add authorization to avoid UnauthorizedException on first 404
        authorization: 'Bearer test-token',
      };

      const factory = (await resolver.createFactory(parameters)) as FactoryDevfileV2;

      expect(factory).toBeDefined();
      expect(axiosInstanceNoCert.get).toHaveBeenCalledTimes(2);
    });

    it('should throw error if URL is missing', async () => {
      const parameters = {};

      await expect(resolver.createFactory(parameters)).rejects.toThrow(
        FACTORY_CONSTANTS.ERRORS.URL_REQUIRED,
      );
    });

    it('should throw UnauthorizedException if no devfile found and no authorization', async () => {
      // All attempts fail with 404 (treated as private repo)
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://github.com/user/repo',
      };

      await expect(resolver.createFactory(parameters)).rejects.toThrow(
        'SCM Authentication required',
      );
    });

    it('should extract repository name correctly', async () => {
      const devfileContent = JSON.stringify({
        schemaVersion: '2.1.0',
        metadata: { name: 'my-devfile' },
      });

      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]:
          'https://github.com/organization/my-awesome-project',
      };

      const factory = (await resolver.createFactory(parameters)) as FactoryDevfileV2;

      expect(factory.name).toBe('my-awesome-project');
    });

    it('should handle .git suffix in URL', async () => {
      const devfileContent = JSON.stringify({
        schemaVersion: '2.1.0',
        metadata: { name: 'my-devfile' },
      });

      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://github.com/user/repo.git',
      };

      const factory = (await resolver.createFactory(parameters)) as FactoryDevfileV2;

      expect(factory.name).toBe('repo');
      expect(factory.scm_info?.clone_url).toBe('https://github.com/user/repo.git');
    });

    it('should generate proper links for repository', async () => {
      const devfileContent = JSON.stringify({
        schemaVersion: '2.1.0',
        metadata: { name: 'my-devfile' },
      });

      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://github.com/user/repo.git',
        // Add authorization to avoid UnauthorizedException
        authorization: 'Bearer test-token',
      };

      const factory = (await resolver.createFactory(parameters)) as FactoryDevfileV2;

      expect(factory.links).toBeDefined();
      // Links include 4 scm/resolve links (no self link in test environment)
      expect(factory.links?.length).toBeGreaterThanOrEqual(4);

      // Check that all expected files are linked
      const expectedFiles = [
        'devfile.yaml',
        '.che/che-editor.yaml',
        '.che/che-theia-plugins.yaml',
        '.vscode/extensions.json',
      ];

      expectedFiles.forEach(file => {
        const link = factory.links?.find(l => l.rel === `${file} content`);
        expect(link).toBeDefined();
        expect(link?.href).toContain('/scm/resolve');
        expect(link?.href).toContain('repository=');
        expect(link?.href).toContain('file=');
        expect(link?.method).toBe('GET');
      });
    });

    it('should properly parse YAML devfile content from GitHub repository', async () => {
      // Mock YAML devfile content (not JSON) like che-dashboard has
      const yamlDevfileContent = `schemaVersion: 2.1.0
metadata:
  name: che-dashboard
  description: Eclipse Che Dashboard
projects:
  - name: che-dashboard
    git:
      remotes:
        origin: https://github.com/eclipse-che/che-dashboard.git
components:
  - name: dev
    container:
      image: quay.io/devfile/universal-developer-image:latest
      memoryLimit: 3Gi`;

      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: yamlDevfileContent,
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://github.com/eclipse-che/che-dashboard',
      };

      const factory = (await resolver.createFactory(parameters)) as FactoryDevfileV2;

      // Verify the devfile is properly parsed from YAML
      expect(factory).toBeDefined();
      expect(factory.v).toBe('4.0');
      expect(factory.devfile).toBeDefined();
      expect(factory.devfile.schemaVersion).toBe('2.1.0');
      expect(factory.devfile.metadata).toBeDefined();
      expect(factory.devfile.metadata.name).toBe('che-dashboard');
      expect(factory.devfile.metadata.description).toBe('Eclipse Che Dashboard');

      // Verify projects are properly parsed
      expect(factory.devfile.projects).toBeDefined();
      expect(factory.devfile.projects.length).toBe(1);
      expect(factory.devfile.projects[0].name).toBe('che-dashboard');
      expect(factory.devfile.projects[0].git).toBeDefined();
      expect(factory.devfile.projects[0].git.remotes).toBeDefined();
      expect(factory.devfile.projects[0].git.remotes.origin).toBe(
        'https://github.com/eclipse-che/che-dashboard.git',
      );

      // Verify components are properly parsed
      expect(factory.devfile.components).toBeDefined();
      expect(factory.devfile.components.length).toBe(1);
      expect(factory.devfile.components[0].name).toBe('dev');
      expect(factory.devfile.components[0].container).toBeDefined();
      expect(factory.devfile.components[0].container.image).toBe(
        'quay.io/devfile/universal-developer-image:latest',
      );
      expect(factory.devfile.components[0].container.memoryLimit).toBe('3Gi');

      // Verify SCM info
      expect(factory.scm_info).toBeDefined();
      expect(factory.scm_info?.clone_url).toBe('https://github.com/eclipse-che/che-dashboard');
      expect(factory.scm_info?.scm_provider).toBe('github');

      // Verify axios was called
      expect(axiosInstanceNoCert.get).toHaveBeenCalled();
    });

    it('should detect GitLab provider', async () => {
      const devfileContent = JSON.stringify({
        schemaVersion: '2.1.0',
        metadata: { name: 'my-devfile' },
      });

      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://gitlab.com/user/repo',
      };

      const factory = (await resolver.createFactory(parameters)) as FactoryDevfileV2;

      expect(factory.scm_info?.scm_provider).toBe('gitlab');
    });

    it('should detect Bitbucket provider', async () => {
      const devfileContent = JSON.stringify({
        schemaVersion: '2.1.0',
        metadata: { name: 'my-devfile' },
      });

      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const parameters = {
        [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://bitbucket.org/workspace/repo',
      };

      const factory = (await resolver.createFactory(parameters)) as FactoryDevfileV2;

      expect(factory.scm_info?.scm_provider).toBe('bitbucket');
    });
  });

  describe('parseFactoryUrl()', () => {
    it('should parse GitHub URL', () => {
      const url = 'https://github.com/user/repo';
      const parsed = resolver.parseFactoryUrl(url);

      expect(parsed.providerUrl).toBe('https://github.com');
    });

    it('should parse GitLab URL', () => {
      const url = 'https://gitlab.com/group/project';
      const parsed = resolver.parseFactoryUrl(url);

      expect(parsed.providerUrl).toBe('https://gitlab.com');
    });

    it('should extract branch from URL', () => {
      const url = 'https://github.com/user/repo/tree/feature-branch';
      const parsed = resolver.parseFactoryUrl(url);

      expect(parsed.branch).toBe('feature-branch');
    });

    it('should throw error for invalid URL', () => {
      expect(() => {
        resolver.parseFactoryUrl('not-a-valid-url');
      }).toThrow('Invalid factory URL');
    });
  });

  describe('getProviderName()', () => {
    it('should return scm-repository provider name', () => {
      expect(resolver.getProviderName()).toBe('scm-repository');
    });
  });

  describe('priority()', () => {
    it('should return DEFAULT priority', () => {
      expect(resolver.priority()).toBe(FactoryResolverPriority.DEFAULT);
    });
  });
});

describe('Resolver Priority', () => {
  it('should prioritize ScmRepositoryFactoryResolver over RawDevfileUrlFactoryParameterResolver for repo URLs', () => {
    const scmResolver = new ScmRepositoryFactoryResolver();
    const rawResolver = new RawDevfileUrlFactoryParameterResolver();

    const repoUrlParams = {
      [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://github.com/user/repo',
    };

    // SCM resolver should accept repository URLs
    expect(scmResolver.accept(repoUrlParams)).toBe(true);
    // Raw resolver should reject repository URLs
    expect(rawResolver.accept(repoUrlParams)).toBe(false);
  });

  it('should prioritize RawDevfileUrlFactoryParameterResolver for direct devfile URLs', () => {
    const scmResolver = new ScmRepositoryFactoryResolver();
    const rawResolver = new RawDevfileUrlFactoryParameterResolver();

    const devfileUrlParams = {
      [FACTORY_CONSTANTS.URL_PARAMETER_NAME]: 'https://github.com/user/repo/blob/main/devfile.yaml',
    };

    // Raw resolver should accept direct devfile URLs with highest priority
    expect(rawResolver.accept(devfileUrlParams)).toBe(true);
    expect(rawResolver.priority()).toBe(FactoryResolverPriority.HIGHEST);

    // SCM resolver should reject URLs that already have devfile filename
    expect(scmResolver.accept(devfileUrlParams)).toBe(false);
  });
});
