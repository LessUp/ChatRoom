package auth

import (
	"encoding/hex"
	"testing"
)

func TestPasswordHashAndVerify(t *testing.T) {
	hash, err := HashPassword("passw0rd")
	if err != nil {
		t.Fatalf("HashPassword err: %v", err)
	}
	if !VerifyPassword(hash, "passw0rd") {
		t.Fatalf("expected password verify true")
	}
	if VerifyPassword(hash, "wrong") {
		t.Fatalf("expected password verify false")
	}
}

func TestAccessTokenRoundTrip(t *testing.T) {
	tok, err := GenerateAccessToken(123, "secret", 5)
	if err != nil {
		t.Fatalf("GenerateAccessToken err: %v", err)
	}
	claims, err := ParseAccessToken(tok, "secret")
	if err != nil {
		t.Fatalf("ParseAccessToken err: %v", err)
	}
	if claims.UserID != 123 {
		t.Fatalf("expected uid 123, got %d", claims.UserID)
	}
	if _, err := ParseAccessToken(tok, "other"); err == nil {
		t.Fatalf("expected invalid token with wrong secret")
	}
}

func TestAccessTokenExpired(t *testing.T) {
	tok, err := GenerateAccessToken(1, "secret", -1)
	if err != nil {
		t.Fatalf("GenerateAccessToken err: %v", err)
	}
	if _, err := ParseAccessToken(tok, "secret"); err == nil {
		t.Fatalf("expected expired token")
	}
}

func TestGenerateRefreshToken(t *testing.T) {
	rt, err := GenerateRefreshToken()
	if err != nil {
		t.Fatalf("GenerateRefreshToken err: %v", err)
	}
	if len(rt) != 64 {
		t.Fatalf("expected 64 hex chars, got %d", len(rt))
	}
	if _, err := hex.DecodeString(rt); err != nil {
		t.Fatalf("expected valid hex string: %v", err)
	}
}
