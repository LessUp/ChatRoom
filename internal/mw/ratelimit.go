package mw

import (
	"net"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

type keyLimiter struct {
	lim *rate.Limiter
	ts  time.Time
}

type RL struct {
	mu   sync.Mutex
	m    map[string]*keyLimiter
	r    rate.Limit
	b    int
	ttl  time.Duration
	stop chan struct{}
}

func NewRateLimiter(r rate.Limit, burst int, ttl time.Duration) *RL {
	return &RL{m: make(map[string]*keyLimiter), r: r, b: burst, ttl: ttl, stop: make(chan struct{})}
}

func (rl *RL) get(key string) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	kl, ok := rl.m[key]
	if ok {
		kl.ts = time.Now()
		return kl.lim
	}
	lim := rate.NewLimiter(rl.r, rl.b)
	rl.m[key] = &keyLimiter{lim: lim, ts: time.Now()}
	return lim
}

func (rl *RL) gc() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-rl.stop:
			return
		case <-ticker.C:
			now := time.Now()
			rl.mu.Lock()
			for k, v := range rl.m {
				if now.Sub(v.ts) > rl.ttl {
					delete(rl.m, k)
				}
			}
			rl.mu.Unlock()
		}
	}
}

// Stop 停止 GC goroutine，用于优雅停服。
func (rl *RL) Stop() {
	select {
	case <-rl.stop:
	default:
		close(rl.stop)
	}
}

// RateLimit 返回一个基于 IP+路径的令牌桶限速中间件。
func RateLimit(r rate.Limit, burst int) gin.HandlerFunc {
	rl := NewRateLimiter(r, burst, 2*time.Minute)
	go rl.gc()
	return func(c *gin.Context) {
		ip := clientIP(c.Request.RemoteAddr)
		key := ip + "|" + c.FullPath()
		if key == "|" {
			key = ip + "|" + c.Request.URL.Path
		}
		lim := rl.get(key)
		if !lim.Allow() {
			c.AbortWithStatusJSON(429, gin.H{"error": "too many requests"})
			return
		}
		c.Next()
	}
}

func clientIP(remote string) string {
	host, _, err := net.SplitHostPort(remote)
	if err != nil {
		return remote
	}
	return host
}
