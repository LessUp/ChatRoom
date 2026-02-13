package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

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
	if err := config.Validate(cfg); err != nil {
		log.Fatal().Err(err).Msg("config validate")
	}

	gdb, err := db.Connect(cfg.DatabaseDSN)
	if err != nil {
		log.Fatal().Err(err).Msg("db connect")
	}
	if err := db.Migrate(gdb); err != nil {
		log.Fatal().Err(err).Msg("db migrate")
	}

	hub := ws.NewHub()
	r := server.SetupRouter(cfg, gdb, hub)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	// 在独立 goroutine 中启动 HTTP 服务。
	go func() {
		log.Info().Str("addr", srv.Addr).Msg("server starting")
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server listen")
		}
	}()

	// 等待中断信号，优雅关闭服务。
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	log.Info().Str("signal", sig.String()).Msg("shutting down server")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 关闭 Hub 中所有 RoomHub goroutine。
	hub.Shutdown()

	if err := srv.Shutdown(ctx); err != nil {
		log.Error().Err(err).Msg("server forced to shutdown")
	}

	// 关闭数据库连接池。
	if sqlDB, err := gdb.DB(); err == nil {
		_ = sqlDB.Close()
	}

	log.Info().Msg("server exited")
}
