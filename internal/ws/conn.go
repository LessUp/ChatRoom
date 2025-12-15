package ws

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"chatroom/internal/auth"
	"chatroom/internal/config"
	"chatroom/internal/models"
	"chatroom/internal/metrics"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
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

// upgrader 将 HTTP 请求升级为 WebSocket 连接（教学场景放宽跨域校验）。
var upgrader = websocket.Upgrader{
	CheckOrigin: checkOrigin,
}

var (
	upgraderOnce   sync.Once
	allowAllOrigin bool
)

func initUpgrader(cfg config.Config) {
	upgraderOnce.Do(func() {
		allowAllOrigin = cfg.Env == "dev"
	})
}

func checkOrigin(r *http.Request) bool {
	if allowAllOrigin {
		return true
	}
	origin := r.Header.Get("Origin")
	if origin == "" {
		return false
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	return strings.EqualFold(u.Host, r.Host)
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

// Serve 返回 Gin 处理函数，用于校验用户、加入房间并启动读写循环。
func Serve(h *Hub, db *gorm.DB, cfg config.Config) gin.HandlerFunc {
	initUpgrader(cfg)
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

		// 兼容 Authorization 头与 token 查询参数两种传递方式，方便调试。
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
			log.Error().Err(err).Uint64("room_id", rid64).Str("remote", c.Request.RemoteAddr).Msg("ws upgrade")
			return
		}
		rh := h.GetRoom(uint(rid64))
		client := &Client{room: rh, conn: conn, send: make(chan []byte, 256), db: db, userID: user.ID, uname: user.Username}
		rh.register <- client

		go client.writePump()
		client.readPump()
	}
}

// readPump 负责读取客户端信息、校验输入并推送到房间广播。
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
		if err := json.Unmarshal(data, &in); err != nil {
			continue
		}

		switch in.Type {
		case "ping":
			// 响应客户端心跳检测
			pong := map[string]string{"type": "pong"}
			if b, err := json.Marshal(pong); err == nil {
				select {
				case c.send <- b:
				default:
				}
			}

		case "typing":
			// 输入法提示只做广播，不入库
			evt := map[string]interface{}{"type": "typing", "room_id": c.room.roomID, "user_id": c.userID, "username": c.uname, "is_typing": in.IsTyping}
			if b, err := json.Marshal(evt); err == nil {
				c.room.broadcast <- b
			}

		case "message":
			if in.Content == "" {
				continue
			}
			// 消息长度限制
			if len(in.Content) > 2000 {
				errMsg := map[string]string{"type": "error", "content": "消息长度不能超过2000字符"}
				if b, err := json.Marshal(errMsg); err == nil {
					select {
					case c.send <- b:
					default:
					}
				}
				continue
			}
			msg := models.Message{RoomID: c.room.roomID, UserID: c.userID, Content: in.Content}
			if err := c.db.Create(&msg).Error; err != nil {
				log.Error().Err(err).Uint("room_id", c.room.roomID).Uint("user_id", c.userID).Msg("ws persist message")
				errMsg := map[string]string{"type": "error", "content": "消息发送失败"}
				if b, err := json.Marshal(errMsg); err == nil {
					select {
					case c.send <- b:
					default:
					}
				}
				continue
			}
			out := OutboundMessage{Type: "message", ID: msg.ID, RoomID: msg.RoomID, UserID: msg.UserID, Username: c.uname, Content: msg.Content, CreatedAt: msg.CreatedAt}
			b, _ := json.Marshal(out)
			metrics.WsMessagesTotal.Inc()
			c.room.broadcast <- b

		default:
			// 向后兼容：无type时当作message处理
			if in.Content == "" {
				continue
			}
			if len(in.Content) > 2000 {
				errMsg := map[string]string{"type": "error", "content": "消息长度不能超过2000字符"}
				if b, err := json.Marshal(errMsg); err == nil {
					select {
					case c.send <- b:
					default:
					}
				}
				continue
			}
			msg := models.Message{RoomID: c.room.roomID, UserID: c.userID, Content: in.Content}
			if err := c.db.Create(&msg).Error; err != nil {
				log.Error().Err(err).Uint("room_id", c.room.roomID).Uint("user_id", c.userID).Msg("ws persist message")
				errMsg := map[string]string{"type": "error", "content": "消息发送失败"}
				if b, err := json.Marshal(errMsg); err == nil {
					select {
					case c.send <- b:
					default:
					}
				}
				continue
			}
			out := OutboundMessage{Type: "message", ID: msg.ID, RoomID: msg.RoomID, UserID: msg.UserID, Username: c.uname, Content: msg.Content, CreatedAt: msg.CreatedAt}
			b, _ := json.Marshal(out)
			metrics.WsMessagesTotal.Inc()
			c.room.broadcast <- b
		}
	}
}

// writePump 周期性发送服务端数据与心跳，防止浏览器断线。
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
