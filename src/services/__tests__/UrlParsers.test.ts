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

import { GithubUrl, GitlabUrl, BitbucketUrl, UrlParserService } from '../UrlParsers';

describe('GithubUrl', () => {
  describe('parse()', () => {
    it('should parse basic GitHub repository URL', () => {
      const url = 'https://github.com/eclipse/che';
      const githubUrl = GithubUrl.parse(url);

      expect(githubUrl).not.toBeNull();
      expect(githubUrl!.username).toBe('eclipse');
      expect(githubUrl!.repository).toBe('che');
      expect(githubUrl!.branch).toBe('HEAD');
      expect(githubUrl!.serverUrl).toBe('https://github.com');
    });

    it('should parse GitHub URL with .git suffix', () => {
      const url = 'https://github.com/eclipse/che.git';
      const githubUrl = GithubUrl.parse(url);

      expect(githubUrl).not.toBeNull();
      expect(githubUrl!.username).toBe('eclipse');
      expect(githubUrl!.repository).toBe('che');
    });

    it('should parse GitHub URL with branch', () => {
      const url = 'https://github.com/eclipse/che/tree/main';
      const githubUrl = GithubUrl.parse(url);

      expect(githubUrl).not.toBeNull();
      expect(githubUrl!.username).toBe('eclipse');
      expect(githubUrl!.repository).toBe('che');
      expect(githubUrl!.branch).toBe('main');
    });

    it('should parse GitHub URL with blob path', () => {
      const url = 'https://github.com/eclipse/che/blob/feature-branch/README.md';
      const githubUrl = GithubUrl.parse(url);

      expect(githubUrl).not.toBeNull();
      expect(githubUrl!.branch).toBe('feature-branch');
    });

    it('should return null for non-GitHub URL', () => {
      const url = 'https://example.com/user/repo';
      const githubUrl = GithubUrl.parse(url);

      expect(githubUrl).toBeNull();
    });

    it('should return null for invalid URL', () => {
      const url = 'not-a-valid-url';
      const githubUrl = GithubUrl.parse(url);

      expect(githubUrl).toBeNull();
    });

    it('should return null for GitHub URL with insufficient path', () => {
      const url = 'https://github.com/eclipse';
      const githubUrl = GithubUrl.parse(url);

      expect(githubUrl).toBeNull();
    });
  });

  describe('devfileFileLocations()', () => {
    it('should return multiple devfile locations', () => {
      const githubUrl = new GithubUrl('https://github.com', 'eclipse', 'che', 'main', [
        'devfile.yaml',
        '.devfile.yaml',
      ]);

      const locations = githubUrl.devfileFileLocations();

      expect(locations).toHaveLength(2);
      expect(locations[0].filename).toBe('devfile.yaml');
      expect(locations[0].location).toContain('devfile.yaml');
      expect(locations[1].filename).toBe('.devfile.yaml');
      expect(locations[1].location).toContain('.devfile.yaml');
    });

    it('should use custom devfile filenames', () => {
      const githubUrl = new GithubUrl('https://github.com', 'eclipse', 'che', 'main', [
        'custom-devfile.yaml',
        'my-devfile.yml',
      ]);

      const locations = githubUrl.devfileFileLocations();

      expect(locations).toHaveLength(2);
      expect(locations[0].filename).toBe('custom-devfile.yaml');
      expect(locations[1].filename).toBe('my-devfile.yml');
    });
  });

  describe('rawFileLocation()', () => {
    it('should construct raw.githubusercontent.com URL for github.com', () => {
      const githubUrl = new GithubUrl('https://github.com', 'eclipse', 'che', 'main');

      const rawUrl = githubUrl.rawFileLocation('devfile.yaml');

      expect(rawUrl).toBe('https://raw.githubusercontent.com/eclipse/che/main/devfile.yaml');
    });

    it('should use latestCommit if available', () => {
      const githubUrl = new GithubUrl('https://github.com', 'eclipse', 'che', 'main');
      githubUrl.latestCommit = 'abc123def456';

      const rawUrl = githubUrl.rawFileLocation('devfile.yaml');

      expect(rawUrl).toBe(
        'https://raw.githubusercontent.com/eclipse/che/abc123def456/devfile.yaml',
      );
    });

    it('should construct raw URL for GitHub Enterprise', () => {
      const githubUrl = new GithubUrl('https://github.enterprise.com', 'eclipse', 'che', 'main');

      const rawUrl = githubUrl.rawFileLocation('devfile.yaml');

      expect(rawUrl).toBe('https://github.enterprise.com/raw/eclipse/che/main/devfile.yaml');
    });

    it('should default to HEAD if no branch specified', () => {
      const githubUrl = new GithubUrl('https://github.com', 'eclipse', 'che');

      const rawUrl = githubUrl.rawFileLocation('devfile.yaml');

      expect(rawUrl).toContain('/HEAD/');
    });
  });
});

describe('GitlabUrl', () => {
  describe('parse()', () => {
    it('should parse basic GitLab repository URL', () => {
      const url = 'https://gitlab.com/gitlab-org/gitlab';
      const gitlabUrl = GitlabUrl.parse(url);

      expect(gitlabUrl).not.toBeNull();
      expect(gitlabUrl!.hostName).toBe('gitlab.com');
      expect(gitlabUrl!.subGroups).toBe('gitlab-org/gitlab');
      expect(gitlabUrl!.project).toBe('gitlab');
      expect(gitlabUrl!.branch).toBe('HEAD');
    });

    it('should parse GitLab URL with subgroups', () => {
      const url = 'https://gitlab.com/group/subgroup/project';
      const gitlabUrl = GitlabUrl.parse(url);

      expect(gitlabUrl).not.toBeNull();
      expect(gitlabUrl!.subGroups).toBe('group/subgroup/project');
      expect(gitlabUrl!.project).toBe('project');
    });

    it('should parse GitLab URL with branch', () => {
      const url = 'https://gitlab.com/gitlab-org/gitlab/-/tree/main';
      const gitlabUrl = GitlabUrl.parse(url);

      expect(gitlabUrl).not.toBeNull();
      expect(gitlabUrl!.branch).toBe('main');
      expect(gitlabUrl!.subGroups).toBe('gitlab-org/gitlab');
    });

    it('should parse GitLab URL with .git suffix', () => {
      const url = 'https://gitlab.com/gitlab-org/gitlab.git';
      const gitlabUrl = GitlabUrl.parse(url);

      expect(gitlabUrl).not.toBeNull();
      expect(gitlabUrl!.subGroups).toBe('gitlab-org/gitlab');
    });

    it('should parse GitLab URL with custom port', () => {
      const url = 'https://gitlab.company.com:8443/group/project';
      const gitlabUrl = GitlabUrl.parse(url);

      expect(gitlabUrl).not.toBeNull();
      expect(gitlabUrl!.hostName).toBe('gitlab.company.com');
      expect(gitlabUrl!.port).toBe('8443');
    });

    it('should return null for non-GitLab URL', () => {
      const url = 'https://example.com/user/repo';
      const gitlabUrl = GitlabUrl.parse(url);

      expect(gitlabUrl).toBeNull();
    });
  });

  describe('devfileFileLocations()', () => {
    it('should return multiple devfile locations', () => {
      const gitlabUrl = new GitlabUrl(
        'https',
        'gitlab.com',
        'gitlab-org/gitlab',
        'main',
        undefined,
        ['devfile.yaml', '.devfile.yaml'],
      );

      const locations = gitlabUrl.devfileFileLocations();

      expect(locations).toHaveLength(2);
      expect(locations[0].filename).toBe('devfile.yaml');
      expect(locations[1].filename).toBe('.devfile.yaml');
    });
  });

  describe('rawFileLocation()', () => {
    it('should construct GitLab API URL', () => {
      const gitlabUrl = new GitlabUrl('https', 'gitlab.com', 'gitlab-org/gitlab', 'main');

      const rawUrl = gitlabUrl.rawFileLocation('devfile.yaml');

      expect(rawUrl).toContain('gitlab.com/api/v4/projects/');
      expect(rawUrl).toContain(encodeURIComponent('gitlab-org/gitlab'));
      expect(rawUrl).toContain(encodeURIComponent('devfile.yaml'));
      expect(rawUrl).toContain('ref=main');
    });

    it('should URL-encode special characters', () => {
      const gitlabUrl = new GitlabUrl(
        'https',
        'gitlab.com',
        'group/subgroup/project',
        'feature/test-branch',
      );

      const rawUrl = gitlabUrl.rawFileLocation('.devfile.yaml');

      expect(rawUrl).toContain(encodeURIComponent('group/subgroup/project'));
      expect(rawUrl).toContain(encodeURIComponent('.devfile.yaml'));
      expect(rawUrl).toContain('ref=feature/test-branch');
    });

    it('should include port in URL if specified', () => {
      const gitlabUrl = new GitlabUrl(
        'https',
        'gitlab.company.com',
        'group/project',
        'main',
        '8443',
      );

      const rawUrl = gitlabUrl.rawFileLocation('devfile.yaml');

      expect(rawUrl).toContain('gitlab.company.com:8443');
    });

    it('should default to HEAD if no branch specified', () => {
      const gitlabUrl = new GitlabUrl('https', 'gitlab.com', 'group/project');

      const rawUrl = gitlabUrl.rawFileLocation('devfile.yaml');

      expect(rawUrl).toContain('ref=HEAD');
    });
  });
});

describe('BitbucketUrl', () => {
  describe('parse()', () => {
    it('should parse basic Bitbucket repository URL', () => {
      const url = 'https://bitbucket.org/workspace/repository';
      const bitbucketUrl = BitbucketUrl.parse(url);

      expect(bitbucketUrl).not.toBeNull();
      expect(bitbucketUrl!.workspace).toBe('workspace');
      expect(bitbucketUrl!.repository).toBe('repository');
      expect(bitbucketUrl!.branch).toBe('HEAD');
      expect(bitbucketUrl!.serverUrl).toBe('https://bitbucket.org');
    });

    it('should parse Bitbucket URL with .git suffix', () => {
      const url = 'https://bitbucket.org/workspace/repository.git';
      const bitbucketUrl = BitbucketUrl.parse(url);

      expect(bitbucketUrl).not.toBeNull();
      expect(bitbucketUrl!.repository).toBe('repository');
    });

    it('should parse Bitbucket URL with branch', () => {
      const url = 'https://bitbucket.org/workspace/repository/src/main';
      const bitbucketUrl = BitbucketUrl.parse(url);

      expect(bitbucketUrl).not.toBeNull();
      expect(bitbucketUrl!.branch).toBe('main');
    });

    it('should return null for non-Bitbucket URL', () => {
      const url = 'https://example.com/workspace/repo';
      const bitbucketUrl = BitbucketUrl.parse(url);

      expect(bitbucketUrl).toBeNull();
    });
  });

  describe('rawFileLocation()', () => {
    it('should construct Bitbucket API URL', () => {
      const bitbucketUrl = new BitbucketUrl(
        'https://bitbucket.org',
        'workspace',
        'repository',
        'main',
      );

      const rawUrl = bitbucketUrl.rawFileLocation('devfile.yaml');

      // Now uses Bitbucket API format
      expect(rawUrl).toBe(
        'https://api.bitbucket.org/2.0/repositories/workspace/repository/src/main/devfile.yaml',
      );
    });
  });
});

describe('UrlParserService', () => {
  describe('parse()', () => {
    it('should detect and parse GitHub URL', () => {
      const url = 'https://github.com/user/repo';
      const parsedUrl = UrlParserService.parse(url);

      expect(parsedUrl).not.toBeNull();
      expect(parsedUrl!.providerName).toBe('github');
    });

    it('should detect and parse GitLab URL', () => {
      const url = 'https://gitlab.com/user/repo';
      const parsedUrl = UrlParserService.parse(url);

      expect(parsedUrl).not.toBeNull();
      expect(parsedUrl!.providerName).toBe('gitlab');
    });

    it('should detect and parse Bitbucket URL', () => {
      const url = 'https://bitbucket.org/workspace/repo';
      const parsedUrl = UrlParserService.parse(url);

      expect(parsedUrl).not.toBeNull();
      expect(parsedUrl!.providerName).toBe('bitbucket');
    });

    it('should return null for unsupported URL', () => {
      const url = 'https://example.com/user/repo';
      const parsedUrl = UrlParserService.parse(url);

      expect(parsedUrl).toBeNull();
    });

    it('should use custom devfile filenames', () => {
      const url = 'https://github.com/user/repo';
      const customFilenames = ['custom.yaml', 'my-devfile.yaml'];
      const parsedUrl = UrlParserService.parse(url, customFilenames);

      expect(parsedUrl).not.toBeNull();
      expect(parsedUrl!.devfileFilenames).toEqual(customFilenames);
    });

    it('should prioritize GitHub over other providers', () => {
      // URL contains both 'github' and could match other patterns
      const url = 'https://github.com/user/gitlab';
      const parsedUrl = UrlParserService.parse(url);

      expect(parsedUrl!.providerName).toBe('github');
    });
  });
});
