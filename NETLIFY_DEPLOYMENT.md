# Netlify Deployment Guide

This app is now configured to deploy to **Netlify**, which provides:
- ✅ **Built-in CORS proxy** (no external services needed!)
- ✅ **Free hosting** with generous limits
- ✅ **Automatic deployments** from GitHub
- ✅ **No file size limits** on proxied requests
- ✅ **Fast global CDN**

## How It Works

Netlify's redirect rules (configured in `netlify.toml` and `public/_redirects`) proxy API requests:

```
Your App → /api/ckan/* → Netlify Proxy → Toronto CKAN API
```

This solves the CORS issue because the browser sees requests going to your own domain.

## Option 1: Deploy via Netlify UI (Easiest - Recommended)

### Step 1: Connect Your GitHub Repository

1. Go to [app.netlify.com](https://app.netlify.com)
2. Click **"Add new site"** → **"Import an existing project"**
3. Choose **GitHub** and authorize Netlify
4. Select your `shinny` repository

### Step 2: Configure Build Settings

Netlify should auto-detect the settings from `netlify.toml`, but verify:
- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Base directory**: (leave empty)

### Step 3: Deploy

Click **"Deploy site"**

That's it! Netlify will:
- Build your app
- Deploy it with a URL like `https://your-site-name.netlify.app`
- Set up the CORS proxy automatically
- Auto-deploy on every push to your main branch

### Step 4: (Optional) Custom Domain

1. In Netlify dashboard → **Domain settings**
2. Click **"Add custom domain"**
3. Follow instructions to configure DNS

## Option 2: Deploy via Netlify CLI

### Install Netlify CLI

```bash
npm install -g netlify-cli
```

### Login to Netlify

```bash
netlify login
```

### Deploy

```bash
cd /c/Users/AndrewLitt/Documents/github/shinny

# Deploy to production
netlify deploy --prod
```

The first time you deploy, Netlify CLI will ask:
- **Create a new site?** → Yes
- **Team**: Select your team
- **Site name**: Choose a name (or let Netlify generate one)

## Testing Locally

Before deploying, test that everything works:

```bash
# Start dev server (uses Vite proxy)
npm run dev

# Open http://localhost:5173
```

## How the Proxy Works

### Development (localhost)
- Requests go to `/ckan/*`
- Vite dev server proxies to CKAN API (configured in `vite.config.js`)

### Production (Netlify)
- Requests go to `/api/ckan/*`
- Netlify proxies to CKAN API (configured in `netlify.toml`)

## Troubleshooting

### Build Fails
Check the Netlify build log for errors. Common issues:
- Missing dependencies: Run `npm install` locally to verify
- Build errors: Run `npm run build` locally to test

### API Requests Fail in Production
1. Check Netlify Function logs in the dashboard
2. Verify the redirect rules in `netlify.toml` are correct
3. Test the API directly: `https://your-site.netlify.app/api/ckan/api/3/action/datastore_search?resource_id=c99ec04f-4540-482c-9ee4-efb38774eab4&limit=1`

### CORS Errors Persist
- Make sure you've deployed the latest code with `netlify.toml` and `public/_redirects`
- Clear your browser cache
- Check browser console for the actual error

## Migrating from GitHub Pages

If you were previously using GitHub Pages:

1. The old `npm run deploy` script (gh-pages) won't be needed
2. You can remove the `gh-pages` package if you want: `npm uninstall gh-pages`
3. Update your repository settings to remove GitHub Pages deployment (or keep as a backup)
4. Update any links/bookmarks to your new Netlify URL

## Netlify Free Tier Limits

- **Bandwidth**: 100 GB/month
- **Build minutes**: 300 minutes/month
- **Concurrent builds**: 1

This is more than enough for most personal projects!

## Next Steps

After deploying:

1. ✅ Test your app at the Netlify URL
2. ✅ Verify API requests work (check Network tab in browser dev tools)
3. ✅ Set up continuous deployment (automatic on GitHub integration)
4. ✅ (Optional) Add a custom domain
5. ✅ (Optional) Set up deploy previews for pull requests

## Support

- **Netlify Docs**: https://docs.netlify.com
- **Community**: https://answers.netlify.com
