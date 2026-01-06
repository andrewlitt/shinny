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

const API_BASE = import.meta.env.DEV
  ? '/ckan/api/3/action/datastore_search'
  : 'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search'
const DROP_IN_RESOURCE = 'c99ec04f-4540-482c-9ee4-efb38774eab4'
const LOCATIONS_RESOURCE = 'f23ac1ad-6f46-4b59-811f-eb34be9b1f7a'
const DEFAULT_LOCATION_ID = 251
const TODAY_WEEK_START = getWeekStart(new Date())

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
  const minText = min && min !== '0' ? min : 'All ages'
  if (!max || max === 'None') return minText
  return `${minText}-${max}`
}

const pickValue = (record, keys) => {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
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
    return {
      title: r['Course Title'],
      section: r.Section,
      date,
      dateLabel: r['First Date'],
      start: timeLabel(startHourValue, startMinuteValue),
      end: timeLabel(endHourValue, endMinuteValue),
      startMinutes,
      age: formatAge(r['Age Min'], r['Age Max']),
      dateRange: r['Date Range']
    }
  })

function App() {
  const [records, setRecords] = useState([])
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [weekStart, setWeekStart] = useState(TODAY_WEEK_START)

  useEffect(() => {
    const controller = new AbortController()
    const url = `${API_BASE}?resource_id=${DROP_IN_RESOURCE}&filters=${encodeURIComponent(
      JSON.stringify({ 'Location ID': OTTER_CREEK_ID })
    )}&limit=5000`

    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!data.success || !data.result) {
          throw new Error('Unexpected response from CKAN')
        }
        const normalized = normalizeRecords(data.result.records).filter((r) => r.date)
        setRecords(normalized)
        setStatus('ready')
      })
      .catch((err) => {
        if (err.name === 'AbortError') return
        setError(err.message || 'Failed to load schedule')
        setStatus('error')
      })

    return () => controller.abort()
  }, [])

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
  }, [records, weekStart, currentWeekDays])

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

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__text">
          <p className="eyebrow">Otter Creek Centre</p>
          <h1>Outdoor Rink Schedule</h1>
          <p className="lede">
            Weekly drop-in skate times pulled from the City of Toronto open data feed.
          </p>
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
        </div>
      </header>

      {status === 'loading' && <p className="status">Loading schedule…</p>}
      {status === 'error' && (
        <p className="status status--error">
          Could not load the schedule. {error}
        </p>
      )}

      {status === 'ready' && weekStart && (
        <>
          <div className="week-nav">
            <button onClick={() => goToWeek(-7)} disabled={!canPrev}>
              ← Prev week
            </button>
            <div className="week-label">{weekLabel}</div>
            <button onClick={() => goToWeek(7)} disabled={!canNext}>
              Next week →
            </button>
          </div>
          <section className="grid calendar-grid">
            {currentWeekDays.map((day) => {
              const key = day.toISOString().slice(0, 10)
              const sessions = sessionsForWeek[key] || []
              return (
                <article key={key} className="day-card">
                  <h2>{formatDayLabel(day)}</h2>
                  {sessions.length ? (
                    <ul className="session-list">
                      {sessions.map((s, idx) => (
                        <li key={`${s.title}-${idx}`} className="session">
                          <div className="session__title">{s.title}</div>
                          <div className="session__time">
                            {s.times.map((t) => t.label).join(' · ')}
                          </div>
                          <div className="session__meta">
                            <span>{s.section}</span>
                            <span>Ages: {s.age}</span>
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
    </div>
  )
}

export default App
