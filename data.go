package main

import (
	"encoding/json"
	"io/ioutil"
	"sync"
)

type Data struct {
	mu   sync.RWMutex
	data map[string]interface{}
}

func NewData() *Data {
	return &Data{
		data: make(map[string]interface{}),
	}
}

func (d *Data) LoadFromFile(filename string) error {
	fileData, err := ioutil.ReadFile(filename)
	if err != nil {
		return err
	}

	d.mu.Lock()
	defer d.mu.Unlock()
	return json.Unmarshal(fileData, &d.data)
}

func (d *Data) SaveToFile(filename string) error {
	d.mu.RLock()
	defer d.mu.RUnlock()

	jsonData, err := json.Marshal(d.data)
	if err != nil {
		return err
	}

	return ioutil.WriteFile(filename, jsonData, 0644)
}

func (d *Data) Get() map[string]interface{} {
	d.mu.RLock()
	defer d.mu.RUnlock()

	result := make(map[string]interface{})
	for k, v := range d.data {
		result[k] = v
	}
	return result
}

func (d *Data) Merge(newData map[string]interface{}) {
	d.mu.Lock()
	defer d.mu.Unlock()

	for key, value := range newData {
		if key == "favorite" {
			deduplicated := deduplicateFavorite(value)
			if existing, ok := d.data[key].(map[string]interface{}); ok {
				d.data[key] = mergeFavoriteMaps(existing, deduplicated)
			} else {
				d.data[key] = deduplicated
			}
		} else {
			d.data[key] = value
		}
	}
}

