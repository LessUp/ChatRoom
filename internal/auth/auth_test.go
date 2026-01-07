package auth

import (
	"testing"
	"time"
)

func TestHashPassword(t *testing.T) {
	tests := []struct {
		name     string
		password string
		wantErr  bool
	}{
		{"valid password", "password123", false},
		{"empty password", "", false},
		{"long password", "a" + string(make([]byte, 70)), false}, // bcrypt max is 72 bytes
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			hash, err := HashPassword(tt.password)
			if (err != nil) != tt.wantErr {
				t.Errorf("HashPassword() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && hash == "" {
				t.Error("HashPassword() returned empty hash")
			}
		})
	}
}

func TestHashPassword_DifferentHashes(t *testing.T) {
	password := "testpassword"
	hash1, _ := HashPassword(password)
	hash2, _ := HashPassword(password)

	if hash1 == hash2 {
		t.Error("HashPassword() should produce different hashes for same password")
	}
}

func TestVerifyPassword(t *testing.T) {
	password := "testpassword123"
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatalf("HashPassword() error = %v", err)
	}

	tests := []struct {
		name     string
		hash     string
		password string
		want     bool
	}{
		{"correct password", hash, password, true},
		{"wrong password", hash, "wrongpassword", false},
		{"empty password", hash, "", false},
		{"invalid hash", "invalidhash", password, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := VerifyPassword(tt.hash, tt.password); got != tt.want {
				t.Errorf("VerifyPassword() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGenerateAccessToken(t *testing.T) {
	tests := []struct {
		name       string
		userID     uint
		secret     string
		ttlMinutes int
		wantErr    bool
	}{
		{"valid token", 1, "test-secret", 15, false},
		{"zero user id", 0, "test-secret", 15, false},
		{"empty secret", 1, "", 15, false},
		{"zero ttl", 1, "test-secret", 0, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token, err := GenerateAccessToken(tt.userID, tt.secret, tt.ttlMinutes)
			if (err != nil) != tt.wantErr {
				t.Errorf("GenerateAccessToken() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && token == "" {
				t.Error("GenerateAccessToken() returned empty token")
			}
		})
	}
}

func TestParseAccessToken(t *testing.T) {
	secret := "test-secret-key"
	userID := uint(42)

	token, err := GenerateAccessToken(userID, secret, 15)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error = %v", err)
	}

	tests := []struct {
		name    string
		token   string
		secret  string
		wantUID uint
		wantErr bool
	}{
		{"valid token", token, secret, userID, false},
		{"wrong secret", token, "wrong-secret", 0, true},
		{"invalid token", "invalid.token.here", secret, 0, true},
		{"empty token", "", secret, 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			claims, err := ParseAccessToken(tt.token, tt.secret)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseAccessToken() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && claims.UserID != tt.wantUID {
				t.Errorf("ParseAccessToken() UserID = %v, want %v", claims.UserID, tt.wantUID)
			}
		})
	}
}

func TestParseAccessToken_Expired(t *testing.T) {
	secret := "test-secret"
	// Generate token with -1 minute TTL (already expired)
	token, err := GenerateAccessToken(1, secret, -1)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error = %v", err)
	}

	claims, err := ParseAccessToken(token, secret)
	if err == nil {
		t.Error("ParseAccessToken() should return error for expired token")
	}
	if claims != nil {
		t.Error("ParseAccessToken() should return nil claims for expired token")
	}
}

func TestGenerateRefreshToken(t *testing.T) {
	token1, err := GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken() error = %v", err)
	}

	token2, err := GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken() error = %v", err)
	}

	if token1 == "" {
		t.Error("GenerateRefreshToken() returned empty token")
	}

	if token1 == token2 {
		t.Error("GenerateRefreshToken() should generate unique tokens")
	}

	// Check token length (hex encoded 32 bytes = 64 chars)
	if len(token1) != 64 {
		t.Errorf("GenerateRefreshToken() token length = %d, want 64", len(token1))
	}
}

func TestTokenExpiration(t *testing.T) {
	secret := "test-secret"
	ttlMinutes := 1

	token, err := GenerateAccessToken(1, secret, ttlMinutes)
	if err != nil {
		t.Fatalf("GenerateAccessToken() error = %v", err)
	}

	// Token should be valid immediately
	_, err = ParseAccessToken(token, secret)
	if err != nil {
		t.Errorf("ParseAccessToken() should succeed for fresh token: %v", err)
	}

	// Note: We can't easily test expiration without mocking time
	// In production, use a clock interface for testability
	_ = time.Now() // placeholder for time-based testing
}
