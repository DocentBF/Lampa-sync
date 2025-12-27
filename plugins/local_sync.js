const LOCAL_SYNC_SERVER = 'http://127.0.0.1:8181'

const ArrayUtils = {
    deduplicateIDs(arr) {
        if (!arr || arr.length === 0) return []
        const seen = new Set()
        const result = []
        for (let i = 0; i < arr.length; i++) {
            const id = arr[i]
            if (id != null && !seen.has(id)) {
                seen.add(id)
                result.push(id)
            }
        }
        return result
    },
    
    deduplicateCards(cards) {
        if (!cards || cards.length === 0) return []
        const seen = new Set()
        const result = []
        
        for (let i = 0; i < cards.length; i++) {
            const card = cards[i]
            if (card && card.id && !seen.has(card.id)) {
                seen.add(card.id)
                result.push(card)
            }
        }
        
        return result
    },
    
    mergeIDArrays(existing, newArr) {
        if (!newArr || newArr.length === 0) return existing || []
        if (!existing || existing.length === 0) return this.deduplicateIDs(newArr)
        
        const seen = new Set(existing)
        const result = [...existing]
        
        for (let i = 0; i < newArr.length; i++) {
            const id = newArr[i]
            if (id != null && !seen.has(id)) {
                seen.add(id)
                result.push(id)
            }
        }
        
        return result
    },
    
    mergeCards(existing, serverCards) {
        if (!serverCards || serverCards.length === 0) return existing || []
        if (!existing || existing.length === 0) return this.deduplicateCards(serverCards)
        
        const cardMap = new Map()
        const seen = new Set()
        const result = []
        
        for (let i = existing.length - 1; i >= 0; i--) {
            const card = existing[i]
            if (card && card.id && !cardMap.has(card.id)) {
                cardMap.set(card.id, card)
            }
        }
        
        for (let i = 0; i < serverCards.length; i++) {
            const card = serverCards[i]
            if (card && card.id) {
                cardMap.set(card.id, card)
                if (!seen.has(card.id)) {
                    seen.add(card.id)
                    result.push(card)
                }
            }
        }
        
        for (let i = 0; i < existing.length; i++) {
            const card = existing[i]
            if (card && card.id && !seen.has(card.id)) {
                seen.add(card.id)
                result.push(cardMap.get(card.id))
            }
        }
        
        return result
    }
}

const FavoriteUtils = {
    deduplicate(favorite) {
        if (!favorite || typeof favorite !== 'object') {
            return favorite
        }
        
        const result = { ...favorite }
        
        for (const key in result) {
            const value = result[key]
            if (Array.isArray(value)) {
                if (key === 'card') {
                    result[key] = ArrayUtils.deduplicateCards(value)
                } else {
                    result[key] = ArrayUtils.deduplicateIDs(value)
                }
            }
        }
        
        return result
    },
    
    hasDuplicates(data) {
        if (!data || typeof data !== 'object') return false
        
        for (const key in data) {
            const value = data[key]
            if (Array.isArray(value)) {
                if (key === 'card') {
                    const seen = new Set()
                    for (let i = 0; i < value.length; i++) {
                        const id = value[i] && value[i].id
                        if (id != null) {
                            if (seen.has(id)) return true
                            seen.add(id)
                        }
                    }
                } else {
                    const seen = new Set()
                    for (let i = 0; i < value.length; i++) {
                        const id = value[i]
                        if (id != null) {
                            if (seen.has(id)) return true
                            seen.add(id)
                        }
                    }
                }
            }
        }
        return false
    },
    
    arraysEqual(arr1, arr2) {
        if (!arr1 && !arr2) return true
        if (!arr1 || !arr2 || arr1.length !== arr2.length) return false
        
        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) return false
        }
        return true
    },
    
    cardsEqual(cards1, cards2) {
        if (!cards1 && !cards2) return true
        if (!cards1 || !cards2 || cards1.length !== cards2.length) return false
        
        const ids1 = new Set()
        const ids2 = new Set()
        
        for (let i = 0; i < cards1.length; i++) {
            const id = cards1[i] && cards1[i].id
            if (id != null) ids1.add(id)
        }
        
        for (let i = 0; i < cards2.length; i++) {
            const id = cards2[i] && cards2[i].id
            if (id != null) ids2.add(id)
        }
        
        if (ids1.size !== ids2.size) return false
        
        for (const id of ids1) {
            if (!ids2.has(id)) return false
        }
        
        return true
    },
    
    merge(existing, serverData) {
        if (!serverData || typeof serverData !== 'object') {
            return { merged: existing, changed: false }
        }
        
        const merged = { ...existing }
        const serverDedup = FavoriteUtils.deduplicate(serverData)
        let changed = false
        
        for (const key in serverDedup) {
            const serverValue = serverDedup[key]
            const currentValue = merged[key]
            
            if (key === 'card') {
                const mergedCards = ArrayUtils.mergeCards(currentValue || [], serverValue || [])
                if (!FavoriteUtils.cardsEqual(mergedCards, currentValue || [])) {
                    merged[key] = mergedCards
                    changed = true
                }
            } else if (Array.isArray(serverValue)) {
                const mergedIDs = ArrayUtils.mergeIDArrays(currentValue || [], serverValue)
                if (!FavoriteUtils.arraysEqual(mergedIDs, currentValue || [])) {
                    merged[key] = mergedIDs
                    changed = true
                }
            } else {
                if (serverValue !== currentValue) {
                    merged[key] = serverValue
                    changed = true
                }
            }
        }
        
        return { merged, changed }
    }
}

class LocalTimelineSync {
    constructor() {
        this.updateTimer = null
        this.isUpdating = false
        this.timelineFilename = null
        this.fileViewKeysCache = null
        this.cacheTimestamp = 0
        this.CACHE_TTL = 5000
    }

    listen() {
        const waitForLampa = () => {
            if (this.isLampaReady()) {
                this.setupStorageListener()
                this.initialSync()
            } else {
                setTimeout(waitForLampa, 100)
            }
        }
        waitForLampa()
    }
    
    isLampaReady() {
        return typeof Lampa !== 'undefined' && 
               Lampa.Storage && 
               Lampa.Storage.listener && 
               Lampa.Timeline
    }
    
    setupStorageListener() {
        Lampa.Storage.listener.follow('change', (e) => {
            if (this.isUpdating) return
            
            if (this.shouldSyncField(e.name)) {
                if (this.isFileViewKey(e.name)) {
                    this.invalidateFileViewCache()
                }
                this.debounceUpdate()
            }
        })
    }
    
    shouldSyncField(name) {
        return name === 'file_view' || 
               name.startsWith('file_view_') || 
               name === 'favorite'
    }
    
    debounceUpdate() {
        if (this.updateTimer) {
            clearTimeout(this.updateTimer)
        }
        this.updateTimer = setTimeout(() => this.update(), 1000)
    }
    
    initialSync() {
        setTimeout(() => {
            this.read()
            this.cleanupFavorite()
        }, 2000)
    }

    update() {
        try {
            const saveData = this.collectSaveData()
            if (Object.keys(saveData).length > 0) {
                this.sendToServer(saveData)
            }
        } catch (e) {
            console.error('Local sync update error:', e)
        }
    }
    
    collectSaveData() {
        const saveData = {}
        
        this.collectFileViewData(saveData)
        this.collectFavoriteData(saveData)
        
        return saveData
    }
    
    collectFileViewData(saveData) {
        const now = Date.now()
        if (!this.fileViewKeysCache || (now - this.cacheTimestamp) > this.CACHE_TTL) {
            this.fileViewKeysCache = []
            for (let i = 0; i < window.localStorage.length; i++) {
                const key = window.localStorage.key(i)
                if (key === 'file_view' || (key && key.startsWith('file_view_'))) {
                    this.fileViewKeysCache.push(key)
                }
            }
            this.cacheTimestamp = now
        }
        
        for (let i = 0; i < this.fileViewKeysCache.length; i++) {
            const key = this.fileViewKeysCache[i]
            try {
                const value = Lampa.Storage.get(key, '{}')
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    saveData[key] = value
                }
            } catch (e) {
                console.error('Local sync: error getting value for', key, e)
            }
        }
    }
    
    invalidateFileViewCache() {
        this.fileViewKeysCache = null
        this.cacheTimestamp = 0
    }
    
    collectFavoriteData(saveData) {
        try {
            const favorite = Lampa.Storage.get('favorite', '{}')
            if (favorite && typeof favorite === 'object') {
                saveData['favorite'] = FavoriteUtils.deduplicate(favorite)
            }
        } catch (e) {
            console.error('Local sync: error getting favorite', e)
        }
    }
    
    sendToServer(data) {
        fetch(LOCAL_SYNC_SERVER + '/set', {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            }
        }).catch(e => {
            console.error('Local sync update error:', e)
        })
    }

    read() {
        fetch(LOCAL_SYNC_SERVER + '/get')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok')
                }
                return response.json()
            })
            .then(response => {
                if (!response || typeof response !== 'object') {
                    return
                }
                this.processServerResponse(response)
            })
            .catch(reason => {
                if (reason && reason.message && reason.message !== 'Network response was not ok') {
                    console.error('Local sync read error:', reason)
                }
            })
    }
    
    processServerResponse(response) {
        this.isUpdating = true
        
        try {
            let timelineChanged = false
            
            for (const key in response) {
                if (this.isFileViewKey(key)) {
                    timelineChanged = this.processFileView(key, response[key]) || timelineChanged
                } else if (key === 'favorite') {
                    this.mergeFavorite(response[key])
                }
            }
            
            this.refreshTimeline(timelineChanged)
            this.refreshFavorite(response.favorite)
        } finally {
            this.isUpdating = false
        }
    }
    
    isFileViewKey(key) {
        return key === 'file_view' || key.startsWith('file_view_')
    }
    
    processFileView(key, timelines) {
        if (!timelines || typeof timelines !== 'object' || Array.isArray(timelines)) {
            return false
        }
        
        let changed = false
        
        for (const hash in timelines) {
            if (timelines.hasOwnProperty(hash)) {
                try {
                    this.updateTimelineEntry(hash, timelines[hash])
                    changed = true
                } catch (e) {
                    console.error('Local sync: error updating timeline for hash', hash, e)
                }
            }
        }
        
        return changed
    }
    
    updateTimelineEntry(hash, serverTime) {
        const hashNum = typeof hash === 'string' ? parseInt(hash, 10) : hash
        if (isNaN(hashNum) || hashNum === 0) return
        
        if (!this.timelineFilename) {
            this.timelineFilename = Lampa.Timeline.filename()
        }
        
        const currentViewed = Lampa.Storage.get(this.timelineFilename, '{}')
        const currentTime = currentViewed[hashNum]
        
        const merged = this.mergeTimelineData(currentTime, serverTime)
        
        Lampa.Timeline.update({
            hash: hashNum,
            percent: merged.percent,
            time: merged.time,
            duration: merged.duration,
            profile: serverTime.profile || 0,
            received: true
        })
    }
    
    mergeTimelineData(current, server) {
        return {
            percent: Math.max(server.percent || 0, current?.percent || 0),
            time: Math.max(server.time || 0, current?.time || 0),
            duration: Math.max(server.duration || 0, current?.duration || 0)
        }
    }
    
    mergeFavorite(serverData) {
        if (!serverData || typeof serverData !== 'object') {
            return false
        }
        
        try {
            const currentData = Lampa.Storage.get('favorite', '{}')
            const { merged, changed } = FavoriteUtils.merge(currentData, serverData)
            
            if (changed || FavoriteUtils.hasDuplicates(merged)) {
                const finalData = FavoriteUtils.deduplicate(merged)
                Lampa.Storage.set('favorite', finalData, true)
                return true
            }
            
            return false
        } catch (e) {
            console.error('Local sync: error merging favorite', e)
            return false
        }
    }
    
    refreshTimeline(changed) {
        if (changed && typeof Lampa !== 'undefined' && Lampa.Timeline && Lampa.Timeline.read) {
            Lampa.Timeline.read()
        }
    }
    
    refreshFavorite(hasFavorite) {
        if (hasFavorite && typeof Lampa !== 'undefined' && Lampa.Favorite && Lampa.Favorite.read) {
            setTimeout(() => {
                Lampa.Favorite.read()
            }, 150)
        }
    }
    
    cleanupFavorite() {
        try {
            const favorite = Lampa.Storage.get('favorite', '{}')
            if (favorite && typeof favorite === 'object') {
                if (FavoriteUtils.hasDuplicates(favorite)) {
                    const deduplicated = FavoriteUtils.deduplicate(favorite)
                    this.isUpdating = true
                    Lampa.Storage.set('favorite', deduplicated, true)
                    this.isUpdating = false
                    
                    if (typeof Lampa !== 'undefined' && Lampa.Favorite && Lampa.Favorite.read) {
                        Lampa.Favorite.read()
                    }
                }
            }
        } catch (e) {
            console.error('Local sync: error cleaning up favorite', e)
        }
    }
}

new LocalTimelineSync().listen()
