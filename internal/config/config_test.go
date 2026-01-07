package config

import (
	"os"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	// Clear environment variables
	os.Unsetenv("APP_PORT")
	os.Unsetenv("DATABASE_DSN")
	os.Unsetenv("JWT_SECRET")
	os.Unsetenv("APP_ENV")
	os.Unsetenv("ACCESS_TOKEN_TTL_MINUTES")
	os.Unsetenv("REFRESH_TOKEN_TTL_DAYS")

	cfg := Load()

	if cfg.Port != "8080" {
		t.Errorf("Load() Port = %v, want 8080", cfg.Port)
	}
	if cfg.Env != "dev" {
		t.Errorf("Load() Env = %v, want dev", cfg.Env)
	}
	if cfg.AccessTokenTTLMinutes != 15 {
		t.Errorf("Load() AccessTokenTTLMinutes = %v, want 15", cfg.AccessTokenTTLMinutes)
	}
	if cfg.RefreshTokenTTLDays != 7 {
		t.Errorf("Load() RefreshTokenTTLDays = %v, want 7", cfg.RefreshTokenTTLDays)
	}
}

func TestLoad_FromEnv(t *testing.T) {
	os.Setenv("APP_PORT", "9090")
	os.Setenv("DATABASE_DSN", "postgres://test:test@localhost/test")
	os.Setenv("JWT_SECRET", "my-secret")
	os.Setenv("APP_ENV", "prod")
	os.Setenv("ACCESS_TOKEN_TTL_MINUTES", "30")
	os.Setenv("REFRESH_TOKEN_TTL_DAYS", "14")
	defer func() {
		os.Unsetenv("APP_PORT")
		os.Unsetenv("DATABASE_DSN")
		os.Unsetenv("JWT_SECRET")
		os.Unsetenv("APP_ENV")
		os.Unsetenv("ACCESS_TOKEN_TTL_MINUTES")
		os.Unsetenv("REFRESH_TOKEN_TTL_DAYS")
	}()

	cfg := Load()

	if cfg.Port != "9090" {
		t.Errorf("Load() Port = %v, want 9090", cfg.Port)
	}
	if cfg.DatabaseDSN != "postgres://test:test@localhost/test" {
		t.Errorf("Load() DatabaseDSN = %v, want postgres://test:test@localhost/test", cfg.DatabaseDSN)
	}
	if cfg.JWTSecret != "my-secret" {
		t.Errorf("Load() JWTSecret = %v, want my-secret", cfg.JWTSecret)
	}
	if cfg.Env != "prod" {
		t.Errorf("Load() Env = %v, want prod", cfg.Env)
	}
	if cfg.AccessTokenTTLMinutes != 30 {
		t.Errorf("Load() AccessTokenTTLMinutes = %v, want 30", cfg.AccessTokenTTLMinutes)
	}
	if cfg.RefreshTokenTTLDays != 14 {
		t.Errorf("Load() RefreshTokenTTLDays = %v, want 14", cfg.RefreshTokenTTLDays)
	}
}

func TestLoad_InvalidTTL(t *testing.T) {
	os.Setenv("ACCESS_TOKEN_TTL_MINUTES", "invalid")
	os.Setenv("REFRESH_TOKEN_TTL_DAYS", "-5")
	defer func() {
		os.Unsetenv("ACCESS_TOKEN_TTL_MINUTES")
		os.Unsetenv("REFRESH_TOKEN_TTL_DAYS")
	}()

	cfg := Load()

	// Should fall back to defaults
	if cfg.AccessTokenTTLMinutes != 15 {
		t.Errorf("Load() AccessTokenTTLMinutes = %v, want 15 (default)", cfg.AccessTokenTTLMinutes)
	}
	if cfg.RefreshTokenTTLDays != 7 {
		t.Errorf("Load() RefreshTokenTTLDays = %v, want 7 (default)", cfg.RefreshTokenTTLDays)
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr bool
	}{
		{
			name: "valid dev config",
			cfg: Config{
				Port:        "8080",
				DatabaseDSN: "postgres://localhost/test",
				JWTSecret:   "dev-secret-change-me",
				Env:         "dev",
			},
			wantErr: false,
		},
		{
			name: "valid prod config",
			cfg: Config{
				Port:        "8080",
				DatabaseDSN: "postgres://localhost/test",
				JWTSecret:   "production-secret-key",
				Env:         "prod",
			},
			wantErr: false,
		},
		{
			name: "empty port",
			cfg: Config{
				Port:        "",
				DatabaseDSN: "postgres://localhost/test",
				JWTSecret:   "secret",
				Env:         "dev",
			},
			wantErr: true,
		},
		{
			name: "empty dsn",
			cfg: Config{
				Port:        "8080",
				DatabaseDSN: "",
				JWTSecret:   "secret",
				Env:         "dev",
			},
			wantErr: true,
		},
		{
			name: "default secret in prod",
			cfg: Config{
				Port:        "8080",
				DatabaseDSN: "postgres://localhost/test",
				JWTSecret:   "dev-secret-change-me",
				Env:         "prod",
			},
			wantErr: true,
		},
		{
			name: "default secret in test env",
			cfg: Config{
				Port:        "8080",
				DatabaseDSN: "postgres://localhost/test",
				JWTSecret:   "dev-secret-change-me",
				Env:         "test",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := Validate(tt.cfg)
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestValidate_ProductionJWTSecret(t *testing.T) {
	// This test specifically validates Property 6: Production JWT Secret Validation
	cfg := Config{
		Port:        "8080",
		DatabaseDSN: "postgres://localhost/test",
		JWTSecret:   "dev-secret-change-me", // Default value
		Env:         "prod",
	}

	err := Validate(cfg)
	if err == nil {
		t.Error("Validate() should reject default JWT secret in production")
	}
}
