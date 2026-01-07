# Kubernetes Deployment

This directory contains Kubernetes manifests for deploying ChatRoom.

## Prerequisites

- Kubernetes cluster (1.25+)
- kubectl configured
- PostgreSQL database (external or in-cluster)

## Quick Start

1. **Create namespace and apply configs:**

   ```bash
   kubectl apply -f namespace.yaml
   kubectl apply -f configmap.yaml
   ```

2. **Create secrets (replace with your values):**

   ```bash
   kubectl create secret generic chatroom-secrets \
     --namespace chatroom \
     --from-literal=DATABASE_DSN="host=your-db user=postgres password=your-password dbname=chatroom port=5432 sslmode=require" \
     --from-literal=JWT_SECRET="your-strong-random-secret-here"
   ```

   Or apply the example (for testing only):
   ```bash
   kubectl apply -f secret.yaml
   ```

3. **Deploy the application:**

   ```bash
   kubectl apply -f deployment.yaml
   kubectl apply -f service.yaml
   ```

4. **Verify deployment:**

   ```bash
   kubectl get pods -n chatroom
   kubectl get svc -n chatroom
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `APP_PORT` | HTTP server port | `8080` |
| `APP_ENV` | Environment (dev/prod) | `prod` |
| `DATABASE_DSN` | PostgreSQL connection string | - |
| `JWT_SECRET` | JWT signing secret | - |
| `LOG_LEVEL` | Log level | `info` |
| `LOG_FORMAT` | Log format (json/console) | `json` |

### Scaling

```bash
# Scale replicas
kubectl scale deployment chatroom -n chatroom --replicas=3

# Enable HPA (requires metrics-server)
kubectl autoscale deployment chatroom -n chatroom --min=2 --max=10 --cpu-percent=70
```

## Ingress

The `service.yaml` includes an Ingress resource. Configure it based on your ingress controller:

1. Update the `host` field
2. Configure TLS if needed
3. Add appropriate annotations for your ingress controller

## Monitoring

The deployment includes Prometheus annotations. To scrape metrics:

```yaml
prometheus.io/scrape: "true"
prometheus.io/port: "8080"
prometheus.io/path: "/metrics"
```

## Troubleshooting

```bash
# Check pod logs
kubectl logs -f deployment/chatroom -n chatroom

# Check pod status
kubectl describe pod -l app.kubernetes.io/name=chatroom -n chatroom

# Port forward for local testing
kubectl port-forward svc/chatroom 8080:80 -n chatroom
```
