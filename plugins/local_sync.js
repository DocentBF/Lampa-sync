const LOCAL_SYNC_SERVER = 'http://127.0.0.1:8181'

const ArrayUtils = {
    deduplicateIDs(arr) {
        return [...new Set(arr.filter(id => id != null))]
    },
    
    deduplicateCards(cards) {
        const cardMap = new Map()
        for (let i = cards.length - 1; i >= 0; i--) {
            const card = cards[i]
            if (card && card.id && !cardMap.has(card.id)) {
                cardMap.set(card.id, card)
            }
        }
        const result = []
        const added = new Set()
        for (const card of cards) {
            if (card && card.id && cardMap.has(card.id) && !added.has(card.id)) {
                result.push(cardMap.get(card.id))
                added.add(card.id)
            }
        }
        return result
    },
    
    mergeIDArrays(existing, newArr) {
        const seen = new Set([...ArrayUtils.deduplicateIDs(existing)])
        const result = [...seen]
        
        for (const id of ArrayUtils.deduplicateIDs(newArr)) {
            if (!seen.has(id)) {
                seen.add(id)
                result.push(id)
            }
        }
        return result
    },
    
    mergeCards(existing, serverCards) {
        const cardMap = new Map()
        
        for (let i = existing.length - 1; i >= 0; i--) {
            const card = existing[i]
            if (card && card.id && !cardMap.has(card.id)) {
                cardMap.set(card.id, card)
            }
        }
        
        for (const card of serverCards || []) {
            if (card && card.id) {
                cardMap.set(card.id, card)
            }
        }
        
        const result = []
        const added = new Set()
        
        for (const card of serverCards || []) {
            if (card && card.id && !added.has(card.id)) {
                result.push(cardMap.get(card.id))
                added.add(card.id)
            }
        }
        
        for (const card of existing) {
            if (card && card.id && !added.has(card.id)) {
                result.push(cardMap.get(card.id))
                added.add(card.id)
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
        for (const key in data) {
            const value = data[key]
            if (Array.isArray(value)) {
                if (key === 'card') {
                    const ids = value.map(c => c && c.id).filter(Boolean)
                    if (new Set(ids).size !== ids.length) return true
                } else {
                    if (new Set(value).size !== value.length) return true
                }
            }
        }
        return false
    },
    
    merge(existing, serverData) {
        const merged = { ...existing }
        const serverDedup = FavoriteUtils.deduplicate(serverData)
        let changed = false
        
        for (const key in serverDedup) {
            const serverValue = serverDedup[key]
            const currentValue = merged[key]
            
            if (key === 'card') {
                const mergedCards = ArrayUtils.mergeCards(currentValue || [], serverValue || [])
                if (JSON.stringify(mergedCards) !== JSON.stringify(currentValue || [])) {
                    merged[key] = mergedCards
                    changed = true
                }
            } else if (Array.isArray(serverValue)) {
                const mergedIDs = ArrayUtils.mergeIDArrays(currentValue || [], serverValue)
                if (JSON.stringify(mergedIDs) !== JSON.stringify(currentValue || [])) {
                    merged[key] = mergedIDs
                    changed = true
                }
            } else if (JSON.stringify(serverValue) !== JSON.stringify(currentValue)) {
                merged[key] = serverValue
                changed = true
            }
        }
        
        return { merged, changed }
    }
}

class LocalTimelineSync {
    constructor() {
        this.updateTimer = null
        this.isUpdating = false
    }

    listen() {
        const waitForLampa = () => {
            if (this.isLampaReady()) {
                this.setupStorageListener()
                this.startPeriodicSync()
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
    
    startPeriodicSync() {
        setInterval(() => this.read(), 60 * 1000)
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
        for (let i = 0; i < window.localStorage.length; i++) {
            const key = window.localStorage.key(i)
            if (key === 'file_view' || (key && key.startsWith('file_view_'))) {
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
        
        const filename = Lampa.Timeline.filename()
        const currentViewed = Lampa.Storage.get(filename, '{}')
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
                const deduplicated = FavoriteUtils.deduplicate(favorite)
                
                if (FavoriteUtils.hasDuplicates(favorite) || 
                    JSON.stringify(favorite) !== JSON.stringify(deduplicated)) {
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
