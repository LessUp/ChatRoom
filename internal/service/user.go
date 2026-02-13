package service

import (
	"errors"
	"time"

	"chatroom/internal/auth"
	"chatroom/internal/config"
	"chatroom/internal/models"

	"gorm.io/gorm"
)

// UserService 封装用户相关的业务逻辑。
type UserService struct {
	db  *gorm.DB
	cfg config.Config
}

func NewUserService(db *gorm.DB, cfg config.Config) *UserService {
	return &UserService{db: db, cfg: cfg}
}

// RegisterResult 注册成功后返回的数据。
type RegisterResult struct {
	ID       uint   `json:"id"`
	Username string `json:"username"`
}

// Register 注册新用户，返回用户 ID 和用户名。
func (s *UserService) Register(username, password string) (*RegisterResult, error) {
	var count int64
	if err := s.db.Model(&models.User{}).Where("username = ?", username).Count(&count).Error; err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, ErrUsernameTaken
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return nil, err
	}
	user := models.User{Username: username, PasswordHash: hash}
	if err := s.db.Create(&user).Error; err != nil {
		return nil, err
	}
	return &RegisterResult{ID: user.ID, Username: user.Username}, nil
}

// LoginResult 登录成功后返回的数据。
type LoginResult struct {
	AccessToken  string      `json:"access_token"`
	RefreshToken string      `json:"refresh_token"`
	User         models.User `json:"-"`
}

// Login 校验用户名密码并签发 token 对。
func (s *UserService) Login(username, password string) (*LoginResult, error) {
	var user models.User
	if err := s.db.Where("username = ?", username).First(&user).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrInvalidCredentials
		}
		return nil, err
	}
	if !auth.VerifyPassword(user.PasswordHash, password) {
		return nil, ErrInvalidCredentials
	}
	at, err := auth.GenerateAccessToken(user.ID, s.cfg.JWTSecret, s.cfg.AccessTokenTTLMinutes)
	if err != nil {
		return nil, err
	}
	rt, err := auth.GenerateRefreshToken()
	if err != nil {
		return nil, err
	}
	exp := time.Now().Add(time.Duration(s.cfg.RefreshTokenTTLDays) * 24 * time.Hour)
	if err := auth.SaveRefreshToken(s.db, user.ID, rt, exp); err != nil {
		return nil, err
	}
	return &LoginResult{AccessToken: at, RefreshToken: rt, User: user}, nil
}

// RefreshResult 刷新 token 后返回的新 token 对。
type RefreshResult struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

// RefreshTokens 验证旧 refresh token 并签发新 token 对（旋转刷新）。
func (s *UserService) RefreshTokens(oldRT string) (*RefreshResult, error) {
	var result RefreshResult
	err := s.db.Transaction(func(tx *gorm.DB) error {
		rec, err := auth.ValidateRefreshToken(tx, oldRT)
		if err != nil {
			return err
		}
		if err := auth.RevokeRefreshToken(tx, oldRT); err != nil {
			return err
		}
		at, err := auth.GenerateAccessToken(rec.UserID, s.cfg.JWTSecret, s.cfg.AccessTokenTTLMinutes)
		if err != nil {
			return err
		}
		newRT, err := auth.GenerateRefreshToken()
		if err != nil {
			return err
		}
		exp := time.Now().Add(time.Duration(s.cfg.RefreshTokenTTLDays) * 24 * time.Hour)
		if err := auth.SaveRefreshToken(tx, rec.UserID, newRT, exp); err != nil {
			return err
		}
		result.AccessToken = at
		result.RefreshToken = newRT
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &result, nil
}
