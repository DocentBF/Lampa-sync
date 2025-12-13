package main

func deduplicateFavorite(value interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	favoriteMap, ok := value.(map[string]interface{})
	if !ok {
		return result
	}

	for key, val := range favoriteMap {
		switch v := val.(type) {
		case []interface{}:
			if key == "card" {
				result[key] = deduplicateCards(v)
			} else {
				result[key] = deduplicateIDs(v)
			}
		default:
			result[key] = val
		}
	}
	return result
}

func deduplicateIDs(arr []interface{}) []interface{} {
	seen := make(map[interface{}]bool)
	result := make([]interface{}, 0)
	for _, item := range arr {
		if !seen[item] {
			seen[item] = true
			result = append(result, item)
		}
	}
	return result
}

func deduplicateCards(cards []interface{}) []interface{} {
	cardMap := make(map[interface{}]interface{})
	for _, item := range cards {
		if cardObj, ok := item.(map[string]interface{}); ok {
			if id, exists := cardObj["id"]; exists && id != nil {
				cardMap[id] = item
			}
		}
	}
	result := make([]interface{}, 0, len(cardMap))
	for _, card := range cardMap {
		result = append(result, card)
	}
	return result
}

func mergeFavoriteMaps(existing, newData map[string]interface{}) map[string]interface{} {
	result := make(map[string]interface{})
	for k, v := range existing {
		result[k] = v
	}

	for key, newVal := range newData {
		switch key {
		case "card":
			result[key] = mergeCards(result["card"], newVal)
		default:
			result[key] = mergeIDArrays(result[key], newVal)
		}
	}
	return result
}

func mergeCards(existing, newVal interface{}) []interface{} {
	existingCards, _ := existing.([]interface{})
	newCards, _ := newVal.([]interface{})

	cardMap := make(map[interface{}]interface{})
	for _, card := range existingCards {
		if cardObj, ok := card.(map[string]interface{}); ok {
			if id, exists := cardObj["id"]; exists && id != nil {
				cardMap[id] = card
			}
		}
	}
	for _, card := range newCards {
		if cardObj, ok := card.(map[string]interface{}); ok {
			if id, exists := cardObj["id"]; exists && id != nil {
				cardMap[id] = card
			}
		}
	}

	result := make([]interface{}, 0, len(cardMap))
	for _, card := range cardMap {
		result = append(result, card)
	}
	return result
}

func mergeIDArrays(existing, newVal interface{}) []interface{} {
	existingArr, _ := existing.([]interface{})
	newArr, _ := newVal.([]interface{})

	seen := make(map[interface{}]bool)
	result := make([]interface{}, 0)

	for _, item := range existingArr {
		if !seen[item] {
			seen[item] = true
			result = append(result, item)
		}
	}
	for _, item := range newArr {
		if !seen[item] {
			seen[item] = true
			result = append(result, item)
		}
	}
	return result
}

