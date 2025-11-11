package log

import (
	"os"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Init 根据环境设置 Zerolog 输出格式，开发环境使用更易读的控制台模式。
func Init(env string) {
	zerolog.TimeFieldFormat = time.RFC3339
	if env == "dev" {
		cw := zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339}
		log.Logger = zerolog.New(cw).With().Timestamp().Logger()
		return
	}
	log.Logger = zerolog.New(os.Stdout).With().Timestamp().Logger()
}
