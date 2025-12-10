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

import axios from 'axios';
import * as fs from 'fs';
import https from 'https';
import path from 'path';

const DEFAULT_CHE_SELF_SIGNED_MOUNT_PATH = 'public-certs';
const CHE_SELF_SIGNED_MOUNT_PATH = process.env.CHE_SELF_SIGNED_MOUNT_PATH;

const certificateAuthority = getCertificateAuthority(
  CHE_SELF_SIGNED_MOUNT_PATH ? CHE_SELF_SIGNED_MOUNT_PATH : DEFAULT_CHE_SELF_SIGNED_MOUNT_PATH,
);

/**
 * Axios instance without certificate validation
 * Used for initial requests that might not need certificates
 */
export const axiosInstanceNoCert = axios.create();

/**
 * Axios instance with certificate authority
 * Used for requests to servers with self-signed certificates
 */
export const axiosInstance =
  certificateAuthority !== undefined
    ? axios.create({
        httpsAgent: new https.Agent({
          ca: certificateAuthority,
        }),
      })
    : axios.create();

/**
 * Recursively search for certificates in a directory
 * @param certPath - Path to search for certificates
 * @param certificateAuthority - Array to store found certificates
 * @param subdirLevel - Current subdirectory level (for recursion limit)
 */
function searchCertificate(
  certPath: string,
  certificateAuthority: Buffer[],
  subdirLevel = 1,
): void {
  const maxSubdirQuantity = 10;
  const maxSubdirLevel = 5;

  const tmpPaths: string[] = [];
  try {
    const publicCertificates = fs.readdirSync(certPath);
    for (const publicCertificate of publicCertificates) {
      const newPath = path.join(certPath, publicCertificate);
      if (fs.lstatSync(newPath).isDirectory()) {
        if (tmpPaths.length < maxSubdirQuantity) {
          tmpPaths.push(newPath);
        }
      } else {
        const fullPath = path.join(certPath, publicCertificate);
        certificateAuthority.push(fs.readFileSync(fullPath));
      }
    }
  } catch (e) {
    // no-op - directory might not exist or be readable
  }

  if (subdirLevel < maxSubdirLevel) {
    for (const dirPath of tmpPaths) {
      searchCertificate(dirPath, certificateAuthority, subdirLevel + 1);
    }
  }
}

/**
 * Load certificate authority from the configured path
 * @param certPath - Path to search for certificates
 * @returns Array of certificate buffers or undefined if none found
 */
function getCertificateAuthority(certPath: string): Buffer[] | undefined {
  if (!fs.existsSync(certPath)) {
    return undefined;
  }

  const certificateAuthority: Buffer[] = [];
  searchCertificate(certPath, certificateAuthority);

  return certificateAuthority.length > 0 ? certificateAuthority : undefined;
}
