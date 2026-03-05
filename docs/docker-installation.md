# Docker Installation

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed on your machine
- Docker Compose (included with Docker Desktop; on Linux, install separately if needed)

## Quick Start

### Using `docker run`

```bash
docker pull pratik1235/burnrate:latest
docker run -d \
  --name burnrate \
  -p 8000:8000 \
  -v burnrate_data:/data \
  pratik1235/burnrate:latest
```

Open http://localhost:8000 in your browser.

### Using Docker Compose

Create a `docker-compose.yml` file:

```yaml
services:
  burnrate:
    image: pratik1235/burnrate:latest
    ports:
      - "8000:8000"
    volumes:
      - burnrate_data:/data
    environment:
      - BURNRATE_DATA_DIR=/data
      - BURNRATE_STATIC_DIR=/app/static
    restart: unless-stopped

volumes:
  burnrate_data:
```

Then run:

```bash
docker compose up -d
```

Open http://localhost:8000 in your browser.

## Configuration

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BURNRATE_DATA_DIR` | `/data` | Directory for the SQLite database and uploaded statements |
| `BURNRATE_STATIC_DIR` | `/app/static` | Directory containing the built React frontend |

### Data Persistence

All application data (database, uploaded statements) is stored under `/data` inside the container. A Docker **named volume** (`burnrate_data`) is mounted there so data survives container restarts and image updates.

### Watch Folder (Auto-Import Statements)

To have Burnrate automatically process statement PDFs from a folder on your host machine, bind-mount it into the container:

**`docker run`:**

```bash
docker run -d \
  --name burnrate \
  -p 8000:8000 \
  -v burnrate_data:/data \
  -v /path/to/your/statements:/watch:ro \
  pratik1235/burnrate:latest
```

**Docker Compose:**

```yaml
services:
  burnrate:
    image: pratik1235/burnrate:latest
    ports:
      - "8000:8000"
    volumes:
      - burnrate_data:/data
      - /path/to/your/statements:/watch:ro
    environment:
      - BURNRATE_DATA_DIR=/data
      - BURNRATE_STATIC_DIR=/app/static
    restart: unless-stopped

volumes:
  burnrate_data:
```

Then set the watch folder path to `/watch` in the Burnrate setup wizard.

> **Note:** On macOS with Docker Desktop, host filesystem events may not propagate reliably into the container. Burnrate performs an initial scan at startup to catch all existing files.

### Custom Port

To run on a different port (e.g., 9000):

**`docker run`:**

```bash
docker run -d -p 9000:8000 -v burnrate_data:/data pratik1235/burnrate:latest
```

Then open http://localhost:9000.

**Docker Compose:**

```yaml
ports:
  - "9000:8000"
```

## Backup and Restore

### Backup

```bash
docker run --rm \
  -v burnrate_data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/burnrate-backup.tar.gz -C /data .
```

### Restore

```bash
docker run --rm \
  -v burnrate_data:/data \
  -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/burnrate-backup.tar.gz"
```

## Health Check

The image includes a built-in health check that pings `/api/settings` every 30 seconds. Check health with:

```bash
docker inspect --format='{{.State.Health.Status}}' burnrate
```

## Updating

```bash
docker pull pratik1235/burnrate:latest
docker compose down
docker compose up -d
```

Data is preserved across updates because it lives in the named volume.

## Uninstall

```bash
docker compose down
# To also remove your data:
docker volume rm burnrate_data
```
