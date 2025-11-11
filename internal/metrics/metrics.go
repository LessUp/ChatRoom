package metrics

import (
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
)

var (
	WsConnections = prometheus.NewGauge(prometheus.GaugeOpts{
		Name: "chat_ws_connections",
		Help: "Current number of active websocket connections",
	})
	WsMessagesTotal = prometheus.NewCounter(prometheus.CounterOpts{
		Name: "chat_ws_messages_total",
		Help: "Total number of chat messages sent",
	})
	HttpRequestsTotal = prometheus.NewCounterVec(prometheus.CounterOpts{
		Name: "http_requests_total",
		Help: "Total number of HTTP requests",
	}, []string{"method", "path", "status"})
	HttpRequestDuration = prometheus.NewHistogramVec(prometheus.HistogramOpts{
		Name:    "http_request_duration_seconds",
		Help:    "HTTP request duration in seconds",
		Buckets: prometheus.DefBuckets,
	}, []string{"method", "path", "status"})
)

func init() {
	prometheus.MustRegister(WsConnections, WsMessagesTotal, HttpRequestsTotal, HttpRequestDuration)
}

// GinMiddleware 统计基础请求指标，供 Prometheus 拉取。
func GinMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		status := strconv.Itoa(c.Writer.Status())
		path := c.FullPath()
		if path == "" {
			path = c.Request.URL.Path
		}
		labels := prometheus.Labels{"method": c.Request.Method, "path": path, "status": status}
		HttpRequestsTotal.With(labels).Inc()
		HttpRequestDuration.With(labels).Observe(time.Since(start).Seconds())
	}
}
