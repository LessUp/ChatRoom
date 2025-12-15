package server

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"chatroom/internal/config"
	"chatroom/internal/db"
	"chatroom/internal/ws"

	"github.com/gin-gonic/gin"
)

func TestHealthz(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := config.Config{Port: "0", DatabaseDSN: "", JWTSecret: "secret", Env: "dev", AccessTokenTTLMinutes: 15, RefreshTokenTTLDays: 7}
	gdb, err := db.Connect("host=localhost user=postgres password=postgres dbname=chatroom port=5432 sslmode=disable TimeZone=UTC")
	if err != nil {
		t.Skipf("skip: db not available: %v", err)
	}
	if err := db.Migrate(gdb); err != nil {
		t.Skipf("skip: migrate failed: %v", err)
	}
	engine := SetupRouter(cfg, gdb, ws.NewHub())

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()
	engine.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
}
