package db

import (
	"time"

	"chatroom/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Connect 负责建立到 Postgres 的连接，并带有简单的重试来等待容器就绪。
func Connect(dsn string) (*gorm.DB, error) {
	var gdb *gorm.DB
	var err error
	for i := 0; i < 10; i++ {
		gdb, err = gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
		if err == nil {
			sqlDB, err2 := gdb.DB()
			if err2 == nil {
				sqlDB.SetMaxIdleConns(5)
				sqlDB.SetMaxOpenConns(20)
				sqlDB.SetConnMaxLifetime(time.Hour)
				return gdb, nil
			}
			err = err2
		}
		time.Sleep(time.Duration(500+i*200) * time.Millisecond)
	}
	return nil, err
}

// Migrate 自动迁移教学环境涉及的全部表结构。
func Migrate(gdb *gorm.DB) error {
	return gdb.AutoMigrate(&models.User{}, &models.Room{}, &models.Message{}, &models.RefreshToken{})
}
