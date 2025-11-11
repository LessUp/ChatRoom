package main

import (
	"chatroom/internal/config"
	clog "chatroom/internal/log"
	"chatroom/internal/db"
	"chatroom/internal/server"
	"chatroom/internal/ws"
	"github.com/rs/zerolog/log"
)

func main() {
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
