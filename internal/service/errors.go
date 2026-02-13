package service

import "errors"

// 业务层通用错误，handler 可根据错误类型映射到合适的 HTTP 状态码。
var (
	ErrUsernameTaken      = errors.New("username taken")
	ErrInvalidCredentials = errors.New("invalid credentials")
	ErrRoomNotFound       = errors.New("room not found")
)
