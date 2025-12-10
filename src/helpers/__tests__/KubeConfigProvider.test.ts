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

import * as k8s from '@kubernetes/client-node';
import { KubeConfigProvider } from '../KubeConfigProvider';

describe('KubeConfigProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getKubeConfig', () => {
    it('should create a KubeConfig with user token', () => {
      process.env.LOCAL_RUN = 'false';
      process.env.HOME = '/tmp';

      const provider = new KubeConfigProvider();
      const token = 'user123:johndoe';

      // Mock the base kubeconfig methods - all instances
      jest.spyOn(k8s.KubeConfig.prototype, 'loadFromCluster').mockImplementation(function (
        this: k8s.KubeConfig,
      ) {
        // Set up a basic cluster config on this instance
        this.loadFromClusterAndUser(
          { name: 'test-cluster', server: 'https://api.test.com:6443', skipTLSVerify: false },
          { name: 'service-account', token: 'sa-token' },
        );
      });

      const kubeConfig = provider.getKubeConfig(token);

      expect(kubeConfig).toBeInstanceOf(k8s.KubeConfig);
      // Check that a context was created with the user token
      const currentContext = kubeConfig.getCurrentContext();
      expect(currentContext).toBe('request-user-context');

      // Verify the user was added with the token
      const users = kubeConfig.users;
      expect(users.length).toBeGreaterThan(0);
      expect(users[0].token).toBe(token);

      // Cleanup
      jest.restoreAllMocks();
    });

    it('should handle tokens without colon separator', () => {
      process.env.LOCAL_RUN = 'false';

      const provider = new KubeConfigProvider();
      const token = 'simple-token';

      // Mock the base kubeconfig methods
      const mockLoadFromCluster = jest
        .spyOn(k8s.KubeConfig.prototype, 'loadFromCluster')
        .mockImplementation(() => {
          // Simulate successful in-cluster load
        });

      const mockGetCurrentContext = jest
        .spyOn(k8s.KubeConfig.prototype, 'getCurrentContext')
        .mockReturnValue('current-context');

      const mockGetContextObject = jest
        .spyOn(k8s.KubeConfig.prototype, 'getContextObject')
        .mockReturnValue({
          name: 'current-context',
          cluster: 'test-cluster',
          user: 'service-account',
        });

      const mockGetCluster = jest.spyOn(k8s.KubeConfig.prototype, 'getCluster').mockReturnValue({
        name: 'test-cluster',
        server: 'https://api.test.com:6443',
        skipTLSVerify: false,
      });

      const kubeConfig = provider.getKubeConfig(token);

      expect(kubeConfig).toBeInstanceOf(k8s.KubeConfig);

      // Cleanup
      mockLoadFromCluster.mockRestore();
      mockGetCurrentContext.mockRestore();
      mockGetContextObject.mockRestore();
      mockGetCluster.mockRestore();
    });

    it('should throw error if base kubeconfig has no current context', () => {
      process.env.LOCAL_RUN = 'false';

      const provider = new KubeConfigProvider();
      const token = 'user123:johndoe';

      // Mock methods to return invalid config
      const mockLoadFromCluster = jest
        .spyOn(k8s.KubeConfig.prototype, 'loadFromCluster')
        .mockImplementation(() => {});

      const mockGetCurrentContext = jest
        .spyOn(k8s.KubeConfig.prototype, 'getCurrentContext')
        .mockReturnValue('current-context');

      const mockGetContextObject = jest
        .spyOn(k8s.KubeConfig.prototype, 'getContextObject')
        .mockReturnValue(null);

      expect(() => provider.getKubeConfig(token)).toThrow(
        'Base kubeconfig is not valid: no current context is found',
      );

      // Cleanup
      mockLoadFromCluster.mockRestore();
      mockGetCurrentContext.mockRestore();
      mockGetContextObject.mockRestore();
    });

    it('should throw error if base kubeconfig has no cluster', () => {
      process.env.LOCAL_RUN = 'false';

      const provider = new KubeConfigProvider();
      const token = 'user123:johndoe';

      // Mock methods to return config without cluster
      const mockLoadFromCluster = jest
        .spyOn(k8s.KubeConfig.prototype, 'loadFromCluster')
        .mockImplementation(() => {});

      const mockGetCurrentContext = jest
        .spyOn(k8s.KubeConfig.prototype, 'getCurrentContext')
        .mockReturnValue('current-context');

      const mockGetContextObject = jest
        .spyOn(k8s.KubeConfig.prototype, 'getContextObject')
        .mockReturnValue({
          name: 'current-context',
          cluster: 'test-cluster',
          user: 'service-account',
        });

      const mockGetCluster = jest
        .spyOn(k8s.KubeConfig.prototype, 'getCluster')
        .mockReturnValue(null);

      expect(() => provider.getKubeConfig(token)).toThrow(
        'Base kubeconfig is not valid: no cluster exists specified in the current context',
      );

      // Cleanup
      mockLoadFromCluster.mockRestore();
      mockGetCurrentContext.mockRestore();
      mockGetContextObject.mockRestore();
      mockGetCluster.mockRestore();
    });
  });

  describe('isLocal', () => {
    it('should return true when LOCAL_RUN=true', () => {
      process.env.LOCAL_RUN = 'true';
      const provider = new KubeConfigProvider();
      expect(provider.isLocal()).toBe(true);
    });

    it('should return false when LOCAL_RUN=false', () => {
      process.env.LOCAL_RUN = 'false';
      const provider = new KubeConfigProvider();
      expect(provider.isLocal()).toBe(false);
    });

    it('should return false when LOCAL_RUN is not set', () => {
      delete process.env.LOCAL_RUN;
      const provider = new KubeConfigProvider();
      expect(provider.isLocal()).toBe(false);
    });
  });
});
