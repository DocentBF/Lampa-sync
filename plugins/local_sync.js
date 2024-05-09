const LOCAL_SYNC_SERVER = 'http://127.0.0.1:8181'

class LocalTimelineSync {
    constructor() {
        this.fields = ['file_view']
    }

    listen() {
        Lampa.Storage.listener.follow('change', (e) => {
            if (e.name.startsWith('file_view_')) {
                Lampa.Storage.add('file_view', e.name)
                this.update()
            }
        })

        setInterval(() => this.read(), 60 * 1000)
        this.read()
    }

    update() {
        let saveData = {}
        this.fields.map((fieldName) => {
            saveData[fieldName] = Lampa.Storage.get(fieldName)
            if (fieldName === 'file_view') {
                saveData[fieldName].map((fileNum) => {
                    let fileTimeline = window.localStorage.getItem(fileNum) // avoid from lags
                    if (fileTimeline.length) {
                        try {
                            saveData[fileNum] = JSON.parse(fileTimeline)
                        } catch (e) {
                        }
                    }
                })
            }
        })

        fetch(LOCAL_SYNC_SERVER + '/set', {
            method: 'POST',
            body: JSON.stringify(saveData),
            headers: {
                'Content-Type': 'application/json;charset=utf-8'
            }
        }).catch(e => console.error(e))
    }

    read() {
        fetch(LOCAL_SYNC_SERVER + '/get')
            .then(response => response.json())
            .then(response => {
                for (let key in response) {
                    this.add(key, response[key])
                }
            })
            .catch(reason => {
                Lampa.Noty.show('Ошибка локальной синхронизации')
                console.error(reason)
            })
    }

    add(name, new_value) {
        let stored = Lampa.Storage.get(name, '[]')
        let newData = null
        if (typeof new_value === 'object' || Array.isArray(new_value)) {
            newData = deepMerge(stored, new_value)
            if (Array.isArray(newData))
                newData = newData.filter((x, i, a) => a.indexOf(x) == i)
        } else {
            newData = stored
        }

        Lampa.Storage.set(name, newData, true)
        Lampa.Storage.listener.send('add', {name: name, value: new_value})
    }
}

new LocalTimelineSync().listen()

function deepMerge(...objs) {
    /**
     * Get the object type
     * @param  {*}       obj The object
     * @return {String}      The object type
     */
    function getType(obj) {
        return Object.prototype.toString.call(obj).slice(8, -1).toLowerCase();
    }

    /**
     * Deep merge two objects
     * @return {Object}
     */
    function mergeObj(clone, obj) {
        for (let [key, value] of Object.entries(obj)) {
            let type = getType(value);
            if (clone[key] !== undefined && getType(clone[key]) === type && ['array', 'object'].includes(type)) {
                clone[key] = deepMerge(clone[key], value);
            } else {
                clone[key] = structuredClone(value);
            }
        }
    }

    let clone = structuredClone(objs.shift());

    for (let obj of objs) {
        let type = getType(obj);

        if (getType(clone) !== type) {
            clone = structuredClone(obj);
            continue;
        }

        if (type === 'array') {
            clone = [...clone, ...structuredClone(obj)];
        } else if (type === 'object') {
            mergeObj(clone, obj);
        } else {
            clone = obj;
        }
    }

    return clone;
}