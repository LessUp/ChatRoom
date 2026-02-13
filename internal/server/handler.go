package server

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"chatroom/internal/auth"
	"chatroom/internal/service"

	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
)

// Handler 聚合所有 HTTP handler，依赖注入 service 层。
type Handler struct {
	userSvc *service.UserService
	roomSvc *service.RoomService
	msgSvc  *service.MessageService
}

func NewHandler(userSvc *service.UserService, roomSvc *service.RoomService, msgSvc *service.MessageService) *Handler {
	return &Handler{userSvc: userSvc, roomSvc: roomSvc, msgSvc: msgSvc}
}

// Register 处理用户注册请求。
func (h *Handler) Register(c *gin.Context) {
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
	result, err := h.userSvc.Register(req.Username, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrUsernameTaken) {
			c.JSON(http.StatusConflict, gin.H{"error": "username taken"})
			return
		}
		log.Error().Err(err).Str("username", req.Username).Msg("register")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": result.ID, "username": result.Username})
}

// Login 处理用户登录请求。
func (h *Handler) Login(c *gin.Context) {
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
	result, err := h.userSvc.Login(req.Username, req.Password)
	if err != nil {
		if errors.Is(err, service.ErrInvalidCredentials) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
			return
		}
		log.Error().Err(err).Str("username", req.Username).Msg("login")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "login failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"access_token":  result.AccessToken,
		"refresh_token": result.RefreshToken,
		"user":          gin.H{"id": result.User.ID, "username": result.User.Username},
	})
}

// RefreshToken 处理 token 刷新请求。
func (h *Handler) RefreshToken(c *gin.Context) {
	var req struct{ RefreshToken string `json:"refresh_token"` }
	if err := c.ShouldBindJSON(&req); err != nil || req.RefreshToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid payload"})
		return
	}
	result, err := h.userSvc.RefreshTokens(req.RefreshToken)
	if err != nil {
		log.Warn().Err(err).Msg("refresh token")
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid refresh token"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"access_token": result.AccessToken, "refresh_token": result.RefreshToken})
}

// CreateRoom 处理创建房间请求。
func (h *Handler) CreateRoom(c *gin.Context) {
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
	room, err := h.roomSvc.Create(req.Name, auth.GetUserID(c))
	if err != nil {
		log.Error().Err(err).Uint("owner_id", auth.GetUserID(c)).Str("name", req.Name).Msg("create room")
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to create room"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": room.ID, "name": room.Name, "room": gin.H{"id": room.ID, "name": room.Name}})
}

// ListRooms 处理获取房间列表请求。
func (h *Handler) ListRooms(c *gin.Context) {
	rooms, err := h.roomSvc.List(100)
	if err != nil {
		log.Error().Err(err).Msg("list rooms")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list rooms"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rooms": rooms})
}

// ListMessages 处理获取房间消息列表请求。
func (h *Handler) ListMessages(c *gin.Context) {
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
	var beforeID uint
	if bid := c.Query("before_id"); bid != "" {
		if v, err := strconv.Atoi(bid); err == nil && v > 0 {
			beforeID = uint(v)
		}
	}
	msgs, err := h.msgSvc.ListByRoom(uint(roomID), limit, beforeID)
	if err != nil {
		log.Error().Err(err).Int("room_id", roomID).Msg("list messages")
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list messages"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"messages": msgs})
}
