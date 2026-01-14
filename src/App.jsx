import { useEffect, useMemo, useState } from 'react'
import './App.css'

const parseDate = (value) => {
  if (!value) return null
  const [y, m, d] = value.split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(Date.UTC(y, m - 1, d))
}

const addDays = (date, days) => {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d
}

const getWeekStart = (date) => {
  const day = date.getUTCDay() || 7 // Sunday=0, make it 7
  const monday = new Date(date)
  monday.setUTCDate(date.getUTCDate() - (day - 1))
  return monday
}

const startOfDayUTC = (date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))

const CKAN_API_BASE =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search'
const PROD_PROXY_PREFIX =
  import.meta.env.VITE_CKAN_PROXY || 'https://r.jina.ai/http://'
const API_BASE = import.meta.env.DEV
  ? '/ckan/api/3/action/datastore_search'
  : `${PROD_PROXY_PREFIX}${CKAN_API_BASE}`
const DROP_IN_RESOURCE = 'c99ec04f-4540-482c-9ee4-efb38774eab4'
const LOCATIONS_RESOURCE = 'f23ac1ad-6f46-4b59-811f-eb34be9b1f7a'
const DEFAULT_LOCATION_ID = 251
const TODAY_WEEK_START = getWeekStart(new Date())
const TODAY_DATE = startOfDayUTC(new Date())
const FAVORITES_STORAGE_KEY = 'shinny:favorites'
const FILTERS_STORAGE_KEY = 'shinny:filters'

const formatDayLabel = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  }).format(date)

const timeLabel = (hour, minute) => {
  if (hour === undefined || minute === undefined || hour === null || minute === null) {
    return 'N/A'
  }
  const h = Number(hour)
  const m = Number(minute)
  if (Number.isNaN(h) || Number.isNaN(m)) return 'N/A'
  const period = h >= 12 ? 'pm' : 'am'
  const displayHour = ((h + 11) % 12) + 1
  const displayMinute = m.toString().padStart(2, '0')
  return `${displayHour}:${displayMinute}${period}`
}

const formatAge = (min, max) => {
  if (min === undefined || min === null || min === '') return 'Age N/A'
  const minValue = Number(min)
  if ((!max || max === 'None') && minValue === 0) return 'All ages'
  if (!max || max === 'None') return `Age ${min} + years`
  return `Age ${min} - ${max} years`
}

const pickValue = (record, keys) => {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

const getProgramTitle = (record) =>
  pickValue(record, [
    'Course Title',
    'Program Title',
    'Program Name',
    'CourseTitle',
    'Program'
  ])

const fetchAll = async (resourceId, filters = {}, signal) => {
  const limit = 5000
  let offset = 0
  let all = []
  let keepGoing = true

  while (keepGoing) {
    const params = new URLSearchParams({
      resource_id: resourceId,
      limit: String(limit),
      offset: String(offset)
    })
    if (filters && Object.keys(filters).length) {
      params.set('filters', JSON.stringify(filters))
    }
    const url = `${API_BASE}?${params.toString()}`
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (!data.success || !data.result) {
      throw new Error('Unexpected response from CKAN')
    }
    const records = data.result.records || []
    all = all.concat(records)
    if (records.length < limit) {
      keepGoing = false
    } else {
      offset += limit
    }
  }

  return all
}

const formatAddress = (loc) => {
  if (!loc) return ''
  const parts = [
    loc['Street No'],
    loc['Street Name'],
    loc['Street Type'],
    loc['Street Direction']
  ].filter((v) => v && v !== 'None')
  return parts.join(' ')
}

const normalizeRecords = (records = []) =>
  records.map((r) => {
    const date = parseDate(r['First Date'])
    const startHourValue = pickValue(r, ['Start Hour', 'StartHour'])
    const startMinuteValue = pickValue(r, ['Start Minute', 'Start Min', 'StartMinute'])
    const endHourValue = pickValue(r, ['End Hour', 'EndHour'])
    const endMinuteValue = pickValue(r, ['End Min', 'End Minute', 'EndMinute'])
    const startMinutes =
      Number(startHourValue || 0) * 60 + Number(startMinuteValue || 0)
    const title = getProgramTitle(r)
    return {
      title,
      section: r.Section,
      date,
      dateLabel: r['First Date'],
      start: timeLabel(startHourValue, startMinuteValue),
      end: timeLabel(endHourValue, endMinuteValue),
      startMinutes,
      ageMin: r['Age Min'],
      ageMax: r['Age Max'],
      age: formatAge(r['Age Min'], r['Age Max']),
      dateRange: r['Date Range']
    }
  })

function App() {
  const [records, setRecords] = useState([])
  const [listStatus, setListStatus] = useState('loading')
  const [scheduleStatus, setScheduleStatus] = useState('idle')
  const [listError, setListError] = useState(null)
  const [scheduleError, setScheduleError] = useState(null)
  const [weekStart, setWeekStart] = useState(TODAY_WEEK_START)
  const [locationOptions, setLocationOptions] = useState([])
  const [locationById, setLocationById] = useState({})
  const [selectedLocationId, setSelectedLocationId] =
    useState(DEFAULT_LOCATION_ID)
  const [dropInRecords, setDropInRecords] = useState([])
  const [favorites, setFavorites] = useState([])
  const [programFilter, setProgramFilter] = useState('all')
  const [ageFilter, setAgeFilter] = useState('all')
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) setFavorites(parsed)
      } catch {
        // ignore invalid storage
      }
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(max-width: 640px)')
    const update = () => setIsMobile(media.matches)
    update()
    if (media.addEventListener) {
      media.addEventListener('change', update)
    } else {
      media.addListener(update)
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', update)
      } else {
        media.removeListener(update)
      }
    }
  }, [])

  useEffect(() => {
    const stored = window.localStorage.getItem(FILTERS_STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed?.programFilter) setProgramFilter(parsed.programFilter)
        if (parsed?.ageFilter) setAgeFilter(parsed.ageFilter)
      } catch {
        // ignore invalid storage
      }
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem(
      FAVORITES_STORAGE_KEY,
      JSON.stringify(favorites)
    )
  }, [favorites])

  useEffect(() => {
    window.localStorage.setItem(
      FILTERS_STORAGE_KEY,
      JSON.stringify({ programFilter, ageFilter })
    )
  }, [programFilter, ageFilter])

  useEffect(() => {
    const controller = new AbortController()
    setListStatus('loading')
    setListError(null)

    const loadFacilities = async () => {
      const [locations, dropins] = await Promise.all([
        fetchAll(LOCATIONS_RESOURCE, {}, controller.signal),
        fetchAll(
          DROP_IN_RESOURCE,
          { Section: 'Skate - Drop-In' },
          controller.signal
        )
      ])

      const skatingLocationIds = new Set(
        dropins.map((rec) => rec['Location ID']).filter(Boolean)
      )
      setDropInRecords(dropins)

      const locationMap = {}
      const options = locations
        .filter((loc) => skatingLocationIds.has(loc['Location ID']))
        .map((loc) => {
          const id = loc['Location ID']
          locationMap[id] = loc
          return {
            id,
            name: loc['Location Name'] || `Location ${id}`,
            type: loc['Location Type']
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name))

      setLocationById(locationMap)
      setLocationOptions(options)
      setSelectedLocationId((prev) => {
        if (options.find((opt) => opt.id === prev)) return prev
        return options[0]?.id || null
      })
      setListStatus('ready')
    }

    loadFacilities().catch((err) => {
      if (err.name === 'AbortError') return
      setListError(err.message || 'Failed to load locations')
      setListStatus('error')
    })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!selectedLocationId) return
    const controller = new AbortController()
    setScheduleStatus('loading')
    setScheduleError(null)

    const loadSchedule = async () => {
      const records = await fetchAll(
        DROP_IN_RESOURCE,
        { 'Location ID': selectedLocationId, Section: 'Skate - Drop-In' },
        controller.signal
      )
      const normalized = normalizeRecords(records).filter((r) => r.date)
      setRecords(normalized)
      setScheduleStatus('ready')
    }

    loadSchedule().catch((err) => {
      if (err.name === 'AbortError') return
      setScheduleError(err.message || 'Failed to load schedule')
      setScheduleStatus('error')
    })

    return () => controller.abort()
  }, [selectedLocationId])

  const getSessionCategory = (title = '') => {
    const lower = title.toLowerCase()
    if (lower.includes('shinny')) return 'shinny'
    if (lower.includes('skate')) return 'skating'
    return 'skating'
  }

  const getAgeGroupFromMin = (min, max) => {
    const minValue = Number(min)
    const isAllAges =
      !Number.isNaN(minValue) && minValue === 0 && (max === 'None' || !max)
    if (!Number.isNaN(minValue) && minValue === 19) return 'adult'
    if (isAllAges) return 'all'
    return 'child'
  }

  const weekBounds = useMemo(() => {
    const min = TODAY_WEEK_START
    const max = addDays(TODAY_WEEK_START, 21) // current week + next 3
    return { min, max }
  }, [])

  const currentWeekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [weekStart])

  const sessionsForWeek = useMemo(() => {
    const map = {}
    currentWeekDays.forEach((d) => {
      const key = d.toISOString().slice(0, 10)
      map[key] = []
    })
    records.forEach((rec) => {
      if (programFilter !== 'all' && getSessionCategory(rec.title) !== programFilter) {
        return
      }
      if (ageFilter !== 'all') {
        const group = getAgeGroupFromMin(rec.ageMin, rec.ageMax)
        if (group !== ageFilter && group !== 'all') {
          return
        }
      }
      const key = rec.date?.toISOString().slice(0, 10)
      if (map[key]) {
        map[key].push(rec)
      }
    })
    const grouped = {}
    Object.keys(map).forEach((k) => {
      const groupMap = new Map()
      map[k].forEach((rec) => {
        const groupKey = `${rec.title}||${rec.section}||${rec.age}`
        if (!groupMap.has(groupKey)) {
          groupMap.set(groupKey, {
            title: rec.title,
            section: rec.section,
            age: rec.age,
            times: []
          })
        }
        groupMap.get(groupKey).times.push({
          label: `${rec.start} – ${rec.end}`,
          sort: rec.startMinutes
        })
      })
      const groups = Array.from(groupMap.values())
      groups.forEach((g) => {
        g.times.sort((a, b) => a.sort - b.sort)
      })
      grouped[k] = groups
    })
    return grouped
  }, [records, weekStart, currentWeekDays, programFilter, ageFilter])

  const canPrev = weekStart && weekBounds.min && weekStart > weekBounds.min
  const canNext = weekStart && weekBounds.max && weekStart < weekBounds.max

  const weekLabel = useMemo(() => {
    const end = addDays(weekStart, 6)
    const fmt = new Intl.DateTimeFormat('en-CA', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
    return `${fmt.format(weekStart)} – ${fmt.format(end)}`
  }, [weekStart])

  const goToWeek = (delta) => {
    setWeekStart((prev) => {
      const next = addDays(prev, delta)
      if (next < weekBounds.min) return weekBounds.min
      if (next > weekBounds.max) return weekBounds.max
      return next
    })
  }

  const selectedLocation = locationById[selectedLocationId]
  const favoriteOptions = favorites
    .map((id) => locationOptions.find((opt) => opt.id === id))
    .filter(Boolean)

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__text">
          
          <h1>{selectedLocation?.['Location Name'] || 'Skate - Drop-In'}</h1>
          {selectedLocation && (
            <p className="location-meta">
              {formatAddress(selectedLocation)}
              {selectedLocation.District ? ` · ${selectedLocation.District}` : ''}
            </p>
          )}
          <p className="lede">
            Weekly skate times pulled from the City of Toronto open data feed.
          </p>
        </div>
      </header>

      <div className="filters">
        <div className="filters__controls">
          <div className="filters__section">
            <label className="filters__label" htmlFor="location-select">
              Choose a location
            </label>
            <select
              id="location-select"
              value={selectedLocationId || ''}
              onChange={(e) => setSelectedLocationId(Number(e.target.value))}
              disabled={listStatus !== 'ready'}
            >
              {locationOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.name}
                </option>
              ))}
            </select>
            {selectedLocationId && (
              <button
                type="button"
                className="favorite-toggle"
                onClick={() =>
                  setFavorites((prev) =>
                    prev.includes(selectedLocationId)
                      ? prev.filter((id) => id !== selectedLocationId)
                      : [...prev, selectedLocationId]
                  )
                }
              >
                {favorites.includes(selectedLocationId) ? '★ Favorited' : '☆ Favorite'}
              </button>
            )}
          </div>
          <div className="filters__section filters__section--center">
            <div className="filters__group filters__group--inline">
              <label className="filters__label" htmlFor="program-filter">
                Program
              </label>
              <div className="toggle" role="group" aria-label="Program filter">
                {['all', 'skating', 'shinny'].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`toggle__option${
                      programFilter === value ? ' toggle__option--active' : ''
                    }`}
                    onClick={() => setProgramFilter(value)}
                    disabled={listStatus !== 'ready'}
                  >
                    {value === 'all'
                      ? 'All'
                      : value === 'skating'
                        ? 'Skating'
                        : 'Shinny'}
                  </button>
                ))}
              </div>
            </div>
            <div className="filters__group filters__group--inline">
              <label className="filters__label" htmlFor="age-filter">
                Age
              </label>
              <div className="toggle" role="group" aria-label="Age filter">
                {['all', 'adult', 'child'].map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`toggle__option${
                      ageFilter === value ? ' toggle__option--active' : ''
                    }`}
                    onClick={() => setAgeFilter(value)}
                    disabled={listStatus !== 'ready'}
                  >
                    {value === 'all' ? 'All' : value === 'adult' ? 'Adult' : 'Child'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="filters__section filters__section--center">
            <div className="filters__group">
              {/* <label className="filters__label">Week</label> */}
              <div className="week-nav week-nav--inline week-selection">
                <button onClick={() => goToWeek(-7)} disabled={!canPrev}>
                  ← Prev week
                </button>
                <div className="week-label">{weekLabel}</div>
                <button onClick={() => goToWeek(7)} disabled={!canNext}>
                  Next week →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {favoriteOptions.length > 0 && (
        <div className="favorites">
          <span>Favorites:</span>
          <div className="favorites__chips">
            {favoriteOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={
                  opt.id === selectedLocationId ? 'chip chip--active' : 'chip'
                }
                onClick={() => setSelectedLocationId(opt.id)}
              >
                {opt.name}
                <span
                  className="chip__remove"
                  onClick={(event) => {
                    event.stopPropagation()
                    setFavorites((prev) => prev.filter((id) => id !== opt.id))
                  }}
                  role="button"
                  aria-label={`Remove ${opt.name} from favorites`}
                >
                  ×
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {listStatus === 'loading' && (
        <p className="status">Loading skating locations…</p>
      )}
      {listStatus === 'error' && (
        <p className="status status--error">
          Could not load locations. {listError}
        </p>
      )}

      {scheduleStatus === 'loading' && (
        <p className="status">Loading schedule…</p>
      )}
      {scheduleStatus === 'error' && (
        <p className="status status--error">
          Could not load the schedule. {scheduleError}
        </p>
      )}

      {scheduleStatus === 'ready' && weekStart && (
        <>
          <section className="grid calendar-grid">
            {currentWeekDays
              .filter((day) => {
                if (!isMobile) return true
                return startOfDayUTC(day) >= TODAY_DATE
              })
              .map((day) => {
              const key = day.toISOString().slice(0, 10)
              const sessions = sessionsForWeek[key] || []
              const dayStart = startOfDayUTC(day)
              const isToday = dayStart.getTime() === TODAY_DATE.getTime()
              const isPast = dayStart < TODAY_DATE
              return (
                <article
                  key={key}
                  className={`day-card${isToday ? ' day-card--today' : ''}${
                    isPast ? ' day-card--past' : ''
                  }`}
                >
                  <h2>
                    {formatDayLabel(day)}
                    {isToday && <span className="day-card__today"> - Today</span>}
                  </h2>
                  {sessions.length ? (
                    <ul className="session-list">
                      {sessions.map((s, idx) => (
                        <li key={`${s.title}-${idx}`} className="session">
                          <div className="session__title">{s.title}</div>
                          <div className="session__time">
                            {s.times.map((t, index) => (
                              <span key={`${t.label}-${index}`}>
                                {t.label}
                                {index < s.times.length - 1 && <br />}
                              </span>
                            ))}
                          </div>
                          <div className="session__meta">
                            <span>{s.age}</span>
                          </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">No sessions listed.</p>
                  )}
                </article>
              )
              })}
          </section>
        </>
      )}

      <footer className="page-footer">
        <p className="api-note">
          Source:{' '}
          <a
            href="https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/registered-programs-and-drop-in-courses-offering"
            target="_blank"
            rel="noreferrer"
          >
            CKAN (Drop-in resource)
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App
