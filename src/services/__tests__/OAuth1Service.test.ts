/**
 * Copyright (c) 2021-2025 Red Hat, Inc.
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 */

import { getRedirectAfterLoginUrl } from '../OAuth1Service';

describe('OAuth1Service redirect_after_login encoding (Java parity)', () => {
  it('should encode redirect URL query when it contains decoded JSON braces', () => {
    const params = new Map<string, string>();
    // Simulates Java test case where redirect_after_login is decoded to contain "{}"
    params.set('redirect_after_login', 'https://redirecturl.com?params={}');

    expect(getRedirectAfterLoginUrl(params)).toBe('https://redirecturl.com?params%3D%7B%7D');
  });

  it('should not encode redirect URL query when JSON is still percent-encoded', () => {
    const params = new Map<string, string>();
    params.set('redirect_after_login', 'https://redirecturl.com?params=%7B%7D');

    expect(getRedirectAfterLoginUrl(params)).toBe('https://redirecturl.com?params=%7B%7D');
  });
});


