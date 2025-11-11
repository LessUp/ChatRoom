package main

import (
	"chatroom/internal/config"
	"chatroom/internal/db"
	clog "chatroom/internal/log"
	"chatroom/internal/server"
	"chatroom/internal/ws"

	"github.com/rs/zerolog/log"
)

func main() {
	// main 函数负责加载配置、初始化日志、连接数据库并启动 Gin 服务。
	cfg := config.Load()
	clog.Init(cfg.Env)

	gdb, err := db.Connect(cfg.DatabaseDSN)
	if err != nil {
		log.Fatal().Err(err).Msg("db connect")
	}
	if err := db.Migrate(gdb); err != nil {
		log.Fatal().Err(err).Msg("db migrate")
	}

	hub := ws.NewHub()
	r := server.SetupRouter(cfg, gdb, hub)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Fatal().Err(err).Msg("server run")
	}
}
