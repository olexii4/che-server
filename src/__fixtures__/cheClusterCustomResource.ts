/*
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

/**
 * Fixture for CheCluster Custom Resource
 * Based on real production data with dummy/sanitized values
 */
export const cheClusterCustomResource = {
  apiVersion: 'org.eclipse.che/v2',
  kind: 'CheCluster',
  metadata: {
    annotations: {
      'che.eclipse.org/checluster-defaults-cleanup':
        '{"containers.resources":"true","spec.components.dashboard.headerMessage":"true","spec.components.pluginRegistry.openVSXURL":"true","spec.devEnvironments.defaultComponents":"true","spec.devEnvironments.defaultEditor":"true","spec.devEnvironments.disableContainerBuildCapabilities":"true"}',
    },
    creationTimestamp: '2020-06-17T14:25:20Z',
    finalizers: [
      'oauthclients.finalizers.che.eclipse.org',
      'consolelink.finalizers.che.eclipse.org',
      'checluster.che.eclipse.org',
    ],
    generation: 100,
    name: 'eclipse-che',
    namespace: 'dummy-namespace',
    resourceVersion: '12345678',
    uid: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  },
  spec: {
    components: {
      cheServer: {
        debug: false,
        deployment: {
          containers: [
            {
              image: 'quay.io/eclipse/che-server:next',
              name: 'che',
            },
          ],
          securityContext: {},
        },
        extraProperties: {
          CHE_LOGS_APPENDERS_IMPL: 'json',
          JAVA_OPTS: '-XX:MaxRAMPercentage=85.0',
        },
        logLevel: 'INFO',
        proxy: {},
      },
      dashboard: {
        branding: {
          logo: {
            base64data:
              'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHJlY3Qgd2lkdGg9IjI0IiBoZWlnaHQ9IjI0IiBmaWxsPSIjMzMzIi8+PC9zdmc+',
            mediatype: 'image/svg+xml',
          },
        },
        deployment: {
          containers: [
            {
              image: 'quay.io/eclipse/che-dashboard:next',
              name: 'che-dashboard',
            },
          ],
        },
        logLevel: 'ERROR',
      },
      devWorkspace: {
        runningLimit: '2',
      },
      devfileRegistry: {
        deployment: {
          securityContext: {},
        },
        disableInternalRegistry: false,
        externalDevfileRegistries: [
          {
            url: 'https://registry.devfile.io/',
          },
        ],
      },
      imagePuller: {
        enable: true,
        spec: {},
      },
      metrics: {
        enable: true,
      },
      pluginRegistry: {
        deployment: {
          securityContext: {},
        },
        openVSXURL: 'https://open-vsx.org/',
      },
    },
    containerRegistry: {},
    devEnvironments: {
      containerBuildConfiguration: {
        openShiftSecurityContextConstraint: 'container-build',
      },
      defaultEditor: 'che-incubator/che-code/insiders',
      defaultNamespace: {
        autoProvision: true,
        template: '<username>-che',
      },
      disableContainerRunCapabilities: true,
      gatewayContainer: {
        resources: {
          limits: {
            cpu: '500m',
            memory: '256Mi',
          },
          request: {
            cpu: '50m',
            memory: '64Mi',
          },
        },
      },
      ignoredUnrecoverableEvents: ['FailedScheduling'],
      maxNumberOfWorkspacesPerUser: -1,
      persistUserHome: {
        enabled: true,
      },
      secondsOfInactivityBeforeIdling: 10800,
      secondsOfRunBeforeIdling: 86400,
      security: {},
      startTimeoutSeconds: 300,
      storage: {
        perWorkspaceStrategyPvcConfig: {
          claimSize: '8Gi',
        },
        pvcStrategy: 'per-workspace',
      },
      trustedCerts: {
        disableWorkspaceCaBundleMount: false,
      },
      workspacesPodAnnotations: {
        'io.kubernetes.cri-o.Devices': '/dev/fuse',
      },
    },
    gitServices: {},
    networking: {
      auth: {
        advancedAuthorization: {
          allowGroups: ['team-a', 'team-b', 'team-c', 'interns'],
        },
        gateway: {
          configLabels: {
            app: 'che',
            component: 'che-gateway-config',
          },
          deployment: {
            containers: [
              {
                env: [
                  {
                    name: 'TRAEFIK_LOG_LEVEL',
                    value: 'DEBUG',
                  },
                  {
                    name: 'TRAEFIK_LOG',
                    value: 'true',
                  },
                ],
                name: 'gateway',
              },
            ],
            securityContext: {},
          },
        },
        identityProviderURL: 'https://che.example.com/auth',
        oAuthClientName: 'eclipse-che-openshift-identity-provider',
        oAuthSecret: 'dummy-secret',
      },
      hostname: 'che.example.com',
    },
  },
  status: {
    chePhase: 'Active',
    cheURL: 'https://che.example.com',
    cheVersion: 'next',
    devfileRegistryURL: '',
    gatewayPhase: 'Established',
    pluginRegistryURL: '',
    workspaceBaseDomain: 'example.com',
  },
};

/**
 * Minimal CheCluster fixture for simple tests
 */
export const minimalCheClusterCustomResource = {
  apiVersion: 'org.eclipse.che/v2',
  kind: 'CheCluster',
  metadata: {
    name: 'eclipse-che',
    namespace: 'eclipse-che',
  },
  spec: {
    components: {
      cheServer: {},
      dashboard: {},
      devfileRegistry: {},
      pluginRegistry: {},
    },
    devEnvironments: {
      defaultNamespace: {
        autoProvision: true,
        template: '<username>-che',
      },
      storage: {
        pvcStrategy: 'common',
      },
    },
    networking: {},
  },
  status: {
    chePhase: 'Active',
    cheURL: 'https://che.example.com',
    cheVersion: 'next',
  },
};

/**
 * CheCluster with container build enabled
 */
export const cheClusterWithContainerBuild = {
  ...minimalCheClusterCustomResource,
  spec: {
    ...minimalCheClusterCustomResource.spec,
    devEnvironments: {
      ...minimalCheClusterCustomResource.spec.devEnvironments,
      containerBuildConfiguration: {
        openShiftSecurityContextConstraint: 'container-build',
      },
      disableContainerBuildCapabilities: false,
    },
  },
};

/**
 * CheCluster with advanced authorization
 */
export const cheClusterWithAdvancedAuth = {
  ...minimalCheClusterCustomResource,
  spec: {
    ...minimalCheClusterCustomResource.spec,
    networking: {
      auth: {
        advancedAuthorization: {
          allowUsers: ['user1', 'user2'],
          allowGroups: ['team-a', 'team-b'],
          denyUsers: ['blocked-user'],
          denyGroups: ['blocked-group'],
        },
      },
    },
  },
};

/**
 * CheCluster with autoProvision disabled
 */
export const cheClusterWithAutoProvisionDisabled = {
  ...minimalCheClusterCustomResource,
  spec: {
    ...minimalCheClusterCustomResource.spec,
    devEnvironments: {
      ...minimalCheClusterCustomResource.spec.devEnvironments,
      defaultNamespace: {
        autoProvision: false,
        template: '<username>-che',
      },
    },
  },
};

