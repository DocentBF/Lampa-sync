package main

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"net/http"
)

func handleSet(data *Data) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
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

		data.Merge(newJSON)
		w.WriteHeader(http.StatusOK)
	}
}

func handleGet(data *Data) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jsonData, err := json.Marshal(data.Get())
		if err != nil {
			http.Error(w, "Error encoding JSON", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		if _, err := w.Write(jsonData); err != nil {
			log.Printf("Error writing response: %v", err)
		}
	}
}

func handlePlugins(config *Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if len(r.URL.Path) > 3 && r.URL.Path[len(r.URL.Path)-3:] == ".js" {
			w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
		}

		cw := &corsResponseWriter{ResponseWriter: w}
		http.StripPrefix("/plugins/", http.FileServer(http.Dir(config.PluginsDir))).ServeHTTP(cw, r)
	}
}

func setupServer(data *Data, config *Config) {
	http.HandleFunc("/set", corsMiddleware(handleSet(data)))
	http.HandleFunc("/get", corsMiddleware(handleGet(data)))
	http.HandleFunc("/plugins/", handlePlugins(config))
}

