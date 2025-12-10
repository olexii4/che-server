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
  UnauthorizedException,
  buildOAuthAuthenticateUrl,
  detectOAuthProvider,
  isAuthenticationError,
} from '../UnauthorizedException';

describe('UnauthorizedException', () => {
  it('should create exception with proper fields', () => {
    const exception = new UnauthorizedException(
      'SCM Authentication required',
      'bitbucket',
      '2.0',
      'http://localhost:8080/oauth/authenticate?oauth_provider=bitbucket&scope=repository&request_method=POST&signature_method=rsa',
    );

    expect(exception.statusCode).toBe(401);
    expect(exception.oauthProvider).toBe('bitbucket');
    expect(exception.oauthVersion).toBe('2.0');
    expect(exception.message).toBe('SCM Authentication required');
    expect(exception.authenticateUrl).toContain('/oauth/authenticate');
  });

  it('should convert to JSON with proper structure', () => {
    const exception = new UnauthorizedException(
      'SCM Authentication required',
      'bitbucket',
      '2.0',
      'http://localhost:8080/oauth/authenticate?oauth_provider=bitbucket&scope=repository&request_method=POST&signature_method=rsa',
    );

    const json = exception.toJSON();

    expect(json).toEqual({
      errorCode: 401,
      message: 'SCM Authentication required',
      attributes: {
        oauth_provider: 'bitbucket',
        oauth_version: '2.0',
        oauth_authentication_url: expect.stringContaining('/oauth/authenticate'),
      },
    });
  });

  it('should use default OAuth version 2.0', () => {
    const exception = new UnauthorizedException(
      'SCM Authentication required',
      'github',
      undefined as any,
      'http://localhost:8080/oauth/authenticate',
    );

    expect(exception.oauthVersion).toBe('2.0');
  });
});

describe('buildOAuthAuthenticateUrl', () => {
  it('should build proper OAuth URL for Bitbucket with /api prefix', () => {
    const url = buildOAuthAuthenticateUrl(
      'http://localhost:8080',
      'bitbucket',
      'repository',
      'POST',
      'rsa',
    );

    expect(url).toBe(
      'http://localhost:8080/api/oauth/authenticate?oauth_provider=bitbucket&scope=repository&request_method=POST&signature_method=rsa',
    );
  });

  it('should build proper OAuth URL for GitHub with /api prefix', () => {
    const url = buildOAuthAuthenticateUrl('http://localhost:8080', 'github', 'repo', 'POST', 'rsa');

    expect(url).toBe(
      'http://localhost:8080/api/oauth/authenticate?oauth_provider=github&scope=repo&request_method=POST&signature_method=rsa',
    );
  });

  it('should use default parameters and include /api prefix', () => {
    const url = buildOAuthAuthenticateUrl('http://localhost:8080', 'gitlab');

    expect(url).toBe(
      'http://localhost:8080/api/oauth/authenticate?oauth_provider=gitlab&scope=repository&request_method=POST&signature_method=rsa',
    );
  });

  it('should handle URL with trailing slash and add /api prefix', () => {
    const url = buildOAuthAuthenticateUrl('http://localhost:8080/', 'bitbucket');

    expect(url).toContain('/api/oauth/authenticate');
    expect(url).toContain('oauth_provider=bitbucket');
  });
});

describe('detectOAuthProvider', () => {
  it('should detect GitHub provider', () => {
    expect(detectOAuthProvider('https://github.com/user/repo')).toBe('github');
    expect(detectOAuthProvider('https://github.enterprise.com/user/repo')).toBe('github');
    expect(detectOAuthProvider('https://GITHUB.com/user/repo')).toBe('github');
  });

  it('should detect GitLab provider', () => {
    expect(detectOAuthProvider('https://gitlab.com/user/repo')).toBe('gitlab');
    expect(detectOAuthProvider('https://gitlab.example.com/user/repo')).toBe('gitlab');
    expect(detectOAuthProvider('https://GITLAB.com/user/repo')).toBe('gitlab');
  });

  it('should detect Bitbucket provider', () => {
    expect(detectOAuthProvider('https://bitbucket.org/workspace/repo')).toBe('bitbucket');
    expect(detectOAuthProvider('https://bitbucket.org/workspace/repo.git')).toBe('bitbucket');
    expect(detectOAuthProvider('https://BITBUCKET.org/workspace/repo')).toBe('bitbucket');
  });

  it('should detect Azure DevOps provider', () => {
    expect(detectOAuthProvider('https://dev.azure.com/org/project')).toBe('azure-devops');
    expect(detectOAuthProvider('https://org.visualstudio.com/project')).toBe('azure-devops');
  });

  it('should return unknown for unrecognized providers', () => {
    expect(detectOAuthProvider('https://custom-git.com/user/repo')).toBe('unknown');
    expect(detectOAuthProvider('https://example.com/repo')).toBe('unknown');
  });
});

describe('isAuthenticationError', () => {
  it('should return true for 401 status', () => {
    expect(isAuthenticationError(401)).toBe(true);
  });

  it('should return true for 403 status', () => {
    expect(isAuthenticationError(403)).toBe(true);
  });

  it('should return false for other status codes', () => {
    expect(isAuthenticationError(200)).toBe(false);
    expect(isAuthenticationError(404)).toBe(false);
    expect(isAuthenticationError(500)).toBe(false);
  });
});
