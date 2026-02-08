# Toronto Shinny

Find drop-in shinny hockey and public skating schedules at 70+ Toronto arenas and outdoor rinks.

**Live site:** [torontoshinny.ca](https://torontoshinny.ca/)

## About

Toronto Shinny displays weekly drop-in skating and shinny hockey schedules pulled from the [City of Toronto Open Data](https://open.toronto.ca/) portal. Schedules update automatically so you always have current times for your rink.

### Features

- Browse schedules at 70+ Toronto skating locations
- Filter by program (shinny or skating) and age group (adult or child)
- Navigate week by week (current week + 3 weeks ahead)
- Save favourite rinks for quick access
- Mobile-friendly responsive design

## Tech Stack

- **React 19** with Vite
- **City of Toronto CKAN API** for schedule data
- **Netlify** for hosting and API proxying

## Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. The Vite dev server proxies CKAN API requests to avoid CORS issues.

## Build

```bash
npm run build
npm run preview   # preview the production build locally
```

## Deployment

Deployed to Netlify with automatic builds on push. See [NETLIFY_DEPLOYMENT.md](NETLIFY_DEPLOYMENT.md) for setup details.

Netlify handles:
- Static hosting via global CDN
- API proxy to the Toronto CKAN endpoint (configured in `netlify.toml`)
- SPA fallback routing

## Data Source

Schedule data comes from the City of Toronto [Registered Programs and Drop-In Courses](https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/registered-programs-and-drop-in-courses-offering) dataset, filtered to "Skate - Drop-In" sessions.
