package ws

import (
	"encoding/json"
	"testing"
	"time"
)

func recvEvent(t *testing.T, ch <-chan []byte) map[string]any {
	t.Helper()
	select {
	case b, ok := <-ch:
		if !ok {
			t.Fatalf("channel closed")
		}
		var m map[string]any
		if err := json.Unmarshal(b, &m); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		return m
	case <-time.After(2 * time.Second):
		t.Fatalf("timeout")
		return nil
	}
}

func TestRoomHubJoinLeaveOnline(t *testing.T) {
	rh := NewRoomHub(1)
	go rh.run()

	c1 := &Client{room: rh, send: make(chan []byte, 16), userID: 1, uname: "u1"}
	rh.register <- c1
	e1 := recvEvent(t, c1.send)
	if e1["type"] != "join" {
		t.Fatalf("expected join")
	}
	if int(e1["online"].(float64)) != 1 {
		t.Fatalf("expected online=1")
	}

	c2 := &Client{room: rh, send: make(chan []byte, 16), userID: 2, uname: "u2"}
	rh.register <- c2
	e2a := recvEvent(t, c1.send)
	e2b := recvEvent(t, c2.send)
	if e2a["type"] != "join" || e2b["type"] != "join" {
		t.Fatalf("expected join")
	}
	if int(e2a["online"].(float64)) != 2 || int(e2b["online"].(float64)) != 2 {
		t.Fatalf("expected online=2")
	}
	if int(e2a["user_id"].(float64)) != 2 || e2a["username"].(string) != "u2" {
		t.Fatalf("expected join event of u2")
	}

	rh.unregister <- c1
	e3 := recvEvent(t, c2.send)
	if e3["type"] != "leave" {
		t.Fatalf("expected leave")
	}
	if int(e3["online"].(float64)) != 1 {
		t.Fatalf("expected online=1")
	}
	if int(e3["user_id"].(float64)) != 1 || e3["username"].(string) != "u1" {
		t.Fatalf("expected leave event of u1")
	}
}
