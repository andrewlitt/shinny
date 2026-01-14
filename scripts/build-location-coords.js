import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const API_BASE =
  'https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action/datastore_search'
const DROP_IN_RESOURCE = 'c99ec04f-4540-482c-9ee4-efb38774eab4'
const LOCATIONS_RESOURCE = 'f23ac1ad-6f46-4b59-811f-eb34be9b1f7a'
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org/search'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const OUTPUT_PATH = path.resolve(__dirname, '../src/data/location-coords.json')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const RATE_LIMIT_MS = 1250
const RETRY_DELAYS_MS = [2000, 4000, 8000]

const pickValue = (record, keys) => {
  for (const key of keys) {
    const value = record[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

const parseLatLonPair = (a, b) => {
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  const absA = Math.abs(a)
  const absB = Math.abs(b)
  if (absA <= 90 && absB <= 180) return { lat: a, lon: b }
  if (absA <= 180 && absB <= 90) return { lat: b, lon: a }
  return null
}

const parseCoordsFromValue = (value) => {
  if (!value) return null
  if (Array.isArray(value) && value.length >= 2) {
    const a = Number(value[0])
    const b = Number(value[1])
    return parseLatLonPair(a, b)
  }
  if (typeof value === 'string') {
    const matches = value.match(/-?\d+(\.\d+)?/g)
    if (matches && matches.length >= 2) {
      const a = Number(matches[0])
      const b = Number(matches[1])
      return parseLatLonPair(a, b)
    }
  }
  return null
}

const getLocationCoords = (loc) => {
  if (!loc) return null
  const latValue = pickValue(loc, [
    'Latitude',
    'Lat',
    'latitude',
    'LATITUDE',
    'Location Latitude',
    'Latitude (deg)',
    'Y'
  ])
  const lonValue = pickValue(loc, [
    'Longitude',
    'Long',
    'Lng',
    'lon',
    'longitude',
    'LONGITUDE',
    'Location Longitude',
    'Longitude (deg)',
    'X'
  ])
  const lat = Number(latValue)
  const lon = Number(lonValue)
  const numericCoords = parseLatLonPair(lat, lon)
  if (numericCoords) return numericCoords
  const geoValue = pickValue(loc, [
    'geo_point_2d',
    'Geo Point',
    'Geolocation',
    'Coordinates',
    'Coordinate',
    'Latitude / Longitude',
    'Latitude/Longitude',
    'Lat/Long',
    'LatLong',
    'Location',
    'location',
    'Geometry',
    'geometry',
    'Geom',
    'geom',
    'the_geom',
    'POINT'
  ])
  return parseCoordsFromValue(geoValue)
}

const formatAddress = (loc) => {
  if (!loc) return ''
  const number = [loc['Street No'], loc['Street No Suffix']]
    .filter((v) => v && v !== 'None')
    .join(' ')
  const parts = [
    number,
    loc['Street Name'],
    loc['Street Type'],
    loc['Street Direction']
  ].filter((v) => v && v !== 'None')
  return parts.join(' ')
}

const buildLocationQuery = (location) => {
  if (!location) return ''
  const postal = location['Postal Code']
  const address = formatAddress(location)
  const parts = [
    address,
    location['Location Name'],
    location.District,
    postal && postal !== 'None' ? postal : '',
    'Toronto',
    'Ontario',
    'Canada'
  ]
  return parts.filter(Boolean).join(', ')
}

const buildFallbackQuery = (location) => {
  if (!location) return ''
  const name = location['Location Name']
  const parts = [name, 'Toronto', 'Ontario', 'Canada']
  return parts.filter(Boolean).join(', ')
}

const fetchAll = async (resourceId, filters = {}) => {
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
    const res = await fetch(url)
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

const loadExisting = async () => {
  try {
    const raw = await fs.readFile(OUTPUT_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed
  } catch {
    // ignore missing or invalid file
  }
  return {}
}

const writeOutput = async (data) => {
  const sorted = Object.keys(data)
    .sort((a, b) => Number(a) - Number(b))
    .reduce((acc, key) => {
      acc[key] = data[key]
      return acc
    }, {})
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(sorted, null, 2)}\n`)
}

const geocode = async (query) => {
  const params = new URLSearchParams({
    format: 'json',
    q: query,
    limit: '1',
    addressdetails: '0',
    countrycodes: 'ca'
  })
  const res = await fetch(`${NOMINATIM_BASE}?${params.toString()}`, {
    headers: {
      'Accept-Language': 'en',
      'User-Agent': 'shinny-coords-builder (local script)'
    }
  })
  if (!res.ok) {
    throw new Error(`Nominatim lookup failed (${res.status})`)
  }
  const data = await res.json()
  if (!data.length) return null
  const hit = data[0]
  const lat = Number(hit.lat)
  const lon = Number(hit.lon)
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null
  return { lat, lon }
}

const geocodeWithRetry = async (query) => {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await geocode(query)
    } catch (err) {
      const message = err?.message || ''
      if (!message.includes('429') && !message.includes('503')) {
        throw err
      }
      if (attempt >= RETRY_DELAYS_MS.length) {
        throw err
      }
      await sleep(RETRY_DELAYS_MS[attempt])
    }
  }
  return null
}

const run = async () => {
  console.log('Loading existing coordinates...')
  const output = await loadExisting()

  console.log('Fetching drop-in sessions...')
  const dropins = await fetchAll(DROP_IN_RESOURCE, {
    Section: 'Skate - Drop-In'
  })
  const locationIds = new Set(
    dropins.map((rec) => rec['Location ID']).filter(Boolean)
  )

  console.log('Fetching location records...')
  const locations = await fetchAll(LOCATIONS_RESOURCE)
  const skatingLocations = locations.filter((loc) =>
    locationIds.has(loc['Location ID'])
  )

  console.log(`Found ${skatingLocations.length} locations.`)

  let processed = 0
  let directCount = 0
  let geocodedCount = 0
  let failedCount = 0
  for (const location of skatingLocations) {
    const id = location['Location ID']
    if (!id) continue
    if (output[id]) {
      processed += 1
      continue
    }

    const directCoords = getLocationCoords(location)
    if (directCoords) {
      output[id] = directCoords
      directCount += 1
      processed += 1
      continue
    }

    const query = buildLocationQuery(location)
    if (!query) {
      processed += 1
      continue
    }

    try {
      let coords = await geocodeWithRetry(query)
      if (!coords) {
        const fallbackQuery = buildFallbackQuery(location)
        if (fallbackQuery && fallbackQuery !== query) {
          coords = await geocodeWithRetry(fallbackQuery)
        }
      }
      if (coords) {
        output[id] = coords
        geocodedCount += 1
      } else {
        failedCount += 1
      }
    } catch (err) {
      console.warn(`Geocode failed for ${id}: ${err.message}`)
      failedCount += 1
    }

    processed += 1
    if (processed % 5 === 0) {
      console.log(`Processed ${processed}/${skatingLocations.length}`)
      await writeOutput(output)
    }

    await sleep(RATE_LIMIT_MS)
  }

  await writeOutput(output)
  console.log('Done. Output saved to', OUTPUT_PATH)
  console.log(
    `Direct coords: ${directCount}, geocoded: ${geocodedCount}, failed: ${failedCount}`
  )
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
