# User Profile Secret Implementation Analysis

## Overview

This document analyzes the Eclipse Che Java implementation of user profile/preferences configurators and compares it with our TypeScript implementation to determine if we can manage user profile secrets without requiring additional RBAC permissions.

## Eclipse Che Java Implementation

### Architecture

Eclipse Che uses **Namespace Configurators** - a set of components that run in sequence when provisioning a user namespace:

```java
// From KubernetesInfraModule.java (lines 102-114)
// ⚠️ ORDER MATTERS!
// We first need to grant permissions to user, only then we can run other configurators with user's client.

Multibinder<NamespaceConfigurator> namespaceConfigurators =
    Multibinder.newSetBinder(binder(), NamespaceConfigurator.class);

namespaceConfigurators.addBinding().to(UserPermissionConfigurator.class);        // 1️⃣ FIRST
namespaceConfigurators.addBinding().to(CredentialsSecretConfigurator.class);     // 2️⃣
namespaceConfigurators.addBinding().to(OAuthTokenSecretsConfigurator.class);      // 3️⃣
namespaceConfigurators.addBinding().to(PreferencesConfigMapConfigurator.class);   // 4️⃣
namespaceConfigurators.addBinding().to(WorkspaceServiceAccountConfigurator.class);// 5️⃣
namespaceConfigurators.addBinding().to(UserProfileConfigurator.class);            // 6️⃣ User Profile Secret
namespaceConfigurators.addBinding().to(UserPreferencesConfigurator.class);        // 7️⃣ DEPRECATED
namespaceConfigurators.addBinding().to(GitconfigConfigurator.class);             // 8️⃣
```

### Key Points

1. **Execution Order**: Configurators run in a specific sequence
2. **User Permissions First**: `UserPermissionConfigurator` grants permissions before other configurators run
3. **Service Account Client**: All configurators use `cheServerKubernetesClientFactory` which provides a **privileged Kubernetes client** with cluster-level permissions

### UserProfileConfigurator.java

**Purpose**: Creates a Secret with user profile information (id, name, email) for DevWorkspaces to access.

```java
@Singleton
public class UserProfileConfigurator implements NamespaceConfigurator {
  private static final String USER_PROFILE_SECRET_NAME = "user-profile";
  private static final String USER_PROFILE_SECRET_MOUNT_PATH = "/config/user/profile";

  private final CheServerKubernetesClientFactory cheServerKubernetesClientFactory;

  @Override
  public void configure(NamespaceResolutionContext namespaceResolutionContext, String namespaceName)
      throws InfrastructureException {
    Secret userProfileSecret = prepareProfileSecret(namespaceResolutionContext);
    try {
      // 🔑 KEY: Uses cheServerKubernetesClientFactory (Che Server's service account)
      cheServerKubernetesClientFactory
          .create()
          .secrets()
          .inNamespace(namespaceName)
          .createOrReplace(userProfileSecret);
    } catch (KubernetesClientException e) {
      throw new InfrastructureException(
          "Error occurred while trying to create user profile secret.", e);
    }
  }

  private Secret prepareProfileSecret(NamespaceResolutionContext namespaceResolutionContext) {
    var userId = namespaceResolutionContext.getUserId();
    var userName = namespaceResolutionContext.getUserName();
    var userEmail = userName + "@che";

    Base64.Encoder enc = Base64.getEncoder();
    final Map<String, String> userProfileData = new HashMap<>();
    userProfileData.put("id", enc.encodeToString(userId.getBytes()));
    userProfileData.put("name", enc.encodeToString(userName.getBytes()));
    userProfileData.put("email", enc.encodeToString(userEmail.getBytes()));

    return new SecretBuilder()
        .addToData(userProfileData)
        .withNewMetadata()
        .withName(USER_PROFILE_SECRET_NAME)
        .addToLabels(DEV_WORKSPACE_MOUNT_LABEL, "true")                     // "controller.devfile.io/mount-to-devworkspace"
        .addToLabels(DEV_WORKSPACE_WATCH_SECRET_LABEL, "true")              // "controller.devfile.io/watch-secret"
        .addToLabels("app.kubernetes.io/part-of", "che.eclipse.org")
        .addToAnnotations(DEV_WORKSPACE_MOUNT_AS_ANNOTATION, "file")        // "controller.devfile.io/mount-as"
        .addToAnnotations(DEV_WORKSPACE_MOUNT_PATH_ANNOTATION, USER_PROFILE_SECRET_MOUNT_PATH)  // "/config/user/profile"
        .endMetadata()
        .build();
  }
}
```

### UserPreferencesConfigurator.java

**Status**: ⚠️ **DEPRECATED** (as of 2023)

```java
@Deprecated
@Singleton
public class UserPreferencesConfigurator implements NamespaceConfigurator {
  private static final String USER_PREFERENCES_SECRET_NAME = "user-preferences";

  @Override
  public void configure(NamespaceResolutionContext namespaceResolutionContext, String namespaceName) {
    LOG.debug("'user-preferences' secret is obsolete and not configured anymore for DevWorkspaces");
  }
}
```

**Reason**: User preferences are no longer stored as Secrets. This configurator exists only for backwards compatibility.

### CredentialsSecretConfigurator.java

**Purpose**: Manages Personal Access Token (PAT) secrets for SCM providers (GitHub, GitLab, etc.)

**Key Points**:
- Reads existing PAT secrets with labels: `app.kubernetes.io/part-of=che.eclipse.org` and `app.kubernetes.io/component=scm-personal-access-token`
- Merges them into a single `devworkspace-merged-git-credentials` secret
- Uses `cheServerKubernetesClientFactory` (service account client)

---

## Our TypeScript Implementation

### Architecture

We use a similar pattern but simplified:

```typescript
// From NamespaceProvisioner.ts
export class NamespaceProvisioner {
  async provision(namespaceResolutionContext: NamespaceResolutionContext): Promise<KubernetesNamespaceMeta> {
    // 1️⃣ Evaluate namespace name
    const namespaceName = this.namespaceFactory.evaluateNamespaceName(namespaceResolutionContext);

    // 2️⃣ Get or create the namespace (using service account token)
    const namespace = await this.namespaceFactory.getOrCreate(namespaceName, userId);

    // 3️⃣ Configure the namespace (create user-profile Secret)
    await this.configure(namespaceResolutionContext, namespace.metadata.name);

    // 4️⃣ Fetch and return namespace metadata
    return await this.namespaceFactory.fetchNamespace(namespace.metadata.name);
  }

  private async configure(
    namespaceResolutionContext: NamespaceResolutionContext,
    namespaceName: string,
  ): Promise<void> {
    // 🔑 KEY: Uses service account token from kubeConfig
    const userProfileService = new UserProfileService(this.kubeConfig);
    
    // Get user profile (will create Secret if it doesn't exist)
    await userProfileService.getUserProfile(namespaceName);
  }
}
```

### UserProfileService.ts

**Purpose**: Manages user profile Secrets (same as Java implementation)

```typescript
export class UserProfileService {
  private coreV1Api: k8s.CoreV1Api;

  constructor(kubeConfig: k8s.KubeConfig) {
    // 🔑 KEY: Uses kubeConfig with service account token
    this.coreV1Api = kubeConfig.makeApiClient(k8s.CoreV1Api);
  }

  async getUserProfile(namespace: string): Promise<UserProfile> {
    try {
      // Try to read existing secret
      const response = await this.coreV1Api.readNamespacedSecret(
        USER_PROFILE_SECRET_NAME,
        namespace,
      );
      // Decode and return profile
      return this.decodeProfile(response.body.data);
    } catch (error) {
      if (error.statusCode === 404) {
        // Secret doesn't exist - create it
        return await this.createUserProfileSecret(namespace);
      }
      throw error;
    }
  }

  private async createUserProfileSecret(namespace: string): Promise<UserProfile> {
    const profile = this.getDefaultProfile(namespace);

    const secret: k8s.V1Secret = {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: USER_PROFILE_SECRET_NAME,
        namespace: namespace,
        labels: {
          'app.kubernetes.io/part-of': 'che.eclipse.org',
          'controller.devfile.io/mount-to-devworkspace': 'true',
          'controller.devfile.io/watch-secret': 'true',
        },
        annotations: {
          'controller.devfile.io/mount-as': 'file',
          'controller.devfile.io/mount-path': '/config/user/profile',
        },
      },
      type: 'Opaque',
      data: {
        id: Buffer.from(profile.id).toString('base64'),
        name: Buffer.from(profile.username).toString('base64'),
        email: Buffer.from(profile.email).toString('base64'),
      },
    };

    // 🔑 KEY: Creates secret using service account token
    await this.coreV1Api.createNamespacedSecret(namespace, secret);
    
    return profile;
  }
}
```

---

## Comparison: Java vs TypeScript

| Aspect | Eclipse Che (Java) | che-server (TypeScript) | Match? |
|--------|-------------------|------------------------------|---------|
| **Service Account Token** | ✅ Uses `cheServerKubernetesClientFactory` | ✅ Uses `getServiceAccountToken()` + `getKubeConfig()` | ✅ YES |
| **Secret Name** | `user-profile` | `user-profile` | ✅ YES |
| **Secret Data** | `id`, `name`, `email` (base64) | `id`, `name`, `email` (base64) | ✅ YES |
| **Labels** | `controller.devfile.io/mount-to-devworkspace: "true"` | `controller.devfile.io/mount-to-devworkspace: "true"` | ✅ YES |
|  | `controller.devfile.io/watch-secret: "true"` | `controller.devfile.io/watch-secret: "true"` | ✅ YES |
|  | `app.kubernetes.io/part-of: "che.eclipse.org"` | `app.kubernetes.io/part-of: "che.eclipse.org"` | ✅ YES |
| **Annotations** | `controller.devfile.io/mount-as: "file"` | `controller.devfile.io/mount-as: "file"` | ✅ YES |
|  | `controller.devfile.io/mount-path: "/config/user/profile"` | `controller.devfile.io/mount-path: "/config/user/profile"` | ✅ YES |
| **Mount Path** | `/config/user/profile` | `/config/user/profile` | ✅ YES |
| **Creation Time** | During namespace provisioning | During namespace provisioning | ✅ YES |
| **Lazy Creation** | ❌ Always created upfront | ✅ Created on first access if missing | ⚠️ Different (better!) |
| **User Preferences Secret** | ⚠️ Deprecated (not created) | ⚠️ Not implemented | ✅ YES (intentional) |

---

## 🔑 Key Finding: RBAC Requirements

### Question: Can we solve the user profile secret problem without changing RBAC?

### Answer: ✅ **YES! Both implementations already do this.**

### Why?

Both implementations use the **Che Server's service account token** to create the `user-profile` Secret:

#### Java:
```java
// Uses cheServerKubernetesClientFactory (Che Server's service account)
cheServerKubernetesClientFactory
    .create()
    .secrets()
    .inNamespace(namespaceName)
    .createOrReplace(userProfileSecret);
```

#### TypeScript:
```typescript
// From namespaceRoutes.ts (lines 186-196)
// Use service account token for namespace creation (cluster-level operation)
// The service account has permissions to create/manage namespaces
const serviceAccountToken = getServiceAccountToken();
const kubeConfig = getKubeConfig(serviceAccountToken);

// Create factory and provisioner with service account config
const namespaceFactory = new KubernetesNamespaceFactory(namespaceTemplate, kubeConfig);
const namespaceProvisioner = new NamespaceProvisioner(namespaceFactory, kubeConfig);

// Provision the namespace (this creates the user-profile Secret)
const namespaceMeta = await namespaceProvisioner.provision(context);
```

### Current RBAC Permissions (Che Operator)

The Che Operator's service account already has the necessary permissions:

```yaml
# From che-operator.ClusterRole.yaml (lines 192-207)
- apiGroups:
  - ""
  resources:
  - configmaps
  - persistentvolumeclaims
  - pods
  - secrets            # ✅ Secrets permission
  - serviceaccounts
  - services
  verbs:
  - create             # ✅ Can create
  - delete
  - get
  - update
  - patch
  - watch
  - list
```

### What This Means

1. **No User RBAC Required**: Users don't need permissions to create Secrets in their namespace
2. **Service Account Does Everything**: The Che Server's service account creates the Secret on the user's behalf
3. **Secure by Design**: Users can only read their own profile Secret (DevWorkspace operator mounts it)
4. **Already Implemented**: Our current implementation matches Java perfectly

---

## Token Usage Patterns

### Namespace Provisioning (POST /api/kubernetes/namespace/provision)

```typescript
// 1️⃣ User token: Authentication only
const userToken = request.headers.authorization;
const userSubject = authenticateToken(userToken);  // Extract username

// 2️⃣ Service account token: All Kubernetes operations
const serviceAccountToken = getServiceAccountToken();
const kubeConfig = getKubeConfig(serviceAccountToken);

// 3️⃣ Operations using service account
await namespaceFactory.getOrCreate(namespaceName);           // Creates namespace
await userProfileService.getUserProfile(namespaceName);      // Creates user-profile Secret
```

### User Profile Access (internal helper)

The TypeScript implementation stores user identity data in the `user-profile` Secret inside the user namespace.
This Secret is created/ensured during namespace provisioning and may also be accessed by internal services when needed.

---

## Advantages of Our Implementation

### 1. **Lazy Creation** (Improvement over Java)

**Java**: Always creates the Secret during namespace provisioning (even if never needed)

**TypeScript**: Creates the Secret only when first accessed
- More efficient
- Reduces unnecessary API calls
- Handles missing Secrets gracefully

### 2. **Deterministic UUIDs**

```typescript
// Generate a deterministic UUID based on username
// Same user always gets the same UUID
const hash = crypto.createHash('sha256').update(username).digest('hex');
const id = `${hash.substring(0, 8)}-${hash.substring(8, 12)}-4${hash.substring(13, 16)}-...`;
```

**Benefits**:
- Consistent user IDs across reinstalls
- No database required
- Reproducible for testing

### 3. **Simpler Architecture**

**Java**: Multiple configurators with strict ordering requirements

**TypeScript**: Single `NamespaceProvisioner` with clear flow
- Easier to maintain
- Fewer moving parts
- Better testability

---

## Conclusion

### ✅ **We Already Have the Correct Solution**

Our TypeScript implementation:
1. ✅ Uses service account token (just like Java)
2. ✅ Creates `user-profile` Secret with correct labels/annotations
3. ✅ Mounts at `/config/user/profile` in DevWorkspaces
4. ✅ Does NOT require user RBAC permissions
5. ✅ Actually improves on Java with lazy creation

### 🎯 **No RBAC Changes Needed**

The Che Operator's service account already has all necessary permissions to create Secrets in any namespace. Users don't need any special permissions - the Che Server acts on their behalf.

### 📚 **Why This Works**

1. **Service Account Pattern**: Both implementations use a privileged service account for cluster-level operations
2. **DevWorkspace Controller**: Automatically mounts Secrets with the correct labels into workspaces
3. **Security**: Users can only access their own workspace, which has their profile Secret mounted
4. **Standard Kubernetes**: This is the standard pattern for operators - users interact with high-level APIs, operators manage low-level Kubernetes resources

---

## References

### Eclipse Che (Java)
- `UserProfileConfigurator.java`: Creates user-profile Secret
- `UserPreferencesConfigurator.java`: Deprecated (no longer used)
- `CredentialsSecretConfigurator.java`: Manages PAT secrets
- `KubernetesInfraModule.java`: Defines configurator order
- `CheServerKubernetesClientFactory`: Provides privileged Kubernetes client

### che-server (TypeScript)
- `UserProfileService.ts`: Manages user-profile Secrets
- `NamespaceProvisioner.ts`: Orchestrates namespace setup
- `namespaceRoutes.ts`: API endpoints for namespace operations
- `docs/RBAC_PERMISSIONS.md`: RBAC documentation
- `docs/NAMESPACE_PROVISIONING_IMPLEMENTATION.md`: Implementation details

### DevWorkspace Operator
- Automatically mounts Secrets with label `controller.devfile.io/mount-to-devworkspace: "true"`
- Supports annotations for mount path and type
- Handles Secret lifecycle in workspaces


