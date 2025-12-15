package server

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"chatroom/internal/auth"
	"chatroom/internal/config"
	"chatroom/internal/metrics"
	"chatroom/internal/models"
	"chatroom/internal/mw"
	"chatroom/internal/ws"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/rs/zerolog/log"
	"golang.org/x/time/rate"
	"gorm.io/gorm"
)

// SetupRouter 统一初始化 Gin 中间件、REST API 以及 WebSocket 端点。
func SetupRouter(cfg config.Config, db *gorm.DB, hub *ws.Hub) *gin.Engine {
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(metrics.GinMiddleware())
	// 控制单个 IP+路由的速率，避免教学环境被刷爆。
	r.Use(mw.RateLimit(rate.Every(time.Second/20), 40))

	r.GET("/healthz", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	r.GET("/metrics", gin.WrapH(promhttp.Handler()))

	api := r.Group("/api/v1")

	api.POST("/auth/register", func(c *gin.Context) {
		var req struct {
			Username string `json:"username"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}
		req.Username = strings.TrimSpace(req.Username)
		if req.Username == "" || req.Password == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}
		if len(req.Username) < 2 || len(req.Username) > 64 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid username"})
			return
		}
		if len(req.Password) < 4 || len(req.Password) > 128 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid password"})
			return
		}
		var count int64
		if err := db.Model(&models.User{}).Where("username = ?", req.Username).Count(&count).Error; err != nil {
			log.Error().Err(err).Str("username", req.Username).Msg("register count")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
			return
		}
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"error": "username taken"})
			return
		}
		hash, err := auth.HashPassword(req.Password)
		if err != nil {
			log.Error().Err(err).Str("username", req.Username).Msg("register hash password")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
			return
		}
		user := models.User{Username: req.Username, PasswordHash: hash}
		if err := db.Create(&user).Error; err != nil {
			log.Error().Err(err).Str("username", req.Username).Msg("register create user")
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
		req.Username = strings.TrimSpace(req.Username)
		if req.Username == "" || req.Password == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}
		var user models.User
		if err := db.Where("username = ?", req.Username).First(&user).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
				return
			}
			log.Error().Err(err).Str("username", req.Username).Msg("login query user")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "login failed"})
			return
		}
		if !auth.VerifyPassword(user.PasswordHash, req.Password) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}
		at, err := auth.GenerateAccessToken(user.ID, cfg.JWTSecret, cfg.AccessTokenTTLMinutes)
		if err != nil {
			log.Error().Err(err).Uint("user_id", user.ID).Msg("login generate access token")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "login failed"})
			return
		}
		rt, err := auth.GenerateRefreshToken()
		if err != nil {
			log.Error().Err(err).Uint("user_id", user.ID).Msg("login generate refresh token")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "login failed"})
			return
		}
		exp := time.Now().Add(time.Duration(cfg.RefreshTokenTTLDays) * 24 * time.Hour)
		if err := auth.SaveRefreshToken(db, user.ID, rt, exp); err != nil {
			log.Error().Err(err).Uint("user_id", user.ID).Msg("login save refresh token")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "login failed"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"access_token": at, "refresh_token": rt, "user": gin.H{"id": user.ID, "username": user.Username}})
	})

	api.POST("/auth/refresh", func(c *gin.Context) {
		var req struct{ RefreshToken string `json:"refresh_token"` }
		if err := c.ShouldBindJSON(&req); err != nil || req.RefreshToken == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}
		var (
			accessToken  string
			refreshToken string
		)
		err := db.Transaction(func(tx *gorm.DB) error {
			rec, err := auth.ValidateRefreshToken(tx, req.RefreshToken)
			if err != nil {
				return err
			}
			if err := auth.RevokeRefreshToken(tx, req.RefreshToken); err != nil {
				return err
			}
			at, err := auth.GenerateAccessToken(rec.UserID, cfg.JWTSecret, cfg.AccessTokenTTLMinutes)
			if err != nil {
				return err
			}
			newRT, err := auth.GenerateRefreshToken()
			if err != nil {
				return err
			}
			exp := time.Now().Add(time.Duration(cfg.RefreshTokenTTLDays) * 24 * time.Hour)
			if err := auth.SaveRefreshToken(tx, rec.UserID, newRT, exp); err != nil {
				return err
			}
			accessToken = at
			refreshToken = newRT
			return nil
		})
		if err != nil {
			log.Warn().Err(err).Msg("refresh token")
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"access_token": accessToken, "refresh_token": refreshToken})
	})

	// 需要 Bearer Token 的业务接口。
	authed := api.Group("")
	authed.Use(auth.AuthMiddleware(cfg, db))

	authed.POST("/rooms", func(c *gin.Context) {
		var req struct{ Name string `json:"name"` }
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}
		req.Name = strings.TrimSpace(req.Name)
		if req.Name == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
			return
		}
		if len(req.Name) > 128 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid room name"})
			return
		}
		room := models.Room{Name: req.Name, OwnerID: auth.GetUserID(c)}
		if err := db.Create(&room).Error; err != nil {
			log.Error().Err(err).Uint("owner_id", room.OwnerID).Str("name", room.Name).Msg("create room")
			c.JSON(http.StatusBadRequest, gin.H{"error": "failed to create room"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"id": room.ID, "name": room.Name, "room": gin.H{"id": room.ID, "name": room.Name}})
	})

	authed.GET("/rooms", func(c *gin.Context) {
		var rooms []models.Room
		if err := db.Order("id desc").Limit(100).Find(&rooms).Error; err != nil {
			log.Error().Err(err).Msg("list rooms")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list rooms"})
			return
		}
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
		if err != nil || roomID <= 0 {
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
		if err := q.Order("id desc").Limit(limit).Find(&msgs).Error; err != nil {
			log.Error().Err(err).Int("room_id", roomID).Msg("list messages")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list messages"})
			return
		}
		for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
			msgs[i], msgs[j] = msgs[j], msgs[i]
		}
		userIDs := make([]uint, 0, len(msgs))
		seen := make(map[uint]struct{}, len(msgs))
		for _, m := range msgs {
			if _, ok := seen[m.UserID]; ok {
				continue
			}
			seen[m.UserID] = struct{}{}
			userIDs = append(userIDs, m.UserID)
		}
		usernames := make(map[uint]string, len(userIDs))
		if len(userIDs) > 0 {
			var users []models.User
			if err := db.Select("id", "username").Where("id IN ?", userIDs).Find(&users).Error; err != nil {
				log.Error().Err(err).Int("room_id", roomID).Msg("list message users")
				c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list messages"})
				return
			}
			for _, u := range users {
				usernames[u.ID] = u.Username
			}
		}
		type msgDTO struct {
			Type      string    `json:"type"`
			ID        uint      `json:"id"`
			RoomID    uint      `json:"room_id"`
			UserID    uint      `json:"user_id"`
			Username  string    `json:"username"`
			Content   string    `json:"content"`
			CreatedAt time.Time `json:"created_at"`
		}
		out := make([]msgDTO, 0, len(msgs))
		for _, m := range msgs {
			out = append(out, msgDTO{Type: "message", ID: m.ID, RoomID: m.RoomID, UserID: m.UserID, Username: usernames[m.UserID], Content: m.Content, CreatedAt: m.CreatedAt})
		}
		c.JSON(http.StatusOK, gin.H{"messages": out})
	})

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
