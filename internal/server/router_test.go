package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"chatroom/internal/config"
	"chatroom/internal/models"
	"chatroom/internal/ws"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func setupTestDB(t *testing.T) *gorm.DB {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("failed to connect to test database: %v", err)
	}

	err = db.AutoMigrate(&models.User{}, &models.Room{}, &models.Message{}, &models.RefreshToken{})
	if err != nil {
		t.Fatalf("failed to migrate test database: %v", err)
	}

	return db
}

func setupTestRouter(t *testing.T) (*gorm.DB, *http.Handler) {
	db := setupTestDB(t)
	cfg := config.Config{
		Port:                  "8080",
		DatabaseDSN:           "test",
		JWTSecret:             "test-secret",
		Env:                   "test",
		AccessTokenTTLMinutes: 15,
		RefreshTokenTTLDays:   7,
	}
	hub := ws.NewHub()
	router := SetupRouter(cfg, db, hub)
	var handler http.Handler = router
	return db, &handler
}

func TestHealthEndpoint(t *testing.T) {
	_, handler := setupTestRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	(*handler).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /health status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp["status"] != "ok" {
		t.Errorf("GET /health status = %v, want ok", resp["status"])
	}

	if _, ok := resp["timestamp"]; !ok {
		t.Error("GET /health should include timestamp")
	}
}

func TestHealthzEndpoint(t *testing.T) {
	_, handler := setupTestRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	w := httptest.NewRecorder()

	(*handler).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /healthz status = %d, want %d", w.Code, http.StatusOK)
	}
}

func TestReadyEndpoint(t *testing.T) {
	_, handler := setupTestRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/ready", nil)
	w := httptest.NewRecorder()

	(*handler).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /ready status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if resp["status"] != "ready" {
		t.Errorf("GET /ready status = %v, want ready", resp["status"])
	}
}

func TestVersionEndpoint(t *testing.T) {
	_, handler := setupTestRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/version", nil)
	w := httptest.NewRecorder()

	(*handler).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /version status = %d, want %d", w.Code, http.StatusOK)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	requiredFields := []string{"version", "git_commit", "build_time", "go_version"}
	for _, field := range requiredFields {
		if _, ok := resp[field]; !ok {
			t.Errorf("GET /version missing field: %s", field)
		}
	}
}

func TestRegisterEndpoint(t *testing.T) {
	_, handler := setupTestRouter(t)

	tests := []struct {
		name       string
		body       string
		wantStatus int
	}{
		{
			name:       "valid registration",
			body:       `{"username":"testuser","password":"testpass"}`,
			wantStatus: http.StatusOK,
		},
		{
			name:       "empty username",
			body:       `{"username":"","password":"testpass"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "empty password",
			body:       `{"username":"testuser","password":""}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "short username",
			body:       `{"username":"a","password":"testpass"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "short password",
			body:       `{"username":"testuser","password":"abc"}`,
			wantStatus: http.StatusBadRequest,
		},
		{
			name:       "invalid json",
			body:       `{invalid}`,
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			(*handler).ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("POST /api/v1/auth/register status = %d, want %d, body = %s", w.Code, tt.wantStatus, w.Body.String())
			}
		})
	}
}

func TestRegisterDuplicateUsername(t *testing.T) {
	_, handler := setupTestRouter(t)

	body := `{"username":"duplicate","password":"testpass"}`

	// First registration should succeed
	req1 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(body))
	req1.Header.Set("Content-Type", "application/json")
	w1 := httptest.NewRecorder()
	(*handler).ServeHTTP(w1, req1)

	if w1.Code != http.StatusOK {
		t.Fatalf("First registration failed: %d", w1.Code)
	}

	// Second registration should fail
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	(*handler).ServeHTTP(w2, req2)

	if w2.Code != http.StatusConflict {
		t.Errorf("Duplicate registration status = %d, want %d", w2.Code, http.StatusConflict)
	}
}

func TestLoginEndpoint(t *testing.T) {
	_, handler := setupTestRouter(t)

	// Register a user first
	regBody := `{"username":"logintest","password":"testpass"}`
	regReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	(*handler).ServeHTTP(regW, regReq)

	tests := []struct {
		name       string
		body       string
		wantStatus int
	}{
		{
			name:       "valid login",
			body:       `{"username":"logintest","password":"testpass"}`,
			wantStatus: http.StatusOK,
		},
		{
			name:       "wrong password",
			body:       `{"username":"logintest","password":"wrongpass"}`,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "nonexistent user",
			body:       `{"username":"nouser","password":"testpass"}`,
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "empty credentials",
			body:       `{"username":"","password":""}`,
			wantStatus: http.StatusBadRequest,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			(*handler).ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("POST /api/v1/auth/login status = %d, want %d", w.Code, tt.wantStatus)
			}
		})
	}
}

func TestLoginReturnsTokens(t *testing.T) {
	_, handler := setupTestRouter(t)

	// Register
	regBody := `{"username":"tokentest","password":"testpass"}`
	regReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(regBody))
	regReq.Header.Set("Content-Type", "application/json")
	regW := httptest.NewRecorder()
	(*handler).ServeHTTP(regW, regReq)

	// Login
	loginBody := `{"username":"tokentest","password":"testpass"}`
	loginReq := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", strings.NewReader(loginBody))
	loginReq.Header.Set("Content-Type", "application/json")
	loginW := httptest.NewRecorder()
	(*handler).ServeHTTP(loginW, loginReq)

	if loginW.Code != http.StatusOK {
		t.Fatalf("Login failed: %d", loginW.Code)
	}

	var resp map[string]interface{}
	if err := json.Unmarshal(loginW.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}

	if _, ok := resp["access_token"]; !ok {
		t.Error("Login response missing access_token")
	}
	if _, ok := resp["refresh_token"]; !ok {
		t.Error("Login response missing refresh_token")
	}
	if _, ok := resp["user"]; !ok {
		t.Error("Login response missing user")
	}
}

func TestMetricsEndpoint(t *testing.T) {
	_, handler := setupTestRouter(t)

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	w := httptest.NewRecorder()

	(*handler).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET /metrics status = %d, want %d", w.Code, http.StatusOK)
	}

	// Prometheus metrics should contain some standard metrics
	body := w.Body.String()
	if !strings.Contains(body, "go_") {
		t.Error("GET /metrics should contain Go runtime metrics")
	}
}
