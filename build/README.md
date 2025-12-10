# Docker/Podman Build Scripts

This directory contains scripts and configuration for building the Eclipse Che Server (TypeScript) container image with support for both Docker and Podman.

## Files

- `build.sh` - Main build script with multiplatform support (Docker + Podman)
- `dockerfiles/Dockerfile` - Container image definition
- `dockerfiles/entrypoint.sh` - Container entrypoint script
- `dockerfiles/docker-compose.yml` - Docker Compose configuration for local development
- `../scripts/container_tool.sh` - Container engine detection utility

## Container Engine Support

The build script automatically detects and uses the available container engine:
- 🐋 **Docker** - Uses Docker Buildx for multiplatform builds
- 🦭 **Podman** - Uses native Podman manifest support

## Building the Image

### Local Build (Single Platform)

Build for your current platform and load into local Docker:

```bash
./build/build.sh olexii4dockerid/che-server next
```

### Multiplatform Build

Build for multiple platforms (linux/amd64, linux/arm64):

```bash
# Build and load locally (only works for current platform)
./build/build.sh olexii4dockerid/che-server next false

# Build and push to registry (required for multiplatform)
./build/build.sh olexii4dockerid/che-server next true
```

**Note**: Loading multiplatform images locally (`--load`) only supports the current platform. To build for multiple platforms, you must push to a registry (`--push`).

### Parameters

```bash
./build/build.sh [IMAGE_NAME] [IMAGE_TAG] [PUSH]
```

- `IMAGE_NAME` - Docker image name (default: `che-server`)
- `IMAGE_TAG` - Image tag (default: `latest`)
- `PUSH` - Push to registry: `true` or `false` (default: `false`)

### Examples

```bash
# Build and load locally (single platform)
./build/build.sh olexii4dockerid/che-server next false

# Build for multiple platforms and push
./build/build.sh olexii4dockerid/che-server next true

# Build with default values
./build/build.sh
```

## Requirements

### Docker
- Docker with buildx support (Docker 19.03+)
- For multiplatform builds: Access to a container registry

### Podman
- Podman 3.0+ with manifest support
- For multiplatform builds: Access to a container registry

**Note**: The build script automatically detects which container engine is available and uses it.

## Supported Platforms

- `linux/amd64` - x86_64 architecture (Intel/AMD)
- `linux/arm64` - ARM 64-bit architecture (Apple Silicon, ARM servers)

## Container Engine Setup

### Docker Buildx

The script automatically creates a `multiplatform-builder` instance if it doesn't exist. You can also create it manually:

```bash
docker buildx create --name multiplatform-builder --use
docker buildx inspect --bootstrap
```

### Podman

Podman supports multiplatform builds natively using manifests. No additional setup required:

```bash
# Check Podman version (3.0+ recommended)
podman --version

# Check manifest support
podman manifest --help
```

## Troubleshooting

### Error: Neither Docker nor Podman is installed or running

Install Docker or Podman:
- **Docker Desktop**: https://www.docker.com/products/docker-desktop
- **Docker Engine**: https://docs.docker.com/engine/install/
- **Podman**: https://podman.io/getting-started/installation

### Error: docker buildx is not available

Install Docker Desktop or Docker Engine with buildx plugin:
- **Docker Desktop**: Includes buildx by default
- **Docker Engine**: Install buildx plugin separately

### Podman: Error creating manifest

Ensure you have Podman 3.0+:

```bash
podman --version
# Should be 3.0.0 or higher
```

Update Podman if needed:
- **macOS**: `brew upgrade podman`
- **Linux**: Use your package manager

### Cannot load multiplatform image locally

This is expected. Container engines' `--load` flags only support single-platform images. To use multiplatform builds:
1. Build and push to a registry (default behavior)
2. Pull the image from the registry on your target platform

### Docker builder instance issues

Remove and recreate the builder:

```bash
docker buildx rm multiplatform-builder
docker buildx create --name multiplatform-builder --use
docker buildx inspect --bootstrap
```

### Podman machine not running (macOS/Windows)

Start the Podman machine:

```bash
podman machine start
```
