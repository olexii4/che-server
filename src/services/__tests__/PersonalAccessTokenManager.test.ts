/**
 * Copyright (c) 2018-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { PersonalAccessTokenManager } from '../PersonalAccessTokenManager';

describe('PersonalAccessTokenManager', () => {
  let manager: PersonalAccessTokenManager;

  beforeEach(() => {
    manager = new PersonalAccessTokenManager();
  });

  describe('getAndStore', () => {
    it('should store token for a server', async () => {
      await manager.getAndStore('https://github.com');
      const token = manager.getToken('https://github.com');
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
    });

    it('should handle different servers separately', async () => {
      await manager.getAndStore('https://github.com');
      await manager.getAndStore('https://gitlab.com');

      const githubToken = manager.getToken('https://github.com');
      const gitlabToken = manager.getToken('https://gitlab.com');

      expect(githubToken).toBeDefined();
      expect(gitlabToken).toBeDefined();
      expect(githubToken).not.toBe(gitlabToken);
    });
  });

  describe('getToken', () => {
    it('should return undefined for non-existent server', () => {
      const token = manager.getToken('https://bitbucket.org');
      expect(token).toBeUndefined();
    });

    it('should return stored token', async () => {
      await manager.getAndStore('https://github.com');
      const token = manager.getToken('https://github.com');
      expect(token).toBeDefined();
    });
  });

  describe('hasToken', () => {
    it('should return false for non-existent server', () => {
      const hasToken = manager.hasToken('https://bitbucket.org');
      expect(hasToken).toBe(false);
    });

    it('should return true for existing token', async () => {
      await manager.getAndStore('https://github.com');
      const hasToken = manager.hasToken('https://github.com');
      expect(hasToken).toBe(true);
    });
  });

  describe('forceRefreshPersonalAccessToken', () => {
    it('should refresh token for server', async () => {
      await manager.getAndStore('https://github.com');
      const oldToken = manager.getToken('https://github.com');

      await manager.forceRefreshPersonalAccessToken('https://github.com');
      const newToken = manager.getToken('https://github.com');

      expect(newToken).toBeDefined();
      expect(newToken).not.toBe(oldToken);
    });

    it('should create token if none exists', async () => {
      await manager.forceRefreshPersonalAccessToken('https://gitlab.com');
      const token = manager.getToken('https://gitlab.com');
      expect(token).toBeDefined();
    });
  });

  describe('token persistence', () => {
    it('should persist token across multiple gets', async () => {
      await manager.getAndStore('https://api.example.com');

      const token1 = manager.getToken('https://api.example.com');
      const token2 = manager.getToken('https://api.example.com');
      const token3 = manager.getToken('https://api.example.com');

      expect(token1).toBeDefined();
      expect(token1).toBe(token2);
      expect(token2).toBe(token3);
    });
  });
});
