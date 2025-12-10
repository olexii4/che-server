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

import * as fs from 'fs';
import {
  getServiceAccountToken,
  isLocalRun,
  SERVICE_ACCOUNT_TOKEN_PATH,
} from '../getServiceAccountToken';

jest.mock('fs');
jest.mock('../../utils/logger');

describe('getServiceAccountToken', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isLocalRun', () => {
    it('should return true when LOCAL_RUN is true', () => {
      process.env.LOCAL_RUN = 'true';
      expect(isLocalRun()).toBe(true);
    });

    it('should return false when LOCAL_RUN is not set', () => {
      delete process.env.LOCAL_RUN;
      expect(isLocalRun()).toBe(false);
    });

    it('should return false when LOCAL_RUN is false', () => {
      process.env.LOCAL_RUN = 'false';
      expect(isLocalRun()).toBe(false);
    });
  });

  describe('getServiceAccountToken', () => {
    describe('in local run mode', () => {
      beforeEach(() => {
        process.env.LOCAL_RUN = 'true';
      });

      it('should return SERVICE_ACCOUNT_TOKEN from env', () => {
        process.env.SERVICE_ACCOUNT_TOKEN = 'local-test-token';
        const token = getServiceAccountToken();
        expect(token).toBe('local-test-token');
      });

      it('should return empty string if SERVICE_ACCOUNT_TOKEN is not set', () => {
        delete process.env.SERVICE_ACCOUNT_TOKEN;
        const token = getServiceAccountToken();
        expect(token).toBe('');
      });
    });

    describe('in cluster mode', () => {
      beforeEach(() => {
        delete process.env.LOCAL_RUN;
      });

      it('should read token from service account file', () => {
        const mockToken = 'cluster-service-account-token\n';
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(mockToken);

        const token = getServiceAccountToken();

        expect(fs.existsSync).toHaveBeenCalledWith(SERVICE_ACCOUNT_TOKEN_PATH);
        expect(fs.readFileSync).toHaveBeenCalledWith(SERVICE_ACCOUNT_TOKEN_PATH, 'utf-8');
        expect(token).toBe('cluster-service-account-token');
      });

      it('should trim whitespace from token', () => {
        const mockToken = '  token-with-spaces  \n';
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.readFileSync as jest.Mock).mockReturnValue(mockToken);

        const token = getServiceAccountToken();

        expect(token).toBe('token-with-spaces');
      });

      it('should exit if service account file does not exist', () => {
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => {}) as any);

        getServiceAccountToken();

        expect(mockExit).toHaveBeenCalledWith(1);
        mockExit.mockRestore();
      });
    });
  });
});
