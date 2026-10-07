# =============================================================================
# Burnrate — Multi-stage Docker build
# Stage 1: Build React frontend
# Stage 2: Python runtime with built frontend
# =============================================================================

# --- Stage 1: Frontend build ---
FROM node:20-alpine AS frontend-builder
WORKDIR /build
COPY frontend-neopop/package*.json ./
RUN npm ci
COPY frontend-neopop/ ./
RUN npm run build

# --- Stage 2: Runtime ---
FROM python:3.12-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends qpdf && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-builder /build/dist /app/static

ENV BURNRATE_STATIC_DIR=/app/static
ENV BURNRATE_DATA_DIR=/data
ENV BURNRATE_ENV=production
ENV PYTHONPATH=/app
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

VOLUME ["/data"]

RUN mkdir -p /data && \
    adduser --disabled-password --gecos '' appuser && \
    chown -R appuser /app /data
USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/settings')" || exit 1

# WARNING: This binds the server to 0.0.0.0, exposing it to all network interfaces
# within the container. When mapping ports, ensure you map to the host's loopback
# (e.g., -p 127.0.0.1:8000:8000) to avoid exposing the unauthenticated API to the LAN.
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
