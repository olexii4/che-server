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

/**
 * Context for namespace resolution containing user information.
 *
 * This is a TypeScript implementation of the Java class:
 * org.eclipse.che.api.workspace.server.spi.NamespaceResolutionContext
 */
export interface Subject {
  userId: string;
  userName: string;
  token?: string;
}

export interface NamespaceResolutionContext {
  subject: Subject;
  workspaceId?: string | null;
}

export class NamespaceResolutionContextImpl implements NamespaceResolutionContext {
  constructor(
    public subject: Subject,
    public workspaceId?: string | null,
  ) {}

  getUserId(): string {
    return this.subject.userId;
  }

  getUserName(): string {
    return this.subject.userName;
  }
}
