package ws

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"chatroom/internal/auth"
	"chatroom/internal/config"
	"chatroom/internal/models"
	"chatroom/internal/metrics"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
)

type Client struct {
	room   *RoomHub
	conn   *websocket.Conn
	send   chan []byte
	db     *gorm.DB
	userID uint
	uname  string
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type InboundMessage struct {
	Type     string `json:"type"`
	Content  string `json:"content"`
	IsTyping bool   `json:"is_typing"`
}

type OutboundMessage struct {
	Type      string    `json:"type"`
	ID        uint      `json:"id"`
	RoomID    uint      `json:"room_id"`
	UserID    uint      `json:"user_id"`
	Username  string    `json:"username"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

func Serve(h *Hub, db *gorm.DB, cfg config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		roomIDStr := c.Query("room_id")
		rid64, err := strconv.ParseUint(roomIDStr, 10, 64)
		if err != nil || rid64 == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid room_id"})
			return
		}
		var room models.Room
		if err := db.First(&room, uint(rid64)).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "room not found"})
			return
		}

		// Token via Authorization header or token query param for WS
		authz := c.GetHeader("Authorization")
		token := c.Query("token")
		if token == "" && len(authz) > 7 && (authz[:7] == "Bearer " || authz[:7] == "bearer ") {
			token = authz[7:]
		}
		if token == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		claims, err := auth.ParseAccessToken(token, cfg.JWTSecret)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		var user models.User
		if err := db.First(&user, claims.UserID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
			return
		}

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}
		rh := h.GetRoom(uint(rid64))
		client := &Client{room: rh, conn: conn, send: make(chan []byte, 256), db: db, userID: user.ID, uname: user.Username}
		rh.register <- client

		go client.writePump()
		client.readPump()
	}
}

func (c *Client) readPump() {
	defer func() {
		c.room.unregister <- c
		_ = c.conn.Close()
	}()
	c.conn.SetReadLimit(1 << 20) // 1MB
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		var in InboundMessage
		if err := json.Unmarshal(data, &in); err != nil || in.Content == "" && in.Type != "typing" {
			continue
		}
		// typing signal (not persisted)
		if in.Type == "typing" {
			evt := map[string]interface{}{"type": "typing", "room_id": c.room.roomID, "user_id": c.userID, "username": c.uname, "is_typing": in.IsTyping}
			if b, err := json.Marshal(evt); err == nil {
				c.room.broadcast <- b
			}
			continue
		}
		msg := models.Message{RoomID: c.room.roomID, UserID: c.userID, Content: in.Content}
		if err := c.db.Create(&msg).Error; err != nil {
			continue
		}
		out := OutboundMessage{Type: "message", ID: msg.ID, RoomID: msg.RoomID, UserID: msg.UserID, Username: c.uname, Content: msg.Content, CreatedAt: msg.CreatedAt}
		b, _ := json.Marshal(out)
		metrics.WsMessagesTotal.Inc()
		c.room.broadcast <- b
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		_ = c.conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			_, _ = w.Write(message)
			_ = w.Close()
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
