package service

import (
	"chatroom/internal/models"
	"chatroom/internal/ws"

	"gorm.io/gorm"
)

// RoomService 封装房间相关的业务逻辑。
type RoomService struct {
	db  *gorm.DB
	hub *ws.Hub
}

func NewRoomService(db *gorm.DB, hub *ws.Hub) *RoomService {
	return &RoomService{db: db, hub: hub}
}

// RoomDTO 是对外输出的房间数据。
type RoomDTO struct {
	ID     uint   `json:"id"`
	Name   string `json:"name"`
	Online int    `json:"online"`
}

// Create 创建新房间。
func (s *RoomService) Create(name string, ownerID uint) (*RoomDTO, error) {
	room := models.Room{Name: name, OwnerID: ownerID}
	if err := s.db.Create(&room).Error; err != nil {
		return nil, err
	}
	return &RoomDTO{ID: room.ID, Name: room.Name, Online: 0}, nil
}

// List 返回房间列表，附带各房间的在线人数。
func (s *RoomService) List(limit int) ([]RoomDTO, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	var rooms []models.Room
	if err := s.db.Order("id desc").Limit(limit).Find(&rooms).Error; err != nil {
		return nil, err
	}
	out := make([]RoomDTO, 0, len(rooms))
	for _, r := range rooms {
		out = append(out, RoomDTO{ID: r.ID, Name: r.Name, Online: s.hub.Online(r.ID)})
	}
	return out, nil
}

// Exists 检查房间是否存在。
func (s *RoomService) Exists(roomID uint) (*models.Room, error) {
	var room models.Room
	if err := s.db.First(&room, roomID).Error; err != nil {
		return nil, ErrRoomNotFound
	}
	return &room, nil
}
