package main

import (
	"log"
	"net/http"
	"os"
)

func main() {
	config := loadConfig()
	data := NewData()

	if _, err := os.Stat(config.DataFile); err == nil {
		if err := data.LoadFromFile(config.DataFile); err != nil {
			log.Fatalf("Error loading data: %v", err)
		}
	}

	setupServer(data, config)
	startBackgroundTasks(data, config)

	log.Printf("Server started on port %s", config.HTTPPort)
	log.Fatal(http.ListenAndServe(config.HTTPPort, nil))
}
