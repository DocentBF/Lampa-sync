package main

import (
	"encoding/json"
	"github.com/go-ini/ini"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
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

type Data struct {
	Mutex sync.Mutex
	JSON  map[string]interface{}
}

func handleSet(data *Data) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}

		body, err := ioutil.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "Error reading request", http.StatusBadRequest)
			return
		}

		var newJSON map[string]interface{}
		if err := json.Unmarshal(body, &newJSON); err != nil {
			http.Error(w, "Error decoding JSON", http.StatusBadRequest)
			return
		}

		data.Mutex.Lock()
		defer data.Mutex.Unlock()

		for key, value := range newJSON {
			data.JSON[key] = value
		}

		w.WriteHeader(http.StatusOK)
	}
}

func handleGet(data *Data) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")

		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusOK)
			return
		}

		data.Mutex.Lock()
		defer data.Mutex.Unlock()

		jsonData, err := json.Marshal(data.JSON)
		if err != nil {
			http.Error(w, "Error encoding JSON", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		_, err = w.Write(jsonData)
		if err != nil {
			log.Fatalf("Error writing http response: %v", err)
			return
		}
	}
}

func saveToFile(data *Data, config *Config) {
	data.Mutex.Lock()

	jsonData, err := json.Marshal(data.JSON)
	if err != nil {
		log.Printf("Error encoding JSON for file saving: %v\n", err)
	} else {
		err := ioutil.WriteFile(config.DataFile, jsonData, 0644)
		if err != nil {
			log.Printf("Error saving data to file: %v\n", err)
		} else {
			log.Println("Data successfully saved to file")
		}
	}

	data.Mutex.Unlock()
}

func periodicalSave(data *Data, config *Config) {
	for {
		saveToFile(data, config)

		<-time.After(time.Duration(config.AutosavePeriod) * time.Second)
	}
}

func handleShutdown(data *Data, config *Config) {
	sigchan := make(chan os.Signal, 1)
	signal.Notify(sigchan, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)

	<-sigchan

	saveToFile(data, config)

	os.Exit(0)
}

func main() {
	config := loadConfig()

	data := &Data{
		Mutex: sync.Mutex{},
		JSON:  make(map[string]interface{}),
	}

	if _, err := os.Stat(config.DataFile); err == nil {
		fileData, err := ioutil.ReadFile(config.DataFile)
		if err != nil {
			log.Fatalf("Error reading data from file: %v\n", err)
		}
		err = json.Unmarshal(fileData, &data.JSON)
		if err != nil {
			log.Fatalf("Error decoding data from file: %v\n", err)
		}
	}

	http.HandleFunc("/set", handleSet(data))
	http.HandleFunc("/get", handleGet(data))

	http.Handle("/plugins/", http.StripPrefix("/plugins/", http.FileServer(http.Dir(config.PluginsDir))))

	go periodicalSave(data, config)
	go handleShutdown(data, config)

	log.Printf("Server started on port %s\n", config.HTTPPort)
	log.Fatal(http.ListenAndServe(config.HTTPPort, nil))
}
