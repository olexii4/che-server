# Container Build Scripts

This directory contains scripts and configuration for building the Eclipse Che Server (TypeScript) container image.

## Files

- `build.sh` - Main build script with multiplatform support (Docker + Podman)
- `dockerfiles/Dockerfile` - Container image definition
- `dockerfiles/entrypoint.sh` - Container entrypoint script
- `dockerfiles/docker-compose.yml` - Compose configuration for local development
- `../scripts/container_tool.sh` - Container engine detection utility

## Container Engine Support

This repo uses `./scripts/container_tool.sh` to auto-detect and use **Docker or Podman** for basic commands.
Multiplatform builds are handled by `build/build.sh` / `run/build-multiarch.sh` depending on your environment.

## Building the Image

### Local Build (Single Platform)

Build for your current platform and load into your local container engine:

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

- **Docker** or **Podman** (running)
- For multiplatform builds: access to a container registry

## Supported Platforms

- `linux/amd64` - x86_64 architecture (Intel/AMD)
- `linux/arm64` - ARM 64-bit architecture (Apple Silicon, ARM servers)

## Container Engine Setup

### Docker Buildx (when using Docker)

The script automatically creates a `multiplatform-builder` instance if it doesn't exist. You can also create it manually:

Use the helper scripts; if you need to set up buildx manually:

```bash
docker buildx create --name multiplatform-builder --use
docker buildx inspect --bootstrap
```

### Podman (when using Podman)

Podman supports multiplatform builds natively using manifests. No additional setup required:

Check your version:

```bash
podman --version
```

## Troubleshooting

### Error: Neither Docker nor Podman is installed or running

`./scripts/container_tool.sh` prints this when it can't find a running container engine.
Install and start Docker or Podman.

### Error: docker buildx is not available

Install Docker Desktop or Docker Engine with buildx plugin:
- **Docker Desktop**: Includes buildx by default
- **Docker Engine**: Install buildx plugin separately

### Podman: Error creating manifest

Ensure you have Podman 3.0+:

```bash
podman --version
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
