package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port                    string
	DatabaseDSN             string
	JWTSecret               string
	Env                     string
	AccessTokenTTLMinutes   int
	RefreshTokenTTLDays     int
}

func getenv(key, def string) string {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	return v
}

func Load() Config {
	port := getenv("APP_PORT", "8080")
	dsn := getenv("DATABASE_DSN", "host=localhost user=postgres password=postgres dbname=chatroom port=5432 sslmode=disable TimeZone=UTC")
	secret := getenv("JWT_SECRET", "dev-secret-change-me")
	env := getenv("APP_ENV", "dev")
	accessTTLStr := getenv("ACCESS_TOKEN_TTL_MINUTES", "15")
	refreshTTLDaysStr := getenv("REFRESH_TOKEN_TTL_DAYS", "7")
	accessTTL, _ := strconv.Atoi(accessTTLStr)
	refreshTTL, _ := strconv.Atoi(refreshTTLDaysStr)
	return Config{
		Port:                  port,
		DatabaseDSN:           dsn,
		JWTSecret:             secret,
		Env:                   env,
		AccessTokenTTLMinutes: accessTTL,
		RefreshTokenTTLDays:   refreshTTL,
	}
}
