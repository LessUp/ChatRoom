package config

import (
	"errors"
	"os"
	"strconv"
)

// Config 描述启动服务所需的关键参数。
type Config struct {
	Port                  string
	DatabaseDSN           string
	JWTSecret             string
	Env                   string
	AccessTokenTTLMinutes int
	RefreshTokenTTLDays   int
}

func getenv(key, def string) string {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	return v
}

// Load 从环境变量读取配置，并为教学场景准备合理的默认值。
func Load() Config {
	port := getenv("APP_PORT", "8080")
	dsn := getenv("DATABASE_DSN", "host=localhost user=postgres password=postgres dbname=chatroom port=5432 sslmode=disable TimeZone=UTC")
	secret := getenv("JWT_SECRET", "dev-secret-change-me")
	env := getenv("APP_ENV", "dev")
	accessTTLStr := getenv("ACCESS_TOKEN_TTL_MINUTES", "15")
	refreshTTLDaysStr := getenv("REFRESH_TOKEN_TTL_DAYS", "7")
	accessTTL, err := strconv.Atoi(accessTTLStr)
	if err != nil || accessTTL <= 0 {
		accessTTL = 15
	}
	refreshTTL, err := strconv.Atoi(refreshTTLDaysStr)
	if err != nil || refreshTTL <= 0 {
		refreshTTL = 7
	}
	return Config{
		Port:                  port,
		DatabaseDSN:           dsn,
		JWTSecret:             secret,
		Env:                   env,
		AccessTokenTTLMinutes: accessTTL,
		RefreshTokenTTLDays:   refreshTTL,
	}
}

func Validate(cfg Config) error {
	if cfg.Port == "" {
		return errors.New("APP_PORT must not be empty")
	}
	if cfg.DatabaseDSN == "" {
		return errors.New("DATABASE_DSN must not be empty")
	}
	if cfg.Env != "dev" && cfg.JWTSecret == "dev-secret-change-me" {
		return errors.New("JWT_SECRET is using the default value")
	}
	return nil
}
