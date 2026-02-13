package server

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"chatroom/internal/auth"
	"chatroom/internal/config"
	"chatroom/internal/metrics"
	"chatroom/internal/mw"
	"chatroom/internal/service"
	"chatroom/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/time/rate"
	"gorm.io/gorm"
)

// Version information, set via ldflags
var (
	Version   = "dev"
	GitCommit = "unknown"
	BuildTime = "unknown"
	GoVersion = runtime.Version()
)

// SetupRouter 统一初始化 Gin 中间件、REST API 以及 WebSocket 端点。
func SetupRouter(cfg config.Config, db *gorm.DB, hub *ws.Hub) *gin.Engine {
	userSvc := service.NewUserService(db, cfg)
	roomSvc := service.NewRoomService(db, hub)
	msgSvc := service.NewMessageService(db)

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(metrics.GinMiddleware())
	// 控制单个 IP+路由的速率，避免教学环境被刷爆。
	r.Use(mw.RateLimit(rate.Every(time.Second/20), 40))

	// Health check endpoints
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "ok",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
	})
	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })

	r.GET("/ready", func(c *gin.Context) {
		checks := make(map[string]string)

		// Database health check
		sqlDB, err := db.DB()
		if err != nil {
			checks["database"] = "unhealthy"
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status": "not_ready",
				"checks": checks,
			})
			return
		}
		if err := sqlDB.Ping(); err != nil {
			checks["database"] = "unhealthy"
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status": "not_ready",
				"checks": checks,
			})
			return
		}
		checks["database"] = "healthy"

		c.JSON(http.StatusOK, gin.H{
			"status": "ready",
			"checks": checks,
		})
	})

	r.GET("/version", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"version":    Version,
			"git_commit": GitCommit,
			"build_time": BuildTime,
			"go_version": GoVersion,
		})
	})

	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	api := r.Group("/api/v1")
	h := NewHandler(userSvc, roomSvc, msgSvc)

	api.POST("/auth/register", h.Register)
	api.POST("/auth/login", h.Login)
	api.POST("/auth/refresh", h.RefreshToken)

	// 需要 Bearer Token 的业务接口。
	authed := api.Group("")
	authed.Use(auth.AuthMiddleware(cfg, db))

	authed.POST("/rooms", h.CreateRoom)
	authed.GET("/rooms", h.ListRooms)
	authed.GET("/rooms/:id/messages", h.ListMessages)

	r.GET("/ws", ws.Serve(hub, db, cfg))

	distDir := filepath.Join(".", "frontend", "dist")
	if _, err := os.Stat(filepath.Join(distDir, "index.html")); err == nil {
		r.GET("/*filepath", func(c *gin.Context) {
			path := c.Param("filepath")
			if path == "" || path == "/" {
				c.File(filepath.Join(distDir, "index.html"))
				return
			}
			clean := filepath.Clean(path)
			rel := strings.TrimPrefix(clean, "/")
			if rel == "" {
				c.File(filepath.Join(distDir, "index.html"))
				return
			}
			if strings.HasPrefix(rel, "api/") || rel == "metrics" || rel == "healthz" || strings.HasPrefix(rel, "ws") {
				c.Status(http.StatusNotFound)
				return
			}
			target := filepath.Join(distDir, rel)
			if fi, err := os.Stat(target); err == nil && !fi.IsDir() {
				c.File(target)
				return
			}
			if strings.Contains(rel, ".") {
				c.Status(http.StatusNotFound)
				return
			}
			c.File(filepath.Join(distDir, "index.html"))
		})
	} else {
		r.Static("/", "./web")
	}
	return r
}
