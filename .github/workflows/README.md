# GitHub Actions Workflows

This directory contains GitHub Actions workflows for the Che Server Next project, based on the [Eclipse Che Dashboard workflows](https://github.com/eclipse-che/che-dashboard/tree/main/.github/workflows).

## Workflows Overview

| Workflow | Trigger | Purpose | Output |
|----------|---------|---------|--------|
| **[release.yml](release.yml)** | Manual (workflow_dispatch) | Create versioned releases | `docker.io/olexii4dockerid/che-server:VERSION` |
| **[pr.yml](pr.yml)** | Pull Requests | Validate and build PR changes | `docker.io/olexii4dockerid/che-server:pr-NUMBER` |
| **[next-build-multiarch.yml](next-build-multiarch.yml)** | Push to main | Build latest development image | `docker.io/olexii4dockerid/che-server:next` |
| **[pr-checks.yml](pr-checks.yml)** | Pull Requests | Run code quality checks | N/A |

---

## 🚀 Release Workflow

**File:** [release.yml](release.yml)  
**Reference:** [eclipse-che/che-dashboard/release.yml](https://raw.githubusercontent.com/eclipse-che/che-dashboard/main/.github/workflows/release.yml)

### Purpose

Creates official versioned releases with multiarch Docker images and GitHub Releases.

### Trigger

Manual workflow dispatch via GitHub UI:
```
Actions → Release Che Server Next → Run workflow
```

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `version` | Version to release (e.g., `1.0.0`) | Yes | `1.0.0` |
| `forceRecreateTags` | Recreate existing tags (use with caution) | No | `false` |

### Jobs

#### 1. `tag-release`
- Validates existing tags
- Creates and pushes Git tag
- Uses GitHub actor's credentials

#### 2. `build-images`
- Builds multiarch images (amd64, arm64)
- Pushes to Docker Hub
- Tags: `VERSION-amd64`, `VERSION-arm64`

#### 3. `create-manifest`
- Creates multiarch manifest
- Tags: `VERSION`
- Combines amd64 and arm64 images

#### 4. `create-github-release`
- Creates GitHub Release
- Includes deployment instructions
- Links to Docker Hub image

### Output

**Docker Images:**
```bash
docker.io/olexii4dockerid/che-server:1.0.0-amd64
docker.io/olexii4dockerid/che-server:1.0.0-arm64
docker.io/olexii4dockerid/che-server:1.0.0  # Multiarch manifest
```

**GitHub Release:**
- Tag: `1.0.0`
- Release notes with deployment guide
- Links to Docker Hub

### How to Run

1. Go to: **Actions** → **Release Che Server Next** → **Run workflow**
2. Select branch: `main`
3. Enter version: `1.0.0`
4. Click **Run workflow**

### Required Secrets

- `DOCKERHUB_USERNAME` - Docker Hub username
- `DOCKERHUB_TOKEN` - Docker Hub access token
- `GITHUB_TOKEN` - Automatic (provided by GitHub)

---

## 🔍 PR Workflow

**File:** [pr.yml](pr.yml)  
**Reference:** [eclipse-che/che-dashboard/pr.yml](https://raw.githubusercontent.com/eclipse-che/che-dashboard/main/.github/workflows/pr.yml)

### Purpose

Validates pull requests, runs tests, builds Docker images, and posts deployment instructions.

### Trigger

Automatically on pull requests to any branch:
```yaml
on:
  pull_request:
    branches: ['*']
```

### Jobs

#### 1. `header-check`
- Checks EPL-2.0 license headers
- Runs: `yarn header:check`
- Node: 20

#### 2. `licenses-check`
- Validates dependency licenses
- Runs: `yarn license:check`
- Node: 20

#### 3. `build-and-test`
- Matrix: Node 18.x, 20.x
- Runs:
  - `yarn build`
  - `yarn lint:check`
  - `yarn test`

#### 4. `docker-build`
- Matrix: amd64 (default), arm64 (continue-on-error)
- Uses Docker layer caching
- Pushes image to Docker Hub
- Comments on PR with deployment instructions

### Output

**Docker Image:**
```bash
docker.io/olexii4dockerid/che-server:pr-123
```

**PR Comment:**
```markdown
## ✅ Docker image build succeeded

**Image:** `docker.io/olexii4dockerid/che-server:pr-123`

📦 Deploy with kubectl patch
🚀 Deploy with chectl
🐳 Pull and run locally
```

### Features

- **Docker Layer Caching**: Speeds up subsequent builds
- **Multiarch Support**: Builds for amd64 and arm64
- **Auto Comments**: Posts deployment instructions on PR
- **Continue on Error**: ARM64 builds don't fail the workflow

### Required Secrets

- `DOCKERHUB_USERNAME` - Docker Hub username
- `DOCKERHUB_TOKEN` - Docker Hub access token

---

## 🔧 Next Build Workflow

**File:** [next-build-multiarch.yml](next-build-multiarch.yml)

### Purpose

Builds and pushes the latest `:next` development image after each push to main.

### Trigger

```yaml
on:
  push:
    branches:
      - main
  workflow_dispatch: {}
```

### Output

```bash
docker.io/olexii4dockerid/che-server:next
```

### Architecture

- linux/amd64
- linux/arm64

---

## 📋 PR Checks Workflow

**File:** [pr-checks.yml](pr-checks.yml)

### Purpose

Runs code quality checks on pull requests.

### Jobs

- ESLint
- Prettier
- TypeScript type checking
- License header validation

---

## 🔑 Required GitHub Secrets

Configure these secrets in your repository:

**Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Secret | Description | Used By |
|--------|-------------|---------|
| `DOCKERHUB_USERNAME` | Docker Hub username | All workflows |
| `DOCKERHUB_TOKEN` | Docker Hub access token | All workflows |
| `GITHUB_TOKEN` | GitHub token (automatic) | Release workflow |

### Creating Docker Hub Access Token

1. Login to [Docker Hub](https://hub.docker.com)
2. Go to: **Account Settings** → **Security**
3. Click: **New Access Token**
4. Name: `GitHub Actions`
5. Permissions: **Read & Write**
6. Copy token and save to GitHub Secrets

---

## 🚀 Usage Examples

### Release a New Version

```bash
# 1. Navigate to GitHub Actions
#    https://github.com/YOUR_USERNAME/che-server-next/actions/workflows/release.yml

# 2. Click "Run workflow"
#    - Branch: main
#    - Version: 1.0.0
#    - Force recreate tags: false

# 3. Wait for workflow to complete

# 4. Verify release
docker pull docker.io/olexii4dockerid/che-server:1.0.0

# 5. Deploy to Eclipse Che
chectl server:update --che-operator-cr-patch-yaml=cr-patch.yaml
```

### Test a Pull Request

```bash
# 1. Create a pull request

# 2. Wait for workflows to complete

# 3. Find PR comment with image name
#    Image: docker.io/olexii4dockerid/che-server:pr-123

# 4. Pull and test locally
docker pull docker.io/olexii4dockerid/che-server:pr-123
docker run -p 8080:8080 docker.io/olexii4dockerid/che-server:pr-123

# 5. Or deploy to test cluster
kubectl patch -n eclipse-che "checluster/eclipse-che" \
  --type=json \
  -p='[{"op": "replace", "path": "/spec/components/cheServer/deployment/containers/0/image", "value": "docker.io/olexii4dockerid/che-server:pr-123"}]'
```

### Deploy Latest Development Build

```bash
# Latest :next is automatically built on every push to main

# Pull latest
docker pull docker.io/olexii4dockerid/che-server:next

# Deploy
chectl server:update --che-operator-cr-patch-yaml=cr-patch.yaml
```

---

## 📊 Workflow Status Badges

Add these badges to your README:

```markdown
[![Release](https://github.com/YOUR_USERNAME/che-server-next/actions/workflows/release.yml/badge.svg)](https://github.com/YOUR_USERNAME/che-server-next/actions/workflows/release.yml)
[![PR](https://github.com/YOUR_USERNAME/che-server-next/actions/workflows/pr.yml/badge.svg)](https://github.com/YOUR_USERNAME/che-server-next/actions/workflows/pr.yml)
[![Next Build](https://github.com/YOUR_USERNAME/che-server-next/actions/workflows/next-build-multiarch.yml/badge.svg)](https://github.com/YOUR_USERNAME/che-server-next/actions/workflows/next-build-multiarch.yml)
```

---

## 🐛 Troubleshooting

### Workflow Fails: "No such file or directory"

**Cause:** Missing dependencies or build files

**Fix:**
```bash
# Ensure package.json scripts are defined
yarn build
yarn test
yarn lint:check
```

### Workflow Fails: "Login to Docker Hub failed"

**Cause:** Missing or invalid Docker Hub credentials

**Fix:**
1. Verify secrets are set correctly
2. Use access token, not password
3. Check token permissions (Read & Write)

### ARM64 Build Fails

**Cause:** ARM64 builds are set to `continue-on-error: false` in PR workflow

**Expected Behavior:** ARM64 builds can fail without failing the entire workflow

### Release Tag Already Exists

**Options:**
1. Use a different version number
2. Set `forceRecreateTags: true` (use with caution)
3. Manually delete the tag: `git push origin :1.0.0`

---

## 📚 References

- [Eclipse Che Dashboard Release Workflow](https://github.com/eclipse-che/che-dashboard/blob/main/.github/workflows/release.yml)
- [Eclipse Che Dashboard PR Workflow](https://github.com/eclipse-che/che-dashboard/blob/main/.github/workflows/pr.yml)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Push Action](https://github.com/docker/build-push-action)
- [Docker Buildx](https://github.com/docker/buildx)

---

## 📝 Maintenance

### Updating Workflows

When updating workflows, consider:
1. Keep in sync with upstream Eclipse Che Dashboard workflows
2. Test in a fork before applying to main repository
3. Update this README with any changes
4. Verify all secrets are still valid

### Monitoring

Check workflow runs:
```
https://github.com/YOUR_USERNAME/che-server-next/actions
```

View workflow logs:
```
Actions → Select workflow → Select run → View logs
```

