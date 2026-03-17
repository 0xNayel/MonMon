package config

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/viper"
)

// Config holds all application configuration.
type Config struct {
	Server    ServerConfig    `mapstructure:"server"`
	Database  DatabaseConfig  `mapstructure:"database"`
	Auth      AuthConfig      `mapstructure:"auth"`
	Notify    NotifyConfig    `mapstructure:"notify"`
	Logging   LoggingConfig   `mapstructure:"logging"`
	Retention RetentionConfig `mapstructure:"retention"`
	Tools     ToolsConfig     `mapstructure:"tools"`
}

type ServerConfig struct {
	Port int `mapstructure:"port"`
}

type DatabaseConfig struct {
	Path string `mapstructure:"path"`
}

type AuthConfig struct {
	JWTSecret       string `mapstructure:"jwt_secret"`
	CredentialsFile string `mapstructure:"credentials_file"`
}

type NotifyConfig struct {
	ProviderConfig string `mapstructure:"provider_config"`
}

type LoggingConfig struct {
	Level string `mapstructure:"level"`
	File  string `mapstructure:"file"`
}

type RetentionConfig struct {
	DefaultKeep     int    `mapstructure:"default_keep"`
	CleanupInterval string `mapstructure:"cleanup_interval"`
}

type ToolsConfig struct {
	Subfinder string `mapstructure:"subfinder"`
	Httpx     string `mapstructure:"httpx"`
}

// Load reads configuration from a file and environment variables.
func Load(cfgFile string) (*Config, error) {
	if cfgFile != "" {
		viper.SetConfigFile(cfgFile)
	} else {
		viper.SetConfigName("monmon")
		viper.SetConfigType("yaml")
		viper.AddConfigPath(".")
		viper.AddConfigPath("./configs")
		viper.AddConfigPath("/etc/monmon")
	}

	// Defaults
	viper.SetDefault("server.port", 8080)
	viper.SetDefault("database.path", "./data/monmon.db")
	viper.SetDefault("auth.jwt_secret", "")
	viper.SetDefault("auth.credentials_file", "./configs/credentials.yaml")
	viper.SetDefault("notify.provider_config", "./configs/notify-provider.yaml")
	viper.SetDefault("logging.level", "info")
	viper.SetDefault("logging.file", "./data/monmon.log")
	viper.SetDefault("retention.default_keep", 0)
	viper.SetDefault("retention.cleanup_interval", "1h")
	viper.SetDefault("tools.subfinder", "subfinder")
	viper.SetDefault("tools.httpx", "httpx")

	viper.SetEnvPrefix("MONMON")
	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("reading config: %w", err)
		}
		// Config file not found is fine — use defaults
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("parsing config: %w", err)
	}

	// Auto-generate JWT secret if empty
	if cfg.Auth.JWTSecret == "" {
		b := make([]byte, 32)
		if _, err := rand.Read(b); err != nil {
			return nil, fmt.Errorf("generating jwt secret: %w", err)
		}
		cfg.Auth.JWTSecret = hex.EncodeToString(b)
	}

	// Ensure data directories exist
	dbDir := filepath.Dir(cfg.Database.Path)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		return nil, fmt.Errorf("creating db directory: %w", err)
	}
	logDir := filepath.Dir(cfg.Logging.File)
	if err := os.MkdirAll(logDir, 0755); err != nil {
		return nil, fmt.Errorf("creating log directory: %w", err)
	}

	return &cfg, nil
}
