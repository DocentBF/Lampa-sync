package main

import (
	"github.com/go-ini/ini"
	"log"
)

type Config struct {
	HTTPPort       string
	DataFile       string
	PluginsDir     string
	AutosavePeriod int
}

func loadConfig() *Config {
	cfg, err := ini.Load("config.ini")
	if err != nil {
		log.Fatalf("Failed to load config file: %v", err)
	}

	config := &Config{}
	if err := cfg.Section("port").MapTo(config); err != nil {
		log.Fatalf("Failed to load port configuration: %v", err)
	}
	if err := cfg.Section("data").MapTo(config); err != nil {
		log.Fatalf("Failed to load data configuration: %v", err)
	}

	return config
}

