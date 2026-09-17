package config

import (
	"log/slog"
	"os"
)

// NewLogger builds the process-wide logger from LogFormat/LogLevel. JSON is
// the default so logs can be shipped to an aggregator; text is for a
// developer reading them straight off a terminal.
func (c Config) NewLogger() *slog.Logger {
	level := slog.LevelInfo
	switch c.LogLevel {
	case "debug":
		level = slog.LevelDebug
	case "warn":
		level = slog.LevelWarn
	case "error":
		level = slog.LevelError
	}

	opts := &slog.HandlerOptions{Level: level}
	var handler slog.Handler
	if c.LogFormat == "text" {
		handler = slog.NewTextHandler(os.Stdout, opts)
	} else {
		handler = slog.NewJSONHandler(os.Stdout, opts)
	}
	return slog.New(handler)
}
