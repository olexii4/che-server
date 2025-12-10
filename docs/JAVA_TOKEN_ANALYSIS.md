# Java Implementation: Token Usage for `/api/kubernetes/namespace`

## 🔍 Analysis Summary

The original **Java Eclipse Che Server** uses the **Che service account token** for ALL namespace operations (both GET and POST), NOT the user token.

## 📁 Key Java Files Analyzed

### 1. `KubernetesNamespaceService.java`
**Location**: `che-server/infrastructures/kubernetes/src/main/java/org/eclipse/che/workspace/infrastructure/kubernetes/api/server/`

```java
@Path("/kubernetes/namespace")
public class KubernetesNamespaceService extends Service {
  
  private final KubernetesNamespaceFactory namespaceFactory;
  
  @GET
  public List<KubernetesNamespaceMetaDto> getNamespaces() throws InfrastructureException {
    // Uses namespaceFactory which has Che SA token
    return namespaceFactory.list().stream().map(this::asDto).collect(Collectors.toList());
  }
  
  @POST
  @Path("provision")
  public KubernetesNamespaceMetaDto provision() throws ApiException {
    // Gets user identity from context, but uses Che SA token for Kubernetes operations
    return asDto(
      namespaceProvisioner.provision(
        new NamespaceResolutionContext(EnvironmentContext.getCurrent().getSubject())));
  }
}
```

**Key Points**:
- ✅ Uses `namespaceFactory.list()` for GET - uses Che SA token
- ✅ Uses `namespaceProvisioner.provision()` for POST - uses Che SA token
- ✅ Gets user identity from `EnvironmentContext.getCurrent().getSubject()` - for namespace naming only
- ❌ Does NOT use user token for Kubernetes API calls

---

### 2. `KubernetesNamespaceFactory.java`
**Location**: `che-server/infrastructures/kubernetes/src/main/java/org/eclipse/che/workspace/infrastructure/kubernetes/namespace/`

```java
@Singleton
public class KubernetesNamespaceFactory {
  
  private final CheServerKubernetesClientFactory cheServerKubernetesClientFactory;
  
  @Inject
  public KubernetesNamespaceFactory(
      CheServerKubernetesClientFactory cheServerKubernetesClientFactory, // <-- Che SA client
      // ... other params
  ) {
    this.cheServerKubernetesClientFactory = cheServerKubernetesClientFactory;
  }
  
  public List<KubernetesNamespaceMeta> list() throws InfrastructureException {
    // Uses Che service account client
    KubernetesClient client = cheServerKubernetesClientFactory.create();
    
    return client.namespaces()
      .withLabel("app.kubernetes.io/part-of=che.eclipse.org")
      .list()
      .getItems()
      .stream()
      .map(this::asNamespaceMeta)
      .collect(Collectors.toList());
  }
}
```

**Key Points**:
- ✅ Injected with `CheServerKubernetesClientFactory` - provides Che SA client
- ✅ All Kubernetes operations use Che service account token
- ✅ Lists namespaces with label filter using cluster-level permissions

---

### 3. `CheServerKubernetesClientFactory.java`
**Location**: `che-server/infrastructures/kubernetes/src/main/java/org/eclipse/che/workspace/infrastructure/kubernetes/`

```java
/**
 * This {@link KubernetesClientFactory} ensures that we use `che` ServiceAccount and not related to
 * any workspace. It always provides client with default {@link Config}. It's useful for operations
 * that needs permissions of `che` SA, such as operations inside `che` namespace (like creating a
 * ConfigMaps for Gateway router) or some cluster-wide actions (like labeling the namespaces).
 */
@Singleton
public class CheServerKubernetesClientFactory extends KubernetesClientFactory {
  
  @Override
  public KubernetesClient create() throws InfrastructureException {
    // Returns client with Che service account token
    return super.create();
  }
  
  @Override
  protected Config buildConfig(Config config, String workspaceId) {
    // Does NOT modify config - uses default Che SA token
    return config;
  }
}
```

**Key Points**:
- ✅ Explicitly designed to use **Che service account**, not user tokens
- ✅ Javadoc confirms: "ensures that we use `che` ServiceAccount"
- ✅ Used for cluster-wide actions like labeling namespaces

---

## 🎯 Conclusion

### Java Implementation Pattern

```
┌─────────────────────────────────────────┐
│ User Request                            │
│ Authorization: Bearer <user-token>     │ ← User token for AUTH only
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│ KubernetesNamespaceService              │
│ - Extract Subject from user token       │ ← Get username/userId
│ - Create NamespaceResolutionContext     │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│ KubernetesNamespaceFactory              │
│ - Uses CheServerKubernetesClientFactory │ ← Che SA token!
│ - Creates namespace with Che SA perms   │
└───────────────┬─────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────┐
│ Kubernetes API                          │
│ Authorization: Bearer <che-sa-token>    │ ← Che SA token!
└─────────────────────────────────────────┘
```

### Token Usage Summary

| Component | User Token Usage | Che SA Token Usage |
|-----------|------------------|-------------------|
| **Authentication** | ✅ Verify WHO is making request | ❌ Not used |
| **User Identification** | ✅ Get username for namespace naming | ❌ Not used |
| **Kubernetes API Calls** | ❌ NOT used | ✅ ALL operations |
| **GET /kubernetes/namespace** | ❌ NOT used | ✅ List with Che SA |
| **POST /kubernetes/namespace/provision** | ❌ NOT used | ✅ Create with Che SA |

---

## ✅ Our TypeScript Implementation (Correct)

Our implementation follows the **exact same pattern**:

```typescript
// GET /kubernetes/namespace
fastify.get('/kubernetes/namespace', async (request, reply) => {
  // Use service account token for listing (cluster-level operation)
  const serviceAccountToken = getServiceAccountToken();
  const kubeConfig = getKubeConfig(serviceAccountToken);
  
  const namespaceFactory = new KubernetesNamespaceFactory(namespaceTemplate, kubeConfig);
  const namespaces = await namespaceFactory.list();
  return reply.send(namespaces);
});

// POST /kubernetes/namespace/provision
fastify.post('/kubernetes/namespace/provision', async (request, reply) => {
  // Use service account token for provisioning (cluster-level operation)
  const serviceAccountToken = getServiceAccountToken();
  const kubeConfig = getKubeConfig(serviceAccountToken);
  
  // Use request.subject for user identification and namespace naming
  const context = new NamespaceResolutionContextImpl(request.subject);
  
  const namespaceFactory = new KubernetesNamespaceFactory(namespaceTemplate, kubeConfig);
  const namespaceProvisioner = new NamespaceProvisioner(namespaceFactory);
  const namespaceMeta = await namespaceProvisioner.provision(context);
  return reply.send(namespaceMeta);
});
```

✅ **Matches Java implementation perfectly!**

---

## 🔧 Why This Matters

### Service Account Token Required Because:

1. **Cluster-Level Permissions**: Creating/listing namespaces requires cluster-scoped RBAC permissions
2. **Label-Based Filtering**: Listing namespaces with labels (`app.kubernetes.io/part-of=che.eclipse.org`) requires broader permissions
3. **Namespace Creation**: Regular users don't have permissions to create namespaces
4. **Multi-Tenant Security**: All users create namespaces using the same Che SA, which has proper RBAC configured

### User Token Still Important For:

1. **Authentication**: Verify the request is from a valid user
2. **User Identification**: Determine the username for namespace naming (`che-<username>`)
3. **Audit Logging**: Track which user requested the operation

---

## 📚 References

- Java Implementation: `che-server/infrastructures/kubernetes/src/main/java/org/eclipse/che/workspace/infrastructure/kubernetes/`
- Service Account Token: `/run/secrets/kubernetes.io/serviceaccount/token` (in-cluster) or `SERVICE_ACCOUNT_TOKEN` env var (local)
- Kubernetes RBAC: See `docs/RBAC_PERMISSIONS.md`

