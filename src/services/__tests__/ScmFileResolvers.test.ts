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
  GitHubFileResolver,
  GitLabFileResolver,
  BitbucketFileResolver,
  AzureDevOpsFileResolver,
  GenericScmFileResolver,
  ScmService,
} from '../ScmFileResolvers';
import { SCM_CONSTANTS } from '../../models/ScmModels';
import { UnauthorizedException } from '../../models/UnauthorizedException';

// Mock axios instances from getCertificateAuthority
jest.mock('../../helpers/getCertificateAuthority', () => ({
  axiosInstanceNoCert: {
    get: jest.fn(),
  },
  axiosInstance: {
    get: jest.fn(),
  },
}));

import { axiosInstanceNoCert, axiosInstance } from '../../helpers/getCertificateAuthority';

describe('GitHubFileResolver', () => {
  let resolver: GitHubFileResolver;

  beforeEach(() => {
    resolver = new GitHubFileResolver();
    jest.clearAllMocks();
  });

  describe('accept()', () => {
    it('should accept GitHub URLs', () => {
      expect(resolver.accept('https://github.com/user/repo')).toBe(true);
      expect(resolver.accept('https://github.com/user/repo.git')).toBe(true);
      expect(resolver.accept('https://github.enterprise.com/user/repo')).toBe(true);
    });

    it('should reject non-GitHub URLs', () => {
      expect(resolver.accept('https://gitlab.com/user/repo')).toBe(false);
      expect(resolver.accept('https://example.com/user/repo')).toBe(false);
    });
  });

  describe('fileContent() with specific file path', () => {
    it('should fetch file content successfully with authorization', async () => {
      const mockContent = 'file content';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: mockContent,
      });

      const content = await resolver.fileContent(
        'https://github.com/user/repo',
        'README.md',
        'Bearer token',
      );

      expect(content).toBe(mockContent);
      expect(axiosInstanceNoCert.get).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on 404 without authorization', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        resolver.fileContent('https://github.com/user/repo', 'missing.md'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw file not found error on 404 with authorization', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        resolver.fileContent('https://github.com/user/repo', 'missing.md', 'Bearer token'),
      ).rejects.toThrow();
    });

    it('should throw error on other HTTP errors', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(
        resolver.fileContent('https://github.com/user/repo', 'file.md', 'Bearer token'),
      ).rejects.toThrow();
    });
  });

  describe('fileContent() without file path (auto-detect devfile)', () => {
    it('should throw UnauthorizedException if no devfile found without auth', async () => {
      // All attempts fail with 404 - should treat as private repo
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
      });

      await expect(resolver.fileContent('https://github.com/user/repo')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should try multiple devfile filenames with authorization', async () => {
      // First attempt (devfile.yaml) fails with 404
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
      });

      // Second attempt (.devfile.yaml) succeeds
      const devfileContent = 'schemaVersion: 2.1.0';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const content = await resolver.fileContent(
        'https://github.com/user/repo',
        undefined,
        'Bearer token',
      );

      expect(content).toBe(devfileContent);
    });

    it('should handle network errors', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockRejectedValue(new Error('Network error'));
      (axiosInstance.get as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(
        resolver.fileContent('https://github.com/user/repo', undefined, 'Bearer token'),
      ).rejects.toThrow();
    });
  });

  describe('URL construction', () => {
    it('should construct proper raw.githubusercontent.com URLs', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: 'content',
      });

      await resolver.fileContent(
        'https://github.com/eclipse/che/tree/main',
        'devfile.yaml',
        'Bearer token',
      );

      const callUrl = (axiosInstanceNoCert.get as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain('raw.githubusercontent.com/eclipse/che/main/devfile.yaml');
    });
  });
});

describe('GitLabFileResolver', () => {
  let resolver: GitLabFileResolver;

  beforeEach(() => {
    resolver = new GitLabFileResolver();
    jest.clearAllMocks();
  });

  describe('accept()', () => {
    it('should accept GitLab URLs', () => {
      expect(resolver.accept('https://gitlab.com/user/repo')).toBe(true);
      expect(resolver.accept('https://gitlab.com/group/subgroup/repo')).toBe(true);
      expect(resolver.accept('https://gitlab.enterprise.com/user/repo')).toBe(true);
    });

    it('should reject non-GitLab URLs', () => {
      expect(resolver.accept('https://github.com/user/repo')).toBe(false);
      expect(resolver.accept('https://example.com/user/repo')).toBe(false);
    });
  });

  describe('fileContent() with specific file path', () => {
    it('should fetch file content successfully with authorization', async () => {
      const mockContent = 'file content';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: mockContent,
      });

      const content = await resolver.fileContent(
        'https://gitlab.com/user/repo',
        'README.md',
        'Bearer token',
      );

      expect(content).toBe(mockContent);
    });

    it('should throw UnauthorizedException on 404 without authorization', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        resolver.fileContent('https://gitlab.com/user/repo', 'missing.md'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('fileContent() without file path (auto-detect devfile)', () => {
    it('should try multiple devfile filenames with authorization', async () => {
      // First attempt fails
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
      });

      // Second attempt succeeds
      const devfileContent = 'schemaVersion: 2.1.0';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const content = await resolver.fileContent(
        'https://gitlab.com/user/repo',
        undefined,
        'Bearer token',
      );

      expect(content).toBe(devfileContent);
    });

    it('should throw UnauthorizedException if no devfile found without auth', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
      });

      await expect(resolver.fileContent('https://gitlab.com/user/repo')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('URL construction', () => {
    it('should construct proper GitLab API URLs', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: 'content',
      });

      await resolver.fileContent(
        'https://gitlab.com/group/subgroup/project',
        'devfile.yaml',
        'Bearer token',
      );

      const callUrl = (axiosInstanceNoCert.get as jest.Mock).mock.calls[0][0];
      expect(callUrl).toContain('gitlab.com');
    });
  });
});

describe('BitbucketFileResolver', () => {
  let resolver: BitbucketFileResolver;

  beforeEach(() => {
    resolver = new BitbucketFileResolver();
    jest.clearAllMocks();
  });

  describe('accept()', () => {
    it('should accept Bitbucket URLs', () => {
      expect(resolver.accept('https://bitbucket.org/workspace/repo')).toBe(true);
      expect(resolver.accept('https://bitbucket.org/workspace/repo.git')).toBe(true);
    });

    it('should reject non-Bitbucket URLs', () => {
      expect(resolver.accept('https://github.com/user/repo')).toBe(false);
      expect(resolver.accept('https://gitlab.com/user/repo')).toBe(false);
    });
  });

  describe('fileContent() with specific file path', () => {
    it('should fetch file content successfully with authorization', async () => {
      const mockContent = 'schemaVersion: 2.1.0';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: mockContent,
      });

      const content = await resolver.fileContent(
        'https://bitbucket.org/workspace/repo',
        'devfile.yaml',
        'Bearer token',
      );

      expect(content).toBe(mockContent);
    });

    it('should throw UnauthorizedException on 404 without authorization', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        resolver.fileContent('https://bitbucket.org/workspace/repo', 'missing.yaml'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('fileContent() without file path (auto-detect devfile)', () => {
    it('should try multiple devfile filenames with authorization', async () => {
      // First attempt fails
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
      });

      // Second attempt succeeds
      const devfileContent = 'schemaVersion: 2.1.0';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const content = await resolver.fileContent(
        'https://bitbucket.org/workspace/repo',
        undefined,
        'Bearer token',
      );

      expect(content).toBe(devfileContent);
    });

    it('should throw UnauthorizedException if no devfile found without auth', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
      });

      await expect(resolver.fileContent('https://bitbucket.org/workspace/repo')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('URL construction', () => {
    it('should construct proper Bitbucket raw URLs with authorization', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: 'content',
      });

      await resolver.fileContent(
        'https://bitbucket.org/workspace/repository',
        'devfile.yaml',
        'Bearer token',
      );

      const callUrl = (axiosInstanceNoCert.get as jest.Mock).mock.calls[0][0];
      // Bitbucket uses API endpoint for raw file access
      expect(callUrl).toContain('bitbucket.org');
    });
  });
});

describe('GenericScmFileResolver', () => {
  let resolver: GenericScmFileResolver;

  beforeEach(() => {
    resolver = new GenericScmFileResolver();
    jest.clearAllMocks();
  });

  describe('accept()', () => {
    it('should accept any valid URL', () => {
      expect(resolver.accept('https://example.com/file')).toBe(true);
      expect(resolver.accept('http://localhost:8080/file')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(resolver.accept('not-a-url')).toBe(false);
      expect(resolver.accept('')).toBe(false);
    });
  });

  describe('fileContent()', () => {
    it('should fetch file content from direct URL', async () => {
      const mockContent = 'file content';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: mockContent,
      });

      const content = await resolver.fileContent(
        'https://example.com/devfile.yaml',
        'devfile.yaml',
      );

      expect(content).toBe(mockContent);
    });

    it('should append file path if not already included', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: 'content',
      });

      await resolver.fileContent('https://example.com', 'file.yaml');

      const callUrl = (axiosInstanceNoCert.get as jest.Mock).mock.calls[0][0];
      expect(callUrl).toBe('https://example.com/file.yaml');
    });

    it('should not duplicate file path if already included', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: 'content',
      });

      await resolver.fileContent('https://example.com/file.yaml', 'file.yaml');

      const callUrl = (axiosInstanceNoCert.get as jest.Mock).mock.calls[0][0];
      expect(callUrl).toBe('https://example.com/file.yaml');
    });

    it('should throw error on HTTP error', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(resolver.fileContent('https://example.com/file', 'file')).rejects.toThrow();
    });
  });
});

describe('AzureDevOpsFileResolver', () => {
  let resolver: AzureDevOpsFileResolver;

  beforeEach(() => {
    resolver = new AzureDevOpsFileResolver();
    jest.clearAllMocks();
  });

  describe('accept()', () => {
    it('should accept Azure DevOps URLs', () => {
      expect(resolver.accept('https://dev.azure.com/org/project/_git/repo')).toBe(true);
      expect(resolver.accept('https://org.visualstudio.com/project/_git/repo')).toBe(true);
      expect(resolver.accept('https://dev.azure.com/org/project/_git/repo.git')).toBe(true);
    });

    it('should reject non-Azure DevOps URLs', () => {
      expect(resolver.accept('https://github.com/user/repo')).toBe(false);
      expect(resolver.accept('https://gitlab.com/user/repo')).toBe(false);
      expect(resolver.accept('https://bitbucket.org/workspace/repo')).toBe(false);
    });
  });

  describe('fileContent() with specific file path', () => {
    it('should fetch file content successfully with authorization', async () => {
      const mockContent = 'schemaVersion: 2.1.0';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: mockContent,
      });

      const content = await resolver.fileContent(
        'https://dev.azure.com/org/project/_git/repo',
        'devfile.yaml',
        'Bearer token',
      );

      expect(content).toBe(mockContent);
    });

    it('should throw UnauthorizedException on 404 without authorization', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        resolver.fileContent('https://dev.azure.com/org/project/_git/repo', 'missing.yaml'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on 401 without authorization', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 401,
        statusText: 'Unauthorized',
      });

      await expect(
        resolver.fileContent('https://dev.azure.com/org/project/_git/repo', 'devfile.yaml'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('fileContent() without file path (auto-detect devfile)', () => {
    it('should try devfile.yaml first and return content', async () => {
      const devfileContent = 'schemaVersion: 2.1.0\nmetadata:\n  name: test';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const content = await resolver.fileContent(
        'https://dev.azure.com/org/project/_git/repo',
        '',
        'Bearer token',
      );

      expect(content).toBe(devfileContent);
    });

    it('should throw UnauthorizedException if no devfile found without auth', async () => {
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
      });

      await expect(
        resolver.fileContent('https://dev.azure.com/org/project/_git/repo'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});

describe('ScmService', () => {
  let scmService: ScmService;

  beforeEach(() => {
    scmService = new ScmService();
    jest.clearAllMocks();
  });

  describe('resolveFile()', () => {
    it('should use GitHub resolver for GitHub URLs with authorization', async () => {
      const mockContent = 'devfile content';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: mockContent,
      });

      const content = await scmService.resolveFile(
        'https://github.com/user/repo',
        'devfile.yaml',
        'Bearer token',
      );

      expect(content).toBe(mockContent);
    });

    it('should use GitLab resolver for GitLab URLs with authorization', async () => {
      const mockContent = 'devfile content';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: mockContent,
      });

      const content = await scmService.resolveFile(
        'https://gitlab.com/user/repo',
        'devfile.yaml',
        'Bearer token',
      );

      expect(content).toBe(mockContent);
    });

    it('should use Bitbucket resolver for Bitbucket URLs with authorization', async () => {
      const mockContent = 'devfile content';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: mockContent,
      });

      const content = await scmService.resolveFile(
        'https://bitbucket.org/workspace/repo',
        'devfile.yaml',
        'Bearer token',
      );

      expect(content).toBe(mockContent);
    });

    it('should fall back to generic resolver for unknown URLs', async () => {
      const mockContent = 'file content';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: mockContent,
      });

      const content = await scmService.resolveFile(
        'https://custom-git.com/repo/file.yaml',
        'file.yaml',
      );

      expect(content).toBe(mockContent);
    });

    it('should throw error if repository is empty', async () => {
      await expect(scmService.resolveFile('', 'file.yaml')).rejects.toThrow(
        SCM_CONSTANTS.ERRORS.REPOSITORY_REQUIRED,
      );
    });

    it('should auto-detect devfile when file path is empty with authorization', async () => {
      const devfileContent = 'schemaVersion: 2.1.0';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const content = await scmService.resolveFile(
        'https://github.com/user/repo',
        '',
        'Bearer token',
      );

      expect(content).toBe(devfileContent);
    });

    it('should throw error if no resolver accepts the repository', async () => {
      // Create a service with no resolvers
      const emptyService = new ScmService();
      emptyService['resolvers'] = [];

      await expect(
        emptyService.resolveFile('https://github.com/user/repo', 'file'),
      ).rejects.toThrow(SCM_CONSTANTS.ERRORS.NO_RESOLVER);
    });
  });

  describe('auto-detect devfile filename', () => {
    it('should auto-detect devfile when no filename provided for GitHub with authorization', async () => {
      // First attempt (devfile.yaml) succeeds
      const devfileContent = 'schemaVersion: 2.1.0';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const content = await scmService.resolveFile(
        'https://github.com/user/repo',
        '',
        'Bearer token',
      );

      expect(content).toBe(devfileContent);
    });

    it('should try multiple filenames for GitLab with authorization', async () => {
      // First attempt fails
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 404,
        statusText: 'Not Found',
      });

      // Second attempt succeeds
      const devfileContent = 'schemaVersion: 2.1.0';
      (axiosInstanceNoCert.get as jest.Mock).mockResolvedValueOnce({
        status: 200,
        data: devfileContent,
      });

      const content = await scmService.resolveFile(
        'https://gitlab.com/user/repo',
        '',
        'Bearer token',
      );

      expect(content).toBe(devfileContent);
    });
  });
});
