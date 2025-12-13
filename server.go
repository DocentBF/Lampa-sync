package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func startBackgroundTasks(data *Data, config *Config) {
	go func() {
		ticker := time.NewTicker(time.Duration(config.AutosavePeriod) * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if err := data.SaveToFile(config.DataFile); err != nil {
				log.Printf("Error saving data: %v", err)
			}
		}
	}()

	go func() {
		sigchan := make(chan os.Signal, 1)
		signal.Notify(sigchan, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)
		<-sigchan

		if err := data.SaveToFile(config.DataFile); err != nil {
			log.Printf("Error saving on shutdown: %v", err)
		}
		os.Exit(0)
	}()
}

