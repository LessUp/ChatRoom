package mw

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// CORS 返回一个支持跨域请求的中间件，dev 环境允许所有来源。
func CORS(env string) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin == "" {
			c.Next()
			return
		}

		if env == "dev" {
			c.Header("Access-Control-Allow-Origin", origin)
		} else {
			// 生产环境只允许同源
			host := c.Request.Host
			if strings.Contains(origin, host) {
				c.Header("Access-Control-Allow-Origin", origin)
			}
		}

		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
