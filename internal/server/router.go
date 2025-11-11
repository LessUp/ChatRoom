package server

import (
	"net/http"
	"strconv"
	"time"

	"chatroom/internal/auth"
	"chatroom/internal/config"
	"chatroom/internal/models"
	"chatroom/internal/metrics"
	"chatroom/internal/mw"
	"chatroom/internal/ws"
	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"golang.org/x/time/rate"
	"gorm.io/gorm"
)

func SetupRouter(cfg config.Config, db *gorm.DB, hub *ws.Hub) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(metrics.GinMiddleware())
	r.Use(mw.RateLimit(rate.Every(time.Second/20), 40)) // ~20 rps per ip+path, burst 40

	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	api := r.Group("/api/v1")

	api.POST("/auth/register", func(c *gin.Context) {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.Username == "" || req.Password == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}
		var count int64
		db.Model(&models.User{}).Where("username = ?", req.Username).Count(&count)
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "username taken"})
			return
		}
		hash, _ := auth.HashPassword(req.Password)
		user := models.User{Username: req.Username, PasswordHash: hash}
		if err := db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": user.ID, "username": user.Username})
	})

	api.POST("/auth/login", func(c *gin.Context) {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}
		var user models.User
		if err := db.Where("username = ?", req.Username).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}
		if !auth.VerifyPassword(user.PasswordHash, req.Password) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}
		at, _ := auth.GenerateAccessToken(user.ID, cfg.JWTSecret, cfg.AccessTokenTTLMinutes)
		rt, _ := auth.GenerateRefreshToken()
		_ = auth.SaveRefreshToken(db, user.ID, rt, time.Now().Add(time.Duration(cfg.RefreshTokenTTLDays)*24*time.Hour))
		c.JSON(http.StatusOK, gin.H{"access_token": at, "refresh_token": rt, "user": gin.H{"id": user.ID, "username": user.Username}})
	})

	api.POST("/auth/refresh", func(c *gin.Context) {
		var req struct{ RefreshToken string `json:"refresh_token"` }
		if err := c.ShouldBindJSON(&req); err != nil || req.RefreshToken == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}
		rec, err := auth.ValidateRefreshToken(db, req.RefreshToken)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
			return
		}
		_ = auth.RevokeRefreshToken(db, req.RefreshToken)
		at, _ := auth.GenerateAccessToken(rec.UserID, cfg.JWTSecret, cfg.AccessTokenTTLMinutes)
		newRT, _ := auth.GenerateRefreshToken()
		_ = auth.SaveRefreshToken(db, rec.UserID, newRT, time.Now().Add(time.Duration(cfg.RefreshTokenTTLDays)*24*time.Hour))
		c.JSON(http.StatusOK, gin.H{"access_token": at, "refresh_token": newRT})
	})

	authed := api.Group("")
	authed.Use(auth.AuthMiddleware(cfg, db))

	authed.POST("/rooms", func(c *gin.Context) {
		var req struct{ Name string `json:"name"` }
		if err := c.ShouldBindJSON(&req); err != nil || req.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}
		room := models.Room{Name: req.Name, OwnerID: auth.GetUserID(c)}
		if err := db.Create(&room).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to create room"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": room.ID, "name": room.Name})
	})

	authed.GET("/rooms", func(c *gin.Context) {
		var rooms []models.Room
		db.Order("id desc").Limit(100).Find(&rooms)
		type roomDTO struct {
			ID     uint   `json:"id"`
			Name   string `json:"name"`
			Online int    `json:"online"`
		}
		out := make([]roomDTO, 0, len(rooms))
		for _, r := range rooms {
			out = append(out, roomDTO{ID: r.ID, Name: r.Name, Online: hub.Online(r.ID)})
		}
		c.JSON(http.StatusOK, gin.H{"rooms": out})
	})

	authed.GET("/rooms/:id/messages", func(c *gin.Context) {
		roomID, err := strconv.Atoi(c.Param("id"))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid room id"})
			return
		}
		limitStr := c.Query("limit")
		if limitStr == "" {
			limitStr = "50"
		}
		limit, _ := strconv.Atoi(limitStr)
		if limit <= 0 || limit > 200 {
			limit = 50
		}
		beforeID := c.Query("before_id")
		q := db.Where("room_id = ?", roomID)
		if beforeID != "" {
			if bid, err := strconv.Atoi(beforeID); err == nil {
				q = q.Where("id < ?", bid)
			}
		}
		var msgs []models.Message
		q.Order("id desc").Limit(limit).Find(&msgs)
		for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
			msgs[i], msgs[j] = msgs[j], msgs[i]
		}
		c.JSON(http.StatusOK, gin.H{"messages": msgs})
	})

	r.GET("/ws", ws.Serve(hub, db, cfg))

	r.Static("/", "./web")
	return r
}
