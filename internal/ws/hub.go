package ws

import (
	"encoding/json"
	"sync"
	"sync/atomic"

	"chatroom/internal/metrics"
)

// Hub 管理房间级别的子 Hub，实现延迟创建与并发安全。
type Hub struct {
	mu    sync.RWMutex
	rooms map[uint]*RoomHub
}

func NewHub() *Hub { return &Hub{rooms: make(map[uint]*RoomHub)} }

// GetRoom 若房间未初始化则懒加载一个 RoomHub。
func (h *Hub) GetRoom(roomID uint) *RoomHub {
	h.mu.RLock()
	room := h.rooms[roomID]
	h.mu.RUnlock()
	if room != nil {
		return room
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	room = h.rooms[roomID]
	if room != nil {
		return room
	}
	room = NewRoomHub(roomID)
	h.rooms[roomID] = room
	go room.run()
	return room
}

func (h *Hub) Online(roomID uint) int {
	h.mu.RLock()
	room := h.rooms[roomID]
	h.mu.RUnlock()
	if room == nil {
		return 0
	}
	return room.Online()
}

// Shutdown 关闭所有 RoomHub goroutine，用于优雅停服。
func (h *Hub) Shutdown() {
	h.mu.Lock()
	defer h.mu.Unlock()
	for id, room := range h.rooms {
		room.Stop()
		delete(h.rooms, id)
	}
}

type RoomHub struct {
	roomID     uint
	clients    map[*Client]bool
	register   chan *Client
	unregister chan *Client
	broadcast  chan []byte
	stop       chan struct{}
	online     int32
}

func NewRoomHub(roomID uint) *RoomHub {
	return &RoomHub{
		roomID:     roomID,
		clients:    make(map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 256),
		stop:       make(chan struct{}),
	}
}

func (rh *RoomHub) run() {
	for {
		select {
		case <-rh.stop:
			// 关闭所有客户端连接
			for c := range rh.clients {
				close(c.send)
				delete(rh.clients, c)
			}
			atomic.StoreInt32(&rh.online, 0)
			return
		case c := <-rh.register:
			rh.clients[c] = true
			atomic.StoreInt32(&rh.online, int32(len(rh.clients)))
			metrics.WsConnections.Inc()
			evt := map[string]interface{}{"type": "join", "room_id": rh.roomID, "user_id": c.userID, "username": c.uname, "online": int(atomic.LoadInt32(&rh.online))}
			if b, err := json.Marshal(evt); err == nil {
				for cli := range rh.clients {
					select {
					case cli.send <- b:
					default:
						close(cli.send)
						delete(rh.clients, cli)
					}
				}
			}
		case c := <-rh.unregister:
			if _, ok := rh.clients[c]; ok {
				delete(rh.clients, c)
				close(c.send)
				atomic.StoreInt32(&rh.online, int32(len(rh.clients)))
				metrics.WsConnections.Dec()
				evt := map[string]interface{}{"type": "leave", "room_id": rh.roomID, "user_id": c.userID, "username": c.uname, "online": int(atomic.LoadInt32(&rh.online))}
				if b, err := json.Marshal(evt); err == nil {
					for cli := range rh.clients {
						select {
						case cli.send <- b:
						default:
							close(cli.send)
							delete(rh.clients, cli)
						}
					}
				}
			}
		case msg := <-rh.broadcast:
			for c := range rh.clients {
				select {
				case c.send <- msg:
				default:
					close(c.send)
					delete(rh.clients, c)
					metrics.WsConnections.Dec()
				}
			}
		}
	}
}

// Stop 停止 RoomHub 的 run goroutine。
func (rh *RoomHub) Stop() {
	select {
	case <-rh.stop:
		// 已停止
	default:
		close(rh.stop)
	}
}

// Online 返回房间在线客户端数量，供 REST 接口复用。
func (rh *RoomHub) Online() int { return int(atomic.LoadInt32(&rh.online)) }
