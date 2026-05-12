package config

import (
	"fmt"
	"os"
)

type Config struct {
	Server   ServerConfig
	Database DatabaseConfig
	Redis    RedisConfig
}

type ServerConfig struct {
	Port        string
	Environment string
}

type DatabaseConfig struct {
	URL string
}

type RedisConfig struct {
	URL string
}

func Load() (*Config, error) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://finagra:finagra_dev_secret@localhost:5432/finagra_dev"
	}

	redisURL := os.Getenv("REDIS_URL")
	if redisURL == "" {
		redisURL = "redis://localhost:6379"
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8888"
	}

	env := os.Getenv("APP_ENV")
	if env == "" {
		env = "development"
	}

	cfg := &Config{
		Server:   ServerConfig{Port: port, Environment: env},
		Database: DatabaseConfig{URL: dbURL},
		Redis:    RedisConfig{URL: redisURL},
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

func (c *Config) validate() error {
	if c.Database.URL == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	return nil
}

func (c *Config) IsDevelopment() bool { return c.Server.Environment == "development" }
func (c *Config) IsProduction() bool  { return c.Server.Environment == "production" }
