package models

import "time"

type User struct {
	ID           uint      `gorm:"primaryKey"`
	Username     string    `gorm:"uniqueIndex;size:64;not null"`
	PasswordHash string    `gorm:"not null"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

type Room struct {
	ID        uint      `gorm:"primaryKey"`
	Name      string    `gorm:"uniqueIndex;size:128;not null"`
	OwnerID   uint      `gorm:"not null"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

type Message struct {
	ID        uint      `gorm:"primaryKey"`
	RoomID    uint      `gorm:"index:idx_msg_room_id;not null"`
	UserID    uint      `gorm:"index;not null"`
	Content   string    `gorm:"type:text;not null"`
	CreatedAt time.Time
}

type RefreshToken struct {
	ID        uint       `gorm:"primaryKey"`
	UserID    uint       `gorm:"index;not null"`
	Token     string     `gorm:"uniqueIndex;size:128;not null"`
	ExpiresAt time.Time  `gorm:"index;not null"`
	RevokedAt *time.Time
	CreatedAt time.Time
}
